package page

import (
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/jwcarman/roux/problem"
)

// MaxSearchLength is the longest search term, in characters.
const MaxSearchLength = 200

// maxSearchWords is how many distinct words of a term are matched; the rest are ignored.
const maxSearchWords = 10

type matchMode int

const (
	matchContains matchMode = iota
	matchPrefix
	matchExact
)

// Field is a column a search matches, and how (as jpa-utils' @Searchable).
type Field struct {
	col  sqlText
	mode matchMode
}

// Contains matches a word anywhere in the column. It cannot use an ordinary index.
func Contains(col sqlText) Field { return Field{col: col, mode: matchContains} }

// Prefix matches a column that starts with the word; it can use a text_pattern_ops index on lower(col).
func Prefix(col sqlText) Field { return Field{col: col, mode: matchPrefix} }

// Exact matches a column equal to the word, ignoring case: for codes and statuses.
func Exact(col sqlText) Field { return Field{col: col, mode: matchExact} }

// searchWords splits a term into its distinct lower-cased words, at most maxSearchWords.
func searchWords(term string) ([]string, error) {
	if utf8.RuneCountInString(term) > MaxSearchLength {
		return nil, problem.InvalidField("search", problem.MustBeBetween(0, MaxSearchLength))
	}
	var words []string
	for _, w := range strings.Fields(strings.ToLower(term)) {
		if !slices.Contains(words, w) && len(words) < maxSearchWords {
			words = append(words, w)
		}
	}
	return words, nil
}

var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

// searchFor adds one condition per word: the word must match at least one of the fields.
func (p *Paginator[S, T]) searchFor(q *query, words []string) {
	if len(p.cfg.Search) == 0 {
		return
	}
	for _, w := range words {
		ors := make([]string, 0, len(p.cfg.Search))
		args := make([]any, 0, len(p.cfg.Search))
		for _, f := range p.cfg.Search {
			col := "lower(" + string(f.col) + ")"
			switch f.mode {
			case matchContains:
				ors = append(ors, col+` like ? escape '\'`)
				args = append(args, "%"+likeEscaper.Replace(w)+"%")
			case matchPrefix:
				ors = append(ors, col+` like ? escape '\'`)
				args = append(args, likeEscaper.Replace(w)+"%")
			case matchExact:
				ors = append(ors, col+" = ?")
				args = append(args, w)
			}
		}
		q.cond(strings.Join(ors, " or "), args...)
	}
}
