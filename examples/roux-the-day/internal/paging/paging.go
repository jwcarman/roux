// Package paging lists a table or view a page at a time, the way jpa-utils' Paginator does in Java:
// declared once per list (its view, columns, sorts and search fields), checked when it is built
// and against the database when the app starts, then asked for a page per request. The app
// writes the SQL that is particular to it (the view, each filter); paging writes the rest (the
// count, the search, ORDER BY with a tiebreaker, LIMIT and OFFSET).
package paging

import (
	"cmp"
	"context"
	"fmt"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/jwcarman/roux/page"
)

// Term is one expression a sort orders by.
type Term struct {
	expr       sqlText
	nullsFirst bool
}

// By is a sort term: a column or an expression of the list's view, such as lower(title).
func By(expr sqlText) Term { return Term{expr: expr} }

// NullsFirst puts rows without a value first when ascending, and so last when descending.
func (t Term) NullsFirst() Term { t.nullsFirst = true; return t }

// Querier runs queries: a *pgxpool.Pool, a pgx.Tx or a *pgx.Conn.
type Querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Config declares a list. S is its sort type (a string type whose constants are the sortBy
// values clients send, like a Java sort enum) and T its row.
type Config[S ~string, T any] struct {
	// From is the table or view, ideally a view shaped for the list; it must have an id column,
	// the tiebreaker that keeps rows from moving between pages.
	From sqlText
	// Columns is the select list, in the order Scan reads them.
	Columns sqlText
	// Sorts maps each sortBy value to what it orders by; the request's direction applies to every
	// term, then to id.
	Sorts       map[S][]Term
	DefaultSort S
	// DefaultPageSize and MaxPageSize are page's defaults (20 and 100) when zero.
	DefaultPageSize, MaxPageSize int
	// Search is the fields a search term is matched against; none means search is ignored.
	Search []Field
	// Scan reads one row of Columns.
	Scan func(pgx.CollectableRow) (T, error)
}

// Paginator pages one list. Build it once (a package variable) with New.
type Paginator[S ~string, T any] struct {
	cfg  Config[S, T]
	page page.Config
}

// New checks cfg and returns its paginator. It panics on a mistake, so a bad declaration stops the
// program when the package loads rather than on a request (as jpa-utils fails when it is built).
func New[S ~string, T any](cfg Config[S, T]) *Paginator[S, T] {
	if err := cfg.problem(); err != "" {
		panic("paging.New: " + err)
	}
	names := make([]string, 0, len(cfg.Sorts))
	for s := range cfg.Sorts {
		names = append(names, string(s))
	}
	slices.Sort(names)
	return &Paginator[S, T]{cfg: cfg, page: page.Config{
		DefaultSize: cfg.DefaultPageSize,
		MaxSize:     cfg.MaxPageSize,
		SortFields:  names,
		DefaultSort: string(cfg.DefaultSort),
		NoTiebreak:  true, // the paginator adds id itself
	}}
}

func (c Config[S, T]) problem() string {
	switch {
	case c.From == "", c.Columns == "":
		return "From and Columns are required"
	case c.Scan == nil:
		return "Scan is required"
	case len(c.Sorts) == 0:
		return "at least one sort is required"
	case c.DefaultSort == "":
		return "DefaultSort is required"
	case c.Sorts[c.DefaultSort] == nil:
		return fmt.Sprintf("DefaultSort %q is not one of the sorts", c.DefaultSort)
	case c.DefaultPageSize > cmp.Or(c.MaxPageSize, page.DefaultMaxSize):
		return "DefaultPageSize is above MaxPageSize"
	}
	texts := []sqlText{c.From, c.Columns}
	for s, terms := range c.Sorts {
		if len(terms) == 0 {
			return fmt.Sprintf("sort %q has no terms", s)
		}
		for _, t := range terms {
			texts = append(texts, t.expr)
		}
	}
	for _, f := range c.Search {
		texts = append(texts, f.col)
	}
	for _, s := range texts {
		for _, bad := range forbidden {
			if strings.Contains(string(s), bad) {
				return fmt.Sprintf("%q may not contain %s", s, bad)
			}
		}
	}
	return ""
}

// Config is the list's paging rules, for api.PageRequest(r, p.Config()).
func (p *Paginator[S, T]) Config() page.Config { return p.page }

// Page is one page of the rows matching every filter and the search term, sorted by req, with the
// total count of matches.
func (p *Paginator[S, T]) Page(ctx context.Context, db Querier, req page.Request, search string, filters ...Filter) (page.Page[T], error) {
	words, err := searchWords(search)
	if err != nil {
		return page.Page[T]{}, err
	}
	terms, ok := p.cfg.Sorts[S(req.SortBy)]
	if !ok {
		return page.Page[T]{}, fmt.Errorf("paging: %q is not a sort of %s", req.SortBy, p.cfg.From)
	}
	var q query
	for _, f := range filters {
		q.add(f)
	}
	p.searchFor(&q, words)

	var total int64
	if err := db.QueryRow(ctx, "select count(*) from "+string(p.cfg.From)+" where "+q.where(), q.args...).Scan(&total); err != nil {
		return page.Page[T]{}, err
	}
	rows, err := db.Query(ctx, p.selectSQL(&q, terms, req.Direction, req.Size, req.Offset()), q.args...)
	if err != nil {
		return page.Page[T]{}, err
	}
	data, err := pgx.CollectRows(rows, p.cfg.Scan)
	if err != nil {
		return page.Page[T]{}, err
	}
	return page.Of(data, req, total), nil
}

// selectSQL is the page query; it appends LIMIT's and OFFSET's arguments to q.
func (p *Paginator[S, T]) selectSQL(q *query, terms []Term, dir page.Direction, limit, offset int) string {
	where := q.where()
	return "select " + string(p.cfg.Columns) + " from " + string(p.cfg.From) +
		" where " + where + " order by " + orderBy(terms, dir) +
		" limit " + q.arg(limit) + " offset " + q.arg(offset)
}

// orderBy writes the direction itself, never the request's text.
func orderBy(terms []Term, dir page.Direction) string {
	d, nulls := "ASC", "NULLS FIRST"
	if dir == page.Desc {
		d, nulls = "DESC", "NULLS LAST"
	}
	parts := make([]string, 0, len(terms)+1)
	for _, t := range terms {
		s := string(t.expr) + " " + d
		if t.nullsFirst {
			s += " " + nulls
		}
		parts = append(parts, s)
	}
	return strings.Join(append(parts, "id "+d), ", ")
}

// Check runs the list's queries against db, matching nothing, for every sort in both directions
// and with a search: a misspelled column fails here, when the app starts, not on a request.
func (p *Paginator[S, T]) Check(ctx context.Context, db Querier) error {
	for _, name := range p.page.SortFields {
		for _, dir := range []page.Direction{page.Asc, page.Desc} {
			q := query{conds: []string{"false"}}
			p.searchFor(&q, []string{"check"})
			rows, err := db.Query(ctx, p.selectSQL(&q, p.cfg.Sorts[S(name)], dir, 1, 0), q.args...)
			if err != nil {
				return fmt.Errorf("paging: %s sorted by %s %s: %w", p.cfg.From, name, dir, err)
			}
			rows.Close()
			if err := rows.Err(); err != nil {
				return fmt.Errorf("paging: %s sorted by %s %s: %w", p.cfg.From, name, dir, err)
			}
		}
	}
	return nil
}
