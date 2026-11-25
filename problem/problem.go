// Package problem implements RFC 9457 "Problem Details for HTTP APIs".
package problem

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"

	"go.opentelemetry.io/otel/trace"
)

// ContentType is the media type for problem details responses.
const ContentType = "application/problem+json"

// Violation describes a single invalid field in a request.
type Violation struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// Problem is an RFC 9457 problem details object. It also implements error,
// so handlers can simply return one.
type Problem struct {
	Type     string      `json:"type,omitempty"`
	Title    string      `json:"title,omitempty"`
	Status   int         `json:"status,omitempty"`
	Detail   string      `json:"detail,omitempty"`
	Instance string      `json:"instance,omitempty"`
	Errors   []Violation `json:"errors,omitempty"`  // extension member
	TraceID  string      `json:"traceId,omitempty"` // extension member: correlates with logs/traces
	Code     string      `json:"code,omitempty"`    // extension member: a stable machine-readable error code
	ErrorID  string      `json:"errorId,omitempty"` // extension member on a 500: matches the response to the log entry

	// Headers are sent with the response (WWW-Authenticate on a 401, say); never in the body.
	Headers http.Header `json:"-"`
}

// WithHeader adds a response header to the problem and returns it.
func (p *Problem) WithHeader(key, value string) *Problem {
	if p.Headers == nil {
		p.Headers = http.Header{}
	}
	p.Headers.Add(key, value)
	return p
}

// WriteHeaders sends the problem's own headers; a renderer that writes its own body calls it.
func (p *Problem) WriteHeaders(w http.ResponseWriter) {
	for k, vs := range p.Headers {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
}

func (p *Problem) Error() string {
	if p.Detail != "" {
		return p.Title + ": " + p.Detail
	}
	return p.Title
}

// New creates a problem for the given status with a standard title.
func New(status int, detail string) *Problem {
	return &Problem{
		Type:   "about:blank",
		Title:  http.StatusText(status),
		Status: status,
		Detail: detail,
	}
}

func BadRequest(detail string) *Problem       { return New(http.StatusBadRequest, detail) }
func NotFound(detail string) *Problem         { return New(http.StatusNotFound, detail) }
func MethodNotAllowed(detail string) *Problem { return New(http.StatusMethodNotAllowed, detail) }
func Internal() *Problem                      { return New(http.StatusInternalServerError, "") }

// The words roux's forms show for the common constraints, so every endpoint
// speaks to the person filling in a form the same way.
const (
	MustNotBeBlank = "Must not be blank"
	MustNotBeEmpty = "Must not be empty"
	InvalidValue   = "Invalid value"
	ValidEmail     = "Must be a valid email address"
	BadFormat      = "Is not in the expected format"
)

// MustBeBetween is the message for a length out of range: "Must be between 1 and 80 characters".
func MustBeBetween(min, max int) string {
	return fmt.Sprintf("Must be between %d and %d characters", min, max)
}

// MustBeOneOf is the message for a value outside a fixed set: "Must be one of A, B".
func MustBeOneOf(values ...string) string { return "Must be one of " + strings.Join(values, ", ") }

func Conflict(detail string) *Problem { return New(http.StatusConflict, detail) }

// StaleVersion is the 409 for an edit made from a version that is no longer current.
func StaleVersion() *Problem { return Conflict("This record changed since you loaded it") }
func Unauthorized() *Problem { return New(http.StatusUnauthorized, "Sign in to continue") }
func Forbidden() *Problem    { return New(http.StatusForbidden, "You do not have permission") }

// Validation returns the 400 roux answers for invalid input: the fields that are
// wrong, sorted by field and then message so a response is stable.
func Validation(violations ...Violation) *Problem {
	p := New(http.StatusBadRequest, "The request has invalid fields")
	p.Errors = append([]Violation(nil), violations...)
	sort.SliceStable(p.Errors, func(i, j int) bool {
		if p.Errors[i].Field != p.Errors[j].Field {
			return p.Errors[i].Field < p.Errors[j].Field
		}
		return p.Errors[i].Message < p.Errors[j].Message
	})
	return p
}

// InvalidField is a Validation with one field's problem.
func InvalidField(field, message string) *Problem {
	return Validation(Violation{Field: field, Message: message})
}

// Write sends p as a problem+json response. The instance defaults to the
// request path, and traceId is filled from the active span (if any).
func Write(w http.ResponseWriter, r *http.Request, p *Problem) {
	if p.Instance == "" {
		p.Instance = r.URL.Path
	}
	if sc := trace.SpanContextFromContext(r.Context()); p.TraceID == "" && sc.IsValid() {
		p.TraceID = sc.TraceID().String()
	}
	p.WriteHeaders(w)
	w.Header().Set("Content-Type", ContentType)
	w.WriteHeader(p.Status)
	_ = json.NewEncoder(w).Encode(p)
}
