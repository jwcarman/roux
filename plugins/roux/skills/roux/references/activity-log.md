# The activity log

A record's history, or a feed across records: who did what, and when. The app says what happened as
a typed Go struct, in the transaction that makes the change; roux stores it with the actor and time,
and the browser shows it with `ActivityList`.

## Rules

- Append in the transaction that makes the change (`pgx.BeginFunc`), after the change can no longer
  fail: the activity commits or rolls back with it.
- Never rename a `Type()` once rows exist: stored rows keep the old code. A new meaning is a new
  type.
- Never put what must not be kept forever in its fields (a password, a token): rows are never
  updated.
- `Describe()` cannot read the request or the organization: text that depends on the locale (an
  amount) is formatted by the service and passed in as a field.
- Not for column-by-column change tracking.
- An activity page (across records) is `activity.Feed` with a scope, never SQL of your own on
  `roux_activity`. Whoever a feed filters by is the anchor or a `related` id when appended (an
  allowance entry is related to the kid). That is safe: roux's user history shows only its own
  `user.*` kinds, never the app's. Never name an app's kinds `user.*`.

## Names (package `github.com/jwcarman/roux/activity`)

- `activity.Activity`: a struct with `Type() string` (lower-case, dotted, ≤ 100 characters,
  `"plan.renamed"`) and `Describe() string` (≤ 500 characters). Its fields are stored as JSON: give
  them `json` tags.
- `activity.Append(ctx, tx, now, anchor, a, related...)`: one row; the actor is whoever is signed
  in (from `ctx`). `anchor` is the record's id, a bare `uuid.UUID` with no foreign key (the history
  outlives the record); `related` ids put it in their histories too. A mistake in the code (no
  anchor, not a struct, a bad type, a blank description) is an error, answered `500`.
- `activity.History(ctx, db, names, id, req)` → `page.Page[activity.Entry]`, newest first, anchored
  or related. `activity.Entry` is `{ id, occurredAt, type, description, actorId, actorName,
  details }`.
- `activity.Feed(ctx, db, names, req, scope)` → the same page, across records. `scope` is
  `activity.Everything()` or `activity.About(ids...)` (anchored to or related to any); `activity.Scope{}`
  never set, `About()` with no ids, or an empty id is an error, never everything. The app's endpoint
  picks the scope by permission:

  ```go
  scope := activity.Everything()
  if me := authn.PrincipalFrom(r.Context()); !me.Has(AllowancesManage) {
  	scope = activity.About(me.IdentityID) // a kid: only what concerns them
  }
  out, err := activity.Feed(r.Context(), svc.Pool, svc.Names, req, scope)
  ```
- `activity.Names` (`func(ctx, ids) (map[uuid.UUID]string, error)`): pass
  `users.Service{Pool: pool}.Names`. `activity.Unknown` ("Unknown"), `activity.System` ("System").
- Table `roux_activity`, from roux's migrations; each `rouxtest.New` starts empty.
- Browser, `@jwcarman/roux-web/activity`: `Activity`, `activityQuery(key, url)` (a history's or a
  feed's endpoint), `ActivityList`
  (`ActivityListProps`: `aria-label`, `query`, `emptyText?`, `now?`). `formatRelativeTime(iso, now?)`
  is in `/dates`.

## Steps

1. The kind, beside the service:

   ```go
   // PlanRenamed is a plan given a new name.
   type PlanRenamed struct {
   	From string `json:"from"`
   	To   string `json:"to"`
   }

   func (PlanRenamed) Type() string       { return "plan.renamed" }
   func (a PlanRenamed) Describe() string { return "Renamed from " + a.From + " to " + a.To }
   ```
2. Append it in the change's transaction:

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
3. The endpoint, with the record's read permission:

   ```go
   k.Handle("GET "+BasePath+"/{id}/activities", PlansRead, func(w http.ResponseWriter, r *http.Request) error {
   	id, err := planID(r)
   	if err != nil {
   		return err
   	}
   	req, err := api.PageRequestUnsorted(r)
   	if err != nil {
   		return err
   	}
   	out, err := svc.Activities(r.Context(), id, req) // 404 for an unknown plan, then activity.History
   	if err != nil {
   		return err
   	}
   	return api.JSON(w, http.StatusOK, out)
   })
   ```

   with `svc.Activities` calling `activity.History(ctx, s.Pool, s.Names, id, req)` after it checked
   the plan exists, and the module building the service with `Names: users.Service{Pool: k.Pool}.Names`.
4. Query key under the record: `activities: (id: string) => [...queryKeys.plans.detail(id), "activities"] as const`.
5. Module: `export const planHistory = (id: string) => activityQuery(queryKeys.plans.activities(id), path\`plans/${id}/activities\`);`
   (a feed: `export const activityFeed = activityQuery(queryKeys.activity.all(), "activity");`)
6. Page: `<ActivityList aria-label="History" query={planHistory(plan.id)} />`.

## Check

Go test: after the change, `GET /api/plans/{id}/activities` has the entry's `type` and
`description`, and `actorName` is the person's name; an unknown id is 404. Vitest: answer with
`pageOf([...])`; pass `now` for stable "3 days ago" text.

## Pitfalls

- A history showing something only some may see (an amount) needs that permission on its endpoint.
- `activity.Append` with the pool instead of the transaction: the activity stays if the change rolls
  back.
- Turning `details` back into the app's structs: old rows have old shapes.
- `Names` left nil: every actor reads "Unknown".
