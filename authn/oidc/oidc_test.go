package oidc_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authn/authntest"
	"github.com/jwcarman/roux/authn/oidc"
	"github.com/jwcarman/roux/authn/oidc/oidctest"
)

// policy is a sign-up policy a test steers: it records what it was asked and what it set up.
type policy struct {
	mu     sync.Mutex
	allow  bool
	last   oidc.SignUpRequest
	setups int
}

func (p *policy) decide(_ context.Context, r oidc.SignUpRequest) oidc.SignUpDecision {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.last = r
	return oidc.SignUpDecision{Allow: p.allow, Setup: func(context.Context, pgx.Tx, uuid.UUID) error {
		p.mu.Lock()
		defer p.mu.Unlock()
		p.setups++
		return nil
	}}
}

func (p *policy) open() { p.mu.Lock(); p.allow = true; p.mu.Unlock() }
func (p *policy) asked() oidc.SignUpRequest {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.last
}

type env struct {
	*authntest.Env
	t      *testing.T
	prov   *oidctest.Provider
	policy *policy
	clock  *authntest.Clock
}

// setup mounts provider sign-in over a fresh schema: a provider "test" (OpenID Connect) and
// "gh" (GitHub-shaped), both answered by the one test provider.
func setup(t *testing.T, tweak ...func(*oidc.Config)) *env { return build(t, false, tweak...) }

// build is setup with a say in whether who marks every cookie Secure.
func build(t *testing.T, secure bool, tweak ...func(*oidc.Config)) *env {
	t.Helper()
	prov := oidctest.Start(t)
	clock := authntest.NewClock()
	pol := &policy{}
	var handler atomic.Pointer[http.Handler]
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { (*handler.Load()).ServeHTTP(w, r) }))
	t.Cleanup(srv.Close)

	cfg := oidc.Config{
		PublicURL: srv.URL, SignUp: pol.decide, Clock: clock.Now,
		Providers: []oidc.Provider{
			{ID: "test", Name: "Test", Kind: oidc.KindOIDC, Issuer: prov.Issuer(), ClientID: oidctest.ClientID, ClientSecret: oidctest.ClientSecret},
			{ID: "gh", Name: "GH", Kind: oidc.KindGitHub, ClientID: oidctest.ClientID, ClientSecret: oidctest.ClientSecret,
				AuthURL: prov.Issuer() + "/authorize", TokenURL: prov.Issuer() + "/token", UserInfoURL: prov.Issuer() + "/user"},
		},
	}
	for _, fn := range tweak {
		fn(&cfg)
	}
	m, err := oidc.New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	e := authntest.NewWithConfig(t, "oidc", clock, func(c *authn.Config) { c.SecureCookies = secure }, []authn.Method{m}, oidc.Migration)
	var h http.Handler = e.Mux
	handler.Store(&h)
	e.Server = srv
	return &env{Env: e, t: t, prov: prov, policy: pol, clock: clock}
}

// through plays a whole provider round trip for the browser: the page's first request, the
// provider, the callback. It returns where the app sent the browser at the end.
func (e *env) through(b *authntest.Browser, first func() authntest.Reply) string {
	e.t.Helper()
	r := first()
	if r.StatusCode != http.StatusFound {
		e.t.Fatalf("starting: %d %s", r.StatusCode, r.Body)
	}
	callback := e.prov.Authorize(e.t, r.Header.Get("Location"))
	u, err := url.Parse(callback)
	if err != nil {
		e.t.Fatal(err)
	}
	back := b.Get(u.RequestURI())
	if back.StatusCode != http.StatusFound {
		e.t.Fatalf("callback: %d %s", back.StatusCode, back.Body)
	}
	return back.Header.Get("Location")
}

func (e *env) signInWith(b *authntest.Browser, provider string) string {
	return e.through(b, func() authntest.Reply { return b.Get("/who/oidc/authorize/" + provider) })
}

func (e *env) linkWith(b *authntest.Browser, provider string) string {
	return e.through(b, func() authntest.Reply { return b.Post("/who/me/accounts/"+provider, nil) })
}

// user says who the provider signs in next.
func (e *env) user(sub string, claims map[string]any) { e.prov.NextUser(sub, claims) }

// signUp makes a new identity from the provider account (the policy is opened) and returns it
// with a browser signed in as it.
func (e *env) signUp(provider, sub string, claims map[string]any) (uuid.UUID, *authntest.Browser) {
	e.t.Helper()
	e.policy.open()
	e.user(sub, claims)
	b := e.Browser()
	if got := e.signInWith(b, provider); got != "/?pending=sign-up" {
		e.t.Fatalf("an unknown account lands at %q", got)
	}
	r := b.Post("/who/oidc/pending/sign-up", nil)
	if r.StatusCode != 200 {
		e.t.Fatalf("sign-up: %d %s", r.StatusCode, r.Body)
	}
	id, err := uuid.Parse(r.JSON(e.t)["identityId"].(string))
	if err != nil {
		e.t.Fatal(err)
	}
	return id, b
}

func (e *env) count(query string, args ...any) int {
	e.t.Helper()
	var n int
	if err := e.Pool.QueryRow(context.Background(), query, args...).Scan(&n); err != nil {
		e.t.Fatal(err)
	}
	return n
}

