package page_test

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jwcarman/roux/page"
	"github.com/jwcarman/roux/pgtest"
	"github.com/jwcarman/roux/problem"
)

type thingSort string

const (
	byName thingSort = "NAME"
	byDay  thingSort = "DAY"
)

type thing struct {
	Name string `db:"name"`
}

func things() page.ListConfig[thingSort, thing] {
	return page.ListConfig[thingSort, thing]{
		From: "thing",
		Sorts: map[thingSort][]page.Term{
			byName: {page.By("lower(name)")},
			byDay:  {page.By("day"), page.By("at_time").NullsFirst()},
		},
		DefaultSort: byName,
		Search:      []page.Field{page.Contains("name"), page.Prefix("code"), page.Exact("kind")},
	}
}

// listOf is things() for another row type.
func listOf[T any]() page.ListConfig[thingSort, T] {
	c := things()
	return page.ListConfig[thingSort, T]{From: c.From, Sorts: c.Sorts, DefaultSort: c.DefaultSort, Search: c.Search}
}

// The rows: ids fix the tiebreak (Ada Smith before ada smith by id).
const fixture = `
create table thing (id int primary key, name text not null, code text not null, kind text not null, day date not null, at_time time);
insert into thing values
  (1, 'Ada Smith',   'ab-1',  'red',  '2026-11-24', '10:00'),
  (2, 'ada smith',   'ab-2',  'blue', '2026-11-24', null),
  (3, 'Grace Hopper','gh-1',  'red',  '2026-11-25', '09:00'),
  (4, '100% cotton', 'x_y',   'blue', '2026-11-23', null),
  (5, 'back\slash',  'zz',    'blue', '2026-11-26', '08:00');`

func setup(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool := pgtest.Pool(t, "paging")
	if _, err := pool.Exec(context.Background(), fixture); err != nil {
		t.Fatal(err)
	}
	return pool
}

func request[T any](t *testing.T, p *page.Paginator[thingSort, T], sortBy string, dir page.Direction) page.Request {
	t.Helper()
	req, err := p.Config().Resolve(nil, nil, sortBy, dir)
	if err != nil {
		t.Fatal(err)
	}
	return req
}

// names reads a page's names: names(t)(p.Page(...)), since Go spreads a call's two results
// only into a function that takes exactly those two.
func names(t *testing.T) func(page.Page[thing], error) []string {
	return func(pg page.Page[thing], err error) []string {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var out []string
		for _, th := range pg.Data {
			out = append(out, th.Name)
		}
		return out
	}
}

func TestPageSortsByTheRequestedSortThenID(t *testing.T) {
	pool := setup(t)
	p := page.New(things())
	ctx := context.Background()
	asc := names(t)(p.Page(ctx, pool, request(t, p, "NAME", page.Asc), ""))
	if want := []string{"100% cotton", "Ada Smith", "ada smith", `back\slash`, "Grace Hopper"}; !slices.Equal(asc, want) {
		t.Errorf("asc %v", asc)
	}
	desc := names(t)(p.Page(ctx, pool, request(t, p, "NAME", page.Desc), ""))
	if want := []string{"Grace Hopper", `back\slash`, "ada smith", "Ada Smith", "100% cotton"}; !slices.Equal(desc, want) {
		t.Errorf("desc %v", desc)
	}
}

func TestNullsFirstFlipsWithTheDirection(t *testing.T) {
	pool := setup(t)
	p := page.New(things())
	ctx := context.Background()
	asc := names(t)(p.Page(ctx, pool, request(t, p, "DAY", page.Asc), ""))
	if want := []string{"100% cotton", "ada smith", "Ada Smith", "Grace Hopper", `back\slash`}; !slices.Equal(asc, want) {
		t.Errorf("asc %v", asc)
	}
	desc := names(t)(p.Page(ctx, pool, request(t, p, "DAY", page.Desc), ""))
	if want := []string{`back\slash`, "Grace Hopper", "Ada Smith", "ada smith", "100% cotton"}; !slices.Equal(desc, want) {
		t.Errorf("desc %v", desc)
	}
}

func search(t *testing.T, term string) []string {
	t.Helper()
	pool := setup(t)
	p := page.New(things())
	return names(t)(p.Page(context.Background(), pool, request(t, p, "", ""), term))
}

func TestSearchNeedsEveryWordInSomeField(t *testing.T) {
	if got := search(t, "smith red"); !slices.Equal(got, []string{"Ada Smith"}) {
		t.Errorf("smith red: %v", got)
	}
	if got := search(t, "grace blue"); len(got) != 0 {
		t.Errorf("grace blue: %v", got)
	}
}

