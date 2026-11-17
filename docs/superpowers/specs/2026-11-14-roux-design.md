# roux: the plumbing, built plumb (design)

Date: 2026-11-14
Status: draft for review (replaces the first draft, commit `ca2ccea`)
Repositories: `jwcarman/roux` (public); its first users `jwcarman/noir-app-template` and
`jwcarman/noir`

## Why

Over many applications (dojo, levelx, martialware, fynanse, the noir apps) the same patterns have
made building an app quicker, simpler and safer: one shape for errors and one way of handling them,
one API client, one shape for pages of results and the tables that show them. Alongside them sits a
set of published building-block libraries (`who`, `jpa-utils`, `codec`, `odyssey`, `continuum`, …).
The patterns have never been extracted; each app carries its own copy, most recently
`noir-app-template`.

roux is the culmination of that work and the jumping-off point for future apps. It is two things that
fit together:

1. **Components:** reusable building blocks for an app's plumbing. An app depends on them; it does not
   copy them, so a fix reaches every app by a version bump.
2. **A generator:** it writes an app's own code (entities, screens, forms, tests) in one opinionated way,
   on top of the components. Generated code belongs to the app, so a person or an agent changes it
   like any other code.

The opinions are what join the two: the generator uses the components the way their author would, so
the right way is the easy way. roux is an accelerator, not an enforcer. For teams that want to hold
exactly to its conventions, it also ships the rules as an opt-in **strict mode** (stage 3).

roux is its own product. noir is its first and largest user, but roux stands on its own for a developer
at a terminal: whatever noir's agents can do with it, a developer can do with the same commands.

### Built for agents

roux's users are agents: noir's builders, and Claude Code at a developer's terminal. It is a library
for agents first, and it is judged by how well agents build with it:

- **Easy to use:** an agent gets it right the first time, cheaply. Measured by evals (pass rate, turns,
  tokens, time), which are to usability what roux's tests are to correctness.
- **Proven:** against the alternative. Each benchmark runs the same tasks on roux with its skill, on
  roux without it, and on the same stack with no roux.
- **Stable:** the guidance travels with the version. roux's Claude Code plugin carries the guides of its
  own release; a breaking change ships with a guide note, and later a migration recipe.
- **Reusable:** it leans on what models already know (Spring, TanStack, Zod) and departs only where
  measurement says it pays.

Rules that follow: one way to do each thing; mistakes caught by the compiler, not at run time; errors
that say how to fix them; known gaps written where an agent will read them (the guides), not only in
the changelog.

### Success

The measure of roux is the applications built with it. **Every app noir builds is a roux app:** its
plumbing comes from roux dependencies, and its features are generated code that uses them.

1. Every new app noir builds gets errors, API calls, paging, tables and forms from roux dependencies,
   with none of that code in the app. (Stage 1, through the template.)
2. `roux new acme-crm` produces a working app equivalent to today's template, and operations add
   entities, list screens and forms that follow every convention; the same input always gives the
   same diff. (Stage 2.)
3. An app that turns on strict mode fails its build when code breaks a convention. (Stage 3.)
4. noir builds apps with roux and the result is measurably cheaper and more consistent than without it.

## Goals, non-goals, anti-goals

**Goals**
- One place for the patterns: each written once, tested once, released once.
- Server and browser halves of each pattern that provably agree.
- Plain, idiomatic generated code: the vanilla an agent or a developer adds toppings to.

**Non-goals**
- Absorbing the existing libraries. They stay their own projects (decision 2).
- Supporting more than one stack (decision 8).
- Drop-in feature modules (a whole "customers" feature as a jar): domain features are generated.
- Agent-written templates: the catalog is fixed and ours.
- noir's own use of roux (its prompts, its MCP wiring): a noir spec, once operations exist.

**Anti-goals (failure even if it works)**
- An app that cannot be understood without reading roux's source: generated code and components'
  APIs must read as ordinary Spring and React.
- Components that leak noir: nothing noir-specific in roux (names, settings, assumptions).
- A component release that silently changes a wire shape apps depend on.

## Approaches considered

Three choices shaped this design; each was settled in conversation.

**What happens to the existing libraries.**
- A. *roux curates them* (chosen): they keep their own repositories, releases and versions; roux's BOM
  pins a set tested together; roux holds only glue, opinions and the generator. Keeps them useful
  outside roux; the cost is managing which versions work together, which `reference/` tests.
