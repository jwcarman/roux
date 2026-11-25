package oidc

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/pgdb"
)

type pendingRow struct {
	provider, issuer, subject, displayName string
	claims                                 map[string]any
	verifiedEmail                          string
	identityID                             *uuid.UUID
}

// savePending keeps the account behind a cookie until the person confirms it. Nothing is
// created or linked yet. A new one replaces any this browser had.
func (m *Method) savePending(w http.ResponseWriter, r *http.Request, rt *runtime, a account, identityID *uuid.UUID) error {
	ctx := r.Context()
	token, err := randomToken()
	if err != nil {
		return err
	}
	claims, err := json.Marshal(a.Claims)
	if err != nil {
		return err
	}
	var email *string
	if a.VerifiedEmail != "" {
		email = &a.VerifiedEmail
	}
	now := m.now()
	tx, err := m.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer pgdb.Rollback(ctx, tx)
	if old, err := r.Cookie(pendingCookie); err == nil && old.Value != "" {
		if _, err := tx.Exec(ctx, `delete from roux_oidc_pending where token_hash = $1`, hashOf(old.Value)); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `delete from roux_oidc_pending where expires_at < $1`, now); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		insert into roux_oidc_pending (token_hash, provider, issuer, subject, display_name, claims, verified_email, identity_id, expires_at)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		hashOf(token), rt.p.ID, a.Issuer, a.Subject, truncate(a.DisplayName, 320), claims, email, identityID, now.Add(m.cfg.SignUpWindow)); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	http.SetCookie(w, m.cookie(r, pendingCookie, token, int(m.cfg.SignUpWindow.Seconds())))
	return nil
}

func truncate(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

const pendingColumns = `provider, issuer, subject, display_name, claims, coalesce(verified_email, ''), identity_id`

func scanPending(row pgx.Row) (pendingRow, error) {
	var p pendingRow
	var claims []byte
	if err := row.Scan(&p.provider, &p.issuer, &p.subject, &p.displayName, &claims, &p.verifiedEmail, &p.identityID); err != nil {
		return p, err
	}
	return p, json.Unmarshal(claims, &p.claims)
}

// pendingOf finds the account this browser is holding, without spending it. A pending link
// is only shown to the identity that asked for it.
func (m *Method) pendingOf(r *http.Request, signedIn *uuid.UUID) (pendingRow, bool, error) {
	c, err := r.Cookie(pendingCookie)
	if err != nil || c.Value == "" {
		return pendingRow{}, false, nil
	}
	p, err := scanPending(m.pool.QueryRow(r.Context(), `select `+pendingColumns+`
		  from roux_oidc_pending where token_hash = $1 and expires_at > $2`, hashOf(c.Value), m.now()))
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && p.identityID != nil && (signedIn == nil || *signedIn != *p.identityID)) {
		return pendingRow{}, false, nil
	}
	return p, err == nil, err
}

// takePending spends the account this browser is holding: it can be confirmed once. forLink
// says which kind: a sign-up (no identity) or a link (the identity that asked).
func (m *Method) takePending(w http.ResponseWriter, r *http.Request, forIdentity *uuid.UUID) (pendingRow, bool, error) {
	c, err := r.Cookie(pendingCookie)
	if err != nil || c.Value == "" {
		return pendingRow{}, false, nil
	}
	p, err := scanPending(m.pool.QueryRow(r.Context(), `
		delete from roux_oidc_pending
		 where token_hash = $1 and expires_at > $2 and identity_id is not distinct from $3
		returning `+pendingColumns, hashOf(c.Value), m.now(), forIdentity))
	if errors.Is(err, pgx.ErrNoRows) {
		return pendingRow{}, false, nil
	}
	if err == nil {
		http.SetCookie(w, m.cookie(r, pendingCookie, "", -1))
	}
	return p, err == nil, err
}

// pending says which account is waiting, for a page that asks the person to confirm.
func (m *Method) pending(w http.ResponseWriter, r *http.Request) error {
	p, err := m.host.PrincipalOf(r)
	if err != nil {
		return err
	}
	var signedIn *uuid.UUID
	if p != nil {
		signedIn = &p.IdentityID
	}
	row, ok, err := m.pendingOf(r, signedIn)
	if err != nil {
		return err
	}
	if !ok {
		return noPending()
	}
	return api.JSON(w, http.StatusOK, map[string]any{
		"provider": row.provider, "displayName": row.displayName,
		"canSignUp": row.identityID == nil, "canLink": row.identityID != nil,
	})
}