func problemCode(t *testing.T, r authntest.Reply) string {
	t.Helper()
	return r.JSON(t)["code"].(string)
}

func TestTheSignInPageListsTheProviders(t *testing.T) {
	e := setup(t)
	r := e.Browser().Get("/who/sign-in")
	var body struct {
		Providers []struct{ ID, Name string }
	}
	r.Decode(t, &body)
	if len(body.Providers) != 2 || body.Providers[0].ID != "test" || body.Providers[0].Name != "Test" || body.Providers[1].ID != "gh" {
		t.Fatalf("%s", r.Body)
	}
}

func TestAnUnknownProviderIsNotFound(t *testing.T) {
	e := setup(t)
	for _, path := range []string{"/who/oidc/authorize/nope", "/who/oidc/callback/nope"} {
		if r := e.Browser().Get(path); r.StatusCode != 404 || problemCode(t, r) != "unknown-provider" {
			t.Errorf("%s: %d %s", path, r.StatusCode, r.Body)
		}
	}
}

func TestTheAuthorizeRequestCarriesTheProtections(t *testing.T) {
	e := setup(t)
	e.user("u1", nil)
	b := e.Browser()
	e.signInWith(b, "test")
	q := e.prov.Seen[0]
	redirect := e.Server.URL + "/who/oidc/callback/test"
	if q.Get("redirect_uri") != redirect || q.Get("client_id") != oidctest.ClientID || q.Get("response_type") != "code" ||
		q.Get("code_challenge_method") != "S256" || len(q.Get("code_challenge")) < 43 ||
		len(q.Get("state")) < 40 || len(q.Get("nonce")) < 40 || q.Get("prompt") != "" ||
		!strings.Contains(q.Get("scope"), "openid") {
		t.Fatalf("authorize request: %v", q)
	}
	// The state, nonce and verifier are one use and unguessable: a second start differs.
	e.signInWith(e.Browser(), "test")
	if e.prov.Seen[1].Get("state") == q.Get("state") || e.prov.Seen[1].Get("nonce") == q.Get("nonce") {
		t.Fatal("state or nonce repeated")
	}
	if c := b.Cookie("OIDC_FLOW"); c != "" {
		t.Fatalf("the flow cookie outlives the callback: %q", c)
	}
}

func TestSignUpIsClosedByDefault(t *testing.T) {
	e := setup(t)
	e.user("u1", map[string]any{"email": "ada@example.test"})
	b := e.Browser()
	if got := e.signInWith(b, "test"); got != "/?pending=sign-up" {
		t.Fatalf("lands at %q", got)
	}
	r := b.Get("/who/oidc/pending")
	body := r.JSON(t)
	if r.StatusCode != 200 || body["provider"] != "test" || body["displayName"] != "ada@example.test" ||
		body["canSignUp"] != true || body["canLink"] != false {
		t.Fatalf("pending: %d %s", r.StatusCode, r.Body)
	}
	r = b.Post("/who/oidc/pending/sign-up", nil)
	if r.StatusCode != 403 || problemCode(t, r) != "sign-up-refused" {
		t.Fatalf("closed policy: %d %s", r.StatusCode, r.Body)
	}
	if e.count(`select count(*) from roux_identity`) != 0 || e.count(`select count(*) from roux_federated_credential`) != 0 {
		t.Fatal("a refused sign-up created something")
	}
	if b.Get("/who/me").StatusCode != 401 {
		t.Fatal("a refused sign-up signed in")
	}
}

func TestSigningUpAndSigningInAgain(t *testing.T) {
	e := setup(t)
	id, b := e.signUp("test", "u1", map[string]any{"email": "ada@example.test", "name": "Ada"})
	me := b.Get("/who/me").JSON(t)
	if me["identityId"] != id.String() || me["signInMethod"] != "oidc" {
		t.Fatalf("/who/me: %v", me)
	}
	if e.policy.setups != 1 {
		t.Fatalf("setup ran %d times", e.policy.setups)
	}
	// The pending account is spent.
	if r := b.Post("/who/oidc/pending/sign-up", nil); r.StatusCode != 404 && r.StatusCode != 403 {
		t.Fatalf("a spent sign-up: %d", r.StatusCode)
	}
	// Signing in again, from another browser, is the same identity, straight in.
	e.user("u1", map[string]any{"email": "different@example.test"})
	other := e.Browser()
	if got := e.signInWith(other, "test"); got != "/" {
		t.Fatalf("a known account lands at %q", got)
	}
	if got := other.Get("/who/me").JSON(t)["identityId"]; got != id.String() {
		t.Fatalf("signed in as %v", got)
	}
	if e.count(`select count(*) from roux_identity`) != 1 {
		t.Fatal("a second identity")
	}
	// Signing in ended this browser's old session and rotated its cookie.
	before := other.Cookie("SESSION")
	e.signInWith(other, "test")
	if after := other.Cookie("SESSION"); after == before || after == "" {
		t.Fatal("the session cookie did not change at sign-in")
	}
}