- B. roux absorbs them into one repository and version: simplest upgrades, but the libraries lose
  their standalone life and their users must follow roux's versioning.
- C. A mix by library: rejected as the worst of both until a library proves it only makes sense inside
  roux.

**How a browser client for an endpoint comes to exist.**
- A. *The generator writes it as plain code* (chosen): with the controller and its records it writes
  the matching `api.ts` functions and TypeScript types, using roux's client. Readable, owned by the app;
  drift after hand edits is caught by a test the generator writes into the app (stage 3).
- B. Generated at build time from OpenAPI: types never drift, but a generated client nobody reads, and
  more tooling in every build.

**Where to start.**
- 1. *The contracts first* (chosen): extract errors, the API client, paging and tables as matched
  server/browser pairs, and move the template onto them. Small, already proven in the template, useful
  at once, and everything later builds on it: generated code calls these components.
- 2. The generator first (port `noir gen`): the largest measured saving, but it would generate code
  against helpers that are about to move, so every operation would be written twice or need migration
  recipes at once.
- 3. A reference app first: settles the opinions, but ships nothing reusable for a long time.

## 1. Decisions

1. **Name: roux** ("roo"), the base the classic sauces are built from, made the same way every time.
   Maven `org.jwcarman.roux`, npm scope `@jwcarman` (`@jwcarman/roux-web`, …). The command is `roux`.
2. **roux curates the existing libraries; it does not absorb them.** `who`, `jpa-utils` and the rest
   keep their repositories and versions. `roux-bom` pins versions known to work together.
3. **Each pattern is a matched pair.** A pattern that crosses the wire ships as a Java half and a
   browser half, released together, with a test that proves both sides agree on the wire shape (3.3).
4. **One version for roux's own parts.** The Java modules, the npm packages and (later) the generator
   are released together under one number; generator 1.4 emits code for runtime 1.4. Curated libraries
   keep their own versions, pinned by the BOM.
5. **Components for what an app must never change; generated code for what it will.**
6. **The generator writes plain code, including the browser client** (approach A above).
7. **The code is the source of truth.** No model file: operations read and edit the app's code where
   it stands, by its syntax tree.
8. **One stack.** Spring Boot 4.1, Java 25, PostgreSQL with Liquibase, `who` for identity (optional),
   React 19 with Chakra UI v3 and TanStack Router, Query, Form and Table, Vitest with MSW, Playwright.
9. **The frontend is part of the framework.** A backend-only scaffold is not a prototype.
10. **Licence: Apache 2.0**, as `who` and `jpa-utils` are; the repository is already public.
11. **Forms validate with Zod.** The generator writes one Zod schema per request record beside its
    TypeScript type in the app's `api.ts`, mirroring the record's Bean Validation annotations, and forms
    pass it to TanStack Form as a Standard Schema validator (no adapter). The server stays the
    authority: its 400 field errors still reach the fields through `showProblem`. Stage 1's form code
    needs no change for this, since it already reads `{ message }` errors.
12. **Endpoints speak records.** Generated controllers take and return Java records, never entities.
    Records are named by what they are (`Customer`, `CustomerDetail`), requests `<Thing>Request`
    (`CustomerRequest`), and lists `PageDto<Customer>`. This is the generator's convention, the
    template's today. Strict mode (stage 3) can hold hand-written code to it.

## 2. The parts

```
roux (one repository, one version)
├── runtime, Java      modules, starters, roux-bom (pins curated libraries)   stage 1, 4
├── runtime, web       @jwcarman/roux-web                                     stage 1, 4
├── contracts          wire-shape fixtures both halves are tested against     stage 1
├── generator          roux new, operations: CLI, Maven plugin, MCP server   stage 2, 5
├── strict mode        opt-in ArchUnit rules; @jwcarman/eslint-config-roux    stage 3
├── migrations         OpenRewrite recipes; roux upgrade                     stage 5
└── reference/         the app roux produces, built and measured on every change
```

**Curated libraries** (proposal; each optional one gets its starter and operation when an app first
needs it):
- in every app: `who`, `jpa-utils`;
- optional: `odyssey` (live updates), `continuum` (durable background work), `codec`,
  `bolt-spring-boot` (Slack), `nessy` (agents);
- underneath only, reached through the others: `specular`, `methodical`, `occlude`, `accent`.

## 3. Stage 1: the contracts

