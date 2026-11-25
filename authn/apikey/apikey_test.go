package apikey_test

import (
	"context"
	"net/http"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authn/apikey"
	"github.com/jwcarman/roux/authn/authntest"
)

var keyPattern = regexp.MustCompile(`^roux_[0-9A-Za-z]{36}$`)

type env struct {
	*authntest.Env
	t      *testing.T
	method *apikey.Method
	owner  uuid.UUID
	ada    *authntest.Browser // signed in as the owner, in a browser
}

func setup(t *testing.T, cfg ...func(*apikey.Config)) *env {
	t.Helper()
	clock := authntest.NewClock()
	c := apikey.Config{Clock: clock.Now}
	for _, fn := range cfg {
		fn(&c)
	}
	m, err := apikey.New(c)
	if err != nil {
		t.Fatal(err)
	}
	e := authntest.NewWith(t, "apikey", clock, []authn.Method{m}, apikey.Migration)
	who := func(w http.ResponseWriter, r *http.Request) error {
		p := authn.PrincipalFrom(r.Context())
		return api.JSON(w, 200, map[string]any{"identityId": p.IdentityID, "method": p.Method, "permissions": p.Permissions})
	}
	e.Mux.Handle("GET /api/whoami", e.Host.Guard("", who))
	e.Mux.Handle("POST /api/report", e.Host.Guard("report.write", who))
	e.Mux.Handle("GET /api/report", e.Host.Guard("report.read", who))
	e.Mux.Handle("GET /api/open", e.Host.Open(func(w http.ResponseWriter, r *http.Request) error {
		if p := authn.PrincipalFrom(r.Context()); p != nil {
			return api.JSON(w, 200, map[string]any{"identityId": p.IdentityID})
		}
		return api.JSON(w, 200, map[string]any{"anonymous": true})
	}))
	e.Serve()
	owner := e.Identity("report.read", "report.write", "report.admin")
	return &env{Env: e, t: t, method: m, owner: owner, ada: e.SignedIn(owner)}
}

func withKey(key string) map[string]string { return map[string]string{"X-API-Key": key} }

// call is a client with no cookies sending only the key, as a script would.
func (e *env) call(method, path, key string) authntest.Reply {
	return e.Browser().DoWith(method, path, withKey(key))
}

func code(t *testing.T, r authntest.Reply) string { t.Helper(); return r.JSON(t)["code"].(string) }

// make creates a key as the owner and returns its id and secret.
func (e *env) make(name string, lifetime string, scopes ...string) (id, key string) {
	e.t.Helper()
	r := e.ada.Post("/api/roux/auth/me/api-keys", map[string]any{"name": name, "lifetime": lifetime, "scopes": scopes})
	if r.StatusCode != 201 {
		e.t.Fatalf("make %q: %d %s", name, r.StatusCode, r.Body)
	}
	b := r.JSON(e.t)
	return b["id"].(string), b["key"].(string)
}

func (e *env) count(query string, args ...any) int {
	e.t.Helper()
	var n int
	if err := e.Pool.QueryRow(context.Background(), query, args...).Scan(&n); err != nil {
		e.t.Fatal(err)
	}
	return n
}

