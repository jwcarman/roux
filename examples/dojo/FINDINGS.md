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
- Outcome: fixed in 47474e9.

## The guides have no ordered list
- Where: `ranks/` (move up, move down, positions)
- What was clunky: the guides' rank example has no order; reordering (an endpoint per move that
  answers the new list, disabling the buttons at the ends, closing the gap on removal) was worked
  out from scratch.
- roux could: a short "An ordered list" section in tables-and-paging.md, with the ranks as the
  example.
- Outcome: fixed in 10f84aa (guide).

## The app's test helpers are the app's to keep
- Where: `src/testing/route.tsx` (no `Toaster`, unlike `main.tsx`), `src/testing/problems.ts`
- What was clunky: the route harness left out the toaster the app mounts, so a toast from a page
  could not be asserted; and every app hand-writes Problem Detail fixtures that mirror roux's
  answers.
- roux could: ship the problem fixtures (and a route harness) for tests, e.g. a test entry point.
- Outcome: route harness fixed in the app (this commit); fixtures deferred (a roux-test proposal).

## No rule for a date that may not be in the future
- Where: `students/students.ts` (`birthDate`), `shell/dates.ts`, `students/FutureDates`
- What was clunky: the server's `@PastOrPresent` answers `Must not be in the future` (roux's
  ContributorValidationMessages), but it compares with the server's today in the server's zone, and a
  browser is often in another one. A person ahead of UTC picking "today" (or a promotion date of
  today) was refused with 400, in any zone offset and not only near midnight, and the test clock
  could not drive it. The dojo dropped the annotation: the services refuse only a date after the
  server's tomorrow (`LocalDate.now(clock).plusDays(1)`; UTC+14 is the furthest zone ahead) with an
  `InvalidFieldException` in the same words. On the browser, `date()` has no counterpart either: the
  schema adds `.refine(notInTheFuture, { error: NOT_IN_THE_FUTURE })` with the server's text retyped,
  which the skill says never to do, and a `todayIso()` from the browser's clock.
- roux could: `date().notInFuture()` in the browser and a `@NotInFuture` constraint (or a
  `FutureDates.require(clock, field, date)`) on the server, both with the one-day tolerance and the
  app's `Clock`, so the zone problem is solved once.
- Outcome: fixed in 339a715.

## A rule the browser has, the server rewrites: `phone()`
- Where: `students/StudentRequest` (`phone`)
- What was clunky: `phone()` is "digits, spaces and `+ - ( ) .`, at least 7 digits", and the guide
  maps it to "`@NotBlank @Pattern(...)`" without giving the pattern. The server's regex
  (`^(?=(?:\D*\d){7})[\d\s+\-().]+$`) was derived from `rules.ts`; if either side changes, they drift.
- roux could: ship the pattern as a constant (or a `@Phone` constraint) that both sides use, and say
  what it is in the forms guide.
- Outcome: fixed in a9c0eff.

## A filter whose values are not a fixed set has no URL helper
- Where: `routes/_signedIn/students/index.tsx` (`rankId`)
- What was clunky: `enumSearchOf` keeps a filter value only if it is in a fixed list, but the rank
  filter's values are ids loaded at run time, so the route checks `typeof raw.rankId === "string"`
  by hand. The tables guide only shows the enum case.
- roux could: a `stringSearchOf(raw)` (non-blank text or undefined), or say in the guide that this is
  the way.
- Outcome: fixed in d8c25a8.

## A filter with a default is wired by hand on every page
- Where: `students/StudentsPage.tsx` (status chips), as in `members/MembersPage.tsx`
- What was clunky: the list shows active students unless asked, so the chips need
  `value={search.status ?? "ACTIVE"}` and `status === "ACTIVE" ? undefined : status` to keep the
  default out of the URL. `FilterChips` has no notion of a default, and the guide's example has an
  "all" chip instead.
