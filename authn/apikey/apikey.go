// Package apikey is API key authentication (who-apikey): a client sends a key in a header and
// is signed in for that request, with no session, no cookie and no CSRF token. Every key
// expires, holds only the permissions it was made for, and records when it was last used. Only
// a key's SHA-256 is stored: the key is shown once, when it is made.
//
// Endpoints under who's base path, for the caller's own keys (a person at a browser; a key never
// lists, makes, rotates or revokes keys, so a leaked key cannot make itself permanent):
//
//	GET    /api/roux/auth/me/api-keys                  [{id, name, scopes, createdAt, expiresAt, lastUsedAt}], by name
//	POST   /api/roux/auth/me/api-keys                  {"name","lifetime":"P90D","scopes":[...]} -> 201 {id,name,scopes,expiresAt,key}
//	POST   /api/roux/auth/me/api-keys/{id}/rotations   {"overlap":"PT1H"} -> 201, the new key; the old one lives on for the overlap
//	DELETE /api/roux/auth/me/api-keys/{id}             204: the next request with the key is refused
//	GET    /api/roux/auth/me/api-keys/current          the key that signed this request in (404 when none did)
//
// A key's scopes are permissions its owner held when it was made. At each request the key gets its
// scopes intersected with its owner's permissions at that moment, so taking a role from the owner
// takes the permission from every one of their keys at once.
package apikey

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"slices"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/pgdb"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Migration is the API key schema; it runs after who's.
var Migration = pgdb.Migration{Name: "roux-authn-apikey", FS: migrations, Dir: "migrations", After: []string{"roux-authn"}}

// Defaults.
const (
	DefaultPrefix           = "roux_"
	DefaultHeader           = "X-API-Key"
	DefaultMaxLifetime      = 365 * 24 * time.Hour
	DefaultLastUsedInterval = 5 * time.Minute
	// MaxOverlap is the longest an old key may live on after a rotation.
	MaxOverlap = 7 * 24 * time.Hour
	maxText    = 255
)

// Config configures API keys.
type Config struct {
	// Prefix starts every key, so a secret scanner can find a leaked one: letters, digits and
	// underscores, 2 to 20 characters, ending in an underscore (default "roux_"). Keys are
	// looked up by their hash, so changing it leaves existing keys working.
	Prefix string
	// Header carries the key (default X-API-Key).
	Header string
	// MaxLifetime is the longest a key may be made to last (default 365 days).
	MaxLifetime time.Duration
	// LastUsedInterval is how often a key's last use is written, at most (default 5 minutes):
	// a busy key costs one write per interval, not one per request.
	LastUsedInterval time.Duration
	// Clock is the time source; default time.Now.
	Clock func() time.Time
	// Notify tells the owner a key's secret was made, by making or rotating it (see
	// emaillink.Method.APIKeyMade). It runs after the answer; a failure is logged, never fails
	// the key.
	Notify func(ctx context.Context, identityID uuid.UUID, name string) error
}

var prefixPattern = regexp.MustCompile(`^[A-Za-z0-9_]{1,19}_$`)

// Method is API key authentication. Pass it to authn.Register.
type Method struct {
	cfg  Config
	pool *pgxpool.Pool
	host *authn.Host
	wg   sync.WaitGroup // the notices still being sent
}

// Wait blocks until the "API key made" notices still being sent are done.
func (m *Method) Wait() { m.wg.Wait() }

// notify tells the owner a key's secret was made, after the answer.
func (m *Method) notify(ctx context.Context, identityID uuid.UUID, name string) {
	if m.cfg.Notify == nil {
		return
	}
	ctx = context.WithoutCancel(ctx)
	m.wg.Go(func() {
		if err := m.cfg.Notify(ctx, identityID, name); err != nil {
			slog.WarnContext(ctx, "could not send the API-key-made notice", "err", err)
		}
	})
}

// New validates the configuration (naming the fix in any error) and returns the method.
func New(cfg Config) (*Method, error) {
	var errs []error
	if cfg.Prefix == "" {
		cfg.Prefix = DefaultPrefix
	}
	if !prefixPattern.MatchString(cfg.Prefix) || len(cfg.Prefix) < 2 {
		errs = append(errs, fmt.Errorf("apikey: Prefix %q must be letters, digits and underscores, 2 to 20 characters, ending in _", cfg.Prefix))
	}
	if cfg.Header == "" {
		cfg.Header = DefaultHeader
	}
	if cfg.MaxLifetime <= 0 {
		cfg.MaxLifetime = DefaultMaxLifetime
	}
	if cfg.LastUsedInterval <= 0 {
		cfg.LastUsedInterval = DefaultLastUsedInterval
	}
	if cfg.Clock == nil {
		cfg.Clock = time.Now
	}
	if err := errors.Join(errs...); err != nil {
		return nil, fmt.Errorf("apikey: %w", err)
	}
	return &Method{cfg: cfg}, nil
}

func (m *Method) now() time.Time { return m.cfg.Clock().UTC() }

// Contribute adds nothing to the sign-in page: a key is for a client, not a person.
func (m *Method) Contribute(*authn.SignInOptions) {
	// nothing to offer on the page: a key is made in the account settings, and used by a client
}

// Mount lets the header sign requests in and registers the endpoints.
func (m *Method) Mount(h *authn.Host) error {
	m.host, m.pool = h, h.Pool()
	h.AddAuthenticator(m.cfg.Header, m.authenticate)
	m.mountEndpoints(h)
	return nil
}

// authenticate signs a request in by its key. Every refusal is the one answer every failed
// sign-in gives; the reason goes to the debug log, never to the client, and the key never to
// any log.
func (m *Method) authenticate(r *http.Request, key string) (*authn.Principal, error) {
	ctx := r.Context()
	refuse := func(why string) (*authn.Principal, error) {
		slog.DebugContext(ctx, "api key refused", "why", why)
		return nil, authn.SignInFailed()
	}
	if !wellFormed(m.cfg.Prefix, key) {
		return refuse("malformed")
	}
	var (
		id, identity uuid.UUID
		scopes       []string
		expires      time.Time
		lastUsed     *time.Time
		status       string
	)
	err := m.pool.QueryRow(ctx, `
		select k.id, k.identity_id, k.scopes, k.expires_at, k.last_used_at, i.status
		  from roux_api_key k join roux_identity i on i.id = k.identity_id
		 where k.key_hash = $1`, hashOf(key)).Scan(&id, &identity, &scopes, &expires, &lastUsed, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return refuse("unknown")
	}
	if err != nil {
		return nil, err
	}
	now := m.now()
	switch {
	case !expires.After(now):
		return refuse("expired")
	case status != authn.StatusActive:
		return refuse("inactive identity")
	}
	held, err := m.host.PermissionsOf(ctx, identity)
	if err != nil {
		return nil, err
	}
	perms := []string{}
	for _, p := range held {
		if slices.Contains(scopes, p) {
			perms = append(perms, p)
		}
	}
	if lastUsed == nil || now.Sub(*lastUsed) >= m.cfg.LastUsedInterval {
		// Atomic: of many requests at once, one writes. A failure never refuses the key.
		if _, err := m.pool.Exec(ctx, `
			update roux_api_key set last_used_at = $2
			 where id = $1 and (last_used_at is null or last_used_at <= $3)`,
			id, now, now.Add(-m.cfg.LastUsedInterval)); err != nil {
			slog.WarnContext(ctx, "could not record an API key's last use", "err", err)
		}
	}
	return &authn.Principal{IdentityID: identity, CredentialID: id, Permissions: perms, Method: authn.MethodAPIKey}, nil
}
