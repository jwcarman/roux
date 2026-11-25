package emaillink_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authn/emaillink"
	"github.com/jwcarman/roux/authz"
	"github.com/jwcarman/roux/pgdb"
	"github.com/jwcarman/roux/pgtest"
)

const owner = "owner@example.test"

type clock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *clock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *clock) advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

// outbox is the Sender: it keeps what would have been emailed.
type outbox struct {
	mu   sync.Mutex
	msgs []emaillink.Message
	fail bool
}

func (o *outbox) Send(_ context.Context, m emaillink.Message) error {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.fail {
		return errors.New("smtp is down")
	}
	o.msgs = append(o.msgs, m)
	return nil
}

func (o *outbox) all() []emaillink.Message {
	o.mu.Lock()
	defer o.mu.Unlock()
	return append([]emaillink.Message(nil), o.msgs...)
}

var (
	tokenRe = regexp.MustCompile(`#token=([A-Za-z0-9_-]+)`)
	codeRe  = regexp.MustCompile(`Or enter this code: ([0-9A-Z-]+)`)
)

func tokenOf(t *testing.T, m emaillink.Message) string {
	t.Helper()
	g := tokenRe.FindStringSubmatch(m.Text)
	if g == nil {
		t.Fatalf("no link in the email:\n%s", m.Text)
	}
	return g[1]
}

func codeOf(t *testing.T, m emaillink.Message) string {
	t.Helper()
	g := codeRe.FindStringSubmatch(m.Text)
	if g == nil {
		t.Fatalf("no code in the email:\n%s", m.Text)
	}
	return g[1]
}

type env struct {
	t       *testing.T
	pool    *pgxpool.Pool
	srv     *httptest.Server
	clock   *clock
	out     *outbox
	method  *emaillink.Method
	ownerID uuid.UUID
	host    *authn.Host
	mux     *api.Mux
}

func setup(t *testing.T, mutate ...func(*emaillink.Config)) *env {
	t.Helper()
	ctx := context.Background()
	pool := pgtest.Pool(t, "emaillink") // an empty schema of this package's own
	if err := pgdb.Migrate(ctx, pool, authn.Migration, authz.Migration, emaillink.Migration); err != nil {
		t.Fatal(err)
	}

	clk := &clock{t: time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC)}
	out := &outbox{}
	cfg := emaillink.Config{
		LinkBaseURL: "http://app.test/signin/link",
		CodeSecret:  "test-secret-test-secret-test-secret-0123",
		AppName:     "Acme Gym",
		Sender:      out,
		Clock:       clk.Now,
	}
	for _, m := range mutate {
		m(&cfg)
	}
	method, err := emaillink.New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	mux := api.NewMux()
	host, err := authn.Register(mux, authn.Config{Pool: pool, Clock: clk.Now, Permissions: authz.Service{Pool: pool}.PermissionsOf}, method)
	if err != nil {
		t.Fatal(err)
	}
	// Routes of the application's own, to see what the guard lets through.
	mux.Handle("GET /api/open", host.Open(func(w http.ResponseWriter, r *http.Request) error {
		return api.JSON(w, 200, map[string]bool{"signedIn": authn.PrincipalFrom(r.Context()) != nil})
	}))
	mux.Handle("GET /api/me-only", host.Guard("", func(w http.ResponseWriter, r *http.Request) error {
		return api.JSON(w, 200, authn.PrincipalFrom(r.Context()).IdentityID)
	}))
	mux.Handle("GET /api/secret", host.Guard("secrets.read", func(w http.ResponseWriter, r *http.Request) error {
		return api.JSON(w, 200, "the secret")
	}))
	mux.Handle("POST /api/secret", host.Guard("secrets.write", func(w http.ResponseWriter, r *http.Request) error {
		return api.JSON(w, 200, "written")
	}))
	mux.Handle("POST /api/fresh", host.Guard("", func(w http.ResponseWriter, r *http.Request) error {
		if err := host.RequireRecentSignIn(r.Context()); err != nil {
			return err
		}
		return api.JSON(w, 200, "fresh")
	}))
	srv := httptest.NewServer(mux)
	t.Cleanup(func() { srv.Close(); method.Wait() })

	id, _, err := method.EnsureIdentity(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	return &env{t: t, pool: pool, srv: srv, clock: clk, out: out, method: method, ownerID: id, host: host, mux: mux}
}

