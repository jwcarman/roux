package passkey_test

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authn/authntest"
	"github.com/jwcarman/roux/authn/passkey"
	"github.com/jwcarman/roux/authn/passkey/passkeytest"
)

func tw(f func(*passkeytest.Tweaks)) passkeytest.Tweaks {
	var t passkeytest.Tweaks
	f(&t)
	return t
}

func u32(v uint32) *uint32 { return &v }

func TestTheSignInPageIsToldPasskeysAreOn(t *testing.T) {
	f := setup(t)
	if got := strings.TrimSpace(string(f.Browser().Get("/api/roux/auth/sign-in").Body)); got != `{"email":true,"passkey":true,"providers":[]}` {
		t.Fatalf("%s", got)
	}
}

func TestRegistrationOptionsAreWhatTheBrowserNeeds(t *testing.T) {
	f := setup(t)
	_, b := f.person("ada@example.test")

	reg := b.Post("/api/roux/auth/me/passkeys/options", nil)
	var o map[string]any
	reg.Decode(t, &o)
	rp, user := o["rp"].(map[string]any), o["user"].(map[string]any)
	sel := o["authenticatorSelection"].(map[string]any)
	if reg.StatusCode != 200 || o["publicKey"] != nil { // top level, not wrapped: the client spreads it
		t.Fatalf("%d %s", reg.StatusCode, reg.Body)
	}
	if rp["id"] != "localhost" || rp["name"] != "Acme Gym" || o["attestation"] != "none" {
		t.Fatalf("rp/attestation: %s", reg.Body)
	}
	if sel["residentKey"] != "required" || sel["requireResidentKey"] != true || sel["userVerification"] != "required" {
		t.Fatalf("the passkey must be discoverable and verify the user: %v", sel)
	}
	if user["name"] != "ada@example.test" || user["displayName"] != "ada@example.test" || len(user["id"].(string)) != 86 { // 64 bytes, base64url
		t.Fatalf("user: %v", user)
	}
	if len(o["challenge"].(string)) < 20 {
		t.Fatalf("challenge: %v", o["challenge"])
	}
	algs := map[float64]bool{}
	for _, p := range o["pubKeyCredParams"].([]any) {
		algs[p.(map[string]any)["alg"].(float64)] = true
	}
	if !algs[-7] {
		t.Fatalf("ES256 must be offered: %v", o["pubKeyCredParams"])
	}
	if ex, _ := o["excludeCredentials"].([]any); len(ex) != 0 {
		t.Fatalf("nothing to exclude yet: %v", ex)
	}
	cookie := reg.Header.Get("Set-Cookie")
	if !strings.Contains(cookie, "PASSKEY_CEREMONY=") || !strings.Contains(cookie, "HttpOnly") || !strings.Contains(cookie, "SameSite=Lax") {
		t.Fatalf("ceremony cookie: %q", cookie)
	}
}

// Sign-in options need no session, ask for user verification, and name no one.
func TestSignInOptionsAreWhatTheBrowserNeeds(t *testing.T) {
	f := setup(t)
	in := f.Browser().Post("/api/roux/auth/passkey/sign-in/options", nil)
	var s map[string]any
	in.Decode(t, &s)
	if in.StatusCode != 200 || s["rpId"] != "localhost" || s["userVerification"] != "required" || len(s["challenge"].(string)) < 20 {
		t.Fatalf("%d %s", in.StatusCode, in.Body)
	}
	if allowed, _ := s["allowCredentials"].([]any); len(allowed) != 0 {
		t.Fatalf("a discoverable sign-in names no credentials: %v", allowed)
	}
	// Each challenge is fresh.
	var again map[string]any
	f.Browser().Post("/api/roux/auth/passkey/sign-in/options", nil).Decode(t, &again)
	if again["challenge"] == s["challenge"] {
		t.Fatal("two sign-ins shared a challenge")
	}
}

