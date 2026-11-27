# Errors

Every error a roux API answers is an [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) Problem
Detail with a message written for the person using the app. On the server, a handler returns a
`*problem.Problem` (package `github.com/jwcarman/roux/problem`) as its error, and roux writes it;
anything else it returns is a `500` that tells the client nothing and logs the cause. In the
browser, `@jwcarman/roux-web/problem` reads the problem, `/api` rejects with it inside an
`ApiError`, and the form and button hooks show it: field errors under their fields, anything else
as a toast.

## The problem shape

The wire format, from roux's fixtures (`contracts/problem-*.json`), which the server's and the
browser's tests both read:

```json
{
  "title": "Bad Request",
  "status": 400,
  "detail": "The request has invalid fields",
  "errors": [{ "field": "title", "message": "Must not be blank" }],
  "instance": "/api/contract/invalid-fields"
}
```

- `title`: the status's reason phrase (`Not Found`, `Conflict`, ...). Never app text.
- `status`: the HTTP status.
- `detail`: the message for the person. Omitted when empty.
- `instance`: the request path, filled in when the problem is written.
- `errors`: on a 400 about fields only. Each entry is a `problem.Violation` (`field`, `message`);
  `field` is the name the client sent (`name`, `assigneeIds`). Sorted by field, then message.
- `errorId`: on a 500 only. The same id is logged at ERROR with the cause, so a person's report can
  be matched to the log.
- `traceId`: the request's trace, when telemetry is on.
- `code`: a stable machine-readable code, on sign-in's own problems.
- `type`: not sent (it is `about:blank`); the browser's `problemOf` fills it in.

The content type is `application/problem+json`.

## Refuse a request

Return the problem as the handler's (or the service's) error. A `*problem.Problem` is an `error`,
and it passes through `fmt.Errorf("...: %w", p)` wrapping unchanged.

