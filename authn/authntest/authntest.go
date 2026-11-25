// Package authntest is for tests of code that sits behind authn: a database schema of
// its own, who mounted on a mux, and browsers that are already signed in as someone
// with the permissions the test names, without an email in sight. Sessions are real
// (the same rows, the same checks); only the proof of who they belong to is skipped.
package authntest

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authz"
	"github.com/jwcarman/roux/pgdb"
	"github.com/jwcarman/roux/pgtest"
)

// Clock is a time source a test moves by hand.
type Clock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *Clock) Now() time.Time { c.mu.Lock(); defer c.mu.Unlock(); return c.t }

// Advance moves the clock forward.
func (c *Clock) Advance(d time.Duration) { c.mu.Lock(); defer c.mu.Unlock(); c.t = c.t.Add(d) }

// Env is who on a mux over a fresh schema.
type Env struct {
	T      *testing.T
	Pool   *pgxpool.Pool
	Mux    *api.Mux
	Host   *authn.Host
	Clock  *Clock
	Server *httptest.Server
}

// NewClock returns a clock at a fixed moment (2026-11-24 12:00 UTC), for a test that
// must hand the same clock to who and to the sign-in methods it builds.
func NewClock() *Clock { return &Clock{t: time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC)} }

// New migrates who, rbac and the given migrations into a fresh schema named schema.
// Register routes on e.Mux, then call e.Serve().
func New(t *testing.T, schema string, migrations ...pgdb.Migration) *Env {
	t.Helper()
	return NewWith(t, schema, NewClock(), nil, migrations...)
}

// NewWith is New with the clock the test already shares with its sign-in methods,
// and those methods mounted.
func NewWith(t *testing.T, schema string, clk *Clock, methods []authn.Method, migrations ...pgdb.Migration) *Env {
	t.Helper()
	return NewWithConfig(t, schema, clk, nil, methods, migrations...)
}

// NewWithConfig is NewWith with a say in who's configuration: tune adjusts what the test
// would otherwise get (the pool, the clock and the permissions are already set).
func NewWithConfig(t *testing.T, schema string, clk *Clock, tune func(*authn.Config), methods []authn.Method, migrations ...pgdb.Migration) *Env {
	t.Helper()
	pool := pgtest.Pool(t, schema)
	all := append([]pgdb.Migration{authn.Migration, authz.Migration}, migrations...)
	if err := pgdb.Migrate(context.Background(), pool, all...); err != nil {
		t.Fatal(err)
	}
	mux := api.NewMux()
	cfg := authn.Config{Pool: pool, Clock: clk.Now, Permissions: authz.Service{Pool: pool}.PermissionsOf}
	if tune != nil {
		tune(&cfg)
	}
	host, err := authn.Register(mux, cfg, methods...)
	if err != nil {
		t.Fatal(err)
	}
	return &Env{T: t, Pool: pool, Mux: mux, Host: host, Clock: clk}
}

// Serve starts the server; call it after registering routes.
func (e *Env) Serve() *Env {
	e.Server = httptest.NewServer(e.Mux)
	e.T.Cleanup(e.Server.Close)
	return e
}

// Identity makes an active identity holding a role of its own with the permissions.
func (e *Env) Identity(permissions ...string) uuid.UUID {
	e.T.Helper()
	ctx := context.Background()
	id, err := authn.CreateIdentity(ctx, e.Pool, e.Clock.Now())
	if err != nil {
		e.T.Fatal(err)
	}
	if len(permissions) > 0 {
		roleID := uuid.New()
		if _, err := e.Pool.Exec(ctx, `insert into roux_role (id, name) values ($1, $2)`, roleID, "test-"+roleID.String()); err != nil {
			e.T.Fatal(err)
		}
		for _, p := range permissions {
			if _, err := e.Pool.Exec(ctx, `insert into roux_role_permission (role_id, permission) values ($1, $2)`, roleID, p); err != nil {
				e.T.Fatal(err)
			}
		}
		if err := authz.Assign(ctx, e.Pool, id, roleID); err != nil {
			e.T.Fatal(err)
		}
	}
	return id
}

// SignedIn returns a browser signed in as the identity, through a credential linked to it.
func (e *Env) SignedIn(identityID uuid.UUID) *Browser {
	e.T.Helper()
	ctx := context.Background()
	credentialID := uuid.New()
	if err := authn.LinkCredential(ctx, e.Pool, credentialID, identityID); err != nil {
		e.T.Fatal(err)
	}
	cookie, err := e.Host.CreateSession(ctx, identityID, credentialID, "email-link", "whotest")
	if err != nil {
		e.T.Fatal(err)
	}
	b := e.Browser()
	b.SetCookie(authn.SessionCookie, cookie)
	return b
}

