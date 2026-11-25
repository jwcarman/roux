package items

import (
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/jwcarman/roux/problem"
)

// The limits of an item (migrations/001_items.sql checks the lengths too).
const (
	MaxTitle     = 120
	MaxNotes     = 2000
	MaxAssignees = 50
)

// body is a write as it arrives; pointers tell "missing" from empty.
type body struct {
	Title       *string  `json:"title"`
	Notes       *string  `json:"notes"`
	Day         *string  `json:"day"`
	At          *string  `json:"at"`
	AssigneeIDs []string `json:"assigneeIds"`
	Done        *bool    `json:"done"`
	Version     *int64   `json:"version"`
}

// Input is a valid write.
type Input struct {
	Title, Notes string
	Day          time.Time   // a date, at midnight UTC
	At           pgtype.Time // not Valid: all day
	Assignees    []uuid.UUID // distinct, 1 to MaxAssignees
	Done         bool
}

var hhmm = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)

func (b body) validate(needVersion bool) (Input, error) {
	var in Input
	var v []problem.Violation
	bad := func(field, message string) { v = append(v, problem.Violation{Field: field, Message: message}) }

	in.Title = strings.TrimSpace(deref(b.Title))
	switch n := utf8.RuneCountInString(in.Title); {
	case n == 0:
		bad("title", problem.MustNotBeBlank)
	case n > MaxTitle:
		bad("title", problem.MustBeBetween(1, MaxTitle))
	}
	in.Notes = strings.TrimSpace(deref(b.Notes))
	if utf8.RuneCountInString(in.Notes) > MaxNotes {
		bad("notes", problem.MustBeBetween(0, MaxNotes))
	}

	day := strings.TrimSpace(deref(b.Day))
	if d, err := time.Parse(time.DateOnly, day); day == "" {
		bad("day", problem.MustNotBeBlank)
	} else if err != nil {
		bad("day", problem.InvalidValue)
	} else {
		in.Day = d
	}

	if b.At != nil {
		at, err := time.Parse("15:04", *b.At)
		if !hhmm.MatchString(*b.At) || err != nil {
			bad("at", problem.InvalidValue)
		} else {
			in.At = pgtype.Time{Microseconds: int64(at.Hour()*3600+at.Minute()*60) * 1_000_000, Valid: true}
		}
	}

	var why string
	if in.Assignees, why = assignees(b.AssigneeIDs); why != "" {
		bad("assigneeIds", why)
	}
	in.Done = b.Done != nil && *b.Done
	if needVersion && b.Version == nil {
		bad("version", problem.MustNotBeEmpty)
	}
	if len(v) > 0 {
		return Input{}, problem.Validation(v...)
	}
	return in, nil
}

// assignees parses and dedupes the people an item is assigned to, or says what is wrong.
func assignees(ids []string) ([]uuid.UUID, string) {
	var out []uuid.UUID
	for _, s := range ids {
		id, err := uuid.Parse(s)
		if err != nil {
			return nil, problem.InvalidValue
		}
		if !slices.Contains(out, id) {
			out = append(out, id)
		}
	}
	switch {
	case len(out) == 0:
		return nil, problem.MustNotBeEmpty
	case len(out) > MaxAssignees:
		return nil, problem.MustBeBetween(1, MaxAssignees)
	}
	return out, ""
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