// waitForMail waits until n emails have been "sent", then lets any send still
// in flight finish, so a test that expects no more can say so.
func (e *env) waitForMail(n int) []emaillink.Message {
	e.t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for len(e.out.all()) < n {
		if time.Now().After(deadline) {
			e.t.Fatalf("waited for %d emails, have %d", n, len(e.out.all()))
		}
		time.Sleep(5 * time.Millisecond)
	}
	e.method.Wait()
	return e.out.all()
}

// settle waits for in-flight sends and returns how many emails went out.
func (e *env) settle() int {
	e.method.Wait()
	return len(e.out.all())
}

// browser is a client with cookies that follows who's CSRF protocol like who-client.
type browser struct {
	t    *testing.T
	base string
	http *http.Client
	jar  http.CookieJar
}

func (e *env) browser() *browser {
	jar, _ := cookiejar.New(nil)
	return &browser{
		t: e.t, base: e.srv.URL, jar: jar,
		http: &http.Client{Jar: jar, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }},
	}
}

func (b *browser) cookie(name string) string {
	u, _ := url.Parse(b.base)
	for _, c := range b.jar.Cookies(u) {
		if c.Name == name {
			return c.Value
		}
	}
	return ""
}

func (b *browser) setCookie(name, value string) {
	u, _ := url.Parse(b.base)
	b.jar.SetCookies(u, []*http.Cookie{{Name: name, Value: value, Path: "/"}})
}

type reply struct {
	*http.Response
	body []byte
}

func (b *browser) do(method, path string, body any, csrf bool) reply {
	b.t.Helper()
	var rd io.Reader
	switch v := body.(type) {
	case nil:
	case string:
		rd = strings.NewReader(v)
	default:
		raw, _ := json.Marshal(v)
		rd = bytes.NewReader(raw)
	}
	req, _ := http.NewRequest(method, b.base+path, rd)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if csrf {
		if b.cookie("XSRF-TOKEN") == "" { // the cookie exists after the first response
			b.do("GET", "/api/roux/auth/sign-in", nil, false)
		}
		req.Header.Set("X-XSRF-TOKEN", b.cookie("XSRF-TOKEN"))
	}
	res, err := b.http.Do(req)
	if err != nil {
		b.t.Fatal(err)
	}
	raw, err := io.ReadAll(res.Body)
	if err == nil {
		err = res.Body.Close()
	}
	if err != nil {
		b.t.Fatal(err)
	}
	return reply{Response: res, body: raw}
}

func (b *browser) del(path string) reply            { return b.do("DELETE", path, nil, true) }
func (b *browser) get(path string) reply            { return b.do("GET", path, nil, false) }
func (b *browser) post(path string, body any) reply { return b.do("POST", path, body, true) }
func (b *browser) send(address string) reply {
	return b.post("/api/roux/auth/email/send", map[string]string{"email": address})
}
func (b *browser) signInWithToken(tok string) reply {
	return b.post("/api/roux/auth/email/sign-in", map[string]string{"token": tok})
}
func (b *browser) signInWithCode(addr, code string) reply {
	return b.post("/api/roux/auth/email/sign-in", map[string]string{"email": addr, "code": code})
}

func (r reply) json(t *testing.T) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(r.body, &m); err != nil {
		t.Fatalf("body %q: %v", r.body, err)
	}
	return m
}

func (r reply) failedSignIn(t *testing.T) {
	t.Helper()
	if r.StatusCode != 401 || r.Header.Get("Roux-Error") != "sign-in-failed" {
		t.Fatalf("want 401 sign-in-failed, got %d %s %s", r.StatusCode, r.Header.Get("Roux-Error"), r.body)
	}
}