func TestMakingAKey(t *testing.T) {
	e := setup(t)
	r := e.ada.Post("/api/roux/auth/me/api-keys", map[string]any{"name": "  Nightly export ", "lifetime": "P90D", "scopes": []string{"report.write", "report.read", "report.read"}})
	b := r.JSON(t)
	if r.StatusCode != 201 || b["name"] != "Nightly export" || !keyPattern.MatchString(b["key"].(string)) ||
		len(b) != 5 || b["id"] == nil {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	if scopes := b["scopes"].([]any); len(scopes) != 2 || scopes[0] != "report.read" || scopes[1] != "report.write" {
		t.Fatalf("scopes are sorted and distinct: %v", scopes)
	}
	want := e.Clock.Now().Add(90 * 24 * time.Hour).Format(time.RFC3339Nano)
	if b["expiresAt"] != want {
		t.Fatalf("expiresAt %v, want %v", b["expiresAt"], want)
	}
	// Only the hash is stored: the secret is nowhere in the table.
	key := b["key"].(string)
	if e.count(`select count(*) from roux_api_key where key_hash = $1`, key) != 0 ||
		e.count(`select count(*) from roux_api_key where position($1 in name || scopes::text || key_hash) > 0`, key[5:]) != 0 {
		t.Fatal("the key is stored")
	}
}

func TestListingKeys(t *testing.T) {
	e := setup(t)
	r := e.ada.Get("/api/roux/auth/me/api-keys")
	if r.StatusCode != 200 || string(r.Body) != "[]\n" {
		t.Fatalf("no keys: %d %q", r.StatusCode, r.Body)
	}
	id2, key2 := e.make("b-second", "P30D", "report.read")
	e.make("a-first", "P10D", "report.read", "report.write")
	var list []map[string]any
	e.ada.Get("/api/roux/auth/me/api-keys").Decode(t, &list)
	if len(list) != 2 || list[0]["name"] != "a-first" || list[1]["id"] != id2 {
		t.Fatalf("by name: %v", list)
	}
	first := list[0]
	if len(first) != 6 || first["createdAt"] == nil || first["expiresAt"] == nil || first["lastUsedAt"] != nil {
		t.Fatalf("shape: %v", first)
	}
	for _, k := range list {
		if strings.Contains(string(e.ada.Get("/api/roux/auth/me/api-keys").Body), key2) || k["key"] != nil {
			t.Fatal("the list shows a secret")
		}
	}
	// Someone else's keys are not listed.
	other := e.SignedIn(e.Identity("report.read"))
	if r := other.Get("/api/roux/auth/me/api-keys"); string(r.Body) != "[]\n" {
		t.Fatalf("another identity's list: %s", r.Body)
	}
}

func TestAKeySignsARequestIn(t *testing.T) {
	e := setup(t)
	_, key := e.make("ci", "P30D", "report.read", "report.write")
	sessions := e.count(`select count(*) from roux_session`)

	r := e.call("GET", "/api/whoami", key)
	body := r.JSON(t)
	if r.StatusCode != 200 || body["identityId"] != e.owner.String() || body["method"] != "api-key" {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	if perms := body["permissions"].([]any); len(perms) != 2 || perms[0] != "report.read" || perms[1] != "report.write" {
		t.Fatalf("the key holds only its scopes, not report.admin the owner also has: %v", perms)
	}
	// An unsafe request needs no CSRF token, and no session or cookie comes of it.
	r = e.call("POST", "/api/report", key)
	if r.StatusCode != 200 {
		t.Fatalf("POST without a CSRF token: %d %s", r.StatusCode, r.Body)
	}
	if len(r.Header.Values("Set-Cookie")) != 0 || e.count(`select count(*) from roux_session`) != sessions {
		t.Fatal("a key's sign-in made a session or a cookie")
	}
	// The header name is the configured one, case-insensitively as HTTP says.
	if r := e.Browser().DoWith("GET", "/api/whoami", map[string]string{"x-api-key": key}); r.StatusCode != 200 {
		t.Fatalf("lower-case header: %d", r.StatusCode)
	}
	// It signs in /api/roux/auth/me too, as a key.
	if r := e.call("GET", "/api/roux/auth/me", key); r.StatusCode != 200 || r.JSON(t)["signInMethod"] != "api-key" {
		t.Fatalf("/api/roux/auth/me: %d %s", r.StatusCode, r.Body)
	}
}

func TestAKeyOnlyHoldsWhatItsOwnerHoldsNow(t *testing.T) {
	e := setup(t)
	_, key := e.make("ci", "P30D", "report.read", "report.write")
	if e.call("GET", "/api/report", key).StatusCode != 200 {
		t.Fatal("report.read should work")
	}
	// Take a permission away from the owner: every key of theirs loses it at once.
	if _, err := e.Pool.Exec(context.Background(),
		`delete from roux_role_permission where permission = 'report.read' and role_id in (select role_id from roux_identity_role where identity_id = $1)`, e.owner); err != nil {
		t.Fatal(err)
	}
	if r := e.call("GET", "/api/report", key); r.StatusCode != 403 {
		t.Fatalf("a permission the owner lost: %d %s", r.StatusCode, r.Body)
	}
	// It still signs in, with what is left.
	r := e.call("GET", "/api/whoami", key)
	if perms := r.JSON(t)["permissions"].([]any); r.StatusCode != 200 || len(perms) != 1 || perms[0] != "report.write" {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	// An owner who lost every scoped permission still signs in, with none.
	if _, err := e.Pool.Exec(context.Background(), `delete from roux_identity_role where identity_id = $1`, e.owner); err != nil {
		t.Fatal(err)
	}
	r = e.call("GET", "/api/whoami", key)
	if perms := r.JSON(t)["permissions"].([]any); r.StatusCode != 200 || len(perms) != 0 {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
}

func TestAKeyThatIsNotRightIsRefusedAtOnce(t *testing.T) {
	e := setup(t)
	id, key := e.make("ci", "P30D", "report.read")
	flip := func(s string, at int) string {
		b := []byte(s)
		if b[at] == 'a' {
			b[at] = 'b'
		} else {
			b[at] = 'a'
		}
		return string(b)
	}
	// Revoked, expired and inactive-owner keys are each refused.
	revoked, revokedKey := e.make("old", "P30D", "report.read")
	if r := e.ada.Delete("/api/roux/auth/me/api-keys/" + revoked); r.StatusCode != 204 {
		t.Fatal(r.StatusCode)
	}
	_, shortKey := e.make("short", "PT1H", "report.read")

	for name, k := range map[string]string{
		"garbage":           "not-a-key",
		"the wrong prefix":  "who_" + key[5:],
		"a bad checksum":    flip(key, len(key)-1),
		"a changed secret":  flip(key, 8),
		"too short":         key[:len(key)-1],
		"too long":          key + "a",
		"a revoked key":     revokedKey,
		"unknown but valid": e.unknownKey(),
	} {
		for _, path := range []string{"/api/whoami", "/api/open"} { // even where anonymous is welcome
			r := e.call("GET", path, k)
			if r.StatusCode != 401 || code(t, r) == "" {
				t.Errorf("%s at %s: %d %s", name, path, r.StatusCode, r.Body)
			}
		}
	}
	// One answer for every refusal: nothing says why.
	a, b := e.call("GET", "/api/whoami", "not-a-key"), e.call("GET", "/api/whoami", revokedKey)
	if string(a.Body) != string(b.Body) {
		t.Fatalf("the answers differ:\n%s\n%s", a.Body, b.Body)
	}

	e.Clock.Advance(61 * time.Minute)
	if r := e.call("GET", "/api/whoami", shortKey); r.StatusCode != 401 {
		t.Fatalf("an expired key: %d", r.StatusCode)
	}
	if r := e.call("GET", "/api/whoami", key); r.StatusCode != 200 {
		t.Fatalf("a key that has not expired: %d", r.StatusCode)
	}
	if _, err := e.Pool.Exec(context.Background(), `update roux_identity set status = 'DEACTIVATED' where id = $1`, e.owner); err != nil {
		t.Fatal(err)
	}
	if r := e.call("GET", "/api/whoami", key); r.StatusCode != 401 {
		t.Fatalf("a key of an inactive identity: %d", r.StatusCode)
	}
	_ = id

	// A blank header is not a key: the request goes on as it was.
	r := e.Browser().DoWith("GET", "/api/open", map[string]string{"X-API-Key": ""})
	if r.StatusCode != 200 || r.JSON(t)["anonymous"] != true {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
}

func TestASessionIgnoresAKeyBesideIt(t *testing.T) {
	e := setup(t)
	_, key := e.make("ci", "P30D", "report.read")
	// A browser with a session: the key is ignored, and CSRF still applies.
	r := e.ada.DoWith("GET", "/api/whoami", withKey(key))
	if r.StatusCode != 200 || r.JSON(t)["method"] != "email-link" {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	if r := e.ada.DoWith("POST", "/api/report", withKey(key)); r.StatusCode != 403 || code(t, r) != "invalid-csrf-token" {
		t.Fatalf("a session with a key beside it keeps its CSRF check: %d %s", r.StatusCode, r.Body)
	}
	// Even a wrong key beside a good session is ignored: the session decided.
	if r := e.ada.DoWith("GET", "/api/whoami", withKey("garbage")); r.StatusCode != 200 {
		t.Fatalf("%d", r.StatusCode)
	}
}

func TestAKeyNeverManagesKeys(t *testing.T) {
	e := setup(t)
	id, key := e.make("ci", "P30D", "report.read")
	for _, c := range []struct{ method, path string }{
		{"GET", "/api/roux/auth/me/api-keys"}, {"POST", "/api/roux/auth/me/api-keys"},
		{"POST", "/api/roux/auth/me/api-keys/" + id + "/rotations"}, {"DELETE", "/api/roux/auth/me/api-keys/" + id},
	} {
		r := e.call(c.method, c.path, key)
		if r.StatusCode != 403 || code(t, r) != "api-key-cannot-manage-keys" {
			t.Errorf("%s %s: %d %s", c.method, c.path, r.StatusCode, r.Body)
		}
	}
	if e.count(`select count(*) from roux_api_key`) != 1 {
		t.Fatal("a key managed keys")
	}
	// Nor anything else under /api/roux/auth/me/* that only a person at a browser may do.
	for _, path := range []string{"/api/roux/auth/me/sessions"} {
		if r := e.call("GET", path, key); r.StatusCode != 403 || code(t, r) != "browser-session-required" {
			t.Errorf("%s: %d %s", path, r.StatusCode, r.Body)
		}
	}
	// A key beside a session cookie is refused too: send the cookie alone.
	for _, path := range []string{"/api/roux/auth/me/api-keys", "/api/roux/auth/me/sessions"} {
		if r := e.ada.DoWith("GET", path, withKey(key)); r.StatusCode != 403 || code(t, r) != "browser-session-required" {
			t.Errorf("%s with a key beside the cookie: %d %s", path, r.StatusCode, r.Body)
		}
	}
	// The one thing a key may do is read itself.
	r := e.call("GET", "/api/roux/auth/me/api-keys/current", key)
	b := r.JSON(t)
	if r.StatusCode != 200 || b["id"] != id || b["name"] != "ci" || b["key"] != nil || b["lastUsedAt"] == nil {
		t.Fatalf("current: %d %s", r.StatusCode, r.Body)
	}
	// Without a key it is 404, signed out 401.
	if r := e.ada.Get("/api/roux/auth/me/api-keys/current"); r.StatusCode != 404 || code(t, r) != "api-key-not-found" {
		t.Fatalf("a session: %d %s", r.StatusCode, r.Body)
	}
	if r := e.Browser().Get("/api/roux/auth/me/api-keys/current"); r.StatusCode != 401 || code(t, r) != "not-signed-in" {
		t.Fatalf("signed out: %d", r.StatusCode)
	}
}

func TestMakingAKeyIsChecked(t *testing.T) {
	e := setup(t, func(c *apikey.Config) { c.MaxLifetime = 30 * 24 * time.Hour })
	post := func(body any) authntest.Reply { return e.ada.Post("/api/roux/auth/me/api-keys", body) }
	ok := func() map[string]any {
		return map[string]any{"name": "ci", "lifetime": "P10D", "scopes": []string{"report.read"}}
	}
	with := func(k string, v any) map[string]any { m := ok(); m[k] = v; return m }
	without := func(k string) map[string]any { m := ok(); delete(m, k); return m }
	for name, body := range map[string]any{
		"no name":                           without("name"),
		"a blank name":                      with("name", "   "),
		"a name too long":                   with("name", strings.Repeat("n", 256)),
		"no lifetime":                       without("lifetime"),
		"a lifetime that is not a duration": with("lifetime", "90 days"),
		"weeks are not a length":            with("lifetime", "P2W"),
		"months are not a length":           with("lifetime", "P1M"),
		"a negative lifetime":               with("lifetime", "-P1D"),
		"a zero lifetime":                   with("lifetime", "PT0S"),
		"just P":                            with("lifetime", "P"),
		"a lifetime past the maximum":       with("lifetime", "P31D"),
		"no scopes":                         without("scopes"),
		"empty scopes":                      with("scopes", []string{}),
		"a blank scope":                     with("scopes", []string{" "}),
		"a scope not held":                  with("scopes", []string{"report.read", "users.manage"}),
		"a scope too long":                  with("scopes", []string{strings.Repeat("s", 256)}),
		"a name that is a number":           with("name", 7),
		"not an object":                     []string{"x"},
	} {
		r := post(body)
		if r.StatusCode != 400 || code(t, r) != "invalid-request" {
			t.Errorf("%s: %d %s", name, r.StatusCode, r.Body)
		}
	}
	if e.count(`select count(*) from roux_api_key`) != 0 {
		t.Fatal("a refused request made a key")
	}
	// The boundaries are fine.
	for _, lifetime := range []string{"P30D", "PT1S", "P1DT2H30M", "p10d", "PT720H"} {
		if r := post(with("lifetime", lifetime)); r.StatusCode != 201 {
			t.Errorf("%s: %d %s", lifetime, r.StatusCode, r.Body)
		}
	}
	// Unknown members are ignored, as roux's endpoints do.
	if r := post(with("extra", true)); r.StatusCode != 201 {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
}

func TestMakingOrRotatingNeedsASessionThatIsRecent(t *testing.T) {
	e := setup(t)
	id, _ := e.make("ci", "P30D", "report.read")
	e.Clock.Advance(11 * time.Minute)
	// Checked before the body is looked at, so even garbage gets the sign-in message first.
	for _, c := range []struct{ method, path string }{
		{"POST", "/api/roux/auth/me/api-keys"}, {"POST", "/api/roux/auth/me/api-keys/" + id + "/rotations"},
	} {
		if r := e.ada.Do(c.method, c.path, "garbage", true); r.StatusCode != 401 || code(t, r) != "reauthentication-required" {
			t.Errorf("%s %s: %d %s", c.method, c.path, r.StatusCode, r.Body)
		}
	}
	// Listing and revoking need no recent sign-in; signed out is 401 everywhere.
	if r := e.ada.Get("/api/roux/auth/me/api-keys"); r.StatusCode != 200 {
		t.Fatalf("list: %d", r.StatusCode)
	}
	if r := e.ada.Delete("/api/roux/auth/me/api-keys/" + id); r.StatusCode != 204 {
		t.Fatalf("revoke: %d", r.StatusCode)
	}
	out := e.Browser()
	for _, c := range []struct{ method, path string }{
		{"GET", "/api/roux/auth/me/api-keys"}, {"POST", "/api/roux/auth/me/api-keys"}, {"POST", "/api/roux/auth/me/api-keys/" + id + "/rotations"}, {"DELETE", "/api/roux/auth/me/api-keys/" + id},
	} {
		if r := out.Do(c.method, c.path, nil, true); r.StatusCode != 401 || code(t, r) != "not-signed-in" {
			t.Errorf("%s %s signed out: %d", c.method, c.path, r.StatusCode)
		}
	}
}

func TestRotatingAKey(t *testing.T) {
	e := setup(t)
	oldID, oldKey := e.make("ci", "P10D", "report.read", "report.write")
	e.Clock.Advance(2 * 24 * time.Hour)       // 8 days of the old key's life are left
	e.ada.Post("/api/roux/auth/sign-in", nil) // keep the session recent: sign in again below
	e.ada = e.SignedIn(e.owner)

	r := e.ada.Post("/api/roux/auth/me/api-keys/"+oldID+"/rotations", map[string]string{"overlap": "PT1H"})
	b := r.JSON(t)
	if r.StatusCode != 201 || b["name"] != "ci" || b["id"] == oldID || !keyPattern.MatchString(b["key"].(string)) || len(b) != 5 {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	if scopes := b["scopes"].([]any); len(scopes) != 2 || scopes[0] != "report.read" || scopes[1] != "report.write" {
		t.Fatalf("the new key has the old one's scopes: %v", scopes)
	}
	// The old key's lifetime (10 days) counts from now.
	if want := e.Clock.Now().Add(10 * 24 * time.Hour).Format(time.RFC3339Nano); b["expiresAt"] != want {
		t.Fatalf("new expiry %v, want %v", b["expiresAt"], want)
	}
	newKey := b["key"].(string)
	// Both work during the overlap; then only the new one.
	for _, k := range []string{oldKey, newKey} {
		if e.call("GET", "/api/whoami", k).StatusCode != 200 {
			t.Fatal("both keys work during the overlap")
		}
	}
	e.Clock.Advance(61 * time.Minute)
	if e.call("GET", "/api/whoami", oldKey).StatusCode != 401 {
		t.Fatal("the old key outlived the overlap")
	}
	if e.call("GET", "/api/whoami", newKey).StatusCode != 200 {
		t.Fatal("the new key stopped")
	}
}

func TestRotationOverlapAndLimits(t *testing.T) {
	e := setup(t, func(c *apikey.Config) { c.MaxLifetime = 20 * 24 * time.Hour })
	rotate := func(id string, body any) authntest.Reply {
		return e.ada.Post("/api/roux/auth/me/api-keys/"+id+"/rotations", body)
	}
	id, key := e.make("ci", "P5D", "report.read")

	// Zero overlap cuts over at once.
	r := rotate(id, map[string]string{"overlap": "PT0S"})
	if r.StatusCode != 201 {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	if e.call("GET", "/api/whoami", key).StatusCode != 401 {
		t.Fatal("zero overlap should end the old key now")
	}
	id2 := r.JSON(t)["id"].(string)

	// Overlap longer than the old key has left leaves its own expiry alone.
	r = rotate(id2, map[string]string{"overlap": "P7D"})
	if r.StatusCode != 201 {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	var list []map[string]any
	e.ada.Get("/api/roux/auth/me/api-keys").Decode(t, &list)
	for _, k := range list {
		if k["id"] == id2 && k["expiresAt"] != e.Clock.Now().Add(5*24*time.Hour).Format(time.RFC3339Nano) {
			t.Fatalf("an overlap past the old expiry changed it: %v", k["expiresAt"])
		}
	}

	for name, body := range map[string]any{
		"no overlap":    map[string]string{},
		"a bad overlap": map[string]string{"overlap": "soon"},
		"too long":      map[string]string{"overlap": "P8D"},
		"not an object": "x",
	} {
		if r := rotate(id2, body); r.StatusCode != 400 || code(t, r) != "invalid-request" {
			t.Errorf("%s: %d %s", name, r.StatusCode, r.Body)
		}
	}
	// A key that already expired cannot be rotated.
	shortID, _ := e.make("short", "PT1H", "report.read")
	e.Clock.Advance(2 * time.Hour)
	e.ada = e.SignedIn(e.owner)
	if r := rotate(shortID, map[string]string{"overlap": "PT0S"}); r.StatusCode != 400 || code(t, r) != "invalid-request" {
		t.Fatalf("an expired key: %d %s", r.StatusCode, r.Body)
	}
	// The lifetime of a rotated key is capped at the longest a key may last.
	e2 := setup(t, func(c *apikey.Config) { c.MaxLifetime = 30 * 24 * time.Hour })
	long, _ := e2.make("long", "P30D", "report.read")
	// A key made when the maximum was longer: it now outlasts it.
	if _, err := e2.Pool.Exec(context.Background(), `update roux_api_key set expires_at = created_at + interval '60 days' where id = $1`, long); err != nil {
		t.Fatal(err)
	}
	e2.Clock.Advance(time.Hour)
	e2.ada = e2.SignedIn(e2.owner)
	b := e2.ada.Post("/api/roux/auth/me/api-keys/"+long+"/rotations", map[string]string{"overlap": "PT1H"}).JSON(t)
	if want := e2.Clock.Now().Add(30 * 24 * time.Hour).Format(time.RFC3339Nano); b["expiresAt"] != want {
		t.Fatalf("%v, want %v", b["expiresAt"], want)
	}
}

func TestOnlyTheOwnerManagesAKey(t *testing.T) {
	e := setup(t)
	id, key := e.make("ci", "P30D", "report.read")
	bob := e.SignedIn(e.Identity("report.read"))
	for name, path := range map[string]string{"another identity's": id, "unknown": uuid.NewString(), "garbage": "nope"} {
		if r := bob.Post("/api/roux/auth/me/api-keys/"+path+"/rotations", map[string]string{"overlap": "PT1H"}); r.StatusCode != 404 || code(t, r) != "api-key-not-found" {
			t.Errorf("rotate %s: %d %s", name, r.StatusCode, r.Body)
		}
		if r := bob.Delete("/api/roux/auth/me/api-keys/" + path); r.StatusCode != 404 || code(t, r) != "api-key-not-found" {
			t.Errorf("revoke %s: %d %s", name, r.StatusCode, r.Body)
		}
	}
	if e.call("GET", "/api/whoami", key).StatusCode != 200 || e.count(`select count(*) from roux_api_key`) != 1 {
		t.Fatal("someone else touched the key")
	}
}

func TestRevokingAKey(t *testing.T) {
	e := setup(t)
	id, key := e.make("ci", "P30D", "report.read")
	_, keep := e.make("keep", "P30D", "report.read")
	if e.call("GET", "/api/whoami", key).StatusCode != 200 {
		t.Fatal("the key should work first")
	}
	if r := e.ada.Delete("/api/roux/auth/me/api-keys/" + id); r.StatusCode != 204 || len(r.Body) != 0 {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	if e.call("GET", "/api/whoami", key).StatusCode != 401 {
		t.Fatal("a revoked key must be refused at once")
	}
	if e.call("GET", "/api/whoami", keep).StatusCode != 200 {
		t.Fatal("revoking one key ended another")
	}
	if r := e.ada.Delete("/api/roux/auth/me/api-keys/" + id); r.StatusCode != 404 {
		t.Fatalf("revoking twice: %d", r.StatusCode)
	}
}

func TestLastUsedIsWrittenOncePerInterval(t *testing.T) {
	e := setup(t)
	id, key := e.make("ci", "P30D", "report.read")
	lastUsed := func() *time.Time {
		var at *time.Time
		if err := e.Pool.QueryRow(context.Background(), `select last_used_at from roux_api_key where id = $1`, id).Scan(&at); err != nil {
			t.Fatal(err)
		}
		return at
	}
	if lastUsed() != nil {
		t.Fatal("a key never used has no last use")
	}
	e.call("GET", "/api/whoami", key)
	first := lastUsed()
	if first == nil || !first.Equal(e.Clock.Now()) {
		t.Fatalf("first use: %v", first)
	}
	e.Clock.Advance(4 * time.Minute)
	e.call("GET", "/api/whoami", key)
	if got := lastUsed(); !got.Equal(*first) {
		t.Fatalf("a use within the interval wrote again: %v", got)
	}
	e.Clock.Advance(time.Minute)
	e.call("GET", "/api/whoami", key)
	if got := lastUsed(); !got.Equal(e.Clock.Now()) {
		t.Fatalf("a use after the interval did not write: %v", got)
	}
	var list []map[string]any
	e.ada.Get("/api/roux/auth/me/api-keys").Decode(t, &list)
	if list[0]["lastUsedAt"] == nil {
		t.Fatal("the list does not show the last use")
	}
}

func TestAKeyThatIsRefusedLeavesNoLastUse(t *testing.T) {
	e := setup(t)
	id, key := e.make("ci", "PT1H", "report.read")
	e.Clock.Advance(2 * time.Hour)
	e.call("GET", "/api/whoami", key)
	var at *time.Time
	if err := e.Pool.QueryRow(context.Background(), `select last_used_at from roux_api_key where id = $1`, id).Scan(&at); err != nil {
		t.Fatal(err)
	}
	if at != nil {
		t.Fatal("a refused key recorded a use")
	}
}

func TestTheConfigurationIsChecked(t *testing.T) {
	for _, bad := range []string{"x", "roux", "ro ux_", "_", "has-dash_", strings.Repeat("a", 20) + "_"} {
		if _, err := apikey.New(apikey.Config{Prefix: bad}); err == nil {
			t.Errorf("prefix %q should be refused", bad)
		}
	}
	for _, good := range []string{"ab_", "acme_", "My_App_", strings.Repeat("a", 19) + "_"} {
		if _, err := apikey.New(apikey.Config{Prefix: good}); err != nil {
			t.Errorf("prefix %q: %v", good, err)
		}
	}
	// A custom prefix and header are honored.
	e := setup(t, func(c *apikey.Config) { c.Prefix = "acme_"; c.Header = "X-Token" })
	_, key := e.make("ci", "P30D", "report.read")
	if !strings.HasPrefix(key, "acme_") {
		t.Fatal(key)
	}
	if r := e.Browser().DoWith("GET", "/api/whoami", map[string]string{"X-Token": key}); r.StatusCode != 200 {
		t.Fatalf("%d", r.StatusCode)
	}
	if r := e.call("GET", "/api/whoami", key); r.StatusCode != 401 {
		t.Fatalf("the default header should carry no key when another is configured: %d", r.StatusCode)
	}
}

// unknownKey is a key with the right shape and checksum that nobody made: make one, then delete it.
func (e *env) unknownKey() string {
	e.t.Helper()
	id, key := e.make("gone", "P1D", "report.read")
	if r := e.ada.Delete("/api/roux/auth/me/api-keys/" + id); r.StatusCode != 204 {
		e.t.Fatal(r.StatusCode)
	}
	return key
}
