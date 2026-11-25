package emaillink

import (
	"context"
	"crypto/subtle"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/pgdb"
)

// A signed-in person's own email addresses. They can add one, or make an address theirs in
// place of one they have, by confirming a link or code sent to it: until they confirm,
// nothing changes, because an address is never attached without proof that the person reads
// its mailbox (else anyone could claim another person's address, or get someone to sign in
// to an identity that is not theirs).
//
//	GET    /api/roux/auth/me/email-addresses                    [{id, address, createdAt}], oldest first
//	POST   /api/roux/auth/me/email-addresses                    {address, replaces?} -> 202, whatever becomes of it
//	POST   /api/roux/auth/me/email-addresses/confirmations      {token} or {code} -> {"credentialId"}
//	DELETE /api/roux/auth/me/email-addresses/{id}               204; never the last way in
//
// Asking, confirming and removing need a recent sign-in (checked before the body or the id is
// looked at, so a stale session learns nothing).

const (
	// ConfirmFragment precedes the token in the link of a confirmation email.
	ConfirmFragment = "#confirm-address="
	maxTokenLength  = 512
)

func emailNotFound() error {
	return authn.NewError(http.StatusNotFound, "email-address-not-found", "No such email address")
}

func invalidConfirmation() error {
	return authn.NewError(http.StatusBadRequest, "invalid-confirmation", "Invalid email address confirmation")
}

func addressTaken() error {
	return authn.NewError(http.StatusConflict, "email-address-taken", "That address is already registered")
}

type addressView struct {
	ID        string `json:"id"`
	Address   string `json:"address"`
	CreatedAt string `json:"createdAt"`
}

func (m *Method) mountAddresses(h *authn.Host) {
	h.HandleSigned("GET /me/email-addresses", m.listAddresses)
	h.HandleSigned("POST /me/email-addresses", func(w http.ResponseWriter, r *http.Request, p *authn.Principal) error {
		return m.askForAddress(h, w, r, p)
	})
	h.HandleSigned("POST /me/email-addresses/confirmations", func(w http.ResponseWriter, r *http.Request, p *authn.Principal) error {
		return m.confirmAddress(h, w, r, p)
	})
	h.HandleSigned("DELETE /me/email-addresses/{id}", func(w http.ResponseWriter, r *http.Request, p *authn.Principal) error {
		return m.removeAddress(h, w, r, p)
	})
}

func (m *Method) listAddresses(w http.ResponseWriter, r *http.Request, p *authn.Principal) error {
	rows, err := m.store.pool.Query(r.Context(), `
		select e.id, e.address, e.created_at from roux_email_credential e
		  join roux_credential_identity ci on ci.credential_id = e.id
		 where ci.identity_id = $1 order by e.created_at, e.id`, p.IdentityID)
	if err != nil {
		return err
	}
	out, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (addressView, error) {
		var v addressView
		var id uuid.UUID
		var at time.Time
		if err := r.Scan(&id, &v.Address, &at); err != nil {
			return v, err
		}
		v.ID, v.CreatedAt = id.String(), at.UTC().Format(time.RFC3339Nano)
		return v, nil
	})
	if err != nil {
		return err
	}
	return api.JSON(w, http.StatusOK, out)
}

// ownsAddress says whether the credential is an email address of the identity.
func (m *Method) ownsAddress(ctx context.Context, db authn.DBTX, identityID, credentialID uuid.UUID) (bool, error) {
	var n int
	err := db.QueryRow(ctx, `
		select 1 from roux_email_credential e
		  join roux_credential_identity ci on ci.credential_id = e.id
		 where e.id = $1 and ci.identity_id = $2`, credentialID, identityID).Scan(&n)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

// askForAddress answers 202 whatever becomes of the request, and does the rest after it has
// answered, so the response does not tell whether an address is taken.
func (m *Method) askForAddress(h *authn.Host, w http.ResponseWriter, r *http.Request, p *authn.Principal) error {
	if err := h.RequireRecent(p); err != nil {
		return err
	}
	f := readStrings(r, "address", "replaces")
	var replaces *uuid.UUID
	if raw, ok := f["replaces"]; ok {
		id, err := uuid.Parse(raw)
		if err != nil {
			return emailNotFound()
		}
		owned, err := m.ownsAddress(r.Context(), m.store.pool, p.IdentityID, id)
		if err != nil {
			return err
		}
		if !owned {
			return emailNotFound()
		}
		replaces = &id
	}
	ctx := context.WithoutCancel(r.Context())
	w.WriteHeader(http.StatusAccepted)
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()
		slog.DebugContext(ctx, "email address requested", "outcome", m.requestAddress(ctx, p.IdentityID, f["address"], replaces))
	}()
	return nil
}