The first deliverable, and the only stage specified in detail here. Everything in it exists today in
`noir-app-template` and moves, with its tests, into roux; behaviour does not change unless this section
says so.

### 3.1 Errors

**Java: `roux-problems`**, a plain library, auto-configured by `roux-autoconfigure` (3.6): on when
its classes are present, off with `roux.problems.enabled=false`. From `org.jwcarman.noir.app.web.problems`: `ProblemsAdvice`,
`RootProblemsAdvice`, `ProblemErrorController`, `FieldErrors`, `FieldProblem`, `ServerErrors`,
`NotFoundException`, `InvariantViolationException`, `InvalidFieldException`, `ProblemsRuntimeHints`;
and a new `ConflictException` (409).

- `ProblemsAdvice` today handles `who`'s exceptions (`SignInFailedException`,
  `ReauthenticationRequiredException`, `InvalidPasskeyRegistrationException`) and `jpa-utils`'
  `UnknownSortByValueException`. These handlers move into separate advice classes, each registered only
  when its library is on the classpath (`@ConditionalOnClass`), so an app that signs in some other
  way (Keycloak, say) can use `roux-problems` without `who`.
- Every bean is `@ConditionalOnMissingBean`; no app types appear in the module.
- `ProblemsAdvice` today also handles the template's `ExportTooLargeException`. Call: the template's
  exception becomes a subclass of `InvalidFieldException` with the field `export`, which gives the same
  400 with the same `errors[]`, so the handler leaves roux with no change on the wire. CSV export
  stays in the template.
- Runtime hints and AOT registrations ship in the module, so native images keep working.

**Browser: `@jwcarman/roux-web/problem`**: `Problem`, `FieldProblem`, `problemOf` (from `problem.ts`),
unchanged.

### 3.2 The API client

**Browser: `@jwcarman/roux-web/api`**: `ApiError`, `get`, `send`, `getJson`, `isSessionLost`,
`onSessionLost` (from `api.ts`), and `useServerAction` with `notify` and the toaster (from
`serverAction.ts` and `components/feedback/notify.ts`), since a server action is how a refusal reaches
the user.

- What is `who`-specific stays out: `fetchMe`, `Me`, `Passkey` and the passkey calls remain in the app
  until a `who` client half exists (stage 4).
- Today the client fetches `/who/me` to obtain a CSRF cookie and treats a 401 under `/api/` as a lost
  session. Both become settings of a `configureApi({ csrfBootstrapPath, sessionPathPrefix })` call
  (call: the defaults are `who`'s `/who/me` and `/api/`, since `who` is the default identity; an app
  without `who` sets its own).
- **Java half:** the CSRF cookie and the 401 come from the security chain, which is `who`'s today.
  Stage 1 adds no Java module for the client. Call: its contract is tested with fixtures like the
  others (3.5), with no live test across processes. `contracts/session.json` records the CSRF cookie
  name (`XSRF-TOKEN`), the request header (`X-XSRF-TOKEN`) and the 401 Problem. A Java test with a
  stand-in Spring Security configuration (the same cookie repository and the same 401 entry point, no
  `who`, no database) asserts them, and Vitest tests drive the client through MSW from the same
  fixture. The template's Playwright tests remain the proof that `who`'s real chain matches.

### 3.3 Paging and tables

**Java half: `jpa-utils`**, curated, unchanged: `PageDto`, `PaginationDto`, `PageSpec`, `PageParams`,
`SortDirection`, `Paginator`, `PagingWebAutoConfiguration`. roux adds no paging module.

**Browser: `@jwcarman/roux-web/paging`** (all of `paging.ts`: `PageDto`, `PageParams`, `pageQuery`,
`pageParamsOf`, `fetchAllPages`, `tableSearchOf`, `enumSearchOf`, …) and
**`@jwcarman/roux-web/table`**: `QueryTable`, `SimpleQueryTable`, `TableView`, `TanstackTable`,
`TablePagination`, `TablePageSizeSelect`, `TableStatus`, `selectColumn`, `FilterChips`,
`useQueryTable`, and `useDebounce`, which the table uses.

CSV export (`Csv`, `ExportTooLargeException`, `ExportButton`) is out of scope: it stays in the template
as app code, and no stage here plans it.

### 3.4 Forms that show problems

