package app_test

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/app"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/pgdb"
	"github.com/jwcarman/roux/pgtest"
)

// probe is a module that records what Assemble does to it.
type probe struct {
	name   string
	log    *[]string
	fail   string // "mount" or "start": return an error in that step
	method authn.Method
}

func (p *probe) Name() string { return p.name }
func (p *probe) record(step string) {
	*p.log = append(*p.log, step+" "+p.name)
}
func (p *probe) SignIn() authn.Method {
	p.record("signin")
	return p.method
}
func (p *probe) Mount(_ context.Context, k *app.Kit) error {
	p.record("mount")
	if k.Host == nil {
		return errors.New("mounted before who was registered")
	}
	if p.fail == "mount" {
		return errors.New("boom")
	}
	return nil
}
func (p *probe) Start(context.Context, *app.Kit) error {
	p.record("start")
	if p.fail == "start" {
		return errors.New("boom")
	}
	return nil
}
func (p *probe) Drain() { p.record("drain") }

type method struct{ name string }

func (m method) Contribute(o *authn.SignInOptions) {
	o.Providers = append(o.Providers, authn.Provider{ID: m.name, Name: m.name})
}
func (method) Mount(*authn.Host) error { return nil }

func kit() *app.Kit { return &app.Kit{Mux: api.NewMux(), AppName: "Acme"} }

func TestPhasesRunInOrder(t *testing.T) {
	var log []string
	k := kit()
	a := &probe{name: "a", log: &log, method: method{"ma"}}
	b := &probe{name: "b", log: &log, method: method{"mb"}}
	if err := app.Assemble(context.Background(), k, a, nil, b); err != nil { // a nil module is skipped
		t.Fatal(err)
	}
	// With no database there are no sign-in methods and no migrations; mounting and starting go in listed order.
	want := "mount a, mount b, start a, start b"
	if got := strings.Join(log, ", "); got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
	k.Drain()
	if got := strings.Join(log[4:], ", "); got != "drain a, drain b" {
		t.Fatalf("drain: %q", got)
	}
	if k.Host == nil {
		t.Fatal("the host was not set")
	}
}

func TestEveryMountComesBeforeAnyStart(t *testing.T) {
	var log []string
	err := app.Assemble(context.Background(), kit(), &probe{name: "a", log: &log}, &probe{name: "b", log: &log})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(log[:2], ",") != "mount a,mount b" {
		t.Fatalf("%v", log)
	}
}

func TestAFailureNamesTheModule(t *testing.T) {
	for _, step := range []string{"mount", "start"} {
		var log []string
		err := app.Assemble(context.Background(), kit(), &probe{name: "fine", log: &log}, &probe{name: "broken", log: &log, fail: step})
		if err == nil || !strings.Contains(err.Error(), "broken") || !strings.Contains(err.Error(), step) || strings.Contains(err.Error(), "fine") {
			t.Errorf("%s: %v", step, err)
		}
	}
}

func TestNamesMustBeUnique(t *testing.T) {
	var log []string
	err := app.Assemble(context.Background(), kit(), &probe{name: "x", log: &log}, &probe{name: "x", log: &log})
	if err == nil || !strings.Contains(err.Error(), `"x"`) {
		t.Fatalf("%v", err)
	}
	if len(log) != 0 {
		t.Fatal("something ran before the check")
	}
}

func TestTheThemeIsTheStockOneUntilAModuleSetsIt(t *testing.T) {
	k := kit()
	if err := app.Assemble(context.Background(), k); err != nil {
		t.Fatal(err)
	}
	th, err := k.ShellTheme(context.Background())
	if err != nil || th.AppName != "Acme" {
		t.Fatalf("%+v %v", th, err)
	}
	if org := k.Organization(); org.TimeZone != "UTC" || org.Locale != "en-US" || org.Currency != nil {
		t.Fatalf("the organization until a module sets it: %+v", org)
	}
}

// tableModule owns a table, through a migration of its own, and contributes a sign-in method.
type tableModule struct {
	name, table string
	after       []string
}

func (m tableModule) Name() string { return m.name }
func (m tableModule) Migrations() []pgdb.Migration {
	fsys := fstest.MapFS{"m/001.sql": {Data: []byte("create table " + m.table + " (id int)")}}
	return []pgdb.Migration{{Name: m.name, FS: fsys, Dir: "m", After: m.after}}
}
func (m tableModule) SignIn() authn.Method { return method{m.name} }

func TestMigrationsAndSignInMethodsAreCollectedFromEveryModule(t *testing.T) {
	pool := pgtest.Pool(t, "app")
	k := &app.Kit{Mux: api.NewMux(), AppName: "Acme", Pool: pool}
	// "second" declares it runs after "first", though it is listed before it; a module may be
	// listed twice under one migration (two modules sharing a schema is deduplicated by name).
	err := app.Assemble(context.Background(), k,
		tableModule{name: "second", table: "t_second", after: []string{"first"}},
		tableModule{name: "first", table: "t_first"})
	if err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"t_first", "t_second", "roux_identity", "roux_role"} { // and who's own
		var found bool
		if err := pool.QueryRow(context.Background(), `select to_regclass($1) is not null`, table).Scan(&found); err != nil || !found {
			t.Errorf("table %s: %v %v", table, found, err)
		}
	}
	// Both sign-in methods are on the sign-in page.
	rec := serve(k, "GET", "/who/sign-in")
	if !strings.Contains(rec, `"id":"first"`) || !strings.Contains(rec, `"id":"second"`) {
		t.Fatalf("sign-in options: %s", rec)
	}
}

func serve(k *app.Kit, method, path string) string {
	rec := &recorder{header: http.Header{}}
	k.Mux.ServeHTTP(rec, mustRequest(method, path))
	return rec.body.String()
}

type recorder struct {
	header http.Header
	body   strings.Builder
}

func (r *recorder) Header() http.Header         { return r.header }
func (r *recorder) Write(b []byte) (int, error) { return r.body.Write(b) }
func (r *recorder) WriteHeader(int)             {}

func mustRequest(method, path string) *http.Request {
	req, err := http.NewRequest(method, path, nil)
	if err != nil {
		panic(err)
	}
	return req
}

func TestTheLogSaysWhatIsOn(t *testing.T) {
	var buf bytes.Buffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(old) })

	var log []string
	err := app.Assemble(context.Background(), kit(), &probe{name: "alpha", log: &log, method: method{"m"}}, &probe{name: "beta", log: &log})
	if err != nil {
		t.Fatal(err)
	}
	out := buf.String()
	for _, want := range []string{
		`msg="module enabled" name=alpha migrations=0 sign_in=true`,
		`msg="module enabled" name=beta`,
		`msg="application assembled" modules=alpha,beta`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("the log lacks %q:\n%s", want, out)
		}
	}
	if strings.Index(out, "name=alpha") > strings.Index(out, "name=beta") {
		t.Error("modules are logged in the order they come up")
	}
	// A module that fails to mount is not logged as enabled.
	buf.Reset()
	_ = app.Assemble(context.Background(), kit(), &probe{name: "broken", log: &log, fail: "mount"})
	if strings.Contains(buf.String(), "name=broken") {
		t.Errorf("a module that failed is logged as enabled:\n%s", buf.String())
	}
}
