package authn

import (
	"encoding/json"
	"net/http"

	"go.opentelemetry.io/otel/trace"

	"github.com/jwcarman/roux/problem"
)

const (
	errorTypePrefix = "urn:who:error:"
	errorHeader     = "Who-Error"
)

// whoProblem is who's error body: exactly these members, with detail null for
// a 5xx (whose message may carry what a client must not see). traceId is an
// extra member, which who's clients ignore, that ties the error to its trace.
type whoProblem struct {
	Type    string  `json:"type"`
	Title   string  `json:"title"`
	Status  int     `json:"status"`
	Detail  *string `json:"detail"`
	Code    string  `json:"code"`
	TraceID string  `json:"traceId,omitempty"`
}

// codeFor names a failure: its own code if it has one, else one from its status,
// as who does for anything that has no exception of its own.
func codeFor(p *problem.Problem) string {
	if p.Code != "" {
		return p.Code
	}
	switch s := p.Status; {
	case s == http.StatusBadRequest:
		return "invalid-request"
	case s == http.StatusUnauthorized:
		return "unauthorized"
	case s == http.StatusForbidden:
		return "forbidden"
	case s == http.StatusNotFound:
		return "not-found"
	case s == http.StatusMethodNotAllowed:
		return "method-not-allowed"
	case s == http.StatusNotAcceptable:
		return "not-acceptable"
	case s == http.StatusUnsupportedMediaType:
		return "unsupported-media-type"
	case s >= 500:
		return "server-error"
	default:
		return "error"
	}
}

// render answers every failure under who's base path as who does: RFC 9457
// problem details with type urn:who:error:<code>, and the code again in a
// Who-Error header so a client can tell failures apart without parsing a body.
func render(w http.ResponseWriter, r *http.Request, p *problem.Problem) {
	code := codeFor(p)
	title := p.Title
	if title == "" {
		title = http.StatusText(p.Status)
	}
	body := whoProblem{Type: errorTypePrefix + code, Title: title, Status: p.Status, Code: code}
	if p.Status < 500 && p.Detail != "" {
		detail := p.Detail
		body.Detail = &detail
	}
	if sc := trace.SpanContextFromContext(r.Context()); sc.IsValid() {
		body.TraceID = sc.TraceID().String()
	}
	p.WriteHeaders(w)
	w.Header().Set("Content-Type", problem.ContentType)
	w.Header().Set(errorHeader, code)
	w.WriteHeader(p.Status)
	_ = json.NewEncoder(w).Encode(body)
}

// NewError is a problem with who's stable error code, for a sign-in method or an
// account endpoint to return: under who's base path it is rendered as
// urn:who:error:<code> with a Who-Error header.
func NewError(status int, code, detail string) *problem.Problem {
	p := problem.New(status, detail)
	p.Code = code
	return p
}

func withCode(status int, code, detail string) *problem.Problem {
	return NewError(status, code, detail)
}

// LastCredential is the 409 for a removal that would leave an identity with no way to
// sign in.
func LastCredential() *problem.Problem {
	return NewError(http.StatusConflict, "last-credential", "the identity's last sign-in credential cannot be removed")
}

// BrowserSessionRequired is the 403 for an endpoint only a browser session on its own may
// call, reached by something else: an API key, or a key beside the session cookie.
func BrowserSessionRequired() *problem.Problem {
	return NewError(http.StatusForbidden, "browser-session-required", "This needs a browser session on its own")
}

func notSignedIn() *problem.Problem {
	return withCode(http.StatusUnauthorized, "not-signed-in", "Not signed in")
}

func invalidCSRF() *problem.Problem {
	return withCode(http.StatusForbidden, "invalid-csrf-token", "Invalid CSRF token")
}

// SignInFailed is the one answer to every failed sign-in: an unknown, used or
// expired token, a wrong, burnt or expired code, an inactive identity, a
// malformed body. Its message never varies, so the reason never reaches a
// response; the caller logs the reason itself.
func SignInFailed() *problem.Problem {
	return withCode(http.StatusUnauthorized, "sign-in-failed", "Sign-in failed")
}
