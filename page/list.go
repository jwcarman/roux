package page

import (
	"cmp"
	"context"
	"fmt"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"unicode"

	"github.com/jackc/pgx/v5"
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

// ListConfig declares a list. S is its sort type, a string type whose constants are the sortBy
// values clients send. T is its row: a struct whose db tags name the columns read, which pgx fills
// by name (`db:"title"`; `db:"-"` leaves a field out).
type ListConfig[S ~string, T any] struct {
	// From is the table or view, ideally a view shaped for the list: each column in the form the
	// row answers it. It must have an id column, the tiebreaker that keeps rows from moving
	// between pages.
	From sqlText
	// Sorts maps each sortBy value to what it orders by; the request's direction applies to every
	// term, then to id.
	Sorts       map[S][]Term
	DefaultSort S
	// DefaultPageSize and MaxPageSize are page's defaults (20 and 100) when zero.
	DefaultPageSize, MaxPageSize int
	// Search is the fields a search term is matched against; none means search is ignored.
	Search []Field
}

// Paginator lists a table or view a page at a time: declared once per list (its view, row, sorts
// and search fields), then asked for a page per request. The app writes the SQL that is
// particular to it (the view, each filter); the paginator writes the rest (the select list from
// the row's tags, the count, the search, ORDER BY with a tiebreaker, LIMIT and OFFSET). Build it
// once, as a package variable, with New; its test runs Check.
type Paginator[S ~string, T any] struct {
	cfg     ListConfig[S, T]
	columns string
	page    Config
}

// New checks cfg and returns its paginator. It panics on a mistake, so a bad declaration stops the
// program when the package loads, like regexp.MustCompile.
func New[S ~string, T any](cfg ListConfig[S, T]) *Paginator[S, T] {
	if err := cfg.problem(); err != "" {
		panic("page.New: " + err)
	}
	columns, err := columnsOf(reflect.TypeFor[T]())
	if err != "" {
		panic("page.New: " + err)
	}
	names := make([]string, 0, len(cfg.Sorts))
	for s := range cfg.Sorts {
		names = append(names, string(s))
	}
	slices.Sort(names)
	return &Paginator[S, T]{cfg: cfg, columns: strings.Join(columns, ", "), page: Config{
		DefaultSize: cfg.DefaultPageSize,
		MaxSize:     cfg.MaxPageSize,
		SortFields:  names,
		DefaultSort: string(cfg.DefaultSort),
		NoTiebreak:  true, // the paginator adds id itself
	}}
}

func (c ListConfig[S, T]) problem() string {
	switch {
	case c.From == "":
		return "From is required"
	case len(c.Sorts) == 0:
		return "at least one sort is required"
	case c.DefaultSort == "":
		return "DefaultSort is required"
	case c.Sorts[c.DefaultSort] == nil:
		return fmt.Sprintf("DefaultSort %q is not one of the sorts", c.DefaultSort)
	case c.DefaultPageSize > cmp.Or(c.MaxPageSize, DefaultMaxSize):
		return "DefaultPageSize is above MaxPageSize"
	}
	texts := []sqlText{c.From}
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
	data, err := pgx.CollectRows(rows, pgx.RowToStructByName[T])
	if err != nil {
		return Page[T]{}, err
	}
	return Of(data, req, total), nil
}

// selectSQL is the page query; it appends LIMIT's and OFFSET's arguments to q.
func (p *Paginator[S, T]) selectSQL(q *query, terms []Term, dir Direction, limit, offset int) string {
	where := q.where()
	return "select " + p.columns + " from " + string(p.cfg.From) +
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
// and with a search, so a misspelled view, column, sort or search field fails. Call it from the
// list's test, against the test database.
func (p *Paginator[S, T]) Check(ctx context.Context, db Querier) error {
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

// column is a plain column name: a db tag becomes SQL, so it may be nothing else.
var column = regexp.MustCompile(`^[a-z_][a-z0-9_]*$`)

// columnsOf is the columns a row struct's db tags name, in field order; an embedded struct
// without a tag contributes its own (as pgx reads it). It answers a problem, or "".
func columnsOf(t reflect.Type) ([]string, string) {
	if t.Kind() != reflect.Struct {
		return nil, fmt.Sprintf("the row %s is not a struct: declare one with a db tag per column", t)
	}
	var columns []string
	for f := range t.Fields() {
		tag, tagged := f.Tag.Lookup("db")
		switch {
		case tag == "-":
			continue
		case f.Anonymous && !tagged && f.Type.Kind() == reflect.Struct:
			inner, problem := columnsOf(f.Type)
			if problem != "" {
				return nil, problem
			}
			columns = append(columns, inner...)
		case !f.IsExported():
			continue
		case !tagged:
			return nil, fmt.Sprintf("%s.%s has no db tag: name its column, such as `db:\"%s\"`, or leave it out with `db:\"-\"`",
				t.Name(), f.Name, snake(f.Name))
		case !column.MatchString(tag):
			return nil, fmt.Sprintf("%s.%s's db tag %q is not a column name: give the column a name in the view", t.Name(), f.Name, tag)
		default:
			columns = append(columns, tag)
		}
	}
	if len(columns) == 0 {
		return nil, fmt.Sprintf("the row %s has no db tags: tag each field with its column", t)
	}
	return columns, ""
}

// snake is a field name as a column name: DisplayName is display_name, UserID is user_id.
func snake(name string) string {
	r := []rune(name)
	var b strings.Builder
	for i, c := range r {
		lowerBefore := i > 0 && unicode.IsLower(r[i-1])
		lowerAfter := i > 0 && i+1 < len(r) && unicode.IsUpper(r[i-1]) && unicode.IsLower(r[i+1])
		if unicode.IsUpper(c) && (lowerBefore || lowerAfter) {
			b.WriteByte('_')
		}
		b.WriteRune(unicode.ToLower(c))
	}
	return b.String()
}