// issueFor asks for a link and returns the email it produced.
func (e *env) issueFor(b *browser, address string) emaillink.Message {
	e.t.Helper()
	before := e.settle()
	if r := b.send(address); r.StatusCode != 202 {
		e.t.Fatalf("send: %d %s", r.StatusCode, r.body)
	}
	return e.waitForMail(before + 1)[before]
}

func TestSignInOptionsAdvertiseEmail(t *testing.T) {
	e := setup(t)
	got := strings.TrimSpace(string(e.browser().get("/api/roux/auth/sign-in").body))
	if got != `{"email":true,"passkey":false,"providers":[]}` {
		t.Fatalf("sign-in options: %s", got)
	}
}

func TestSendIsAlwaysAccepted(t *testing.T) {
	e := setup(t)
	b := e.browser()
	bodies := []any{
		map[string]string{"email": owner},                 // known: the only one that sends
		map[string]string{"email": "nobody@example.test"}, // unknown
		map[string]string{"email": "not an address"},      // not an address
		map[string]string{"email": ""},                    // blank
		map[string]string{"other": "x"},                   // no email member
		`{"email": 42}`,                                   // not a string
		`{nope`,                                           // not JSON
		`[1,2]`,                                           // not an object
		`{"email":"` + strings.Repeat("a", 9000) + `"}`,   // over the body cap
	}
	for i, body := range bodies {
		r := b.post("/api/roux/auth/email/send", body)
		if r.StatusCode != 202 || len(r.body) != 0 {
			t.Errorf("body %d: %d %q, want 202 and nothing", i, r.StatusCode, r.body)
		}
	}
	if n := e.settle(); n != 1 {
		t.Fatalf("%d emails sent, want exactly 1 (the known address)", n)
	}
	msg := e.out.all()[0]
	if msg.To != owner || msg.Subject != "Sign in to Acme Gym" || !strings.HasPrefix(tokenLink(t, msg), "http://app.test/signin/link#token=") {
		t.Fatalf("the email: %+v", msg)
	}
}

func tokenLink(t *testing.T, m emaillink.Message) string {
	t.Helper()
	return "http://app.test/signin/link#token=" + tokenOf(t, m)
}

func TestSendNeedsACSRFToken(t *testing.T) {
	e := setup(t)
	b := e.browser()
	r := b.do("POST", "/api/roux/auth/email/send", map[string]string{"email": owner}, false)
	if r.StatusCode != 403 || r.Header.Get("Roux-Error") != "invalid-csrf-token" {
		t.Fatalf("%d %s", r.StatusCode, r.body)
	}
	if e.settle() != 0 {
		t.Fatal("a refused request must send nothing")
	}
}

func TestSignInByLink(t *testing.T) {
	e := setup(t)
	b := e.browser()
	msg := e.issueFor(b, owner)
	token := tokenOf(t, msg)
	csrfBefore := b.cookie("XSRF-TOKEN")

	r := b.signInWithToken(token)
	if r.StatusCode != 200 || r.json(t)["identityId"] != e.ownerID.String() {
		t.Fatalf("sign-in: %d %s", r.StatusCode, r.body)
	}
	var session *http.Cookie
	for _, c := range r.Cookies() {
		if c.Name == "SESSION" {
			session = c
		}
	}
	if session == nil || !session.HttpOnly || session.SameSite != http.SameSiteLaxMode || session.Path != "/" || len(session.Value) < 40 {
		t.Fatalf("session cookie: %+v", session)
	}
	if after := b.cookie("XSRF-TOKEN"); after == "" || after == csrfBefore {
		t.Fatalf("the CSRF token must rotate at sign-in (%q -> %q)", csrfBefore, after)
	}
	if n := strings.Count(strings.Join(r.Header.Values("Set-Cookie"), "\n"), "XSRF-TOKEN="); n != 1 {
		t.Fatalf("the response set the XSRF-TOKEN cookie %d times, want once", n)
	}

	me := b.get("/api/roux/auth/me")
	if me.StatusCode != 200 {
		t.Fatalf("/api/roux/auth/me: %d %s", me.StatusCode, me.body)
	}
	body := me.json(t)
	wantUntil := e.clock.Now().Add(10 * time.Minute).Format(time.RFC3339Nano)
	if body["identityId"] != e.ownerID.String() || body["signInMethod"] != "email-link" || body["recentSignInUntil"] != wantUntil {
		t.Fatalf("/api/roux/auth/me: %s", me.body)
	}
	if perms, ok := body["permissions"].([]any); !ok || len(perms) != 0 {
		t.Fatalf("permissions must be an empty array: %s", me.body)
	}
	if creds, _ := body["credentials"].(map[string]any); creds["email"] != float64(1) {
		t.Fatalf("credentials: %s", me.body)
	}

	// A link works once, and spending it ended the code in the same email.
	e.browser().signInWithToken(token).failedSignIn(t)
	e.browser().signInWithCode(owner, codeOf(t, msg)).failedSignIn(t)
}

