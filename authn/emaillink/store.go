package emaillink

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jwcarman/roux/authn"
)

// The statements below are single atomic SQL on purpose. Each runs on its own
// (never inside a transaction of the caller's): the attempt count must commit
// even when the sign-in then fails, or the attempt limit would stop working.

type store struct{ pool *pgxpool.Pool }

func (s store) findCredential(ctx context.Context, address string) (uuid.UUID, bool, error) {
	var id uuid.UUID
	err := s.pool.QueryRow(ctx, `select id from roux_email_credential where address = $1`, address).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, false, nil
	}
	return id, err == nil, err
}

func (s store) findCredentialTx(ctx context.Context, db authn.DBTX, address string) (uuid.UUID, bool, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx, `select id from roux_email_credential where address = $1`, address).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, false, nil
	}
	return id, err == nil, err
}

// issue stores a new link and code for the credential, replacing the old pair,
// unless one was issued within the resend interval. It reports whether it did.
func (s store) issue(ctx context.Context, credentialID uuid.UUID, tokenHash, codeHash string, now, expiresAt time.Time, resend time.Duration) (bool, error) {
	tag, err := s.pool.Exec(ctx, `
		insert into roux_email_link_token (credential_id, token_hash, code_hash, code_attempts, created_at, expires_at)
		values ($1, $2, $3, 0, $4, $5)
		on conflict (credential_id) do update
		   set token_hash = excluded.token_hash,
		       code_hash = excluded.code_hash,
		       code_attempts = 0,
		       created_at = excluded.created_at,
		       expires_at = excluded.expires_at
		 where roux_email_link_token.created_at <= $6`,
		credentialID, tokenHash, codeHash, now, expiresAt, now.Add(-resend))
	return tag.RowsAffected() > 0, err
}

// consume spends a link: it deletes the row, so using the link ends the code too,
// and only one of two concurrent uses can win.
func (s store) consume(ctx context.Context, tokenHash string, now time.Time) (uuid.UUID, bool, error) {
	var id uuid.UUID
	err := s.pool.QueryRow(ctx,
		`delete from roux_email_link_token where token_hash = $1 and expires_at > $2 returning credential_id`,
		tokenHash, now).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, false, nil
	}
	return id, err == nil, err
}

// attemptCode counts one guess against the address's live code, in a single
// atomic update, and returns the code's hash to check the guess against. It
// returns nothing once the code has no attempts left or has expired, so a burnt
// code stays burnt however many guesses race for it.
func (s store) attemptCode(ctx context.Context, address string, maxAttempts int, now time.Time) (uuid.UUID, string, bool, error) {
	var id uuid.UUID
	var codeHash string
	err := s.pool.QueryRow(ctx, `
		update roux_email_link_token t
		   set code_attempts = t.code_attempts + 1
		  from roux_email_credential c
		 where c.address = $1 and t.credential_id = c.id
		   and t.code_attempts < $2 and t.expires_at > $3
		returning t.credential_id, t.code_hash`,
		address, maxAttempts, now).Scan(&id, &codeHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, "", false, nil
	}
	return id, codeHash, err == nil, err
}

// consumeCode spends a correct code: deleting the row ends the link too, and of
// two concurrent correct submissions only one deletes it.
func (s store) consumeCode(ctx context.Context, credentialID uuid.UUID, codeHash string, now time.Time) (bool, error) {
	tag, err := s.pool.Exec(ctx,
		`delete from roux_email_link_token where credential_id = $1 and code_hash = $2 and expires_at > $3`,
		credentialID, codeHash, now)
	return tag.RowsAffected() > 0, err
}

func (s store) deleteToken(ctx context.Context, credentialID uuid.UUID, tokenHash string) error {
	_, err := s.pool.Exec(ctx,
		`delete from roux_email_link_token where credential_id = $1 and token_hash = $2`, credentialID, tokenHash)
	return err
}

func (s store) count(ctx context.Context, db authn.DBTX, identityID uuid.UUID) (int64, error) {
	var n int64
	err := db.QueryRow(ctx, `
		select count(*) from roux_email_credential c
		  join roux_credential_identity ci on ci.credential_id = c.id
		 where ci.identity_id = $1`, identityID).Scan(&n)
	return n, err
}
