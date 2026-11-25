// Package authn is who you are: sessions, and the sign-in methods that start them, under
// /api/roux/auth. Its paths, JSON, error format and CSRF scheme are what roux-web's auth client
// calls (contracts/ holds the shared shapes): change them together.
//
// The core serves
//
//	GET  /api/roux/auth/sign-in   which sign-in methods are on (public), merged from the Methods
//	GET  /api/roux/auth/me        the signed-in identity, or 401 not-signed-in
//	POST /api/roux/auth/logout    ends the session, clears the cookies, 204
//
// plus the sessions behind them (roux_session, one cookie per browser, checked
// against the database on every request). Sign-in methods plug in as Methods:
// emaillink is the first; passkeys, providers, API keys and the account endpoints
// follow. Every error under the base path is roux's problem format (see render)
// and every endpoint follows roux's CSRF scheme (see csrf).
//
// With no Pool the core is the signed-out world only: nobody can sign in.
package authn

import (
	"context"
	"embed"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/pgdb"
)

// BasePath is where sign-in and the account endpoints live.
const BasePath = "/api/roux/auth"

//go:embed migrations/*.sql
var migrations embed.FS

// Migration is the identity and session schema. Pass it to pgdb.Migrate along
// with every sign-in method's own.
var Migration = pgdb.Migration{Name: "roux-authn", FS: migrations, Dir: "migrations"}

// Config configures the endpoints.
type Config struct {
	// Pool stores identities and sessions. Without it nobody can sign in.
	Pool *pgxpool.Pool
	// SessionTimeout is how long a session may sit unused before it ends
	// (the session's idle timeout); default 30 minutes.
	SessionTimeout time.Duration
	// SessionLifetime is the longest a session lasts, however busy: past it the person signs in
	// again, so a stolen cookie kept warm still dies. Default 12 hours.
	SessionLifetime time.Duration
	// RecentSignIn is how long a sign-in stays recent enough for sensitive
	// actions (who.security.recent-sign-in); default 10 minutes. /api/roux/auth/me reports
	// when it ends.
	RecentSignIn time.Duration
	// Clock is the time source; default time.Now.
	Clock func() time.Time
	// Permissions says what an identity may do (see package rbac). Without it
	// nobody holds any permission.
	Permissions PermissionsFunc
	// SecureCookies marks every cookie Secure whatever the request looks like. Set it when the
	// app is served over HTTPS (so, behind a load balancer or ingress that ends TLS, where the
	// server itself sees plain HTTP). Left false, a cookie is Secure only when the request
	// arrived over TLS, which is right for local development and for a server that ends TLS itself.
	SecureCookies bool
}

// PermissionsFunc returns the permissions an identity holds right now.
type PermissionsFunc func(ctx context.Context, identityID uuid.UUID) ([]string, error)

// Provider is a sign-in provider the page should draw a button for.
type Provider struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// SignInOptions is the body of GET /api/roux/auth/sign-in: which ways of signing in are on.
type SignInOptions struct {
	Email     bool       `json:"email"`
	Passkey   bool       `json:"passkey"`
	Providers []Provider `json:"providers"`
}

// Method is one way of signing in. Each Method passed to Register contributes to
// the sign-in options and mounts its own endpoints, so a method that is not
// registered adds nothing: email and passkey stay false and providers stay empty.
type Method interface {
	Contribute(o *SignInOptions)
	// Mount registers the method's endpoints on the host.
	Mount(h *Host) error
}

// Host is what a sign-in method gets to build on: CSRF-guarded routes under the
// base path, the database, the clock, and sessions.
type Host struct {
	kit             *api.Kit
	basePath        string
	secureCookies   bool
	store           store
	clock           func() time.Time
	sessionTimeout  time.Duration
	sessionLifetime time.Duration
	recentSignIn    time.Duration
	permissions     PermissionsFunc
	counters        []Counter
	authenticators  []headerAuthenticator
	onSignedIn      []func(ctx context.Context, identityID uuid.UUID, at time.Time) error
}

// Handle registers "METHOD /path" (relative to the base path) behind roux's CSRF check.
func (h *Host) Handle(pattern string, fn api.HandlerFunc) { h.kit.Handle(pattern, h.csrf(fn)) }

// SecureCookie says whether a cookie set in answer to the request carries the Secure flag:
// always when the host was configured with SecureCookies, else when the request came over
// TLS. Every sign-in method sets its cookies through this, so they cannot disagree.
func (h *Host) SecureCookie(r *http.Request) bool { return h.secureCookies || r.TLS != nil }

// BasePath is where sign-in's endpoints are mounted (BasePath).
func (h *Host) BasePath() string { return h.basePath }

// PrincipalOf is whoever the request's session belongs to, or nil when the request is not
// signed in. A route that behaves one way signed in and another signed out uses it.
func (h *Host) PrincipalOf(r *http.Request) (*Principal, error) { return h.principal(r) }

// Pool is the database the host was configured with.
func (h *Host) Pool() *pgxpool.Pool { return h.store.pool }

// Now reads the host's clock.
func (h *Host) Now() time.Time { return h.now() }

func (h *Host) now() time.Time { return h.clock().UTC() }

// AddCounter registers a credential counter for /api/roux/auth/me's "credentials".
func (h *Host) AddCounter(c Counter) { h.counters = append(h.counters, c) }

// Register mounts roux's endpoints on mux under cfg.BasePath and mounts methods.
// The returned Host guards the application's own routes (see Host.Guard).
func Register(mux *api.Mux, cfg Config, methods ...Method) (*Host, error) {
	base := BasePath
	h := &Host{
		kit:             mux.Kit(base, render),
		basePath:        base,
		secureCookies:   cfg.SecureCookies,
		store:           store{pool: cfg.Pool},
		clock:           cfg.Clock,
		sessionTimeout:  cfg.SessionTimeout,
		sessionLifetime: cfg.SessionLifetime,
		recentSignIn:    cfg.RecentSignIn,
		permissions:     cfg.Permissions,
	}
	if h.clock == nil {
		h.clock = time.Now
	}
	if h.sessionTimeout <= 0 {
		h.sessionTimeout = 30 * time.Minute
	}
	if h.sessionLifetime <= 0 {
		h.sessionLifetime = 12 * time.Hour
	}
	if h.recentSignIn <= 0 {
		h.recentSignIn = 10 * time.Minute
	}

	for _, m := range methods {
		if err := m.Mount(h); err != nil {
			return nil, err
		}
	}
	h.Handle("GET /sign-in", signIn(methods))
	h.Handle("GET /me", h.me)
	h.Handle("POST /logout", h.logout)
	h.mountSessions()
	return h, nil
}

func signIn(methods []Method) api.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		opts := SignInOptions{Providers: []Provider{}}
		for _, m := range methods {
			m.Contribute(&opts)
		}
		if opts.Providers == nil {
			opts.Providers = []Provider{}
		}
		return api.JSON(w, http.StatusOK, opts)
	}
}
