package authn

import (
	"context"
	"net/http"
	"sort"

	"github.com/google/uuid"
)

// MethodAPIKey is how /api/roux/auth/me and Principal.Method spell a request an API key signed in.
const MethodAPIKey = "api-key"

// MethodJWT is how /api/roux/auth/me and Principal.Method spell a request a bearer token signed in.
const MethodJWT = "jwt"

// headerAuthenticator signs a request in by a header, with no session.
type headerAuthenticator struct {
	header string
	fn     func(r *http.Request, value string) (*Principal, error)
}

// AddAuthenticator lets a header sign a request in with no session (an API key). fn gets the
// header's value and returns who it stands for, or an error when it is refused: return
// SignInFailed(), the one answer every failed sign-in gives, and log the reason yourself.
// The sign-in lasts for the request: no session, no cookie, and no CSRF token needed (see
// csrf). A request that already has a live session ignores the header. A key is wrong
// everywhere a request is looked at (Guard, Open, HandleSigned): 401 at once, even on an
// endpoint that would let an anonymous caller in.
func (h *Host) AddAuthenticator(header string, fn func(r *http.Request, value string) (*Principal, error)) {
	h.authenticators = append(h.authenticators, headerAuthenticator{header: header, fn: fn})
}

// carriesHeaderBesideSession: some credential header (an API key) is on the request.
func (h *Host) carriesHeaderBesideSession(r *http.Request) bool {
	for _, a := range h.authenticators {
		if r.Header.Get(a.header) != "" {
			return true
		}
	}
	return false
}

// carriesCredentialHeader: a credential header and no session cookie, so the request is a
// client acting for itself, not a browser acting for a person.
func (h *Host) carriesCredentialHeader(r *http.Request) bool {
	if c, err := r.Cookie(SessionCookie); err == nil && c.Value != "" {
		return false
	}
	return h.carriesHeaderBesideSession(r)
}

// authenticateHeader runs the first authenticator whose header is present.
func (h *Host) authenticateHeader(r *http.Request) (*Principal, error) {
	for _, a := range h.authenticators {
		if v := r.Header.Get(a.header); v != "" {
			p, err := a.fn(r, v)
			if err != nil {
				return nil, err
			}
			if p != nil {
				p.Permissions = append([]string{}, p.Permissions...)
			}
			return p, nil
		}
	}
	return nil, nil
}

// PermissionsOf is what the identity may do right now, sorted. A key's scopes are
// intersected with it at every request, so taking a role from the owner takes the
// permission from every key they hold at once.
func (h *Host) PermissionsOf(ctx context.Context, identityID uuid.UUID) ([]string, error) {
	if h.permissions == nil {
		return []string{}, nil
	}
	perms, err := h.permissions(ctx, identityID)
	if err != nil {
		return nil, err
	}
	perms = append([]string{}, perms...)
	sort.Strings(perms)
	return perms, nil
}
