package authn

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Identity statuses.
const (
	StatusActive   = "ACTIVE"
	StatusDisabled = "DISABLED"
)

// DBTX is what the helpers below need: a pool or a transaction.
type DBTX interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// CreateIdentity makes a new active identity and returns its id.
func CreateIdentity(ctx context.Context, db DBTX, now time.Time) (uuid.UUID, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return uuid.Nil, err
	}
	_, err = db.Exec(ctx,
		`insert into roux_identity (id, status, created_at, updated_at) values ($1, $2, $3, $3)`,
		id, StatusActive, now)
	return id, err
}

// LinkCredential makes a credential (an email address, say) sign in as an identity.
func LinkCredential(ctx context.Context, db DBTX, credentialID, identityID uuid.UUID) error {
	_, err := db.Exec(ctx,
		`insert into roux_credential_identity (credential_id, identity_id) values ($1, $2)`,
		credentialID, identityID)
	return err
}

// Resolution is what a credential stands for right now.
type Resolution int

const (
	// NotLinked: the credential belongs to no identity.
	NotLinked Resolution = iota
	// Inactive: it belongs to an identity that may not sign in.
	Inactive
	// Resolved: it belongs to an active identity.
	Resolved
)

// Resolve says which identity a credential signs in as, and whether it may.
func Resolve(ctx context.Context, db DBTX, credentialID uuid.UUID) (Resolution, uuid.UUID, error) {
	var id uuid.UUID
	var status string
	err := db.QueryRow(ctx,
		`select i.id, i.status from roux_credential_identity ci
		   join roux_identity i on i.id = ci.identity_id
		  where ci.credential_id = $1`, credentialID).Scan(&id, &status)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return NotLinked, uuid.Nil, nil
	case err != nil:
		return NotLinked, uuid.Nil, err
	case status != StatusActive:
		return Inactive, id, nil
	}
	return Resolved, id, nil
}

// Session is a live browser session.
type Session struct {
	ID           uuid.UUID
	IdentityID   uuid.UUID
	CredentialID uuid.UUID
	Method       string // how it signed in, spelled as /api/roux/auth/me spells it: "email-link", "email-code"
	SignedInAt   time.Time
}

type store struct{ pool *pgxpool.Pool }

func (s store) start(ctx context.Context, identityID, credentialID uuid.UUID, method, userAgent, tokenHash string, now time.Time) error {
	id, err := uuid.NewV7()
	if err != nil {
		return err
	}
	if len(userAgent) > 512 {
		userAgent = userAgent[:512]
	}
	var ua *string
	if userAgent != "" {
		ua = &userAgent
	}
	_, err = s.pool.Exec(ctx,
		`insert into roux_session (id, identity_id, credential_id, sign_in_method, signed_in_at, last_seen_at, user_agent, token_hash)
		 values ($1, $2, $3, $4, $5, $5, $6, $7)`,
		id, identityID, credentialID, method, now, ua, tokenHash)
	return err
}

// authenticate finds the live session for a cookie's hash and marks it used, in
// one statement. It is live only if it has not ended, has not been idle longer
// than idle, its identity is active, and its credential is still linked to that
// identity: so deactivating an identity or revoking a credential takes effect on
// the very next request.
func (s store) authenticate(ctx context.Context, tokenHash string, now time.Time, idle time.Duration) (*Session, error) {
	var sess Session
	err := s.pool.QueryRow(ctx, `
		update roux_session s
		   set last_seen_at = $2
		 where s.token_hash = $1
		   and s.ended_at is null
		   and s.last_seen_at > $3
		   and exists (select 1 from roux_identity i where i.id = s.identity_id and i.status = $4)
		   and exists (select 1 from roux_credential_identity ci
		                where ci.credential_id = s.credential_id and ci.identity_id = s.identity_id)
		returning s.id, s.identity_id, s.credential_id, s.sign_in_method, s.signed_in_at`,
		tokenHash, now, now.Add(-idle), StatusActive,
	).Scan(&sess.ID, &sess.IdentityID, &sess.CredentialID, &sess.Method, &sess.SignedInAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &sess, err
}

func (s store) end(ctx context.Context, tokenHash string, now time.Time) error {
	_, err := s.pool.Exec(ctx,
		`update roux_session set ended_at = $2 where token_hash = $1 and ended_at is null`, tokenHash, now)
	return err
}

// sessionRow is one live session as the account endpoints show it.
type sessionRow struct {
	id         uuid.UUID
	method     string
	userAgent  *string
	signedInAt time.Time
	lastSeenAt time.Time
}

// live lists the identity's live sessions, newest sign-in first: not ended, and not idle
// longer than idle.
func (s store) live(ctx context.Context, identityID uuid.UUID, now time.Time, idle time.Duration) ([]sessionRow, error) {
	rows, err := s.pool.Query(ctx, `
		select id, sign_in_method, user_agent, signed_in_at, last_seen_at from roux_session
		 where identity_id = $1 and ended_at is null and last_seen_at > $2
		 order by signed_in_at desc, id desc`, identityID, now.Add(-idle))
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (sessionRow, error) {
		var v sessionRow
		err := r.Scan(&v.id, &v.method, &v.userAgent, &v.signedInAt, &v.lastSeenAt)
		v.signedInAt, v.lastSeenAt = v.signedInAt.UTC(), v.lastSeenAt.UTC()
		return v, err
	})
}

// endLive ends one of the identity's live sessions, and says whether it was there.
func (s store) endLive(ctx context.Context, identityID, id uuid.UUID, now time.Time, idle time.Duration) (bool, error) {
	tag, err := s.pool.Exec(ctx, `
		update roux_session set ended_at = $3
		 where id = $1 and identity_id = $2 and ended_at is null and last_seen_at > $4`,
		id, identityID, now, now.Add(-idle))
	return tag.RowsAffected() > 0, err
}

// isLive says whether the identity has a live session with that id.
func (s store) isLive(ctx context.Context, identityID, id uuid.UUID, now time.Time, idle time.Duration) (bool, error) {
	var n int
	err := s.pool.QueryRow(ctx, `
		select 1 from roux_session
		 where id = $1 and identity_id = $2 and ended_at is null and last_seen_at > $3`,
		id, identityID, now.Add(-idle)).Scan(&n)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

// endOthers ends every live session of the identity but one, and counts them.
func (s store) endOthers(ctx context.Context, identityID, keep uuid.UUID, now time.Time, idle time.Duration) (int64, error) {
	tag, err := s.pool.Exec(ctx, `
		update roux_session set ended_at = $3
		 where identity_id = $1 and id <> $2 and ended_at is null and last_seen_at > $4`,
		identityID, keep, now, now.Add(-idle))
	return tag.RowsAffected(), err
}
