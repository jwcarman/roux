// Package api provides shared plumbing so new endpoints get consistent
// behavior (problem+json errors, panic recovery, JSON helpers) for free.
package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"github.com/jwcarman/roux/apperr"
	"github.com/jwcarman/roux/problem"
)

// HandlerFunc is like http.HandlerFunc but returns an error. Returned errors
// are rendered as RFC 9457 problem details by the Mux it is registered on.
type HandlerFunc func(w http.ResponseWriter, r *http.Request) error

// ProblemSource can be implemented by any error type that knows how it should
// be presented over HTTP. It keeps domain packages free of HTTP concerns:
// they only need to satisfy this one-method interface (no import required).
type ProblemSource interface {
	Problem() *problem.Problem
}

// mapping returns a problem for errors it recognizes, or nil to pass.
type mapping func(err error) *problem.Problem

// handler binds a HandlerFunc to the Mux whose error mappings apply to it.
type handler struct {
	fn     HandlerFunc
	mux    *Mux
	render ErrorRenderer
}

func (h handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if err := h.fn(w, r); err != nil {
		p := h.mux.toProblem(r, err)
		if p.Status >= 500 { // server faults are errors on the trace; 4xx are not
			span := trace.SpanFromContext(r.Context())
			span.RecordError(err)
			span.SetStatus(codes.Error, p.Title)
		}
		h.render(w, r, p)
	}
}

// ErrorRenderer writes a problem as the response. problem.Write is the default;
// a kit package that must answer in another format under its own base path
// (sign-in's urn:roux:error problems, say) supplies its own via Mux.Kit.
type ErrorRenderer func(w http.ResponseWriter, r *http.Request, p *problem.Problem)

// kitBase is a base path reserved for one kit package.
type kitBase struct {
	prefix string
	render ErrorRenderer
}

func (b *kitBase) covers(path string) bool {
	return path == b.prefix || strings.HasPrefix(path, b.prefix+"/")
}

// opaque500 is the answer to a failure the client is told nothing about: the same
// words every time, and an id that finds the cause in the log.
func opaque500(errorID string) *problem.Problem {
	p := problem.Internal()
	p.Detail, p.ErrorID = "Something went wrong", errorID
	return p
}

// toProblem resolves an error to a problem, in order of precedence:
//  1. the error chain contains a *problem.Problem
//  2. the chain contains a ProblemSource
//  3. a registered mapping (MapError / MapType) claims it; the most recently
//     registered mapping is consulted first, so features can override defaults
//  4. otherwise: a generic 500 (the real error is logged, never leaked)
func (m *Mux) toProblem(r *http.Request, err error) *problem.Problem {
	var p *problem.Problem
	if errors.As(err, &p) {
		return p
	}
	var src ProblemSource
	if errors.As(err, &src) {
		return src.Problem()
	}
	for i := len(m.mappings) - 1; i >= 0; i-- {
		if p := m.mappings[i](err); p != nil {
			return p
		}
	}
	// The client learns nothing of the cause, but gets an id that finds it in the log.
	errorID := uuid.NewString()
	slog.ErrorContext(r.Context(), "unhandled error", "errorId", errorID, "method", r.Method, "path", r.URL.Path, "err", err)
	return opaque500(errorID)
}

// JSON writes v as a JSON response with the given status.
func JSON(w http.ResponseWriter, status int, v any) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(v)
}

// Decode reads a single JSON object from the request body into v, rejecting unknown
// fields and trailing data with a 400 problem.
func Decode(r *http.Request, v any) error { return decode(r, v, true) }

// DecodeLenient is Decode for roux's own endpoints, which (like Spring Boot's JSON
// mapper) ignore members they do not know, so a client may send more than is read.
func DecodeLenient(r *http.Request, v any) error { return decode(r, v, false) }

func decode(r *http.Request, v any, strict bool) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20))
	if strict {
		dec.DisallowUnknownFields()
	}
	if err := dec.Decode(v); err != nil {
		return decodeProblem(err)
	}
	if _, err := dec.Token(); err != io.EOF {
		return problem.BadRequest("Request body must contain a single JSON object.")
	}
	return nil
}

// decodeProblem says what is wrong with a body in the client's terms: Go's own message names
// the handler's struct and field types, which are the server's business.
func decodeProblem(err error) *problem.Problem {
	var (
		tooBig    *http.MaxBytesError
		wrongType *json.UnmarshalTypeError
	)
	switch {
	case errors.As(err, &tooBig):
		return problem.New(http.StatusRequestEntityTooLarge, "Request body is too large.")
	case errors.As(err, &wrongType) && wrongType.Field == "":
		return problem.BadRequest("Request body is not valid JSON: it must be an object.")
	case errors.As(err, &wrongType):
		return problem.BadRequest("Request body is not valid JSON: " + wrongType.Field + " has the wrong type.")
	}
	if quoted, ok := strings.CutPrefix(err.Error(), "json: unknown field "); ok {
		if member, uerr := strconv.Unquote(quoted); uerr == nil {
			return problem.BadRequest("Request body has a member this endpoint does not take: " + member + ".")
		}
	}
	return problem.BadRequest("Request body is not valid JSON.")
}