func TestSearchModes(t *testing.T) {
	for term, want := range map[string][]string{
		"mit":  {"Ada Smith", "ada smith"},                 // contains, in name
		"ab":   {"Ada Smith", "ada smith"},                 // prefix, in code
		"b-1":  nil,                                        // not a prefix of a code, nor in a name
		"blue": {"100% cotton", "ada smith", `back\slash`}, // exact, in kind
		"blu":  nil,                                        // not exactly a kind
	} {
		if got := search(t, term); !slices.Equal(got, want) {
			t.Errorf("%q: %v", term, got)
		}
	}
}

func TestSearchMatchesPercentUnderscoreAndBackslashLiterally(t *testing.T) {
	for term, want := range map[string][]string{
		"%":  {"100% cotton"},
		"x_": {"100% cotton"}, // the prefix of code x_y
		"_":  nil,             // a wildcard would match every row
		`\`:  {`back\slash`},
	} {
		if got := search(t, term); !slices.Equal(got, want) {
			t.Errorf("%q: %v", term, got)
		}
	}
}

func TestSearchIgnoresCaseDuplicatesAndAnEleventhWord(t *testing.T) {
	if got := search(t, "SMITH smith Smith"); !slices.Equal(got, []string{"Ada Smith", "ada smith"}) {
		t.Errorf("case and duplicates: %v", got)
	}
	// Ten distinct words, each in "ada smith"; an eleventh that matches nothing is dropped.
	ten := "a d s m i t h ad sm mi "
	if got := search(t, ten+"nobody"); !slices.Equal(got, []string{"Ada Smith", "ada smith"}) {
		t.Errorf("an eleventh word counted: %v", got)
	}
}

func TestSearchRefusesATermOver200Characters(t *testing.T) {
	pool := setup(t)
	p := page.New(things())
	_, err := p.Page(context.Background(), pool, request(t, p, "", ""), strings.Repeat("x", page.MaxSearchLength+1))
	var prob *problem.Problem
	if !errors.As(err, &prob) || prob.Status != http.StatusBadRequest {
		t.Fatalf("got %v", err)
	}
	if _, err := p.Page(context.Background(), pool, request(t, p, "", ""), strings.Repeat("x", page.MaxSearchLength)); err != nil {
		t.Fatalf("200 characters: %v", err)
	}
}

func TestPageCountsAllMatchesAndReturnsOnePage(t *testing.T) {
	pool := setup(t)
	p := page.New(things())
	two, index := 2, 1
	req, err := p.Config().Resolve(&index, &two, "NAME", page.Asc)
	if err != nil {
		t.Fatal(err)
	}
	pg, err := p.Page(context.Background(), pool, req, "", page.Where("kind = ?", "blue"))
	if got := names(t)(pg, err); !slices.Equal(got, []string{`back\slash`}) {
		t.Errorf("page 2 of blue: %v", got)
	}
	if pg.Pagination.TotalElementCount != 3 || pg.Pagination.TotalPageCount != 2 || pg.Pagination.HasNext || !pg.Pagination.HasPrevious {
		t.Errorf("pagination %+v", pg.Pagination)
	}
}

func TestPageRefusesASortFromAnotherList(t *testing.T) {
	pool := setup(t)
	p := page.New(things())
	req, err := page.Config{SortFields: []string{"PRICE"}}.Resolve(nil, nil, "PRICE", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := p.Page(context.Background(), pool, req, ""); err == nil {
		t.Fatal("PRICE was sorted by")
	}
}

func TestNewPanicsOnABadConfig(t *testing.T) {
	for name, change := range map[string]func(*page.ListConfig[thingSort, thing]){
		"no sorts":               func(c *page.ListConfig[thingSort, thing]) { c.Sorts = nil },
		"default not a sort":     func(c *page.ListConfig[thingSort, thing]) { c.DefaultSort = "PRICE" },
		"no default":             func(c *page.ListConfig[thingSort, thing]) { c.DefaultSort = "" },
		"a sort with no terms":   func(c *page.ListConfig[thingSort, thing]) { c.Sorts[byDay] = nil },
		"default size above max": func(c *page.ListConfig[thingSort, thing]) { c.DefaultPageSize, c.MaxPageSize = 50, 10 },
		"no from":                func(c *page.ListConfig[thingSort, thing]) { c.From = "" },
		"a quote in a term":      func(c *page.ListConfig[thingSort, thing]) { c.Sorts[byName] = []page.Term{page.By("name || 'x'")} },
		"a semicolon in from":    func(c *page.ListConfig[thingSort, thing]) { c.From = "thing; drop table thing" },
		"a quote in a field":     func(c *page.ListConfig[thingSort, thing]) { c.Search = []page.Field{page.Contains("'x'")} },
	} {
		t.Run(name, func(t *testing.T) {
			cfg := things()
			change(&cfg)
			defer mustPanic(t)
			page.New(cfg)
		})
	}
}

func TestConfigListsSortsInOrder(t *testing.T) {
	cfg := page.New(things()).Config()
	if !slices.Equal(cfg.SortFields, []string{"DAY", "NAME"}) || cfg.DefaultSort != "NAME" || !cfg.NoTiebreak {
		t.Errorf("%+v", cfg)
	}
}

type misspelt struct {
	Name string `db:"nmae"`
}

func TestCheckFindsAMisspelledColumn(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	if err := page.New(things()).Check(ctx, pool); err != nil {
		t.Fatalf("the good one: %v", err)
	}
	if err := page.New(listOf[misspelt]()).Check(ctx, pool); err == nil {
		t.Error("a column: no error")
	}
	for name, change := range map[string]func(*page.ListConfig[thingSort, thing]){
		"a sort term":  func(c *page.ListConfig[thingSort, thing]) { c.Sorts[byDay] = []page.Term{page.By("dya")} },
		"a search one": func(c *page.ListConfig[thingSort, thing]) { c.Search = []page.Field{page.Contains("cdoe")} },
	} {
		t.Run(name, func(t *testing.T) {
			cfg := things()
			change(&cfg)
			if err := page.New(cfg).Check(ctx, pool); err == nil {
				t.Error("no error")
			}
		})
	}
}

type named struct {
	Name string `db:"name"`
}

type wider struct {
	named
	Code  string `db:"code"`
	Score int    `db:"-"`
}

func TestTheRowsTagsAreItsColumnsEmbeddedOnesIncluded(t *testing.T) {
	pool := setup(t)
	p := page.New(listOf[wider]())
	got, err := p.Page(context.Background(), pool, request(t, p, "NAME", "ASC"), "grace")
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Data) != 1 || got.Data[0].Name != "Grace Hopper" || got.Data[0].Code != "gh-1" || got.Data[0].Score != 0 {
		t.Errorf("%+v", got.Data)
	}
}

type untagged struct{ DisplayName string }

type idOnly struct{ UserID string }

type expression struct {
	Name string `db:"lower(name)"`
}

type nothingTagged struct {
	Name string `db:"-"`
}

func TestNewNamesTheRowFieldToFix(t *testing.T) {
	for _, c := range []struct {
		new  func()
		want string
	}{
		{func() { page.New(listOf[untagged]()) }, "page.New: untagged.DisplayName has no db tag: name its column, such as `db:\"display_name\"`, or leave it out with `db:\"-\"`"},
		{func() { page.New(listOf[idOnly]()) }, "page.New: idOnly.UserID has no db tag: name its column, such as `db:\"user_id\"`, or leave it out with `db:\"-\"`"},
		{func() { page.New(listOf[expression]()) }, `page.New: expression.Name's db tag "lower(name)" is not a column name: give the column a name in the view`},
		{func() { page.New(listOf[nothingTagged]()) }, "page.New: the row page_test.nothingTagged has no db tags: tag each field with its column"},
		{func() { page.New(listOf[string]()) }, "page.New: the row string is not a struct: declare one with a db tag per column"},
	} {
		if got := panicOf(c.new); got != c.want {
			t.Errorf("got %v\nwant %s", got, c.want)
		}
	}
}

// panicOf is what f panics with, or nil.
func panicOf(f func()) (got any) {
	defer func() { got = recover() }()
	f()
	return nil
}

func TestAListWithoutSearchFieldsIgnoresTheTerm(t *testing.T) {
	pool := setup(t)
	cfg := things()
	cfg.Search = nil
	p := page.New(cfg)
	if got := names(t)(p.Page(context.Background(), pool, request(t, p, "", ""), "nobody")); len(got) != 5 {
		t.Errorf("got %v", got)
	}
}

// mustPanic, deferred, fails the test unless it panicked.
func mustPanic(t *testing.T) {
	t.Helper()
	if recover() == nil {
		t.Error("no panic")
	}
}
