# The roux plugin and the dojo example: building an app on roux to find where it is clunky

Date: 2026-11-17. Status: draft for review. Builds on [the roux design](2026-11-14-roux-design.md) and
[0.2.0](2026-11-14-roux-0.2.0-web-design.md).

## Why

roux has been tried on one list and one form (the template's Customers trial). Before the generator
(stage 2) freezes patterns into templates, roux needs an app with more shapes in it, built the way roux
says to build one, so we find where roux is missing something or makes the right way awkward. Each
clunky spot is either fixed in roux or written down as a known gap.

The app is a martial arts school ("dojo"): a domain the user knows from dojo and martialware, so a
screen can be judged clunky for the people using it, not only for the code.

roux is used mostly by agents (Claude Code at a developer's terminal, and later noir's builders), so
roux also ships a Claude Code plugin with a `roux` skill, as who does. The dojo is built with the
plugin loaded: a clunky spot may be roux's code or the skill's guidance, and both get fixed.

## Goals

- A Claude Code plugin for roux, in the roux repository, with a `roux` skill whose references are
  roux's own guides.
- Guides for roux (`docs/guides/`), which roux does not have yet.
- An app in the roux repository, built against roux's current code, that a person would actually use.
- A findings log: every place the app had to work around roux, repeat itself, or reach for something
  roux does not offer, with what became of it.
- roux fixes for what the app finds, made as it goes.
- The seed of the roux design's `reference/` app.

## Non-goals

- The generator. Nothing here is generated; the app is what the generator will later learn from.
- noir. noir keeps its own generators and template until a noir spec moves it onto roux.
- A design system or component gallery. Chakra UI is the design system; the app is an app.
- Feature completeness as a dojo product (billing integrations, scheduling rules, notifications).

## Anti-goals

- **Hiding friction.** A workaround written quietly in the app, without a findings entry, defeats the
  point. The app may work around roux; it may not do so silently.
- **Reaching into roux.** The app uses only roux's public API (Java packages roux documents, the
  `@jwcarman/roux-web` entry points). Importing an internal is a finding, not a solution.
- **Tuning roux to the dojo.** A fix must make sense for any roux app. A dojo-only need stays in the app.

## Approaches considered

- **A. In the roux repository, as `examples/dojo`, on roux's current code** (chosen by the user). A roux
  fix and the app change that needs it land in one commit, and a roux change that breaks the app fails
  CI at once. Costs CI time, and the copied shell drifts from `noir-app-template`.
- B. Its own repository, on released roux versions: exactly an outside app's view, but every roux fix
  waits on a release or local linking. Too slow for a loop whose point is fast fixes.
- C. Inside `noir-app-template`: rejected, since noir copies the template for every new app.

Who builds it was also settled: by hand, in these sessions, not by noir (moving noir onto roux is its
own large project).

## Design

### The plugin (built first)

Shaped like who's (`jwcarman/who`, `plugins/who`):

- `.claude-plugin/marketplace.json` at the repository root, listing one plugin, `roux`, from
  `./plugins/roux`. Installed with `/plugin marketplace add jwcarman/roux`.
- `plugins/roux/.claude-plugin/plugin.json`: name, description, author `jwcarman`, homepage,
  repository, licence Apache-2.0, keywords.
- `plugins/roux/skills/roux/SKILL.md`: when to use it (the project depends on `org.jwcarman.roux` or
  `@jwcarman/roux-web`, or the user asks to build a list, form, page or endpoint in a roux app), what
  roux is, how to look at a project first (versions, which modules and entry points it uses), the
  conventions (records over the wire, one module per resource with its API functions, queries and
  mutations, `useSchemaForm`, rule helpers, Problem Details), and a table pointing each task at its
  guide. It tells the agent to read the guide before writing code and to quote APIs from it, not from
  memory.
- `plugins/roux/skills/roux/references/`: copies of `docs/guides/*.md`, made by
  `plugins/roux/sync-references.sh`. CI fails when the copies are stale.
