package page

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Term is one expression a sort orders by.
type Term struct {
	expr       sqlText
	nullsFirst bool
}

// By is a sort term: a column or an expression of the list's view, such as lower(title). Write it as a string literal: a variable or an fmt.Sprintf result does not compile
// ("cannot use ... as page.sqlText value"), so a value never becomes SQL.
func By(expr sqlText) Term { return Term{expr: expr} }

// NullsFirst puts rows without a value first when ascending, and so last when descending.
func (t Term) NullsFirst() Term { t.nullsFirst = true; return t }

// Querier runs queries: a *pgxpool.Pool, a pgx.Tx or a *pgx.Conn.
type Querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// ListConfig declares a list. S is its sort type (a string type whose constants are the sortBy
// values clients send, like a Java sort enum) and T its row.
type ListConfig[S ~string, T any] struct {
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

// Paginator lists a table or view a page at a time, the way jpa-utils' Paginator does in Java:
// declared once per list (its view, columns, sorts and search fields), checked when it is built
// and against the database when the app starts, then asked for a page per request. The app writes
// the SQL that is particular to it (the view, each filter); the paginator writes the rest (the
// count, the search, ORDER BY with a tiebreaker, LIMIT and OFFSET). Build it once (a package
// variable) with New.
type Paginator[S ~string, T any] struct {
	cfg  ListConfig[S, T]
	page Config
}

// New checks cfg and returns its paginator. It panics on a mistake, so a bad declaration stops the
// program when the package loads rather than on a request (as jpa-utils fails when it is built).
func New[S ~string, T any](cfg ListConfig[S, T]) *Paginator[S, T] {
	if err := cfg.problem(); err != "" {
		panic("page.New: " + err)
	}
	names := make([]string, 0, len(cfg.Sorts))
	for s := range cfg.Sorts {
		names = append(names, string(s))
	}
	slices.Sort(names)
	return &Paginator[S, T]{cfg: cfg, page: Config{
		DefaultSize: cfg.DefaultPageSize,
		MaxSize:     cfg.MaxPageSize,
		SortFields:  names,
		DefaultSort: string(cfg.DefaultSort),
		NoTiebreak:  true, // the paginator adds id itself
	}}
}

func (c ListConfig[S, T]) problem() string {
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
	case c.DefaultPageSize > cmp.Or(c.MaxPageSize, DefaultMaxSize):
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
func (p *Paginator[S, T]) Config() Config { return p.page }

// Page is one page of the rows matching every filter and the search term, sorted by req, with the
// total count of matches.
func (p *Paginator[S, T]) Page(ctx context.Context, db Querier, req Request, search string, filters ...Filter) (Page[T], error) {
	words, err := searchWords(search)
	if err != nil {
		return Page[T]{}, err
	}
	terms, ok := p.cfg.Sorts[S(req.SortBy)]
	if !ok {
		return Page[T]{}, fmt.Errorf("page: %q is not a sort of %s", req.SortBy, p.cfg.From)
	}
	var q query
	for _, f := range filters {
		q.add(f)
	}
	p.searchFor(&q, words)

	var total int64
	if err := db.QueryRow(ctx, "select count(*) from "+string(p.cfg.From)+" where "+q.where(), q.args...).Scan(&total); err != nil {
		return Page[T]{}, err
	}
	rows, err := db.Query(ctx, p.selectSQL(&q, terms, req.Direction, req.Size, req.Offset()), q.args...)
	if err != nil {
		return Page[T]{}, err
	}
	data, err := pgx.CollectRows(rows, p.cfg.Scan)
	if err != nil {
		return Page[T]{}, err
	}
	return Of(data, req, total), nil
}

// selectSQL is the page query; it appends LIMIT's and OFFSET's arguments to q.
func (p *Paginator[S, T]) selectSQL(q *query, terms []Term, dir Direction, limit, offset int) string {
	where := q.where()
	return "select " + string(p.cfg.Columns) + " from " + string(p.cfg.From) +
		" where " + where + " order by " + orderBy(terms, dir) +
		" limit " + q.arg(limit) + " offset " + q.arg(offset)
}

// orderBy writes the direction itself, never the request's text.
func orderBy(terms []Term, dir Direction) string {
	d, nulls := "ASC", "NULLS FIRST"
	if dir == Desc {
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
// and with a search: a misspelled column fails here, when the app starts, not on a request. It
// also hands Scan a row of Columns' shape, holding no values, and fails if Scan reads a different
// number of values than Columns lists. It cannot tell two columns of one type read in the wrong
// order; the list's own test can.
func (p *Paginator[S, T]) Check(ctx context.Context, db Querier) error {
	if err := p.checkScan(ctx, db); err != nil {
		return err
	}
	for _, name := range p.page.SortFields {
		for _, dir := range []Direction{Asc, Desc} {
			q := query{conds: []string{"false"}}
			p.searchFor(&q, []string{"check"})
			rows, err := db.Query(ctx, p.selectSQL(&q, p.cfg.Sorts[S(name)], dir, 1, 0), q.args...)
			if err != nil {
				return fmt.Errorf("page: %s sorted by %s %s: %w", p.cfg.From, name, dir, err)
			}
			rows.Close()
			if err := rows.Err(); err != nil {
				return fmt.Errorf("page: %s sorted by %s %s: %w", p.cfg.From, name, dir, err)
			}
		}
	}
	return nil
}

// checkScan runs Scan over a row of Columns' shape. Only a count mismatch fails: Scan's other
// errors come from the empty values, not from a mistake.
func (p *Paginator[S, T]) checkScan(ctx context.Context, db Querier) error {
	rows, err := db.Query(ctx, "select "+string(p.cfg.Columns)+" from "+string(p.cfg.From)+" where false")
	if err != nil {
		return fmt.Errorf("page: %s: %w", p.cfg.From, err)
	}
	fields := rows.FieldDescriptions()
	rows.Close()
	if err := rows.Err(); err != nil {
		return fmt.Errorf("page: %s: %w", p.cfg.From, err)
	}
	_, err = p.cfg.Scan(shapeRow{fields: fields})
	var mismatch *scanCountError
	if errors.As(err, &mismatch) {
		return fmt.Errorf("page: %s's Columns lists %d (%s) but Scan reads %d: read every column, in order",
			p.cfg.From, len(fields), p.cfg.Columns, mismatch.read)
	}
	return nil
}

// shapeRow is a row with Columns' fields and no values, for checkScan.
type shapeRow struct{ fields []pgconn.FieldDescription }

type scanCountError struct{ read int }

func (e *scanCountError) Error() string { return fmt.Sprintf("scan of %d values", e.read) }

func (r shapeRow) FieldDescriptions() []pgconn.FieldDescription { return r.fields }

func (r shapeRow) Scan(dest ...any) error {
	if len(dest) != len(r.fields) {
		return &scanCountError{read: len(dest)}
	}
	return nil
}

func (r shapeRow) Values() ([]any, error) { return make([]any, len(r.fields)), nil }

func (r shapeRow) RawValues() [][]byte { return make([][]byte, len(r.fields)) }
