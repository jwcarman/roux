package emaillink_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/authz"
	"github.com/jwcarman/roux/problem"
)

// grant makes a role with the permissions and gives it to the identity.
func (e *env) grant(role string, identity uuid.UUID, permissions ...string) uuid.UUID {
	e.t.Helper()
	ctx := context.Background()
	roleID := uuid.New()
	if _, err := e.pool.Exec(ctx, `insert into roux_role (id, name) values ($1, $2)`, roleID, role); err != nil {
		e.t.Fatal(err)
	}
	for _, p := range permissions {
		if _, err := e.pool.Exec(ctx, `insert into roux_role_permission (role_id, permission) values ($1, $2)`, roleID, p); err != nil {
			e.t.Fatal(err)
		}
	}
	if err := authz.Assign(ctx, e.pool, identity, roleID); err != nil {
		e.t.Fatal(err)
	}
	return roleID
}

func (e *env) signedIn() *browser {
	e.t.Helper()
	b := e.browser()
	if r := b.signInWithToken(tokenOf(e.t, e.issueFor(b, owner))); r.StatusCode != 200 {
		e.t.Fatalf("sign-in: %d %s", r.StatusCode, r.body)
	}
	return b
}

func TestGuardedRoutesAnswerAsRouxDoes(t *testing.T) {
	e := setup(t)

	// Anonymous: 401 "Sign in to continue", in the kit's problem format, not who's.
	anon := e.browser().get("/api/me-only")
	body := anon.json(t)
	if anon.StatusCode != 401 || body["detail"] != "Sign in to continue" || body["title"] != "Unauthorized" ||
		anon.Header.Get("Who-Error") != "" || body["instance"] != "/api/me-only" {
		t.Fatalf("anonymous: %d %s %v", anon.StatusCode, anon.body, anon.Header)
	}

	// Signed in, but without the permission: 403.
	b := e.signedIn()
	if r := b.get("/api/me-only"); r.StatusCode != 200 || string(r.body) != "\""+e.ownerID.String()+"\"\n" {
		t.Fatalf("signed in: %d %s", r.StatusCode, r.body)
	}
	denied := b.get("/api/secret")
	if denied.StatusCode != 403 || denied.json(t)["detail"] != "You do not have permission" {
		t.Fatalf("no permission: %d %s", denied.StatusCode, denied.body)
	}
}

func TestPermissionsFollowRolesOnTheNextRequest(t *testing.T) {
	e := setup(t)
	b := e.signedIn()
	perms := func() []any { return b.get("/who/me").json(t)["permissions"].([]any) }

	if got := perms(); len(got) != 0 {
		t.Fatalf("a new identity holds nothing: %v", got)
	}
	reader := e.grant("reader", e.ownerID, "secrets.read")
	e.grant("other", e.ownerID, "zeta.use", "alpha.use", "secrets.read") // overlaps: no duplicates

	got := perms()
	want := []string{"alpha.use", "secrets.read", "zeta.use"}
	if len(got) != len(want) {
		t.Fatalf("permissions = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("permissions = %v, want sorted %v", got, want)
		}
	}
	if r := b.get("/api/secret"); r.StatusCode != 200 {
		t.Fatalf("with the permission: %d", r.StatusCode)
	}

	// Taking the role away applies at once (the permission is still held through "other").
	if err := authz.Remove(context.Background(), e.pool, e.ownerID, reader); err != nil {
		t.Fatal(err)
	}
	if r := b.get("/api/secret"); r.StatusCode != 200 {
		t.Fatal("secrets.read is still granted by the other role")
	}
	if _, err := e.pool.Exec(context.Background(), `delete from roux_identity_role where identity_id = $1`, e.ownerID); err != nil {
		t.Fatal(err)
	}
	if r := b.get("/api/secret"); r.StatusCode != 403 {
		t.Fatalf("without any role: %d", r.StatusCode)
	}
}

func TestGuardChecksCSRFThenSignInThenPermission(t *testing.T) {
	e := setup(t)
	e.grant("writer", e.ownerID, "secrets.write")

	// No token at all: refused for that, whoever is calling.
	anon := e.browser()
	if r := anon.do("POST", "/api/secret", nil, false); r.StatusCode != 403 || r.json(t)["code"] != "invalid-csrf-token" {
		t.Fatalf("no CSRF token: %d %s", r.StatusCode, r.body)
	}
	// A token but nobody signed in: 401, not 403.
	if r := anon.post("/api/secret", nil); r.StatusCode != 401 {
		t.Fatalf("token, anonymous: %d %s", r.StatusCode, r.body)
	}
	// Signed in with the permission but no token: still refused (CSRF comes first).
	b := e.signedIn()
	if r := b.do("POST", "/api/secret", nil, false); r.StatusCode != 403 || r.json(t)["code"] != "invalid-csrf-token" {
		t.Fatalf("signed in, no token: %d %s", r.StatusCode, r.body)
	}
	// Everything in order.
	if r := b.post("/api/secret", nil); r.StatusCode != 200 {
		t.Fatalf("all in order: %d %s", r.StatusCode, r.body)
	}
}

