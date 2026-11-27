package theme_test

import (
	"context"
	"strings"
	"sync"
	"testing"
	"testing/fstest"

	"github.com/jwcarman/roux/authn/authntest"
	"github.com/jwcarman/roux/spa"
	"github.com/jwcarman/roux/theme"
)

var defaults = spa.Theme{AppName: "Acme Fitness", Palette: "gray", BrandColor: "#3b82f6", Shape: "medium", Depth: "flat", HeadingFont: "standard", BodyFont: "standard"}

func setup(t *testing.T) (*authntest.Env, theme.Service) {
	t.Helper()
	env := authntest.New(t, "theme", theme.Migration)
	svc := theme.Service{Pool: env.Pool, Defaults: defaults, Clock: env.Clock.Now}
	theme.Register(env.Mux, env.Host, svc)
	return env, svc
}

func valid(version int64) map[string]any {
	return map[string]any{
		"appName": "  Fit Club  ", "palette": "teal", "brandColor": "#FF8800", "shape": "round", "depth": "raised",
		"headingFont": "classic", "bodyFont": "friendly", "version": version,
	}
}

func fieldErrors(t *testing.T, r authntest.Reply) map[string]string {
	t.Helper()
	body := r.JSON(t)
	if r.StatusCode != 400 || body["detail"] != "The request has invalid fields" {
		t.Fatalf("want roux's 400, got %d %s", r.StatusCode, r.Body)
	}
	out := map[string]string{}
	var order []string
	for _, e := range body["errors"].([]any) {
		m := e.(map[string]any)
		out[m["field"].(string)] = m["message"].(string)
		order = append(order, m["field"].(string))
	}
	for i := 1; i < len(order); i++ {
		if order[i-1] > order[i] {
			t.Fatalf("errors must be sorted by field: %v", order)
		}
	}
	return out
}