- `docs/guides/`: one guide per area, written from roux's code and the template's use of it:
  getting started (adding roux to an app, Java and web), errors (Problem Details, the exceptions,
  what the browser shows), the API client (`getJson`, `sendJson`, `path`, `baseUrl`, params,
  session loss), queries and mutations (`createQueryClient`, `meta.refreshes`, one module per
  resource), forms (`useSchemaForm`, rule helpers and their messages, `FormDialog`, page forms,
  conflicts), tables and paging (`PageDto`, sort, search, filter chips, infinite lists), feedback
  (toasts, not-found and error pages, confirm on remove), testing (contract fixtures, MSW, the
  template's test helpers). The two READMEs shrink to an overview that links them.
- `plugins/roux/skills/roux/evals/`: evals in the format the `skill-creator` skill uses (and
  `claude plugin eval` reads), each a task an agent
  does in the dojo (for example "add a notes field to students, editable in the dialog"), run in a
  fresh copy of `examples/dojo` at the commit the eval names.

The plugin's version follows roux's (one version for roux's parts, roux decision 4); its references
describe the roux code beside it.

### Proving the skill helps

A skill can read well and change nothing, and it costs context every time it loads. So it is measured,
as noir measured its generators: with the skill against without it.

- **Two arms.** Each eval runs with the roux plugin and without it. Without it, the agent has only
  what any app has: roux in its dependencies (the jars, `node_modules`, doc comments).
- **Three runs per arm**, since one run varies by about ±30% (noir's generator A/B). The
  `skill-creator` skill's benchmark runs the arms, grades them and aggregates mean and spread.
- **What is compared:** correctness (build and tests pass); doing it roux's way, checked by script
  where it can be (uses `useSchemaForm` and the rule helpers, no retyped server messages, no
  hand-rolled `fetch`, nothing internal imported from roux); and cost (turns, tokens, time).
- **The bar:** the skill earns its place if the with-skill arm passes more often, or as often for less.
  A guide section that moves neither is cut; a failure that recurs gets a guide fix and a re-run.
- **When:** when the plugin is first done, after each dojo round, and whenever the skill or guides
  change. Results are kept in `plugins/roux/evals/results/<date>/` (`benchmark.md`), so the numbers
  can be followed over time.

Expect a small gap at first: a small app is easy to work in without help. It should widen as the app
grows.

### Order of work

1. The plugin: guides, skill, marketplace, sync script.
2. The dojo's starting point (the copied shell, below), which the evals need.
3. The evals and the first with/without benchmark.
4. Round 1 of the dojo, built with the plugin; then the benchmark again.

This design's first plan covers 1 to 3. Round 1 gets its own plan.

### Where the dojo lives and how it builds

- `examples/dojo/`: a Spring Boot app (Maven module in the roux reactor) with its `frontend/` and
  `e2e/` beside it, laid out as the template is.
- It depends on roux's modules at the reactor's version (`0.3.0-SNAPSHOT`) and on
  `@jwcarman/roux-web` through the npm workspace (`web/package.json` gains the example's frontend), so
  it always builds against the roux code beside it.
- It is not roux's product code: SonarCloud and roux's coverage figures leave it out.
- It is never published: Maven deploy and the release workflow skip it, and its `package.json` is
  private.
- CI: the example compiles and runs its Java and Vitest tests on every push and pull request; its
  Playwright suite runs on pushes to `main` only.

### The starting point

A copy of the template's `customers-trial` branch (at 003ce74), then:

- Customers removed (entity, controller, screens, tests, changelog, permissions).
- noir removed: the `noir-gen` markers, `.noir/`, `scripts/trace.sh`, noir wording in `CLAUDE.md` and
  docs. The template's design docs stay behind.
- Renamed: package `org.jwcarman.roux.examples.dojo`, application class `DojoApplication`, app name
  "Dojo".
- Kept: sign-in (who, passkeys), members and invitations, Appearance, Settings, activity, the SPA
  shell, Docker Compose, the E2E and CSP tests.

The copy is commit one, and builds green, before any dojo feature.

### Round 1: students and ranks

**Ranks (the school's belt ladder).** The owner keeps an ordered list of ranks: a name (required, up to
40 characters, unique in the school) and a colour. The owner adds, renames and reorders them (move up,
move down) and removes one no student holds or has held. A new school starts with none.

**Students.** A student has a first and last name (required, up to 80 each), an email (optional, up to
320), a phone (optional, up to 30), a date of birth (optional), a start date (required, default today)
and a status (Active, Inactive). The Students page lists them, paged, searchable by name and email,
filterable by status and current rank, sortable by name, start date and rank. Add and edit are dialogs.
Deactivating asks first.

**A student's page** (`/students/$id`) shows the student's details, their current rank, and their rank
history (newest first). An instructor promotes a student from this page: a rank and a date (default
today). The current rank is the one from the latest promotion. A mistaken promotion can be removed
(asks first).

Students do not sign in; the app's users are the school's staff (members).

**Roles.** Owner: everything. Instructor (new role): reads and manages students and promotions, reads
ranks. Member: reads students and ranks.

Round 1 exercises what the Customers trial did not: a detail page, a child list, a relationship, an
ordered enumeration the owner edits, reordering, a computed value, delete with confirm, a second role.

### Later rounds (each gets a short design when it starts)

2. Classes and attendance: a weekly timetable, a check-in screen (many students, one tap each), a
   student's attendance on their page.
3. Memberships and payments: plans with prices, a student's membership, payments recorded, totals.

### The findings log

`examples/dojo/FINDINGS.md`, one entry per finding:

```
## <short name>
- Where: <app file or screen>
- What was clunky: <what the app had to do>
- roux could: <the change>
- Outcome: fixed in <commit> | deferred (<why>) | not roux's (<why>)
```

A finding is fixed in roux in the same round when it is small and plainly general, as its own commit
with roux's tests (100% coverage, 100% Stryker on roux-web) before the app commit that uses it. A
larger one is deferred and listed for the user to decide.

### Building with the plugin

The dojo's features are built in sessions with the roux plugin installed from the working copy, and
the skill is followed as written. When the skill is wrong or silent, that is a finding (`roux could:`
names the guide or skill change), fixed in the same round like a code finding.

### The newcomer check

After each round's features, a fresh subagent that has never seen roux's source builds one small change
in the example (for example "add a belt-test date to promotions") with only the roux plugin installed:
no roux source, no design docs. Where it stalls, guesses wrong or reads roux's source becomes a findings entry. It runs only
with the user's go-ahead for that round.

## Constraints

- roux's stack (roux design decision 8); no new libraries in the example that roux does not already
  bring, unless a finding says roux should bring them.
- Records over the wire as roux decision 12 names them: `Student`, `StudentDetail`, `StudentRequest`,
  `PageDto<Student>`.
- The example's tests follow the template's style (Java with `@AppTest`, Vitest with MSW, Playwright).
  Its coverage is reported, not gated; mutation testing does not run on it.
- No roux release is needed to finish a round; fixes ride the next release as usual.

## The plugin is done when

- `docs/guides/` covers every public entry point of roux's Java modules and of `@jwcarman/roux-web`.
- The marketplace installs, the skill triggers in a roux app, and the references match the guides.
- Its evals run in both arms, three times each, against the dojo's copied shell, and the first
  `benchmark.md` is committed with an analysis of what the skill changed.

## Round 1 is done when

- The copied shell and round 1's features build green: Java, Vitest and Playwright including CSP.
- `FINDINGS.md` has an entry for every workaround in the app, each with an outcome.
- roux's own bar still holds (100% coverage, 100% Stryker on roux-web, the release-profile build).

## Left to the builder

- The Maven wiring (a profile or a plain module), the frontend build plugin's settings, the CI job's
  shape.
- Liquibase layout, entity and service structure, following the template.
- The look of the rank colour (a swatch, a badge) and of the reorder controls.
