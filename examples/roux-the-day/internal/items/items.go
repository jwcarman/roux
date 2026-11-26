// Package items is the team's plans: things to do on a day, all day or at a time, each assigned
// to people of the team. Any member may add or change an item; only its author or an owner may
// delete it.
package items

import (
	"context"
	"embed"
	"time"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/app"
	"github.com/jwcarman/roux/cqrs"
	"github.com/jwcarman/roux/page"
	"github.com/jwcarman/roux/pgdb"
)

// The items' permissions (migrations/002_permissions.sql grants them).
const (
	ItemsRead      = "items.read"
	ItemsWrite     = "items.write"
	ItemsDeleteAny = "items.delete.any" // delete an item someone else wrote
)

// Permissions is every permission items checks, for the app's list of them.
var Permissions = []string{ItemsRead, ItemsWrite, ItemsDeleteAny}

//go:embed migrations/*.sql
var migrations embed.FS

// Module is the items feature: its tables and its endpoints.
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
	svc := Service{
		Pool:  k.Pool,
		Clock: now,
		Zone:  func() string { return k.Organization().TimeZone },
	}
	Register(k, svc)
	cqrs.Mount(k, Endpoints(svc)...)
	return nil
}

// Sort is how the list may be sorted: the sortBy values a client sends.
type Sort string

const (
	ByDay      Sort = "DAY"
	ByTitle    Sort = "TITLE"
	ByAssignee Sort = "ASSIGNEE"
)

// list is the items list: item_list (migrations/003_list_wire_form.sql), by day unless asked
// otherwise. Its test runs list.Check.
var list = page.New(page.ListConfig[Sort, Row]{
	From: "item_list",
	Sorts: map[Sort][]page.Term{
		ByDay:      {page.By("day"), page.By("at_time").NullsFirst()},
		ByTitle:    {page.By("lower(title)")},
		ByAssignee: {page.By("lower(first_assignee_name)")},
	},
	DefaultSort: ByDay,
	Search:      []page.Field{page.Contains("title"), page.Contains("notes")},
})

// Row is an item as the list shows it.
type Row struct {
	ID            uuid.UUID `json:"id" db:"id"`
	Title         string    `json:"title" db:"title"`
	Day           string    `json:"day" db:"day_text"` // 2026-11-24
	At            *string   `json:"at" db:"at_text"`   // 10:30, or null for all day
	Done          bool      `json:"done" db:"done"`
	AssigneeNames []string  `json:"assigneeNames" db:"assignee_names"`
	Version       int64     `json:"version" db:"version"`
}
