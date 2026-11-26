package items

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/cqrs"
	"github.com/jwcarman/roux/page"
	"github.com/jwcarman/roux/problem"
)

// The events the items' queries and commands speak of.
const itemsChanged = "itemsChanged"

// ItemsArgs are the items query's filters; a value left empty is not filtered on.
type ItemsArgs struct {
	When     string `query:"when" oneof:"all,overdue,today,week"`
	Status   string `query:"status" oneof:"open,done"`
	Assignee string `query:"assignee" oneof:"anyone,me"` // me is whoever asks
}

// ItemRow is an item as a screen lists it.
type ItemRow struct {
	ID            uuid.UUID `json:"id"`
	Title         string    `json:"title"`
	Day           string    `json:"day"` // 2026-11-24
	At            *string   `json:"at"`  // 10:30, or null for all day
	AssigneeNames []string  `json:"assigneeNames"`
	Status        string    `json:"status"` // Open or Done
	Version       int64     `json:"version"`
}

func itemRow(r Row) ItemRow {
	status := "Open"
	if r.Done {
		status = "Done"
	}
	return ItemRow{ID: r.ID, Title: r.Title, Day: r.Day, At: r.At, AssigneeNames: r.AssigneeNames, Status: status, Version: r.Version}
}

// filter is the list's filter for the args, as the caller asks.
func (a ItemsArgs) filter(caller *authn.Principal, search string) Filter {
	f := Filter{Search: search, When: When(a.When)}
	switch a.Status {
	case "open":
		f.Done = new(false)
	case "done":
		f.Done = new(true)
	}
	if a.Assignee == "me" {
		f.Assignee = &caller.IdentityID
	}
	return f
}

// AddItem is the addItem command's input: a quick add, all day, for the caller. No day is today,
// in the team's zone.
type AddItem struct {
	Title *string `json:"title"`
	Day   *string `json:"day"`

	day time.Time // Day, parsed by Validate; zero when no day was given
}

// Validate is the cqrs.Input rule: a title of 1 to MaxTitle characters and, when there is a day,
// a date (2026-11-24).
func (a AddItem) Validate() (AddItem, error) {
	var v []problem.Violation
	title := strings.TrimSpace(deref(a.Title))
	switch n := utf8.RuneCountInString(title); {
	case n == 0:
		v = append(v, problem.Violation{Field: "title", Message: problem.MustNotBeBlank})
	case n > MaxTitle:
		v = append(v, problem.Violation{Field: "title", Message: problem.MustBeBetween(1, MaxTitle)})
	}
	var day time.Time
	if text := strings.TrimSpace(deref(a.Day)); text != "" {
		parsed, err := time.Parse(time.DateOnly, text)
		if err != nil {
			v = append(v, problem.Violation{Field: "day", Message: problem.InvalidValue})
		}
		day = parsed
	}
	if len(v) > 0 {
		return AddItem{}, problem.Validation(v...)
	}
	return AddItem{Title: &title, Day: a.Day, day: day}, nil
}

// Added is what addItem answers.
type Added struct {
	ID uuid.UUID `json:"id"`
}

// Endpoints are the items' queries and commands: the app's ports. Each is thin; the work is the
// Service's.
func Endpoints(s Service) []cqrs.Endpoint {
	return []cqrs.Endpoint{
		cqrs.Query[ItemsArgs, ItemRow]{
			Name: "items", Permission: ItemsRead, DependsOn: []string{itemsChanged}, Paging: list.Config(),
			Run: func(ctx context.Context, db page.Querier, caller *authn.Principal, req page.Request, search string, args ItemsArgs) (page.Page[ItemRow], error) {
				pg, err := s.list(ctx, db, req, args.filter(caller, search))
				if err != nil {
					return page.Page[ItemRow]{}, err
				}
				rows := make([]ItemRow, len(pg.Data))
				for i, r := range pg.Data {
					rows[i] = itemRow(r)
				}
				return page.Page[ItemRow]{Data: rows, Pagination: pg.Pagination}, nil
			},
		},
		cqrs.Lookup[cqrs.NoArgs, ItemCounts]{
			Name: "itemCounts", Permission: ItemsRead, DependsOn: []string{itemsChanged},
			Run: func(ctx context.Context, db page.Querier, _ *authn.Principal, _ cqrs.NoArgs) (ItemCounts, error) {
				return s.Counts(ctx, db)
			},
		},
		cqrs.Command[AddItem, Added]{
			Name: "addItem", Permission: ItemsWrite, Emits: []string{itemsChanged},
			Run: func(ctx context.Context, tx pgx.Tx, caller *authn.Principal, in AddItem) (Added, error) {
				day := in.day
				if day.IsZero() {
					today, err := s.today()
					if err != nil {
						return Added{}, err
					}
					day = today
				}
				d, err := s.create(ctx, tx, caller, Input{
					Title: *in.Title, Day: day, At: pgtype.Time{}, Assignees: []uuid.UUID{caller.IdentityID},
				})
				return Added{ID: d.ID}, err
			},
		},
	}
}
