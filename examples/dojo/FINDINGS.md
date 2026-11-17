# Findings

What building the dojo showed about roux: one entry per finding, in the order found.

## The README taught a superseded form API
- Where: `examples/dojo/README.md` (Forms and Feedback) and `CLAUDE.md`, copied from the template
- What was clunky: the README described forms built with `useAppForm`, validators written by hand
  and `showProblem`, and `FormDialog` holding a `useAppForm` form. roux-web has no `showProblem`,
  and the dojo's forms (`InviteForm`, `ProfileForm`) use `useSchemaForm` with roux's rule helpers.
  An agent reading the README would have learned the old way.
- roux could: describe its forms in the app's docs by pointing at roux's guides (Forms, Feedback)
  rather than re-explaining them, so an app's docs cannot drift from the API.
- Outcome: fixed in bae446d

## NotFoundException took no format pattern
- Where: `ranks/RankNotFoundException`
- What was clunky: its three siblings take `(pattern, args...)`; `NotFoundException` took only a
  finished message, so the first rank code guessed the pattern form and did not compile.
- roux could: give it the same constructor.
- Outcome: fixed in 54ca14b.

## SimpleQueryTable takes a key and a function, not the module's query
- Where: `ranks/RanksPage.tsx`
- What was clunky: the resource module already has `ranksQuery` (`queryOptions`), but
  `SimpleQueryTable` wants `queryKey` and `query: () => Promise<T[]>`, so the page calls
  `ranksApi.list()` itself, which the skill and queries guide say a component never does, and the
  fetch loses its abort signal. The tables guide's own example does the same. `QueryTable`, `InfiniteList` and `InfiniteSelect` had the same
  shape, each slightly different.
- roux could: accept the query's options (`query={ranksQuery}`), as `useQuery` does.
- Outcome: fixed in 37cfe22.

## A client route is written in three places
- Where: `routes/_signedIn/ranks.tsx`, `SpaController.ROUTES`, `who.security.public-paths`
- What was clunky: a new page needs its route file, the server's SPA route list and who's public
  paths, or a signed-out reload of `/ranks` gets a 401. SpaRoutingTest catches a missing public
  path, but only after the fact.
- roux could: serve the shell for any GET that accepts HTML and is not under `/api` or `/who`
  (a `roux-spa` module), so the route file is the only place.
- Outcome: deferred (the roux-spa proposal at the end of round 1).

## The guides have no ordered list
- Where: `ranks/` (move up, move down, positions)
- What was clunky: the guides' rank example has no order; reordering (an endpoint per move that
  answers the new list, disabling the buttons at the ends, closing the gap on removal) was worked
  out from scratch.
- roux could: a short "An ordered list" section in tables-and-paging.md, with the ranks as the
  example.
- Outcome: deferred (guide work at the end of round 1, from the code as built).

## The app's test helpers are the app's to keep
- Where: `src/testing/route.tsx` (no `Toaster`, unlike `main.tsx`), `src/testing/problems.ts`
- What was clunky: the route harness left out the toaster the app mounts, so a toast from a page
  could not be asserted; and every app hand-writes Problem Detail fixtures that mirror roux's
  answers.
- roux could: ship the problem fixtures (and a route harness) for tests, e.g. a test entry point.
- Outcome: route harness fixed in the app (this commit); fixtures deferred (a roux-test proposal).

## No rule for a date that may not be in the future
- Where: `students/students.ts` (`birthDate`), `shell/dates.ts`, `StudentRequest` (`@PastOrPresent`)
- What was clunky: the server's `@PastOrPresent` answers `Must not be in the future` (roux's
  ContributorValidationMessages), but `date()` has no counterpart. The schema adds
  `.refine(notInTheFuture, { error: NOT_IN_THE_FUTURE })` with the server's text retyped in the app,
  which the skill says never to do, and a `todayIso()` that reads the browser's clock and zone (the
  server's clock may be on another day near midnight).
