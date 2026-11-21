# The roux app template

## Intent

noir builds every app on roux, and James bootstraps demonstrations and rapid prototypes the same way.
Both need the same starting point: an app that runs, signs people in, and is ready for its first
feature in minutes, with nothing in it that roux already owns and no domain at all.

Today that starting point is `noir-app-template`, a separate repository that predates most of roux
and carries its own copies of members, invitations, the shell and Appearance. The dojo
(`examples/dojo`) has since become the most current roux app. The new template is the dojo with its
domain removed, kept inside the roux repository so it can never fall behind roux, and published as a Maven
archetype built from it, which only has to set a name and versions. noir generates apps from the archetype directly.

The person who signs in to a demo is the solution's owner (the factory's customer, seeing what was
built for them). They get in by an emailed sign-in link: noir sets `roux.owner.email` to their address
when it deploys, and roux makes them the owner. Locally, Mailpit catches the same email.

## Goals

- `mvn archetype:generate` with `roux-app-archetype`, an `artifactId` and an `appName`, writes a new app that builds, passes its tests and runs with
  `docker compose up` + `./mvnw spring-boot:run`, with no further edits.
- Day one, the app has: sign-in (email link with code, passkeys), the first owner from config, the
  sidebar frame with nav, account menu and colour mode, a Users page (invite, rename, change roles,
  deactivate/reactivate), Settings (profile, emails, passkeys), Appearance, and a Home placeholder.
- Day one, the app has tests wired: `@AppTest` + `TestUsers`, Vitest + MSW with `renderRoute`, and a
  Playwright suite run by `E2eIT` inside `./mvnw verify`.
- The template is a module of roux's build: `./mvnw verify` in roux runs its tests and E2E suite on
  every change, as it does the dojo's.
- What a new app gets is exactly what is in `templates/app` at a roux release, plus the name and
  released versions.
- **Native out of the box.** A generated app builds a GraalVM native binary (`./mvnw -Pnative
  package`) and passes its whole Playwright suite against it (`./mvnw -Pnative-e2e verify`), with
  no edits.
- **Zero surviving mutants and 100% coverage**, Java and frontend, in the template and so in every
  generated app: JaCoCo at 100% lines and branches in `./mvnw verify`, PIT with no survivors under
  `./mvnw -Ppit verify`, Vitest coverage at 100% in `npm run coverage`, Stryker with `break: 100`
  in `npm run mutate`. Both mutation runs are incremental (`.mutation-history/`, git-ignored).

## Non-goals

- Any domain code, sample data, seed data or demo personas (the parked "demo personas" work comes
  after this).
