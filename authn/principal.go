package authn

import (
	"context"
	"fmt"
	"net/http"
	"slices"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/problem"
)

// Principal is who is signed in and what they may do, as of this request.
type Principal struct {
	IdentityID   uuid.UUID
	CredentialID uuid.UUID
	// SessionID is who's id for the session (not the cookie): what the account endpoints show.
	SessionID uuid.UUID
	// Permissions is sorted, and never nil.
	Permissions []string
	// Method is how this session signed in ("email-link", "email-code").
	Method string
	// SignedInAt is when this session signed in; zero for a request a key signed in, which
	// therefore never passes a recent-sign-in check.
	SignedInAt time.Time
	// Browser is true when a browser session signed this request in on its own: no API key
	// beside the cookie. Account endpoints that only a person at a browser may use check it.
	Browser bool
}

// Has reports whether the principal holds the permission.
func (p *Principal) Has(permission string) bool { return slices.Contains(p.Permissions, permission) }

type principalKey struct{}

// PrincipalFrom returns who is signed in, from the context of a request that went
// through Host.Guard; nil otherwise.
func PrincipalFrom(ctx context.Context) *Principal {
	p, _ := ctx.Value(principalKey{}).(*Principal)
	return p
}

// WithPrincipal returns a context in which p is who is acting: what Guard does for a
// request, for code that acts on someone's behalf outside one (a test, a job).
func WithPrincipal(ctx context.Context, p *Principal) context.Context {
	return context.WithValue(ctx, principalKey{}, p)
}

// principal resolves the request's session and the permissions of whoever it
// belongs to, freshly: a role change applies on the very next request.
func (h *Host) principal(r *http.Request) (*Principal, error) {
	sess, err := h.authenticate(r)
	if err != nil {
		return nil, err
	}
	if sess == nil {
		return h.authenticateHeader(r)
	}
	perms := []string{}
	if h.permissions != nil {
		if perms, err = h.permissions(r.Context(), sess.IdentityID); err != nil {
			return nil, err
		}
		perms = append([]string{}, perms...)
		sort.Strings(perms)
	}
	return &Principal{
		IdentityID: sess.IdentityID, CredentialID: sess.CredentialID, SessionID: sess.ID,
		Permissions: perms, Method: sess.Method, SignedInAt: sess.SignedInAt,
		Browser: !h.carriesHeaderBesideSession(r),
	}, nil
}

// Guard protects one of the application's routes: CSRF-checked like who's own, then
// signed in (401 "Sign in to continue"), then holding the permission when one is
// named (403 "You do not have permission"). The handler finds who is calling with
// PrincipalFrom. Name no permission to ask only that the caller be signed in.
func (h *Host) Guard(permission string, fn api.HandlerFunc) api.HandlerFunc {
	return h.csrf(func(w http.ResponseWriter, r *http.Request) error {
		p, err := h.principal(r)
		if err != nil {
			return err
		}
		if p == nil {
			return problem.Unauthorized()
		}
		if permission != "" && !p.Has(permission) {
			return problem.Forbidden()
		}
		return fn(w, r.WithContext(context.WithValue(r.Context(), principalKey{}, p)))
	})
}

// Open is for a route anyone may call, signed in or not (the theme, which the page
// needs before sign-in): it only takes part in CSRF, so the cookie is always issued
// and an unsafe request must carry the token. A signed-in caller is still found by
// PrincipalFrom.
func (h *Host) Open(fn api.HandlerFunc) api.HandlerFunc {
	return h.csrf(func(w http.ResponseWriter, r *http.Request) error {
		if p, err := h.principal(r); err != nil {
			return err
		} else if p != nil {
			r = r.WithContext(context.WithValue(r.Context(), principalKey{}, p))
		}
		return fn(w, r)
	})
}

// RequireRecentSignIn refuses a caller who signed in longer ago than the recent
// window, with who's reauthentication-required (401): the person signs in again and
// retries. It is for actions only a fresh sign-in should be able to take.
func (h *Host) RequireRecentSignIn(ctx context.Context) error {
	p := PrincipalFrom(ctx)
	if p == nil {
		return problem.Unauthorized()
	}
	if p.Method == MethodJWT {
		return h.bearerRecent(p)
	}
	if h.now().After(p.SignedInAt.Add(h.recentSignIn)) {
		e := problem.New(http.StatusUnauthorized, "Sign in again to continue")
		e.Type = errorTypePrefix + "reauthentication-required"
		e.Code = "reauthentication-required"
		return e
	}
	return nil
}