func TestSignInByTypedCode(t *testing.T) {
	e := setup(t)
	b := e.browser()
	msg := e.issueFor(b, owner)
	code := codeOf(t, msg)
	if !regexp.MustCompile(`^[0-9A-Z]{3}-[0-9A-Z]{3}$`).MatchString(code) {
		t.Fatalf("the email shows the code in groups, like K7F-2QM: %q", code)
	}

	// As a person might type it: lower case, spaces for the dash, a padded address in capitals.
	typed := strings.ToLower(strings.Replace(code, "-", " ", 1))
	r := b.signInWithCode("  "+strings.ToUpper(owner)+" ", typed)
	if r.StatusCode != 200 || r.json(t)["identityId"] != e.ownerID.String() {
		t.Fatalf("sign-in by code: %d %s", r.StatusCode, r.body)
	}
	if got := b.get("/api/roux/auth/me").json(t)["signInMethod"]; got != "email-code" {
		t.Fatalf("signInMethod = %v", got)
	}
	// Using the code ended the link.
	e.browser().signInWithToken(tokenOf(t, msg)).failedSignIn(t)
}

func TestACodeAllowsAFewGuessesThenBurns(t *testing.T) {
	e := setup(t) // 5 attempts by default
	b := e.browser()
	msg := e.issueFor(b, owner)
	code := codeOf(t, msg)
	wrong := wrongCode(code)

	for i := 0; i < 5; i++ {
		e.browser().signInWithCode(owner, wrong).failedSignIn(t)
	}
	// The code is burnt: even the right one fails now...
	e.browser().signInWithCode(owner, code).failedSignIn(t)
	// ...but the link in the same email still works.
	if r := e.browser().signInWithToken(tokenOf(t, msg)); r.StatusCode != 200 {
		t.Fatalf("the link should still work: %d %s", r.StatusCode, r.body)
	}

	// A new request, after the resend interval, brings a fresh code with a fresh count.
	e.clock.advance(61 * time.Second)
	fresh := e.issueFor(b, owner)
	if r := e.browser().signInWithCode(owner, codeOf(t, fresh)); r.StatusCode != 200 {
		t.Fatalf("a fresh code should work: %d %s", r.StatusCode, r.body)
	}
}

// wrongCode returns a valid-looking code that is not the given one.
func wrongCode(code string) string {
	b := []byte(code)
	for i := range b {
		if b[i] != '-' {
			if b[i] == '2' {
				b[i] = '3'
			} else {
				b[i] = '2'
			}
			break
		}
	}
	return string(b)
}

func TestResendIntervalAndReplacement(t *testing.T) {
	e := setup(t)
	b := e.browser()
	first := e.issueFor(b, owner)

	// Asked again inside the interval: still 202, but no new email.
	if r := b.send(owner); r.StatusCode != 202 {
		t.Fatalf("%d", r.StatusCode)
	}
	if n := e.settle(); n != 1 {
		t.Fatalf("%d emails sent within the resend interval, want 1", n)
	}

	// After it, a new request sends a new email and replaces the old link and code.
	e.clock.advance(61 * time.Second)
	second := e.issueFor(b, owner)
	e.browser().signInWithToken(tokenOf(t, first)).failedSignIn(t)
	e.browser().signInWithCode(owner, codeOf(t, first)).failedSignIn(t)
	if r := e.browser().signInWithToken(tokenOf(t, second)); r.StatusCode != 200 {
		t.Fatalf("the newest link should work: %d", r.StatusCode)
	}
}

