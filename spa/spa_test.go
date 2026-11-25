package spa_test

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"github.com/andybalholm/brotli"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/organization"
	"github.com/jwcarman/roux/problem"
	"github.com/jwcarman/roux/spa"
)

const shell = `<!doctype html><html><head>
<meta property="csp-nonce" nonce="__CSP_NONCE__">
<title>__APP_NAME__</title>
<script type="application/json" id="app-theme">__APP_THEME__</script>
<script type="application/json" id="app-context">__APP_CONTEXT__</script>
<script type="module" nonce="__CSP_NONCE__" src="/assets/app-abc123.js"></script>
</head><body><div id="root"></div></body></html>`

func frontend() fstest.MapFS {
	return fstest.MapFS{
		"index.html":           {Data: []byte(shell)},
		"assets/app-abc123.js": {Data: []byte("console.log('hi')")},
		"favicon.svg":          {Data: []byte("<svg/>")},
		"robots.txt":           {Data: []byte("User-agent: *")},
	}
}

// server mounts a trivial API and the SPA, as main does.
func server(t *testing.T, cfg spa.Config) http.Handler {
	t.Helper()
	mux := api.NewMux()
	mux.Handle("GET /api/hello", func(w http.ResponseWriter, r *http.Request) error { return api.JSON(w, 200, "hi") })
	if cfg.FS == nil {
		cfg.FS = frontend()
	}
	if err := spa.Register(mux, cfg); err != nil {
		t.Fatal(err)
	}
	return mux
}

func do(h http.Handler, method, path, accept string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	if accept != "" {
		req.Header.Set("Accept", accept)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

const html = "text/html"

func isShell(rec *httptest.ResponseRecorder) bool {
	return rec.Code == 200 && strings.Contains(rec.Body.String(), `id="root"`)
}

func isProblem404(t *testing.T, rec *httptest.ResponseRecorder) bool {
	t.Helper()
	if rec.Code != 404 || rec.Header().Get("Content-Type") != problem.ContentType {
		return false
	}
	var p problem.Problem
	return json.Unmarshal(rec.Body.Bytes(), &p) == nil && p.Status == 404
}

func TestShellHeadersAndNonce(t *testing.T) {
	h := server(t, spa.Config{})
	rec := do(h, "GET", "/", html)
	if !isShell(rec) {
		t.Fatalf("/ with Accept html: %d %s", rec.Code, rec.Body)
	}
	hd := rec.Header()
	if hd.Get("Cache-Control") != "no-store" || hd.Get("X-Content-Type-Options") != "nosniff" ||
		hd.Get("Content-Type") != "text/html; charset=utf-8" {
		t.Fatalf("headers: %v", hd)
	}

	// 128-bit base64 nonce, identical in the header and every tagged element.
	csp := hd.Get("Content-Security-Policy")
	m := regexp.MustCompile(`'nonce-([A-Za-z0-9+/]{22}==)'`).FindStringSubmatch(csp)
	if m == nil {
		t.Fatalf("no nonce in policy: %s", csp)
	}
	body := rec.Body.String()
	if got := strings.Count(body, `nonce="`+m[1]+`"`); got != 2 {
		t.Fatalf("nonce appears on %d elements, want 2 (the meta and the script): %s", got, body)
	}
	if strings.Contains(body, "__") {
		t.Fatalf("placeholder left unfilled: %s", body)
	}

	// A fresh nonce for every response.
	other := do(h, "GET", "/", html).Header().Get("Content-Security-Policy")
	if other == csp {
		t.Fatal("two responses shared a nonce")
	}
}

func TestDefaultPolicyIsStrict(t *testing.T) {
	csp := do(server(t, spa.Config{}), "GET", "/", html).Header().Get("Content-Security-Policy")
	nonce := regexp.MustCompile(`'nonce-[^']+'`).FindString(csp)
	want := "default-src 'self'; script-src 'self' " + nonce + "; style-src 'self' " + nonce +
		"; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self'; media-src 'self'; form-action 'self'" +
		"; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
	if csp != want {
		t.Fatalf("policy:\n got %s\nwant %s", csp, want)
	}
	for _, bad := range []string{"unsafe-inline", "unsafe-eval"} {
		if strings.Contains(csp, bad) {
			t.Fatalf("policy contains %s", bad)
		}
	}
}

func TestPolicyExtendedAfterDefaults(t *testing.T) {
	csp := do(server(t, spa.Config{CSP: map[spa.Directive][]string{
		spa.ImgSrc:     {"https://img.example.com"},
		spa.ConnectSrc: {"https://api.example.com", "wss://live.example.com"},
		spa.ScriptSrc:  {"https://cdn.example.com"},
	}}), "GET", "/", html).Header().Get("Content-Security-Policy")
	for _, want := range []string{
		"img-src 'self' data: https://img.example.com;",
		"connect-src 'self' https://api.example.com wss://live.example.com;",
	} {
		if !strings.Contains(csp, want) {
			t.Fatalf("missing %q in %s", want, csp)
		}
	}
	if !regexp.MustCompile(`script-src 'self' 'nonce-[^']+' https://cdn.example.com;`).MatchString(csp) {
		t.Fatalf("script-src: %s", csp)
	}
}

func TestLooseningSourcesAreRefusedAtStartup(t *testing.T) {
	cases := []struct {
		name string
		dir  spa.Directive
		src  string
	}{
		{"wildcard", spa.ImgSrc, "*"},
		{"unsafe-inline", spa.ScriptSrc, "'unsafe-inline'"},
		{"unsafe-eval upper", spa.ScriptSrc, "'UNSAFE-EVAL'"},
		{"unsafe-hashes", spa.StyleSrc, "'unsafe-hashes'"},
		{"bare scheme for scripts", spa.ScriptSrc, "https:"},
		{"bare scheme for styles", spa.StyleSrc, "data:"},
		{"directive injection", spa.ImgSrc, "https://a.example.com; script-src *"},
		{"two sources in one", spa.ImgSrc, "https://a.example.com https://b.example.com"},
		{"comma", spa.ImgSrc, "https://a.example.com,https://b.example.com"},
		{"empty", spa.ImgSrc, ""},
		{"blank", spa.ImgSrc, " "},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := spa.New(spa.Config{FS: frontend(), CSP: map[spa.Directive][]string{c.dir: {c.src}}})
			if err == nil || !strings.Contains(err.Error(), string(c.dir)) {
				t.Fatalf("want refusal naming %s, got %v", c.dir, err)
			}
		})
	}
	// A scheme is fine where it cannot run code, and an unknown directive is refused.
	if _, err := spa.New(spa.Config{FS: frontend(), CSP: map[spa.Directive][]string{spa.ImgSrc: {"https:"}}}); err != nil {
		t.Fatalf("scheme for images: %v", err)
	}
	if _, err := spa.New(spa.Config{FS: frontend(), CSP: map[spa.Directive][]string{"default-src": {"https://x.example.com"}}}); err == nil {
		t.Fatal("default-src must not be extendable")
	}
}