// EndAllSessions ends every session the identity has, on every device.
func (h *Host) EndAllSessions(ctx context.Context, identityID uuid.UUID) error {
	_, err := h.store.pool.Exec(ctx,
		`update roux_session set ended_at = $2 where identity_id = $1 and ended_at is null`, identityID, h.now())
	return err
}

// OnSignedIn registers a function to run after each sign-in, with the identity and
// when. A failure is logged, never fails the sign-in.
func (h *Host) OnSignedIn(fn func(ctx context.Context, identityID uuid.UUID, at time.Time) error) {
	h.onSignedIn = append(h.onSignedIn, fn)
}

// HandleSigned registers a route under who's base path (relative, like Handle) for a
// person at a browser: CSRF-checked, then 401 not-signed-in in who's format, then 403
// browser-session-required for a request an API key signed in (or one with a key beside the
// session cookie), then fn with who is calling. It is the guard every /who/me/* endpoint
// uses, so a leaked key can never change how someone signs in.
func (h *Host) HandleSigned(pattern string, fn func(w http.ResponseWriter, r *http.Request, p *Principal) error) {
	h.HandleAny(pattern, func(w http.ResponseWriter, r *http.Request, p *Principal) error {
		if !p.Browser {
			return BrowserSessionRequired()
		}
		return fn(w, r, p)
	})
}

// HandleAny is HandleSigned for an endpoint that a request signed in by any means may call,
// an API key included: the caller checks p.Method if it cares.
func (h *Host) HandleAny(pattern string, fn func(w http.ResponseWriter, r *http.Request, p *Principal) error) {
	h.Handle(pattern, func(w http.ResponseWriter, r *http.Request) error {
		p, err := h.principal(r)
		if err != nil {
			return err
		}
		if p == nil {
			return notSignedIn()
		}
		return fn(w, r.WithContext(WithPrincipal(r.Context(), p)), p)
	})
}

// RequireRecent is RequireRecentSignIn for a principal in hand.
func (h *Host) RequireRecent(p *Principal) error {
	return h.RequireRecentSignIn(WithPrincipal(context.Background(), p))
}

// RemoveIfNotLast runs remove only if the identity holds another way to sign in. The
// count and the removal happen in one transaction that locks the identity's row, so two
// removals at once cannot both pass the check; the last way in is refused with
// LastCredential. remove runs on the transaction.
func (h *Host) RemoveIfNotLast(ctx context.Context, identityID uuid.UUID, remove func(ctx context.Context, tx pgx.Tx) error) error {
	tx, err := h.store.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // a no-op after commit
	var locked int
	if err := tx.QueryRow(ctx, `select 1 from roux_identity where id = $1 for update`, identityID).Scan(&locked); err != nil {
		return err
	}
	counts, err := h.credentialCounts(ctx, tx, identityID)
	if err != nil {
		return err
	}
	var total int64
	for _, n := range counts {
		total += n
	}
	if total <= 1 {
		return LastCredential()
	}
	if err := remove(ctx, tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// bearerRecent is the recent sign-in rule for a bearer token (OpenID Connect Core, RFC 9470): the
// token's auth_time, which stays the same when the token is refreshed, is when the person last
// signed in at the authorization server. Recent enough: allowed. Older: 401 with the step-up
// challenge, so the client has the person sign in again with max_age. No auth_time: 403, since
// signing in again would bring another token without it.
func (h *Host) bearerRecent(p *Principal) error {
	if p.SignedInAt.IsZero() {
		return problem.Forbidden()
	}
	// A time a little in the future, from clock skew, counts as now.
	if h.now().After(p.SignedInAt.Add(h.recentSignIn)) {
		e := problem.New(http.StatusUnauthorized, "Sign in again to continue")
		e.Type = errorTypePrefix + "reauthentication-required"
		e.Code = "reauthentication-required"
		return e.WithHeader("WWW-Authenticate", fmt.Sprintf(
			`Bearer error="insufficient_user_authentication", error_description="A more recent sign-in is required", max_age=%d`,
			int(h.recentSignIn.Seconds())))
	}
	return nil
}
