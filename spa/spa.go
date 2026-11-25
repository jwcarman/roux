// Package spa serves a single-page front end (roux-web, built by Vite) from the
// same server as the API. The built files are an fs.FS (typically embedded):
// index.html at the root and content-hashed files under assets/.
//
// Behavior, matching roux's Spring implementation:
//
//   - A GET or HEAD whose Accept names text/html (a wildcard alone does not), whose
//     path has no file extension and is not under an excluded path is answered
//     with the shell, index.html, so reloads and deep links open the page. The
//     client-side router decides what an unknown page is.
//   - The shell is filled in per request: __CSP_NONCE__ (this response's nonce),
//     __APP_NAME__ (HTML-escaped, for the title), __APP_THEME__ and
//     __APP_CONTEXT__ (JSON with every '<' escaped), in one pass so a value that
//     looks like a placeholder is never filled again. A page missing a
//     placeholder is refused at startup. The shell is sent Cache-Control:
//     no-store, nosniff and its own strict Content-Security-Policy.
//   - /assets/** is cached for a year, public and immutable (Vite puts a content
//     hash in every name). A missing asset is a 404, never the shell.
//   - Other static files (favicon, robots.txt) are revalidated with an ETag.
//   - Anything else, and every unknown path under /api/, is a problem+json 404.
package spa

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io/fs"
	"log/slog"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/organization"
	"github.com/jwcarman/roux/problem"
)

const (
	shellFile = "index.html"
	shellPath = "/index.html"

	noncePlaceholder   = "__CSP_NONCE__"
	namePlaceholder    = "__APP_NAME__"
	themePlaceholder   = "__APP_THEME__"
	contextPlaceholder = "__APP_CONTEXT__"

	assetsPrefix  = "/assets/"
	assetLifetime = 365 * 24 * time.Hour
)

// placeholders in the order they are checked.
var placeholders = []string{noncePlaceholder, namePlaceholder, themePlaceholder, contextPlaceholder}

// ErrNoShell means the front end has not been built: its FS has no index.html.
var ErrNoShell = errors.New("spa: no index.html in the frontend files")

// defaultExcluded are paths a page URL never begins with. (/api/ never reaches
// this handler, but is listed so a Handler used on its own behaves the same.)
var defaultExcluded = []string{"/api/**", "/assets/**", "/.well-known/**"}

// Config says what to serve and how to fill the shell.
type Config struct {
	// FS holds the built frontend: index.html at its root, hashed files in assets/.
	FS fs.FS
	// Theme is read for every page (so a theme the owner has just saved is in the
	// next page served); defaults to StockTheme("App"). An error is a 500.
	Theme func(ctx context.Context) (Theme, error)
	// Context is read for every page; defaults to UTC, "en-US".
	Context func() organization.Context
	// CSP adds sources to directives after the strict defaults. Nothing can
	// loosen default-src, object-src, base-uri or frame-ancestors, and a source
	// that would undo the policy is refused at startup.
	CSP map[Directive][]string
	// ExcludedPaths are extra patterns (exact, or a prefix ending in "/**") that
	// are never answered with the shell, besides /api/**, /assets/** and
	// /.well-known/**.
	ExcludedPaths []string
}

type handler struct {
	template string
	fsys     fs.FS
	policy   *policy
	theme    func(ctx context.Context) (Theme, error)
	context  func() organization.Context
	excluded []string
	compress compressCache
}

// New validates the configuration and returns the handler. It returns
// ErrNoShell (wrapped) if the frontend has not been built.
// noResource is the 404 detail for a path nothing is served at.
const noResource = "No resource exists at this path."

func New(cfg Config) (http.Handler, error) {
	if cfg.FS == nil {
		return nil, ErrNoShell
	}
	raw, err := fs.ReadFile(cfg.FS, shellFile)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, fmt.Errorf("%w (build the frontend)", ErrNoShell)
	}
	if err != nil {
		return nil, fmt.Errorf("spa: read %s: %w", shellFile, err)
	}
	template := string(raw)
	for _, p := range placeholders {
		if !strings.Contains(template, p) {
			return nil, fmt.Errorf("spa: index.html has no %s: the shell cannot be served without it", p)
		}
	}
	pol, err := newPolicy(cfg.CSP)
	if err != nil {
		return nil, err
	}
	h := &handler{
		template: template,
		fsys:     cfg.FS,
		policy:   pol,
		theme:    cfg.Theme,
		context:  cfg.Context,
		excluded: append(append([]string{}, defaultExcluded...), cfg.ExcludedPaths...),
	}
	if h.theme == nil {
		h.theme = func(context.Context) (Theme, error) { return StockTheme("App"), nil }
	}
	if h.context == nil {
		h.context = func() organization.Context { return organization.NewContext(time.Now(), time.UTC, "en-US") }
	}
	if t, err := h.theme(context.Background()); err != nil {
		return nil, fmt.Errorf("spa: the theme: %w", err)
	} else if err := t.Validate(); err != nil {
		return nil, err
	}
	return h, nil
}

// Register serves the front end from everything outside /api/ on mux. If the
// frontend has not been built (no index.html) it logs that and mounts nothing,
// so a backend-only run still works; any other error (a placeholder missing, a
// refused CSP source, a bad theme) is returned and should stop startup.
func Register(mux *api.Mux, cfg Config) error {
	h, err := New(cfg)
	if errors.Is(err, ErrNoShell) {
		slog.Info("frontend not served", "reason", err)
		return nil
	}
	if err != nil {
		return err
	}
	mux.Fallback(h)
	return nil
}