// signUp confirms a pending account as a new identity, if the policy allows it, and signs in.
func (m *Method) signUp(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	if p, err := m.host.PrincipalOf(r); err != nil {
		return err
	} else if p != nil {
		return signUpRefused() // someone signed in cannot sign up
	}
	row, ok, err := m.takePending(w, r, nil)
	if err != nil {
		return err
	}
	if !ok {
		return noPending()
	}
	decision := m.cfg.SignUp(ctx, SignUpRequest{
		Provider: row.provider, Issuer: row.issuer, Subject: row.subject, DisplayName: row.displayName,
		Claims: row.claims, VerifiedEmail: row.verifiedEmail,
	})
	if !decision.Allow {
		slog.DebugContext(ctx, "provider sign-up refused by the policy", "provider", row.provider)
		return signUpRefused()
	}

	identityID, credentialID, err := m.createIdentity(ctx, row, decision)
	if isUniqueViolation(err) {
		// Another browser confirmed the same account first: both end up in the one identity.
		cred, ferr := m.findCredential(ctx, row.issuer, row.subject)
		if ferr != nil || cred == nil {
			return errors.Join(err, ferr)
		}
		res, owner, ferr := authn.Resolve(ctx, m.pool, *cred)
		if ferr != nil {
			return ferr
		}
		if res != authn.Resolved {
			return authn.SignInFailed()
		}
		identityID, credentialID, err = owner, *cred, nil
	}
	if err != nil {
		return err
	}
	if err := m.host.StartSession(w, r, identityID, credentialID, methodName); err != nil {
		return err
	}
	return api.JSON(w, http.StatusOK, map[string]string{"identityId": identityID.String()})
}

// createIdentity makes the identity, links the account and runs the policy's setup, in one
// transaction: if any of it fails, none of it happened.
func (m *Method) createIdentity(ctx context.Context, row pendingRow, d SignUpDecision) (identityID, credentialID uuid.UUID, err error) {
	tx, err := m.pool.Begin(ctx)
	if err != nil {
		return uuid.Nil, uuid.Nil, err
	}
	defer pgdb.Rollback(ctx, tx)
	if identityID, err = authn.CreateIdentity(ctx, tx, m.now()); err != nil {
		return uuid.Nil, uuid.Nil, err
	}
	if credentialID, err = m.addCredential(ctx, tx, identityID, row); err != nil {
		return uuid.Nil, uuid.Nil, err
	}
	if d.Setup != nil {
		if err := d.Setup(ctx, tx, identityID); err != nil {
			return uuid.Nil, uuid.Nil, err
		}
	}
	return identityID, credentialID, tx.Commit(ctx)
}

func (m *Method) addCredential(ctx context.Context, tx authn.DBTX, identityID uuid.UUID, row pendingRow) (uuid.UUID, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return uuid.Nil, err
	}
	if _, err := tx.Exec(ctx, `insert into roux_federated_credential (id, issuer, subject, created_at) values ($1, $2, $3, $4)`,
		id, row.issuer, row.subject, m.now()); err != nil {
		return uuid.Nil, err
	}
	return id, authn.LinkCredential(ctx, tx, id, identityID)
}

// confirmLink links the pending account to the identity signed in, which must have signed in
// recently: the confirmation is what stops an account someone else signed in to at the
// provider from being attached to this identity.
func (m *Method) confirmLink(w http.ResponseWriter, r *http.Request, p *authn.Principal) error {
	ctx := r.Context()
	if err := m.host.RequireRecent(p); err != nil {
		return err
	}
	row, ok, err := m.takePending(w, r, &p.IdentityID)
	if err != nil {
		return err
	}
	if !ok {
		return noPending()
	}
	tx, err := m.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer pgdb.Rollback(ctx, tx)
	id, err := m.addCredential(ctx, tx, p.IdentityID, row)
	if err == nil {
		err = tx.Commit(ctx)
	}
	if isUniqueViolation(err) {
		cred, ferr := m.findCredential(ctx, row.issuer, row.subject)
		if ferr != nil || cred == nil {
			return errors.Join(err, ferr)
		}
		if res, owner, ferr := authn.Resolve(ctx, m.pool, *cred); ferr != nil {
			return ferr
		} else if res == authn.NotLinked || owner != p.IdentityID {
			return alreadyLinked()
		}
		return api.JSON(w, http.StatusOK, map[string]string{"credentialId": cred.String()})
	}
	if err != nil {
		return err
	}
	if m.cfg.Notify != nil {
		if err := m.cfg.Notify(ctx, p.IdentityID, row.provider); err != nil {
			slog.WarnContext(ctx, "could not tell the owner an account was linked", "err", err)
		}
	}
	return api.JSON(w, http.StatusOK, map[string]string{"credentialId": id.String()})
}