// Browser is a client with cookies that sends who's CSRF header like who-client does.
type Browser struct {
	T    *testing.T
	Base string
	jar  http.CookieJar
	http *http.Client
}

// Browser returns a signed-out browser.
func (e *Env) Browser() *Browser {
	jar, _ := cookiejar.New(nil)
	return &Browser{
		T: e.T, Base: e.Server.URL, jar: jar,
		http: &http.Client{Jar: jar, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }},
	}
}

// Cookie returns the named cookie's value, or "".
func (b *Browser) Cookie(name string) string {
	u, _ := url.Parse(b.Base)
	for _, c := range b.jar.Cookies(u) {
		if c.Name == name {
			return c.Value
		}
	}
	return ""
}

// SetCookie plants a cookie.
func (b *Browser) SetCookie(name, value string) {
	u, _ := url.Parse(b.Base)
	b.jar.SetCookies(u, []*http.Cookie{{Name: name, Value: value, Path: "/"}})
}

// Reply is a response with its body read.
type Reply struct {
	*http.Response
	Body []byte
}

// JSON decodes the body into a map.
func (r Reply) JSON(t *testing.T) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(r.Body, &m); err != nil {
		t.Fatalf("body %q: %v", r.Body, err)
	}
	return m
}

// Decode decodes the body into v.
func (r Reply) Decode(t *testing.T, v any) {
	t.Helper()
	if err := json.Unmarshal(r.Body, v); err != nil {
		t.Fatalf("body %q: %v", r.Body, err)
	}
}

// Do sends a request. A body that is a string is sent as is; anything else as JSON.
// With csrf, the XSRF-TOKEN cookie is fetched first if there is none, and sent back
// in the header.
func (b *Browser) Do(method, path string, body any, csrf bool) Reply {
	b.T.Helper()
	var rd io.Reader
	switch v := body.(type) {
	case nil:
	case string:
		rd = strings.NewReader(v)
	default:
		raw, _ := json.Marshal(v)
		rd = bytes.NewReader(raw)
	}
	req, _ := http.NewRequest(method, b.Base+path, rd)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if csrf {
		if b.Cookie("XSRF-TOKEN") == "" {
			b.Do("GET", "/api/roux/auth/sign-in", nil, false)
		}
		req.Header.Set("X-XSRF-TOKEN", b.Cookie("XSRF-TOKEN"))
	}
	res, err := b.http.Do(req)
	if err != nil {
		b.T.Fatal(err)
	}
	raw, err := io.ReadAll(res.Body)
	if err == nil {
		err = res.Body.Close()
	}
	if err != nil {
		b.T.Fatal(err)
	}
	return Reply{Response: res, Body: raw}
}

// DoWith sends a request with extra headers (an Accept, say), without CSRF.
func (b *Browser) DoWith(method, path string, headers map[string]string) Reply {
	b.T.Helper()
	return b.DoJSONWith(method, path, nil, headers)
}

// DoJSONWith is DoWith with a JSON body (a string is sent as it is), for a client that signs in
// by a header (an API key, a bearer token) and so sends no CSRF token.
func (b *Browser) DoJSONWith(method, path string, body any, headers map[string]string) Reply {
	b.T.Helper()
	var rd io.Reader
	switch v := body.(type) {
	case nil:
	case string:
		rd = strings.NewReader(v)
	default:
		raw, _ := json.Marshal(v)
		rd = bytes.NewReader(raw)
	}
	req, _ := http.NewRequest(method, b.Base+path, rd)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, err := b.http.Do(req)
	if err != nil {
		b.T.Fatal(err)
	}
	raw, err := io.ReadAll(res.Body)
	if err == nil {
		err = res.Body.Close()
	}
	if err != nil {
		b.T.Fatal(err)
	}
	return Reply{Response: res, Body: raw}
}

func (b *Browser) Get(path string) Reply            { return b.Do("GET", path, nil, false) }
func (b *Browser) Post(path string, body any) Reply { return b.Do("POST", path, body, true) }
func (b *Browser) Put(path string, body any) Reply  { return b.Do("PUT", path, body, true) }
func (b *Browser) Delete(path string) Reply         { return b.Do("DELETE", path, nil, true) }