func TestMissingPlaceholderIsRefusedNamingIt(t *testing.T) {
	for _, ph := range []string{"__CSP_NONCE__", "__APP_NAME__", "__APP_THEME__", "__APP_CONTEXT__"} {
		t.Run(ph, func(t *testing.T) {
			fsys := frontend()
			fsys["index.html"] = &fstest.MapFile{Data: []byte(strings.ReplaceAll(shell, ph, ""))}
			_, err := spa.New(spa.Config{FS: fsys})
			if err == nil || !strings.Contains(err.Error(), ph) {
				t.Fatalf("want error naming %s, got %v", ph, err)
			}
		})
	}
}

func TestNoShellMountsNothing(t *testing.T) {
	if _, err := spa.New(spa.Config{FS: fstest.MapFS{}}); err == nil {
		t.Fatal("want ErrNoShell")
	}
	mux := api.NewMux()
	if err := spa.Register(mux, spa.Config{FS: fstest.MapFS{}}); err != nil {
		t.Fatalf("a backend-only run must not fail: %v", err)
	}
	if !isProblem404(t, do(mux, "GET", "/", html)) {
		t.Fatal("without a frontend, / is a plain problem 404")
	}
}

func TestPageRequestRules(t *testing.T) {
	h := server(t, spa.Config{ExcludedPaths: []string{"/legacy/**", "/status"}})
	pages := []struct{ path, accept string }{
		{"/", html},
		{"/members", html},
		{"/members/42/edit", html},
		{"/v1.2/members", html}, // a dot in an earlier segment is not an extension
		{"/apiary", html},       // only starts like an exclusion
		{"/legacies", html},
		{"/members", "application/xhtml+xml, text/html;q=0.9, */*;q=0.8"},
		{"/members", "TEXT/HTML"},
	}
	for _, c := range pages {
		if rec := do(h, "GET", c.path, c.accept); !isShell(rec) {
			t.Errorf("GET %s (Accept %q) = %d, want the shell", c.path, c.accept, rec.Code)
		}
	}
	notPages := []struct{ path, accept string }{
		{"/members", ""},                 // no Accept
		{"/members", "*/*"},              // a wildcard alone does not name html
		{"/", "*/*"},                     // the welcome page must not leak the raw template
		{"/members", "application/json"}, // a fetch for JSON
		{"/members", "//"},               // unparseable
		{"/members/photo.png", html},     // a file
		{"/.env", html},
		{"/x.html", html},
		{"/assets/missing.js", html}, // a missing asset is a 404, never the shell
		{"/assets", html},
		{"/legacy/page", html}, // configured exclusion
		{"/legacy", html},
		{"/status", html},
		{"/api/nope", html}, // unknown API paths stay JSON problems
		{"/api", html},
		{"/.well-known/x", html},
	}
	for _, c := range notPages {
		if rec := do(h, "GET", c.path, c.accept); !isProblem404(t, rec) {
			t.Errorf("GET %s (Accept %q) = %d %q, want a problem 404", c.path, c.accept, rec.Code, rec.Body)
		}
	}
}