func TestAccountsAreNeverMatchedByEmail(t *testing.T) {
	e := setup(t)
	id, _ := e.signUp("test", "u1", map[string]any{"email": "ada@example.test", "email_verified": true})
	// Another account at the provider with the very same verified address is not Ada.
	e.user("u2", map[string]any{"email": "ada@example.test", "email_verified": true})
	b := e.Browser()
	if got := e.signInWith(b, "test"); got != "/?pending=sign-up" {
		t.Fatalf("lands at %q: an address is not who someone is", got)
	}
	if b.Get("/who/me").StatusCode != 401 {
		t.Fatal("signed in by email address")
	}
	_ = id
}

func TestTheSignUpPolicySeesWhatTheProviderSaid(t *testing.T) {
	for _, tc := range []struct {
		name  string
		trust bool
		want  string
	}{{"an untrusted provider's address is not passed on", false, ""}, {"a trusted provider's verified address is", true, "ada@example.test"}} {
		t.Run(tc.name, func(t *testing.T) {
			e := setup(t, func(c *oidc.Config) { c.Providers[0].TrustEmail = &tc.trust })
			e.signUp("test", "u1", map[string]any{"email": "ada@example.test", "email_verified": true, "hd": "example.test", "name": "Ada", "groups": []string{"x"}})
			got := e.policy.asked()
			if got.VerifiedEmail != tc.want || got.Provider != "test" || got.Issuer != e.prov.Issuer() || got.Subject != "u1" ||
				got.Claims["hd"] != "example.test" || got.DisplayName != "ada@example.test" {
				t.Fatalf("%+v", got)
			}
			if _, listed := got.Claims["groups"]; listed {
				t.Fatal("a claim that is not simple reached the policy")
			}
		})
	}
	t.Run("an unverified address is never passed on", func(t *testing.T) {
		yes := true
		e := setup(t, func(c *oidc.Config) { c.Providers[0].TrustEmail = &yes })
		e.signUp("test", "u1", map[string]any{"email": "ada@example.test", "email_verified": false})
		if got := e.policy.asked().VerifiedEmail; got != "" {
			t.Fatalf("%q", got)
		}
	})
}

func TestAProviderThatMisbehavesSignsNoOneIn(t *testing.T) {
	for name, tweak := range map[string]func(*oidctest.Tweaks){
		"a token from another issuer":      func(t *oidctest.Tweaks) { t.Issuer = "https://evil.example" },
		"a token for another client":       func(t *oidctest.Tweaks) { t.Audience = "someone-else" },
		"the wrong nonce":                  func(t *oidctest.Tweaks) { t.Nonce = "not-the-one-sent" },
		"an expired token":                 func(t *oidctest.Tweaks) { t.Expired = true },
		"a token signed with another key":  func(t *oidctest.Tweaks) { t.BadSignature = true },
		"no subject":                       func(t *oidctest.Tweaks) { t.NoSubject = true },
		"a failed PKCE check":              func(t *oidctest.Tweaks) { t.WrongVerifier = true },
		"a token endpoint that is down":    func(t *oidctest.Tweaks) { t.TokenStatus = 500 },
		"the person denying access":        func(t *oidctest.Tweaks) { t.DenyAuthorize = "access_denied" },
		"a state that is not the one sent": func(t *oidctest.Tweaks) { t.WrongState = "forged" },
	} {
		t.Run(name, func(t *testing.T) {
			e := setup(t)
			e.policy.open()
			e.user("u1", map[string]any{"email": "ada@example.test"})
			e.prov.Tweak(tweak)
			b := e.Browser()
			if got := e.signInWith(b, "test"); got != "/?error=signin-failed" {
				t.Fatalf("lands at %q", got)
			}
			if b.Get("/who/me").StatusCode != 401 || b.Get("/who/oidc/pending").StatusCode != 404 ||
				e.count(`select count(*) from roux_identity`) != 0 || e.count(`select count(*) from roux_oidc_pending`) != 0 {
				t.Fatal("a failed sign-in left something behind")
			}
		})
	}
}

func TestACallbackIsAnsweredOnceAndOnlyForTheBrowserThatStarted(t *testing.T) {
	e := setup(t)
	e.user("u1", nil)
	b := e.Browser()
	r := b.Get("/who/oidc/authorize/test")
	callback := e.prov.Authorize(t, r.Header.Get("Location"))
	u, _ := url.Parse(callback)

	// Another browser (no flow cookie) cannot finish the first one's sign-in.
	if got := e.Browser().Get(u.RequestURI()).Header.Get("Location"); got != "/?error=signin-failed" {
		t.Fatalf("another browser lands at %q", got)
	}
	// The first can, once; replaying the callback fails.
	if got := b.Get(u.RequestURI()).Header.Get("Location"); got != "/?pending=sign-up" {
		t.Fatalf("lands at %q", got)
	}
	if got := b.Get(u.RequestURI()).Header.Get("Location"); got != "/?error=signin-failed" {
		t.Fatalf("a replayed callback lands at %q", got)
	}
	// A callback with no flow at all.
	if got := e.Browser().Get("/who/oidc/callback/test?code=x&state=y").Header.Get("Location"); got != "/?error=signin-failed" {
		t.Fatalf("no flow lands at %q", got)
	}
	// A flow that waited too long.
	e.user("u2", nil)
	b2 := e.Browser()
	r = b2.Get("/who/oidc/authorize/test")
	callback = e.prov.Authorize(t, r.Header.Get("Location"))
	u, _ = url.Parse(callback)
	e.clock.Advance(11 * time.Minute)
	if got := b2.Get(u.RequestURI()).Header.Get("Location"); got != "/?error=signin-failed" {
		t.Fatalf("an old flow lands at %q", got)
	}
}

