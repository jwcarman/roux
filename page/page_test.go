package page_test

import (
	"slices"
	"testing"

	"github.com/jwcarman/roux/page"
)

func ptr(i int) *int { return &i }

func TestResolve(t *testing.T) {
	cfg := page.Config{SortFields: []string{"ID", "NAME"}, DefaultSort: "NAME"}

	tests := []struct {
		name         string
		index, size  *int
		sortBy       string
		wantIdx      int
		wantSize     int
		wantSortBy   string
		wantSortList []page.Sort
	}{
		{"defaults", nil, nil, "", 0, 20, "NAME", []page.Sort{{"NAME", page.Asc}, {"ID", page.Asc}}},
		{"negative index", ptr(-5), nil, "", 0, 20, "NAME", nil},
		{"size clamps up", nil, ptr(0), "", 0, 1, "NAME", nil},
		{"size clamps down", nil, ptr(1000), "", 0, 100, "NAME", nil},
		{"trimmed sort", ptr(2), ptr(5), " ID ", 2, 5, "ID", []page.Sort{{"ID", page.Asc}}}, // tiebreaker not duplicated
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := cfg.Resolve(tt.index, tt.size, tt.sortBy, "")
			if err != nil || req.Index != tt.wantIdx || req.Size != tt.wantSize || req.SortBy != tt.wantSortBy {
				t.Fatalf("got %+v %v", req, err)
			}
			if tt.wantSortList != nil && !slices.Equal(req.Sorts(), tt.wantSortList) {
				t.Fatalf("sorts = %+v", req.Sorts())
			}
		})
	}
}

func TestResolveRefusesASortItDoesNotAllow(t *testing.T) {
	cfg := page.Config{SortFields: []string{"ID", "NAME"}, DefaultSort: "NAME"}
	for _, sortBy := range []string{"PRICE", "name"} { // unknown, and the wrong case
		if _, err := cfg.Resolve(nil, nil, sortBy, ""); err == nil {
			t.Errorf("%q was accepted", sortBy)
		}
	}
}

// The direction is written into ORDER BY by whoever runs the query, so Resolve accepts only the
// two there are: a caller that skips api.PageRequest cannot smuggle SQL through it.
func TestResolveRefusesADirectionItDoesNotKnow(t *testing.T) {
	cfg := page.Config{SortFields: []string{"NAME"}}
	for _, dir := range []page.Direction{"SIDEWAYS", "asc", "ASC; drop table x"} {
		if _, err := cfg.Resolve(nil, nil, "NAME", dir); err == nil {
			t.Errorf("%q was accepted", dir)
		}
	}
}

func TestTiebreakerFollowsDirection(t *testing.T) {
	req, _ := page.Config{SortFields: []string{"NAME"}}.Resolve(nil, nil, "NAME", page.Desc)
	s := req.Sorts()
	if len(s) != 2 || s[1] != (page.Sort{"ID", page.Desc}) {
		t.Fatalf("sorts = %+v", s)
	}
	req, _ = page.Config{SortFields: []string{"NAME"}, NoTiebreak: true}.Resolve(nil, nil, "NAME", "")
	if len(req.Sorts()) != 1 {
		t.Fatalf("tiebreaker not disabled: %+v", req.Sorts())
	}
}

func TestOf(t *testing.T) {
	cfg := page.Config{}
	req, _ := cfg.Resolve(ptr(1), ptr(10), "", "")
	p := page.Of([]int{1}, req, 21).Pagination
	if p.TotalPageCount != 3 || !p.HasNext || !p.HasPrevious {
		t.Fatalf("%+v", p)
	}
	p = page.Of[int](nil, req, 0).Pagination
	if p.TotalPageCount != 0 || p.HasNext {
		t.Fatalf("empty: %+v", p)
	}
}
