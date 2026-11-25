# The activity log

A record's history: who did what to it, and when. A user renamed, an item done, a payment
taken and then removed. The app says what happened, in its own terms, as a small struct, in the
transaction that makes the change; roux stores it with who did it and when, and serves a record's
history, or a feed across records, a page at a time to `ActivityList` in the browser.

This is a **business** activity log: the app decides what is worth saying. It is not change
auditing (every column's before and after, written automatically).

Package `github.com/jwcarman/roux/activity`. Its table, `roux_activity`, comes from its own
migration (`activity.Migration`, run with roux's), so the app writes no migration for it.

## Declare a kind

Each kind of activity is a struct that implements `activity.Activity`. Its fields are the facts
kept; `Type()` is its code and `Describe()` its sentence:

```go
// PlanRenamed is a plan given a new name.
type PlanRenamed struct {
	From string `json:"from"`
	To   string `json:"to"`
}

func (PlanRenamed) Type() string       { return "plan.renamed" }
func (a PlanRenamed) Describe() string { return "Renamed from " + a.From + " to " + a.To }
```

- `Type()` is lower case and dotted (`plan.renamed`, `payment.recorded`), at most 100 characters.
- `Describe()` is a sentence of at most 500 characters, written once, when the activity happens.
- The fields are stored as JSON (`encoding/json`, so give them `json` tags), a `money.Money` or an
  id as the API writes it. A struct with no fields is fine (`type UserDeactivated struct{}`).
- `Describe()` cannot read the request or the organization: what it needs is a field. Text that
  depends on the locale (an amount as the organization writes it) is formatted by the service and passed
  in:

  ```go
  type PaymentRecorded struct {
  	PaymentID uuid.UUID   `json:"paymentId"`
  	Periods   int         `json:"periods"`
  	Amount    money.Money `json:"amount"`
  	Each      string      `json:"each"` // the price per period, as the organization writes it
  }

  func (PaymentRecorded) Type() string { return "payment.recorded" }
  func (a PaymentRecorded) Describe() string {
  	return fmt.Sprintf("Payment recorded: %d × %s", a.Periods, a.Each)
  }
  ```

## Append it

Call `activity.Append` in the transaction that makes the change:

```go
err := pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
	var before string
	if err := tx.QueryRow(ctx, `select name from plan where id = $1 for update`, id).Scan(&before); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `update plan set name = $2, version = version + 1 where id = $1`, id, name); err != nil {
		return err
	}
	return activity.Append(ctx, tx, s.Clock(), id, PlanRenamed{From: before, To: name})
})
```

`activity.Append(ctx, tx, now, anchor, activity, related...)` writes one row: a new id, the time,
the actor (whoever is signed in, from `ctx`; none for the system), the anchor, the related ids, the
type, the description and the details.

- **The anchor** is the id of the record the activity is about. It is a bare `uuid.UUID`: anything
  with an id has a history (a user's is anchored to their id), and there is no foreign key, so the
  history outlives the record ("Plan removed" stays).
- **Related ids** are other records the activity concerns. A label given to an item is anchored to
  the item and related to the label, so the label's history has it too:

  ```go
  activity.Append(ctx, tx, now, itemID, ItemLabelled{LabelID: label.ID, Label: label.Name}, label.ID)
  ```

  The anchor among the related ids, and a repeated id, are dropped.
- **Pass the transaction**, so the activity commits or rolls back with the change.
- **It refuses**, with an error naming the problem: no anchor, an activity that is not a struct, a
  malformed type, a blank or too-long description, an empty related id. These are mistakes in the
  code, and answer `500`.

## The history endpoint

The app writes the endpoint, with its own permission, as for any child list.
`activity.History(ctx, db, names, id, req)` returns every activity anchored to `id` or related to
it, newest first (then by id, so two at the same moment always come in the same order), as a
`page.Page[activity.Entry]`. The request's index and size are used; its sort is ignored.

```go
k.Handle("GET "+BasePath+"/{id}/activities", ItemsRead, func(w http.ResponseWriter, r *http.Request) error {
	id, err := itemID(r)
	if err != nil {
		return err
	}
	req, err := api.PageRequestUnsorted(r)
	if err != nil {
		return err
	}
	out, err := svc.Activities(r.Context(), id, req) // 404 for an unknown item, then activity.History
	if err != nil {
		return err
	}
	return api.JSON(w, http.StatusOK, out)
})
```

An `activity.Entry` is `{ id, occurredAt, type, description, actorId, actorName, details }`.
`details` is the JSON the struct was written as, never turned back into the struct, so an old row
still reads after its struct changes or is deleted. A history that holds something only some
people may see (a payment's amount) gets that permission.

## A feed

An activity page, everything that happened across records or only what concerns someone, is
`activity.Feed(ctx, db, names, req, scope)`, newest first, a page at a time, the same
`page.Page[activity.Entry]`. The scope says which activity, and must be said:

- `activity.Everything()`: the whole log.
- `activity.About(ids...)`: the activity anchored to, or related to, any of the ids (a person, a
  record).

A scope never set (`activity.Scope{}`), `About()` with no ids, or an empty id is an error, never the
whole log: a feed that forgot its scope shows nothing.

Who may see which scope is the app's, in its endpoint, under its own permission:

```go
k.Handle("GET /api/activity", ActivityRead, func(w http.ResponseWriter, r *http.Request) error {
	req, err := api.PageRequestUnsorted(r)
	if err != nil {
		return err
	}
	me := authn.PrincipalFrom(r.Context())
	scope := activity.Everything()
	if !me.Has(AllowancesManage) { // a kid sees only what concerns them
		scope = activity.About(me.IdentityID)
	}
	out, err := activity.Feed(r.Context(), svc.Pool, svc.Names, req, scope)
	if err != nil {
		return err
	}
	return api.JSON(w, http.StatusOK, out)
})
```

`About` finds an activity through its anchor and its related ids, so whoever a feed is filtered by
must be one of them when it is appended: an allowance entry for Ada is anchored to the entry and
related to Ada (`activity.Append(ctx, tx, now, entryID, EntryRecorded{...}, adaID)`). Never read
`roux_activity` with SQL of your own.

Relating an activity to a person is safe: roux's user history (`GET /api/roux/users/{id}/activities`,
open to anyone with `users.read`) shows only roux's own `user.*` kinds, never the app's. Who sees
the app's rows is decided by the app's own endpoints. Never name an app's kinds `user.*`.

## Who did it

`names` (an `activity.Names`, `func(ctx, ids) (map[uuid.UUID]string, error)`) names a page's
actors at once. Pass the users' display names, `users.Service{Pool: pool}.Names`, so a history
reads "Ada Lovelace"; or a function of the app's own to name them some other way.

roux's users' own kinds, anchored to the user: `user.invited`, `user.signed_up`,
`user.renamed`, `user.deactivated`, `user.reactivated` and `user.role_changed` ([Users](users.md)).

An actor `names` does not name is `activity.Unknown` ("Unknown"); an activity with no actor is
`activity.System` ("System").

## The browser: `ActivityList`

`@jwcarman/roux-web/activity` has the wire type, `Activity`, `activityQuery` and `ActivityList`.
`activityQuery(key, url)` is the page query for the app's history or feed endpoint, which
`ActivityList` takes.
`ActivityList` shows each entry's
description, who did it and when ("3 days ago", with the moment in the organization's zone as its
title), "Show more" for the next page, and a line when there is nothing yet.

```ts
// items.ts, the resource module
export const itemHistory = (id: string) =>
  activityQuery(queryKeys.items.activities(id), path`items/${id}/activities`);

// activity.ts: the feed
export const activityFeed = activityQuery(queryKeys.activity.all(), "activity");
```

```tsx
<ActivityList aria-label="History" query={itemHistory(item.id)} />
<ActivityList aria-label="Activity" query={activityFeed} />
```

`ActivityListProps`: `aria-label`, `query`, `emptyText` ("Nothing has happened yet." unless given) and
`now` (what "3 days ago" counts from; for a test). Put the history's key under the record's detail key
(`[...detail(id), "activities"]`) so a mutation that refreshes the record refreshes its history; one that
refreshes only part of it adds the history's key. A page that shows one kind its own way reads
`details`, typed as it likes.

`formatRelativeTime(iso, now?)` (`@jwcarman/roux-web/dates`) is the "3 days ago" on its own, in the
organization's language: "now" under a minute (or a little ahead of this device), then minutes, hours,
days ("yesterday"), months and years.

## The table

`roux_activity`: `id`, `occurred_at`, `actor_id` (null for the system), `anchor_id`, `related_ids`
(`uuid[]`), `type`, `description`, `details` (`jsonb`). Indexed by anchor and time, and by related
id. Rows are never updated. A test starts from an empty history: each `rouxtest.New` is a fresh
schema.

## Don't

- Never rename a `Type()` once rows exist: stored rows keep the old code. A new meaning is a new
  type.
- Never put what must not be kept forever in an activity's fields (a password, a token, a card
  number): every field is stored, and rows are never updated.
- Don't append outside the transaction that makes the change, or before the change can still fail
  on something the activity does not know.
- Don't use it for column-by-column change tracking.
- Don't turn `details` back into the app's structs: old rows have old shapes.
- Don't query `roux_activity` yourself for a feed: `activity.Feed` with a scope.
- Don't name an app's kinds `user.*`: that prefix is roux's, and its user history shows them to
  anyone with `users.read`.
