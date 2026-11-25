// Package page is the kit's standardized pagination contract, mirroring
// jpa-utils: offset-based, 0-indexed pages, one allowlisted sort field plus an
// always-appended unique tiebreaker, and an envelope of {data, pagination}.
//
// Paginator lists a Postgres table or view by these rules: declare the list once with New (its
// view, columns, sorts and search fields), Check it when the app starts, and ask it for a Page per
// request with filters written as Where("day < ?", today).
//
// This package is HTTP-agnostic so domain/store code may import it. Parsing a
// Request from an http.Request lives in api (api.PageRequest).
package page

import (
	"fmt"
	"math"
	"strings"
)

const (
	DefaultPageSize = 20
	DefaultMaxSize  = 100
	DefaultTiebreak = "ID"
)

type Direction string

const (
	Asc  Direction = "ASC"
	Desc Direction = "DESC"
)

// Config declares how one paged resource behaves (like jpa-utils' Paginator
// config). The zero value is usable except that no sorting is allowed.
type Config struct {
	DefaultSize int      // default 20
	MaxSize     int      // default 100
	SortFields  []string // allowlist of sortBy values, e.g. "ID", "NAME" (case-sensitive)
	DefaultSort string   // used when sortBy is absent; must be in SortFields
	Tiebreaker  string   // unique field appended to every sort; default "ID"
	NoTiebreak  bool     // disable the tiebreaker
}

// UnknownSortError reports a sortBy value outside the allowlist.
type UnknownSortError struct {
	Value   string
	Allowed []string
}

func (e *UnknownSortError) Error() string {
	return fmt.Sprintf("unknown sortBy %q, expected one of: %s", e.Value, strings.Join(e.Allowed, ", "))
}

// Sort is one ordering term.
type Sort struct {
	Field     string
	Direction Direction
}

// Request is a fully resolved, safe page request: values are clamped and the
// sort field has been checked against the allowlist.
type Request struct {
	Index     int       // 0-based
	Size      int       // 1..MaxSize
	SortBy    string    // allowlisted field, or "" for none
	Direction Direction // ASC or DESC
	tiebreak  string
}

// Resolve applies jpa-utils' rules: a missing/negative index becomes 0; a
// missing size becomes the default and any size is clamped to [1, MaxSize]; a
// blank sortBy falls back to DefaultSort; an unknown sortBy is an error, and so is a direction
// other than ASC, DESC or none (ASC).
func (c Config) Resolve(index, size *int, sortBy string, dir Direction) (Request, error) {
	defSize, maxSize := c.DefaultSize, c.MaxSize
	if defSize <= 0 {
		defSize = DefaultPageSize
	}
	if maxSize <= 0 {
		maxSize = DefaultMaxSize
	}
	req := Request{Direction: dir}
	switch dir {
	case "":
		req.Direction = Asc
	case Asc, Desc:
	default:
		return Request{}, fmt.Errorf("page: unknown sort direction %q (want %s or %s)", dir, Asc, Desc)
	}
	if index != nil {
		req.Index = max(0, *index)
	}
	req.Size = defSize
	if size != nil {
		req.Size = min(max(1, *size), maxSize)
	}
	switch sortBy = strings.TrimSpace(sortBy); {
	case sortBy == "":
		req.SortBy = c.DefaultSort
	case contains(c.SortFields, sortBy):
		req.SortBy = sortBy
	default:
		return Request{}, &UnknownSortError{Value: sortBy, Allowed: c.SortFields}
	}
	if !c.NoTiebreak {
		req.tiebreak = c.Tiebreaker
		if req.tiebreak == "" {
			req.tiebreak = DefaultTiebreak
		}
	}
	return req, nil
}

func contains(s []string, v string) bool {
	for _, e := range s {
		if e == v {
			return true
		}
	}
	return false
}

// MaxOffset is the most rows a page may skip: Postgres's bigint, so no index, however large,
// overflows into a negative offset (which Postgres refuses, failing the request).
const MaxOffset = math.MaxInt64

// Offset is the number of rows to skip, at most MaxOffset: past it there are no rows anyway.
func (r Request) Offset() int {
	if r.Size > 0 && r.Index > MaxOffset/r.Size {
		return MaxOffset
	}
	return r.Index * r.Size
}

// Sorts returns the ordering to apply: the requested field (if any) followed
// by the tiebreaker in the same direction, unless it is already the sort field.
func (r Request) Sorts() []Sort {
	var out []Sort
	if r.SortBy != "" {
		out = append(out, Sort{r.SortBy, r.Direction})
	}
	if r.tiebreak != "" && r.tiebreak != r.SortBy {
		out = append(out, Sort{r.tiebreak, r.Direction})
	}
	return out
}

// Pagination is the metadata half of the response envelope.
type Pagination struct {
	PageIndex         int   `json:"pageIndex"`
	PageSize          int   `json:"pageSize"`
	TotalElementCount int64 `json:"totalElementCount"`
	TotalPageCount    int64 `json:"totalPageCount"`
	HasNext           bool  `json:"hasNext"`
	HasPrevious       bool  `json:"hasPrevious"`
}

// Page is the response envelope.
type Page[T any] struct {
	Data       []T        `json:"data"`
	Pagination Pagination `json:"pagination"`
}

// Of builds a Page from one page of rows (already fetched) and the total count.
func Of[T any](data []T, req Request, total int64) Page[T] {
	if data == nil {
		data = []T{}
	}
	pages := (total + int64(req.Size) - 1) / int64(req.Size)
	return Page[T]{
		Data: data,
		Pagination: Pagination{
			PageIndex:         req.Index,
			PageSize:          req.Size,
			TotalElementCount: total,
			TotalPageCount:    pages,
			HasNext:           int64(req.Index)+1 < pages,
			HasPrevious:       req.Index > 0,
		},
	}
}

// Slice pages an already-sorted in-memory slice (handy for tests and small
// in-memory stores; real stores should use LIMIT/OFFSET plus a COUNT query).
func Slice[T any](sorted []T, req Request) Page[T] {
	from := min(req.Offset(), len(sorted))
	to := min(from+req.Size, len(sorted))
	return Of(sorted[from:to], req, int64(len(sorted)))
}
