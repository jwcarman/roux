package authn

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"net/http"
	"net/url"
	"strings"

	"github.com/jwcarman/roux/api"
)

// CSRF follows who's scheme (Spring Security's csrf.spa()): a script-readable
// XSRF-TOKEN cookie that the page sends back in an X-XSRF-TOKEN header on every
// unsafe request. The cookie is loaded on every request, signed in or not, so
// the page always has a token to send.
const (
	csrfCookie = "XSRF-TOKEN"
	csrfHeader = "X-XSRF-TOKEN"
)

func newToken() string {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		panic("authn: no randomness for a CSRF token: " + err.Error())
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

func unsafe(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions, http.MethodTrace:
		return false
	}
	return true
}

func (h *Host) cookieFor(r *http.Request, value string) *http.Cookie {
	return &http.Cookie{
		Name:     csrfCookie,
		Value:    value,
		Path:     "/",
		HttpOnly: false, // the page must read it
		Secure:   h.SecureCookie(r),
		SameSite: http.SameSiteLaxMode,
	}
}

// csrf guards a handler. It issues the cookie when the request has none, and
// refuses an unsafe request whose header does not match the cookie with
// 403 invalid-csrf-token (a refused request still gets a cookie, so the client
// can retry with a token). A request with no session cookie that carries a
// credential header (an API key) is not a browser acting for someone: a page on
// another site cannot set a custom header without a CORS preflight, so the header is
// its own proof, and the request needs no CSRF token (the handler still refuses a key
// that is wrong).
func (h *Host) csrf(next api.HandlerFunc) api.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		if unsafe(r.Method) && h.carriesCredentialHeader(r) {
			return next(w, r)
		}
		var token string
		if c, err := r.Cookie(csrfCookie); err == nil {
			token, _ = url.QueryUnescape(c.Value)
		}
		fresh := token == ""
		if fresh {
			token = newToken()
			http.SetCookie(w, h.cookieFor(r, token))
		}
		if unsafe(r.Method) {
			sent := r.Header.Get(csrfHeader)
			if fresh || subtle.ConstantTimeCompare([]byte(sent), []byte(token)) != 1 {
				return invalidCSRF()
			}
		}
		return next(w, r)
	}
}

// setCSRFCookie issues the cookie, replacing any XSRF-TOKEN the response already
// set (sign-in rotates the token, and a second Set-Cookie for the same name
// would leave the browser guessing which to keep).
func (h *Host) setCSRFCookie(w http.ResponseWriter, r *http.Request, token string) {
	header := w.Header()
	const setCookie = "Set-Cookie"
	kept := header[setCookie][:0:0]
	for _, v := range header[setCookie] {
		if !strings.HasPrefix(v, csrfCookie+"=") {
			kept = append(kept, v)
		}
	}
	if len(kept) == 0 {
		header.Del(setCookie)
	} else {
		header[setCookie] = kept
	}
	http.SetCookie(w, h.cookieFor(r, token))
}

// clearCSRF deletes the cookie, as who's logout does; the client fetches a
// fresh one (GET /me sets it) for whoever signs in next.
func (h *Host) clearCSRF(w http.ResponseWriter, r *http.Request) {
	c := h.cookieFor(r, "")
	c.MaxAge = -1
	http.SetCookie(w, c)
}
