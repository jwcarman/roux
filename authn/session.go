package authn

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/api"
)

// SessionCookie is the browser session's cookie. Its value is 256 random bits;
// only the SHA-256 of it is stored.
const SessionCookie = "SESSION"

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func newSessionToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func (h *Host) sessionCookie(r *http.Request, value string) *http.Cookie {
	return &http.Cookie{
		Name:     SessionCookie,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		Secure:   h.SecureCookie(r),
		SameSite: http.SameSiteLaxMode,
	}
}

// authenticate returns the live session this request belongs to, or nil.
func (h *Host) authenticate(r *http.Request) (*Session, error) {
	if h.store.pool == nil {
		return nil, nil
	}
	c, err := r.Cookie(SessionCookie)
	if err != nil || c.Value == "" {
		return nil, nil
	}
	hash, now := hashToken(c.Value), h.now()
	sess, err := h.store.authenticate(r.Context(), hash, now, h.sessionTimeout, h.sessionLifetime)
	if err != nil || sess != nil {
		return sess, err
	}
	// Not live. If a session by that cookie is still open, it failed a check (it sat
	// idle too long, its identity was disabled, its credential was revoked): end it,
	// so putting the identity back does not bring a dead session back to life. For
	// an unknown cookie this updates no rows.
	if err := h.store.end(r.Context(), hash, now); err != nil {
		slog.WarnContext(r.Context(), "could not end a failed session", "err", err)
	}
	return nil, nil
}

// CreateSession opens a session for the identity, signed in through the credential,
// and returns the value of the session cookie that stands for it. It is what a
// sign-in method does once it has proved who someone is; StartSession is that plus
// the cookies. Only the cookie's hash is stored.
func (h *Host) CreateSession(ctx context.Context, identityID, credentialID uuid.UUID, method, userAgent string) (string, error) {
	token, err := newSessionToken()
	if err != nil {
		return "", err
	}
	now := h.now()
	if err := h.store.start(ctx, newSession{
		IdentityID: identityID, CredentialID: credentialID, Method: method,
		UserAgent: userAgent, TokenHash: hashToken(token), Now: now,
	}, max(deadSessionsKept, h.sessionTimeout)); err != nil {
		return "", err
	}
	for _, fn := range h.onSignedIn {
		if err := fn(ctx, identityID, now); err != nil {
			slog.WarnContext(ctx, "after-sign-in hook failed", "err", err)
		}
	}
	return token, nil
}

// StartSession signs the identity in: it ends any session this browser already
// had, makes a new one under a fresh random cookie (so a cookie planted before
// sign-in is worthless: no session fixation), and rotates the CSRF token.
func (h *Host) StartSession(w http.ResponseWriter, r *http.Request, identityID, credentialID uuid.UUID, method string) error {
	ctx := r.Context()
	if old, err := r.Cookie(SessionCookie); err == nil && old.Value != "" {
		if err := h.store.end(ctx, hashToken(old.Value), h.now()); err != nil {
			return err
		}
	}
	token, err := h.CreateSession(ctx, identityID, credentialID, method, r.UserAgent())
	if err != nil {
		return err
	}
	http.SetCookie(w, h.sessionCookie(r, token))
	h.setCSRFCookie(w, r, newToken())
	return nil
}

// endSession ends the session this request belongs to, if any, and clears the cookie.
func (h *Host) endSession(w http.ResponseWriter, r *http.Request) error {
	c, err := r.Cookie(SessionCookie)
	if err != nil || c.Value == "" {
		return nil
	}
	if h.store.pool != nil {
		if err := h.store.end(r.Context(), hashToken(c.Value), h.now()); err != nil {
			return err
		}
	}
	cleared := h.sessionCookie(r, "")
	cleared.MaxAge = -1
	http.SetCookie(w, cleared)
	return nil
}

// Counter counts one kind of sign-in credential an identity holds, for
// /api/roux/auth/me's "credentials". Each sign-in method contributes its own.
type Counter struct {
	Kind string
	// Count says how many of this kind the identity holds; db is a pool, or the
	// transaction of a removal that is checking it is not the last way in.
	Count func(ctx context.Context, db DBTX, identityID uuid.UUID) (int64, error)
}

func (h *Host) credentialCounts(ctx context.Context, db DBTX, identityID uuid.UUID) (map[string]int64, error) {
	counts := make(map[string]int64, len(h.counters))
	for _, c := range h.counters {
		n, err := c.Count(ctx, db, identityID)
		if err != nil {
			return nil, err
		}
		counts[c.Kind] = n
	}
	return counts, nil
}

// meResponse is roux's GET /api/roux/auth/me answer, with roux's names and its nulls kept.
type meResponse struct {
	IdentityID        string           `json:"identityId"`
	Permissions       []string         `json:"permissions"`
	SignInMethod      *string          `json:"signInMethod"`
	RecentSignInUntil *string          `json:"recentSignInUntil"`
	Credentials       map[string]int64 `json:"credentials"`
}

func (h *Host) me(w http.ResponseWriter, r *http.Request) error {
	p, err := h.principal(r)
	if err != nil {
		return err
	}
	if p == nil {
		return notSignedIn()
	}
	counts, err := h.credentialCounts(r.Context(), h.store.pool, p.IdentityID)
	if err != nil {
		return err
	}
	method := p.Method
	until := p.SignedInAt.Add(h.recentSignIn).UTC().Format(time.RFC3339Nano)
	return api.JSON(w, http.StatusOK, meResponse{
		IdentityID:        p.IdentityID.String(),
		Permissions:       p.Permissions,
		SignInMethod:      &method,
		RecentSignInUntil: &until,
		Credentials:       counts,
	})
}

func (h *Host) logout(w http.ResponseWriter, r *http.Request) error {
	if err := h.endSession(w, r); err != nil {
		return err
	}
	h.clearCSRF(w, r)
	w.WriteHeader(http.StatusNoContent)
	return nil
}