func TestAPendingSignUpExpires(t *testing.T) {
	e := setup(t)
	e.policy.open()
	e.user("u1", nil)
	b := e.Browser()
	e.signInWith(b, "test")
	e.clock.Advance(10*time.Minute + time.Second)
	if r := b.Get("/who/oidc/pending"); r.StatusCode != 404 || problemCode(t, r) != "no-pending-sign-up" {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	if r := b.Post("/who/oidc/pending/sign-up", nil); r.StatusCode != 404 {
		t.Fatalf("an expired sign-up: %d", r.StatusCode)
	}
	if e.count(`select count(*) from roux_identity`) != 0 {
		t.Fatal("an expired sign-up created an identity")
	}
}

func TestSomeoneSignedInCannotSignUpAndAPlainSignInNeverLinks(t *testing.T) {
	e := setup(t)
	_, ada := e.signUp("test", "u1", nil)

	// A plain sign-in with an unknown account, by someone signed in, keeps nothing.
	e.user("u2", nil)
	if got := e.signInWith(ada, "test"); got != "/?error=signed-in" {
		t.Fatalf("lands at %q", got)
	}
	if ada.Get("/who/oidc/pending").StatusCode != 404 {
		t.Fatal("a pending account was kept")
	}
	if e.count(`select count(*) from roux_federated_credential`) != 1 {
		t.Fatal("a plain sign-in linked an account")
	}
	// A browser that is signed in cannot sign up, even with a pending account in hand.
	other := e.Browser()
	e.signInWith(other, "test")
	other.SetCookie("SESSION", ada.Cookie("SESSION"))
	if r := other.Post("/who/oidc/pending/sign-up", nil); r.StatusCode != 403 || problemCode(t, r) != "sign-up-refused" {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
}

func TestLinkingAnAccount(t *testing.T) {
	e := setup(t)
	id, ada := e.signUp("test", "u1", nil)

	// Starting needs a browser signed in, in a recent sign-in, and a provider that exists.
	if r := e.Browser().Post("/who/me/accounts/gh", nil); r.StatusCode != 401 || problemCode(t, r) != "not-signed-in" {
		t.Fatalf("signed out: %d", r.StatusCode)
	}
	if r := ada.Post("/who/me/accounts/nope", nil); r.StatusCode != 404 || problemCode(t, r) != "unknown-provider" {
		t.Fatalf("unknown provider: %d", r.StatusCode)
	}
	// A page that calls with fetch gets the address, not a redirect it cannot follow.
	r := ada.DoWith("POST", "/who/me/accounts/gh", map[string]string{"Accept": "application/json", "X-XSRF-TOKEN": ada.Cookie("XSRF-TOKEN")})
	if target, _ := r.JSON(t)["redirectUrl"].(string); r.StatusCode != 200 || !strings.HasPrefix(target, e.prov.Issuer()+"/authorize?") {
		t.Fatalf("json start: %d %s", r.StatusCode, r.Body)
	}

	// The flow: provider, callback, then the page confirms.
	e.user("4242", map[string]any{"login": "octocat"})
	if got := e.linkWith(ada, "gh"); got != "/?pending=link" {
		t.Fatalf("lands at %q", got)
	}
	body := ada.Get("/who/oidc/pending").JSON(t)
	if body["provider"] != "gh" || body["displayName"] != "octocat" || body["canLink"] != true || body["canSignUp"] != false {
		t.Fatalf("pending: %v", body)
	}
	if e.count(`select count(*) from roux_federated_credential`) != 1 {
		t.Fatal("the account was linked before the person confirmed")
	}
	r = ada.Post("/who/oidc/pending/link", nil)
	credID, _ := r.JSON(t)["credentialId"].(string)
	if r.StatusCode != 200 || credID == "" {
		t.Fatalf("confirm: %d %s", r.StatusCode, r.Body)
	}
	// It is listed, counted and signs in as the same identity.
	var list []map[string]any
	ada.Get("/who/me/accounts").Decode(t, &list)
	if len(list) != 2 || list[1]["id"] != credID || list[1]["provider"] != "gh" || list[0]["provider"] != "test" || list[1]["linkedAt"] == nil {
		t.Fatalf("accounts: %v", list)
	}
	if got := ada.Get("/who/me").JSON(t)["credentials"].(map[string]any)["account"]; got != float64(2) {
		t.Fatalf("credentials: %v", got)
	}
	other := e.Browser()
	e.user("4242", map[string]any{"login": "renamed-octocat"}) // the login changes; the id does not
	if got := e.signInWith(other, "gh"); got != "/" || other.Get("/who/me").JSON(t)["identityId"] != id.String() {
		t.Fatalf("signing in with the linked account lands at %q", got)
	}
	// The spent pending cannot be used again.
	if r := ada.Post("/who/oidc/pending/link", nil); r.StatusCode != 404 {
		t.Fatalf("a spent link: %d", r.StatusCode)
	}
	// Linking an account the identity already has changes nothing and is not a sign-in.
	before := ada.Cookie("SESSION")
	if got := e.linkWith(ada, "gh"); got != "/" {
		t.Fatalf("already yours lands at %q", got)
	}
	if ada.Cookie("SESSION") != before || e.count(`select count(*) from roux_federated_credential`) != 2 {
		t.Fatal("linking an account you have changed something")
	}
	// A link asks the provider to show which account it is linking; a plain sign-in does not.
	last := e.prov.Seen[len(e.prov.Seen)-1]
	plain := e.prov.Seen[len(e.prov.Seen)-2] // the sign-in with the linked account
	if last.Get("prompt") != "select_account" {
		t.Fatalf("link request: %v", last)
	}
	if plain.Get("prompt") != "" {
		t.Fatalf("a plain sign-in asked for %q", plain.Get("prompt"))
	}
}

func TestALinkAsksForANewLoginAtAnOpenIDConnectProvider(t *testing.T) {
	e := setup(t)
	_, ada := e.signUp("test", "u1", nil)
	e.user("u2", nil)
	e.linkWith(ada, "test")
	if got := e.prov.Seen[len(e.prov.Seen)-1].Get("prompt"); got != "login" {
		t.Fatalf("prompt %q", got)
	}
}

func TestLinkingNeedsARecentSignIn(t *testing.T) {
	e := setup(t)
	_, ada := e.signUp("test", "u1", nil)
	e.clock.Advance(11 * time.Minute)
	if r := ada.Post("/who/me/accounts/gh", nil); r.StatusCode != 401 || problemCode(t, r) != "reauthentication-required" {
		t.Fatalf("start: %d %s", r.StatusCode, r.Body)
	}
	// Confirming needs one too: a link started in time, confirmed too late.
	e.clock.Advance(-11 * time.Minute)
	e.user("4242", nil)
	e.linkWith(ada, "gh")
	e.clock.Advance(11 * time.Minute)
	if r := ada.Post("/who/oidc/pending/link", nil); r.StatusCode != 401 || problemCode(t, r) != "reauthentication-required" {
		t.Fatalf("confirm: %d %s", r.StatusCode, r.Body)
	}
	if e.count(`select count(*) from roux_federated_credential`) != 1 {
		t.Fatal("linked without a recent sign-in")
	}
}

func TestALinkAnswersOnlyTheIdentityThatStartedIt(t *testing.T) {
	t.Run("someone signed out meanwhile", func(t *testing.T) {
		e := setup(t)
		_, ada := e.signUp("test", "u1", nil)
		e.user("4242", nil)
		r := ada.Post("/who/me/accounts/gh", nil)
		callback := e.prov.Authorize(t, r.Header.Get("Location"))
		ada.Post("/who/logout", nil)
		u, _ := url.Parse(callback)
		if got := ada.Get(u.RequestURI()).Header.Get("Location"); got != "/?error=signin-failed" {
			t.Fatalf("lands at %q", got)
		}
		if e.count(`select count(*) from roux_oidc_pending`) != 0 {
			t.Fatal("a pending account was kept")
		}
	})
	t.Run("someone else signed in meanwhile", func(t *testing.T) {
		e := setup(t)
		_, ada := e.signUp("test", "u1", nil)
		e.user("4242", nil)
		r := ada.Post("/who/me/accounts/gh", nil)
		callback := e.prov.Authorize(t, r.Header.Get("Location"))
		bob, bobBrowser := e.signUp("test", "u2", nil)
		_ = bob
		bobBrowser.SetCookie("OIDC_FLOW", ada.Cookie("OIDC_FLOW"))
		u, _ := url.Parse(callback)
		if got := bobBrowser.Get(u.RequestURI()).Header.Get("Location"); got != "/?error=signin-failed" {
			t.Fatalf("lands at %q", got)
		}
		if e.count(`select count(*) from roux_oidc_pending`) != 0 {
			t.Fatal("a pending account was kept")
		}
	})
	t.Run("too late", func(t *testing.T) {
		e := setup(t)
		_, ada := e.signUp("test", "u1", nil)
		e.user("4242", nil)
		r := ada.Post("/who/me/accounts/gh", nil)
		callback := e.prov.Authorize(t, r.Header.Get("Location"))
		e.clock.Advance(10*time.Minute + time.Second)
		u, _ := url.Parse(callback)
		if got := ada.Get(u.RequestURI()).Header.Get("Location"); got != "/?error=signin-failed" {
			t.Fatalf("lands at %q", got)
		}
	})
}

func TestAPendingLinkIsSeenOnlyByTheIdentityThatAsked(t *testing.T) {
	e := setup(t)
	_, ada := e.signUp("test", "u1", nil)
	_, bob := e.signUp("test", "u2", nil)
	e.user("4242", nil)
	e.linkWith(ada, "gh")
	bob.SetCookie("OIDC_PENDING", ada.Cookie("OIDC_PENDING"))
	if r := bob.Get("/who/oidc/pending"); r.StatusCode != 404 {
		t.Fatalf("bob saw ada's pending link: %d %s", r.StatusCode, r.Body)
	}
	if r := bob.Post("/who/oidc/pending/link", nil); r.StatusCode != 404 {
		t.Fatalf("bob confirmed ada's link: %d", r.StatusCode)
	}
	if r := e.Browser().Post("/who/oidc/pending/link", nil); r.StatusCode != 401 || problemCode(t, r) != "not-signed-in" {
		t.Fatalf("signed out: %d", r.StatusCode)
	}
	// A pending sign-up cannot be used to link.
	e.user("u9", nil)
	other := e.Browser()
	e.signInWith(other, "test")
	other.SetCookie("SESSION", ada.Cookie("SESSION"))
	if r := other.Post("/who/oidc/pending/link", nil); r.StatusCode != 404 {
		t.Fatalf("a sign-up used to link: %d", r.StatusCode)
	}
}

func TestAnAccountOfAnotherIdentityCannotBeLinked(t *testing.T) {
	e := setup(t)
	_, ada := e.signUp("test", "u1", nil)
	bobID, bob := e.signUp("test", "u2", nil)
	_ = bobID
	e.user("u2", nil) // bob's account
	if got := e.linkWith(ada, "test"); got != "/?error=already-linked" {
		t.Fatalf("lands at %q", got)
	}
	if ada.Get("/who/oidc/pending").StatusCode != 404 {
		t.Fatal("a pending account was kept")
	}
	// A plain sign-in by someone signed in with another identity's account is the same.
	if got := e.signInWith(ada, "test"); got != "/?error=already-linked" {
		t.Fatalf("plain: %q", got)
	}
	_ = bob
	// The race: two identities confirm the same account; the second is told it is taken.
	e.user("u3", nil)
	e.linkWith(ada, "gh")
	e.user("u3", nil)
	carlID, carl := e.signUp("test", "u4", nil)
	_ = carlID
	e.user("u3", nil)
	e.linkWith(carl, "gh")
	if r := ada.Post("/who/oidc/pending/link", nil); r.StatusCode != 200 {
		t.Fatalf("first: %d %s", r.StatusCode, r.Body)
	}
	if r := carl.Post("/who/oidc/pending/link", nil); r.StatusCode != 409 || problemCode(t, r) != "already-linked" {
		t.Fatalf("second: %d %s", r.StatusCode, r.Body)
	}
}

func TestAnInactiveIdentityCannotSignIn(t *testing.T) {
	e := setup(t)
	id, _ := e.signUp("test", "u1", nil)
	if _, err := e.Pool.Exec(context.Background(), `update roux_identity set status = 'DEACTIVATED' where id = $1`, id); err != nil {
		t.Fatal(err)
	}
	e.user("u1", nil)
	b := e.Browser()
	if got := e.signInWith(b, "test"); got != "/?error=signin-failed" || b.Get("/who/me").StatusCode != 401 {
		t.Fatalf("lands at %q", got)
	}
	// Someone else cannot take the account for themselves by linking it.
	_, bob := e.signUp("test", "u2", nil)
	e.user("u1", nil)
	if got := e.linkWith(bob, "test"); got != "/?error=already-linked" {
		t.Fatalf("linking an inactive identity's account lands at %q", got)
	}
}

func TestUnlinkingAnAccount(t *testing.T) {
	e := setup(t)
	_, ada := e.signUp("test", "u1", nil)
	e.user("4242", nil)
	e.linkWith(ada, "gh")
	ada.Post("/who/oidc/pending/link", nil)
	var list []map[string]any
	ada.Get("/who/me/accounts").Decode(t, &list)
	testID, ghID := list[0]["id"].(string), list[1]["id"].(string)

	_, bob := e.signUp("test", "u2", nil)
	for name, id := range map[string]string{"another identity's": ghID, "unknown": uuid.NewString(), "garbage": "nope"} {
		if r := bob.Delete("/who/me/accounts/" + id); r.StatusCode != 404 || problemCode(t, r) != "linked-account-not-found" {
			t.Errorf("%s: %d %s", name, r.StatusCode, r.Body)
		}
	}
	if r := e.Browser().Delete("/who/me/accounts/" + ghID); r.StatusCode != 401 {
		t.Errorf("signed out: %d", r.StatusCode)
	}
	if r := ada.Delete("/who/me/accounts/" + ghID); r.StatusCode != 204 || len(r.Body) != 0 {
		t.Fatalf("unlink: %d %s", r.StatusCode, r.Body)
	}
	// The last way in stays, and the account the session signed in with ends that session on removal.
	if r := ada.Delete("/who/me/accounts/" + testID); r.StatusCode != 409 || problemCode(t, r) != "last-credential" {
		t.Fatalf("last way in: %d %s", r.StatusCode, r.Body)
	}
	if e.count(`select count(*) from roux_federated_credential`) != 2 { // ada's remaining one and bob's
		t.Fatal("wrong accounts left")
	}
	// The unlinked account no longer signs in as ada.
	e.user("4242", nil)
	if got := e.signInWith(e.Browser(), "gh"); got != "/?pending=sign-up" {
		t.Fatalf("an unlinked account lands at %q", got)
	}
}

func TestUnlinkingNeedsARecentSignInAndEndsSessionsSignedInWithIt(t *testing.T) {
	e := setup(t)
	_, ada := e.signUp("test", "u1", nil)
	e.user("4242", nil)
	e.linkWith(ada, "gh")
	ada.Post("/who/oidc/pending/link", nil)
	var list []map[string]any
	ada.Get("/who/me/accounts").Decode(t, &list)
	testID, ghID := list[0]["id"].(string), list[1]["id"].(string)

	// A session signed in with the gh account, elsewhere.
	e.user("4242", nil)
	viaGH := e.Browser()
	e.signInWith(viaGH, "gh")
	if viaGH.Get("/who/me").StatusCode != 200 {
		t.Fatal("not signed in")
	}
	e.clock.Advance(5 * time.Minute)
	if r := ada.Delete("/who/me/accounts/" + ghID); r.StatusCode != 204 {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	if viaGH.Get("/who/me").StatusCode != 401 {
		t.Fatal("a session signed in with the unlinked account lives on")
	}
	if ada.Get("/who/me").StatusCode != 200 {
		t.Fatal("ada's own session ended")
	}
	e.clock.Advance(6 * time.Minute) // the sign-in is no longer recent
	if r := ada.Delete("/who/me/accounts/" + testID); r.StatusCode != 401 || problemCode(t, r) != "reauthentication-required" {
		t.Fatalf("stale: %d %s", r.StatusCode, r.Body)
	}
}

func TestTwoBrowsersConfirmingTheSameAccountEndInOneIdentity(t *testing.T) {
	e := setup(t)
	e.policy.open()
	e.user("u1", nil)
	a, b := e.Browser(), e.Browser()
	e.signInWith(a, "test")
	e.user("u1", nil)
	e.signInWith(b, "test")
	var wg, start sync.WaitGroup
	start.Add(1)
	statuses := make([]int, 2)
	ids := make([]any, 2)
	for i, br := range []*authntest.Browser{a, b} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			start.Wait()
			r := br.Post("/who/oidc/pending/sign-up", nil)
			statuses[i] = r.StatusCode
			if r.StatusCode == 200 {
				ids[i] = r.JSON(t)["identityId"]
			}
		}()
	}
	start.Done()
	wg.Wait()
	if statuses[0] != 200 || statuses[1] != 200 || ids[0] != ids[1] {
		t.Fatalf("%v %v", statuses, ids)
	}
	if e.count(`select count(*) from roux_identity`) != 1 || e.count(`select count(*) from roux_federated_credential`) != 1 {
		t.Fatal("more than one identity or credential")
	}
}

func TestGitHub(t *testing.T) {
	e := setup(t)
	e.prov.NextEmails(
		map[string]any{"email": "other@example.test", "primary": false, "verified": true},
		map[string]any{"email": "ada@example.test", "primary": true, "verified": true})
	e.signUp("gh", "4242", map[string]any{"login": "octocat"})
	got := e.policy.asked()
	if got.Subject != "4242" || got.Issuer != "https://github.com" || got.DisplayName != "octocat" || got.VerifiedEmail != "ada@example.test" {
		t.Fatalf("%+v", got)
	}
	if e.count(`select count(*) from roux_federated_credential where issuer = 'https://github.com' and subject = '4242'`) != 1 {
		t.Fatal("the account is not (github.com, id)")
	}

	t.Run("a failing email lookup still signs in", func(t *testing.T) {
		e := setup(t)
		e.prov.Tweak(func(t *oidctest.Tweaks) { t.FailEmails = true })
		e.signUp("gh", "7", map[string]any{"login": "x"})
		if got := e.policy.asked().VerifiedEmail; got != "" {
			t.Fatalf("%q", got)
		}
	})
	t.Run("a slow email lookup does not hold the sign-in", func(t *testing.T) {
		e := setup(t)
		e.prov.Tweak(func(t *oidctest.Tweaks) { t.DelayEmails = 3500 * time.Millisecond })
		start := time.Now()
		e.signUp("gh", "8", map[string]any{"login": "x"})
		if time.Since(start) > 3400*time.Millisecond {
			t.Fatalf("took %s", time.Since(start))
		}
	})
	t.Run("an unverified or non-primary address is not passed on", func(t *testing.T) {
		e := setup(t)
		e.prov.NextEmails(map[string]any{"email": "ada@example.test", "primary": true, "verified": false})
		e.signUp("gh", "9", map[string]any{"login": "x"})
		if got := e.policy.asked().VerifiedEmail; got != "" {
			t.Fatalf("%q", got)
		}
	})
}

func TestTheConfigurationIsCheckedAtStartup(t *testing.T) {
	good := oidc.Provider{ID: "good", Kind: oidc.KindOIDC, Issuer: "https://sso.example.test", ClientID: "c"}
	for name, tc := range map[string]struct {
		cfg  oidc.Config
		want string
	}{
		"no providers":            {oidc.Config{PublicURL: "https://a.test"}, "Providers is empty"},
		"no public url":           {oidc.Config{Providers: []oidc.Provider{good}}, "PublicURL"},
		"a bad public url":        {oidc.Config{PublicURL: "app.test", Providers: []oidc.Provider{good}}, "PublicURL"},
		"an offsite success url":  {oidc.Config{PublicURL: "https://a.test", SuccessURL: "https://evil.test/", Providers: []oidc.Provider{good}}, "SuccessURL"},
		"a protocol-relative url": {oidc.Config{PublicURL: "https://a.test", FailureURL: "//evil.test", Providers: []oidc.Provider{good}}, "FailureURL"},
		"a bad id":                {oidc.Config{PublicURL: "https://a.test", Providers: []oidc.Provider{{ID: "Bad Id", Kind: oidc.KindOIDC, Issuer: "https://x.test", ClientID: "c"}}}, "id must be"},
		"no client id":            {oidc.Config{PublicURL: "https://a.test", Providers: []oidc.Provider{{ID: "x", Kind: oidc.KindOIDC, Issuer: "https://x.test"}}}, "client id"},
		"no issuer":               {oidc.Config{PublicURL: "https://a.test", Providers: []oidc.Provider{{ID: "x", Kind: oidc.KindOIDC, ClientID: "c"}}}, "issuer"},
		"duplicate ids":           {oidc.Config{PublicURL: "https://a.test", Providers: []oidc.Provider{good, good}}, "configured twice"},
		"duplicate issuers": {oidc.Config{PublicURL: "https://a.test", Providers: []oidc.Provider{good,
			{ID: "other", Kind: oidc.KindOIDC, Issuer: "https://sso.example.test", ClientID: "c"}}}, "same issuer"},
		"entra's shared endpoint": {oidc.Config{PublicURL: "https://a.test", Providers: []oidc.Provider{
			{ID: "ms", Kind: oidc.KindOIDC, Issuer: "https://login.microsoftonline.com/common/v2.0", ClientID: "c"}}}, "shared endpoints"},
		"an oauth2 provider with no subject attribute": {oidc.Config{PublicURL: "https://a.test", Providers: []oidc.Provider{
			{ID: "gl", Kind: oidc.KindOAuth2, Issuer: "https://gl.test", ClientID: "c", AuthURL: "a", TokenURL: "t", UserInfoURL: "u"}}}, "subject attribute"},
		"an unknown kind": {oidc.Config{PublicURL: "https://a.test", Providers: []oidc.Provider{{ID: "x", Kind: "saml", ClientID: "c"}}}, "kind must be"},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := oidc.New(tc.cfg)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("got %v, want it to mention %q", err, tc.want)
			}
		})
	}
	if _, err := oidc.New(oidc.Config{PublicURL: "https://a.test", Providers: []oidc.Provider{oidc.Google("id", "secret"), oidc.GitHub("id", "secret")}}); err != nil {
		t.Fatalf("the presets are valid: %v", err)
	}
}

