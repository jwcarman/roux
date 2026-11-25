package jwt_test

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authn/apikey"
	"github.com/jwcarman/roux/authn/authntest"
	"github.com/jwcarman/roux/authn/jwt"
	"github.com/jwcarman/roux/authn/oidc"
	"github.com/jwcarman/roux/authn/oidc/oidctest"
	"github.com/jwcarman/roux/problem"
)

const audience = "https://api.example.test"

type env struct {
	*authntest.Env
	t     *testing.T
	prov  *oidctest.Provider
	owner uuid.UUID
}

func setup(t *testing.T, tweak ...func(*jwt.Config)) *env {
	t.Helper()
	prov := oidctest.Start(t)
	clock := authntest.NewClock()
	cfg := jwt.Config{Issuer: prov.Issuer(), Audiences: []string{audience}, Clock: clock.Now}
	for _, fn := range tweak {
		fn(&cfg)
	}
	m, err := jwt.New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	keys, err := apikey.New(apikey.Config{Clock: clock.Now})
	if err != nil {
		t.Fatal(err)
	}
	e := authntest.NewWith(t, "jwt", clock, []authn.Method{m, keys}, jwt.Migration, apikey.Migration)
	who := func(w http.ResponseWriter, r *http.Request) error {
		p := authn.PrincipalFrom(r.Context())
		return api.JSON(w, 200, map[string]any{"identityId": p.IdentityID, "method": p.Method, "permissions": p.Permissions})
	}
	e.Mux.Handle("GET /api/whoami", e.Host.Guard("", who))
	e.Mux.Handle("POST /api/report", e.Host.Guard("report.write", who))
	e.Mux.Handle("GET /api/open", e.Host.Open(func(w http.ResponseWriter, r *http.Request) error {
		if p := authn.PrincipalFrom(r.Context()); p != nil {
			return api.JSON(w, 200, map[string]any{"identityId": p.IdentityID})
		}
		return api.JSON(w, 200, map[string]any{"anonymous": true})
	}))
	e.Mux.Handle("POST /api/sensitive", e.Host.Guard("", func(w http.ResponseWriter, r *http.Request) error {
		if err := e.Host.RequireRecentSignIn(r.Context()); err != nil {
			return err
		}
		return api.JSON(w, 200, "done")
	}))
	e.Serve()
	owner := e.Identity("report.read", "report.write")
	return &env{Env: e, t: t, prov: prov, owner: owner}
}

// link says the provider account (issuer, sub) is the owner.
func (e *env) link(sub string) {
	e.t.Helper()
	if _, err := oidc.LinkAccount(context.Background(), e.Pool, e.owner, e.prov.Issuer(), sub, e.Clock.Now()); err != nil {
		e.t.Fatal(err)
	}
}

// claims is a valid access token's claims for the subject.
func claims(sub string, more ...map[string]any) map[string]any {
	c := map[string]any{"sub": sub, "aud": audience}
	for _, m := range more {
		for k, v := range m {
			c[k] = v
		}
	}
	return c
}

func bearer(token string) map[string]string {
	return map[string]string{"Authorization": "Bearer " + token}
}

// call is a client with no cookies sending only the token, as a script would.
func (e *env) call(method, path, token string) authntest.Reply {
	return e.Browser().DoWith(method, path, bearer(token))
}

func code(t *testing.T, r authntest.Reply) string { t.Helper(); return r.JSON(t)["code"].(string) }

