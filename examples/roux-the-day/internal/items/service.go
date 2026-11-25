package items

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/page"
	"github.com/jwcarman/roux/problem"

	"roux-the-day/internal/paging"
)

// Service is the items' operations.
type Service struct {
	Pool  *pgxpool.Pool
	Clock func() time.Time
	// Zone is the team's time zone (the organization's), for "today" and "this week".
	Zone func() string
}

// When narrows the list by day, in the team's zone.
type When string

const (
	Anytime  When = "all"
	Overdue  When = "overdue" // open, and before today
	Today    When = "today"
	ThisWeek When = "week" // Monday to Sunday
)

// Filter is what the list is narrowed to; the zero value is everything.
type Filter struct {
	Search   string
	When     When
	Assignee *uuid.UUID
	Done     *bool
}

// today is the team's date now, at midnight UTC (how a Postgres date travels).
func (s Service) today() (time.Time, error) {
	zone, err := time.LoadLocation(s.Zone())
	if err != nil {
		return time.Time{}, err
	}
	y, m, d := s.Clock().In(zone).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC), nil
}

// List is a page of items.
func (s Service) List(ctx context.Context, req page.Request, f Filter) (page.Page[Row], error) {
	today, err := s.today()
	if err != nil {
		return page.Page[Row]{}, err
	}
	monday := today.AddDate(0, 0, -(int(today.Weekday())+6)%7)
	filters := []paging.Filter{
		paging.WhereIf(f.When == Overdue, "not done and day < ?", today),
		paging.WhereIf(f.When == Today, "day = ?", today),
		paging.WhereIf(f.When == ThisWeek, "day between ? and ?", monday, monday.AddDate(0, 0, 6)),
	}
	if f.Assignee != nil {
		filters = append(filters, paging.Where("assignee_ids && ?", []uuid.UUID{*f.Assignee}))
	}
	if f.Done != nil {
		filters = append(filters, paging.Where("done = ?", *f.Done))
	}
	return list.Page(ctx, s.Pool, req, f.Search, filters...)
}

// Person is someone an item is assigned to.
type Person struct {
	ID     uuid.UUID `json:"id"`
	Name   string    `json:"name"`
	Active bool      `json:"active"` // false: deactivated since; they must be replaced to save the item
}

// Detail is an item as its dialog shows it.
type Detail struct {
	Row
	Notes     string    `json:"notes"`
	Assignees []Person  `json:"assignees"`
	CreatedBy uuid.UUID `json:"createdBy"`
	// CanDelete is whether the caller may delete it: its author, or an owner.
	CanDelete bool `json:"canDelete"`
}

func notFound() error { return problem.NotFound("") }

// Get is one item, as the caller sees it.
func (s Service) Get(ctx context.Context, caller *authn.Principal, id uuid.UUID) (Detail, error) {
	return get(ctx, s.Pool, caller, id)
}