- A way into a demo other than the emailed link (such as through the factory's own sign-in).
- CSV export (the dojo's `Csv`, `ExportTooLargeException`, `ExportButton`, `UsersExportController`).
- noir's old generators and their `noir-gen:` markers (noir no longer has them).
- Migrating `noir-app-template` or any existing noir app onto this template.
- Thinning the frontend frame and users screens into roux-web. That is the app-skeleton UI work
  (`2026-11-20-app-skeleton-design.md`), which comes next and slims the dojo and the template together.

## Anti-goals

- **A template that is not a real app.** No placeholders, no Velocity or mustache markers: the files
  in `templates/app` compile, test and run as they are.
- **Rewriting code to generate an app.** The archetype sets names and versions in a fixed, small set of
  places; it never renames a Java package or edits source code.
- **Drift.** A roux change that breaks the template fails roux's build, the same as the dojo.

## Constraints

- roux's fixed stack (Java 25, Spring Boot 4.1, Maven, PostgreSQL + Liquibase, who, React 19, Chakra
  UI v3, TanStack, Zod 4, Vitest + MSW, Playwright).
- The template's pom is an ordinary app's pom, as `docs/guides/getting-started.md` describes: parent
  `spring-boot-starter-parent`, `roux-bom` imported at `${roux.version}`. Not the dojo's
  `roux-parent` parent.
- Inside roux's reactor, `roux.version` must equal roux's own version, so the template builds
  against the roux modules beside it.
- The frontend links `web/roux-web` from the repository, as the dojo does
  (`"@jwcarman/roux-web": "file:../../../web/roux-web"`).
- Releases tag a commit whose versions are still `-SNAPSHOT` (release.yml sets versions in CI and
  does not commit them), so the archetype, built in the release job, carries the released version.
- Two E2E suites in CI instead of one: the template's is small (a handful of specs), so the added
  time should be small too.

## Approaches

**Where the template lives:**

- A. Rebuild `noir-app-template` in place. noir changes nothing, but it stays outside roux, drifts,
  and strips its copies of roux's code one by one.
- B. A new template repository, cut from the dojo. Most current starting point, but a second app
  outside roux's build, so it drifts too.
- **C. Cut from the dojo, kept in the roux repository (chosen).** Built and tested with roux, so it
  never falls behind and each release's template matches that release. Costs: a release has to
  carry the template out of the repository with released versions (the archetype does).

**How an app is generated:**

1. Copy and rename (artifactId, Java package, title). Simple, but renaming a Java package across
   sources and tests is the fragile, silent-breakage part.
2. A Maven archetype. Versions pinned for free, but the source becomes templates rather than a real
   app, awkward for TSX, and proving it means generating then building.
3. **Copy with nothing to rename (chosen).** Every app uses the fixed Java package `app`; generating
   is a copy plus setting the name and versions in a few places. The template in roux is exactly what
   an app gets, and roux's build already proves it.
4. An agent writes it from the guides. Different every time; rejected.

**How an app is delivered (revised):** first designed as `roux-new.sh` fetching `templates/app` from a
release tag with `git clone` and setting names and versions itself. Changed to: **a Maven archetype
built from `templates/app`, published to Central with each release, used directly by noir (no
wrapper command).** The archetype pins versions for free (the 0.3.0 archetype makes a 0.3.0 app), needs no
tag lookup or clone, works offline from `~/.m2`, and `archetype:integration-test` proves the
generated app inside roux's build. Option 2's objection (source becomes templates) does not apply:
the archetype's resources are copied from the real app at build time, never edited by hand. What an
archetype cannot do (the executable bit on `mvnw`, `git init` and a first commit) is noir's job.

**When:** build the template now, carrying the dojo's current frontend frame and users screens
(about 20 files), rather than first finishing the app-skeleton UI in roux. James chose now: a
working starting point for prototypes immediately, and a second consumer that keeps the coming
extraction general.

## Decided

### Location and build

- `templates/app` in the roux repository, a module of the `examples` profile (on by default, off
  under `-P release` and `-P pit`), beside `examples/dojo`. Never deployed, published, analysed or
  counted by roux's coverage gate (the dojo's `maven.deploy.skip`, `skipPublishing`, `sonar.skip`,
  `jacoco.skip`).
- CI runs it as it runs the dojo, including Playwright and uploading its logs and reports on failure.

### What is in it

Cut from the dojo with every domain package, changelog, route, page, test and E2E spec removed:

- Java, package `app`: `App` (`@SpringBootApplication`), `identity/Roles` and
  `identity/Permissions` (one example invitable role, `USER`, granted nothing yet; the owner role is
  roux's `RouxRoles.OWNER`), `persistence/PersistenceConfig`, and whatever `AppProperties` the
  remaining config needs.
- Resources: `application.yml`, `application-dev.yml`, `application-prod.yml` (real SMTP, the
  owner from the environment), changelogs `spring-session.xml`, the users/roles/theme ones the
  remaining features need, and the master.
- Java tests: the dojo's non-domain tests (application context, `SpaRoutingTest`,
  `ProductionProfileTest`, `SessionCookieTest`, `SpringSessionTest`, `PackageLayoutTest`,
  `PermissionsTest` writing `permissions.gen.ts`, `ShellThemeTest`, problems tests, invitation tests,
  `E2eIT`).
- Frontend: `main.tsx`, `api.ts`, `queryKeys.ts`, `who.ts`, `permissions.gen.ts`, the dojo's `shell/`
  (minus `ExportButton`) and its users screens, routes `__root`, `_signedIn`, `signin/index`,
  `signin/link`, `_signedIn/index` (Home), users list and detail, `settings`, `appearance`, and
  `testing/`.
- E2E: the non-domain specs (owner signs in, users lifecycle, appearance and look, CSP, caching,
  problems, URL) with their helpers.
- `compose.yaml` (PostgreSQL + Mailpit), `.noir/project.yaml` (the same services noir's
  `noir-app-template` declares), `lombok.config`, `.gitignore`, the Maven wrapper.
