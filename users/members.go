package users

import (
	"context"
	"slices"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jwcarman/roux/page"
	"github.com/jwcarman/roux/problem"
)

// MustBeActiveMembers is the message for an id that is not an active member of the team.
const MustBeActiveMembers = "Must be active members of the team"

// Member is someone a feature refers to (assigns work to, lists as attending): their name, and
// whether they are still active, for a feature that keeps people who have since left.
type Member struct {
	ID     uuid.UUID `json:"id" db:"id"`
	Name   string    `json:"name" db:"display_name"`
	Active bool      `json:"active" db:"active"`
}

// MustBeActive refuses ids that are not active members of the team (unknown, or deactivated) as a
// 400 on field, for a feature about to refer to them: run it in the transaction that does. The
// same id twice is one member; no ids pass.
func MustBeActive(ctx context.Context, db page.Querier, field string, ids []uuid.UUID) error {
	distinct := slices.Clone(ids)
	slices.SortFunc(distinct, func(a, b uuid.UUID) int { return slices.Compare(a[:], b[:]) })
	distinct = slices.Compact(distinct)
	if len(distinct) == 0 {
		return nil
	}
	var n int
	if err := db.QueryRow(ctx, `
		select count(*) from roux_user u join roux_identity i on i.id = u.id
		 where u.id = any($1) and i.status = 'ACTIVE'`, distinct).Scan(&n); err != nil {
		return err
	}
	if n != len(distinct) {
		return problem.InvalidField(field, MustBeActiveMembers)
	}
	return nil
}

// Members is the members among ids, by name (ignoring case) then id; an id that is no member is
// left out.
func Members(ctx context.Context, db page.Querier, ids []uuid.UUID) ([]Member, error) {
	rows, err := db.Query(ctx, `
		select u.id, u.display_name, i.status = 'ACTIVE' as active
		  from roux_user u join roux_identity i on i.id = u.id
		 where u.id = any($1)
		 order by lower(u.display_name), u.id`, ids)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[Member])
}

// ActiveMembers is every active member of the team, by name (ignoring case) then id: the people a
// feature may assign or invite now (an assignee picker's options). Store a chosen id only after
// MustBeActive, in the transaction that stores it: someone may leave in between.
func ActiveMembers(ctx context.Context, db page.Querier) ([]Member, error) {
	rows, err := db.Query(ctx, `
		select u.id, u.display_name, true as active
		  from roux_user u join roux_identity i on i.id = u.id
		 where i.status = 'ACTIVE'
		 order by lower(u.display_name), u.id`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[Member])
}