func (h *handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		problem.Write(w, r, problem.MethodNotAllowed("Method "+r.Method+" is not allowed for this resource."))
		return
	}
	p := r.URL.Path
	switch {
	case p == shellPath:
		h.shell(w, r)
	case strings.HasPrefix(p, assetsPrefix):
		h.file(w, r, strings.TrimPrefix(p, "/"), "public, max-age="+strconv.Itoa(int(assetLifetime.Seconds()))+", immutable", false)
	case hasExtension(p):
		h.file(w, r, strings.TrimPrefix(p, "/"), "no-cache", true)
	case h.isPage(r, p):
		h.shell(w, r)
	default:
		problem.Write(w, r, problem.NotFound(noResource))
	}
}

// isPage reports whether r is a browser's request for a client-side route.
func (h *handler) isPage(r *http.Request, p string) bool {
	if !acceptsHTML(r.Header.Get("Accept")) {
		return false
	}
	for _, pattern := range h.excluded {
		if matches(pattern, p) {
			return false
		}
	}
	return true
}

// matches reports whether path equals pattern, or lies under it when the
// pattern ends in "/**". Whole segments only: "/api/**" does not match "/apiary".
func matches(pattern, p string) bool {
	if prefix, ok := strings.CutSuffix(pattern, "/**"); ok {
		return p == prefix || strings.HasPrefix(p, prefix+"/")
	}
	return p == pattern
}

// acceptsHTML reports whether Accept names text/html; a wildcard alone does not.
func acceptsHTML(accept string) bool {
	for _, part := range strings.Split(accept, ",") {
		mt, _, err := mime.ParseMediaType(strings.TrimSpace(part))
		if err == nil && mt == "text/html" {
			return true
		}
	}
	return false
}

// hasExtension reports whether the last path segment has a '.', so "/v1.2/members"
// is a page but "/members/photo.png" and "/.env" are not.
func hasExtension(p string) bool {
	return strings.Contains(p[strings.LastIndex(p, "/")+1:], ".")
}

func newNonce() (string, error) {
	b := make([]byte, 16) // 128 bits
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(b), nil
}

// shell renders index.html for this request.
func (h *handler) shell(w http.ResponseWriter, r *http.Request) {
	body, nonce, err := h.render(r.Context())
	if err != nil {
		slog.ErrorContext(r.Context(), "render shell", "err", err)
		problem.Write(w, r, problem.Internal())
		return
	}
	hd := w.Header()
	hd.Set("Content-Type", "text/html; charset=utf-8")
	// A stored copy would carry a nonce the next response's policy does not allow.
	hd.Set("Cache-Control", "no-store")
	hd.Set("X-Content-Type-Options", "nosniff")
	hd.Set("Content-Security-Policy", h.policy.forNonce(nonce))
	hd.Set("Content-Length", strconv.Itoa(len(body)))
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = w.Write([]byte(body))
	}
}

func (h *handler) render(ctx context.Context) (page, nonce string, err error) {
	theme, err := h.theme(ctx)
	if err != nil {
		return "", "", err
	}
	if err := theme.Validate(); err != nil {
		return "", "", err
	}
	themeJSON, err := jsonInScript(theme)
	if err != nil {
		return "", "", err
	}
	contextJSON, err := jsonInScript(h.context())
	if err != nil {
		return "", "", err
	}
	if nonce, err = newNonce(); err != nil {
		return "", "", err
	}
	// One pass: strings.Replacer never rescans what it has substituted.
	page = strings.NewReplacer(
		noncePlaceholder, nonce,
		namePlaceholder, html.EscapeString(theme.AppName),
		themePlaceholder, themeJSON,
		contextPlaceholder, contextJSON,
	).Replace(h.template)
	return page, nonce, nil
}

// jsonInScript encodes v for a <script type="application/json"> element: Go's
// encoder escapes <, > and & as < etc., so nothing in it can end the element.
func jsonInScript(v any) (string, error) {
	b, err := json.Marshal(v)
	return string(b), err
}

// file serves one static file from the frontend FS. A missing file is a 404
// (never the shell). If etag is set the file is revalidated by content hash.
func (h *handler) file(w http.ResponseWriter, r *http.Request, name, cacheControl string, etag bool) {
	if !fs.ValidPath(name) || name == shellFile {
		problem.Write(w, r, problem.NotFound(noResource))
		return
	}
	data, err := fs.ReadFile(h.fsys, name)
	if err != nil {
		problem.Write(w, r, problem.NotFound(noResource))
		return
	}
	hd := w.Header()
	hd.Set("Cache-Control", cacheControl)
	hd.Set("X-Content-Type-Options", "nosniff")
	tag := etagOf(data)
	if compressible(name) && len(data) >= minCompress {
		hd.Add("Vary", "Accept-Encoding") // caches must keep the two representations apart
		// A Range asks for bytes of the file as it is, so it gets the plain representation.
		if coding := chooseEncoding(r); coding != "" && r.Header.Get("Range") == "" {
			if packed := h.compress.get(coding, tag, data); packed != nil {
				hd.Set("Content-Encoding", coding)
				hd.Set("Content-Type", contentType(name))
				// ServeContent leaves Content-Length out when a Content-Encoding is set, in case
				// something downstream changes the body; nothing does here, so say it.
				hd.Set("Content-Length", strconv.Itoa(len(packed)))
				data = packed
				tag = strings.TrimSuffix(tag, `"`) + "-" + coding + `"` // another representation, another ETag
			}
		}
	}
	if etag {
		hd.Set("ETag", tag)
	}
	// Zero modtime: embedded files have none, so no Last-Modified is sent.
	http.ServeContent(w, r, path.Base(name), time.Time{}, bytes.NewReader(data))
}

func etagOf(data []byte) string {
	sum := sha256.Sum256(data)
	return `"` + hex.EncodeToString(sum[:16]) + `"`
}