type requestOutcome string

const (
	requestSent       requestOutcome = "sent"
	requestInvalid    requestOutcome = "invalid-address"
	requestTaken      requestOutcome = "address-taken"
	requestSuppressed requestOutcome = "resend-suppressed"
	requestFailed     requestOutcome = "send-failed"
)

// requestAddress stores a request and sends the address its link and code, unless: the text
// is not an address; the address is registered already, to anyone, the caller included; the
// identity asked within the resend interval (for any address), or anyone asked for this
// address within it. A new request replaces the identity's earlier one.
func (m *Method) requestAddress(ctx context.Context, identityID uuid.UUID, address string, replaces *uuid.UUID) requestOutcome {
	if !looksLikeAnAddress(address) {
		return requestInvalid
	}
	address = normalizeAddress(address)
	if _, found, err := m.store.findCredential(ctx, address); err != nil {
		slog.WarnContext(ctx, "address request: lookup failed", "err", err)
		return requestFailed
	} else if found {
		return requestTaken
	}

	id, err := uuid.NewV7()
	if err != nil {
		return requestFailed
	}
	token, code := newToken(), newCode(m.cfg.CodeLength)
	now := m.now()
	expires := now.Add(m.cfg.TokenTTL)
	tag, err := m.store.pool.Exec(ctx, `
		insert into roux_email_address_request
		       (id, identity_id, address, replaces_credential_id, token_hash, code_hash, code_attempts, created_at, expires_at)
		select $1::uuid, $2::uuid, $3::varchar, $4::uuid, $5::varchar, $6::varchar, 0, $7::timestamptz, $8::timestamptz
		 where not exists (select 1 from roux_email_address_request
		                    where address = $3 and identity_id <> $2 and created_at > $9)
		on conflict (identity_id) do update
		   set id = excluded.id, address = excluded.address, replaces_credential_id = excluded.replaces_credential_id,
		       token_hash = excluded.token_hash, code_hash = excluded.code_hash, code_attempts = 0,
		       created_at = excluded.created_at, expires_at = excluded.expires_at
		 where roux_email_address_request.created_at <= $9`,
		id, identityID, address, replaces, sha256Hex(token), m.hasher.hash(id, code), now, expires, now.Add(-m.cfg.ResendInterval))
	if err != nil {
		slog.WarnContext(ctx, "address request: could not store it", "err", err)
		return requestFailed
	}
	if tag.RowsAffected() == 0 {
		return requestSuppressed
	}

	link := m.cfg.AddressConfirmationURL + ConfirmFragment + token
	msg := addressConfirmationMessage(replaces != nil)(m.cfg.AppName, m.cfg.BrandColor, address, link, formatCode(code), m.cfg.TokenTTL)
	if err := m.cfg.Sender.Send(ctx, msg); err != nil {
		// Never log the message: it carries the link and the code.
		slog.WarnContext(ctx, "address request: could not send the email", "err", err)
		if _, derr := m.store.pool.Exec(context.WithoutCancel(ctx), `delete from roux_email_address_request where id = $1`, id); derr != nil {
			slog.WarnContext(ctx, "address request: could not remove the unsent request", "err", derr)
		}
		return requestFailed
	}
	return requestSent
}

