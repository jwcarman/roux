// Package activitylog reads roux_activity a page at a time, for package activity and for roux's
// own histories (users' reads only roux's user.* kinds). Apps use package activity.
package activitylog

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/page"
)

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

// Querier is a pool, a transaction or a connection.
type Querier interface {
	authn.DBTX
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// Names gives the display name of each id it knows.
type Names = func(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]string, error)

// Read is a page of the activity matching where (a constant, its value $1), newest first, its
// actors named.
func Read(ctx context.Context, db Querier, names Names, req page.Request, where string, args ...any) (page.Page[Entry], error) {
	var total int64
	if err := db.QueryRow(ctx, `select count(*) from roux_activity where `+where, args...).Scan(&total); err != nil {
		return page.Page[Entry]{}, err
	}
	n := len(args)
	rows, err := db.Query(ctx, fmt.Sprintf(`
		select id, occurred_at, actor_id, type, description, details
		  from roux_activity
		 where %s
		 order by occurred_at desc, id desc
		 limit $%d offset $%d`, where, n+1, n+2), append(args, req.Size, req.Offset())...)
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
		if e.ActorID != nil && !slices.Contains(actors, *e.ActorID) {
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