func TestLinkAndCodeExpireTogether(t *testing.T) {
	e := setup(t)
	b := e.browser()
	msg := e.issueFor(b, owner)
	e.clock.advance(5*time.Minute + time.Second)
	e.browser().signInWithToken(tokenOf(t, msg)).failedSignIn(t)
	e.browser().signInWithCode(owner, codeOf(t, msg)).failedSignIn(t)

	// And just inside the limit both still work.
	e.clock.advance(time.Minute) // let the resend interval pass
	fresh := e.issueFor(b, owner)
	e.clock.advance(5*time.Minute - time.Second)
	if r := e.browser().signInWithToken(tokenOf(t, fresh)); r.StatusCode != 200 {
		t.Fatalf("a link just inside its lifetime should work: %d", r.StatusCode)
	}
}

func TestEveryFailureLooksTheSame(t *testing.T) {
	e := setup(t)
	b := e.browser()
	live := e.issueFor(b, owner)
	disabledID, _, err := e.method.EnsureIdentity(context.Background(), "disabled@example.test")
	if err != nil {
		t.Fatal(err)
	}
	e.clock.advance(61 * time.Second)

	type attempt struct {
		name string
		do   func() reply
	}
	attempts := []attempt{
		{"unknown token", func() reply { return e.browser().signInWithToken("no-such-token") }},
		{"wrong code, live address", func() reply { return e.browser().signInWithCode(owner, wrongCode(codeOf(t, live))) }},
		{"well-formed code, unknown address", func() reply { return e.browser().signInWithCode("nobody@example.test", "K7F-2QM") }},
		{"well-formed code, address with no live code", func() reply { return e.browser().signInWithCode("disabled@example.test", "K7F-2QM") }},
		{"malformed code", func() reply { return e.browser().signInWithCode(owner, "!!") }},
		{"not an address", func() reply { return e.browser().signInWithCode("nope", "K7F-2QM") }},
		{"token and code together", func() reply {
			return e.browser().post("/api/roux/auth/email/sign-in", map[string]string{"token": "x", "email": owner, "code": "K7F-2QM"})
		}},
		{"neither", func() reply { return e.browser().post("/api/roux/auth/email/sign-in", map[string]string{}) }},
		{"not JSON", func() reply { return e.browser().post("/api/roux/auth/email/sign-in", `{nope`) }},
		{"non-string members", func() reply { return e.browser().post("/api/roux/auth/email/sign-in", `{"token": 7}`) }},
	}
	// An inactive identity's link: issue it while active, then disable them.
	var disabledMsg emaillink.Message
	{
		before := e.settle()
		if r := e.browser().send("disabled@example.test"); r.StatusCode != 202 {
			t.Fatal(r.StatusCode)
		}
		disabledMsg = e.waitForMail(before + 1)[before]
		if _, err := e.pool.Exec(context.Background(), `update roux_identity set status = 'DISABLED' where id = $1`, disabledID); err != nil {
			t.Fatal(err)
		}
	}
	attempts = append(attempts, attempt{"inactive identity's link", func() reply { return e.browser().signInWithToken(tokenOf(t, disabledMsg)) }})

	var first reply
	for i, a := range attempts {
		r := a.do()
		r.failedSignIn(t)
		if i == 0 {
			first = r
			continue
		}
		if !bytes.Equal(r.body, first.body) || r.Header.Get("Content-Type") != first.Header.Get("Content-Type") {
			t.Errorf("%s: the answer differs from the first:\n  %s\n  %s", a.name, r.body, first.body)
		}
	}
	want := `{"type":"urn:roux:error:sign-in-failed","title":"Unauthorized","status":401,"detail":"Sign-in failed","code":"sign-in-failed"}`
	if got := strings.TrimSpace(string(first.body)); got != want {
		t.Errorf("body = %s\nwant   %s", got, want)
	}
}