- `README.md`: how to run it, the production settings, how to add a first feature.
- `CLAUDE.md`: where things go and the rules that are easy to miss, written for roux (pointing at the
  roux plugin's skill for the how), replacing the dojo's.
- Home is a placeholder: a heading, a welcome line, links to what the signed-in user may open. The
  first feature replaces it.
- `roux.organization` (time zone, locale) keeps neutral defaults with a comment saying to set them.
  `roux-money` is not a dependency; an app adds it when it has money.

### Names

The archetype sets the name in exactly these places, and nothing else in the template contains the
name:

- `pom.xml`: `artifactId` (the name's slug, e.g. `acme-gym`) and `name`.
- `application.yml`: `spring.application.name` (slug), `roux.theme.app-name` (the name), and
  `who.email.from` (`noreply@<slug>.test`, a development value; prod sets its own).
- `frontend/package.json` and `e2e/package.json`: `name` (slug).
- `README.md`: the title line.

In the repository the template's name is `App` (slug `app`).

### Versions

- In the repository, `roux.version` is roux's current version and roux-web is linked from
  `web/roux-web`.
- The archetype carries the released versions: `roux.version` and `@jwcarman/roux-web` are set to the
  archetype's own version when it is built, and `frontend/package-lock.json` is regenerated against
  that published roux-web (`npm install --package-lock-only`). release.yml publishes npm before
  Central, so the version exists when the archetype is built in the Central job.
- roux's version bumps must also bump the template's `roux.version` (a property `versions:set` does
  not reach). A test in roux's build fails if they differ.

### The archetype

- Module `runtime/roux-app-archetype` (artifactId `roux-app-archetype`), released to Central with
  roux's other modules and aligned by `roux-bom`'s versioning.
- Its build copies `templates/app` (minus `target/`, `node_modules/`, build output) into
  `archetype-resources`, then turns only the name spots (see Names) into `${artifactId}` and
  `${appName}` and the versions into the release's. Nothing under `archetype-resources` is edited by
  hand or committed.
- `archetype-metadata.xml` filters only the name and version files. Everything else, TSX included,
  is copied raw (Velocity would break on `${…}` and `#`). Dotfiles and dot-folders (`.gitignore`,
  `.mvn/`, `.github/`, `.noir/`) get explicit file sets, with default excludes off.
- Required properties: `artifactId` and `appName`. `groupId` and `version` default to `app` and
  `0.0.1-SNAPSHOT`, and `package` is not used (the Java package is fixed).
- `archetype:integration-test` generates an app in roux's build and runs its `verify` with
  `-DskipITs`, so the generated output compiles and its unit and Vitest tests pass. The E2E suite runs
  once, in `templates/app` itself.

### How noir uses it

- noir runs `mvn -B archetype:generate -DarchetypeGroupId=org.jwcarman.roux
  -DarchetypeArtifactId=roux-app-archetype -DarchetypeVersion=<x.y.z> -DartifactId=<slug>
  -DappName="<name>"` (non-interactive), then makes `mvnw` executable, runs `git init` and makes one
  commit. noir picks the version and the slug; roux ships no wrapper command.
- The template's README says the same for a person starting an app by hand.
- Before 0.3.0 is released, `./mvnw install` in a roux checkout puts the SNAPSHOT archetype in
  `~/.m2`, and `-DarchetypeVersion=0.3.0-SNAPSHOT` uses it.

### Settled after the builder check (Claude's calls, for James to check)

- **The pom is self-contained.** It declares everything the dojo inherits from `roux-parent` that a
  real app needs (Java 25 compiler and Lombok, failsafe + `E2eIT`, frontend-maven-plugin, Spotless,
  enforcer if the guide asks for it), as a generated app's pom must. The duplication with the dojo is
  accepted. It carries none of roux's reactor-only properties: `skipPublishing`, `sonar.skip` and
  `jacoco.skip` only act on `roux-parent`'s children, and the `examples` profile already keeps it out
  of `-P release`. The one that would matter, `maven.deploy.skip`, is harmless in an app and stays out
  too. Where the pom and `getting-started.md` disagree, one is fixed so they match.
- **Versions in the repository.** The template's own `<version>` is `0.0.1-SNAPSHOT` and is never
  touched by roux's version bumps. `roux.version` is a property, so `versions:set` does not reach it:
  wherever roux's version is set (the post-release bump to the next `-SNAPSHOT`, and release.yml if it
  builds the template), it is also set with `versions:set-property -Dproperty=roux.version` or a
  `sed`. A test in roux's build reads both and fails if they differ.
- **CI and wrapper.** The template has its own Maven wrapper (real files, no symlinks) and a
  `.github/workflows/ci.yml` modelled on `noir-app-template`'s (`./mvnw -B verify` with Chromium's
  system libraries, logs uploaded on failure), and `noir-app-template`'s `native.yml` (nightly and on
  demand: GraalVM 25, `./mvnw -Pnative-e2e verify`).

### Native

- The template's pom carries `noir-app-template`'s native profiles: `native` (binary at package),
  `native-e2e` (the binary, then `E2eIT` against it), `native-trace` and `traced` (record and use
  tracing-agent metadata), plus its `remove-aot-output` clean-up and `scripts/trace.sh`.
- Missing reflection, resource or proxy metadata is fixed **in the roux module that needs it**
  (`RuntimeHints` registered through `aot.factories` or auto-configuration, as roux-problems and
  roux-validation do), never in the template. The template carries no hints of its own except for
  its own classes.