func TestHeadAndOtherMethods(t *testing.T) {
	h := server(t, spa.Config{})
	head := do(h, "HEAD", "/members", html)
	if head.Code != 200 || head.Body.Len() != 0 || head.Header().Get("Cache-Control") != "no-store" ||
		head.Header().Get("Content-Security-Policy") == "" {
		t.Fatalf("HEAD: %d body=%d %v", head.Code, head.Body.Len(), head.Header())
	}
	for _, m := range []string{"POST", "PUT", "DELETE", "PATCH"} {
		rec := do(h, m, "/", html)
		if rec.Code != 405 || rec.Header().Get("Allow") != "GET, HEAD" {
			t.Errorf("%s /: %d %v", m, rec.Code, rec.Header())
		}
	}
	// A direct request for /index.html is the shell whatever Accept says.
	if rec := do(h, "GET", "/index.html", "*/*"); !isShell(rec) || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("/index.html: %d %v", rec.Code, rec.Header())
	}
}

func TestAPIPathsNeverReachTheSPA(t *testing.T) {
	h := server(t, spa.Config{})
	if rec := do(h, "GET", "/api/hello", html); rec.Code != 200 || isShell(rec) {
		t.Fatalf("a real API route: %d %s", rec.Code, rec.Body)
	}
	if !isProblem404(t, do(h, "GET", "/api/nope", html)) {
		t.Fatal("unknown /api path with Accept html must be a JSON 404")
	}
	if rec := do(h, "POST", "/api/hello", ""); rec.Code != 405 || rec.Header().Get("Content-Type") != problem.ContentType {
		t.Fatalf("wrong method on an API route: %d", rec.Code)
	}
}

func TestAssetsCachedForAYear(t *testing.T) {
	h := server(t, spa.Config{})
	rec := do(h, "GET", "/assets/app-abc123.js", "*/*")
	if rec.Code != 200 || rec.Body.String() != "console.log('hi')" {
		t.Fatalf("asset: %d %q", rec.Code, rec.Body)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "public, max-age=31536000, immutable" {
		t.Fatalf("Cache-Control = %q", cc)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "javascript") {
		t.Fatalf("Content-Type = %q", ct)
	}
	head := do(h, "HEAD", "/assets/app-abc123.js", "")
	if head.Code != 200 || head.Body.Len() != 0 || head.Header().Get("Cache-Control") != rec.Header().Get("Cache-Control") {
		t.Fatalf("HEAD asset: %d %v", head.Code, head.Header())
	}
}

func TestOtherFilesRevalidateWithETag(t *testing.T) {
	h := server(t, spa.Config{})
	rec := do(h, "GET", "/favicon.svg", "")
	etag := rec.Header().Get("ETag")
	if rec.Code != 200 || rec.Header().Get("Cache-Control") != "no-cache" || etag == "" {
		t.Fatalf("favicon: %d %v", rec.Code, rec.Header())
	}
	req := httptest.NewRequest("GET", "/favicon.svg", nil)
	req.Header.Set("If-None-Match", etag)
	cond := httptest.NewRecorder()
	h.ServeHTTP(cond, req)
	if cond.Code != http.StatusNotModified {
		t.Fatalf("conditional GET = %d, want 304", cond.Code)
	}
	if do(h, "GET", "/robots.txt", "").Code != 200 {
		t.Fatal("robots.txt")
	}
}

func TestAFileOpenedOnItsOwnRunsNoScript(t *testing.T) {
	h := server(t, spa.Config{})
	for _, path := range []string{"/favicon.svg", "/robots.txt"} {
		rec := do(h, "GET", path, "")
		if csp := rec.Header().Get("Content-Security-Policy"); csp != "default-src 'none'; img-src 'self' data:; style-src 'self'; sandbox" {
			t.Errorf("%s: CSP %q", path, csp)
		}
	}
}

// A script's own CSP governs it only when it runs as a worker, where the file policy would block
// every fetch; opened on its own, a script is text (nosniff), so it needs none.
func TestAScriptCarriesNoPolicyOfItsOwnSoItCanRunAsAWorker(t *testing.T) {
	h := server(t, spa.Config{})
	rec := do(h, "GET", "/assets/app-abc123.js", "")
	if csp := rec.Header().Get("Content-Security-Policy"); rec.Code != 200 || csp != "" {
		t.Fatalf("%d, CSP %q", rec.Code, csp)
	}
	if rec.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("a script is served without nosniff: %v", rec.Header())
	}
}