// pending is a request being confirmed.
type pending struct {
	id       uuid.UUID
	address  string
	replaces *uuid.UUID
}

// confirmAddress adds the address a person asked for, once they prove they read its mailbox
// with the link's token or the typed code (never both, never neither). Only the identity that
// asked can confirm: the same token or code does nothing for anyone else signed in.
func (m *Method) confirmAddress(h *authn.Host, w http.ResponseWriter, r *http.Request, p *authn.Principal) error {
	if err := h.RequireRecent(p); err != nil {
		return err
	}
	ctx := r.Context()
	f := readStrings(r, "token", "code")
	token, hasToken := f["token"]
	code, hasCode := f["code"]
	if hasToken == hasCode {
		return invalidConfirmation()
	}

	var req pending
	var err error
	if hasToken {
		req, err = m.consumeAddressToken(ctx, p.IdentityID, token)
	} else {
		req, err = m.consumeAddressCode(ctx, p.IdentityID, code)
	}
	if err != nil {
		return err
	}

	credentialID, oldAddress, err := m.applyAddress(ctx, p.IdentityID, req)
	if err != nil {
		return err
	}
	if oldAddress != "" { // a change: the old address hears about it, and a failure to tell it is only logged
		if err := m.cfg.Sender.Send(ctx, addressChangedMessage(m.cfg.AppName, m.cfg.BrandColor, oldAddress, req.address)); err != nil {
			slog.WarnContext(ctx, "could not tell a replaced address", "err", err)
		}
	} else { // an addition: every address already there hears about it, the same way
		m.tellTheOthers(ctx, p.IdentityID, credentialID, req.address)
	}
	return api.JSON(w, http.StatusOK, struct {
		CredentialID string `json:"credentialId"`
	}{credentialID.String()})
}

// tellTheOthers emails each of the identity's addresses but the one just added that it was
// added. A failure is logged: the address is added either way.
func (m *Method) tellTheOthers(ctx context.Context, identityID, added uuid.UUID, address string) {
	rows, err := m.store.pool.Query(ctx, `
		select e.address from roux_credential_identity ci
		  join roux_email_credential e on e.id = ci.credential_id
		 where ci.identity_id = $1 and e.id <> $2
		 order by e.id`, identityID, added)
	if err == nil {
		var others []string
		if others, err = pgx.CollectRows(rows, pgx.RowTo[string]); err == nil {
			for _, other := range others {
				if serr := m.cfg.Sender.Send(ctx, addressAddedMessage(m.cfg.AppName, m.cfg.BrandColor, other, address)); serr != nil {
					slog.WarnContext(ctx, "could not tell an address that another was added", "err", serr)
				}
			}
		}
	}
	if err != nil {
		slog.WarnContext(ctx, "could not find the addresses to tell of a new one", "err", err)
	}
}

func (m *Method) consumeAddressToken(ctx context.Context, identityID uuid.UUID, token string) (pending, error) {
	if strings.TrimSpace(token) == "" || len(token) > maxTokenLength {
		return pending{}, invalidConfirmation()
	}
	var req pending
	err := m.store.pool.QueryRow(ctx, `
		delete from roux_email_address_request
		 where identity_id = $1 and token_hash = $2 and expires_at > $3
		returning id, address, replaces_credential_id`, identityID, sha256Hex(token), m.now()).
		Scan(&req.id, &req.address, &req.replaces)
	if errors.Is(err, pgx.ErrNoRows) {
		return pending{}, invalidConfirmation()
	}
	return req, err
}