// Recoverer converts panics into 500 problem responses.
func Recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil && rec != http.ErrAbortHandler {
				errorID := uuid.NewString()
				slog.ErrorContext(r.Context(), "panic", "errorId", errorID, "method", r.Method, "path", r.URL.Path, "panic", rec)
				span := trace.SpanFromContext(r.Context())
				span.RecordError(fmt.Errorf("panic: %v", rec))
				span.SetStatus(codes.Error, "panic")
				problem.Write(w, r, opaque500(errorID))
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// Mux wraps http.ServeMux so unmatched routes (404) and wrong methods (405)
// also produce problem details instead of plain text.
type Mux struct {
	sm       *http.ServeMux // private so routes can only be added through Handle/HandleRoux
	mappings []mapping
	fallback http.Handler // serves everything outside /api/ that no route matched (the SPA)
	kits     []*kitBase
	roux     *Kit
}

// NewMux returns a Mux with default mappings for the apperr sentinels.
func NewMux() *Mux {
	m := &Mux{sm: http.NewServeMux()}
	m.roux = m.Kit(strings.TrimSuffix(RouxPrefix, "/"), problem.Write)
	// The answer is the sentinel's alone: what the domain wrapped it with ("item 42: ...") is
	// context for the log, not for the client.
	for target, p := range map[error]func() *problem.Problem{
		apperr.ErrNotFound:     func() *problem.Problem { return problem.NotFound("Not found") },
		apperr.ErrConflict:     func() *problem.Problem { return problem.Conflict("Conflict") },
		apperr.ErrUnauthorized: problem.Unauthorized,
		apperr.ErrForbidden:    problem.Forbidden,
	} {
		m.MapError(target, func(error) *problem.Problem { return p() })
	}
	return m
}

const (
	// Prefix is where every application endpoint lives.
	Prefix = "/api/"
	// RouxPrefix is reserved for endpoints the kit itself provides (health, ...).
	// Applications cannot register routes here.
	RouxPrefix = "/api/roux/"
)

// splitPattern validates the "METHOD /path" form and returns its parts.
// Registration mistakes panic at startup, like http.ServeMux does.
func splitPattern(pattern string) (method, path string) {
	method, path, ok := strings.Cut(pattern, " ")
	if !ok || method == "" || !strings.HasPrefix(path, "/") {
		panic(fmt.Sprintf("api: route %q must have the form \"METHOD /path\"", pattern))
	}
	return method, path
}

// Handle registers an application endpoint. The pattern must be "METHOD /api/..."
// (Go 1.22 syntax, e.g. "GET /api/items/{id}") and must not be under /api/roux/,
// which is reserved for the kit. Violations panic at startup.
func (m *Mux) Handle(pattern string, h HandlerFunc) {
	method, path := splitPattern(pattern)
	if !strings.HasPrefix(path, Prefix) {
		panic(fmt.Sprintf("api: route %q must be under %s", pattern, Prefix))
	}
	if path == strings.TrimSuffix(RouxPrefix, "/") || strings.HasPrefix(path, RouxPrefix) {
		panic(fmt.Sprintf("api: route %q is under %s, which is reserved for the kit", pattern, RouxPrefix))
	}
	m.sm.Handle(method+" "+path, handler{fn: h, mux: m, render: problem.Write})
}

// HandleRoux registers an endpoint roux itself provides. The pattern names the whole
// path, which must be under /api/roux/: HandleRoux("GET /api/roux/healthz", h). Only
// roux's packages call this; applications use Handle.
func (m *Mux) HandleRoux(pattern string, h HandlerFunc) {
	method, path := splitPattern(pattern)
	if !strings.HasPrefix(path, RouxPrefix) {
		panic(fmt.Sprintf("api: roux route %q must be under %s", pattern, RouxPrefix))
	}
	m.roux.Handle(method+" "+strings.TrimPrefix(path, m.roux.base.prefix), h)
}

// Kit reserves a base path for one of roux's packages and returns its registrar.
// Routes registered through it live under prefix, and every error there (including
// the router's own 404 and 405) is written by render. The front-end fallback never
// serves paths under a kit base. Reserving is for roux's packages (sign-in reserves
// /api/roux/auth, for instance); applications use Handle. Panics at startup if prefix
// is not an absolute path without a trailing slash, is under /api/ but not under
// /api/roux/, or overlaps a base already reserved (other than /api/roux itself, which
// the more specific base takes over beneath it).
func (m *Mux) Kit(prefix string, render ErrorRenderer) *Kit {
	if !strings.HasPrefix(prefix, "/") || len(prefix) < 2 || strings.HasSuffix(prefix, "/") {
		panic(fmt.Sprintf("api: kit base %q must be an absolute path without a trailing slash", prefix))
	}
	rouxBase := strings.TrimSuffix(RouxPrefix, "/")
	if isAPIPath(prefix) && prefix != rouxBase && !strings.HasPrefix(prefix, RouxPrefix) {
		panic(fmt.Sprintf("api: kit base %q is under %s, which belongs to the application", prefix, Prefix))
	}
	b := &kitBase{prefix: prefix, render: render}
	for _, other := range m.kits {
		if other.prefix == rouxBase || prefix == rouxBase {
			continue // a base inside /api/roux takes over its own paths
		}
		if other.covers(prefix) || b.covers(other.prefix) {
			panic(fmt.Sprintf("api: kit base %q overlaps %q", prefix, other.prefix))
		}
	}
	m.kits = append(m.kits, b)
	return &Kit{m: m, base: b}
}

// Kit registers one kit package's endpoints under its reserved base path.
type Kit struct {
	m    *Mux
	base *kitBase
}

// Handle registers "METHOD /path", with the path relative to the kit's base:
// on a kit at /api/roux/auth, Handle("GET /me", h) serves GET /api/roux/auth/me.
func (k *Kit) Handle(pattern string, h HandlerFunc) {
	method, path := splitPattern(pattern)
	k.m.sm.Handle(method+" "+k.base.prefix+path, handler{fn: h, mux: k.m, render: k.base.render})
}

// kitFor returns the kit base that owns path, if any: the most specific one.
func (m *Mux) kitFor(path string) *kitBase {
	var owner *kitBase
	for _, b := range m.kits {
		if b.covers(path) && (owner == nil || len(b.prefix) > len(owner.prefix)) {
			owner = b
		}
	}
	return owner
}

// Fallback sets the handler for every request outside /api/ and outside the
// kit packages' base paths (see Kit) that no route matched: the front end (see
// kit/spa). Those reserved paths never reach it; an unknown one is always a
// JSON 404 problem, never a web page. May be set once, before serving.
func (m *Mux) Fallback(h http.Handler) {
	if m.fallback != nil {
		panic("api: Fallback already set")
	}
	m.fallback = h
}

func isAPIPath(path string) bool {
	return path == strings.TrimSuffix(Prefix, "/") || strings.HasPrefix(path, Prefix)
}

// MapError presents errors matching target (via errors.Is) as the problem
// returned by toProb. Use it for sentinel errors. Register before serving.
func (m *Mux) MapError(target error, toProb func(err error) *problem.Problem) {
	m.mappings = append(m.mappings, func(err error) *problem.Problem {
		if errors.Is(err, target) {
			return toProb(err)
		}
		return nil
	})
}

// MapType presents errors of type T (found via errors.As anywhere in the
// chain) as the problem returned by fn. Use it for typed errors you don't own,
// e.g. library errors. Return nil from fn to decline and fall through to
// earlier mappings. (A function, not a method: Go methods can't be generic.)
func MapType[T error](m *Mux, fn func(T) *problem.Problem) {
	m.mappings = append(m.mappings, func(err error) *problem.Problem {
		var target T
		if errors.As(err, &target) {
			return fn(target)
		}
		return nil
	})
}

func (m *Mux) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if isAPIPath(r.URL.Path) {
		// An API answer is data, never a page to guess at (a new API key is one of them), and is
		// not kept by the browser or a proxy unless its handler says it may be.
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
	}
	h, pattern := m.sm.Handler(r)
	if pattern != "" {
		m.sm.ServeHTTP(w, r) // sets path values before dispatching
		return
	}
	kit := m.kitFor(r.URL.Path)
	if m.fallback != nil && !isAPIPath(r.URL.Path) && kit == nil {
		m.fallback.ServeHTTP(w, r)
		return
	}
	render := ErrorRenderer(problem.Write)
	if kit != nil {
		render = kit.render
	}
	// No route matched: let the stdlib decide between 404 and 405, then
	// re-render its answer as a problem.
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if allow := rec.Header().Get("Allow"); allow != "" {
		w.Header().Set("Allow", allow)
	}
	switch rec.Code {
	case http.StatusMethodNotAllowed:
		render(w, r, problem.MethodNotAllowed("Method "+r.Method+" is not allowed for this resource."))
	default:
		render(w, r, problem.NotFound("No resource exists at this path."))
	}
}