func TestThemeAndContextAreWrittenIntoThePage(t *testing.T) {
	zone, _ := time.LoadLocation("America/New_York")
	now := time.Date(2026, 11, 24, 23, 30, 0, 0, zone)
	h := server(t, spa.Config{
		Theme: func(context.Context) (spa.Theme, error) {
			th := spa.StockTheme("Acme & Sons")
			th.Palette = "teal"
			return th, nil
		},
		Context: func() organization.Context { return organization.NewContext(now, zone, "en-US") },
	})
	body := do(h, "GET", "/", html).Body.String()
	if !strings.Contains(body, "<title>Acme &amp; Sons</title>") {
		t.Fatalf("title: %s", body)
	}
	themeJSON := between(t, body, `id="app-theme">`, `</script>`)
	var th spa.Theme
	if err := json.Unmarshal([]byte(themeJSON), &th); err != nil || th.AppName != "Acme & Sons" || th.Palette != "teal" {
		t.Fatalf("theme json %q: %+v %v", themeJSON, th, err)
	}
	ctxJSON := between(t, body, `id="app-context">`, `</script>`)
	var ctx map[string]any
	if err := json.Unmarshal([]byte(ctxJSON), &ctx); err != nil {
		t.Fatal(err)
	}
	if ctx["timeZone"] != "America/New_York" || ctx["locale"] != "en-US" || ctx["today"] != "2026-11-24" ||
		ctx["todayEndsAt"] != "2026-11-25T05:00:00Z" {
		t.Fatalf("context: %v", ctx)
	}
	if v, present := ctx["currency"]; !present || v != nil {
		t.Fatalf("currency should be present and null: %v", ctx)
	}
}

func between(t *testing.T, s, start, end string) string {
	t.Helper()
	i := strings.Index(s, start)
	if i < 0 {
		t.Fatalf("no %q in %s", start, s)
	}
	s = s[i+len(start):]
	return s[:strings.Index(s, end)]
}

func TestHostileValuesCannotBreakOutOfThePage(t *testing.T) {
	h := server(t, spa.Config{
		Theme: func(context.Context) (spa.Theme, error) {
			return spa.StockTheme(`</title><script>alert(1)</script>`), nil
		},
		Context: func() organization.Context {
			return organization.NewContext(time.Now(), time.UTC, `en</script><script>alert(2)`)
		},
	})
	body := do(h, "GET", "/", html).Body.String()
	if strings.Contains(body, "<script>alert") || strings.Contains(body, "</title><script>") {
		t.Fatalf("injected markup survived: %s", body)
	}
	// Both JSON blocks must still parse: '<' became <, not something broken.
	for _, id := range []string{"app-theme", "app-context"} {
		var v map[string]any
		if err := json.Unmarshal([]byte(between(t, body, `id="`+id+`">`, `</script>`)), &v); err != nil {
			t.Fatalf("%s: %v", id, err)
		}
	}
}

func TestAValueThatLooksLikeAPlaceholderIsNotFilledAgain(t *testing.T) {
	h := server(t, spa.Config{Theme: func(context.Context) (spa.Theme, error) { return spa.StockTheme("__APP_THEME__"), nil }})
	body := do(h, "GET", "/", html).Body.String()
	if !strings.Contains(body, "<title>__APP_THEME__</title>") {
		t.Fatalf("name was re-expanded: %s", body)
	}
}