func TestTheDefaultsStandUntilTheOwnerChooses(t *testing.T) {
	env, _ := setup(t)
	env.Serve()
	r := env.Browser().Get("/api/roux/theme") // anyone, signed out too
	want := `{"appName":"Acme Fitness","palette":"gray","brandColor":"#3b82f6","shape":"medium","depth":"flat","headingFont":"standard","bodyFont":"standard","version":0}`
	if r.StatusCode != 200 || strings.TrimSpace(string(r.Body)) != want {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	if r.Header.Get("Cache-Control") == "public" {
		t.Fatal("the theme must not be shared-cacheable")
	}
}

func TestOnlyWhoHoldsThemeManageMayChangeIt(t *testing.T) {
	env, _ := setup(t)
	env.Serve()
	if r := env.Browser().Put("/api/roux/theme", valid(0)); r.StatusCode != 401 {
		t.Fatalf("anonymous: %d", r.StatusCode)
	}
	if r := env.SignedIn(env.Identity("users.read")).Put("/api/roux/theme", valid(0)); r.StatusCode != 403 || r.JSON(t)["detail"] != "You do not have permission" {
		t.Fatalf("without the permission: %d %s", r.StatusCode, r.Body)
	}
	owner := env.SignedIn(env.Identity(theme.ThemeManage))
	if r := owner.Do("PUT", "/api/roux/theme", valid(0), false); r.StatusCode != 403 || r.JSON(t)["code"] != "invalid-csrf-token" {
		t.Fatalf("without a CSRF token: %d %s", r.StatusCode, r.Body)
	}
	if r := owner.Put("/api/roux/theme", valid(0)); r.StatusCode != 200 {
		t.Fatalf("with the permission: %d %s", r.StatusCode, r.Body)
	}
}

func TestSavingThemeStripsLowersAndVersions(t *testing.T) {
	env, _ := setup(t)
	env.Serve()
	owner := env.SignedIn(env.Identity(theme.ThemeManage))

	r := owner.Put("/api/roux/theme", valid(0))
	want := `{"appName":"Fit Club","palette":"teal","brandColor":"#ff8800","shape":"round","depth":"raised","headingFont":"classic","bodyFont":"friendly","version":1}`
	if r.StatusCode != 200 || strings.TrimSpace(string(r.Body)) != want {
		t.Fatalf("%d %s\nwant %s", r.StatusCode, r.Body, want)
	}
	// Anyone now sees it.
	if got := strings.TrimSpace(string(env.Browser().Get("/api/roux/theme").Body)); got != want {
		t.Fatalf("GET after PUT: %s", got)
	}
	// An edit from the version just read goes through, and members the server does not
	// know are ignored (api.DecodeLenient).
	next := valid(1)
	next["appName"] = "Fit Club 2"
	next["somethingElse"] = true
	if r := owner.Put("/api/roux/theme", next); r.StatusCode != 200 || r.JSON(t)["version"] != float64(2) {
		t.Fatalf("second save: %d %s", r.StatusCode, r.Body)
	}
}

func TestAStaleVersionIsAConflict(t *testing.T) {
	env, _ := setup(t)
	env.Serve()
	owner := env.SignedIn(env.Identity(theme.ThemeManage))
	owner.Put("/api/roux/theme", valid(0))
	stale := owner.Put("/api/roux/theme", valid(0)) // read before the save above
	if stale.StatusCode != 409 || stale.JSON(t)["detail"] != "This record changed since you loaded it" {
		t.Fatalf("%d %s", stale.StatusCode, stale.Body)
	}
	if got := owner.Get("/api/roux/theme").JSON(t)["version"]; got != float64(1) {
		t.Fatalf("a refused edit must change nothing: version %v", got)
	}
}

func TestOnlyOneOfTwoSavesFromTheSameVersionWins(t *testing.T) {
	env, _ := setup(t)
	env.Serve()
	a := env.SignedIn(env.Identity(theme.ThemeManage))
	b := env.SignedIn(env.Identity(theme.ThemeManage))
	a.Get("/api/roux/theme")
	b.Get("/api/roux/theme")
	statuses := make(chan int, 2)
	var wg, start sync.WaitGroup
	start.Add(1)
	for _, br := range []*authntest.Browser{a, b} {
		wg.Add(1)
		go func() { defer wg.Done(); start.Wait(); statuses <- br.Put("/api/roux/theme", valid(0)).StatusCode }()
	}
	start.Done()
	wg.Wait()
	close(statuses)
	wins, conflicts := 0, 0
	for s := range statuses {
		switch s {
		case 200:
			wins++
		case 409:
			conflicts++
		}
	}
	if wins != 1 || conflicts != 1 {
		t.Fatalf("%d wins and %d conflicts, want 1 and 1", wins, conflicts)
	}
}

func TestInvalidThemesAreRoux400s(t *testing.T) {
	env, _ := setup(t)
	env.Serve()
	owner := env.SignedIn(env.Identity(theme.ThemeManage))

	// Nothing sent: every member is required.
	got := fieldErrors(t, owner.Put("/api/roux/theme", map[string]any{}))
	for field, msg := range map[string]string{
		"appName": "Must not be blank", "palette": "Must not be empty", "brandColor": "Must not be empty",
		"shape": "Must not be empty", "depth": "Must not be empty", "headingFont": "Must not be empty", "bodyFont": "Must not be empty", "version": "Must not be empty",
	} {
		if got[field] != msg {
			t.Errorf("%s: %q, want %q (all: %v)", field, got[field], msg, got)
		}
	}

	// Values the front end has no look for.
	bad := valid(0)
	bad["palette"], bad["brandColor"], bad["shape"], bad["depth"], bad["headingFont"], bad["bodyFont"] = "mauve", "blue", "pointy", "deep", "comic", ""
	got = fieldErrors(t, owner.Put("/api/roux/theme", bad))
	for _, f := range []string{"palette", "brandColor", "shape", "depth", "headingFont", "bodyFont"} {
		if got[f] != "Is not in the expected format" {
			t.Errorf("%s: %q", f, got[f])
		}
	}
	if _, has := got["appName"]; has || len(got) != 6 {
		t.Errorf("only the six bad members should be reported: %v", got)
	}

	// The name: blank, spaces only, and too long.
	for _, c := range []struct{ name, want string }{
		{"", "Must not be blank"}, {"   ", "Must not be blank"}, {strings.Repeat("x", 61), "Must be between 0 and 60 characters"},
	} {
		in := valid(0)
		in["appName"] = c.name
		if got := fieldErrors(t, owner.Put("/api/roux/theme", in)); got["appName"] != c.want {
			t.Errorf("appName %q: %q, want %q", c.name, got["appName"], c.want)
		}
	}
	// A sixty-character name is fine.
	ok := valid(0)
	ok["appName"] = strings.Repeat("x", 60)
	if r := owner.Put("/api/roux/theme", ok); r.StatusCode != 200 {
		t.Fatalf("60 characters: %d %s", r.StatusCode, r.Body)
	}
	// And a body that is not JSON at all is a plain 400.
	if r := owner.Put("/api/roux/theme", `{nope`); r.StatusCode != 400 {
		t.Fatalf("not JSON: %d", r.StatusCode)
	}
}

func TestOwnerHoldsThemeManage(t *testing.T) {
	env, _ := setup(t)
	var n int
	if err := env.Pool.QueryRow(context.Background(), `
		select count(*) from roux_role_permission rp join roux_role r on r.id = rp.role_id
		 where r.name = 'OWNER' and rp.permission = 'theme.manage'`).Scan(&n); err != nil || n != 1 {
		t.Fatalf("OWNER should be granted theme.manage by the migration: %d %v", n, err)
	}
}

func TestThePageCarriesTheSavedTheme(t *testing.T) {
	env, svc := setup(t)
	fsys := fstest.MapFS{"index.html": {Data: []byte(`<title>__APP_NAME__</title><script nonce="__CSP_NONCE__">__APP_THEME__ __APP_CONTEXT__</script>`)}}
	if err := spa.Register(env.Mux, spa.Config{FS: fsys, Theme: svc.Shell}); err != nil {
		t.Fatal(err)
	}
	env.Serve()
	html := func() string {
		b := env.Browser()
		r := b.DoWith("GET", "/", map[string]string{"Accept": "text/html"})
		return string(r.Body)
	}
	if got := html(); !strings.Contains(got, "<title>Acme Fitness</title>") {
		t.Fatalf("before the owner chooses, the page has the default: %s", got)
	}
	env.SignedIn(env.Identity(theme.ThemeManage)).Put("/api/roux/theme", valid(0))
	if got := html(); !strings.Contains(got, "<title>Fit Club</title>") || !strings.Contains(got, `"palette":"teal"`) {
		t.Fatalf("the next page served must carry the saved theme: %s", got)
	}
}

func TestCurrentAnswersDefaultDepthWhenUnchosen(t *testing.T) {
	env := authntest.New(t, "theme", theme.Migration)
	d := defaults
	d.Depth = "raised"
	svc := theme.Service{Pool: env.Pool, Defaults: d, Clock: env.Clock.Now}
	got, err := svc.Current(context.Background())
	if err != nil || got.Depth != "raised" {
		t.Fatalf("an unchosen depth is the default: %+v %v", got, err)
	}
	shell, err := svc.Shell(context.Background())
	if err != nil || shell.Depth != "raised" {
		t.Fatalf("the page carries it: %+v %v", shell, err)
	}
}

func TestUpdateStoresDepth(t *testing.T) {
	env, svc := setup(t)
	env.Serve()
	owner := env.SignedIn(env.Identity(theme.ThemeManage))
	if r := owner.Put("/api/roux/theme", valid(0)); r.StatusCode != 200 || r.JSON(t)["depth"] != "raised" {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	got, err := svc.Current(context.Background())
	if err != nil || got.Depth != "raised" {
		t.Fatalf("stored depth: %+v %v", got, err)
	}
}

func TestUpdateRequiresDepth(t *testing.T) {
	env, _ := setup(t)
	env.Serve()
	owner := env.SignedIn(env.Identity(theme.ThemeManage))
	in := valid(0)
	delete(in, "depth")
	if got := fieldErrors(t, owner.Put("/api/roux/theme", in)); got["depth"] != "Must not be empty" || len(got) != 1 {
		t.Fatalf("%v", got)
	}
}