func TestInactiveIdentitiesGetNoEmail(t *testing.T) {
	e := setup(t)
	if _, err := e.pool.Exec(context.Background(), `update roux_identity set status = 'DISABLED' where id = $1`, e.ownerID); err != nil {
		t.Fatal(err)
	}
	if r := e.browser().send(owner); r.StatusCode != 202 {
		t.Fatalf("%d", r.StatusCode)
	}
	if n := e.settle(); n != 0 {
		t.Fatalf("an inactive identity was sent %d emails", n)
	}
	if got := e.method.Issue(context.Background(), owner); got != emaillink.InactiveIdentity {
		t.Fatalf("outcome = %s", got)
	}
}

func TestAFailedSendLeavesNothingBehind(t *testing.T) {
	e := setup(t)
	e.out.mu.Lock()
	e.out.fail = true
	e.out.mu.Unlock()
	if got := e.method.Issue(context.Background(), owner); got != emaillink.SendFailed {
		t.Fatalf("outcome = %s", got)
	}
	var n int
	if err := e.pool.QueryRow(context.Background(), `select count(*) from roux_email_link_token`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("an unsent link must be removed: %d rows, %v", n, err)
	}
	// And it must not count as "sent" for the resend interval: a retry goes straight out.
	e.out.mu.Lock()
	e.out.fail = false
	e.out.mu.Unlock()
	if got := e.method.Issue(context.Background(), owner); got != emaillink.Sent {
		t.Fatalf("retry outcome = %s", got)
	}
}

func TestLogoutEndsTheSession(t *testing.T) {
	e := setup(t)
	b := e.browser()
	b.signInWithToken(tokenOf(t, e.issueFor(b, owner)))
	cookie := b.cookie("SESSION")
	if b.get("/api/roux/auth/me").StatusCode != 200 {
		t.Fatal("not signed in")
	}

	out := b.post("/api/roux/auth/logout", nil)
	if out.StatusCode != 204 {
		t.Fatalf("logout: %d %s", out.StatusCode, out.body)
	}
	if b.cookie("SESSION") != "" || b.cookie("XSRF-TOKEN") != "" {
		t.Fatal("logout must clear both cookies")
	}
	if me := b.get("/api/roux/auth/me"); me.StatusCode != 401 || me.Header.Get("Roux-Error") != "not-signed-in" {
		t.Fatalf("/api/roux/auth/me after logout: %d", me.StatusCode)
	}
	// The old cookie is dead server-side, not just removed from the browser.
	replay := e.browser()
	replay.setCookie("SESSION", cookie)
	if replay.get("/api/roux/auth/me").StatusCode != 401 {
		t.Fatal("a logged-out session cookie must not work again")
	}
	var ended *time.Time
	if err := e.pool.QueryRow(context.Background(), `select ended_at from roux_session`).Scan(&ended); err != nil || ended == nil {
		t.Fatalf("the session row should be ended: %v %v", ended, err)
	}
}

