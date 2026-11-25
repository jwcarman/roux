package authn_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/problem"
	"github.com/jwcarman/roux/spa"
)

type fakeMethod func(o *authn.SignInOptions)

func (f fakeMethod) Contribute(o *authn.SignInOptions) { f(o) }
func (f fakeMethod) Mount(*authn.Host) error           { return nil }

func app(t *testing.T, cfg authn.Config, methods ...authn.Method) http.Handler {
	t.Helper()
	mux := api.NewMux()
	mux.Handle("GET /api/hello", func(w http.ResponseWriter, r *http.Request) error { return api.JSON(w, 200, "hi") })
	if _, err := authn.Register(mux, cfg, methods...); err != nil {
		t.Fatal(err)
	}
	// A front end behind it all, to prove /api/roux/auth paths never fall through to it.
	fsys := fstest.MapFS{"index.html": {Data: []byte(`<title>__APP_NAME__</title><script nonce="__CSP_NONCE__">__APP_THEME__ __APP_CONTEXT__</script>`)}}
	if err := spa.Register(mux, spa.Config{FS: fsys}); err != nil {
		t.Fatal(err)
	}
	return mux
}

type result struct {
	*httptest.ResponseRecorder
	cookie *http.Cookie
}

func send(h http.Handler, method, target string, mutate ...func(*http.Request)) result {
	req := httptest.NewRequest(method, target, nil)
	for _, m := range mutate {
		m(req)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	res := result{ResponseRecorder: rec}
	for _, c := range rec.Result().Cookies() {
		if c.Name == "XSRF-TOKEN" {
			res.cookie = c
		}
	}
	return res
}

func withCSRF(token string) func(*http.Request) {
	return func(r *http.Request) {
		r.AddCookie(&http.Cookie{Name: "XSRF-TOKEN", Value: token})
		r.Header.Set("X-XSRF-TOKEN", token)
	}
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatalf("body %q: %v", rec.Body, err)
	}
	return m
}

func TestSignInOptionsWithNoMethods(t *testing.T) {
	res := send(app(t, authn.Config{}), "GET", "/api/roux/auth/sign-in")
	if res.Code != 200 || res.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("%d %v", res.Code, res.Header())
	}
	// Exactly roux's shape and key order, with nothing on and an empty (not null) list.
	if got, want := strings.TrimSpace(res.Body.String()), `{"email":false,"passkey":false,"providers":[]}`; got != want {
		t.Fatalf("body = %s, want %s", got, want)
	}
}

func TestSignInOptionsAreMergedFromMethods(t *testing.T) {
	h := app(t, authn.Config{},
		fakeMethod(func(o *authn.SignInOptions) { o.Email = true }),
		fakeMethod(func(o *authn.SignInOptions) { o.Passkey = true }),
		fakeMethod(func(o *authn.SignInOptions) {
			o.Providers = append(o.Providers, authn.Provider{ID: "github", Name: "GitHub"})
		}),
		fakeMethod(func(o *authn.SignInOptions) {
			o.Providers = append(o.Providers, authn.Provider{ID: "google", Name: "Google"})
		}),
	)
	got := strings.TrimSpace(send(h, "GET", "/api/roux/auth/sign-in").Body.String())
	want := `{"email":true,"passkey":true,"providers":[{"id":"github","name":"GitHub"},{"id":"google","name":"Google"}]}`
	if got != want {
		t.Fatalf("body = %s, want %s", got, want)
	}
}

func TestMeWhenSignedOut(t *testing.T) {
	res := send(app(t, authn.Config{}), "GET", "/api/roux/auth/me")
	if res.Code != 401 || res.Header().Get("Content-Type") != problem.ContentType || res.Header().Get("Roux-Error") != "not-signed-in" {
		t.Fatalf("%d %v", res.Code, res.Header())
	}
	body := decode(t, res.ResponseRecorder)
	want := map[string]any{
		"type": "urn:roux:error:not-signed-in", "title": "Unauthorized", "status": float64(401),
		"detail": "Not signed in", "code": "not-signed-in",
	}
	for k, v := range want {
		if body[k] != v {
			t.Errorf("%s = %v, want %v", k, body[k], v)
		}
	}
	if _, has := body["instance"]; has {
		t.Errorf("roux's body has no instance member: %v", body)
	}
	// /me issues the CSRF cookie whether or not anyone is signed in.
	if res.cookie == nil {
		t.Fatal("GET /api/roux/auth/me did not issue the XSRF-TOKEN cookie")
	}
}

func TestErrorsUnderTheBasePathAreWhosFormat(t *testing.T) {
	h := app(t, authn.Config{})

	nf := send(h, "GET", "/api/roux/auth/nope", func(r *http.Request) { r.Header.Set("Accept", "text/html") })
	body := decode(t, nf.ResponseRecorder)
	if nf.Code != 404 || nf.Header().Get("Roux-Error") != "not-found" || body["type"] != "urn:roux:error:not-found" || body["code"] != "not-found" {
		t.Fatalf("unknown path (even asking for html, never the shell): %d %v %v", nf.Code, nf.Header(), body)
	}

	na := send(h, "POST", "/api/roux/auth/me", withCSRF("t"))
	if na.Code != 405 || na.Header().Get("Roux-Error") != "method-not-allowed" || na.Header().Get("Allow") == "" {
		t.Fatalf("wrong method: %d %v", na.Code, na.Header())
	}

	// Outside the base path the kit's own problem format applies.
	app := send(h, "GET", "/api/nope")
	if app.Code != 404 || app.Header().Get("Roux-Error") != "" || decode(t, app.ResponseRecorder)["instance"] != "/api/nope" {
		t.Fatalf("/api errors keep the kit format: %d %v", app.Code, app.Header())
	}
}