- roux could: `FilterChips defaultValue` (shown selected when the value is undefined, reported as
  undefined when chosen again).
- Outcome: fixed in b87924f.

## Sorting by a computed value needs a view and a second entity
- Where: `students/StudentListEntry`, `student_list` view in `students.xml`
- What was clunky: a `Paginator` sorts by one property of the entity, so "by name" (last then first,
  case-insensitively) and "by current rank's position" had to become view columns, with a read-only
  entity beside the writable one. The paging guide shows only sorts by plain columns.
- roux could: a section in the paging guide on the read-model view (the members directory is the
  example), or sort constants that name more than one property.
- Outcome: fixed in 10f84aa (guide).

## Paginator cannot put nulls last
- Where: `students/StudentService.nullsLast`
- What was clunky: students with no rank must sort last by RANK in both directions, but the
  `Pageable` a `Paginator` builds has no null handling (descending puts nulls first). The service
  rebuilds the `Pageable`'s `Sort` with `Order::nullsLast` inside the query callback.
- roux could: `cfg.nullsLast()` or a per-constant null handling on the sort enum.
- Outcome: deferred (not on the approved round-1 list; the guide notes the workaround).

## Cells that hold a dialog close when the columns are rebuilt
- Where: `students/StudentsPage.tsx`, `ranks/RanksPage.tsx` (`MANAGE_COLUMNS`)
- What was clunky: the page built its columns inside the component (to add the actions column for
  managers). Every re-render made new cell components, which remounted the row's dialog and closed
  it; it showed up as a test that passed alone and failed after another (the rank chips arrived
  while the dialog was opening). The guide even says to build `createSelectColumn`'s columns on
  each render.
- roux could: say in the tables guide that columns are fixed (module-level, one set per permission)
  unless they must read state, and that a cell holding a dialog must not be rebuilt.
