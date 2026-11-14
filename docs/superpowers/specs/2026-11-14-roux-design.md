# roux: the plumbing, built plumb (design)

Date: 2026-11-14
Status: draft for review
Repositories: `jwcarman/roux` (all of it); `jwcarman/noir-app-template`, `jwcarman/noir-platform` and
`jwcarman/noir` as its first users (section 7)

## Why

Every app noir builds starts as a copy of `noir-app-template`, and every feature in it is written by an
agent following prose conventions (the template's `CLAUDE.md` and its README's "Adding a feature"). The
result is correct most of the time but not the same every time: two agents asked for the same feature
write it two ways, an agent forgets a convention ("gate on a permission, never a role", "the fake
server is strict"), and a fix to the template never reaches an app already made from it.

roux takes the parts that should always be the same out of the hands of the model:

- **the plumbing** every app needs and none should rewrite (errors, security, the SPA shell, auditing,
  history, tests) becomes libraries;
- **the patterns** every app repeats (an entity, a field, a screen) become deterministic operations
  an agent calls like a tool;
- **the conventions** become checks that fail the build.

The model keeps what needs judgment: business rules, unusual screens, integrations.

roux is its own product, not part of noir. noir is its first and largest user, but roux must also stand
on its own for rapid prototyping by a person at a terminal: whatever noir's agents can do with it, a
developer can do with the same commands.

### Success

1. `roux new acme-crm` produces an app equivalent to today's template, which builds, passes its
   tests and runs, with most of the template's infrastructure code replaced by roux dependencies.
2. `roux add-entity Customer` then `roux add-field Customer.phone:phone` produce a working,
   tested, full-stack feature (API, table, screen, tests) that follows every convention, and the same
   input always produces the same diff.
3. A generated app fails its build when code breaks a convention (a controller method without a
   permission, a call to `Instant.now()`).
4. noir builds an app with roux operations and the result is measurably cheaper and more consistent than
   without them (section 8, stage 0 and the experiment).

## Scope

**In:**
- the Java runtime: Spring Boot auto-configured modules, starters and a BOM;
- the web runtime: an npm package for the client side of the same conventions;
- the generator: `roux new` and a catalog of operations, as a CLI, a Maven plugin and an MCP server;
- checks: ArchUnit and ESLint rules for the conventions;
- `roux upgrade` with OpenRewrite migration recipes;
- moving `noir-app-template` onto roux.

**Out (later specs):**
- drop-in feature modules (a whole "customers" feature as a jar): replaced by generators (decision 3);
- agent-written templates: the catalog is fixed and ours (decision 5);
- support for any stack but one (decision 9);
- noir's own use of the MCP server and its agent prompts (a noir spec, once operations exist).

## 1. Decisions

1. **Name: roux.** The base the classic sauces are built from, made the same way every time. Said
   "roo"; the README says so on its first line.
2. **Coordinates under the author's name.** Maven `org.jwcarman.roux`; npm scope `@jwcarman`
   (`@jwcarman/roux-web`, `@jwcarman/roux-cli`, …). The command is `roux` whatever the package is called.
3. **Starters for what an app must never change; generators for what it will.** Domain features are
   generated into the app and belong to it, so an agent changes them like any other code. Plumbing lives
   in jars, so a fix reaches every app by a version bump.
4. **Operations, not one scaffold.** Small, typed operations compose into larger recipes ("customers" is
   an entity, its fields, a permission and a screen).
5. **A fixed catalog.** Every operation is written, golden-tested and versioned by us. Agents call them;
   they do not write templates.
6. **The code is the source of truth.** There is no model file to keep in step with the code: operations
   edit the app's code where it stands, by its syntax tree, so they work on code an agent has already
   changed.
7. **Apps are Java.** Business logic in generated code lives in app-owned files (section 4), so Kotlin's
   extension functions are not needed.
8. **One version across everything.** The starters, the npm package and the generator are released
   together with one version number; generator 1.4 emits code for runtime 1.4.
9. **One stack.** Spring Boot 4, Java 25, PostgreSQL with Liquibase, who for identity (optional, section
   3.1), React with Chakra UI v3 and TanStack Router, Query, Form and Table, Vitest with MSW, Playwright.
   The generator knows this stack only.
10. **The frontend is part of the framework.** A backend-only scaffold is not a prototype.

## 2. The parts

```
roux (one repository, one version)
├── runtime, Java      Spring Boot modules + starters + BOM                     (3.1)
├── runtime, web       @jwcarman/roux-web                                       (3.2)
├── generator          roux new, roux <operation>: CLI, Maven plugin, MCP      (3.3)
├── checks             ArchUnit rules in roux-test; @jwcarman/eslint-config-roux (3.4)
├── migrations         OpenRewrite recipes; roux upgrade                        (3.5)
└── docs               the conventions; the agent guide generated into each app (3.6)
```

## 3. Design

### 3.1 Java runtime

Modules, each with its own auto-configuration (`META-INF/spring/…AutoConfiguration.imports`), each on
only when its classes are present and off with `roux.<module>.enabled=false`:

| Module | Contents, from the template |
|---|---|
| `roux-problems` | `ProblemsAdvice`, `RootProblemsAdvice`, `ProblemErrorController`, `FieldErrors`, `ServerErrors`, `NotFoundException`, `InvariantViolationException`, `InvalidFieldException`, a new `ConflictException` (409), runtime hints |
| `roux-time` | a UTC `Clock` bean, `@ConditionalOnMissingBean` |
| `roux-spa` | `ShellController`, `SpaController` (immutable `/assets`), `ContentSecurityPolicy`; a route registry; a `ShellContributor` hook for the page's placeholders |
| `roux-who` | who's passwordless security chain built from the route registry, `IdentityAuditor` and JPA auditing, `OwnerBootstrap` driven by a `RoleCatalog` the app provides |
| `roux-activity` | `ActivityLog`, its entity, repository and changelog; an `ActorNames` hook in place of the join to `MemberProfile` |
| `roux-theme` | the theme API, entity and changelog; contributes the theme to the shell; permission `theme.manage` |
| `roux-paging`, `roux-csv` | paging DTOs over jpa-utils; `Csv` and its export limit |
| `roux-defaults` | the template's shared settings (session cookie, virtual threads, `ddl-auto: validate`, `open-in-view: false`, resource caching) applied at lowest precedence; the Spring Session changelog |
| `roux-test` | `TestClock`, `TestDatabase` and its initializer, `TestMail`, `RecordingEmailLinkSender`, `LocalClient`, a base `@RouxTest`, the ArchUnit rules (3.4) |

Starters: `roux-spring-boot-starter` (all but test) and `roux-spring-boot-starter-test`; `roux-bom`.

Rules:

- **Only `roux-who` needs who.** Every other module uses `@ConditionalOnClass` and
  `@ConditionalOnMissingBean`, so `noir-platform`, which signs in with Keycloak, can use problems, time
  and spa. Handlers for who's and jpa-utils' exceptions turn on only when those are on the classpath.
- **No app types in roux.** Every place the template reaches into the app becomes a hook the app (or
  generated code) fills: `RoleCatalog` for `AppRoles`, `ActorNames` for `MemberProfile`, the route
  registry for `SpaController.ROUTES`, `ShellContributor` for `ThemeService`.
- **Changelogs ship in the jars** (`classpath:org/jwcarman/roux/<module>/changelog.xml`); the app's
  master changelog includes them, as it includes who's today.
- **Native images keep working.** Each module ships its runtime hints and AOT registrations; the
  template's native profiles become roux's own build and test.
- **Nothing noir-specific.** `NOIR_TEST_DATABASE_URL` and `NOIR_TEST_MAIL_*` become `ROUX_TEST_*`
  settings that noir sets; `app-name.properties` stays as a roux convention that noir happens to write.

### 3.2 Web runtime

`@jwcarman/roux-web`: the client side of the same conventions, from `noir-app-template/frontend`:
Problem Details (`problemOf`, `showProblem`, `notify.problem`), the API client, navigation from
`nav.json`, the theme, and the form and table helpers. `@jwcarman/roux-test` (npm) holds the strict MSW
setup and test helpers.

The frontend has not been inventoried for this spec; doing so is the first task of stage 2 (section 8),
and its findings amend this section.

### 3.3 Generator

**Interfaces.** One engine, three ways in:

- the `roux` CLI, a GraalVM native binary (installed with npm, `@jwcarman/roux-cli`, or as a download);
- a Maven plugin (`./mvnw roux:add-field …`) for CI and machines without the binary;
- an MCP server, so an agent sees each operation as a tool with its schema.

**Every operation:**

1. takes typed input with a JSON schema, and rejects bad input before it touches a file;
2. is deterministic (the same input and the same tree give the same diff) and idempotent (a second run
   changes nothing);
3. refuses rather than guesses: a missing anchor, a name already taken or a tree it does not recognize
   stops it with a message saying what to do;
4. shows its plan first: `--dry-run` prints the diff;
5. is all or nothing: it needs a clean git tree, writes every change or none, then compiles and runs the
   tests it generated, and reports the result.

**How it changes code:**

- new files from compiled templates (JTE or Pebble, chosen when the engine is built);
- existing files by their syntax tree, never by text substitution: OpenRewrite for Java, Liquibase XML,
  YAML, JSON and the POM; `ts-morph` for TypeScript; marked anchors ("needles") only where neither
  works.

**First catalog** (to be confirmed by stage 0):

| Operation | Changes |
|---|---|
| `new` | a whole app, today's template |
| `add-entity` | entity, logic interface (4), repository, changelog and master include, service with hooks, controller, request and response records, Spring test |
| `add-field` | entity field, `addColumn` changelog, records, validation, form field, table column, test data |
| `add-relationship` | foreign key changelog, mapping, ids in the records, a select in the form |
| `add-permission` | the constant and its role grant in `AppRoles` |
| `add-screen` | route file, page, `api.ts`, `queryKeys.ts`, `nav.json`, route registry, Vitest test with MSW handlers, and handlers in every existing test that renders the page |
| `add-activity` | an activity code and its `ActivityLog.record` call |
| `add-endpoint` | a controller method stub with its records, permission and test (whether this earns its place is open) |

### 3.4 Checks

Each rule the template's `CLAUDE.md` states, as code that fails the build:

| Convention | Check |
|---|---|
| gate on a permission, never a role | ArchUnit: every `@RestController` handler has `@RequiresPermission` or is marked public |
| errors are Problem Details; no handlers of your own | ArchUnit: no `@ExceptionHandler` or `@ControllerAdvice` outside roux |
| time from the injected `Clock` | ArchUnit: no `now()` without a clock on `java.time` types |
| an edited record carries its `version` | ArchUnit: every entity with an update endpoint is versioned |
| icons only from `react-icons/lu` | ESLint `no-restricted-imports` |
| every client route is registered | a test comparing `frontend/src/routes` with the route registry |

### 3.5 Upgrades

`roux upgrade` raises the app to a new roux version: it bumps the BOM, the npm packages and the recorded
generator version together, then runs that release's OpenRewrite recipes over the app's code (a renamed
API, a changed convention). A release that changes generated code ships the recipe that changes it in
apps already generated. The same recipes let noir upgrade every app it has built.

### 3.6 Docs and the agent guide

`roux new` writes the app's `CLAUDE.md` from roux: the conventions, the decision table of section 4, and
the operations to reach for first. The guide is upgraded with the app.

## 4. Business logic in generated code

Generated code and handwritten code never share a file. `add-entity` writes, once, an app-owned logic
interface the generated entity implements:

```java
// written once by add-entity, then the app's
public interface CustomerLogic extends CustomerFields {
  default boolean isReachable() {
    return getEmail() != null || getPhone() != null;
  }

  default void validate() {}   // the generated service calls it before every save
}
```

Its methods are real members, so the API, Jackson and the generated service see them. Where each kind
of change goes:

| The owner asks for… | It goes in… |
|---|---|
| a new field | `roux add-field` |
| a rule ("a phone number unless email-only") | `validate()` in the logic interface |
| a side effect ("email them when they sign up") | a listener on the generated `CustomerCreated` event |
| a computed value ("loyalty discount") | a default method in the logic interface |
| a new endpoint ("merge two customers") | a handwritten controller and service beside the generated ones |
| something the generated shape cannot do | ordinary handwritten code: operations work on the tree, so later ones still apply where they can, and refuse where they cannot |

## 5. Roles: the template, the platform, noir

- **noir-app-template** moves onto roux in stages; once `roux new` exists it is retired, or kept as the
  reference app the generator's golden tests compare against.
- **noir-platform** replaces its own `ApiErrors`, `NotFound`, `Conflict` and `ClockConfig` with
  `roux-problems` and `roux-time`.
- **noir** creates apps with `roux new` instead of copying the template, and gives its agents the MCP
  server. Everything about the factory itself (containers, planning, specs, the platform) stays in noir.

## 6. Repository layout

```
roux/
  pom.xml                    the Java reactor and roux-bom
  runtime/                   roux-problems, roux-spa, roux-who, … and the starters
  web/                       @jwcarman/roux-web, @jwcarman/roux-test, @jwcarman/eslint-config-roux
  generator/                 the engine, templates, OpenRewrite recipes, CLI, Maven plugin, MCP server
  reference/                 the app roux new produces, built and tested on every change
  docs/
```

`reference/` is what keeps the parts honest: every change builds it, runs its tests (Java, Vitest,
Playwright, native) and checks that the generator still produces it exactly.

## 7. Risks

- **It is a product.** Docs, stable APIs and care with breaking changes, in two languages. Mitigated by
  the staged plan: each stage is useful even if the next never happens.
- **It covers the scaffolding, not the judgment.** Perhaps most of a feature's files but not its hardest
  part. The aim is less variance, not none.
- **Operations that refuse too often teach agents to work around them.** noir should measure how often
  agents use an operation versus doing the same work by hand.
- **The catalog and the conventions can drift.** Mitigated by `reference/` and golden tests.
- **Building the wrong operations.** Mitigated by stage 0.

## 8. Plan

Each stage is a separate spec or plan and ships on its own.

0. **Find out what agents repeat.** From noir's database and transcripts
   (`jwcarman/noir`, `docs/findings/queries/` on branch `findings/generation-patterns-queries`): the
   kinds of work in the build specs, the files each touched, and why attempts were retried. The
   result orders section 3.3's catalog.
1. **Java runtime.** The modules of 3.1, with the template depending on them; `noir-platform` adopts
   problems and time.
2. **Web runtime.** Inventory the template's frontend, then extract `@jwcarman/roux-web`.
3. **Checks.** The rules of 3.4, run against the template.
4. **Generator.** The engine, `roux new`, `add-entity` and `add-field`; then the experiment: the same
   owner requests through noir with and without the operations, compared on cost, build retries,
   convention violations and review findings.
5. **The rest of the catalog, the MCP server and `roux upgrade`.**

## 9. Open questions

- The first operations, after stage 0; and whether `add-endpoint` is worth a stub.
- Members: a generator recipe, a `roux-members` module, or left in `roux new`'s output as it is today.
- The template engine (JTE or Pebble) and how the CLI binary is distributed.
- Public or private, and the license.
- Which Spring Boot and Java versions a roux release supports, and for how long.
