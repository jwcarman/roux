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