func TestEmailTrustDefaults(t *testing.T) {
	// Only Google and github.com are trusted for email unless the configuration says so.
	e := setup(t) // the test provider's issuer is neither
	e.signUp("test", "u1", map[string]any{"email": "a@example.test", "email_verified": true})
	if e.policy.asked().VerifiedEmail != "" {
		t.Fatal("an unknown provider was trusted for email by default")
	}
}

func TestWithNoPolicyConfiguredNoOneSignsUp(t *testing.T) {
	e := setup(t, func(c *oidc.Config) { c.SignUp = nil })
	e.user("u1", nil)
	b := e.Browser()
	e.signInWith(b, "test")
	if r := b.Post("/who/oidc/pending/sign-up", nil); r.StatusCode != 403 || problemCode(t, r) != "sign-up-refused" {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	if e.count(`select count(*) from roux_identity`) != 0 {
		t.Fatal("an identity was created with no policy")
	}
}

func TestALinkWindowShorterThanTheFlowIsHonored(t *testing.T) {
	e := setup(t, func(c *oidc.Config) { c.LinkWindow = 2 * time.Minute })
	_, ada := e.signUp("test", "u1", nil)
	e.user("4242", nil)
	r := ada.Post("/who/me/accounts/gh", nil)
	callback := e.prov.Authorize(t, r.Header.Get("Location"))
	e.clock.Advance(3 * time.Minute)
	u, _ := url.Parse(callback)
	if got := ada.Get(u.RequestURI()).Header.Get("Location"); got != "/?error=signin-failed" {
		t.Fatalf("a link older than its window lands at %q", got)
	}
}

func TestEveryCookieIsSecureWhenConfiguredEvenOverPlainHTTP(t *testing.T) {
	for _, secure := range []bool{false, true} {
		e := build(t, secure)
		e.policy.open()
		e.user("u1", nil)
		b := e.Browser()
		seen := map[string]bool{}
		note := func(r authntest.Reply) {
			for _, c := range r.Cookies() {
				if c.MaxAge >= 0 || c.Value != "" { // a cookie being set, not cleared
					seen[c.Name] = c.Secure
				}
				if !c.HttpOnly && c.Name != "XSRF-TOKEN" {
					t.Errorf("secure=%v: %s is readable by script", secure, c.Name)
				}
			}
		}
		start := b.Get("/who/oidc/authorize/test")
		note(start)
		callback, _ := url.Parse(e.prov.Authorize(t, start.Header.Get("Location")))
		note(b.Get(callback.RequestURI()))             // sets OIDC_PENDING
		note(b.Post("/who/oidc/pending/sign-up", nil)) // sets SESSION and a new XSRF-TOKEN
		for _, name := range []string{"OIDC_FLOW", "OIDC_PENDING", "SESSION", "XSRF-TOKEN"} {
			got, ok := seen[name]
			if !ok {
				t.Errorf("secure=%v: %s was never set", secure, name)
			} else if got != secure {
				t.Errorf("configured secure=%v, but %s has Secure=%v", secure, name, got)
			}
		}
	}
}
