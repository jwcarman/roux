// Package activity is the business activity log: Append says what happened to a
// record, in the transaction that changes it; History reads a record's story a page
// at a time. An activity is a struct whose fields are the facts kept (a rename's old
// and new names), with its kind's code and its sentence:
//
//	type MemberRenamed struct{ From, To string `json:"..."` }
//	func (MemberRenamed) Type() string     { return "member.renamed" }
//	func (a MemberRenamed) Describe() string { return "Renamed from " + a.From + " to " + a.To }
package activity

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"regexp"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/page"
	"github.com/jwcarman/roux/pgdb"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Migration is the activity log's schema.
var Migration = pgdb.Migration{Name: "roux-activity", FS: migrations, Dir: "migrations", After: []string{"roux-authn"}}

// Activity is what happened to a record.
type Activity interface {
	// Type is the kind's code: lower case and dotted ("member.renamed"), at most 100
	// characters. Stored rows keep it, so it never changes once rows exist.
	Type() string
	// Describe is what happened, in a sentence of at most 500 characters, written once.
	Describe() string
}

const (
	maxType        = 100
	maxDescription = 500
)

var typePattern = regexp.MustCompile(`^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`)

// Append records that the activity happened to the anchor record (and concerns the
// related ones), done by whoever is signed in (the system when no one is, as with a
// startup task), now. Call it inside the transaction that makes the change, so the
// record of it commits or rolls back with it.
func Append(ctx context.Context, db authn.DBTX, now time.Time, anchor uuid.UUID, a Activity, related ...uuid.UUID) error {
	if anchor == uuid.Nil {
		return errors.New("activity: the anchor is required")
	}
	if reflect.Indirect(reflect.ValueOf(a)).Kind() != reflect.Struct {
		return fmt.Errorf("activity: %T must be a struct", a)
	}
	typ := a.Type()
	if len(typ) > maxType || !typePattern.MatchString(typ) {
		return fmt.Errorf("activity: type %q must be a lower-case dotted code of at most %d characters (member.renamed)", typ, maxType)
	}
	desc := a.Describe()
	if len(desc) == 0 || utf8.RuneCountInString(desc) > maxDescription {
		return fmt.Errorf("activity: the description of %q must be a sentence of at most %d characters", typ, maxDescription)
	}
	others := []uuid.UUID{}
	for _, id := range related {
		switch {
		case id == uuid.Nil:
			return fmt.Errorf("activity: a related id of %q is empty", typ)
		case id != anchor && !contains(others, id):
			others = append(others, id)
		}
	}
	details, err := json.Marshal(a)
	if err != nil {
		return fmt.Errorf("activity: the details of %q: %w", typ, err)
	}
	if string(details) == "null" {
		details = []byte("{}")
	}
	var actor *uuid.UUID
	if p := authn.PrincipalFrom(ctx); p != nil {
		actor = &p.IdentityID
	}
	id, err := uuid.NewV7()
	if err != nil {
		return err
	}
	_, err = db.Exec(ctx, `
		insert into roux_activity (id, occurred_at, actor_id, anchor_id, related_ids, type, description, details)
		values ($1, $2, $3, $4, $5, $6, $7, $8)`,
		id, now, actor, anchor, others, typ, desc, details)
	return err
}

func contains(ids []uuid.UUID, id uuid.UUID) bool {
	for _, x := range ids {
		if x == id {
			return true
		}
	}
	return false
}

// The names an entry shows for people who are not named.
const (
	// System is the actor of what happened with no one signed in.
	System = "System"
	// Unknown is the actor whose name no one can give.
	Unknown = "Unknown"
)

// Entry is one activity in a record's history, as the browser gets it.
type Entry struct {
	ID          uuid.UUID       `json:"id"`
	OccurredAt  time.Time       `json:"occurredAt"`
	Type        string          `json:"type"`
	Description string          `json:"description"`
	ActorID     *uuid.UUID      `json:"actorId"`
	ActorName   string          `json:"actorName"`
	Details     json.RawMessage `json:"details"`
}

// Names says what to call people: the display name of each id it knows.
type Names func(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]string, error)

// History is every activity anchored to the record or related to it, newest first,
// a page at a time (the request's index and size; its sort is ignored).
func History(ctx context.Context, db interface {
	authn.DBTX
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}, names Names, id uuid.UUID, req page.Request) (page.Page[Entry], error) {
	var total int64
	if err := db.QueryRow(ctx,
		`select count(*) from roux_activity where anchor_id = $1 or $1 = any(related_ids)`, id).Scan(&total); err != nil {
		return page.Page[Entry]{}, err
	}
	rows, err := db.Query(ctx, `
		select id, occurred_at, actor_id, type, description, details
		  from roux_activity
		 where anchor_id = $1 or $1 = any(related_ids)
		 order by occurred_at desc, id desc
		 limit $2 offset $3`, id, req.Size, req.Offset())
	if err != nil {
		return page.Page[Entry]{}, err
	}
	entries, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Entry, error) {
		var e Entry
		var details []byte
		if err := row.Scan(&e.ID, &e.OccurredAt, &e.ActorID, &e.Type, &e.Description, &details); err != nil {
			return e, err
		}
		e.OccurredAt = e.OccurredAt.UTC()
		e.Details = json.RawMessage(details)
		return e, nil
	})
	if err != nil {
		return page.Page[Entry]{}, err
	}

	var actors []uuid.UUID
	for _, e := range entries {
		if e.ActorID != nil && !contains(actors, *e.ActorID) {
			actors = append(actors, *e.ActorID)
		}
	}
	named := map[uuid.UUID]string{}
	if len(actors) > 0 && names != nil {
		if named, err = names(ctx, actors); err != nil {
			return page.Page[Entry]{}, err
		}
	}
	for i := range entries {
		switch a := entries[i].ActorID; {
		case a == nil:
			entries[i].ActorName = System
		case named[*a] != "":
			entries[i].ActorName = named[*a]
		default:
			entries[i].ActorName = Unknown
		}
	}
	return page.Of(entries, req, total), nil
}