func TestInvalidThemeIsRefused(t *testing.T) {
	bad := []func(*spa.Theme){
		func(t *spa.Theme) { t.AppName = "" },
		func(t *spa.Theme) { t.AppName = strings.Repeat("x", 61) },
		func(t *spa.Theme) { t.Palette = "mauve" },
		func(t *spa.Theme) { t.BrandColor = "blue" },
		func(t *spa.Theme) { t.BrandColor = "#12345" },
		func(t *spa.Theme) { t.Shape = "pointy" },
		func(t *spa.Theme) { t.HeadingFont = "comic" },
		func(t *spa.Theme) { t.BodyFont = "" },
	}
	for i, mutate := range bad {
		th := spa.StockTheme("App")
		mutate(&th)
		if th.Validate() == nil {
			t.Errorf("case %d: invalid theme accepted: %+v", i, th)
		}
		if _, err := spa.New(spa.Config{FS: frontend(), Theme: func(context.Context) (spa.Theme, error) { return th, nil }}); err == nil {
			t.Errorf("case %d: New accepted an invalid theme", i)
		}
	}
	if err := spa.StockTheme("App").Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestAFailingThemeSourceIsA500NotABrokenPage(t *testing.T) {
	failing := false
	h := server(t, spa.Config{Theme: func(context.Context) (spa.Theme, error) {
		if failing {
			return spa.Theme{}, errors.New("database is down")
		}
		return spa.StockTheme("App"), nil
	}})
	if !isShell(do(h, "GET", "/", html)) {
		t.Fatal("the page should render while the theme source works")
	}
	failing = true
	rec := do(h, "GET", "/", html)
	if rec.Code != 500 || rec.Header().Get("Content-Security-Policy") != "" || strings.Contains(rec.Body.String(), "database is down") {
		t.Fatalf("%d %v %s", rec.Code, rec.Header(), rec.Body)
	}
	// And a source that fails at startup stops startup.
	if _, err := spa.New(spa.Config{FS: frontend(), Theme: func(context.Context) (spa.Theme, error) { return spa.Theme{}, errors.New("nope") }}); err == nil {
		t.Fatal("a theme source that fails at startup must stop it")
	}
}

// ---- compression ----

func bigJS() []byte {
	return []byte(strings.Repeat("function render(props){return props.children}\n", 400))
}

func withEncoding(h http.Handler, method, path, acceptEncoding string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	if acceptEncoding != "" {
		req.Header.Set("Accept-Encoding", acceptEncoding)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func ungzip(t *testing.T, b []byte) []byte {
	t.Helper()
	zr, err := gzip.NewReader(bytes.NewReader(b))
	if err != nil {
		t.Fatalf("not gzip: %v", err)
	}
	out, err := io.ReadAll(zr)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func unbrotli(t *testing.T, b []byte) []byte {
	t.Helper()
	out, err := io.ReadAll(brotli.NewReader(bytes.NewReader(b)))
	if err != nil {
		t.Fatalf("not brotli: %v", err)
	}
	return out
}

func compressionServer(t *testing.T) (http.Handler, fstest.MapFS) {
	t.Helper()
	fsys := frontend()
	fsys["assets/app-big.js"] = &fstest.MapFile{Data: bigJS()}
	fsys["assets/style-big.css"] = &fstest.MapFile{Data: []byte(strings.Repeat("body{margin:0;padding:0}\n", 100))}
	fsys["assets/tiny.js"] = &fstest.MapFile{Data: []byte("x=1")}
	fsys["assets/inter.woff2"] = &fstest.MapFile{Data: bytes.Repeat([]byte{0, 1, 2, 3, 4, 5, 6, 7}, 500)}
	fsys["manifest.json"] = &fstest.MapFile{Data: []byte(`{"name":"` + strings.Repeat("a", 600) + `"}`)}
	return server(t, spa.Config{FS: fsys}), fsys
}

func TestTextFilesAreCompressedForBrowsersThatAcceptIt(t *testing.T) {
	h, _ := compressionServer(t)
	want := bigJS()

	// A browser that accepts both gets brotli, whose body is the file.
	rec := withEncoding(h, "GET", "/assets/app-big.js", "gzip, deflate, br")
	if rec.Code != 200 || rec.Header().Get("Content-Encoding") != "br" || rec.Header().Get("Vary") != "Accept-Encoding" {
		t.Fatalf("%d %v", rec.Code, rec.Header())
	}
	if !bytes.Equal(unbrotli(t, rec.Body.Bytes()), want) {
		t.Fatal("the brotli body is not the file")
	}
	// One that accepts gzip only gets gzip.
	gz := withEncoding(h, "GET", "/assets/app-big.js", "gzip, deflate")
	if gz.Header().Get("Content-Encoding") != "gzip" || !bytes.Equal(ungzip(t, gz.Body.Bytes()), want) {
		t.Fatalf("gzip fallback: %v", gz.Header())
	}
	if rec.Body.Len() >= gz.Body.Len() {
		t.Fatalf("brotli (%d bytes) should be smaller than gzip (%d)", rec.Body.Len(), gz.Body.Len())
	}
	if rec.Body.Len() > len(want)/10 {
		t.Fatalf("%d bytes compressed from %d: repetitive JavaScript should shrink a lot", rec.Body.Len(), len(want))
	}
	if cl := rec.Header().Get("Content-Length"); cl != strconv.Itoa(rec.Body.Len()) {
		t.Fatalf("Content-Length %s for a %d byte body", cl, rec.Body.Len())
	}
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "javascript") {
		t.Fatalf("Content-Type = %q (it must describe the file, not the gzip stream)", ct)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "public, max-age=31536000, immutable" {
		t.Fatalf("compression must not change the caching: %q", cc)
	}
	// CSS and JSON too.
	for _, p := range []string{"/assets/style-big.css", "/manifest.json"} {
		if got := withEncoding(h, "GET", p, "gzip, br").Header().Get("Content-Encoding"); got != "br" {
			t.Errorf("%s: Content-Encoding %q", p, got)
		}
	}
}

func TestCompressionFollowsAcceptEncoding(t *testing.T) {
	h, _ := compressionServer(t)
	for _, c := range []struct{ header, want string }{
		{"", ""}, {"identity", ""}, {"deflate", ""}, {"compress, zstd", ""},
		{"gzip", "gzip"}, {"GZIP", "gzip"}, {"x-gzip", "gzip"}, {"br", "br"}, {"BR", "br"},
		{"gzip, br", "br"}, {"br, gzip", "br"}, {"gzip, deflate, br", "br"}, // equal quality: brotli
		{"br;q=0, gzip", "gzip"}, {"br; q=0", ""}, {"gzip;q=0", ""}, {"gzip;q=0, br", "br"},
		{"gzip, br;q=0.5", "gzip"}, {"br, gzip;q=0.5", "br"}, {"br;q=0.8, gzip;q=0.9", "gzip"},
		{"*", "br"}, {"*;q=0", ""}, {"*, br;q=0", "gzip"}, {"*, gzip;q=0", "br"}, {"*, br;q=0, gzip;q=0", ""},
		{"identity, *;q=0.1", "br"}, {"gzip, *;q=0", "gzip"}, {"br, *;q=0", "br"},
		{"gzip;q=nonsense", ""}, {"br;q=nonsense, gzip", "gzip"},
	} {
		rec := withEncoding(h, "GET", "/assets/app-big.js", c.header)
		if got := rec.Header().Get("Content-Encoding"); got != c.want {
			t.Errorf("Accept-Encoding %q: Content-Encoding %q, want %q", c.header, got, c.want)
		}
		// Caches must always be told the answer depends on the request header.
		if rec.Header().Get("Vary") != "Accept-Encoding" {
			t.Errorf("Accept-Encoding %q: Vary = %q", c.header, rec.Header().Get("Vary"))
		}
		var body []byte
		switch c.want {
		case "br":
			body = unbrotli(t, rec.Body.Bytes())
		case "gzip":
			body = ungzip(t, rec.Body.Bytes())
		default:
			body = rec.Body.Bytes()
		}
		if !bytes.Equal(body, bigJS()) {
			t.Errorf("Accept-Encoding %q: the body is not the file", c.header)
		}
	}
}

func TestSomeFilesAreSentAsTheyAre(t *testing.T) {
	h, _ := compressionServer(t)
	for _, c := range []struct{ path, why string }{
		{"/assets/inter.woff2", "fonts are already compressed"},
		{"/assets/tiny.js", "too small to be worth it"},
		{"/robots.txt", "too small to be worth it"},
	} {
		rec := withEncoding(h, "GET", c.path, "gzip")
		if rec.Code != 200 || rec.Header().Get("Content-Encoding") != "" {
			t.Errorf("%s (%s): %d %v", c.path, c.why, rec.Code, rec.Header())
		}
	}
	if v := withEncoding(h, "GET", "/assets/inter.woff2", "gzip").Header().Get("Vary"); v != "" {
		t.Errorf("a file that is never compressed needs no Vary: %q", v)
	}
	// The shell is rendered per request (nonce and all) and is not compressed.
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Accept", "text/html")
	req.Header.Set("Accept-Encoding", "gzip")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Header().Get("Content-Encoding") != "" || !isShell(rec) {
		t.Fatalf("shell: %v", rec.Header())
	}
}

func TestHeadAndConditionalRequestsSeeTheRepresentationThatWouldBeSent(t *testing.T) {
	h, _ := compressionServer(t)

	head := withEncoding(h, "HEAD", "/manifest.json", "gzip")
	if head.Header().Get("Content-Encoding") != "gzip" || head.Body.Len() != 0 {
		t.Fatalf("HEAD: %v", head.Header())
	}
	get := withEncoding(h, "GET", "/manifest.json", "gzip")
	if head.Header().Get("Content-Length") != get.Header().Get("Content-Length") {
		t.Fatalf("HEAD says %s, GET sends %s", head.Header().Get("Content-Length"), get.Header().Get("Content-Length"))
	}

	// Each representation has its own ETag, and each validates itself.
	plain := withEncoding(h, "GET", "/manifest.json", "")
	gzTag, plainTag := get.Header().Get("ETag"), plain.Header().Get("ETag")
	if gzTag == "" || plainTag == "" || gzTag == plainTag || !strings.HasSuffix(gzTag, `-gzip"`) {
		t.Fatalf("ETags: gzip %q, plain %q", gzTag, plainTag)
	}
	for _, c := range []struct{ accept, tag string }{{"gzip", gzTag}, {"", plainTag}} {
		req := httptest.NewRequest("GET", "/manifest.json", nil)
		req.Header.Set("Accept-Encoding", c.accept)
		req.Header.Set("If-None-Match", c.tag)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusNotModified {
			t.Errorf("Accept-Encoding %q with its own ETag: %d, want 304", c.accept, rec.Code)
		}
	}
	// The gzip ETag does not validate the plain representation.
	req := httptest.NewRequest("GET", "/manifest.json", nil)
	req.Header.Set("If-None-Match", gzTag)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("a gzip ETag matched the plain representation: %d", rec.Code)
	}
}

func TestACompressedCopyIsNeverStale(t *testing.T) {
	h, fsys := compressionServer(t)
	first := withEncoding(h, "GET", "/assets/app-big.js", "gzip")
	again := withEncoding(h, "GET", "/assets/app-big.js", "gzip") // from the cache
	if !bytes.Equal(first.Body.Bytes(), again.Body.Bytes()) {
		t.Fatal("two requests for the same content differ")
	}
	// A build served from disk changes: the next response is the new file, not the old copy.
	changed := []byte(strings.Repeat("function other(){return 42}\n", 400))
	fsys["assets/app-big.js"] = &fstest.MapFile{Data: changed}
	if got := ungzip(t, withEncoding(h, "GET", "/assets/app-big.js", "gzip").Body.Bytes()); !bytes.Equal(got, changed) {
		t.Fatal("a changed file was answered with its old compressed copy")
	}
	// Content that does not compress is answered plain, and that is remembered too.
	random := make([]byte, 2000)
	rand.Read(random)
	fsys["assets/noise.js"] = &fstest.MapFile{Data: random}
	for i := 0; i < 2; i++ {
		rec := withEncoding(h, "GET", "/assets/noise.js", "gzip")
		if rec.Header().Get("Content-Encoding") != "" || !bytes.Equal(rec.Body.Bytes(), random) {
			t.Fatalf("incompressible content, request %d: %v", i, rec.Header())
		}
	}
}

func TestARangeGetsThePlainBytes(t *testing.T) {
	h, _ := compressionServer(t)
	req := httptest.NewRequest("GET", "/assets/app-big.js", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	req.Header.Set("Range", "bytes=0-9")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusPartialContent || rec.Header().Get("Content-Encoding") != "" || !bytes.Equal(rec.Body.Bytes(), bigJS()[:10]) {
		t.Fatalf("%d %v %q", rec.Code, rec.Header(), rec.Body)
	}
}

func TestEachEncodingHasItsOwnETagAndRevalidates(t *testing.T) {
	h, _ := compressionServer(t)
	tags := map[string]string{}
	for _, accept := range []string{"", "gzip", "br"} {
		tags[accept] = withEncoding(h, "GET", "/manifest.json", accept).Header().Get("ETag")
	}
	if tags[""] == "" || tags["gzip"] != strings.TrimSuffix(tags[""], `"`)+`-gzip"` || tags["br"] != strings.TrimSuffix(tags[""], `"`)+`-br"` {
		t.Fatalf("ETags: %v", tags)
	}
	for accept, tag := range tags {
		req := httptest.NewRequest("GET", "/manifest.json", nil)
		req.Header.Set("Accept-Encoding", accept)
		req.Header.Set("If-None-Match", tag)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusNotModified {
			t.Errorf("%q revalidating its own ETag: %d", accept, rec.Code)
		}
		// The ETag of one representation never validates another.
		for other, otherTag := range tags {
			if other == accept {
				continue
			}
			req.Header.Set("If-None-Match", otherTag)
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != 200 {
				t.Errorf("%q matched %q's ETag: %d", accept, other, rec.Code)
			}
		}
	}
}

func TestBrotliHeadersAndTheSpecialRequests(t *testing.T) {
	h, _ := compressionServer(t)
	rec := withEncoding(h, "GET", "/assets/app-big.js", "br")
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "javascript") {
		t.Fatalf("Content-Type %q must describe the file, not the brotli stream", ct)
	}
	if cl := rec.Header().Get("Content-Length"); cl != strconv.Itoa(rec.Body.Len()) {
		t.Fatalf("Content-Length %s for a %d byte body", cl, rec.Body.Len())
	}
	if cc := rec.Header().Get("Cache-Control"); !strings.Contains(cc, "immutable") {
		t.Fatalf("compression must not change the caching: %q", cc)
	}
	// HEAD says the same, with no body; a Range gets the plain bytes.
	head := withEncoding(h, "HEAD", "/manifest.json", "br")
	if head.Header().Get("Content-Encoding") != "br" || head.Body.Len() != 0 {
		t.Fatalf("HEAD: %v %d", head.Header(), head.Body.Len())
	}
	req := httptest.NewRequest("GET", "/assets/app-big.js", nil)
	req.Header.Set("Accept-Encoding", "br")
	req.Header.Set("Range", "bytes=0-9")
	ranged := httptest.NewRecorder()
	h.ServeHTTP(ranged, req)
	if ranged.Code != http.StatusPartialContent || ranged.Header().Get("Content-Encoding") != "" || !bytes.Equal(ranged.Body.Bytes(), bigJS()[:10]) {
		t.Fatalf("%d %v", ranged.Code, ranged.Header())
	}
	// Files that are sent as they are stay so, whatever the browser accepts.
	for _, p := range []string{"/assets/inter.woff2", "/assets/tiny.js", "/robots.txt"} {
		if got := withEncoding(h, "GET", p, "br, gzip").Header().Get("Content-Encoding"); got != "" {
			t.Errorf("%s: Content-Encoding %q", p, got)
		}
	}
}

func TestABrotliCopyIsNeverStaleAndIncompressibleStaysPlain(t *testing.T) {
	h, fsys := compressionServer(t)
	_ = withEncoding(h, "GET", "/assets/app-big.js", "br") // cached
	changed := []byte(strings.Repeat("function other(){return 42}\n", 400))
	fsys["assets/app-big.js"] = &fstest.MapFile{Data: changed}
	if got := unbrotli(t, withEncoding(h, "GET", "/assets/app-big.js", "br").Body.Bytes()); !bytes.Equal(got, changed) {
		t.Fatal("a changed file was answered with its old brotli copy")
	}
	random := make([]byte, 2000)
	rand.Read(random)
	fsys["assets/noise.js"] = &fstest.MapFile{Data: random}
	for i := 0; i < 2; i++ {
		rec := withEncoding(h, "GET", "/assets/noise.js", "br, gzip")
		if rec.Header().Get("Content-Encoding") != "" || !bytes.Equal(rec.Body.Bytes(), random) {
			t.Fatalf("incompressible content, request %d: %v", i, rec.Header())
		}
	}
}

func TestOfManyFirstRequestsOneCompresses(t *testing.T) {
	h, err := spa.New(spa.Config{FS: func() fstest.MapFS {
		fsys := frontend()
		fsys["assets/app-big.js"] = &fstest.MapFile{Data: bigJS()}
		return fsys
	}()})
	if err != nil {
		t.Fatal(err)
	}
	request := func(accept string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("GET", "/assets/app-big.js", nil)
		req.Header.Set("Accept-Encoding", accept)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}
	var wg, start sync.WaitGroup
	start.Add(1)
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			start.Wait()
			if rec := request("br"); rec.Header().Get("Content-Encoding") != "br" {
				t.Errorf("%v", rec.Header())
			}
		}()
	}
	start.Done()
	wg.Wait()
	if n := spa.Compressions(h); n != 1 {
		t.Fatalf("%d compressions for 20 requests at once, want 1", n)
	}
	request("br") // and later ones come from the cache
	if n := spa.Compressions(h); n != 1 {
		t.Fatalf("a cached answer compressed again: %d", n)
	}
	// Each encoding is compressed once of its own.
	request("gzip")
	request("gzip")
	if n := spa.Compressions(h); n != 2 {
		t.Fatalf("%d compressions after one brotli and one gzip, want 2", n)
	}
}

func TestTheStandInIsAFrontEndSpaAccepts(t *testing.T) {
	if err := spa.Register(api.NewMux(), spa.Config{FS: spa.StandIn()}); err != nil {
		t.Fatal(err)
	}
}
