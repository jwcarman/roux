# Errors

Every error a roux API answers is an [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) Problem
Detail with a message written for the person using the app. On the server, `roux-problems` (pulled in
by `roux-spring-boot-starter`) maps exceptions to problems: the app throws one of roux's exceptions
and writes no `@ExceptionHandler` and no `@ControllerAdvice` of its own. In the browser,
`@jwcarman/roux-web/problem` reads the problem, `/api` rejects with it inside an `ApiError`, and the
form and button hooks show it: field errors under their fields, anything else as a toast.

## The problem shape

The wire format, from roux's frozen fixtures (`contracts/problem-*.json`):

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
- `detail`: the message for the user. Omitted on a few answers Spring gives itself (a path variable
  that cannot convert, the error page).
- `instance`: the request path.
- `errors`: on a 400 about fields only. Each entry is a `FieldProblem` (`field`, `message`); `field`
  is the path the client sent (`name`, `items[0].quantity`). Sorted by field, then message.
- `errorId`: on a 500 only. The same id is logged at ERROR with the stack trace, so a user's report
  can be matched to the log.
- `type`: not sent (it is `about:blank`); the browser's `problemOf` fills it in.

The content type is `application/problem+json`.

## Return 404 for a missing record

Throw `NotFoundException` with a message naming what is missing. The template's pattern is one
subclass per resource, so service Javadoc can name it:

```java
import java.util.UUID;

import org.jwcarman.roux.problems.NotFoundException;

public class StudentNotFoundException extends NotFoundException {
  public StudentNotFoundException(UUID id) {
    super("No student %s", id);
  }
}
```

```java
private StudentEntity find(UUID id) {
  return students.findById(id).orElseThrow(() -> new StudentNotFoundException(id));
}
```

Answer: `404`, `detail` = the message (`contracts/problem-not-found.json`).

The constructor is `NotFoundException(String pattern, Object... args)`, formatted as
`InvariantViolationException` is (below): with arguments, `String.format(Locale.ROOT, pattern, args)`;
without, the pattern as it stands.

A path variable that does not convert (`GET /api/students/not-a-uuid` for a `@PathVariable UUID id`)
is answered `404` too, without a `detail`. Do not catch the conversion error yourself.

## Reject a request that breaks a rule

Throw `InvariantViolationException` for a rule about the request as a whole:

```java
import org.jwcarman.roux.problems.InvariantViolationException;

if (next.order() != current.order() + 1) {
  throw new InvariantViolationException("A student is promoted one rank at a time");
}
```

Answer: `400`, `detail` = the message, no `errors` (`contracts/problem-invariant.json`).

The constructor is `InvariantViolationException(String pattern, Object... args)`. With arguments the
message is `String.format(Locale.ROOT, pattern, args)`; without, the pattern is used as is, so a `%`
needs no escaping:

```java
throw new InvariantViolationException("%s needs %d more classes before grading", name, missing);
```

## Reject one field the client sent

Use Bean Validation annotations on the request record first; roux turns their violations into
`errors` with readable messages. When a rule about one field cannot be an annotation (it needs the
database, or the app's clock), throw `InvalidFieldException` naming the field as the client sent it:

```java
import org.jwcarman.roux.problems.InvalidFieldException;

students
    .findByEmailIgnoreCase(request.email())
    .filter(other -> !other.getId().equals(id))
    .ifPresent(
        other -> {
          throw new InvalidFieldException("email", "Another student has this email address");
        });
```

Answer: `400`, `detail` `The request has invalid fields`, and `errors` with one `FieldProblem` for
that field. A form built with `useSchemaForm` shows the message under the field.

The constructor is `InvalidFieldException(String field, String pattern, Object... args)`, formatted as
`InvariantViolationException` is (it is a subclass). `getField()` returns the field.

A uniqueness clash on something the user typed (an email, a name) is an `InvalidFieldException` on
that field, not a `ConflictException`: it lands where the user can fix it.

## Report a clash with the server's state (409)

Throw `ConflictException` when the request clashes with what the server holds and no single field is
to blame:

```java
import org.jwcarman.roux.problems.ConflictException;

if (enrollments.existsByStudentAndClass(studentId, classId)) {
  throw new ConflictException("%s is already enrolled in this class", student.getName());
}
```

Answer: `409`, `detail` = the message (`contracts/problem-conflict.json`). The constructor is
`ConflictException(String pattern, Object... args)`, formatted as `InvariantViolationException` is.

## Refuse a stale save (optimistic locking)

A save carries the `version` it was read at. Call `Versions.require(entity, request.version())` first
in the update, before changing anything:

```java
import org.jwcarman.roux.jpa.Versions;

RankEntity rank = find(id);
Versions.require(rank, request.version());
rank.change(request.name(), request.colour());
```

`entity` is any jpa-utils `BaseEntity`; `version` is a nullable `Long` in the request. A request with
no `version` is a `400` with `errors` on `version` (`Must not be empty`), as a missing required field
is. A `version` that is not the entity's current one throws Spring's
`ObjectOptimisticLockingFailureException` (any `OptimisticLockingFailureException` is answered the
same way, including the one JPA throws on flush). Do not write the check yourself.

Answer: `409`, `detail` `This record changed since you loaded it`. `useSchemaForm` handles this 409
specially; see [Forms](forms.md).

## Refuse because of what another feature holds

"A rank a student holds may not be removed" belongs to the feature that refers to ranks, and `ranks`
must not depend on `students`. Invert it: the owning feature declares a one-method interface, and
each referring feature implements it as a `@Component` that throws a `ConflictException`:

```java
/** A reason a rank may not be removed, from a feature that refers to ranks. */
@FunctionalInterface
public interface RankRemovalCheck {
  void check(RankEntity rank); // throws ConflictException to refuse
}

// in students:
@Component
class PromotionRankRemovalCheck implements RankRemovalCheck {
  private final PromotionRepository promotions;

  PromotionRankRemovalCheck(PromotionRepository promotions) {
    this.promotions = promotions;
  }

  @Override
  public void check(RankEntity rank) {
    if (promotions.existsByRankId(rank.getId())) {
      throw new ConflictException("Students hold or have held %s", rank.getName());
    }
  }
}
```

`RankService` takes `List<RankRemovalCheck>` and runs each before deleting. It is plain Spring; roux
adds nothing. Keep the database's foreign key as the last line of defence (a refusal there is the
generic `This conflicts with existing data`), and the check as the one that says why.