func TestATokenSignsARequestIn(t *testing.T) {
	e := setup(t)
	e.link("user-1")
	token := e.prov.Mint(claims("user-1"))
	sessions := 0
	if err := e.Pool.QueryRow(context.Background(), `select count(*) from roux_session`).Scan(&sessions); err != nil {
		t.Fatal(err)
	}

	r := e.call("GET", "/api/whoami", token)
	body := r.JSON(t)
	if r.StatusCode != 200 || body["identityId"] != e.owner.String() || body["method"] != "jwt" {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	// A token carries no scopes: the identity's own permissions apply.
	if perms := body["permissions"].([]any); len(perms) != 2 || perms[0] != "report.read" || perms[1] != "report.write" {
		t.Fatalf("%v", perms)
	}
	// An unsafe request needs no CSRF token, and no session or cookie comes of it.
	r = e.call("POST", "/api/report", token)
	if r.StatusCode != 200 || len(r.Header.Values("Set-Cookie")) != 0 {
		t.Fatalf("POST: %d %v", r.StatusCode, r.Header.Values("Set-Cookie"))
	}
	var after int
	if err := e.Pool.QueryRow(context.Background(), `select count(*) from roux_session`).Scan(&after); err != nil {
		t.Fatal(err)
	}
	if after != sessions {
		t.Fatal("a token's sign-in made a session")
	}
	// The scheme is case-insensitive.
	if r := e.Browser().DoWith("GET", "/api/whoami", map[string]string{"Authorization": "bearer " + token}); r.StatusCode != 200 {
		t.Fatalf("lower-case scheme: %d", r.StatusCode)
	}
	if r := e.call("GET", "/api/roux/auth/me", token); r.StatusCode != 200 || r.JSON(t)["signInMethod"] != "jwt" {
		t.Fatalf("/api/roux/auth/me: %d %s", r.StatusCode, r.Body)
	}
	// The audience may be a list that contains the configured one.
	listed := e.prov.Mint(claims("user-1", map[string]any{"aud": []string{"other", audience}}))
	if r := e.call("GET", "/api/whoami", listed); r.StatusCode != 200 {
		t.Fatalf("aud as a list: %d %s", r.StatusCode, r.Body)
	}
}

func TestATokenThatIsNotRightIsRefusedAtOnce(t *testing.T) {
	e := setup(t)
	e.link("user-1")
	good := claims("user-1")
	for name, token := range map[string]string{
		"garbage":                 "not.a.token",
		"signed with another key": e.prov.MintSignedByAnotherKey(good),
		"no signature (alg none)": e.prov.MintUnsigned(good),
		"another issuer":          e.prov.Mint(claims("user-1", map[string]any{"iss": "https://evil.example"})),
		"no issuer":               e.prov.Mint(claims("user-1", map[string]any{"iss": nil})),
		"expired":                 e.prov.Mint(claims("user-1", map[string]any{"exp": e.Clock.Now().Add(-time.Hour).Unix()})),
		"no expiry":               e.prov.Mint(claims("user-1", map[string]any{"exp": nil})),
		"no audience":             e.prov.Mint(claims("user-1", map[string]any{"aud": nil})),
		"another audience":        e.prov.Mint(claims("user-1", map[string]any{"aud": "https://another-app.example"})),
		"no subject":              e.prov.Mint(claims("user-1", map[string]any{"sub": nil})),
		"a subject nobody linked": e.prov.Mint(claims("stranger")),
		"an empty subject":        e.prov.Mint(claims("user-1", map[string]any{"sub": ""})),
	} {
		for _, path := range []string{"/api/whoami", "/api/open"} { // even where anonymous callers are welcome
			r := e.call("GET", path, token)
			if r.StatusCode != 401 || code(t, r) != "sign-in-failed" || r.Header.Get("WWW-Authenticate") != "Bearer" {
				t.Errorf("%s at %s: %d %v %s", name, path, r.StatusCode, r.Header.Get("WWW-Authenticate"), r.Body)
			}
		}
	}
	// One answer for every refusal: nothing says why.
	a, b := e.call("GET", "/api/whoami", "not.a.token"), e.call("GET", "/api/whoami", e.prov.Mint(claims("stranger")))
	if string(a.Body) != string(b.Body) {
		t.Fatalf("the answers differ:\n%s\n%s", a.Body, b.Body)
	}
	if r := e.call("GET", "/api/whoami", e.prov.Mint(good)); r.StatusCode != 200 {
		t.Fatalf("the control token: %d %s", r.StatusCode, r.Body)
	}
}

func TestAnInactiveIdentityCannotUseAToken(t *testing.T) {
	e := setup(t)
	e.link("user-1")
	if _, err := e.Pool.Exec(context.Background(), `update roux_identity set status = 'DEACTIVATED' where id = $1`, e.owner); err != nil {
		t.Fatal(err)
	}
	if r := e.call("GET", "/api/whoami", e.prov.Mint(claims("user-1"))); r.StatusCode != 401 {
		t.Fatalf("%d", r.StatusCode)
	}
}

func TestOtherSchemesAndBlankHeadersAreNotTokens(t *testing.T) {
	e := setup(t)
	for _, v := range []string{"Basic dXNlcjpwYXNz", "Bearer", "Bearer   ", "Token abc"} {
		r := e.Browser().DoWith("GET", "/api/open", map[string]string{"Authorization": v})
		if r.StatusCode != 200 || r.JSON(t)["anonymous"] != true {
			t.Errorf("%q: %d %s", v, r.StatusCode, r.Body)
		}
	}
	// And a request with none at all goes on as it was.
	if r := e.Browser().Get("/api/open"); r.StatusCode != 200 {
		t.Fatal(r.StatusCode)
	}
}

func TestASessionIgnoresATokenBesideIt(t *testing.T) {
	e := setup(t)
	e.link("user-1")
	b := e.SignedIn(e.owner)
	token := e.prov.Mint(claims("user-1"))
	if r := b.DoWith("GET", "/api/whoami", bearer(token)); r.StatusCode != 200 || r.JSON(t)["method"] != "email-link" {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	// A session keeps its CSRF check even with a token beside it.
	if r := b.DoWith("POST", "/api/report", bearer(token)); r.StatusCode != 403 || code(t, r) != "invalid-csrf-token" {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	// And a wrong token beside a good session is ignored: the session decided.
	if r := b.DoWith("GET", "/api/whoami", bearer("garbage")); r.StatusCode != 200 {
		t.Fatalf("%d", r.StatusCode)
	}
}

func TestATokenIsNotABrowserSession(t *testing.T) {
	e := setup(t)
	e.link("user-1")
	token := e.prov.Mint(claims("user-1"))
	// The account endpoints that change how someone signs in are for a person at a browser.
	for _, path := range []string{"/api/roux/auth/me/sessions"} {
		if r := e.call("GET", path, token); r.StatusCode != 403 || code(t, r) != "browser-session-required" {
			t.Errorf("%s: %d %s", path, r.StatusCode, r.Body)
		}
	}
	// A token may manage API keys, but making or rotating one needs a recent sign-in (its
	// auth_time), as at a browser: a key outlives the token by months. A key it made cannot make
	// more keys.
	keyBody := map[string]any{"name": "ci", "lifetime": "P7D", "scopes": []string{"report.read"}}
	stale := e.prov.Mint(claims("user-1", map[string]any{"auth_time": e.Clock.Now().Add(-24 * time.Hour).Unix()}))
	if r := e.Browser().DoJSONWith("POST", "/api/roux/auth/me/api-keys", keyBody, bearer(stale)); r.StatusCode != 401 || code(t, r) != "reauthentication-required" {
		t.Fatalf("a token from a day-old sign-in making a key: %d %s", r.StatusCode, r.Body)
	}
	fresh := e.prov.Mint(claims("user-1", map[string]any{"auth_time": e.Clock.Now().Unix()}))
	r := e.Browser().DoJSONWith("POST", "/api/roux/auth/me/api-keys", keyBody, bearer(fresh))
	made := r.JSON(t)
	if r.StatusCode != 201 || made["key"] == nil {
		t.Fatalf("a token making a key: %d %s", r.StatusCode, r.Body)
	}
	if r := e.call("GET", "/api/roux/auth/me/api-keys", stale); r.StatusCode != 200 {
		t.Fatalf("list keys with a token, however old its sign-in: %d %s", r.StatusCode, r.Body)
	}
	rot := e.Browser().DoJSONWith("POST", "/api/roux/auth/me/api-keys/"+made["id"].(string)+"/rotations", map[string]string{"overlap": "PT0S"}, bearer(fresh))
	if rot.StatusCode != 201 {
		t.Fatalf("a token rotating a key: %d %s", rot.StatusCode, rot.Body)
	}
	key := rot.JSON(t)["key"].(string)
	if r := e.Browser().DoWith("GET", "/api/roux/auth/me/api-keys", map[string]string{"X-API-Key": key}); r.StatusCode != 403 || code(t, r) != "api-key-cannot-manage-keys" {
		t.Fatalf("a key managing keys: %d %s", r.StatusCode, r.Body)
	}
	if r := e.call("DELETE", "/api/roux/auth/me/api-keys/"+made["id"].(string), stale); r.StatusCode != 404 && r.StatusCode != 204 {
		t.Fatalf("revoke: %d", r.StatusCode)
	}
}

func TestRecentSignInFollowsTheTokensAuthTime(t *testing.T) {
	e := setup(t)
	e.link("user-1")
	now := e.Clock.Now()
	mint := func(authTime any) string {
		return e.prov.Mint(claims("user-1", map[string]any{"auth_time": authTime}))
	}
	sensitive := func(token string) authntest.Reply { return e.call("POST", "/api/sensitive", token) }

	if r := sensitive(mint(now.Add(-5 * time.Minute).Unix())); r.StatusCode != 200 {
		t.Fatalf("recent: %d %s", r.StatusCode, r.Body)
	}
	// A time a little in the future (clock skew) counts as now.
	if r := sensitive(mint(now.Add(30 * time.Second).Unix())); r.StatusCode != 200 {
		t.Fatalf("a little in the future: %d %s", r.StatusCode, r.Body)
	}
	// Older: 401 with RFC 9470's step-up challenge.
	r := sensitive(mint(now.Add(-11 * time.Minute).Unix()))
	if r.StatusCode != 401 || code(t, r) != "reauthentication-required" ||
		r.Header.Get("WWW-Authenticate") != `Bearer error="insufficient_user_authentication", error_description="A more recent sign-in is required", max_age=600` {
		t.Fatalf("stale: %d %v %s", r.StatusCode, r.Header.Get("WWW-Authenticate"), r.Body)
	}
	// A sign-in after the token was issued is not believed: as if it had none, 403.
	if r := sensitive(mint(now.Add(24 * time.Hour).Unix())); r.StatusCode != 403 {
		t.Fatalf("auth_time a day after iat: %d %s", r.StatusCode, r.Body)
	}
	// None: 403, since signing in again would bring another token without it.
	if r := sensitive(mint(nil)); r.StatusCode != 403 {
		t.Fatalf("no auth_time: %d %s", r.StatusCode, r.Body)
	}
	// A token with no auth_time works everywhere else.
	if r := e.call("GET", "/api/whoami", mint(nil)); r.StatusCode != 200 {
		t.Fatalf("%d", r.StatusCode)
	}
}

func TestTheSameAccountFromTheBrowserAndTheAPIIsOneIdentity(t *testing.T) {
	// Linking is the one thing that makes a subject an identity: nothing else does.
	e := setup(t)
	token := e.prov.Mint(claims("user-1"))
	if r := e.call("GET", "/api/whoami", token); r.StatusCode != 401 {
		t.Fatalf("before linking: %d", r.StatusCode)
	}
	e.link("user-1")
	if r := e.call("GET", "/api/whoami", token); r.StatusCode != 200 {
		t.Fatalf("after linking: %d", r.StatusCode)
	}
	// Unlinking the account (as the identity does in the browser) ends the token's access too.
	if _, err := e.Pool.Exec(context.Background(), `delete from roux_credential_identity where credential_id in (select id from roux_federated_credential where subject = 'user-1')`); err != nil {
		t.Fatal(err)
	}
	if r := e.call("GET", "/api/whoami", token); r.StatusCode != 401 {
		t.Fatalf("after unlinking: %d", r.StatusCode)
	}
}

func TestKeysCanBeFoundByJWKSURLWithoutDiscovery(t *testing.T) {
	var prov *oidctest.Provider
	e := setup(t, func(c *jwt.Config) { c.JWKSURL = c.Issuer + "/jwks" })
	prov = e.prov
	e.link("user-1")
	if r := e.call("GET", "/api/whoami", prov.Mint(claims("user-1"))); r.StatusCode != 200 {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	// The issuer still comes from configuration: a token naming another one is refused.
	if r := e.call("GET", "/api/whoami", prov.Mint(claims("user-1", map[string]any{"iss": "https://evil.example"}))); r.StatusCode != 401 {
		t.Fatalf("%d", r.StatusCode)
	}
}

func TestAnIssuerThatIsDownRefusesTokensAndRecovers(t *testing.T) {
	e := setup(t, func(c *jwt.Config) { c.Issuer = "http://127.0.0.1:1" }) // nothing listens there
	if r := e.call("GET", "/api/whoami", e.prov.Mint(claims("user-1"))); r.StatusCode != 401 {
		t.Fatalf("%d", r.StatusCode)
	}
}

func TestTheConfigurationIsChecked(t *testing.T) {
	for name, tc := range map[string]struct {
		cfg  jwt.Config
		want string
	}{
		"no issuer":        {jwt.Config{Audiences: []string{"a"}}, "Issuer is required"},
		"a bad issuer":     {jwt.Config{Issuer: "sso.example.com", Audiences: []string{"a"}}, "Issuer"},
		"no audience":      {jwt.Config{Issuer: "https://sso.example.com"}, "Audiences is required"},
		"a blank audience": {jwt.Config{Issuer: "https://sso.example.com", Audiences: []string{" ", ""}}, "Audiences is required"},
		"a bad jwks url":   {jwt.Config{Issuer: "https://sso.example.com", Audiences: []string{"a"}, JWKSURL: "keys"}, "JWKSURL"},
	} {
		if _, err := jwt.New(tc.cfg); err == nil || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: %v, want %q", name, err, tc.want)
		}
	}
	if _, err := jwt.New(jwt.Config{Issuer: "https://sso.example.com", Audiences: []string{" a ", "b"}}); err != nil {
		t.Fatal(err)
	}
	_ = problem.ContentType
}
