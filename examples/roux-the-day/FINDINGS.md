# Roux The Day: findings

Roux The Day is the example roux grows from: a team's shared planner, built in rounds. Each entry
below is something that was hard, missing or clunky while building it, what roux could do about
it, and where in the app it shows. What more than one app would need is extracted into roux.

## Round one: items, and a paginator

- **Copying the template by hand.** The app started as `rsync` of `template/` plus renaming
  `roux-app` in nine files (`go.mod`, imports, the Makefile's binaries, telemetry's service name,
  `APP_NAME`, the package names) and repointing `file:` paths one level deeper. create-roux-app
  does this for a new app, but not inside roux's own repository. *roux could:* let
  create-roux-app write into `examples/` with the runtime and roux-web linked from the repo.
- **No type for a day or a time of day.** Go has none (Java has `LocalDate` and `LocalTime`), so
  a day travels as a `time.Time` at midnight UTC and a time of day as `pgtype.Time`, each
  parsed and formatted by hand (`internal/items/input.go`, `items.go`'s `clock`). *roux could:*
  ship `civil.Date` and `civil.Time` types that read and write JSON (`2026-11-24`, `10:30`) and
  Postgres, with "today in the team's zone" built in.
- **"Today" in the team's zone, by hand.** `Kit.Organization().TimeZone` is a string; the
  service loads the zone and takes the date itself, and works out Monday
  (`internal/items/service.go`). *roux could:* `organization.Today(clock)` and a week helper.
- **Is this person an active member?** The app reads `roux_user` and `roux_identity` itself to
  check assignees (`mustBeActive`), and again for a detail's names. *roux could:* a users
  function for "these ids are active members", and a small join-friendly view of names.
- **A test needs a team.** The users package has a fixture with people and roles, but it is
  not exported, so the items tests rebuild one (`internal/items/fixture_test.go`): creating
  the app's `USER` role by hand (it lives in `cmd/server`'s migration), then migrating items
  after it. *roux could:* a `rouxtest` package: a server with users, roles and a
  `Person(name, role)` helper.
- **Moving a test's clock signs people out.** Days ahead outlast the session's idle timeout,
  so a test signs in again after each move (`TestTheWeekRunsMondayToSunday`). Correct, but a
  surprise the first time. *roux could:* say so on `authntest.Clock.Advance`.
- **The paginator refuses quotes in its columns.** So formatting a value in SQL
  (`to_char(day, 'YYYY-MM-DD')`) is not possible in `Columns`; the scanner formats instead, or
  the view does it. Fine, but worth saying in the paginator's docs when it is extracted.
- **The app's permissions are added by hand.** `permissions.gen.ts` says roux generates it, but
  nothing generates an app's own permissions (`items.read`, ...), so they were typed in, and can
  drift from `internal/items`. *roux could:* the Go port of the permissions generator (a test
  that writes the file from every module's constants, and fails when it is stale).
- **No field for choosing several people.** roux-web's `FormField` frames one control: checkboxes
  inside it share the field's id, so every label ticked the first box. The app built
  `AssigneesField` on a Chakra fieldset (`frontend/src/items/AssigneesField.tsx`). *roux could:*
  a `CheckboxGroupField` (or a multi-select over a query) with the form's error rules.
- **Sharing fields between an add dialog and an edit page.** TanStack's `withForm` does not accept
  roux's `SchemaForm`, so `ItemFields` is a plain component taking `SchemaForm<typeof
  itemSchema>`. Fine, but roux-web's docs could say that is the way.
- **A dialog's button is replaced once its data loads.** `AddItem` shows a disabled button until
  the team loads, then a different one; a test that held the first never saw it enable. The
  template's invite test re-queries; worth a line in roux-web's testing guide.
- **A conditional time field.** "All day" hides the time, and the schema needs a `refine` so a
  time is required only when shown. Works with roux-web's rules; a recipe would save the hunt.
- **Server and client page sizes differ.** roux-web's tables default to 25 a page; Go's `page`
  defaults to 20. Harmless (the client always sends its size), but surprising in a test.
- **No lint gate in the app.** roux's lint config (`web/lint-tools`) expects roux-web's tsconfig
  layout and skips `template/`, so neither the template nor this app is linted.
  *roux could:* give the template (and so every app) the same lint gate roux-web has.
- **End-to-end specs share one database.** The template's specs find people by name ("ada"), so
  this app's spec had to pick a name none of them search for. *roux could:* say in the e2e
  guide that each spec's people carry a stamp, and stamp the template's own.
- **Duplicate detection and a copied template.** The app is mostly the template, so Sonar's
  duplicate detection skips `examples/**` (`sonar-project.properties`); everything else is
  checked there as it is anywhere.

## Extract into roux (next, in order)

1. ~~**The paginator**~~ (done: `page.New`) (`internal/paging`) into roux's `page` package: `Where`/`WhereIf`, sorts
   with a tiebreaker, jpa-utils-style search, and `Check` at start. Proven by the items list; its
   docs say why columns may not quote.
2. **Civil dates and times**, with the organization's "today" and week.
3. ~~**A rouxtest package**~~ (done: `rouxtest`): a team with people and roles, for an app's own tests.
4. ~~**Active members by id**~~ (done: `users.MustBeActive`, `users.Members`), in users, for any feature that assigns people.
5. **A checkbox group field** in roux-web's form kit.
6. **The app's permissions generated**, as roux's own are.
7. **A lint gate in the template**, and so in every app.