func get(ctx context.Context, db paging.Querier, caller *authn.Principal, id uuid.UUID) (Detail, error) {
	rows, err := db.Query(ctx, `
		select id, title, day, at_time, done, assignee_names, version, notes, created_by
		  from item_list where id = $1`, id)
	if err != nil {
		return Detail{}, err
	}
	d, err := pgx.CollectExactlyOneRow(rows, func(row pgx.CollectableRow) (Detail, error) {
		var d Detail
		r, err := scanRow(extra{row, []any{&d.Notes, &d.CreatedBy}})
		d.Row = r
		return d, err
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return Detail{}, notFound()
	}
	if err != nil {
		return Detail{}, err
	}
	people, err := db.Query(ctx, `
		select u.id, u.display_name, i.status = 'ACTIVE'
		  from item_assignee a
		  join roux_user u on u.id = a.user_id
		  join roux_identity i on i.id = u.id
		 where a.item_id = $1
		 order by lower(u.display_name), u.id`, id)
	if err != nil {
		return Detail{}, err
	}
	if d.Assignees, err = pgx.CollectRows(people, pgx.RowToStructByPos[Person]); err != nil {
		return Detail{}, err
	}
	d.CanDelete = mayDelete(caller, d.CreatedBy)
	return d, nil
}

// extra lets scanRow read a row that has more columns after the list's: they go to more.
type extra struct {
	pgx.CollectableRow
	more []any
}

func (e extra) Scan(dest ...any) error { return e.CollectableRow.Scan(append(dest, e.more...)...) }

func mayDelete(caller *authn.Principal, author uuid.UUID) bool {
	return caller.IdentityID == author || caller.Has(ItemsDeleteAny)
}

// Create adds an item written by the caller.
func (s Service) Create(ctx context.Context, caller *authn.Principal, in Input) (Detail, error) {
	var out Detail
	err := pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
		if err := mustBeActive(ctx, tx, in.Assignees); err != nil {
			return err
		}
		now := s.Clock()
		var id uuid.UUID
		if err := tx.QueryRow(ctx, `
			insert into item (title, notes, day, at_time, done, created_at, created_by, modified_at, modified_by)
			values ($1, $2, $3, $4, $5, $6, $7, $6, $7) returning id`,
			in.Title, in.Notes, in.Day, in.At, in.Done, now, caller.IdentityID).Scan(&id); err != nil {
			return err
		}
		if err := assign(ctx, tx, id, in.Assignees); err != nil {
			return err
		}
		var err error
		out, err = get(ctx, tx, caller, id)
		return err
	})
	return out, err
}

// Update changes an item, from the version the caller last saw.
func (s Service) Update(ctx context.Context, caller *authn.Principal, id uuid.UUID, version int64, in Input) (Detail, error) {
	var out Detail
	err := pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
		var current int64
		err := tx.QueryRow(ctx, `select version from item where id = $1 for update`, id).Scan(&current)
		if errors.Is(err, pgx.ErrNoRows) {
			return notFound()
		}
		if err != nil {
			return err
		}
		if current != version {
			return problem.StaleVersion()
		}
		if err := mustBeActive(ctx, tx, in.Assignees); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			update item set title = $2, notes = $3, day = $4, at_time = $5, done = $6,
			       version = version + 1, modified_at = $7, modified_by = $8
			 where id = $1`,
			id, in.Title, in.Notes, in.Day, in.At, in.Done, s.Clock(), caller.IdentityID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `delete from item_assignee where item_id = $1`, id); err != nil {
			return err
		}
		if err := assign(ctx, tx, id, in.Assignees); err != nil {
			return err
		}
		out, err = get(ctx, tx, caller, id)
		return err
	})
	return out, err
}

// Delete removes an item: the caller must be its author or hold ItemsDeleteAny.
func (s Service) Delete(ctx context.Context, caller *authn.Principal, id uuid.UUID) error {
	return pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
		var author uuid.UUID
		err := tx.QueryRow(ctx, `select created_by from item where id = $1 for update`, id).Scan(&author)
		if errors.Is(err, pgx.ErrNoRows) {
			return notFound()
		}
		if err != nil {
			return err
		}
		if !mayDelete(caller, author) {
			return problem.Forbidden()
		}
		_, err = tx.Exec(ctx, `delete from item where id = $1`, id)
		return err
	})
}

// mustBeActive refuses assignees who are not active members of the team.
func mustBeActive(ctx context.Context, tx pgx.Tx, ids []uuid.UUID) error {
	var n int
	if err := tx.QueryRow(ctx, `
		select count(*) from roux_user u join roux_identity i on i.id = u.id
		 where u.id = any($1) and i.status = 'ACTIVE'`, ids).Scan(&n); err != nil {
		return err
	}
	if n != len(ids) {
		return problem.InvalidField("assigneeIds", "Must be active members of the team")
	}
	return nil
}

func assign(ctx context.Context, tx pgx.Tx, id uuid.UUID, people []uuid.UUID) error {
	_, err := tx.Exec(ctx, `insert into item_assignee (item_id, user_id) select $1, unnest($2::uuid[])`, id, people)
	return err
}