**Browser: `@jwcarman/roux-web/form`**: the form helpers (`form.tsx`, `formContext.ts`, `errors.ts`,
`values.ts`, `showProblem`), the fields (`InputField`, `NumberField`, `SelectField`, `TextAreaField`,
`CheckboxField`, `RadioGroupField`, `FormField`, `formComponents`), and `FormDialog` with
`ConfirmProvider`.

Call: forms come in stage 1 although they were not named among the patterns. `showProblem` is the
errors contract's other end (a 400's field errors land on the form's fields), and stage 2's first
operations generate add/edit forms that need these components to exist in roux.

### 3.5 Contracts and how both halves are tested

`contracts/` holds one JSON fixture per wire shape:

| Fixture | Shape |
|---|---|
| `problem-not-found.json` | a 404 from `NotFoundException` |
| `problem-invalid-fields.json` | a 400 with `errors[]` from bean validation |
| `problem-invariant.json` | a 400 from `InvariantViolationException` (400 today; unchanged) |
| `problem-conflict.json` | a 409 from the new `ConflictException` |
| `problem-server-error.json` | a 500 with `errorId` (its value matched as any UUID) |
| `problem-unknown-sort.json` | a 400 from an unknown `sortBy` |
| `page.json` | a `PageDto` with its `pagination` |
| `page-params.txt` | query strings a table sends, one per line, with the `PageSpec` each binds to |

- **Java side:** a test application in `roux-problems`' tests raises each error and serves a page
  through `jpa-utils`; tests assert each response equals its fixture (JSON equality, field order
  ignored). Bumping `jpa-utils` in the BOM runs these tests, so a change to its wire shape fails roux's
  build, not an app's.
- **Browser side:** Vitest tests feed each fixture to `problemOf`, the table's page handling and
  `pageParamsOf`, and type-check the fixtures against `Problem` and `PageDto` with `satisfies`.
- A fixture changes only in a commit that changes both halves.

### 3.6 Packaging

- **Java, in Spring Boot's idiomatic starter layout** (as `who` does it):
  - `roux-problems`, a plain library with no auto-configuration;
  - `roux-autoconfigure`, all of roux's auto-configuration, with optional dependencies on the libraries
    it configures and an `@ConditionalOnClass` guard on each;
  - `roux-spring-boot-starter`, with no code, depending on `roux-autoconfigure`, `roux-problems`,
    `jpa-utils` and Spring Boot's validation and Spring MVC starters;
  - `roux-bom`, which manages roux's modules plus pinned `who` and `jpa-utils`. It does not inherit
    Spring Boot's dependency management, so importing it never changes an app's Spring Boot versions.

  Published to Maven Central with the `cutting-oss-release` workflow. First version `0.1.0`.
- **npm:** one package, `@jwcarman/roux-web`, with the subpath exports `problem`, `api`, `paging`,
  `table`, `form`. React, Chakra UI, TanStack Query, Table and Form, and `react-icons` are peer
  dependencies at the template's current major versions. Built with Vite library mode to ESM with type
  declarations; tested with Vitest; published to npm under the same version as the Java modules.
- **One release, both registries.** The GitHub `release: created` trigger that publishes to Maven
  Central (the `cutting-oss-release` workflow) also publishes `@jwcarman/roux-web` to npm (public
  access, with provenance) through npm trusted publishing (OIDC), so no npm token is stored. npm
  publishes first and Maven Central runs only after it succeeds. The author owns the `@jwcarman`
  scope and configures the trusted publisher (`jwcarman/roux`, `release.yml`) on npmjs.com.
- **Repository:** a Maven reactor at the root (`runtime/`) and an npm workspace (`web/`); `contracts/`
  at the root, read by both. CI builds and tests both halves on every change.

### 3.7 Moving the template onto roux

`noir-app-template` (and so every new noir app) depends on `roux-bom`, `roux-spring-boot-starter` and
`@jwcarman/roux-web`; the moved files are deleted from it and their imports point at roux. Done when
the template's whole build passes unchanged (Java tests, Vitest, Playwright, the native build) with
none of the moved code left in it.

`noir-platform` does not move onto roux in this stage or any stage this spec plans. Its errors are not
Problem Details (`{"error": …}`, and `IllegalArgumentException` answered as a 400), so adopting roux
would change its API and its frontend. If it adopts roux later, that will be its own spec. Stage 1 still
keeps `roux-problems` free of `who` (3.1), so the option stays open.

### 3.8 Stage 1 is done when

