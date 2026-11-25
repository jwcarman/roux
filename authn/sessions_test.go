package authn_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authn/authntest"
)

const (
	firefoxMac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:132.0) Gecko/20100101 Firefox/132.0"
	edgeWin    = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0"
)

// signedInAs opens a session with the user agent and returns a browser holding its cookie.
func signedInAs(t *testing.T, env *authntest.Env, identity uuid.UUID, ua string) *authntest.Browser {
	t.Helper()
	ctx := context.Background()
	cred := uuid.New()
	if err := authn.LinkCredential(ctx, env.Pool, cred, identity); err != nil {
		t.Fatal(err)
	}
	cookie, err := env.Host.CreateSession(ctx, identity, cred, "passkey", ua)
	if err != nil {
		t.Fatal(err)
	}
	b := env.Browser()
	b.SetCookie(authn.SessionCookie, cookie)
	return b
}

func sessionList(t *testing.T, b *authntest.Browser) []map[string]any {
	t.Helper()
	r := b.Get("/api/roux/auth/me/sessions")
	if r.StatusCode != 200 {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	var list []map[string]any
	r.Decode(t, &list)
	return list
}

func TestDeviceLabels(t *testing.T) {
	env := authntest.New(t, "authn_devices")
	env.Serve()
	id := env.Identity()
	cases := map[string]string{
		firefoxMac: "Firefox on macOS",
		edgeWin:    "Edge on Windows",
		"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36":                "Chrome on Android",
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile Safari/604.1": "Safari on iOS",
		"Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36":                       "Chrome on ChromeOS",
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 OPR/115.0":                      "Opera on Linux",
		"Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0":                                       "Firefox on Linux",
		"curl/8.4.0": "Unknown browser on unknown system",
		"":           "Unknown browser",
	}
	for ua, want := range cases {
		b := signedInAs(t, env, id, ua)
		var got string
		for _, s := range sessionList(t, b) {
			if s["current"] == true {
				got = s["device"].(string)
			}
		}
		if got != want {
			t.Errorf("%q: device %q, want %q", ua, got, want)
		}
	}
}

func TestListingMySessions(t *testing.T) {
	env := authntest.New(t, "authn_sessions_list")
	env.Serve()
	id, other := env.Identity(), env.Identity()

	first := signedInAs(t, env, id, firefoxMac)
	env.Clock.Advance(time.Minute)
	second := signedInAs(t, env, id, edgeWin)
	signedInAs(t, env, other, "someone else") // not mine

	list := sessionList(t, second)
	if len(list) != 2 || list[0]["device"] != "Edge on Windows" || list[1]["device"] != "Firefox on macOS" {
		t.Fatalf("newest sign-in first, mine only: %v", list)
	}
	if list[0]["current"] != true || list[1]["current"] != false {
		t.Fatalf("current: %v", list)
	}
	s := list[0]
	if len(s) != 7 || s["signInMethod"] != "passkey" || s["userAgent"] != edgeWin || s["signedInAt"] == nil || s["lastSeenAt"] == nil {
		t.Fatalf("shape: %v", s)
	}
	if list[0]["id"] == nil || len(list[0]["id"].(string)) != 36 {
		t.Fatalf("id: %v", list[0]["id"])
	}
	// The same list from the other browser, with the flag the other way round.
	if got := sessionList(t, first); got[0]["current"] != false || got[1]["current"] != true {
		t.Fatalf("from the first browser: %v", got)
	}

	// Ended and idle sessions are not live.
	first.Post("/api/roux/auth/logout", nil)
	if n := len(sessionList(t, second)); n != 1 {
		t.Fatalf("an ended session is still listed: %d", n)
	}
	if r := env.Browser().Get("/api/roux/auth/me/sessions"); r.StatusCode != 401 || r.Header.Get("Roux-Error") != "not-signed-in" {
		t.Fatalf("signed out: %d", r.StatusCode)
	}
}

func TestEndingASession(t *testing.T) {
	env := authntest.New(t, "authn_sessions_end")
	env.Serve()
	id, other := env.Identity(), env.Identity()
	laptop := signedInAs(t, env, id, firefoxMac)
	phone := signedInAs(t, env, id, edgeWin)
	stranger := signedInAs(t, env, other, "x")
	phoneID := func() string {
		for _, s := range sessionList(t, laptop) {
			if s["current"] == false {
				return s["id"].(string)
			}
		}
		t.Fatal("no other session")
		return ""
	}()
	strangerID := sessionList(t, stranger)[0]["id"].(string)

	// Ending a session that is not mine: the same 404 for someone else's, unknown and malformed.
	for name, target := range map[string]string{"someone else's": strangerID, "unknown": uuid.NewString(), "malformed": "not-a-uuid"} {
		r := laptop.Delete("/api/roux/auth/me/sessions/" + target)
		if body := r.JSON(t); r.StatusCode != 404 || body["code"] != "session-not-found" {
			t.Errorf("%s: %d %s", name, r.StatusCode, r.Body)
		}
	}
	if stranger.Get("/api/roux/auth/me").StatusCode != 200 {
		t.Fatal("someone else's session was ended")
	}

	// Ending another of my sessions needs a recent sign-in; the id is checked first, so a
	// stale session learns nothing from the error: an id that is not mine is still a 404.
	env.Clock.Advance(11 * time.Minute)
	if r := laptop.Delete("/api/roux/auth/me/sessions/" + phoneID); r.StatusCode != 401 || r.JSON(t)["code"] != "reauthentication-required" {
		t.Fatalf("stale, mine: %d %s", r.StatusCode, r.Body)
	}
	if r := laptop.Delete("/api/roux/auth/me/sessions/" + strangerID); r.StatusCode != 404 {
		t.Fatalf("stale, not mine: %d (the id is checked before the age of the sign-in)", r.StatusCode)
	}
	if phone.Get("/api/roux/auth/me").StatusCode != 200 {
		t.Fatal("a refused request ended a session")
	}

	// Signed in again, it works, and the phone is out.
	fresh := signedInAs(t, env, id, firefoxMac)
	if r := fresh.Delete("/api/roux/auth/me/sessions/" + phoneID); r.StatusCode != 204 || len(r.Body) != 0 {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	if phone.Get("/api/roux/auth/me").StatusCode != 401 {
		t.Fatal("the phone is still signed in")
	}
}

func TestSigningOutThisBrowserThroughTheSessionList(t *testing.T) {
	env := authntest.New(t, "authn_sessions_self")
	env.Serve()
	id := env.Identity()
	b := signedInAs(t, env, id, firefoxMac)
	env.Clock.Advance(11 * time.Minute) // not recent: ending your own session needs no recent sign-in

	self := sessionList(t, b)[0]["id"].(string)
	r := b.Delete("/api/roux/auth/me/sessions/" + self)
	if r.StatusCode != 204 {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	if b.Cookie(authn.SessionCookie) != "" || b.Cookie("XSRF-TOKEN") != "" {
		t.Fatal("signing out must clear both cookies, as POST /api/roux/auth/logout does")
	}
	if b.Get("/api/roux/auth/me").StatusCode != 401 {
		t.Fatal("still signed in")
	}
}

func TestEndingEveryOtherSession(t *testing.T) {
	env := authntest.New(t, "authn_sessions_others")
	env.Serve()
	id, other := env.Identity(), env.Identity()
	me := signedInAs(t, env, id, firefoxMac)
	a, b := signedInAs(t, env, id, edgeWin), signedInAs(t, env, id, "third")
	bystander := signedInAs(t, env, other, "x")

	// It needs others=true, so a stray request cannot end everything.
	for _, path := range []string{"/api/roux/auth/me/sessions", "/api/roux/auth/me/sessions?others=false", "/api/roux/auth/me/sessions?others=yes"} {
		r := me.Delete(path)
		if body := r.JSON(t); r.StatusCode != 400 || body["code"] != "invalid-request" || body["detail"] != "Ending every session needs others=true" {
			t.Errorf("%s: %d %s", path, r.StatusCode, r.Body)
		}
	}
	if a.Get("/api/roux/auth/me").StatusCode != 200 {
		t.Fatal("a refused request ended a session")
	}

	// A stale sign-in is refused (after the others=true check).
	env.Clock.Advance(11 * time.Minute)
	if r := me.Delete("/api/roux/auth/me/sessions?others=true"); r.StatusCode != 401 || r.JSON(t)["code"] != "reauthentication-required" {
		t.Fatalf("stale: %d %s", r.StatusCode, r.Body)
	}

	fresh := signedInAs(t, env, id, firefoxMac) // a recent sign-in; a, b and me are older but live
	r := fresh.Delete("/api/roux/auth/me/sessions?others=true")
	if body := r.JSON(t); r.StatusCode != 200 || body["ended"] != float64(3) {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	for name, br := range map[string]*authntest.Browser{"me": me, "a": a, "b": b} {
		if br.Get("/api/roux/auth/me").StatusCode != 401 {
			t.Errorf("%s is still signed in", name)
		}
	}
	if fresh.Get("/api/roux/auth/me").StatusCode != 200 || bystander.Get("/api/roux/auth/me").StatusCode != 200 {
		t.Fatal("the caller's own session, and someone else's, must stay")
	}
	if r := fresh.Delete("/api/roux/auth/me/sessions?others=true"); r.JSON(t)["ended"] != float64(0) {
		t.Fatalf("nothing left to end: %s", r.Body)
	}
	_ = strings.TrimSpace
}

func TestSessionEndpointsNeedCSRFAndASignedInCaller(t *testing.T) {
	env := authntest.New(t, "authn_sessions_csrf")
	env.Serve()
	b := signedInAs(t, env, env.Identity(), firefoxMac)
	if r := b.Do("DELETE", "/api/roux/auth/me/sessions?others=true", nil, false); r.StatusCode != 403 || r.JSON(t)["code"] != "invalid-csrf-token" {
		t.Fatalf("no token: %d %s", r.StatusCode, r.Body)
	}
	for _, path := range []string{"/api/roux/auth/me/sessions/" + uuid.NewString(), "/api/roux/auth/me/sessions?others=true"} {
		if r := env.Browser().Delete(path); r.StatusCode != 401 || r.JSON(t)["code"] != "not-signed-in" {
			t.Errorf("%s signed out: %d %s", path, r.StatusCode, r.Body)
		}
	}
}
