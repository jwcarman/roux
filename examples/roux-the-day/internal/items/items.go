// Package items is the team's plans: things to do on a day, all day or at a time, each assigned
// to people of the team. Any member may add or change an item; only its author or an owner may
// delete it.
package items

import (
	"context"
	"embed"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/jwcarman/roux/app"
	"github.com/jwcarman/roux/pgdb"

	"roux-the-day/internal/paging"
)

// The items' permissions (migrations/002_permissions.sql grants them).
const (
	ItemsRead      = "items.read"
	ItemsWrite     = "items.write"
	ItemsDeleteAny = "items.delete.any" // delete an item someone else wrote
)

//go:embed migrations/*.sql
var migrations embed.FS

// Module is the items feature: its tables, its endpoints, and a check of its list at start.
type Module struct {
	// Clock is the time "today" comes from; time.Now when nil.
	Clock func() time.Time
}

func (Module) Name() string { return "items" }

func (Module) Migrations() []pgdb.Migration {
	return []pgdb.Migration{{Name: "items", FS: migrations, Dir: "migrations", After: []string{"roux-users", "app-roles"}}}
}

func (m Module) Mount(_ context.Context, k *app.Kit) error {
	now := m.Clock
	if now == nil {
		now = time.Now
	}
	Register(k, Service{
		Pool:  k.Pool,
		Clock: now,
		Zone:  func() string { return k.Organization().TimeZone },
	})
	return nil
}

// Start checks the list's view against the database: a misspelled column stops the app here.
func (Module) Start(ctx context.Context, k *app.Kit) error { return CheckList(ctx, k.Pool) }

// CheckList runs the items list's queries against db, matching nothing.
func CheckList(ctx context.Context, db paging.Querier) error { return list.Check(ctx, db) }

// Sort is how the list may be sorted: the sortBy values a client sends.
type Sort string

const (
	ByDay      Sort = "DAY"
	ByTitle    Sort = "TITLE"
	ByAssignee Sort = "ASSIGNEE"
)

// list is the items list: item_list (migrations/001_items.sql), by day unless asked otherwise.
var list = paging.New(paging.Config[Sort, Row]{
	From:    "item_list",
	Columns: "id, title, day, at_time, done, assignee_names, version",
	Sorts: map[Sort][]paging.Term{
		ByDay:      {paging.By("day"), paging.By("at_time").NullsFirst()},
		ByTitle:    {paging.By("lower(title)")},
		ByAssignee: {paging.By("lower(first_assignee_name)")},
	},
	DefaultSort: ByDay,
	Search:      []paging.Field{paging.Contains("title"), paging.Contains("notes")},
	Scan:        scanRow,
})

// Row is an item as the list shows it.
type Row struct {
	ID            uuid.UUID `json:"id"`
	Title         string    `json:"title"`
	Day           string    `json:"day"` // 2026-11-24
	At            *string   `json:"at"`  // 10:30, or null for all day
	Done          bool      `json:"done"`
	AssigneeNames []string  `json:"assigneeNames"`
	Version       int64     `json:"version"`
}

func scanRow(row pgx.CollectableRow) (Row, error) {
	var r Row
	var day time.Time
	var at pgtype.Time
	if err := row.Scan(&r.ID, &r.Title, &day, &at, &r.Done, &r.AssigneeNames, &r.Version); err != nil {
		return r, err
	}
	r.Day, r.At = day.Format(time.DateOnly), clock(at)
	return r, nil
}

// clock is a time of day as "15:04", or nil for none.
func clock(t pgtype.Time) *string {
	if !t.Valid {
		return nil
	}
	s := time.UnixMicro(t.Microseconds).UTC().Format("15:04")
	return &s
}
