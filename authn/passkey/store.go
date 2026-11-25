package passkey

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/jwcarman/roux/authn"
)

// stored is one passkey as the database has it.
type stored struct {
	id         uuid.UUID // our id: the credential of the identity
	webAuthnID []byte    // the authenticator's credential id
	handle     []byte
	credential webauthn.Credential
	label      string
	created    time.Time
	lastUsed   *time.Time
}

func credentialsOf(list []stored) []webauthn.Credential {
	out := make([]webauthn.Credential, len(list))
	for i, k := range list {
		out[i] = k.credential
	}
	return out
}

const storedColumns = `c.credential_uuid, c.webauthn_id, c.user_handle, c.credential, c.label, c.created_at, c.last_used_at`

func scanStored(row pgx.Row) (stored, error) {
	var k stored
	var raw []byte
	err := row.Scan(&k.id, &k.webAuthnID, &k.handle, &raw, &k.label, &k.created, &k.lastUsed)
	if err != nil {
		return k, err
	}
	return k, json.Unmarshal(raw, &k.credential)
}

type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// ensureUser makes (or renames) the WebAuthn user of the identity and returns its handle:
// 64 random bytes, never derived from the identity or the address. The name is picked
// again each time registration starts, so an identity that gains or changes an address
// gets the new name on its next passkey.
func (m *Method) ensureUser(ctx context.Context, db querier, identityID uuid.UUID, name string) ([]byte, error) {
	handle := make([]byte, 64)
	if _, err := rand.Read(handle); err != nil {
		return nil, err
	}
	var kept []byte
	err := db.QueryRow(ctx, `
		insert into roux_passkey_user (user_handle, identity_id, name, display_name) values ($1, $2, $3, $3)
		on conflict (identity_id) do update set name = excluded.name, display_name = excluded.display_name
		returning user_handle`, handle, identityID, name).Scan(&kept)
	return kept, err
}

func (m *Method) credentialsOf(ctx context.Context, db querier, handle []byte) ([]stored, error) {
	rows, err := db.Query(ctx, `select `+storedColumns+` from roux_passkey_credential c
		where c.user_handle = $1 order by c.created_at, c.credential_uuid`, handle)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (stored, error) { return scanStored(r) })
}

// listFor is the identity's passkeys, oldest first.
func (m *Method) listFor(ctx context.Context, db querier, identityID uuid.UUID) ([]stored, error) {
	rows, err := db.Query(ctx, `select `+storedColumns+` from roux_passkey_credential c
		join roux_passkey_user u on u.user_handle = c.user_handle
		where u.identity_id = $1 order by c.created_at, c.credential_uuid`, identityID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (stored, error) { return scanStored(r) })
}

// byWebAuthnID finds a passkey by the authenticator's credential id, with its owner as a
// WebAuthn user holding all of their passkeys.
func (m *Method) byWebAuthnID(ctx context.Context, db querier, rawID []byte) (stored, account, bool, error) {
	k, err := scanStored(db.QueryRow(ctx, `select `+storedColumns+` from roux_passkey_credential c where c.webauthn_id = $1`, rawID))
	if errors.Is(err, pgx.ErrNoRows) {
		return stored{}, account{}, false, nil
	}
	if err != nil {
		return stored{}, account{}, false, err
	}
	acc := account{handle: k.handle}
	if err := db.QueryRow(ctx, `select name, coalesce(display_name, name) from roux_passkey_user where user_handle = $1`, k.handle).
		Scan(&acc.name, &acc.display); err != nil {
		return stored{}, account{}, false, err
	}
	all, err := m.credentialsOf(ctx, db, k.handle)
	if err != nil {
		return stored{}, account{}, false, err
	}
	acc.credentials = credentialsOf(all)
	return k, acc, true, nil
}

// ownedBy finds the identity's passkey with that credential id.
func (m *Method) ownedBy(ctx context.Context, db querier, identityID uuid.UUID, rawID []byte) (stored, bool, error) {
	k, err := scanStored(db.QueryRow(ctx, `select `+storedColumns+` from roux_passkey_credential c
		join roux_passkey_user u on u.user_handle = c.user_handle
		where u.identity_id = $1 and c.webauthn_id = $2`, identityID, rawID))
	if errors.Is(err, pgx.ErrNoRows) {
		return stored{}, false, nil
	}
	return k, err == nil, err
}