1. `roux-problems`, `roux-bom`, `roux-spring-boot-starter` and `@jwcarman/roux-web` `0.1.0` are
   published.
2. The contract tests pass on both sides.
3. The template builds and passes as in 3.7.
4. A fresh app made from the moved template the way noir makes one builds and passes its tests, with
   the moved patterns coming only from roux dependencies.

Only new apps. The apps noir has already built were experiments that teach the factory how to make
lovable applications; they are not brought onto roux.
5. The moved code meets the bar noir holds builders to: 100% Vitest coverage, no Stryker survivors and
   no PIT survivors.

## 4. Later stages (outline; each gets its own spec)

**Stage 2: the generator, screens first.** roux takes over noir's in-house generator (`noir gen`:
`permission`, `entity`, `page`, `changelog`), which becomes the prototype and is retired once roux
covers it. noir's three-way experiment (`docs/findings/2026-11-14-generators-ab.md` in `jwcarman/noir`)
showed the saving is in screens: one request cost $3.52 with no generators, $2.67 with backend
generators, and $0.62 when the generators also wrote the list screen and form. So `roux new`,
`add-entity`, the list screen and the add/edit form come first, as a CLI (a GraalVM native binary) and
a Maven plugin. Principles carried from that work:

- every rule the owner can see (lengths, uniqueness, default sort, columns) is a required input with
  no default, so an agent has to ask instead of assuming;
- an operation refuses loudly when a setting it depends on is missing, never skips silently;
- nothing is generated until something uses it;
- generated code is plain, and its tests assert behaviour, not exact headers or cell text;
- existing files are edited by syntax tree (OpenRewrite for Java and XML, `ts-morph` for TypeScript),
  marked anchors only where neither works;
- every operation is typed, deterministic, idempotent, all-or-nothing and shows its diff first;
- `reference/` is generated and measured like a builder's code: 100% coverage, no Stryker or PIT
  survivors on generated lines.

Until stage 4, `roux new` writes the template's remaining infrastructure (the SPA shell, activity,
theme, members) as app code.

**Stage 3: strict mode, and the drift test.**
- **Strict mode is opt-in.** The template's `CLAUDE.md` rules ship as ArchUnit rules (in `roux-test`)
  and an ESLint preset (`@jwcarman/eslint-config-roux/strict`). An app that turns them on fails its
  build when code breaks a convention:
  - every handler is gated on a permission;
  - no `@ExceptionHandler` outside roux;
  - time comes from the injected `Clock`;
  - edited records carry a `version`;
  - endpoints take and return records, never entities;
  - icons come only from `react-icons/lu`;
  - every client route is registered.

  Nothing turns it on by default.
- **The drift test is on by default, because it guards roux's own output.** The generator writes a
  test into each app checking that the generated TypeScript types and Zod schemas still match the Java
  records and their Bean Validation annotations (decisions 6 and 11).

**Stage 4: the rest of the runtime.** `roux-time`, `roux-spa`, `roux-who` (and the browser's `who`
client half), `roux-activity`, `roux-theme`, `roux-defaults`, `roux-test` and
`@jwcarman/roux-test`; then starters and operations for the optional curated libraries as apps need
them.

**Stage 5: the MCP server, the rest of the catalog and `roux upgrade`** with OpenRewrite recipes, so a
release that changes generated code ships the recipe that changes apps already generated.

## 5. Risks

- **It is a product:** docs, stable APIs and care with breaking changes, in two languages. Each stage is
  useful even if the next never happens.
- **Curated versions drift.** A library release can break roux's combination; the BOM pins, and the
  contract tests and `reference/` catch it before an app does.
- **Extracting changes behaviour.** Moving code into a library tempts cleanup. Stage 1 moves code as it
  is; changes are separate commits with their own tests.
- **Operations that refuse too often teach agents to work around them.** noir measures how often agents
  use an operation versus doing the work by hand.

## 6. Left to the builder

- Module and package names inside `roux-problems` beyond those given; the conditional advice classes'
  names.
- The npm workspace tool (npm workspaces, matching the template's `package-lock.json`, unless there is a
  reason otherwise) and the Vite library configuration.
- How the contract fixtures are loaded in each language.

## 7. Open questions

- Members: a generator recipe, a `roux-members` module, or left in `roux new`'s output.
- The template engine for the generator (JTE or Pebble) and how the CLI binary is distributed.
- Which Spring Boot and Java versions a roux release supports, and for how long.