- Outcome: fixed in 10f84aa (guide; the dojo's columns were already constants).

## The stale-version check is written in every service
- Where: `students/StudentVersions`, `ranks/RankService.update`
- What was clunky: every edit begins with the same three lines (no version, `InvalidFieldException`
  on `version`; mismatch, `ObjectOptimisticLockingFailureException`). The forms guide has them inline
  in its example, so each service copies them.
- roux could: `Versions.require(entity, requestVersion)` in roux-problems.
- Outcome: fixed in 55c6bef.

## A read-model view does not see unflushed writes
- Where: `students/PromotionService`, `StudentService.detail`
- What was clunky: Hibernate flushes pending changes before a query only when the query touches
  the changed tables, and a query over `student_list` (a view) names no table the promotion
  touched. A promotion saved without `flush` was missing from the detail read straight after it.
  Every write that answers with the read model has to `saveAndFlush` or `flush` by hand; nothing
  says so in the guides, and a missing flush fails only in the answer, not at compile time.
- roux could: say it where the paging guide shows a list over a view, or give the pattern a
  helper (a `@Transactional` read that flushes first).
- Outcome: fixed in 10f84aa (guide).

## A select over ids loaded at run time retypes the server's message
- Where: `students/students.ts` (`promotionRequestSchema.rankId`)
- What was clunky: there is no helper for a required choice among ids known only at run time, so
  the schema is `z.string().min(1, { error: "Must not be empty" }).register(fieldRules, ...)`, which
  retypes the server's `@NotNull` words, as the forms guide itself shows. The skill says never to.
- roux could: a `choice()` (or `id()`) rule beside `oneOf`, with `Must not be empty`.
- Outcome: fixed in 97c8967.

## Referring features need a hook into a rank's removal that roux does not offer
- Where: `ranks/RankRemovalCheck`, `students/PromotionRankRemovalCheck`
- What was clunky: "a rank a student holds may not be removed" belongs to the feature that refers
  to ranks, so the dojo made its own `RankRemovalCheck` interface that `RankService` collects. The
  guides' only answer to "refuse because of what else exists" is a service checking its own
  repository, which would make `ranks` depend on `students`.
- roux could: leave it to the app (it is plain Spring), but say so: the errors guide could show
  this inversion for a `ConflictException` that depends on another feature.
- Outcome: fixed in 10f84aa (guide).

## A new role is written in six files, eight lists
- Where: `AppRoles.AppRole`, `members.xml` (the directory view's role and rank), `InvitableRole`,
  `frontend/src/api.ts` (`Member.role`), `MembersPage` (`MEMBER_ROLES`, chips), `members.ts`
  (`INVITABLE_ROLES`, `ROLE_LABELS`), and the tests that count roles
- What was clunky: adding Instructor meant finding every list of roles by hand: the Java enum, the
  SQL `case` that picks a member's highest role, the browser's union type, the filter chips, the
  labels and the invite choices. Nothing fails to compile when one is missed (the SQL view only
  fails at run time, as an unlisted role shown as Member).
- roux could: a guide section on roles (who's RBAC plus the app's enum), saying which lists a role
  appears in; or a `GET /api/roles` the browser reads instead of a union type.
- Outcome: deferred (not on the approved round-1 list).

## A request enum outside its set is not a field error
- Where: `members/InviteController.InvitationRequest` (`role`)
- What was clunky: the invite role must be Member or Instructor and an owner is never invited, so
  the request takes an `InvitableRole` enum. A body saying `OWNER` is refused when Jackson reads it,
  with the generic 400 and no field, which the errors guide lists as a known gap; the form's select
  cannot send it, but an API caller gets no field name.
- roux could: answer an unknown enum constant in a body as a field error (`Must be one of
  MEMBER, INSTRUCTOR`), as it already does for a query parameter.
- Outcome: fixed in d1a5270.

## Signing in as a role in Playwright means inviting through the UI each time
- Where: `e2e/tests/school.spec.ts` (`invite`), `member.spec.ts`, `members-lifecycle.spec.ts`
- What was clunky: the only way to get a signed-in instructor or member in the browser is the
  owner's invite dialog and the Mailpit link, written out again in each spec. The testing guide's
  Playwright section covers the owner's sign-in only, and the school's tests, which share one
  database, also have to be serial and tag their data to stay apart from other specs.
- roux could: ship `invite(page, request, ...)` and `signedInThrough(browser, link)` helpers in the
  guide's helpers.ts, and say how specs share one database.
- Outcome: deferred (not on the approved round-1 list).

## Auditing ignores the app's Clock
- Where: `persistence/PersistenceConfig` (`auditingDateTimeProvider`)
- What was clunky: `@EnableJpaAuditing` stamps `created_date` from the system clock, not the app's
  `Clock` bean, so a test that set the clock still got real time, and ordering by `created_date`
  (a promotion tie) could only be tested by waiting. The dojo adds a `DateTimeProvider` over `Clock`.
- roux could: wire auditing to the `Clock` bean in the starter, so every app's audit dates follow it.
- Outcome: fixed in 0e5ed85.

## A read-model view's column types must match Hibernate's
- Where: `students.xml` (`student_list`: `null::uuid`, `null::varchar`), `promotions.xml`
  (`r.name::varchar`, `r.colour::varchar`)
- What was clunky: `create or replace view` cannot change a column's type, so replacing the first
  `student_list` (null placeholders) with the real one needed a drop and create, and the joined
  `varchar(40)` columns are cast to plain `varchar` to match the entity. Hibernate's `validate` and
  the view each have their own idea of a column's type; a mismatch shows only at startup or in a query.
- roux could: say in the paging guide's read-model section to cast view columns to the types the entity
  maps and to drop and create the view when a column changes.
- Outcome: fixed in 10f84aa (guide).

## A search still pending when a row is clicked takes the user back to the list
- Where: `StudentsPage` (`DebouncedSearchInput`'s `onSearchChange`), `e2e/tests/school.spec.ts`
- What was clunky: typing a search and clicking a student row within the 300 ms debounce lost the
  click. The router started the navigation, the list stayed mounted while the next route resolved,
  then the debounce fired and `navigate({ search, replace: true })` took the user back to the list.
  CI failed on it.
- roux could: report the pending term when the field loses focus (blur comes on mousedown, before
  the click's navigation, so the navigation lands last).
- Outcome: fixed in 42e0c2e.

## A time of day has no rule helper, no wire format and no input
- Where: `classes/classes.ts` (`time`), `classes/ClassRequest`, `shell/format.ts` (`formatTime`)
- What was clunky: a class starts and ends at a `LocalTime`, and roux has nothing for it. The
  browser's schema is hand-written (`z.string().trim().min(1, ...).regex(/^HH:mm$/, ...)` registered
  in `fieldRules` so the field is marked required), with the server's `Must not be empty` and
  `Is not in the expected format` retyped, which the skill says never to do. The server side needed
  `@JsonFormat(pattern = "HH:mm")` on the request and the response (otherwise Jackson answers
  `17:00:00`, which the `type="time"` input does not hold) and a truncation to the minute. Display
  needed its own `formatTime`, as `formatDate` is the app's. A time the server cannot read (`6pm`)
  is the generic 400 with no field, the known gap in the errors guide.
- roux could: a `time()` rule (`HH:mm`, `Must not be empty` / `Is not in the expected format`), say
  in the forms guide how a `LocalTime` travels (`HH:mm`, with the `@JsonFormat`), and answer an
  unreadable time as a field error as it does for an enum.
- Outcome: deferred (a roux rule helper: the user decides).

## A rule across two fields lives twice, in two shapes
- Where: `classes/classes.ts` (`classRequestSchema.refine`), `classes/ClassService.requireValid`
- What was clunky: "ends after it starts" cannot be a Bean Validation annotation that names `endsAt`
  (a class-level constraint reports on the object, not the field), so the server checks it in the
  service and throws `InvalidFieldException("endsAt", ...)`, while the browser has a `.refine` with
  `path: ["endsAt"]`. The message is retyped on both sides (`Must be after the start time`) with
  nothing to keep them equal.
- roux could: say so in the forms guide's cross-field section (the server half is missing there), or
  offer a constant both sides share, as `Phone.PATTERN` does for the phone rule.
- Outcome: deferred (guide gap; not a code change).

## An optional choice has no helper either
- Where: `classes/classes.ts` (`optionalId`), `ClassFormDialog` (instructor)
- What was clunky: the instructor may be left empty. `oneOf` and `id()` have no `.optional()` (the
  forms guide says so for `oneOf`), so the schema is `z.string().transform(v => v === "" ? null : v)`,
  which also hides the rule from the form (fine here: no required indicator wanted) and makes the
  form's input and output types differ by hand.
- roux could: `id().optional()` and `oneOf(...).optional()` giving `null` for the placeholder, like
  the text helpers.
- Outcome: deferred (small roux addition: the user decides).

## A week grid is plain Chakra plus constants the app writes
- Where: `classes/TimetablePage.tsx`, `classes/classes.ts` (`WEEKDAYS`, `WEEKDAY_LABELS`)
- What was clunky: nothing in roux helps a page that is not a table or a list: the seven columns
  are a `SimpleGrid` of sections, grouping the whole timetable by weekday in the browser, with the
  weekday names (`DayOfWeek`) and their labels written out by hand, and the server sorting by weekday
  and start time in Java because the column is a string. The guides say nothing about a short list
  shown in a custom layout (`SimpleQueryTable` is the only short-list component and it is a table).
- roux could: say in the short-list section that a custom layout reads `useQuery(theQuery)` and
  names `ErrorMessage` for the failure; a `weekdays` constant (names, labels, Monday first) would be
  small but is probably the app's.
- Outcome: deferred (guide note only).

## An optimistic toggle is built from TanStack's parts; the guides do not mention it
- Where: `attendance/attendance.ts` (`markAttendance`, `usePendingPresence`), `attendance/AttendeeToggle.tsx`
- What was clunky: a check-in tap should show at once, and two quick taps must reach the server in
  order. Nothing in roux or the guides covers either. The working shape is a mutation `scope` per
  student (taps queue), the wanted state sent as the variable (`present: boolean`, not a toggle), and
  `useMutationState` over the mutation key to show the last pending variable until the server
  answers. Two traps: `useServerAction` exposes `pending` but not the variables, so the page cannot
  use it to show what was asked; and `meta.refreshes` refetches after every settle, so the
  `onMutate` + `setQueryData` form (the usual recipe) is overwritten by the first answer's refetch
  while a queued second tap is still waiting, and the row flickers back. The queries guide's "never
  refresh by hand" leaves no room for the usual `onSettled` check ("only the last pending mutation
  invalidates").
  Also: a queue of taps is lost if the user leaves the page before it drains (each waits for the one
  before to be answered and refetched), and a double tap is handled before React shows the first,
  so the handler cannot read the rendered value (a ref holds what was last asked); both only showed
  in a real browser (Playwright's `dblclick`), not in Testing Library's awaited clicks.
- roux could: a short "An optimistic toggle" section in queries-and-mutations.md with this recipe
  (scope, wanted-state variable, `useMutationState`), or `useServerAction` returning the pending
  variables.
- Outcome: deferred (a guide section, maybe a hook: the user decides).

## A unique constraint that means "already done" needs a service without a transaction
- Where: `attendance/AttendanceService.markPresent`
- What was clunky: a repeated or racing "present" must be success, not an error. The service finds no
  mark, inserts, and loses the race to the unique constraint, which has to read as "already there".
  But a violation inside a Spring transaction marks it rollback-only, so catching it in the usual
  `@Transactional` service (the ranks service catches it only to rethrow) answers 500 on commit. The
  fix is to make that one service non-transactional so each repository call is its own, with a
  comment saying why, and to prove it with a test that fires twelve threads. The errors guide covers
  a violation as a 409 or a field error, never as success.
- roux could: say so in the errors guide ("a violation you will swallow cannot be caught inside the
  transaction that caused it"), with this shape.
- Outcome: deferred (guide note).

## A client-side filter is written by hand each time
- Where: `attendance/CheckInPage.tsx` (`matches`)
- What was clunky: the tables guide's `SearchInput` example filters with one `includes`, which does
  not match "lovelace ada" against "Ada Lovelace". The check-in list needs every word of the term
  in the whole name, ignoring case, so the page has its own `matches`; the same logic is
  `searchFor` on the server side for paged lists.
- roux could: `matchesWords(text, term)` beside `searchTermOf` in `/paging`, with the server's
  semantics, and use it in the guide's example.
- Outcome: deferred (small roux addition: the user decides).

## A date in the URL has no search helper
- Where: `routes/_signedIn/classes/$classId/check-in.tsx` (`date`), `shell/dates.ts` (`isoDateOf`)
- What was clunky: the check-in page's date is URL state (a reload and a deep link must keep it), and
  `tableSearchOf`, `enumSearchOf` and `idSearchOf` cover everything but a date. A made-up
  `?date=2026-02-30` reached the server as a 400 until the route checked it by hand.
- roux could: `dateSearchOf(raw)` (a real `YYYY-MM-DD` or undefined) in `/paging`.
- Outcome: deferred (small roux addition: the user decides).

## A list in a fixed order has no way to say so
- Where: `attendance/StudentAttendanceService` (`NewestFirst`), `attendance/attendance.ts` (`attendancePage`)
- What was clunky: a student's attendance is newest first, always, and the client never sends a sort
  (`InfiniteList` passes only `pageIndex`). A `Paginator`'s default sort has no direction and the
  request's absent `sortDirection` means ascending, so the first try listed the oldest class first.
  The fix is a private `PageSpec` record that forces `sortBy=DATE` and `DESC` over the request's page
  and size, plus a sort enum with one constant that nothing can choose, and `tiebreaker("createdDate", "id")`
  to order two classes of one day. The paging guide's InfiniteList example assumes "the order the
  endpoint gives" without showing an endpoint that gives one.
- roux could: say in the guide how an endpoint pins its order (the `PageSpec` wrapper), or a
  `cfg.defaultDirection(DESC)` in jpa-utils.
- Outcome: deferred (guide note; the paginator is jpa-utils').

## Going back to the page after sign-in is the app's to write, in four places
- Where: `shell/returnTo.ts`, `routes/_signedIn.tsx`, `shell/guards.ts`, `shell/LinkLanding.tsx`, `shell/SignIn.tsx`
- What was clunky: a signed-out reload of a deep link (`/classes/<id>/check-in?date=...`) is served the
  shell and sent to sign-in, but signing in always landed on Home, so the visitor lost the page and its
  date. Nothing in roux or the guides covers it. The emailed link opens in a new tab, so the place
  cannot live in the URL or in session storage: it is kept in local storage by the guard and taken by
  the link's landing page and the passkey button, with a check that only an in-app path is ever
  returned to (an open redirect otherwise), and with storage failures swallowed.
  The link's landing page (from the template) also strips the token with
  `history.replaceState(null, "", window.location.pathname)`, and React re-ran that effect as the page
  was left, which rewrote the next page's address without its search: found only by Playwright, then
  reproduced in Vitest with the browser's own history (`renderRoute(..., { browserHistory: true })`).
- roux could: say how in the getting-started guide's sign-in section, or ship `rememberReturn` /
  `takeReturn` with the session provider (who owns the sign-in pages, so possibly who's).
- Outcome: deferred (the user decides whether it is roux's or who's).

## The app's CLAUDE.md taught `invalidateQueries`
- Where: `examples/dojo/CLAUDE.md` ("Rules that are easy to miss")
- What was clunky: it still said to refresh what a change affects with `invalidateQueries`, which the
  skill and the queries guide forbid (`meta.refreshes` only works on roux's client and covers refusals).
  An agent following the app's own notes would have written the wrong form, as in the README finding.
- roux could: nothing more than the README finding's answer: an app's notes point at the guides.
- Outcome: fixed in this commit.

## who had no invitation primitive, so the dojo wrote one
- Where: `members/InvitationService` (removed), `InvitationsController`
- What was clunky: inviting was an identity, a role, a credential, a profile row and a link issued
  in a transaction of its own, written by hand with a `TransactionTemplate` and the ordering
  (commit, then send) to get right.
- roux could: nothing; who could offer it.
- Outcome: fixed by who 0.21.0 (`InvitationService.invite`, `IdentityInvited`) and this commit: the
  dojo keeps a thin endpoint for its own rules and a listener for the profile row.

## Listing a member's passkeys needed an app endpoint
- Where: `passkeys/PasskeysController` (removed)
- What was clunky: who removed a passkey but did not list them, so the app wrote `GET /api/passkeys`
  and a client type for it.
- roux could: nothing; who could serve it.
- Outcome: fixed by who 0.21.0 (`GET /who/me/passkeys`, `who.me.passkeys.list()`) and this commit.

## A library's public paths had to replace who's bean
- Where: `RouxSpaAutoConfiguration.SpaPublicPaths`
- What was clunky: to open the shell and `/assets/**`, roux defined its own `WhoPublicPaths`, a
  copy of who's construction, which dropped every other contributor's paths.
- roux could: contribute a path instead of replacing the bean.
- Outcome: fixed by who 0.21.0 (`WhoPublicPathContributor`) and this commit.