- roux's CI gets a nightly and on-demand `native` workflow that runs `./mvnw -Pnative-e2e verify`
  in `templates/app`, so a roux change that breaks native shows up within a day.

### Quality gates

- Java: the template's pom has roux's JaCoCo check (100% lines and branches, `verify`) and its
  `pit` profile (pitest-maven with the JUnit 5 and history plugins, no survivors allowed,
  incremental history in `.mutation-history/`), with versions copied from roux's root pom.
- Frontend: `npm run coverage` (Vitest v8 coverage, 100% thresholds on lines, branches, functions,
  statements) runs in the build instead of `npm test`. `npm run mutate` (Stryker, vitest runner,
  `perTest`, `break: 100`, incremental) is run like roux-web's, not inside `verify`. Exclusions copy
  roux-web's rules: tests, test helpers, generated files (`routeTree.gen.ts`, `permissions.gen.ts`).
- The dojo never met these gates. The template's copies of the shell and users screens get the tests
  they need until both gates pass; no code is excluded to pass them.
- roux's own `-Ppit` run still leaves the template out (the `examples` profile is off). The template's
  gates run in its own build, and CI runs `./mvnw -Ppit verify` and `npm run mutate` in
  `templates/app` as a separate job.
- **Ports.** The template's E2E and compose ports follow the dojo's (`${POSTGRES_PORT:-5432}` style
  overrides, Testcontainers in `E2eIT`). The reactor builds the two apps one after the other. If
  anything still clashes, the template takes different defaults and the dojo stays as it is.
- **Before the first release containing the template**, a locally installed SNAPSHOT archetype is
  the path (see How noir uses it). noir switches to the template only after 0.3.0 is released.
- **Tests that name packages** (`PackageLayoutTest` and the like) are written for package `app` in the
  template. It is a new copy, not a generated rewrite, so this is not "rewriting code to generate".
  The plugin's eval scripts (`eval-fixture.sh`, `check-roux-way.sh`) keep using the dojo and are not
  changed.

## Left to the builder

- Exactly which dojo tests and E2E specs survive, and trimming them to the template's features.
- Whether the frontend's users screens are renamed from the dojo's `members/` folder to `users/` in
  the template (the users rename is decided; the dojo just has not caught up).
- How the "template version equals roux version" test is written, and how release.yml bumps it.
- Tests of the generated app beyond `archetype:integration-test`: at least that every name and version
  was set and no `file:` link or `roux-parent` reference remains. Whether release.yml also builds an
  app generated from the just-published archetype is the builder's call.
- Updating roux's README and the getting-started guide to name the archetype as the way to start an
  app.

## Revisions (2026-11-21, after Task 2; these supersede the sections above where they differ)

- **Just the app.** The template holds the Java code, the frontend, the E2E suite and their config,
  nothing else: no `.github/` workflows, no `.noir/` config, no Maven wrapper. noir surrounds a
  generated app with the automation for its environment. A person starting one by hand runs
  `mvn wrapper:wrapper` to get `./mvnw`. In roux's repository the template builds with roux's own
  wrapper, and roux's own workflows run it.
- **Native tests as well as native E2E.** The template's native support is Spring Boot's:
  `./mvnw -PnativeTest test` runs the Java tests compiled into a native image (tests that use Mockito
  are `@DisabledInNativeImage`, since mocking does not work there), and the `native-e2e` profile runs
  the Playwright suite against the shipped binary. Both must pass. roux's own nightly workflow runs
  them; the template carries no workflow for it.
- **Two sign-in methods.** Email link (with its typed code) and passkey; the sign-in page has no
  provider (OIDC) buttons.
- **Liquibase session lock.** `liquibase-sessionlock` (a PostgreSQL advisory lock instead of the
  `DATABASECHANGELOGLOCK` table, so a crashed start leaves no stale lock) is managed by `roux-bom`
  and a dependency of the template.
- **A modern, elegant first impression.** Every page of the template, in light and dark, at phone,
  tablet and desktop widths, is reviewed against what a brand-new app is expected to look like today
  (simple, intuitive, polished). Changes are proposed to James before they are made; changes to the
  frame (`AppShell`, sign-in pieces, settings pieces) are made in roux-web so every app gets them.
- **Generators come next.** Code generators that add features to an app made from this template
  (noir's `noir gen` is prior art) are designed separately, right after this work. Until then the
  template's shared files carry no generator markers.
- Archetype note: Velocity treats `##` as a comment and `$`/`#` specially, so the archetype's
  filtered files are wrapped in `#[[ ]]#` with only the name tokens left outside.
