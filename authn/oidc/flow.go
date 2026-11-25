package oidc

import (
	"context"
	"crypto/subtle"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/jwcarman/roux/authn"
)

const (
	flowCookie    = "OIDC_FLOW"
	flowTTL       = 10 * time.Minute
	pendingCookie = "OIDC_PENDING"
)

// begin stores a new flow behind a cookie and returns where to send the browser. A link
// carries the identity that asked, so the callback can tell a link from a sign-in without
// anything in the URL saying so.
func (m *Method) begin(w http.ResponseWriter, r *http.Request, rt *runtime, identityID *uuid.UUID) (string, error) {
	ctx := r.Context()
	cookie, err := randomToken()
	if err != nil {
		return "", err
	}
	state, err := randomToken()
	if err != nil {
		return "", err
	}
	nonce, err := randomToken()
	if err != nil {
		return "", err
	}
	verifier, err := randomToken() // 43 URL-safe characters: a valid PKCE verifier
	if err != nil {
		return "", err
	}
	target, err := rt.authURL(ctx, state, nonce, verifier, identityID != nil)
	if err != nil {
		return "", err
	}
	now := m.now()
	tx, err := m.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // a no-op after commit
	if old, err := r.Cookie(flowCookie); err == nil && old.Value != "" {
		if _, err := tx.Exec(ctx, `delete from roux_oidc_flow where token_hash = $1`, hashOf(old.Value)); err != nil {
			return "", err
		}
	}
	if _, err := tx.Exec(ctx, `delete from roux_oidc_flow where expires_at < $1`, now); err != nil {
		return "", err
	}
	if _, err := tx.Exec(ctx, `
		insert into roux_oidc_flow (token_hash, state_hash, nonce, verifier, provider, identity_id, started_at, expires_at)
		values ($1, $2, $3, $4, $5, $6, $7, $8)`,
		hashOf(cookie), hashOf(state), nonce, verifier, rt.p.ID, identityID, now, now.Add(flowTTL)); err != nil {
		return "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	http.SetCookie(w, m.cookie(r, flowCookie, cookie, int(flowTTL.Seconds())))
	return target, nil
}

// authorize starts a plain sign-in. It never links, whoever is signed in.
func (m *Method) authorize(w http.ResponseWriter, r *http.Request) error {
	rt, ok := m.providers[r.PathValue("id")]
	if !ok {
		return unknownProvider()
	}
	target, err := m.begin(w, r, rt, nil)
	if err != nil {
		m.debug(r, "could not start", err)
		http.Redirect(w, r, m.failure(errSignInFailed), http.StatusFound)
		return nil
	}
	http.Redirect(w, r, target, http.StatusFound)
	return nil
}

type flowRow struct {
	stateHash, nonce, verifier string
	identityID                 *uuid.UUID
	startedAt                  time.Time
}

// takeFlow spends the flow this browser has under way for the provider: a callback can be
// answered once, whatever the answer says.
func (m *Method) takeFlow(w http.ResponseWriter, r *http.Request, provider string) (flowRow, bool, error) {
	c, err := r.Cookie(flowCookie)
	if err != nil || c.Value == "" {
		return flowRow{}, false, nil
	}
	http.SetCookie(w, m.cookie(r, flowCookie, "", -1))
	var f flowRow
	err = m.pool.QueryRow(r.Context(), `
		delete from roux_oidc_flow
		 where token_hash = $1 and provider = $2 and expires_at > $3
		returning state_hash, nonce, verifier, identity_id, started_at`,
		hashOf(c.Value), provider, m.now()).Scan(&f.stateHash, &f.nonce, &f.verifier, &f.identityID, &f.startedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return flowRow{}, false, nil
	}
	return f, err == nil, err
}

func (m *Method) redirect(w http.ResponseWriter, r *http.Request, to string) error {
	http.Redirect(w, r, to, http.StatusFound)
	return nil
}

// callback is the provider's answer. Whatever goes wrong, the browser is sent to the
// failure page with a code; the reason is logged, never shown.
func (m *Method) callback(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	rt, ok := m.providers[r.PathValue("id")]
	if !ok {
		return unknownProvider()
	}
	fail := func(why string, err error) error {
		m.debug(r, why, err)
		return m.redirect(w, r, m.failure(errSignInFailed))
	}
	f, ok, err := m.takeFlow(w, r, rt.p.ID)
	if err != nil {
		return fail("reading the flow", err)
	}
	if !ok {
		return fail("no flow under way for this browser", nil)
	}
	q := r.URL.Query()
	if e := q.Get("error"); e != "" {
		return fail("the provider refused: "+e, nil)
	}
	if subtle.ConstantTimeCompare([]byte(hashOf(q.Get("state"))), []byte(f.stateHash)) != 1 {
		return fail("state mismatch", nil)
	}
	acct, err := rt.exchange(ctx, q.Get("code"), f.verifier, f.nonce)
	if err != nil {
		return fail("exchange", err)
	}

	p, err := m.host.PrincipalOf(r)
	if err != nil {
		return err
	}
	var signedIn *uuid.UUID
	if p != nil {
		signedIn = &p.IdentityID
	}
	link := f.identityID != nil
	if link && (signedIn == nil || *signedIn != *f.identityID || m.now().After(f.startedAt.Add(m.cfg.LinkWindow))) {
		return fail("a link answered by someone else, or too late", nil)
	}

	cred, err := m.findCredential(ctx, acct.Issuer, acct.Subject)
	if err != nil {
		return err
	}
	if cred == nil {
		return m.unknown(w, r, rt, acct, signedIn, link)
	}
	res, owner, err := authn.Resolve(ctx, m.pool, *cred)
	if err != nil {
		return err
	}
	switch {
	case res == authn.NotLinked:
		return m.unknown(w, r, rt, acct, signedIn, link)
	case signedIn != nil && (res == authn.Inactive || owner != *signedIn):
		return m.redirect(w, r, m.alreadyLinkedURL(link))
	case link: // this identity already has the account: a link is not a sign-in
		return m.redirect(w, r, m.cfg.LinkURL)
	case res == authn.Inactive:
		return fail("the identity is inactive", nil)
	}
	if err := m.host.StartSession(w, r, owner, *cred, methodName); err != nil {
		return err
	}
	return m.redirect(w, r, m.cfg.SuccessURL)
}

func (m *Method) alreadyLinkedURL(link bool) string {
	if link {
		return landing(m.cfg.LinkURL, "error", errAlreadyLinked)
	}
	return m.failure(errAlreadyLinked)
}

// unknown is an account no identity has: a pending link when the person asked to link, a
// pending sign-up when no one is signed in, and nothing at all for a plain sign-in by
// someone who is signed in (to use another account, sign out first).
func (m *Method) unknown(w http.ResponseWriter, r *http.Request, rt *runtime, a account, signedIn *uuid.UUID, link bool) error {
	if signedIn != nil && !link {
		return m.redirect(w, r, m.failure(errSignedIn))
	}
	if err := m.savePending(w, r, rt, a, signedIn); err != nil {
		return err
	}
	if link {
		return m.redirect(w, r, landing(m.cfg.LinkURL, "pending", "link"))
	}
	return m.redirect(w, r, landing(m.cfg.FailureURL, "pending", "sign-up"))
}

func (m *Method) findCredential(ctx context.Context, issuer, subject string) (*uuid.UUID, error) {
	id, found, err := FindCredential(ctx, m.pool, issuer, subject)
	if !found {
		return nil, err
	}
	return &id, err
}

// FindCredential is the credential of the provider account (issuer, subject), if one is linked.
// A bearer token and a browser sign-in with the same issuer and subject are the same credential.
func FindCredential(ctx context.Context, db authn.DBTX, issuer, subject string) (id uuid.UUID, found bool, err error) {
	err = db.QueryRow(ctx, `select id from roux_federated_credential where issuer = $1 and subject = $2`, issuer, subject).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, false, nil
	}
	return id, err == nil, err
}

// LinkAccount links the provider account (issuer, subject) to the identity, for code that
// decides on its own who a provider account is (an operator, a migration, a test). The
// account may be linked to one identity only: a second link is a unique violation.
func LinkAccount(ctx context.Context, db authn.DBTX, identityID uuid.UUID, issuer, subject string, now time.Time) (uuid.UUID, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return uuid.Nil, err
	}
	if _, err := db.Exec(ctx, `insert into roux_federated_credential (id, issuer, subject, created_at) values ($1, $2, $3, $4)`,
		id, issuer, subject, now.UTC()); err != nil {
		return uuid.Nil, err
	}
	return id, authn.LinkCredential(ctx, db, id, identityID)
}

// isUniqueViolation: the account is already linked (someone got there first).
func isUniqueViolation(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505"
}

// wantsJSON: a page that calls with fetch cannot follow a redirect to another site, so it
// asks for the address instead.
func wantsJSON(r *http.Request) bool {
	return strings.Contains(r.Header.Get("Accept"), "application/json")
}