func TestCSRFRules(t *testing.T) {
	h := app(t, authn.Config{})

	// A request with no token is refused with roux's code, and still gets a cookie to retry with.
	res := send(h, "POST", "/api/roux/auth/logout")
	if res.Code != 403 || res.Header().Get("Roux-Error") != "invalid-csrf-token" || res.cookie == nil || res.cookie.Value == "" {
		t.Fatalf("no token: %d %v cookie=%v", res.Code, res.Header(), res.cookie)
	}

	// A cookie without the header, and a header that does not match, are refused.
	noHeader := send(h, "POST", "/api/roux/auth/logout", func(r *http.Request) { r.AddCookie(&http.Cookie{Name: "XSRF-TOKEN", Value: "abc"}) })
	if noHeader.Code != 403 || noHeader.Header().Get("Roux-Error") != "invalid-csrf-token" {
		t.Fatalf("no header: %d", noHeader.Code)
	}
	mismatch := send(h, "POST", "/api/roux/auth/logout", func(r *http.Request) {
		r.AddCookie(&http.Cookie{Name: "XSRF-TOKEN", Value: "abc"})
		r.Header.Set("X-XSRF-TOKEN", "abd")
	})
	if mismatch.Code != 403 {
		t.Fatalf("mismatch: %d", mismatch.Code)
	}

	// The client's own flow: fetch a cookie with GET, send it back in the header.
	token := send(h, "GET", "/api/roux/auth/me").cookie.Value
	ok := send(h, "POST", "/api/roux/auth/logout", withCSRF(token))
	if ok.Code != 204 || ok.Body.Len() != 0 {
		t.Fatalf("logout: %d %q", ok.Code, ok.Body)
	}
	if ok.cookie == nil || ok.cookie.MaxAge >= 0 {
		t.Fatalf("logout must delete the XSRF-TOKEN cookie, got %+v", ok.cookie)
	}

	// Safe methods need no header.
	if send(h, "GET", "/api/roux/auth/sign-in").Code != 200 {
		t.Fatal("GET needs no CSRF token")
	}
}

func TestCSRFCookieAttributes(t *testing.T) {
	h := app(t, authn.Config{})
	plain := send(h, "GET", "/api/roux/auth/me").cookie
	if plain.HttpOnly || plain.Path != "/" || plain.SameSite != http.SameSiteLaxMode || plain.Secure || len(plain.Value) < 20 {
		t.Fatalf("plain http cookie: %+v", plain)
	}
	tls := send(h, "GET", "https://example.com/api/roux/auth/me").cookie
	if !tls.Secure || tls.HttpOnly {
		t.Fatalf("https cookie must be Secure and script-readable: %+v", tls)
	}
	if again := send(h, "GET", "/api/roux/auth/me", func(r *http.Request) { r.AddCookie(plain) }); again.cookie != nil {
		t.Fatal("an existing cookie must be kept, not reissued")
	}
	if a, b := send(h, "GET", "/api/roux/auth/me").cookie.Value, send(h, "GET", "/api/roux/auth/me").cookie.Value; a == b {
		t.Fatal("tokens must be random")
	}
}

func TestSecureCookiesAreSecureWhateverTheRequestLooksLike(t *testing.T) {
	// Behind a proxy that ends TLS the server sees plain http: SecureCookies says the browser is on https.
	h := app(t, authn.Config{SecureCookies: true})
	if c := send(h, "GET", "/api/roux/auth/me").cookie; !c.Secure || c.HttpOnly {
		t.Fatalf("the CSRF cookie over plain http: %+v", c)
	}
	// Logout clears it with the same flag (a browser only replaces a cookie it would also have been sent).
	res := send(h, "POST", "/api/roux/auth/logout", withCSRF("t"), func(r *http.Request) { r.Header.Set("X-XSRF-TOKEN", "t") })
	var cleared *http.Cookie
	for _, c := range res.Result().Cookies() {
		if c.Name == "XSRF-TOKEN" {
			cleared = c
		}
	}
	if cleared == nil || !cleared.Secure || cleared.MaxAge >= 0 {
		t.Fatalf("logout's clearing cookie: %+v", cleared)
	}
}

func TestSignInSitsInsideRouxsOwnPaths(t *testing.T) {
	h := app(t, authn.Config{})
	if send(h, "GET", "/api/roux/auth/sign-in").Code != 200 {
		t.Fatal("/api/roux/auth/sign-in")
	}
	if res := send(h, "GET", "/api/roux/auth/nope"); res.Header().Get("Roux-Error") != "not-found" {
		t.Fatalf("errors under sign-in's base are sign-in's: %v", res.Header())
	}
	if res := send(h, "GET", "/api/roux/nope"); res.Code != 404 || res.Header().Get("Roux-Error") != "" {
		t.Fatalf("the rest of /api/roux is roux's plain problems: %d %v", res.Code, res.Header())
	}
}