## Treat "already done" as success

Some requests mean "make it so", and a repeat is not an error: marking a student present twice (a
double tap, two devices), adding someone to a group they are in. The unique constraint on the row is
right to refuse a second insert, but a violation you mean to swallow cannot be caught inside the
transaction that caused it: it marks the transaction rollback-only (and Hibernate's session), so
the commit answers 500. The way out used to be a service with no transaction, which is a trap for
the next change. `Idempotent.insert` (`org.jwcarman.roux.jpa`, `roux-jpa`) keeps the service
`@Transactional`:

```java
@Service
public class AttendanceService {
  @PersistenceContext private EntityManager entityManager;

  @Transactional
  public Attendee mark(UUID classId, AttendanceRequest request) {
    // ... find the class and the student ...
    Idempotent.insert(
        entityManager,
        List.of("attendance", classId, student.getId(), request.date()),
        () -> attendance.existsBySchoolClassIdAndStudentIdAndAttendedOn(classId, student.getId(), request.date()),
        () -> attendance.saveAndFlush(new AttendanceEntity(schoolClass, student.getId(), request.date())));
    return new Attendee(...);
  }
}
```

It answers `true` if it inserted and `false` if the row was there; the second request of a race gets
`false` and the service answers success.

Why this and not the alternatives:

- **A transaction-scoped advisory lock on the key** (what `Idempotent.insert` takes), then the
  existence check, then the insert. Requests for one key run one after another, the later one sees the
  earlier one's row, and no violation ever happens, so the transaction stays healthy. The entity is
  saved as usual, so ids, versions and audit columns are filled in as everywhere else.
- `INSERT ... ON CONFLICT DO NOTHING` also avoids the violation, but it bypasses the entity: the app
  writes the id, version and audit columns by hand, and an audit date left null breaks ordering
  that relies on it.
- A savepoint cannot help: Hibernate marks its own transaction rollback-only on the failed flush,
  whatever the database rolls back to.
- Catching the violation and moving on works only with no transaction around it.

Rules: call it inside a transaction (it throws `IllegalStateException` without one, because the lock
would be released at once); start the key with a name for the kind of row (`"attendance"`) and add
what makes the row the same row, matching the unique constraint's columns; pass the check and the
insert as above, and flush in the insert (`saveAndFlush`). Keep the unique constraint: it is the
backstop that makes an insert made any other way fail as a 409. It is PostgreSQL's (advisory locks),
like the rest of roux's persistence.

## What else is answered for you

Nothing here needs app code. The answers below come from roux's advices.

| Cause | Status | `detail` |
| --- | --- | --- |
| `@Valid @RequestBody` violation | 400 | `The request has invalid fields`, with `errors` |
| `@Validated` method parameter violation (controller or service) | 400 | same, with `errors` |
| `@RequestParam` of the wrong type | 400 | same; the message is `Must be one of A, B` for an enum, else `Invalid value` |
| An enum value in a JSON body outside its set (`"role": "OWNER"`) | 400 | same, `errors` on that field (`items[1].role` inside a list): `Must be one of MEMBER, INSTRUCTOR` |
| A date, time or instant in a JSON body the server cannot read (`"startsAt": "6pm"`, `"day": "2026-02-30"`) | 400 | same, `errors` on that field: `Is not in the expected format`, the browser's `time()` and `date()` words |
| `@ModelAttribute` field of the wrong type (query parameters bound to a record) | 400 | same, message as above (Spring's conversion text is never shown) |
| Unknown `sortBy` on a jpa-utils page request | 400 | same, `errors` on `sortBy` (`contracts/problem-unknown-sort.json`) |
| Unmatched path under `/api/` | 404 | Spring's default |
| `DataIntegrityViolationException` | 409 | `This conflicts with existing data` (never the database's text) |
| `AccessDeniedException` from method security, signed in | 403 | `You do not have permission` |
| `AccessDeniedException` from method security when anonymous, or any `AuthenticationException` | 401 | `Sign in to continue` |
| who: sign-in failed / reauthentication required | 401 | `Sign-in failed` / `Sign in again to continue` |
| who: passkey registration rejected | 400 | `The passkey could not be registered` |
| An exception annotated `@ResponseStatus` | its status | the annotation's `reason`, if any |
| Anything else | 500 | `Something went wrong`, with `errorId` (`contracts/problem-server-error.json`) |
| Client disconnected mid-response | nothing | logged at TRACE |

Bean Validation's messages come from roux's `ContributorValidationMessages` bundle (for example
`@NotBlank` gives `Must not be blank`, `@Size` gives `Must be between {min} and {max} characters`,
`@Email` gives `Must be a valid email address`). An app's own `ValidationMessages.properties` does
not hide them. The browser's rule helpers in `/form` use the same words.

Known gap: a JSON body that does not parse, or a body field of the wrong type (a string where a number
is expected, a malformed number), is answered by Spring's own mapping: 400 with a generic `detail` and no `errors`. roux
does not reword it. The form's Zod schema keeps such bodies from being sent; do not rely on the
server to name the field. (An enum value that does not exist, and a date, time or instant that cannot be read, are not part
of this gap: they are field errors, as in the table above.)

### The classes that do this

You never reference these by name; they are listed so an agent reading a stack trace or a bean
listing knows what they are. All are registered by `RouxProblemsAutoConfiguration` with
`@ConditionalOnMissingBean`, so declaring your own bean of the same type replaces roux's (avoid it):

- `ProblemsAdvice`: Spring MVC's exceptions, Bean Validation, roux's exceptions, optimistic locking
  and data integrity.
- `SecurityProblemsAdvice`: Spring Security's.
- `WhoProblemsAdvice`: who's.
- `PagingProblemsAdvice`: jpa-utils' unknown sort.
- `RootProblemsAdvice`: the last resort, ordered after all of the above.
- `ProblemErrorController`: replaces Spring Boot's `BasicErrorController` so that `/error` answers
  any client not asking for HTML with a problem (`title`, `status`, `instance`). A browser still gets
  Spring Boot's HTML page.

Field-path extraction and 500 logging live in package-private helpers (`FieldErrors`,
`ServerErrors`); they are not API.

## Settings

`RouxProblemsProperties`, under `roux.problems`:

| Property | Default | Meaning |
| --- | --- | --- |
| `roux.problems.enabled` | `true` | `false` turns off all of the above. |
| `roux.problems.api-path-prefix` | `/api/` | An unmatched path under it is a 404 problem; any other unmatched path goes to the error page, so the SPA's "Page not found" can render. |

Change `api-path-prefix` only together with the browser's `configureApi` (see
[API client](api-client.md)).

## Don't

- Don't write `@ExceptionHandler` or `@RestControllerAdvice` in the app. Throw one of the exceptions
  above, or let the advice map Spring's.
- Don't return `ResponseEntity.badRequest()` or `ResponseEntity.notFound()` from a controller for an
  error: the answer would not be a problem. Throw instead.
- Don't put Java type names, SQL or stack traces in a message: messages are shown to users verbatim.
- Don't throw `ResponseStatusException` for app errors. It works (Spring maps it to a problem with
  its reason as `detail`), but it skips roux's meaning; use the named exceptions.

## In the browser: reading a problem

From `@jwcarman/roux-web/problem`:

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
| 400 without `errors` (`InvariantViolationException`) | toast: `failure`, then `detail` | same |
| 401 | nothing: the app's `onSessionLost` listener sends the user to sign in | nothing |
| 403, 404 | toast: `failure`, then `detail` | same |
| 409 | toast: `failure`, then `detail`; the form starts over from the refreshed record when it changed | toast: `failure`, then `detail` |
| 500 | toast: `failure`, then `Something went wrong` and `Reference: <errorId>` | same |
| Network failure (no answer) | toast: `failure` alone | same |

Known gap: a button whose request is refused with field `errors` shows only the generic detail. Keep
field rules on forms; a button's request should fail with `InvariantViolationException` or
`ConflictException`, whose message is shown.

To show a problem yourself (outside those hooks), use `notify.problem(problem, title)` from
`/feedback`, which renders the same toast. To place a problem's field errors yourself,
`fieldErrorsOf(problem)` (from `/form`) gives `{ [field]: firstMessage }`. Both are covered in
[Feedback](feedback.md) and [Forms](forms.md).

A query (`useQuery`, `useSuspenseQuery`) that fails rejects with the same `ApiError`. roux's query
client does not retry a 4xx. What the page shows is the app's choice; the template's root route
renders `ErrorPage` from `/feedback` (see [Queries and mutations](queries-and-mutations.md)).