| Constructor | Status | Use it for |
| --- | --- | --- |
| `problem.NotFound(detail)` | 404 | A record that does not exist, or that the caller may not know exists. |
| `problem.InvalidField(field, message)` | 400 | One field the client sent is wrong, and only the server can tell (a name another record has). |
| `problem.Validation(violations...)` | 400 | Every field's mistakes at once: what a command's `Validate` returns ([A feature](features.md#the-queries-and-commands)). |
| `problem.BadRequest(detail)` | 400 | A rule about the request as a whole, with no one field to blame. |
| `problem.Conflict(detail)` | 409 | A clash with what the server holds, with no one field to blame. |
| `problem.StaleVersion()` | 409 | An edit made from a version that is no longer current. |
| `problem.Forbidden()` | 403 | The caller holds the route's permission but may not touch this record (not its author). |
| `problem.Unauthorized()` | 401 | Never needed in a `k.Handle` route: the guard answers it. |
| `problem.New(status, detail)` | any | Anything else. |

### Return 404 for a missing record

```go
err := tx.QueryRow(ctx, `select version from label where id = $1 for update`, id).Scan(&current)
if errors.Is(err, pgx.ErrNoRows) {
	return problem.NotFound("This label no longer exists")
}
```

Answer: `404`, `detail` the message (`contracts/problem-not-found.json`). An `{id}` in the path
that is not a UUID names nothing: answer it `404` too. A `pgx.ErrNoRows` a handler lets through is
answered `404` as well, with a generic detail, but say what is missing where you can.

### Refuse a request that breaks a rule

```go
if current.Done && in.Day != current.Day {
	return problem.BadRequest("A done item can't be moved; reopen it first")
}
```

Answer: `400`, `detail` the message, no `errors` (`contracts/problem-invariant.json`). Build a
message with `fmt.Sprintf`; it is shown as it stands.

### Refuse one field the client sent

A command's `Validate` refuses what can be checked from the body alone
([A feature](features.md#the-queries-and-commands)). When a rule about one field needs the
database (or the clock), return `problem.InvalidField` naming the field as the client sent it:

```go
var taken bool
if err := tx.QueryRow(ctx, `select exists (select 1 from label where lower(name) = lower($1) and id <> $2)`,
	name, self).Scan(&taken); err != nil {
	return err
}
if taken {
	return problem.InvalidField("name", NameTaken)
}
```

Answer: `400`, `detail` `The request has invalid fields`, and `errors` with one entry for that
field. A form built with `useSchemaForm` shows the message under the field.

A uniqueness clash on something the person typed (an email, a name) is an invalid field, not a
`409`: it lands where they can fix it.

The words for the common rules are constants and functions in `problem`, the same the browser's
rules show (`contracts/messages.json` is the list both sides test against):

| Go | Message |
| --- | --- |
| `problem.MustNotBeBlank` | `Must not be blank` |
| `problem.MustNotBeEmpty` | `Must not be empty` |
| `problem.InvalidValue` | `Invalid value` |
| `problem.ValidEmail` | `Must be a valid email address` |
| `problem.ValidURL` | `Must be a valid web address` |
| `problem.BadFormat` | `Is not in the expected format` |
| `problem.MustBeMoreThan0` | `Must be more than 0` |
| `problem.MustNotBeNegative` | `Must not be negative` |
| `problem.MustBeInThePast`, `MustBeInTheFuture` | `Must be in the past`, `Must be in the future` |
| `problem.MustNotBeInFuture`, `MustNotBeInPast` | `Must not be in the future`, `Must not be in the past` |
| `problem.MustBeBetween(1, 80)` | `Must be between 1 and 80 characters` |
| `problem.MustBeAtLeast(5)`, `MustBeAtMost(5)` | `Must be at least 5`, `Must be at most 5` |
| `problem.MustBeAfter("starts at")` | `Must be after starts at` |
| `problem.MustBeOneOf("A", "B")` | `Must be one of A, B` |

### Report a clash with the server's state (409)

```go
if booked {
	return problem.Conflict(fmt.Sprintf("%s already has an item at %s", person.Name, at))
}
```

Answer: `409`, `detail` the message (`contracts/problem-conflict.json`).

### Refuse a stale save

A record carries a `version`, raised by every update, and an edit sends back the version it was
made from. Check it first, before changing anything, with the row locked:

```go
var current int64
err := tx.QueryRow(ctx, `select version from label where id = $1 for update`, id).Scan(&current)
// ... a missing row is a 404 ...
if current != version {
	return problem.StaleVersion()
}
```

Then `update ... set version = version + 1`. An edit with no `version` is a `400` on `version`
(`Must not be empty`), from the input's `validate`.

Answer: `409`, `detail` `This record changed since you loaded it`. `useSchemaForm` handles this
409 specially; see [Forms](forms.md).

### Refuse because of what another feature holds

"A label items carry may not be removed" belongs to the feature that refers to labels, and
`labels` must not import `items`. Invert it: the owning feature takes checks, and `modules.go`
passes the referring feature's:

```go
// in labels: a reason a label may not be removed, from a feature that refers to labels
type RemovalCheck func(ctx context.Context, tx pgx.Tx, label Label) error

type Module struct {
	Clock         func() time.Time
	RemovalChecks []RemovalCheck
}
```

```go
// in items
func LabelInUse(ctx context.Context, tx pgx.Tx, label labels.Label) error {
	var held bool
	if err := tx.QueryRow(ctx, `select exists (select 1 from item_label where label_id = $1)`, label.ID).Scan(&held); err != nil {
		return err
	}
	if held {
		return problem.Conflict(fmt.Sprintf("Items carry %s: take it off them first", label.Name))
	}
	return nil
}
```

```go
// in cmd/server/modules.go
labels.Module{RemovalChecks: []labels.RemovalCheck{items.LabelInUse}}
```

The service runs each check in the delete's transaction. Keep the foreign key as the last line of
defence (a refusal there is the generic `409`), and the check as the one that says why.

### Treat "already done" as success

Some requests mean "make it so", and a repeat is not an error: assigning someone to an item twice (a
double tap, two devices), adding someone to a group they are in. Let the unique constraint decide,
and ask PostgreSQL not to fail:

```go
tag, err := tx.Exec(ctx, `
	insert into item_assignee (item_id, user_id)
	values ($1, $2)
	on conflict (item_id, user_id) do nothing`,
	itemID, userID)
if err != nil {
	return err
}
added := tag.RowsAffected() == 1 // false: it was already there, which is success too
```

Never insert and then look for the unique violation inside the same transaction: the failed
statement aborts the transaction, and everything after it fails.

## What else is answered for you

| Cause | Status | `detail` |
| --- | --- | --- |
| A body that is not one JSON object, or has trailing data (`api.Decode`) | 400 | `Request body is not valid JSON.`, or what is wrong with it |
| A member of the wrong type (`"name": 3`) | 400 | `Request body is not valid JSON: name has the wrong type.` |
| A member the endpoint does not take (`api.Decode`; `api.DecodeLenient` ignores it) | 400 | `Request body has a member this endpoint does not take: colour.` |
| A body over 1 MB | 413 | `Request body is too large.` |
| A bad `pageIndex`, `pageSize`, `sortBy` or `sortDirection` (`api.PageRequest`) | 400 | `The request has invalid fields`, with `errors` on the parameter (`Must be one of DAY, TITLE`) |
| A signed-out caller on a `k.Handle` or `k.HandleSignedIn` route | 401 | `Sign in to continue` |
| A caller without the route's permission | 403 | `You do not have permission` |
| An unsafe request (POST, PUT, PATCH, DELETE) without the CSRF token | 403 | `Invalid CSRF token`, with `code` `invalid-csrf-token` (roux-web's client sends the token for you) |
| A path under `/api/` that no route matches | 404 | `No resource exists at this path.` |
| A route matched with the wrong method | 405 | `Method PATCH is not allowed for this resource.` |
| `pgx.ErrNoRows` returned as it is | 404 | `The requested resource does not exist.` |
| A unique or foreign-key violation returned as it is | 409 | `A resource with these values already exists.`, `The operation conflicts with a related resource.` (never the database's text) |
| Anything under `/api/roux/auth/` | its status | sign-in's own problems, with `type` `urn:roux:error:<code>` and `code` |
| A panic | 500 | `Something went wrong`, with `errorId` |
| The request's own cancellation, after the client went away (a page left mid-request) | 499 (`api.StatusClientClosedRequest`) | nothing anyone reads; logged at DEBUG, not ERROR, and no failed trace |
| Anything else | 500 | `Something went wrong`, with `errorId` (`contracts/problem-server-error.json`) |

An error type of the app's own can say how it is answered by having a method
`Problem() *problem.Problem` (`api.ProblemSource`); `api.MapType(mux, fn)` and `mux.MapError(err,
fn)` map an error type or a sentinel the app does not own. Most apps need neither: return a
problem.

A feature that must tell one constraint from another inspects the error after its transaction
ended: `pgdb.IsViolation(err, pgdb.CodeUniqueViolation)` (or `pgdb.CodeForeignKeyViolation`). A
transaction opened by hand with `pool.Begin` is closed with `defer pgdb.Rollback(ctx, tx)`, which
rolls back unless it committed; `pgx.BeginFunc` needs neither.

## Don't

- Don't write a refusal to the response yourself (`w.WriteHeader(400)`): the answer would not be
  a problem. Return one.
- Don't put Go type names, SQL or a wrapped error's text in a message: messages are shown to
  people as they stand.
- Don't answer a refusal with `500`: a mistake the person can fix is a `400`, `404` or `409`.
- Don't catch a database error to reword it unless you can name the field; the generic `409` is
  answered for you.

## In the browser: reading a problem

From `@jwcarman/roux-web/problem` (`Problem`, and `FieldProblem` for each entry of `errors`):

```ts
interface FieldProblem {
  field: string;
  message: string;
}

interface Problem {
  type: string; // "about:blank" when the server sent none
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: FieldProblem[];
  errorId?: string; // on a 500 only
}

function problemOf(response: Response): Promise<Problem>;
```

`problemOf` never throws. A response that is not `application/problem+json`, or whose body cannot be
read, gives `{ type: "about:blank", title: response.statusText, status: response.status }`. `errors`
is kept only when it is a non-empty array of well-formed entries.

You rarely call `problemOf` yourself: `getJson` and `sendJson` (from `/api`) reject with an
`ApiError` that already carries it.

```ts
class ApiError extends Error {
  constructor(status: number, problem?: Problem); // problem defaults to a blank one with that status
  readonly status: number;
  readonly problem: Problem;
  // message: problem.detail, or "Request failed with status <status>"
}
```

Branch on `error instanceof ApiError` and `error.status`; show `error.problem.detail`.

## In the browser: what the user sees

A form saved with `useSchemaForm` (from `/form`) and a button that runs `useServerAction` (from
`/api`) show refusals for you. `failure` is the toast title you pass (default `Could not save`).

| Answer | `useSchemaForm` | `useServerAction` |
| --- | --- | --- |
| 400 with `errors` | each field's first message under the field; messages for fields the form does not have are toasted together under `failure` | toast: `failure`, then `detail` (`The request has invalid fields`); the field messages are not shown |
| 400 without `errors` (`problem.BadRequest`) | toast: `failure`, then `detail` | same |
| 401 | nothing: the app's `onSessionLost` listener sends the user to sign in | nothing |
| 403, 404 | toast: `failure`, then `detail` | same |
| 409 | toast: `failure`, then `detail`; the form starts over from the refreshed record when it changed | toast: `failure`, then `detail` |
| 500 | toast: `failure`, then `Something went wrong` and `Reference: <errorId>` | same |
| Network failure (no answer) | toast: `failure` alone | same |

Known gap: a button whose request is refused with field `errors` shows only the generic detail. Keep
field rules on forms; a button's request should fail with `problem.BadRequest` or
`problem.Conflict`, whose message is shown.

To show a problem yourself (outside those hooks), use `notify.problem(problem, title)` from
`/feedback`, which renders the same toast. To place a problem's field errors yourself,
`fieldErrorsOf(problem)` (from `/form`) gives `{ [field]: firstMessage }`. Both are covered in
[Feedback](feedback.md) and [Forms](forms.md).

A query (`useQuery`, `useSuspenseQuery`) that fails rejects with the same `ApiError`. roux's query
client does not retry a 4xx. What the page shows is the app's choice; the template's root route
renders `ErrorPage` from `/feedback` (see [Queries and mutations](queries-and-mutations.md)).