func TestSessionsAreCheckedAgainstTheDatabaseOnEveryRequest(t *testing.T) {
	signedIn := func(e *env) *browser {
		b := e.browser()
		b.signInWithToken(tokenOf(t, e.issueFor(b, owner)))
		if b.get("/api/roux/auth/me").StatusCode != 200 {
			t.Fatal("not signed in")
		}
		return b
	}
	ctx := context.Background()

	t.Run("a disabled identity is out on the next request, for good", func(t *testing.T) {
		e := setup(t)
		b := signedIn(e)
		if _, err := e.pool.Exec(ctx, `update roux_identity set status = 'DISABLED' where id = $1`, e.ownerID); err != nil {
			t.Fatal(err)
		}
		if b.get("/api/roux/auth/me").StatusCode != 401 {
			t.Fatal("a disabled identity kept its session")
		}
		if _, err := e.pool.Exec(ctx, `update roux_identity set status = 'ACTIVE' where id = $1`, e.ownerID); err != nil {
			t.Fatal(err)
		}
		if b.get("/api/roux/auth/me").StatusCode != 401 {
			t.Fatal("re-enabling the identity must not revive the dead session")
		}
	})

	t.Run("a revoked credential ends the sessions it signed in", func(t *testing.T) {
		e := setup(t)
		b := signedIn(e)
		if _, err := e.pool.Exec(ctx, `delete from roux_credential_identity`); err != nil {
			t.Fatal(err)
		}
		if b.get("/api/roux/auth/me").StatusCode != 401 {
			t.Fatal("a session outlived its credential")
		}
	})

	t.Run("sessions expire when idle, and use keeps them alive", func(t *testing.T) {
		e := setup(t)
		b := signedIn(e)
		for i := 0; i < 3; i++ { // each request is 20 minutes after the last: never idle for 30
			e.clock.advance(20 * time.Minute)
			if b.get("/api/roux/auth/me").StatusCode != 200 {
				t.Fatalf("session ended after %d active steps", i)
			}
		}
		e.clock.advance(31 * time.Minute)
		if b.get("/api/roux/auth/me").StatusCode != 401 {
			t.Fatal("an idle session should have ended")
		}
	})

	t.Run("signing in again replaces this browser's session, and a planted cookie is worthless", func(t *testing.T) {
		e := setup(t)
		b := e.browser()
		b.setCookie("SESSION", "planted-by-an-attacker")
		b.signInWithToken(tokenOf(t, e.issueFor(b, owner)))
		first := b.cookie("SESSION")
		if first == "planted-by-an-attacker" || first == "" {
			t.Fatalf("sign-in must issue a fresh session cookie, got %q", first)
		}
		planted := e.browser()
		planted.setCookie("SESSION", "planted-by-an-attacker")
		if planted.get("/api/roux/auth/me").StatusCode != 401 {
			t.Fatal("a planted cookie authenticated")
		}

		e.clock.advance(61 * time.Second)
		b.signInWithToken(tokenOf(t, e.issueFor(b, owner)))
		if b.cookie("SESSION") == first {
			t.Fatal("a second sign-in must rotate the session cookie")
		}
		old := e.browser()
		old.setCookie("SESSION", first)
		if old.get("/api/roux/auth/me").StatusCode != 401 {
			t.Fatal("the session this browser had before signing in again must be ended")
		}
	})

	t.Run("the cookie is never stored", func(t *testing.T) {
		e := setup(t)
		b := signedIn(e)
		var n int
		if err := e.pool.QueryRow(ctx, `select count(*) from roux_session where token_hash = $1`, b.cookie("SESSION")).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 0 {
			t.Fatal("the raw cookie value is in the database")
		}
		if err := e.pool.QueryRow(ctx, `select count(*) from roux_session where length(token_hash) = 64`).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 1 {
			t.Fatal("only its SHA-256 should be stored")
		}
	})
}

func TestNothingSecretIsStoredInTheClear(t *testing.T) {
	e := setup(t)
	msg := e.issueFor(e.browser(), owner)
	token, code := tokenOf(t, msg), strings.ReplaceAll(codeOf(t, msg), "-", "")
	var tokenHash, codeHash string
	if err := e.pool.QueryRow(context.Background(), `select token_hash, code_hash from roux_email_link_token`).Scan(&tokenHash, &codeHash); err != nil {
		t.Fatal(err)
	}
	for _, stored := range []string{tokenHash, codeHash} {
		if len(stored) != 64 || stored == token || strings.Contains(stored, code) {
			t.Errorf("stored value %q looks like a secret in the clear", stored)
		}
	}
}

func TestOnlyOneOfManyConcurrentCorrectCodesWins(t *testing.T) {
	e := setup(t)
	msg := e.issueFor(e.browser(), owner)
	code := codeOf(t, msg)

	const racers = 8
	browsers := make([]*browser, racers)
	for i := range browsers {
		browsers[i] = e.browser()
		browsers[i].get("/api/roux/auth/sign-in") // get a CSRF cookie before the race
	}
	statuses := make(chan int, racers)
	var start sync.WaitGroup
	start.Add(1)
	for _, b := range browsers {
		go func() {
			start.Wait()
			statuses <- b.signInWithCode(owner, code).StatusCode
		}()
	}
	start.Done()
	wins := 0
	for i := 0; i < racers; i++ {
		switch s := <-statuses; s {
		case 200:
			wins++
		case 401:
		default:
			t.Errorf("unexpected status %d", s)
		}
	}
	if wins != 1 {
		t.Fatalf("%d of %d concurrent submissions of the same code signed in, want exactly 1", wins, racers)
	}
}

