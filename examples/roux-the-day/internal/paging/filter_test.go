package paging

import (
	"slices"
	"testing"
)

func TestWhereNumbersPlaceholdersAcrossFilters(t *testing.T) {
	var q query
	q.add(Where("a = ?", 1))
	q.add(Where("b = ? or c = ?", 2, 3))
	if got := q.where(); got != "(a = $1) and (b = $2 or c = $3)" {
		t.Errorf("where: %s", got)
	}
	if !slices.Equal(q.args, []any{1, 2, 3}) {
		t.Errorf("args: %v", q.args)
	}
}

func TestNoFiltersMatchEverything(t *testing.T) {
	var q query
	if got := q.where(); got != "true" {
		t.Errorf("where: %s", got)
	}
}

func TestWherePanicsOnACountMismatch(t *testing.T) {
	for name, f := range map[string]func(){
		"too few args":  func() { Where("a = ? and b = ?", 1) },
		"too many args": func() { Where("a = ?", 1, 2) },
	} {
		t.Run(name, func(t *testing.T) {
			defer wantPanic(t)
			f()
		})
	}
}

func TestWhereRefusesQuotesCommentsSemicolonsAndDollars(t *testing.T) {
	for _, frag := range []sqlText{
		"name = 'x'", `"name" = ?`, "a = ? -- b", "a = ? /* b */", "a = ?; drop table x", "a = $1",
	} {
		t.Run(string(frag), func(t *testing.T) {
			defer wantPanic(t)
			Where(frag, 1)
		})
	}
}

func TestWhereIfLeavesAFilterOut(t *testing.T) {
	var q query
	q.add(WhereIf(false, "a = ?", 1))
	q.add(WhereIf(true, "b = ?", 2))
	if got := q.where(); got != "(b = $1)" || !slices.Equal(q.args, []any{2}) {
		t.Errorf("where %s args %v", got, q.args)
	}
}

func TestWhereIfChecksAFilterItLeavesOut(t *testing.T) {
	defer wantPanic(t)
	WhereIf(false, "a = 'x'")
}

func wantPanic(t *testing.T) {
	t.Helper()
	if recover() == nil {
		t.Error("no panic")
	}
}
