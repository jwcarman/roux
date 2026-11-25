package page_test

import (
	"errors"
	"slices"
	"testing"

	"github.com/jwcarman/roux/page"
)

func TestSlicePagesAnInMemoryList(t *testing.T) {
	letters := []string{"a", "b", "c", "d", "e"}
	for _, c := range []struct {
		index, size int
		want        []string
		next, prev  bool
	}{
		{0, 2, []string{"a", "b"}, true, false},
		{2, 2, []string{"e"}, false, true},
		{9, 2, []string{}, false, true}, // past the end: empty, not a panic
	} {
		req, err := page.Config{}.Resolve(&c.index, &c.size, "", "")
		if err != nil {
			t.Fatal(err)
		}
		p := page.Slice(letters, req)
		if !slices.Equal(p.Data, c.want) || p.Pagination.TotalElementCount != 5 || p.Pagination.TotalPageCount != 3 ||
			p.Pagination.HasNext != c.next || p.Pagination.HasPrevious != c.prev {
			t.Errorf("page %d of %d: %+v", c.index, c.size, p)
		}
	}
}

func TestAnUnknownSortNamesWhatIsAllowed(t *testing.T) {
	_, err := page.Config{SortFields: []string{"name", "createdAt"}}.Resolve(nil, nil, "password", "")
	var unknown *page.UnknownSortError
	if !errors.As(err, &unknown) || err.Error() != `unknown sortBy "password", expected one of: name, createdAt` {
		t.Fatalf("%v", err)
	}
}
