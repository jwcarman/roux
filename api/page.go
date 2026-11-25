package api

import (
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/jwcarman/roux/page"
	"github.com/jwcarman/roux/problem"
)

// PageRequest parses the standard pagination query parameters
// (pageIndex, pageSize, sortBy, sortDirection) into a resolved page.Request.
// Out-of-range numbers are clamped (see page.Config.Resolve); malformed values
// and unknown sortBy fields return roux's 400 problem with per-field errors.
func PageRequest(r *http.Request, cfg page.Config) (page.Request, error) {
	q := r.URL.Query()
	var v []problem.Violation

	index := intParam(q, "pageIndex", &v)
	size := intParam(q, "pageSize", &v)

	dir := page.Direction(strings.ToUpper(strings.TrimSpace(q.Get("sortDirection"))))
	if dir != "" && dir != page.Asc && dir != page.Desc {
		v = append(v, problem.Violation{Field: "sortDirection", Message: problem.MustBeOneOf("ASC", "DESC")})
	}
	if len(v) > 0 {
		return page.Request{}, problem.Validation(v...)
	}

	req, err := cfg.Resolve(index, size, q.Get("sortBy"), dir)
	var unknown *page.UnknownSortError
	if errors.As(err, &unknown) {
		return page.Request{}, problem.Validation(problem.Violation{
			Field:   "sortBy",
			Message: problem.MustBeOneOf(unknown.Allowed...),
		})
	}
	return req, err
}

func intParam(q url.Values, name string, v *[]problem.Violation) *int {
	s := strings.TrimSpace(q.Get(name))
	if s == "" {
		return nil
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		*v = append(*v, problem.Violation{Field: name, Message: problem.InvalidValue})
		return nil
	}
	return &n
}

// PageRequestUnsorted is PageRequest for a list whose order is fixed (a history,
// newest first): pageIndex and pageSize are read and clamped, and any sortBy or
// sortDirection is ignored, not refused.
func PageRequestUnsorted(r *http.Request) (page.Request, error) {
	q := r.URL.Query()
	var v []problem.Violation
	index := intParam(q, "pageIndex", &v)
	size := intParam(q, "pageSize", &v)
	if len(v) > 0 {
		return page.Request{}, problem.Validation(v...)
	}
	return page.Config{NoTiebreak: true}.Resolve(index, size, "", "")
}