func TestRegisteringAndSigningIn(t *testing.T) {
	f := setup(t)
	id, b := f.person("ada@example.test")

	r := f.register(b, "Laptop", passkeytest.Tweaks{})
	if r.StatusCode != 200 || strings.TrimSpace(string(r.Body)) != `{"success":true}` {
		t.Fatalf("register: %d %s", r.StatusCode, r.Body)
	}
	// /api/roux/auth/me counts it, beside the email address.
	creds := b.Get("/api/roux/auth/me").JSON(t)["credentials"].(map[string]any)
	if creds["email"] != float64(1) || creds["passkey"] != float64(1) {
		t.Fatalf("credentials: %v", creds)
	}

	// Someone with no session signs in with it.
	anon := f.Browser()
	csrfBefore := anon.Cookie("XSRF-TOKEN")
	r = f.signIn(anon, passkeytest.Tweaks{})
	if r.StatusCode != 200 || r.JSON(t)["identityId"] != id.String() {
		t.Fatalf("sign in: %d %s", r.StatusCode, r.Body)
	}
	me := anon.Get("/api/roux/auth/me").JSON(t)
	if me["identityId"] != id.String() || me["signInMethod"] != "passkey" {
		t.Fatalf("/api/roux/auth/me: %v", me)
	}
	if anon.Cookie("XSRF-TOKEN") == csrfBefore {
		t.Fatal("the CSRF token must rotate at sign-in")
	}
	if anon.Cookie("SESSION") == "" || anon.Cookie("PASSKEY_CEREMONY") != "" {
		t.Fatal("sign-in sets a session and spends the ceremony cookie")
	}

	// And again: the counter moves forward, and the passkey records its use.
	f.signIn(f.Browser(), passkeytest.Tweaks{}).Want(t, 200, "second sign-in")
	list := b.Get("/api/roux/auth/me/passkeys")
	var passkeys []map[string]any
	list.Decode(t, &passkeys)
	if len(passkeys) != 1 || passkeys[0]["label"] != "Laptop" || passkeys[0]["credentialId"] != f.auth.CredentialID(0) || passkeys[0]["lastUsedAt"] == nil {
		t.Fatalf("list: %s", list.Body)
	}
}

func TestRegistrationNeedsASignedInFreshSession(t *testing.T) {
	f := setup(t)
	_, b := f.person("ada@example.test")

	for _, path := range []string{"/api/roux/auth/me/passkeys/options", "/api/roux/auth/me/passkeys"} {
		r := f.Browser().Post(path, nil)
		if body := r.JSON(t); r.StatusCode != 401 || body["code"] != "not-signed-in" || r.Header.Get("Roux-Error") != "not-signed-in" {
			t.Fatalf("%s signed out: %d %s", path, r.StatusCode, r.Body)
		}
	}

	f.advance(11 * time.Minute) // a live session (30 minutes idle), but not a recent sign-in
	for _, path := range []string{"/api/roux/auth/me/passkeys/options", "/api/roux/auth/me/passkeys"} {
		r := b.Post(path, nil)
		if body := r.JSON(t); r.StatusCode != 401 || body["code"] != "reauthentication-required" {
			t.Fatalf("%s stale: %d %s", path, r.StatusCode, r.Body)
		}
	}
	if f.count(`select count(*) from roux_passkey_credential`) != 0 || f.count(`select count(*) from roux_passkey_ceremony`) != 0 {
		t.Fatal("a refused request left something behind")
	}
}

func TestLabelsAreChecked(t *testing.T) {
	f := setup(t)
	_, b := f.person("ada@example.test")
	bad := map[string]string{
		"empty": "", "blank": "   ", "too long": strings.Repeat("x", 65),
		"newline": "Lap\ntop", "tab": "Lap\ttop", "escape": "Lap\x1btop",
	}
	for name, label := range bad {
		r := f.register(b, label, passkeytest.Tweaks{})
		if body := r.JSON(t); r.StatusCode != 400 || body["code"] != "invalid-passkey-registration" || body["type"] != "urn:roux:error:invalid-passkey-registration" {
			t.Errorf("%s: %d %s", name, r.StatusCode, r.Body)
		}
	}
	if f.count(`select count(*) from roux_passkey_credential`) != 0 {
		t.Fatal("a refused label registered a passkey")
	}
	// Sixty-four characters is fine, whatever their width.
	f.register(b, strings.Repeat("é", 64), passkeytest.Tweaks{}).Want(t, 200, "64 characters")
}

