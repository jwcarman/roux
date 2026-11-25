package paging

import (
	"fmt"
	"strconv"
	"strings"
)

// sqlText is SQL written into a statement. It is unexported on purpose: Go converts an untyped
// string constant to it, so paging.Where("day < ?", today) compiles, but not a string variable or
// a fmt.Sprintf result, so a value cannot be pasted into SQL by mistake. Values travel as
// arguments. (In Java terms: as if a method took only compile-time constant strings.)
type sqlText string

// forbidden is what a fragment may not hold: a string literal, a quoted name, a comment, a second
// statement or a hand-numbered placeholder. Each could make a ? that is not a placeholder, or
// shift the numbering, so a value would bind to the wrong place.
var forbidden = []string{"'", `"`, "--", "/*", ";", "$"}

// Filter is one condition of a query, with ? for each argument.
type Filter struct {
	frag sqlText
	args []any
	on   bool
}

// Where is a condition with ? placeholders, one per argument; a slice is one argument (use
// `col = any(?)` or `arr && ?`). It panics on a mismatch or a forbidden fragment: both are
// mistakes in the code, found the first time it runs.
func Where(frag sqlText, args ...any) Filter {
	mustBeSafe("paging.Where", frag)
	if n := strings.Count(string(frag), "?"); n != len(args) {
		panic(fmt.Sprintf("paging.Where(%q): %d placeholders, %d arguments", frag, n, len(args)))
	}
	return Filter{frag: frag, args: args, on: true}
}

// WhereIf is Where when cond holds, and no condition otherwise. The fragment is checked either way.
func WhereIf(cond bool, frag sqlText, args ...any) Filter {
	f := Where(frag, args...)
	f.on = cond
	return f
}

func mustBeSafe(what string, s sqlText) {
	for _, bad := range forbidden {
		if strings.Contains(string(s), bad) {
			panic(fmt.Sprintf("%s(%q): may not contain %s", what, s, bad))
		}
	}
}

// query collects conditions, numbering their placeholders $1, $2, ... in order.
type query struct {
	conds []string
	args  []any
}

func (q *query) add(f Filter) {
	if f.on {
		q.cond(string(f.frag), f.args...)
	}
}

// cond adds a condition the package wrote itself (a search), which may hold what Where refuses.
func (q *query) cond(frag string, args ...any) {
	var b strings.Builder
	b.WriteByte('(')
	parts := strings.Split(frag, "?")
	for i, part := range parts {
		b.WriteString(part)
		if i < len(args) {
			b.WriteString(q.arg(args[i]))
		}
	}
	b.WriteByte(')')
	q.conds = append(q.conds, b.String())
}

// arg appends an argument and returns its placeholder.
func (q *query) arg(v any) string {
	q.args = append(q.args, v)
	return "$" + strconv.Itoa(len(q.args))
}

func (q *query) where() string {
	if len(q.conds) == 0 {
		return "true"
	}
	return strings.Join(q.conds, " and ")
}
