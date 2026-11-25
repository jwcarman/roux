package page_test

import (
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
		wantErr      bool
	}{
		{"defaults", nil, nil, "", 0, 20, "NAME", []page.Sort{{"NAME", page.Asc}, {"ID", page.Asc}}, false},
		{"negative index", ptr(-5), nil, "", 0, 20, "NAME", nil, false},
		{"size clamps up", nil, ptr(0), "", 0, 1, "NAME", nil, false},
		{"size clamps down", nil, ptr(1000), "", 0, 100, "NAME", nil, false},
		{"trimmed sort", ptr(2), ptr(5), " ID ", 2, 5, "ID", []page.Sort{{"ID", page.Asc}}, false}, // tiebreaker not duplicated
		{"unknown sort", nil, nil, "PRICE", 0, 0, "", nil, true},
		{"case sensitive", nil, nil, "name", 0, 0, "", nil, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := cfg.Resolve(tt.index, tt.size, tt.sortBy, "")
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v", err)
			}
			if tt.wantErr {
				return
			}
			if req.Index != tt.wantIdx || req.Size != tt.wantSize || req.SortBy != tt.wantSortBy {
				t.Fatalf("got %+v", req)
			}
			if tt.wantSortList != nil {
				got := req.Sorts()
				if len(got) != len(tt.wantSortList) {
					t.Fatalf("sorts = %+v", got)
				}
				for i := range got {
					if got[i] != tt.wantSortList[i] {
						t.Fatalf("sorts = %+v", got)
					}
				}
			}
		})
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