- roux could: `date().notInFuture()` (and `.notInPast()`), with the server's words, beside `.min`/`.max`.
- Outcome: deferred (a roux rule helper; the dojo's promotion date needs it too).

## A rule the browser has, the server rewrites: `phone()`
- Where: `students/StudentRequest` (`phone`)
- What was clunky: `phone()` is "digits, spaces and `+ - ( ) .`, at least 7 digits", and the guide
  maps it to "`@NotBlank @Pattern(...)`" without giving the pattern. The server's regex
  (`^(?=(?:\D*\d){7})[\d\s+\-().]+$`) was derived from `rules.ts`; if either side changes, they drift.
- roux could: ship the pattern as a constant (or a `@Phone` constraint) that both sides use, and say
  what it is in the forms guide.
- Outcome: deferred.

## A filter whose values are not a fixed set has no URL helper
- Where: `routes/_signedIn/students/index.tsx` (`rankId`)
- What was clunky: `enumSearchOf` keeps a filter value only if it is in a fixed list, but the rank
  filter's values are ids loaded at run time, so the route checks `typeof raw.rankId === "string"`
  by hand. The tables guide only shows the enum case.
- roux could: a `stringSearchOf(raw)` (non-blank text or undefined), or say in the guide that this is
  the way.
- Outcome: deferred.

## A filter with a default is wired by hand on every page
- Where: `students/StudentsPage.tsx` (status chips), as in `members/MembersPage.tsx`
- What was clunky: the list shows active students unless asked, so the chips need
  `value={search.status ?? "ACTIVE"}` and `status === "ACTIVE" ? undefined : status` to keep the
  default out of the URL. `FilterChips` has no notion of a default, and the guide's example has an
  "all" chip instead.
- roux could: `FilterChips defaultValue` (shown selected when the value is undefined, reported as
  undefined when chosen again).
- Outcome: deferred.

## Sorting by a computed value needs a view and a second entity
- Where: `students/StudentListEntry`, `student_list` view in `students.xml`
- What was clunky: a `Paginator` sorts by one property of the entity, so "by name" (last then first,
  case-insensitively) and "by current rank's position" had to become view columns, with a read-only
  entity beside the writable one. The paging guide shows only sorts by plain columns.
- roux could: a section in the paging guide on the read-model view (the members directory is the
  example), or sort constants that name more than one property.
- Outcome: deferred (guide work).

## Paginator cannot put nulls last
- Where: `students/StudentService.nullsLast`
- What was clunky: students with no rank must sort last by RANK in both directions, but the
  `Pageable` a `Paginator` builds has no null handling (descending puts nulls first). The service
  rebuilds the `Pageable`'s `Sort` with `Order::nullsLast` inside the query callback.
- roux could: `cfg.nullsLast()` or a per-constant null handling on the sort enum.
- Outcome: deferred.

## Cells that hold a dialog close when the columns are rebuilt
- Where: `students/StudentsPage.tsx`, `ranks/RanksPage.tsx` (`MANAGE_COLUMNS`)
- What was clunky: the page built its columns inside the component (to add the actions column for
  managers). Every re-render made new cell components, which remounted the row's dialog and closed
  it; it showed up as a test that passed alone and failed after another (the rank chips arrived
  while the dialog was opening). The guide even says to build `createSelectColumn`'s columns on
  each render.
- roux could: say in the tables guide that columns are fixed (module-level, one set per permission)
  unless they must read state, and that a cell holding a dialog must not be rebuilt.
- Outcome: fixed in the dojo (columns are module constants); guide note deferred.

## The stale-version check is written in every service
- Where: `students/StudentVersions`, `ranks/RankService.update`
- What was clunky: every edit begins with the same three lines (no version, `InvalidFieldException`
  on `version`; mismatch, `ObjectOptimisticLockingFailureException`). The forms guide has them inline
  in its example, so each service copies them.
- roux could: `Versions.require(entity, requestVersion)` in roux-problems.
- Outcome: deferred.

## A read-model view does not see unflushed writes
- Where: `students/PromotionService`, `StudentService.detail`
- What was clunky: Hibernate flushes pending changes before a query only when the query touches
  the changed tables, and a query over `student_list` (a view) names no table the promotion
  touched. A promotion saved without `flush` was missing from the detail read straight after it.
  Every write that answers with the read model has to `saveAndFlush` or `flush` by hand; nothing
  says so in the guides, and a missing flush fails only in the answer, not at compile time.
- roux could: say it where the paging guide shows a list over a view, or give the pattern a
  helper (a `@Transactional` read that flushes first).
- Outcome: deferred (guide work).

## A select over ids loaded at run time retypes the server's message
- Where: `students/students.ts` (`promotionRequestSchema.rankId`)
- What was clunky: there is no helper for a required choice among ids known only at run time, so
  the schema is `z.string().min(1, { error: "Must not be empty" }).register(fieldRules, ...)`, which
  retypes the server's `@NotNull` words, as the forms guide itself shows. The skill says never to.
- roux could: a `choice()` (or `id()`) rule beside `oneOf`, with `Must not be empty`.
- Outcome: deferred.

## Referring features need a hook into a rank's removal that roux does not offer
- Where: `ranks/RankRemovalCheck`, `students/PromotionRankRemovalCheck`
- What was clunky: "a rank a student holds may not be removed" belongs to the feature that refers
  to ranks, so the dojo made its own `RankRemovalCheck` interface that `RankService` collects. The
  guides' only answer to "refuse because of what else exists" is a service checking its own
  repository, which would make `ranks` depend on `students`.
- roux could: leave it to the app (it is plain Spring), but say so: the errors guide could show
  this inversion for a `ConflictException` that depends on another feature.
- Outcome: deferred (guide note).