func TestConcurrentGuessesCannotExceedTheAttemptLimit(t *testing.T) {
	e := setup(t) // 5 attempts
	msg := e.issueFor(e.browser(), owner)
	code := codeOf(t, msg)
	wrong := wrongCode(code)

	const guesses = 40
	var wg sync.WaitGroup
	var start sync.WaitGroup
	start.Add(1)
	for i := 0; i < guesses; i++ {
		b := e.browser()
		b.get("/api/roux/auth/sign-in")
		wg.Add(1)
		go func() {
			defer wg.Done()
			start.Wait()
			b.signInWithCode(owner, wrong).failedSignIn(t)
		}()
	}
	start.Done()
	wg.Wait()

	var attempts int
	if err := e.pool.QueryRow(context.Background(), `select code_attempts from roux_email_link_token`).Scan(&attempts); err != nil {
		t.Fatal(err)
	}
	if attempts != 5 {
		t.Fatalf("%d guesses were counted, want exactly the limit (5): later ones must not even be checked", attempts)
	}
	e.browser().signInWithCode(owner, code).failedSignIn(t) // burnt
}

func TestRegisteringAddresses(t *testing.T) {
	e := setup(t)
	ctx := context.Background()

	// EnsureIdentity is idempotent and case-insensitive.
	id, created, err := e.method.EnsureIdentity(ctx, "  OWNER@Example.Test ")
	if err != nil || created || id != e.ownerID {
		t.Fatalf("existing owner: %v %v %v", id, created, err)
	}
	other, created, err := e.method.EnsureIdentity(ctx, "second@example.test")
	if err != nil || !created || other == e.ownerID {
		t.Fatalf("new identity: %v %v %v", other, created, err)
	}

	// An address belongs to one identity; registering it again for the same one is a no-op.
	if err := e.method.Register(ctx, e.ownerID, "second@example.test"); !errors.Is(err, emaillink.ErrAddressTaken) {
		t.Fatalf("taken address: %v", err)
	}
	if err := e.method.Register(ctx, other, "Second@Example.Test"); err != nil {
		t.Fatalf("re-registering for the same identity: %v", err)
	}
	// A second address for the same identity, and the credential count reports it.
	if err := e.method.Register(ctx, e.ownerID, "owner+alias@example.test"); err != nil {
		t.Fatal(err)
	}
	b := e.browser()
	b.signInWithToken(tokenOf(t, e.issueFor(b, "owner+alias@example.test")))
	me := b.get("/api/roux/auth/me").json(t)
	if creds := me["credentials"].(map[string]any); creds["email"] != float64(2) || me["identityId"] != e.ownerID.String() {
		t.Fatalf("/api/roux/auth/me: %v", me)
	}
	for _, bad := range []string{"", "nope", "a b@c.d"} {
		if err := e.method.Register(ctx, e.ownerID, bad); err == nil {
			t.Errorf("Register(%q) should fail", bad)
		}
	}
	// A credential whose identity is gone can be taken over.
	if _, err := e.pool.Exec(ctx, `delete from roux_credential_identity where credential_id = (select id from roux_email_credential where address = 'second@example.test')`); err != nil {
		t.Fatal(err)
	}
	if err := e.method.Register(ctx, e.ownerID, "second@example.test"); err != nil {
		t.Fatalf("an orphaned address should be registrable: %v", err)
	}
}

func TestAMethodNeedsAPool(t *testing.T) {
	m, err := emaillink.New(emaillink.Config{
		LinkBaseURL: "http://x/y", CodeSecret: strings.Repeat("s", 32), Sender: emaillink.SenderFunc(func(context.Context, emaillink.Message) error { return nil }),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := authn.Register(api.NewMux(), authn.Config{}, m); err == nil || !strings.Contains(err.Error(), "Pool is required") {
		t.Fatalf("err = %v", err)
	}
}