func TestRegistrationsThatDoNotVerifyAreRefused(t *testing.T) {
	f := setup(t)
	_, b := f.person("ada@example.test")
	cases := map[string]passkeytest.Tweaks{
		"wrong origin":         tw(func(t *passkeytest.Tweaks) { t.Origin = "https://evil.example" }),
		"wrong challenge":      tw(func(t *passkeytest.Tweaks) { t.Challenge = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }),
		"wrong relying party":  tw(func(t *passkeytest.Tweaks) { t.RPID = "evil.example" }),
		"no user verification": tw(func(t *passkeytest.Tweaks) { t.NoUserVerification = true }),
		"no user presence":     tw(func(t *passkeytest.Tweaks) { t.NoUserPresence = true }),
	}
	for name, tweaks := range cases {
		r := f.register(b, "Laptop", tweaks)
		if body := r.JSON(t); r.StatusCode != 400 || body["code"] != "invalid-passkey-registration" {
			t.Errorf("%s: %d %s", name, r.StatusCode, r.Body)
		}
	}
	if f.count(`select count(*) from roux_passkey_credential`) != 0 || f.count(`select count(*) from roux_credential_identity where credential_id not in (select credential_id from roux_credential_identity limit 0) and credential_id in (select credential_uuid from roux_passkey_credential)`) != 0 {
		t.Fatal("a refused registration left a passkey")
	}
}

func TestACeremonyIsUsedOnce(t *testing.T) {
	f := setup(t)
	_, b := f.person("ada@example.test")

	// No options asked for.
	r := b.Post("/api/roux/auth/me/passkeys", map[string]any{"publicKey": map[string]any{"credential": map[string]any{}, "label": "x"}})
	if body := r.JSON(t); r.StatusCode != 400 || body["code"] != "invalid-request" {
		t.Fatalf("no ceremony: %d %s", r.StatusCode, r.Body)
	}

	// The same options cannot be answered twice.
	opts := b.Post("/api/roux/auth/me/passkeys/options", nil)
	body := map[string]any{"publicKey": map[string]any{"credential": f.auth.Create(opts.Body, passkeytest.Tweaks{}), "label": "Laptop"}}
	b.Post("/api/roux/auth/me/passkeys", body).Want(t, 200, "first")
	b.SetCookie("PASSKEY_CEREMONY", "") // the browser threw it away; replay what it had
	b.Post("/api/roux/auth/me/passkeys", body).Want(t, 400, "replay")
	if f.count(`select count(*) from roux_passkey_credential`) != 1 {
		t.Fatal("a replay registered a second passkey")
	}

	// A wrong answer spends the ceremony too: there is no trying again with the same challenge.
	opts = b.Post("/api/roux/auth/me/passkeys/options", nil)
	bad := map[string]any{"publicKey": map[string]any{"credential": f.auth.Create(opts.Body, tw(func(t *passkeytest.Tweaks) { t.Origin = "https://evil.example" })), "label": "x"}}
	b.Post("/api/roux/auth/me/passkeys", bad)
	good := map[string]any{"publicKey": map[string]any{"credential": f.auth.Create(opts.Body, passkeytest.Tweaks{}), "label": "y"}}
	b.Post("/api/roux/auth/me/passkeys", good).Want(t, 400, "after a refused attempt")

	// An expired ceremony is no ceremony.
	opts = b.Post("/api/roux/auth/me/passkeys/options", nil)
	f.advance(6 * time.Minute)
	late := map[string]any{"publicKey": map[string]any{"credential": f.auth.Create(opts.Body, passkeytest.Tweaks{}), "label": "z"}}
	b2 := f.SignedIn(mustIdentity(t, f, "ada@example.test")) // a fresh sign-in: the old one is stale by now
	b2.SetCookie("PASSKEY_CEREMONY", b.Cookie("PASSKEY_CEREMONY"))
	b2.Post("/api/roux/auth/me/passkeys", late).Want(t, 400, "expired")
}

func whoNew(f *fx) (uuid.UUID, error) {
	return authn.CreateIdentity(context.Background(), f.Pool, f.Clock.Now())
}

