package paging

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
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

type thing struct{ Name string }

func scanThing(row pgx.CollectableRow) (thing, error) {
	var t thing
	return t, row.Scan(&t.Name)
}

func things() Config[thingSort, thing] {
	return Config[thingSort, thing]{
		From:    "thing",
		Columns: "name",
		Sorts: map[thingSort][]Term{
			byName: {By("lower(name)")},
			byDay:  {By("day"), By("at_time").NullsFirst()},
		},
		DefaultSort: byName,
		Search:      []Field{Contains("name"), Prefix("code"), Exact("kind")},
		Scan:        scanThing,
	}
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

func request(t *testing.T, p *Paginator[thingSort, thing], sortBy string, dir page.Direction) page.Request {
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
	p := New(things())
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
	p := New(things())
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
	p := New(things())
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
	p := New(things())
	_, err := p.Page(context.Background(), pool, request(t, p, "", ""), strings.Repeat("x", MaxSearchLength+1))
	var prob *problem.Problem
	if !errors.As(err, &prob) || prob.Status != http.StatusBadRequest {
		t.Fatalf("got %v", err)
	}
	if _, err := p.Page(context.Background(), pool, request(t, p, "", ""), strings.Repeat("x", MaxSearchLength)); err != nil {
		t.Fatalf("200 characters: %v", err)
	}
}

func TestPageCountsAllMatchesAndReturnsOnePage(t *testing.T) {
	pool := setup(t)
	p := New(things())
	two, index := 2, 1
	req, err := p.Config().Resolve(&index, &two, "NAME", page.Asc)
	if err != nil {
		t.Fatal(err)
	}
	pg, err := p.Page(context.Background(), pool, req, "", Where("kind = ?", "blue"))
	if got := names(t)(pg, err); !slices.Equal(got, []string{`back\slash`}) {
		t.Errorf("page 2 of blue: %v", got)
	}
	if pg.Pagination.TotalElementCount != 3 || pg.Pagination.TotalPageCount != 2 || pg.Pagination.HasNext || !pg.Pagination.HasPrevious {
		t.Errorf("pagination %+v", pg.Pagination)
	}
}

func TestPageRefusesASortFromAnotherList(t *testing.T) {
	pool := setup(t)
	p := New(things())
	req, err := page.Config{SortFields: []string{"PRICE"}}.Resolve(nil, nil, "PRICE", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := p.Page(context.Background(), pool, req, ""); err == nil {
		t.Fatal("PRICE was sorted by")
	}
}

func TestNewPanicsOnABadConfig(t *testing.T) {
	for name, change := range map[string]func(*Config[thingSort, thing]){
		"no sorts":               func(c *Config[thingSort, thing]) { c.Sorts = nil },
		"default not a sort":     func(c *Config[thingSort, thing]) { c.DefaultSort = "PRICE" },
		"no default":             func(c *Config[thingSort, thing]) { c.DefaultSort = "" },
		"a sort with no terms":   func(c *Config[thingSort, thing]) { c.Sorts[byDay] = nil },
		"default size above max": func(c *Config[thingSort, thing]) { c.DefaultPageSize, c.MaxPageSize = 50, 10 },
		"no scan":                func(c *Config[thingSort, thing]) { c.Scan = nil },
		"no from":                func(c *Config[thingSort, thing]) { c.From = "" },
		"no columns":             func(c *Config[thingSort, thing]) { c.Columns = "" },
		"a comment in columns":   func(c *Config[thingSort, thing]) { c.Columns = "name -- x" },
		"a quote in a term":      func(c *Config[thingSort, thing]) { c.Sorts[byName] = []Term{By("name || 'x'")} },
		"a semicolon in from":    func(c *Config[thingSort, thing]) { c.From = "thing; drop table thing" },
		"a quote in a field":     func(c *Config[thingSort, thing]) { c.Search = []Field{Contains("'x'")} },
	} {
		t.Run(name, func(t *testing.T) {
			cfg := things()
			change(&cfg)
			defer wantPanic(t)
			New(cfg)
		})
	}
}

func TestConfigListsSortsInOrder(t *testing.T) {
	cfg := New(things()).Config()
	if !slices.Equal(cfg.SortFields, []string{"DAY", "NAME"}) || cfg.DefaultSort != "NAME" || !cfg.NoTiebreak {
		t.Errorf("%+v", cfg)
	}
}

func TestCheckFindsAMisspelledColumn(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	if err := New(things()).Check(ctx, pool); err != nil {
		t.Fatalf("the good one: %v", err)
	}
	for name, change := range map[string]func(*Config[thingSort, thing]){
		"a column":     func(c *Config[thingSort, thing]) { c.Columns = "nmae" },
		"a sort term":  func(c *Config[thingSort, thing]) { c.Sorts[byDay] = []Term{By("dya")} },
		"a search one": func(c *Config[thingSort, thing]) { c.Search = []Field{Contains("cdoe")} },
	} {
		t.Run(name, func(t *testing.T) {
			cfg := things()
			change(&cfg)
			if err := New(cfg).Check(ctx, pool); err == nil {
				t.Error("no error")
			}
		})
	}
}

func TestAListWithoutSearchFieldsIgnoresTheTerm(t *testing.T) {
	pool := setup(t)
	cfg := things()
	cfg.Search = nil
	p := New(cfg)
	if got := names(t)(p.Page(context.Background(), pool, request(t, p, "", ""), "nobody")); len(got) != 5 {
		t.Errorf("got %v", got)
	}
}