// save stores a new passkey and makes it a credential of the identity, together.
func (m *Method) save(ctx context.Context, id uuid.UUID, handle []byte, c webauthn.Credential, label string, identityID uuid.UUID) error {
	raw, err := json.Marshal(c)
	if err != nil {
		return err
	}
	tx, err := m.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // a no-op after commit
	if _, err := tx.Exec(ctx, `
		insert into roux_passkey_credential (credential_uuid, webauthn_id, user_handle, credential, label, created_at)
		values ($1, $2, $3, $4, $5, $6)`, id, c.ID, handle, raw, label, m.now()); err != nil {
		return err
	}
	if err := authn.LinkCredential(ctx, tx, id, identityID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// recordUse keeps what the authenticator reported at sign-in: the sign count and flags.
func (m *Method) recordUse(ctx context.Context, id uuid.UUID, c webauthn.Credential) error {
	raw, err := json.Marshal(c)
	if err != nil {
		return err
	}
	_, err = m.pool.Exec(ctx, `update roux_passkey_credential set credential = $2, last_used_at = $3 where credential_uuid = $1`,
		id, raw, m.now())
	return err
}

// revoke deletes a passkey and unlinks it from its identity, so it cannot sign in again
// and sessions it signed in lose their credential. It reports whether it was there.
func (m *Method) revoke(ctx context.Context, db authn.DBTX, id uuid.UUID) (bool, error) {
	tag, err := db.Exec(ctx, `delete from roux_passkey_credential where credential_uuid = $1`, id)
	if err != nil {
		return false, err
	}
	if _, err := db.Exec(ctx, `delete from roux_credential_identity where credential_id = $1`, id); err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// count is authn.Counter for passkeys: how many the identity holds.
func count(ctx context.Context, db authn.DBTX, identityID uuid.UUID) (int64, error) {
	var n int64
	err := db.QueryRow(ctx, `
		select count(*) from roux_passkey_credential c
		  join roux_credential_identity ci on ci.credential_id = c.credential_uuid
		 where ci.identity_id = $1`, identityID).Scan(&n)
	return n, err
}

func isDuplicate(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505"
}

// ---- ceremonies ----

const (
	kindSignIn   = "sign-in"
	kindRegister = "register"

	ceremonyCookie = "PASSKEY_CEREMONY"
)

type ceremony struct {
	identityID *uuid.UUID
	session    webauthn.SessionData
}

func hashOf(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func (m *Method) ceremonyCookie(r *http.Request, value string, maxAge int) *http.Cookie {
	return &http.Cookie{
		Name: ceremonyCookie, Value: value, Path: "/", MaxAge: maxAge,
		HttpOnly: true, Secure: m.host.SecureCookie(r), SameSite: http.SameSiteLaxMode,
	}
}

// startCeremony stores the session data behind a fresh cookie, replacing any ceremony
// this browser had under way. Expired ceremonies are cleared as new ones are made.
func (m *Method) startCeremony(ctx context.Context, w http.ResponseWriter, r *http.Request, kind string, identityID *uuid.UUID, session webauthn.SessionData) error {
	raw, err := json.Marshal(session)
	if err != nil {
		return err
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return err
	}
	token := base64.RawURLEncoding.EncodeToString(b)
	now := m.now()

	tx, err := m.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // a no-op after commit
	if old, err := r.Cookie(ceremonyCookie); err == nil && old.Value != "" {
		if _, err := tx.Exec(ctx, `delete from roux_passkey_ceremony where token_hash = $1`, hashOf(old.Value)); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `delete from roux_passkey_ceremony where expires_at < $1`, now); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		insert into roux_passkey_ceremony (token_hash, kind, identity_id, session, expires_at)
		values ($1, $2, $3, $4, $5)`, hashOf(token), kind, identityID, raw, now.Add(m.cfg.CeremonyTTL)); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	http.SetCookie(w, m.ceremonyCookie(r, token, int(m.cfg.CeremonyTTL.Seconds())))
	return nil
}

// takeCeremony spends the ceremony this browser has under way, if it is of the kind and
// has not expired. It is deleted whatever happens next: a response can be tried once.
func (m *Method) takeCeremony(ctx context.Context, w http.ResponseWriter, r *http.Request, kind string) (ceremony, bool, error) {
	c, err := r.Cookie(ceremonyCookie)
	if err != nil || c.Value == "" {
		return ceremony{}, false, nil
	}
	http.SetCookie(w, m.ceremonyCookie(r, "", -1))
	var cer ceremony
	var raw []byte
	err = m.pool.QueryRow(ctx, `
		delete from roux_passkey_ceremony
		 where token_hash = $1 and kind = $2 and expires_at > $3
		returning identity_id, session`, hashOf(c.Value), kind, m.now()).Scan(&cer.identityID, &raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return ceremony{}, false, nil
	}
	if err != nil {
		return ceremony{}, false, err
	}
	return cer, true, json.Unmarshal(raw, &cer.session)
}
