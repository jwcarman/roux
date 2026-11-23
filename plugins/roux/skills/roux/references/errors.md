# Errors: refusing a request, and what the browser shows

Every refusal is a Problem Detail (`application/problem+json`) the browser already knows how to show.

## Rules

- Throw roux's exceptions (`org.jwcarman.roux.problems`); write no `@ExceptionHandler`,
  `@RestControllerAdvice`, error `ResponseEntity` or `ResponseStatusException`.
- Messages are shown verbatim: plain words, no type names, SQL or stack traces.
- Prefer a Bean Validation annotation on the request record; throw `InvalidFieldException` only for a
  one-field rule an annotation can't express (needs the database or the clock).
- A uniqueness clash on what the user typed is `InvalidFieldException` on that field, not a 409.

## Names

| Situation | Throw | Answer |
| --- | --- | --- |
| Missing record | a subclass of `NotFoundException` (`super("No rank %s", id)`) | 404, `detail` = message |
| Rule about the request as a whole | `InvariantViolationException("A student is promoted one rank at a time")` | 400, no `errors` |
| One field | `InvalidFieldException("email", "Another student has this email address")` | 400, `detail` `The request has invalid fields`, `errors: [{field, message}]` |
| Clash with server state, no one field to blame | `ConflictException("%s is already enrolled", name)` | 409 |
| Stale `version` | `Versions.require(entity, request.version())` (`org.jwcarman.roux.jpa`), first in the update | 409 `This record changed since you loaded it`; no version → 400 on `version` |
| "Make it so" insert that may repeat | `Idempotent.insert(entityManager, List.of("attendance", ...key), exists, insert)` | `true` inserted, `false` already there |

Constructors take `(String pattern, Object... args)` (`InvalidFieldException` takes the field first),
formatted with `String.format(Locale.ROOT, ...)` only when there are args.

Answered for you, no code: `@Valid` violations (400 with `errors`), a wrong-typed `@RequestParam` or
enum value (`Must be one of A, B`), an unreadable date or time (`Is not in the expected format`), an
unknown `sortBy` (400 on `sortBy`), `DataIntegrityViolationException` (409 `This conflicts with
existing data`), no permission (403 `You do not have permission`), signed out (401 `Sign in to
continue`), anything else (500 `Something went wrong` with `errorId`, logged). Under `/who/**`, who
answers its own errors (`type` `urn:who:error:<code>`, `code`).

Messages for annotations come from roux's `ContributorValidationMessages`: `@NotBlank` → `Must not be
blank`, `@Size` → `Must be between {min} and {max} characters`, `@Email` → `Must be a valid email
address`, `@NotNull` → `Must not be empty`.

Settings, `RouxProblemsProperties`: `roux.problems.enabled` (true), `roux.problems.api-path-prefix`
(`/api/`; change only with the browser's `configureApi`).

Classes you never reference (seen in stack traces): `ProblemsAdvice`, `SecurityProblemsAdvice`,
`WhoProblemsAdvice`, `PagingProblemsAdvice`, `RootProblemsAdvice`, `ProblemErrorController`.

## Refuse because of what another feature holds

The owning feature declares the check; the referring feature implements it, so `ranks` doesn't
depend on `students`:

```java
@FunctionalInterface
public interface RankRemovalCheck {
  void check(RankEntity rank); // throws ConflictException to refuse
}

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

`RankService` takes `List<RankRemovalCheck>` and runs each before deleting. Keep the foreign key.

## "Already done" is success

A repeat request (mark present twice) must not 500 on the unique constraint: a caught violation
leaves the transaction rollback-only. Use `Idempotent.insert` inside the `@Transactional` method
(it throws `IllegalStateException` without a transaction): it takes an advisory lock on the key,
runs the existence check, then the insert (use `saveAndFlush`). The key starts with the row's kind and
matches the unique constraint's columns. Keep the constraint.

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

## Pitfalls

- A button's request refused with field `errors` shows only the generic detail: refuse buttons with
  `InvariantViolationException` or `ConflictException`.
- A body that doesn't parse, or a wrong JSON type, is Spring's generic 400 with no `errors`; the
  form's schema keeps it from being sent.
- Don't compare versions by hand or catch `DataIntegrityViolationException`.