// consumeAddressCode counts a guess against the identity's pending request in one atomic
// update, so a burnt code stays burnt however many guesses race for it.
func (m *Method) consumeAddressCode(ctx context.Context, identityID uuid.UUID, typed string) (pending, error) {
	code, ok := normalizeCode(typed, m.cfg.CodeLength)
	if !ok {
		return pending{}, invalidConfirmation()
	}
	now := m.now()
	var id uuid.UUID
	var stored string
	err := m.store.pool.QueryRow(ctx, `
		update roux_email_address_request set code_attempts = code_attempts + 1
		 where identity_id = $1 and code_attempts < $2 and expires_at > $3
		returning id, code_hash`, identityID, m.cfg.CodeMaxAttempts, now).Scan(&id, &stored)
	if errors.Is(err, pgx.ErrNoRows) {
		m.hasher.hash(uuid.Nil, code) // the same work as a real comparison, so timing does not tell
		return pending{}, invalidConfirmation()
	}
	if err != nil {
		return pending{}, err
	}
	presented := m.hasher.hash(id, code)
	if subtle.ConstantTimeCompare([]byte(presented), []byte(stored)) != 1 {
		return pending{}, invalidConfirmation()
	}
	var req pending
	err = m.store.pool.QueryRow(ctx, `
		delete from roux_email_address_request where id = $1 and code_hash = $2 and expires_at > $3
		returning id, address, replaces_credential_id`, id, presented, now).Scan(&req.id, &req.address, &req.replaces)
	if errors.Is(err, pgx.ErrNoRows) {
		return pending{}, invalidConfirmation()
	}
	return req, err
}

// applyAddress makes the address the identity's. For a change it also removes the address it
// replaces, in the same transaction, so the identity is never left without either; sessions
// signed in with the old address end with it. It returns the old address for the notice.
func (m *Method) applyAddress(ctx context.Context, identityID uuid.UUID, req pending) (credentialID uuid.UUID, oldAddress string, err error) {
	tx, err := m.store.pool.Begin(ctx)
	if err != nil {
		return uuid.Nil, "", err
	}
	defer pgdb.Rollback(ctx, tx)

	var oldID uuid.UUID
	if req.replaces != nil {
		if owned, err := m.ownsAddress(ctx, tx, identityID, *req.replaces); err != nil {
			return uuid.Nil, "", err
		} else if owned {
			oldID = *req.replaces
			if err := tx.QueryRow(ctx, `select address from roux_email_credential where id = $1`, oldID).Scan(&oldAddress); err != nil {
				return uuid.Nil, "", err
			}
		}
	}
	if credentialID, err = m.registerIn(ctx, tx, identityID, req.address); err != nil {
		if errors.Is(err, ErrAddressTaken) { // someone registered it in the meantime
			return uuid.Nil, "", addressTaken()
		}
		return uuid.Nil, "", err
	}
	if oldID != uuid.Nil {
		if err := revokeAddress(ctx, tx, oldID); err != nil {
			return uuid.Nil, "", err
		}
	}
	return credentialID, oldAddress, tx.Commit(ctx)
}

// revokeAddress deletes an email credential and unlinks it from its identity, so it cannot
// sign in and sessions it signed in lose their credential. It reports nothing if it was gone.
func revokeAddress(ctx context.Context, db authn.DBTX, credentialID uuid.UUID) error {
	if _, err := db.Exec(ctx, `delete from roux_email_credential where id = $1`, credentialID); err != nil {
		return err
	}
	_, err := db.Exec(ctx, `delete from roux_credential_identity where credential_id = $1`, credentialID)
	return err
}

// removeAddress removes one of the caller's addresses, never their last way in. Someone
// else's address, an unknown one and a malformed id are the same 404.
func (m *Method) removeAddress(h *authn.Host, w http.ResponseWriter, r *http.Request, p *authn.Principal) error {
	ctx := r.Context()
	if err := h.RequireRecent(p); err != nil {
		return err
	}
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		return emailNotFound()
	}
	if owned, err := m.ownsAddress(ctx, m.store.pool, p.IdentityID, id); err != nil {
		return err
	} else if !owned {
		return emailNotFound()
	}
	err = h.RemoveIfNotLast(ctx, p.IdentityID, func(ctx context.Context, tx pgx.Tx) error {
		if owned, err := m.ownsAddress(ctx, tx, p.IdentityID, id); err != nil {
			return err
		} else if !owned {
			return emailNotFound() // removed by someone else meanwhile
		}
		return revokeAddress(ctx, tx, id)
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