func mustIdentity(t *testing.T, f *fx, address string) (id uuid.UUID) {
	t.Helper()
	got, _, err := f.email.EnsureIdentity(context.Background(), address)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func TestARegistrationBelongsToWhoAskedForIt(t *testing.T) {
	f := setup(t)
	_, ada := f.person("ada@example.test")
	_, grace := f.person("grace@example.test")

	// Ada asks for options; before she answers, Grace signs in on the same browser.
	opts := ada.Post("/api/roux/auth/me/passkeys/options", nil)
	ada.SetCookie("SESSION", grace.Cookie("SESSION"))
	r := ada.Post("/api/roux/auth/me/passkeys", map[string]any{"publicKey": map[string]any{"credential": f.auth.Create(opts.Body, passkeytest.Tweaks{}), "label": "Laptop"}})
	if body := r.JSON(t); r.StatusCode != 400 || body["code"] != "invalid-passkey-registration" {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	if f.count(`select count(*) from roux_passkey_credential`) != 0 {
		t.Fatal("Ada's ceremony registered a passkey for Grace")
	}
}

func TestEverySignInFailureLooksTheSame(t *testing.T) {
	f := setup(t)
	id, b := f.person("ada@example.test")
	f.register(b, "Laptop", passkeytest.Tweaks{}).Want(t, 200, "registering a passkey")
	stranger := passkeytest.New(t, origin, rpID) // holds no registered passkey
	stranger.Create([]byte(`{"challenge":"AAAA","user":{"id":"AAAA"}}`), passkeytest.Tweaks{})

	attempt := func(name string, run func() authntest.Reply) authntest.Reply {
		r := run()
		if r.StatusCode != 401 || r.Header.Get("Roux-Error") != "sign-in-failed" {
			t.Errorf("%s: %d %s", name, r.StatusCode, r.Body)
		}
		return r
	}
	sign := func(auth *passkeytest.Authenticator, tweaks passkeytest.Tweaks) func() authntest.Reply {
		return func() authntest.Reply {
			br := f.Browser()
			opts := br.Post("/api/roux/auth/passkey/sign-in/options", nil)
			return br.Post("/api/roux/auth/passkey/sign-in", auth.Get(opts.Body, tweaks))
		}
	}
	first := attempt("tampered signature", sign(f.auth, tw(func(t *passkeytest.Tweaks) { t.CorruptSignature = true })))
	for name, run := range map[string]func() authntest.Reply{
		"wrong origin":         sign(f.auth, tw(func(t *passkeytest.Tweaks) { t.Origin = "https://evil.example" })),
		"wrong challenge":      sign(f.auth, tw(func(t *passkeytest.Tweaks) { t.Challenge = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" })),
		"wrong relying party":  sign(f.auth, tw(func(t *passkeytest.Tweaks) { t.RPID = "evil.example" })),
		"no user verification": sign(f.auth, tw(func(t *passkeytest.Tweaks) { t.NoUserVerification = true })),
		"unknown passkey":      sign(stranger, passkeytest.Tweaks{}),
		"wrong user handle":    sign(f.auth, tw(func(t *passkeytest.Tweaks) { t.UserHandle = []byte("someone else") })),
		"no user handle":       sign(f.auth, tw(func(t *passkeytest.Tweaks) { t.OmitUserHandle = true })),
		"no ceremony": func() authntest.Reply {
			br := f.Browser()
			opts := br.Post("/api/roux/auth/passkey/sign-in/options", nil)
			br.SetCookie("PASSKEY_CEREMONY", "")
			return br.Post("/api/roux/auth/passkey/sign-in", f.auth.Get(opts.Body, passkeytest.Tweaks{}))
		},
		"a registration's ceremony": func() authntest.Reply {
			br := f.SignedIn(id)
			opts := br.Post("/api/roux/auth/me/passkeys/options", nil) // a 'register' ceremony cookie
			return br.Post("/api/roux/auth/passkey/sign-in", f.auth.Get(opts.Body, passkeytest.Tweaks{}))
		},
		"not JSON": func() authntest.Reply {
			br := f.Browser()
			br.Post("/api/roux/auth/passkey/sign-in/options", nil)
			return br.Post("/api/roux/auth/passkey/sign-in", `{nope`)
		},
	} {
		r := attempt(name, run)
		if string(r.Body) != string(first.Body) {
			t.Errorf("%s: the answer differs:\n  %s\n  %s", name, r.Body, first.Body)
		}
	}
	want := `{"type":"urn:roux:error:sign-in-failed","title":"Unauthorized","status":401,"detail":"Sign-in failed","code":"sign-in-failed"}`
	if got := strings.TrimSpace(string(first.Body)); got != want {
		t.Errorf("body = %s", got)
	}
	// And after all of that, the real thing still works.
	f.signIn(f.Browser(), passkeytest.Tweaks{}).Want(t, 200, "real sign-in")
}

func TestAnAssertionCanBeUsedOnce(t *testing.T) {
	f := setup(t)
	_, b := f.person("ada@example.test")
	f.register(b, "Laptop", passkeytest.Tweaks{})

	br := f.Browser()
	opts := br.Post("/api/roux/auth/passkey/sign-in/options", nil)
	assertion := f.auth.Get(opts.Body, passkeytest.Tweaks{})
	cookie := br.Cookie("PASSKEY_CEREMONY")
	br.Post("/api/roux/auth/passkey/sign-in", assertion).Want(t, 200, "first")
	replay := f.Browser()
	replay.Post("/api/roux/auth/passkey/sign-in/options", nil) // gets a CSRF token
	replay.SetCookie("PASSKEY_CEREMONY", cookie)               // an eavesdropper has the cookie and the response
	replay.Post("/api/roux/auth/passkey/sign-in", assertion).Want(t, 401, "replay")

	// Many at once: still exactly one wins.
	br = f.Browser()
	opts = br.Post("/api/roux/auth/passkey/sign-in/options", nil)
	assertion = f.auth.Get(opts.Body, passkeytest.Tweaks{})
	cookie = br.Cookie("PASSKEY_CEREMONY")
	var wg, start sync.WaitGroup
	start.Add(1)
	statuses := make(chan int, 8)
	for i := 0; i < 8; i++ {
		racer := f.Browser()
		racer.Post("/api/roux/auth/passkey/sign-in/options", nil)
		racer.SetCookie("PASSKEY_CEREMONY", cookie)
		wg.Add(1)
		go func() {
			defer wg.Done()
			start.Wait()
			statuses <- racer.Post("/api/roux/auth/passkey/sign-in", assertion).StatusCode
		}()
	}
	start.Done()
	wg.Wait()
	close(statuses)
	wins := 0
	for s := range statuses {
		if s == 200 {
			wins++
		}
	}
	if wins != 1 {
		t.Fatalf("%d of 8 identical submissions signed in, want 1", wins)
	}
}

func TestACopiedAuthenticatorIsRefused(t *testing.T) {
	f := setup(t)
	_, b := f.person("ada@example.test")
	f.register(b, "Laptop", passkeytest.Tweaks{})

	f.signIn(f.Browser(), tw(func(t *passkeytest.Tweaks) { t.SignCount = u32(10) })).Want(t, 200, "count 10")
	// The counter goes backwards: a copy of the authenticator is in use somewhere.
	if r := f.signIn(f.Browser(), tw(func(t *passkeytest.Tweaks) { t.SignCount = u32(3) })); r.StatusCode != 401 || r.Header.Get("Roux-Error") != "sign-in-failed" {
		t.Fatalf("regression: %d %s", r.StatusCode, r.Body)
	}
}

func TestSignInChecksTheIdentityAndTheLink(t *testing.T) {
	f := setup(t)
	id, b := f.person("ada@example.test")
	f.register(b, "Laptop", passkeytest.Tweaks{})
	ctx := context.Background()

	if _, err := f.Pool.Exec(ctx, `update roux_identity set status = 'DISABLED' where id = $1`, id); err != nil {
		t.Fatal(err)
	}
	f.signIn(f.Browser(), passkeytest.Tweaks{}).Want(t, 401, "disabled identity")
	if _, err := f.Pool.Exec(ctx, `update roux_identity set status = 'ACTIVE' where id = $1`, id); err != nil {
		t.Fatal(err)
	}
	f.signIn(f.Browser(), passkeytest.Tweaks{}).Want(t, 200, "active again")

	if _, err := f.Pool.Exec(ctx, `delete from roux_credential_identity where credential_id in (select credential_uuid from roux_passkey_credential)`); err != nil {
		t.Fatal(err)
	}
	f.signIn(f.Browser(), passkeytest.Tweaks{}).Want(t, 401, "a passkey unlinked from its identity")
}

// laptopAndPhone registers two passkeys for the browser, a minute apart, and lists them.
func (f *fx) laptopAndPhone(b *authntest.Browser) []map[string]any {
	f.T.Helper()
	t := f.T
	f.register(b, "Laptop", passkeytest.Tweaks{})
	f.advance(time.Minute)
	opts := b.Post("/api/roux/auth/me/passkeys/options", nil)
	if ex, _ := opts.JSON(t)["excludeCredentials"].([]any); len(ex) != 1 {
		t.Fatalf("the first passkey must be excluded from the second registration: %s", opts.Body)
	}
	phone := passkeytest.New(t, origin, rpID)
	b.Post("/api/roux/auth/me/passkeys", map[string]any{"publicKey": map[string]any{"credential": phone.Create(opts.Body, passkeytest.Tweaks{}), "label": "Phone"}})
	return f.listFor(b)
}

func TestListingPasskeys(t *testing.T) {
	f := setup(t)
	_, b := f.person("ada@example.test")
	list := f.laptopAndPhone(b)

	if len(list) != 2 || list[0]["label"] != "Laptop" || list[1]["label"] != "Phone" || list[0]["lastUsedAt"] != nil {
		t.Fatalf("oldest first, never used: %v", list)
	}
	if len(list[0]) != 4 || list[0]["createdAt"] == nil {
		t.Fatalf("shape: %v", list[0])
	}
	if r := f.Browser().Get("/api/roux/auth/me/passkeys"); r.StatusCode != 401 || r.Header.Get("Roux-Error") != "not-signed-in" {
		t.Fatalf("signed out: %d", r.StatusCode)
	}
}

func TestRemovingAPasskey(t *testing.T) {
	f := setup(t)
	_, b := f.person("ada@example.test")
	laptop := f.laptopAndPhone(b)[0]["credentialId"].(string)

	// Removing someone else's, one that is not there, and nonsense are all the same 404.
	_, grace := f.person("grace@example.test")
	for _, c := range []struct {
		name string
		by   *authntest.Browser
		id   string
	}{{"another's", grace, laptop}, {"missing", b, "AAAAAAAAAAAAAAAA"}, {"garbage", b, "***"}} {
		if r := c.by.Delete("/api/roux/auth/me/passkeys/" + c.id); r.StatusCode != 404 || r.JSON(t)["code"] != "passkey-not-found" {
			t.Errorf("%s: %d %s", c.name, r.StatusCode, r.Body)
		}
	}
	if len(f.listFor(b)) != 2 {
		t.Fatal("a refused removal removed something")
	}

	// A stale sign-in is refused before the id is looked at.
	f.advance(11 * time.Minute)
	if r := b.Delete("/api/roux/auth/me/passkeys/" + laptop); r.StatusCode != 401 || r.JSON(t)["code"] != "reauthentication-required" {
		t.Fatalf("stale: %d %s", r.StatusCode, r.Body)
	}
	b.Delete("/api/roux/auth/me/passkeys/nonsense!").Want(t, 401, "stale, with a bad id")
	_, fresh := f.person("ada@example.test")
	if r := fresh.Delete("/api/roux/auth/me/passkeys/"+laptop).Want(t, 204, "remove"); len(r.Body) != 0 {
		t.Fatalf("remove answered %s", r.Body)
	}
	if got := f.listFor(fresh); len(got) != 1 || got[0]["label"] != "Phone" {
		t.Fatalf("after removal: %v", got)
	}
	// It can no longer sign in.
	f.signIn(f.Browser(), passkeytest.Tweaks{Credential: 0}).Want(t, 401, "a removed passkey signed in")
}

func (f *fx) listFor(b *authntest.Browser) []map[string]any {
	f.T.Helper()
	var list []map[string]any
	r := b.Get("/api/roux/auth/me/passkeys")
	if r.StatusCode != 200 {
		f.T.Fatalf("list: %d %s", r.StatusCode, r.Body)
	}
	if err := json.Unmarshal(r.Body, &list); err != nil {
		f.T.Fatal(err)
	}
	return list
}

func TestTheLastWayInStays(t *testing.T) {
	f := setup(t)
	id, b := f.person("ada@example.test")
	f.register(b, "Laptop", passkeytest.Tweaks{})
	// Ada loses her email address: the passkey is now her only way in.
	if _, err := f.Pool.Exec(context.Background(), `delete from roux_credential_identity where credential_id in (select id from roux_email_credential)`); err != nil {
		t.Fatal(err)
	}

	passkeyID := f.auth.CredentialID(0)
	signed := f.Browser()
	f.signIn(signed, passkeytest.Tweaks{}).Want(t, 200, "signing in with the passkey")
	r := signed.Delete("/api/roux/auth/me/passkeys/" + passkeyID)
	if body := r.JSON(t); r.StatusCode != 409 || body["code"] != "last-credential" || r.Header.Get("Roux-Error") != "last-credential" {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	if len(f.listFor(signed)) != 1 {
		t.Fatal("the last passkey was removed")
	}
	_ = id
}

func TestTwoRemovalsAtOnceCannotRemoveEveryWayIn(t *testing.T) {
	f := setup(t)
	_, b := f.person("ada@example.test")
	second := passkeytest.New(t, origin, rpID)
	f.register(b, "One", passkeytest.Tweaks{})
	opts := b.Post("/api/roux/auth/me/passkeys/options", nil)
	b.Post("/api/roux/auth/me/passkeys", map[string]any{"publicKey": map[string]any{"credential": second.Create(opts.Body, passkeytest.Tweaks{}), "label": "Two"}})
	if _, err := f.Pool.Exec(context.Background(), `delete from roux_credential_identity where credential_id in (select id from roux_email_credential)`); err != nil {
		t.Fatal(err)
	}

	// Two browsers signed in by passkey (one session each), each removing a different passkey.
	signIn := func(a *passkeytest.Authenticator) *authntest.Browser {
		br := f.Browser()
		o := br.Post("/api/roux/auth/passkey/sign-in/options", nil)
		br.Post("/api/roux/auth/passkey/sign-in", a.Get(o.Body, passkeytest.Tweaks{})).Want(t, 200, "POST /api/roux/auth/passkey/sign-in")
		return br
	}
	one, two := signIn(f.auth), signIn(second)

	var wg, start sync.WaitGroup
	start.Add(1)
	statuses := make(chan int, 2)
	for _, c := range []struct {
		b  *authntest.Browser
		id string
	}{{one, f.auth.CredentialID(0)}, {two, second.CredentialID(0)}} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			start.Wait()
			statuses <- c.b.Delete("/api/roux/auth/me/passkeys/" + c.id).StatusCode
		}()
	}
	start.Done()
	wg.Wait()
	close(statuses)
	var got []int
	for s := range statuses {
		got = append(got, s)
	}
	ok, refused := 0, 0
	for _, s := range got {
		switch s {
		case 204:
			ok++
		case 409:
			refused++
		}
	}
	if ok != 1 || refused != 1 {
		t.Fatalf("statuses %v: exactly one removal may succeed", got)
	}
	if n := f.count(`select count(*) from roux_passkey_credential`); n != 1 {
		t.Fatalf("%d passkeys left, want 1", n)
	}
}

func TestRemovingThePasskeyASessionSignedInWithEndsThatSession(t *testing.T) {
	f := setup(t)
	_, b := f.person("ada@example.test")
	f.register(b, "Laptop", passkeytest.Tweaks{})

	viaPasskey := f.Browser()
	f.signIn(viaPasskey, passkeytest.Tweaks{}).Want(t, 200, "signing in with the passkey")
	if r := viaPasskey.Delete("/api/roux/auth/me/passkeys/" + f.auth.CredentialID(0)); r.StatusCode != 204 { // her email remains
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	if viaPasskey.Get("/api/roux/auth/me").StatusCode != 401 {
		t.Fatal("a session outlived the passkey it signed in with")
	}
	if b.Get("/api/roux/auth/me").StatusCode != 200 {
		t.Fatal("the other session (signed in another way) must be untouched")
	}
}

func TestTheOwnerIsToldWhenAPasskeyIsAdded(t *testing.T) {
	f := setup(t)
	_, b := f.person("ada@example.test")
	f.register(b, "Ada's <Laptop>", passkeytest.Tweaks{})
	f.pk.Wait()

	mail := f.out.all()
	if len(mail) != 1 || mail[0].To != "ada@example.test" || mail[0].Subject != "A passkey was added to your Acme Gym account" {
		t.Fatalf("mail: %+v", mail)
	}
	if !strings.Contains(mail[0].Text, `A passkey named "Ada's <Laptop>" was added`) || strings.Contains(mail[0].HTML, "<Laptop>") {
		t.Fatalf("the label belongs in the text, and escaped in the HTML:\n%s\n%s", mail[0].Text, mail[0].HTML)
	}

	// A refused registration says nothing. A failing mail server does not fail the registration.
	f.register(b, "", passkeytest.Tweaks{})
	f.pk.Wait()
	if len(f.out.all()) != 1 {
		t.Fatal("a refused registration was announced")
	}
	f.out.failing(true)
	f.register(b, "Phone", passkeytest.Tweaks{}).Want(t, 200, "a failing mail server failed the registration")
}

func TestThePasskeyIsNamedForItsOwner(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	id, _ := f.person("first@example.test")
	if err := f.email.Register(ctx, id, "second@example.test"); err != nil {
		t.Fatal(err)
	}

	name := func(b *authntest.Browser) string {
		return b.Post("/api/roux/auth/me/passkeys/options", nil).JSON(t)["user"].(map[string]any)["name"].(string)
	}
	// Signed in some other way, the oldest address names it.
	if got := name(f.SignedIn(id)); got != "first@example.test" {
		t.Fatalf("oldest: %q", got)
	}
	// Signed in with the second address's credential, that is the address they just proved.
	var credID uuid.UUID
	if err := f.Pool.QueryRow(ctx, `select id from roux_email_credential where address = 'second@example.test'`).Scan(&credID); err != nil {
		t.Fatal(err)
	}
	cookie, err := f.Host.CreateSession(ctx, id, credID, "email-link", "test")
	if err != nil {
		t.Fatal(err)
	}
	b := f.Browser()
	b.SetCookie("SESSION", cookie)
	if got := name(b); got != "second@example.test" {
		t.Fatalf("session's address: %q", got)
	}
	// The user handle is the same across registrations (a person is one WebAuthn user)...
	h1 := b.Post("/api/roux/auth/me/passkeys/options", nil).JSON(t)["user"].(map[string]any)["id"]
	h2 := b.Post("/api/roux/auth/me/passkeys/options", nil).JSON(t)["user"].(map[string]any)["id"]
	if h1 != h2 {
		t.Fatal("the user handle changed between registrations")
	}
	// ...and an identity with no address is named by its id.
	if _, err := f.Pool.Exec(ctx, `delete from roux_credential_identity where credential_id in (select id from roux_email_credential)`); err != nil {
		t.Fatal(err)
	}
	nameless, _ := f.person("temp@example.test")
	_ = nameless
	solo, err := whoNew(f)
	if err != nil {
		t.Fatal(err)
	}
	if got := name(f.SignedIn(solo)); got != solo.String() {
		t.Fatalf("no address: %q, want the identity id %s", got, solo)
	}
}

func TestConfiguration(t *testing.T) {
	good := passkey.Config{RPID: "app.example.com"}
	if _, err := passkey.New(good); err != nil {
		t.Fatalf("minimal: %v", err)
	}
	for name, c := range map[string]struct {
		cfg  passkey.Config
		want string
	}{
		"no rp id":              {passkey.Config{}, "RPID is required"},
		"rp id with a scheme":   {passkey.Config{RPID: "https://app.example.com"}, "bare host"},
		"rp id with a port":     {passkey.Config{RPID: "localhost:8080"}, "bare host"},
		"rp id with a path":     {passkey.Config{RPID: "app.example.com/x"}, "bare host"},
		"origin without scheme": {passkey.Config{RPID: "a.test", AllowedOrigins: []string{"app.example.com"}}, "AllowedOrigins[0]"},
		"origin with a path":    {passkey.Config{RPID: "a.test", AllowedOrigins: []string{"https://app.example.com/signin"}}, "no path"},
		"origin, trailing /":    {passkey.Config{RPID: "a.test", AllowedOrigins: []string{"https://app.example.com/"}}, "trailing slash"},
		"origin, ftp":           {passkey.Config{RPID: "a.test", AllowedOrigins: []string{"ftp://app.example.com"}}, "http or https"},
	} {
		if _, err := passkey.New(c.cfg); err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: %v, want containing %q", name, err, c.want)
		}
	}
	if _, err := passkey.New(passkey.Config{RPID: "localhost", AllowedOrigins: []string{"http://localhost:8080", "https://localhost"}}); err != nil {
		t.Fatalf("http on localhost with a port: %v", err)
	}
}

func TestOldCeremoniesAreCleanedAsNewOnesStart(t *testing.T) {
	f := setup(t)
	for i := 0; i < 5; i++ {
		f.Browser().Post("/api/roux/auth/passkey/sign-in/options", nil)
	}
	if n := f.count(`select count(*) from roux_passkey_ceremony`); n != 5 {
		t.Fatalf("%d ceremonies", n)
	}
	f.advance(6 * time.Minute)
	f.Browser().Post("/api/roux/auth/passkey/sign-in/options", nil)
	if n := f.count(`select count(*) from roux_passkey_ceremony`); n != 1 {
		t.Fatalf("%d ceremonies after the old ones expired, want 1", n)
	}
	// One browser has one ceremony: asking again replaces it.
	br := f.Browser()
	br.Post("/api/roux/auth/passkey/sign-in/options", nil)
	br.Post("/api/roux/auth/passkey/sign-in/options", nil)
	if n := f.count(`select count(*) from roux_passkey_ceremony`); n != 2 {
		t.Fatalf("%d ceremonies, want 2 (one per browser)", n)
	}
}

func TestTheCeremonyCookieIsSecureWhenConfiguredEvenOverPlainHTTP(t *testing.T) {
	for _, secure := range []bool{false, true} {
		f := build(t, secure)
		r := f.Browser().Post("/api/roux/auth/passkey/sign-in/options", nil)
		var found bool
		for _, c := range r.Cookies() {
			if c.Name == "PASSKEY_CEREMONY" {
				found = true
				if c.Secure != secure || !c.HttpOnly {
					t.Errorf("configured secure=%v: %+v", secure, c)
				}
			}
		}
		if !found {
			t.Fatalf("secure=%v: no ceremony cookie", secure)
		}
	}
}
