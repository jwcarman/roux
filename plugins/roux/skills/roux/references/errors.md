# Errors: refusing a request, and what the browser shows

Every refusal is a Problem Detail (`application/problem+json`) the browser already knows how to
show. On the server it is a `*problem.Problem` returned as the handler's error.

## Rules

- Return roux's problems (`github.com/jwcarman/roux/problem`); never write an error status or body
  yourself (`http.Error`, `w.WriteHeader(400)`): roux answers a problem as itself and anything else
  as a `500` that says nothing and logs the cause.
- Messages are shown verbatim: plain words, no type names, SQL or Go errors.
- Field rules go in the input's `validate`, all at once (`problem.Validation`); a one-field rule only
  the server can check (a name another record has) is `problem.InvalidField` on that field, not a
  `409`.
- Use roux's words for the common rules (`problem.MustNotBeBlank`...): the browser's helpers show
  the same words.

## Names

| Situation | Return | Answer |
| --- | --- | --- |
| Missing record | `problem.NotFound("This rank no longer exists")` | 404, `detail` = message |
| Every field's mistakes | `problem.Validation(problem.Violation{Field: "name", Message: problem.MustNotBeBlank}, ...)` | 400, `detail` `The request has invalid fields`, `errors: [{field, message}]` |
| One field only the server can judge | `problem.InvalidField("email", "Another student has this email address")` | 400 with `errors` |
| A rule about the request as a whole | `problem.BadRequest("A student is promoted one rank at a time")` | 400, no `errors` |
| Clash with server state, no one field to blame | `problem.Conflict(name + " is already enrolled")` | 409 |
| Stale `version` | `problem.StaleVersion()`, compared first in the update's transaction | 409 `This record changed since you loaded it` |
| Holds the route's permission, but not this record | `problem.Forbidden()` | 403 |
| Signed out, outside a `k.Handle` route | `problem.Unauthorized()` | 401 |
| Anything else | `problem.New(status, detail)` | that status |

Messages: `problem.MustNotBeBlank`, `MustNotBeEmpty`, `InvalidValue`, `ValidEmail`, `ValidURL`,
`BadFormat`, `MustBeMoreThan0`, `MustNotBeNegative`, `MustBeInThePast`, `MustBeInTheFuture`,
`MustNotBeInFuture`, `MustNotBeInPast` (constants); `problem.MustBeBetween(1, 80)` ("Must be between
1 and 80 characters"), `MustBeAtLeast(n)`, `MustBeAtMost(n)`, `MustBeAfter("starts at")`,
`MustBeOneOf(values...)` ("Must be one of A, B") (functions).

Answered for you, no code: a body that is not JSON, the wrong type, or a member the endpoint does
not take (`api.Decode`; 400); a body over 1 MB (413); a bad `pageIndex`, `pageSize`, `sortBy` or
`sortDirection` (`api.PageRequest`; 400 on that parameter); signed out (401 `Sign in to continue`);
without the route's permission (403 `You do not have permission`); no CSRF token on a write (403
`Invalid CSRF token`); no route under `/api/` (404) or the wrong method (405); `pgx.ErrNoRows`
returned as it is (404 `The requested resource does not exist.`); a unique or foreign-key
violation (409, never the database's text); a panic or any other error (500 `Something went
wrong`, with `errorId`, logged). Under `/api/roux/auth/`, sign-in answers its own problems (`type`
`urn:roux:error:<code>`, `code`).

Database errors: the app registers `pgdb.RegisterErrors` for you (the `404` and `409` above).
Don't catch a violation to turn it into a field error; if a feature must name one, test it with
`pgdb.IsViolation(err, pgdb.CodeUniqueViolation)` (or `pgdb.CodeForeignKeyViolation`) after the
transaction ended. An error type of your own answers as a problem when it has
`Problem() *problem.Problem` (`api.ProblemSource`); for one you don't own, `api.MapType(k.Mux, fn)`
or `k.Mux.MapError(sentinel, fn)` at `Mount`. `api.DecodeLenient` is `api.Decode` that ignores
unknown members. A transaction
opened by hand (`pool.Begin`) is closed with `defer pgdb.Rollback(ctx, tx)`; prefer
`pgx.BeginFunc`.

## Refuse because of what another feature holds

The owning feature takes checks; the referring feature supplies one, so `ranks` never imports
`students`:

```go
// in ranks: a reason a rank may not be removed, from a feature that refers to ranks
type RemovalCheck func(ctx context.Context, tx pgx.Tx, rank Rank) error

type Module struct {
	Clock         func() time.Time
	RemovalChecks []RemovalCheck
}
```

```go
// in students
func RankInUse(ctx context.Context, tx pgx.Tx, rank ranks.Rank) error {
	var held bool
	if err := tx.QueryRow(ctx, `select exists (select 1 from promotion where rank_id = $1)`, rank.ID).Scan(&held); err != nil {
		return err
	}
	if held {
		return problem.Conflict(fmt.Sprintf("Students hold or have held %s", rank.Name))
	}
	return nil
}
```

In `cmd/server/modules.go`: `ranks.Module{RemovalChecks: []ranks.RemovalCheck{students.RankInUse}}`.
The service runs each check inside the delete's transaction. Keep the foreign key too.

## "Already done" is success

A repeat request (mark present twice) must not fail on the unique constraint. Let PostgreSQL skip
it:

```go
tag, err := tx.Exec(ctx, `
	insert into attendance (class_id, student_id, attended_on, created_at, created_by)
	values ($1, $2, $3, $4, $5)
	on conflict (class_id, student_id, attended_on) do nothing`,
	classID, studentID, day, s.Clock(), caller.IdentityID)
if err != nil {
	return err
}
added := tag.RowsAffected() == 1 // false: it was already there, which is success too
```

Never insert and then catch the violation in the same transaction: the failed statement aborts the
transaction, and everything after it fails.

## In the browser

`@jwcarman/roux-web/problem`: `Problem` (`type`, `title`, `status`, `detail?`, `instance?`,
`errors?: FieldProblem[]`, `errorId?`), `FieldProblem` (`field`, `message`), and
`problemOf(response)` (never throws). `getJson`/`sendJson` reject with `ApiError` (`status`,
`problem`, `message` = `detail`): branch on `error instanceof ApiError` and `error.status`.

What the user sees (`failure` = the toast title passed, default `Could not save`):

| Answer | `useSchemaForm` | `useServerAction` |
| --- | --- | --- |
| 400 with `errors` | messages under their fields; unknown fields toasted | toast `failure` + `detail` (field messages not shown) |
| 400 / 403 / 404 / 409 | toast `failure` + `detail`; a 409 restarts the form from the refreshed record | toast `failure` + `detail` |
| 401 | nothing; sign-in takes over | nothing |
| 500 | toast + `Reference: <errorId>` | same |
| no answer | toast `failure` alone | same |

Outside those hooks: `notify.problem(problem, title)` (`/feedback`), `fieldErrorsOf(problem)` (`/form`).

## Check

A Go test per refusal: `Want(t, 404, ...)`, `Want(t, 400, ...)` and read `errors`, `Want(t, 409,
...)` (`tests.md`).

## Pitfalls

- A button's request refused with field `errors` shows only the generic detail: refuse buttons with
  `problem.BadRequest` or `problem.Conflict`.
- `fmt.Errorf("rank %s not found", id)` returned from a handler is a `500`: return
  `problem.NotFound(...)`.
- Wrapping a problem loses nothing (`errors.As` finds it), but a problem's `detail` is what the
  person reads: never put an internal error's text in it.
- Comparing versions after changing anything: the change happens, then the 409. Compare first.