func TestOpenRoutesSeeWhoeverIsSignedIn(t *testing.T) {
	e := setup(t)
	anon := e.browser()
	r := anon.get("/api/open")
	if r.StatusCode != 200 || r.json(t)["signedIn"] != false || anon.cookie("XSRF-TOKEN") == "" {
		t.Fatalf("anonymous: %d %s (an open route still issues the CSRF cookie)", r.StatusCode, r.body)
	}
	if r := e.signedIn().get("/api/open"); r.json(t)["signedIn"] != true {
		t.Fatalf("signed in: %s", r.body)
	}
}

func TestRecentSignInIsRequiredForSensitiveActions(t *testing.T) {
	e := setup(t)
	b := e.signedIn()
	if r := b.post("/api/fresh", nil); r.StatusCode != 200 {
		t.Fatalf("just signed in: %d %s", r.StatusCode, r.body)
	}

	e.clock.advance(10*time.Minute + time.Second) // still a live session (30 minutes idle), no longer recent
	stale := b.post("/api/fresh", nil)
	body := stale.json(t)
	if stale.StatusCode != 401 || body["type"] != "urn:who:error:reauthentication-required" ||
		body["code"] != "reauthentication-required" || body["detail"] != "Sign in again to continue" {
		t.Fatalf("stale sign-in: %d %s", stale.StatusCode, stale.body)
	}
	if b.get("/who/me").StatusCode != 200 {
		t.Fatal("being asked to sign in again must not end the session")
	}

	// Signing in again makes the next attempt work.
	e.clock.advance(61 * time.Second)
	b.signInWithToken(tokenOf(t, e.issueFor(b, owner)))
	if r := b.post("/api/fresh", nil); r.StatusCode != 200 {
		t.Fatalf("after signing in again: %d %s", r.StatusCode, r.body)
	}
}

func TestEndAllSessions(t *testing.T) {
	e := setup(t)
	a, b := e.signedIn(), e.browser()
	e.clock.advance(61 * time.Second)
	b.signInWithToken(tokenOf(t, e.issueFor(b, owner))) // a second device

	otherID, _, err := e.method.EnsureIdentity(context.Background(), "other@example.test")
	if err != nil {
		t.Fatal(err)
	}
	e.clock.advance(61 * time.Second)
	c := e.browser()
	c.signInWithToken(tokenOf(t, e.issueFor(c, "other@example.test")))

	if err := e.host.EndAllSessions(context.Background(), e.ownerID); err != nil {
		t.Fatal(err)
	}
	for name, br := range map[string]*browser{"first device": a, "second device": b} {
		if br.get("/who/me").StatusCode != 401 {
			t.Errorf("%s is still signed in", name)
		}
	}
	if r := c.get("/who/me"); r.StatusCode != 200 || r.json(t)["identityId"] != otherID.String() {
		t.Fatalf("someone else's session must be untouched: %d", r.StatusCode)
	}
}

func TestOnSignedInHooks(t *testing.T) {
	e := setup(t)
	type seen struct {
		id uuid.UUID
		at time.Time
	}
	got := make(chan seen, 2)
	e.host.OnSignedIn(func(_ context.Context, id uuid.UUID, at time.Time) error {
		got <- seen{id, at}
		return errors.New("a failing hook")
	})
	e.host.OnSignedIn(func(_ context.Context, id uuid.UUID, at time.Time) error {
		got <- seen{id, at}
		return nil
	})
	b := e.browser()
	if r := b.signInWithToken(tokenOf(t, e.issueFor(b, owner))); r.StatusCode != 200 {
		t.Fatalf("a failing hook must not fail the sign-in: %d %s", r.StatusCode, r.body)
	}
	for i := 0; i < 2; i++ {
		select {
		case s := <-got:
			if s.id != e.ownerID || !s.at.Equal(e.clock.Now()) {
				t.Fatalf("hook saw %+v", s)
			}
		default:
			t.Fatalf("hook %d did not run before the sign-in answered", i+1)
		}
	}
	_ = problem.Forbidden // keep the import honest if assertions above change
}
