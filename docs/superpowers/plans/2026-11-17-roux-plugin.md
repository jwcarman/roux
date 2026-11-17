# roux plugin, dojo shell and first benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Claude Code plugin for roux whose `roux` skill reads roux's own guides, give it a real
app to be tried in (`examples/dojo`, the copied template shell), and measure three arms: roux with the
skill, roux without it, and the same stack with no roux at all.

**Architecture:** Guides in `docs/guides/` are the source; a sync script copies them into the skill's
`references/`, and a check script fails CI when a public roux name is missing from the guides or the
copies are stale. The dojo is a Maven module of the roux reactor (child of `roux-parent`, in a profile
the release build leaves out) whose frontend links `web/roux-web` with `file:`. Evals are
`skill-creator` case folders; a fixture script builds a copy of the dojo outside the repository on
packed roux artifacts, so neither arm can read roux's source.

**Tech Stack:** Markdown, Bash, Node 22+ (`.mjs`, no new dependencies), Maven, the template's stack
(Spring Boot 4.1, Java 25, React 19, Chakra v3, TanStack, Vitest, Playwright).

**Spec:** `docs/superpowers/specs/2026-11-17-dojo-example-design.md` (sections "The plugin", "Proving
the skill helps", "Where the dojo lives", "The starting point", "The plugin is done when"). Round 1 of
the dojo is out of scope.

## Global Constraints

- roux commits go straight to `main`; no pull requests. Every commit ends with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_014GnzDJxXVyWy4Ec18M195n`.
- Never suppress warnings (no `@SuppressWarnings`, `eslint-disable`, …). No star imports.
- roux's own bar is unchanged: roux-web 100% coverage and 100% Stryker; `./mvnw -P release -B install
  -DskipTests -Dgpg.skip` exits 0. This plan changes no roux runtime code.
- Guides describe roux as it is on `main` (0.3.0-SNAPSHOT, same API as 0.2.0). Every signature,
  property and message in a guide is copied from the source, never from memory.
- Guide style: plain, idiomatic, no marketing; the reader is a developer or an agent building a roux
  app. Examples use the dojo's domain (students, ranks) or the template's (members), not `foo`.
- The dojo is never published: `maven.deploy.skip`, `skipPublishing`, `sonar.skip` all `true`;
  frontend `package.json` `"private": true`.
- Package `org.jwcarman.roux.examples.dojo`, application class `DojoApplication`, app name "Dojo".
- Record naming over the wire: `<Thing>`, `<Thing>Detail`, `<Thing>Request`, `PageDto<Thing>`.

## Review Focus

1. **A guide names an API that does not exist or has another signature.** Reviewers check every code
   sample against the source file; Tasks 2-4 each end with a step that does this mechanically for
   names (the check script) and by reading for signatures.
2. **The dojo frontend loads two copies of React** through the `file:` link, so roux's hooks throw
   "Invalid hook call". Task 6 pins it with a Vitest test that renders a roux form in the dojo and
   with `npm ls react` showing one copy.
3. **The release build picks up the dojo** (tries to build, sign or publish it). Task 6 verifies the
   release-profile reactor does not list it.
4. **The baseline arm can read roux's source** (a relative path back into the repository, or a
   symlink), which would make the comparison meaningless. Task 7 checks the fixture holds no path
   into the roux checkout and no symlink.
5. **`versions:set` at release time leaves the dojo on the old snapshot**, so `main` breaks after the
   next bump. Task 6 verifies the dojo inherits the reactor version.

---

### Task 1: Guide check and reference sync

**Files:**
- Create: `plugins/roux/scripts/check-guides.mjs`, `plugins/roux/scripts/sync-references.sh`,
  `docs/guides/README.md` (an index, one line per guide)
- Modify: `.github/workflows/ci.yml` (a `plugin` job: `node plugins/roux/scripts/check-guides.mjs`)

**Interfaces:**
- Produces: `node plugins/roux/scripts/check-guides.mjs` exits 0 when (a) every name exported from each
  `web/roux-web/src/<entry>/index.ts` (`problem`, `api`, `paging`, `table`, `feedback`, `form`, types
  included) and every public top-level type under `runtime/*/src/main/java` appears in backticks in
  some `docs/guides/*.md`, and (b) `plugins/roux/skills/roux/references/` holds exactly the files of
  `docs/guides/` except `README.md`, byte for byte. Otherwise exits 1 and prints one line per problem:
  `missing from guides: <name> (<source file>)` or `stale reference: <file>`.
- Produces: `plugins/roux/scripts/sync-references.sh` replaces `references/` with copies of
  `docs/guides/*.md` (not `README.md`), as who's `plugins/who/sync-references.sh` does.

- [ ] **Step 1:** Write `check-guides.mjs` (Node built-ins only; parse `export { … }` lists and
  `export … from` lines with a regex, skipping `type ` prefixes to get the bare name; Java: files whose
  top-level type is `public`). Exclude `ProblemsRuntimeHints` and the autoconfiguration class (wiring,
  not API) by an explicit list at the top of the script with a comment saying why.
- [ ] **Step 2:** Run it with `docs/guides/` holding only `README.md`. Expected: exit 1, a
  `missing from guides:` line for `useSchemaForm`, `getJson`, `NotFoundException` among others.
- [ ] **Step 3:** Write `sync-references.sh`; run it; run the check again: still exit 1 for missing
  names, no `stale reference` lines.
- [ ] **Step 4:** Add the CI job (checkout, setup-node `lts/*`, run the check). It will fail until
  Task 4; commit it in Task 4's commit instead, so `main` stays green. Commit the scripts and the
  index now.

```bash
git add plugins/roux/scripts docs/guides/README.md
git commit -m "build(plugin): guide coverage check and reference sync"
```

### Task 2: Guides: getting started, errors, the API client

**Files:**
- Create: `docs/guides/getting-started.md`, `docs/guides/errors.md`, `docs/guides/api-client.md`

**Interfaces:**
- Consumes: Task 1's check script.
- Produces: guides later tasks and the skill link to by these file names.

Content, from the source (`runtime/`, `web/roux-web/src/`, `contracts/`) and from how the template
(`~/IdeaProjects/noir-app-template`, branch `customers-trial`) uses it:

- **getting-started:** requirements (roux design decision 8); adding `roux-bom` and
  `roux-spring-boot-starter` (and `who`, `jpa-utils` from the BOM); adding `@jwcarman/roux-web` and its
  peers; `configureApi`/`baseUrl`; `createQueryClient` and `useClearQueriesOnIdentityChange` in the
  app root; `Toaster` and `ConfirmProvider`; the CSP note (`z.config({ jitless: true })`,
  `sideEffects`). A map of the six subpaths.
- **errors:** the Problem Details shape (`contracts/problem-*.json`), each exception
  (`NotFoundException`, `InvalidFieldException`, `FieldErrors`, `FieldProblem`, `ConflictException`,
  `InvariantViolationException`, `ServerErrors`) with when to throw it and the response it gives;
  that the app writes no `@ExceptionHandler`; the `roux.problems.*` properties
  (`RouxProblemsProperties`); browser side: `Problem`, `FieldProblem`, `problemOf`, `ApiError`, what
  a form and a button show for each status.
- **api-client:** `get`, `getJson`, `send`, `sendJson`, `RequestOptions` (`params`, `signal`),
  `path`, `QueryParams`, `apiSettings`, `configureApi`, `ApiSettings`, CSRF, `isSessionLost` and
  `onSessionLost`; one API module per resource (the template's `customers.ts` shape).

- [ ] **Step 1:** Write the three guides. Each opens with one paragraph on what the area is for, then
  task-shaped sections ("Return 404 for a missing record", "Call an endpoint with query parameters").
- [ ] **Step 2:** Check every code sample's names and signatures against the source files; fix any
  difference in the guide.
- [ ] **Step 3:** Run `node plugins/roux/scripts/check-guides.mjs`. Expected: no `missing` line for any
  name from `problem`, `api` (except `useServerAction`, `ServerAction`, `ServerActionOptions`,
  `createQueryClient`, `shouldRetry`, `useClearQueriesOnIdentityChange`, which Task 3 covers unless
  this task already did) or the Java modules.
- [ ] **Step 4:** Commit: `docs(guides): getting started, errors, the API client`.

### Task 3: Guides: queries and mutations, forms

**Files:**
- Create: `docs/guides/queries-and-mutations.md`, `docs/guides/forms.md`

Content:
- **queries-and-mutations:** `createQueryClient` (no retry on 4xx, `shouldRetry`), query keys, a
  resource module with its API functions, `queryOptions` and `mutationOptions` together;
  `meta.refreshes` (awaited after success and refusal, and why); `useServerAction(mutation,
  { failure, onSuccess })`, `ServerAction`, `ServerActionOptions` for buttons.
- **forms:** the rule helpers (`text`, `email`, `url`, `phone`, `date`, `number`, `integer`, `oneOf`,
  `.optional()`, `.max(n)`) and that their messages equal the server's; `useSchemaForm` options and
  what it does with 400/409/other refusals; `inputOf`, `numberInputOf`, `dateTimeInputOf` for
  `defaultValues`; `FormDialog` (self-managed and controlled); a form on a page (`form.Form`,
  `SubmitButton`, `ResetButton`, `SubmittingIndicator`); each field component and its props
  (`SelectField` options and labels); how the version and 409 conflicts work (the README's paragraph
  expanded); `useAppForm`, `withForm`, the contexts, `errorMessages`, `fieldErrorsOf`, `FormField` for
  a form outside the schema path. The known gaps from 0.2.0 that a builder hits (nullable fields need
  `inputOf`; `url()` rejects dotless hosts) under "Things to know".

- [ ] **Step 1:** Write both guides; the worked example is a rank form (name required, at most 40;
  colour) and its mutation.
- [ ] **Step 2:** Check samples against the source, as in Task 2 Step 2.
- [ ] **Step 3:** Run the check. Expected: no `missing` line for any `api` or `form` name.
- [ ] **Step 4:** Commit: `docs(guides): queries and mutations, forms`.

### Task 4: Guides: tables and paging, feedback, testing; READMEs; CI

**Files:**
- Create: `docs/guides/tables-and-paging.md`, `docs/guides/feedback.md`, `docs/guides/testing.md`
- Modify: `README.md`, `web/roux-web/README.md` (overview plus links to the guides; keep the modules
  list, building and releasing sections), `.github/workflows/ci.yml` (Task 1's `plugin` job)

Content:
- **tables-and-paging:** `PageDto` and the page/sort parameters (`contracts/page*.json`, jpa-utils),
  an unknown sort's 400; every `/table` export (`QueryTable`, `SimpleQueryTable`, `TableView`,
  `TanstackTable`, `TablePagination`, `TablePageSizeSelect`, `PAGE_SIZES`, `TableStatus`,
  `createSelectColumn`, `FilterChips`, `SearchInput`, `DebouncedSearchInput`, `useDebounce`) and every
  `/paging` export (`InfiniteList`, `LoadMode`, `InfiniteSelect`, `InfiniteSelectQuery`, and the page
  types).
- **feedback:** `notify` (`success`, `problem`, …), `Toaster`/`toaster`, `ConfirmProvider`/
  `useConfirm`, `removal`, `ErrorMessage`, `NotFoundPage`, `ErrorPage` (route `notFoundComponent` and
  `errorComponent`).
- **testing:** how a roux app tests, from the template: Java `@AppTest` MockMvc tests asserting
  Problem Details; Vitest with MSW returning problems from `contracts/`; Playwright including the CSP
  test. Name only helpers an app has; roux-web's `src/testing` is internal.

- [ ] **Step 1:** Write the three guides; shrink the READMEs.
- [ ] **Step 2:** Check samples against the source.
- [ ] **Step 3:** Run `plugins/roux/scripts/sync-references.sh`, then the check. Expected: exit 0.
- [ ] **Step 4:** Add the CI `plugin` job. Commit guides, READMEs, references and CI:
  `docs(guides): tables and paging, feedback, testing; READMEs point at the guides`. Watch CI: the
  `plugin` job green.

### Task 5: The plugin and the skill

**Files:**
- Create: `.claude-plugin/marketplace.json`, `plugins/roux/.claude-plugin/plugin.json`,
  `plugins/roux/skills/roux/SKILL.md`

**Interfaces:**
- Consumes: the guide file names from Tasks 2-4 (as `references/<name>.md`).
- Produces: plugin name `roux`, skill name `roux`.

- [ ] **Step 1:** Load the `skill-creator` skill and follow its "Write the SKILL.md" and "Skill Writing
  Guide" sections.
- [ ] **Step 2:** Write the manifests in who's shape (`~/IdeaProjects/who/.claude-plugin/
  marketplace.json`, `plugins/who/.claude-plugin/plugin.json`): marketplace `name: "roux"`, owner
  `jwcarman`, one plugin `roux` from `./plugins/roux`; plugin homepage and repository
  `https://github.com/jwcarman/roux`, licence `Apache-2.0`, keywords `spring-boot`, `react`,
  `tanstack`, `chakra-ui`, `zod`, `problem-details`.
- [ ] **Step 3:** Write `SKILL.md`, under 200 lines. Frontmatter `description`: triggers when the
  project depends on `org.jwcarman.roux` (`roux-bom`, `roux-spring-boot-starter`) or
  `@jwcarman/roux-web`, or the user asks to add or change a list, table, form, page, endpoint, error
  or mutation in such an app, even without saying "roux". Body: what roux is (components for what an
  app never changes, plain app code for what it will); look at the project first (roux version in the
  pom and `package.json`; if it differs from these guides, say so); the conventions (records over the
  wire with the names above; one module per resource with API functions, queries and mutations; forms
  through `useSchemaForm` and rule helpers, messages never retyped; refusals as exceptions, no
  `@ExceptionHandler`; nothing imported from roux-web outside its six subpaths); a table from task to
  guide; "read the guide before writing code and quote APIs from it".
- [ ] **Step 4:** Run skill-creator's `scripts/quick_validate.py plugins/roux/skills/roux`. Expected:
  valid. Run `claude plugin validate .` if this Claude Code has it. Expected: no errors.
- [ ] **Step 5:** Commit: `feat(plugin): the roux plugin and skill`. Then ask the user to run
  `/plugin marketplace add ~/IdeaProjects/roux` and `/plugin install roux@roux`, and confirm the skill
  is listed (a subagent cannot install plugins).

### Task 6: The dojo's starting point

**Files:**
- Create: `examples/dojo/**` (copied from `~/IdeaProjects/noir-app-template` at commit `003ce74`, branch
  `customers-trial`, via `git archive`)
- Modify: `pom.xml` (profile `examples`, `<activeByDefault>true</activeByDefault>`, holding
  `<module>examples/dojo</module>`), `.github/workflows/ci.yml`, `.gitignore` if needed

**Interfaces:**
- Produces: `examples/dojo` builds with `./mvnw -B verify` from the root; its frontend depends on
  `"@jwcarman/roux-web": "file:../../../web/roux-web"`; later tasks copy it from a named commit.

- [ ] **Step 1:** Copy the tree. Remove: Customers (Java package, Liquibase changelog and include,
  `CUSTOMERS_*` permissions, frontend module, route, page, nav entry, tests, e2e spec references),
  every `noir-gen` marker, `.noir/`, `scripts/trace.sh`, `.github/` (roux's CI runs it),
  `docs/superpowers/` and `docs/native-findings.md`, noir wording in `CLAUDE.md` and `README.md`.
  Rename to the package, class and app name in Global Constraints.
- [ ] **Step 2:** Make `examples/dojo/pom.xml` a child of `roux-parent` (`relativePath ../../pom.xml`,
  version inherited), import `roux-bom` at `${project.version}`, and bring over from
  `spring-boot-starter-parent` only the plugin management the template's build uses (Spring Boot
  plugin, failsafe, resources). Properties: `maven.deploy.skip`, `skipPublishing`, `sonar.skip` true,
  and whatever `roux-contract-tests/pom.xml` sets to skip javadoc and sources. Before the dojo's own
  `npm ci`, a frontend-maven-plugin execution in `../../web` runs `npm ci` and `npm run build -w
  @jwcarman/roux-web`.
- [ ] **Step 3:** Frontend: depend on roux-web with `file:`; set `resolve.preserveSymlinks: true` in
  `vite.config.ts` (Vitest reads it) and `"preserveSymlinks": true` in `tsconfig.json`, so the linked
  package resolves React and the other peers from the dojo's own `node_modules`. Regenerate the lock.
- [ ] **Step 4:** Write `frontend/src/roux-link.test.tsx`: renders a `useSchemaForm` form with one
  `InputField` inside the app's test render helper and asserts the field's label is on screen.
  Expected after Step 3: passes. Also run `npm ls react` in `examples/dojo/frontend`. Expected: one
  `react@` version, deduped.
- [ ] **Step 5:** Run `./mvnw -B verify` from the root. Expected: BUILD SUCCESS, the dojo's Java tests,
  Vitest and `E2eIT` (Playwright, CSP included) pass.
- [ ] **Step 6:** Run `./mvnw -P release -B install -DskipTests -Dgpg.skip`. Expected: exit 0, and the
  reactor summary does not list the dojo. Run `./mvnw -q help:evaluate -Dexpression=project.version
  -DforceStdout -pl examples/dojo`. Expected: `0.3.0-SNAPSHOT`.
- [ ] **Step 7:** CI: in the `java` job, install Chromium's system libraries (as the template's CI
  does) only on push to `main`, and pass `-DskipITs` on pull requests. Sonar still runs (the dojo
  skips itself).
- [ ] **Step 8:** Commit: `feat(examples): the dojo, starting from the template's shell`. Watch CI
  (CI and Mutation) to green.

### Task 7: Evals and their fixture

**Files:**
- Create: `plugins/roux/scripts/eval-fixture.sh`, `plugins/roux/scripts/check-roux-way.sh`,
  `plugins/roux/skills/roux/evals/<case>/{prompt.md,case.yaml,graders/*.md,place-dojo.sh}` for three
  cases

**Interfaces:**
- Produces: `plugins/roux/scripts/eval-fixture.sh <commit> <dir>` writes a standalone copy of
  `examples/dojo` at `<commit>` into `<dir>`, outside the repository: roux's modules installed into
  `~/.m2` at that commit (`./mvnw -B install -DskipTests -P '!examples'`), roux-web packed (`npm pack`)
  into `<dir>/vendor/` and the frontend's dependency rewritten to `file:vendor/<tgz>`, the pom's parent
  resolved from `~/.m2` (no `relativePath` into the repo), lock regenerated, `git init` and one commit
  so a run's changes show as a diff. Prints `<dir>`.
- Produces: `check-roux-way.sh <dir>` prints `PASS|FAIL <check>` lines and exits 0 always:
  `build` (`./mvnw -B verify -DskipITs` exit 0), `no-fetch` (no `fetch(` in `frontend/src` outside
  tests), `no-roux-internals` (no import of `@jwcarman/roux-web/` other than the six subpaths, no
  `dist/` or `src/`), `no-retyped-messages` (none of roux's rule messages, e.g. `Must not be blank`,
  `Must be a valid email address`, as string literals in `frontend/src`), `no-exception-handler` (no
  `@ExceptionHandler` or `ResponseStatusException` in `src/main/java`), `schema-form` (each new form
  component uses `useSchemaForm` or `FormDialog`).
- Produces: `plugins/roux/scripts/plain-fixture.sh <dir>` writes the plain-stack arm's app: `git archive`
  of `noir-app-template` at `27095cb` (its `main` before roux: same stack, same members, invitations,
  appearance and settings, its own copies of the error, client, table and form code), the `noir-gen`
  markers and `.noir/` removed, `git init` and one commit. The template's repository is read from
  `https://github.com/jwcarman/noir-app-template` (or `$TEMPLATE_REPO` when set).
- `place-dojo.sh` (the case's scaffold script) copies `$ROUX_EVAL_FIXTURE` into the run directory; the
  plain arm sets it to the plain fixture.

Cases (prompts exactly as a user would type them; first confirm each feature is absent in the
fixture):
- `ranks-page`: "Add a Ranks page. The owner keeps the school's belt ranks: each has a name (required,
  at most 40 characters, unique) and a colour. Show them in a table and let the owner add and edit
  them in a dialog. Only the owner can see or change ranks."
- `member-phone`: "Members should be able to add a phone number to their profile (optional, at most 30
  characters). Show it in the member directory too."
- `duplicate-invite`: "When the owner invites an email address that already belongs to a member, don't
  send anything; show 'Already a member' under the email field."

Prompts name no library, so the same prompt runs in all three arms. Graders per case: `01-builds.md` ("`./mvnw -B verify -DskipITs` succeeds in the result"), one per
`check-roux-way` check that applies (roux arms only: the plain arm is scored on the build and the
task-specific statements), and two or three task-specific statements (for `ranks-page`: a
duplicate name is refused with a message under the name field; a non-owner gets 403 from the API; the
table and dialog exist).

- [ ] **Step 1:** Write `eval-fixture.sh`; run it for `HEAD` into the scratchpad. Expected: the copy
  builds (`./mvnw -B verify -DskipITs`), `grep -r "IdeaProjects/roux" <dir>` finds nothing, `find <dir>
  -type l -not -path '*/node_modules/*'` finds nothing.
- [ ] **Step 1b:** Write `plain-fixture.sh`; run it into the scratchpad. Expected: `./mvnw -B verify
  -DskipITs` succeeds in the copy, and `grep -r "roux" <dir> --include=*.java --include=*.ts
  --include=*.tsx --include=pom.xml --include=package.json` finds nothing.
- [ ] **Step 2:** Write `check-roux-way.sh`; run it on the untouched fixture. Expected: every line
  `PASS`. Plant a `fetch(` in a copy and run again. Expected: `FAIL no-fetch`.
- [ ] **Step 3:** Write the three cases in skill-creator's format (`references/schemas.md`, "Test
  cases"): `schema_version: "1.1"`, `max_turns: 80`, `timeout_seconds: 2400`,
  `allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]`, `context.scaffold_script:
  place-dojo.sh`.
- [ ] **Step 4:** Commit: `test(plugin): evals for the roux skill, on a fixture of the dojo`.

### Task 8: First benchmark (controller, with the user's go-ahead)

This task spends model time (3 cases × 3 arms × 3 runs = 27 runs); ask the user before starting it.
The three arms: `with_skill` (dojo fixture, roux plugin), `without_skill` (dojo fixture, no plugin),
`plain` (plain fixture, no plugin).

- [ ] **Step 1:** Build the fixtures: `plugins/roux/scripts/eval-fixture.sh <Task 7's commit>
  <scratchpad>/dojo-fixture` and `plugins/roux/scripts/plain-fixture.sh <scratchpad>/plain-fixture`.
- [ ] **Step 2:** Follow skill-creator's "Running and evaluating test cases" with three runs per
  configuration (`with_skill/run-1..3`, `without_skill/run-1..3`, `plain/run-1..3`), each run in its
  own copy of its fixture. The two baselines get the same prompt with no skill path. Workspace:
  `<scratchpad>/roux-workspace/iteration-1`.
- [ ] **Step 3:** Grade: run `check-roux-way.sh` on each result for the mechanical graders, judge the
  rest from the diff and transcript; write `grading.json`; run `aggregate_benchmark`; do the analyst
  pass (non-discriminating assertions, variance, cost).
- [ ] **Step 4:** Copy `benchmark.md` and `benchmark.json` to
  `plugins/roux/evals/results/<YYYY-MM-DD>/`, with `analysis.md`: whether roux with the skill beats the plain stack (pass rate,
  turns, tokens, time) and by how much, what the skill changed against roux without it, which guide
  sections made no difference, which failures recurred and the guide fixes they call for (listed, not
  made: fixes are the next iteration).
- [ ] **Step 5:** Commit: `test(plugin): first benchmark of the roux skill`.
