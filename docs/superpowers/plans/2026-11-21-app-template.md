# App Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A domain-free roux app that builds native and meets roux's coverage and mutation gates at `templates/app`, tested in roux's build, released to Maven Central as `roux-app-archetype` so noir generates new apps with `mvn archetype:generate`.

**Architecture:** `templates/app` is the dojo with its domain removed, a real app with its own
`spring-boot-starter-parent` pom, built in roux's `examples` profile. `runtime/roux-app-archetype`
copies it at build time into `archetype-resources`. It turns only the name spots into `${artifactId}`
and `${appName}`, sets the released roux versions, regenerates the frontend lock, and proves the
output with `archetype:integration-test`.

**Tech Stack:** Maven (maven-archetype-plugin 3.4.1, maven-antrun-plugin, maven-invoker-plugin,
frontend-maven-plugin 1.15.1), Spring Boot 4.1, Java 25, React 19 / Vite / Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-21-app-template-design.md`

## Global Constraints

- Java package of the template and every generated app: `app` (e.g. `app.App`, `app.identity.Roles`).
- Template's name in the repository: **`Roux App`**, slug **`roux-app`**. These two strings appear
  only in the name spots (Task 5's list), so the archetype can replace them exactly.
- Template pom: parent `org.springframework.boot:spring-boot-starter-parent` (the version the root
  pom's `spring-boot.version` names), own `<version>0.0.1-SNAPSHOT</version>`, `groupId` `app`,
  `roux-bom` imported at `${roux.version}`, and `<roux.version>` equal to roux's version (now
  `0.3.0-SNAPSHOT`).
- None of roux's reactor-only properties in the template pom (`skipPublishing`, `sonar.skip`,
  `jacoco.skip`, `maven.deploy.skip`).
- No domain code, no CSV export (`Csv`, `ExportTooLargeException`, `ExportButton`,
  `UsersExportController`, `UserCsv`), no `roux-money` dependency, no `noir-gen:` markers.
- One invitable role, `USER`, granted nothing. The owner role is roux's `RouxRoles.OWNER`.
- Archetype required properties: `artifactId` (regex `^[a-z][a-z0-9-]{0,62}$`) and `appName`
  (regex `^[A-Za-z0-9][A-Za-z0-9 .,'&()-]{0,79}$`). `groupId` defaults to `app` and `version` to
  `0.0.1-SNAPSHOT`.
- Quality gates in the template (so in every generated app): JaCoCo 100% lines and branches in
  `./mvnw verify`; PIT with no survivors under `./mvnw -Ppit verify`; Vitest coverage 100% (lines,
  branches, functions, statements) in the build; Stryker `break: 100` in `npm run mutate`. No code
  is excluded to pass a gate; only tests, test helpers and generated files are excluded.
- Native: `./mvnw -Pnative-e2e verify` passes in the template with GraalVM 25. Missing metadata is
  fixed in the roux module that needs it, never in the template.
- Never suppress warnings; no star imports (global CLAUDE.md).
- Before pushing: `./mvnw verify` and `./mvnw -Ppit verify` both pass (roux memory: CI before push).
  Push straight to main, with no PR.

## Review Focus

1. **An app name with XML/YAML/Velocity metacharacters** (`Ben & Jerry's`, `#1 Gym`, `$tore`).
   `appName` goes only into double-quoted YAML and the README, never into XML or JSON. The regex
   rejects `"`, `\`, `$`, `#`. Task 6 generates `Ben & Jerry's (Scoops)` and builds it.
2. **Dotfiles and dot-folders lost in the archetype** (`.gitignore`, `.mvn/wrapper/`, `.github/`,
   `.noir/`). Maven resources drop `.gitignore` by default. Task 6 asserts each exists in the
   generated app.
3. **Working-tree junk shipped in the archetype** (`node_modules/`, `target/`, `dist/`,
   `test-results/`, `*.tsbuildinfo`, `src/node_modules/.vite`). Task 5's copy excludes them, and
   Task 6 asserts none is in the generated app.
4. **A generated app still pointing into roux's repository** (`file:../../../web/roux-web`, the
   `roux-repository` profile, `roux-parent`, the old lock's link). Task 6 greps the generated app for
   `web/roux-web`, `roux-parent` and `roux-repository` and expects nothing.
5. **Template version drift after a version bump** (roux moves to `0.4.0-SNAPSHOT`, and the
   template's `roux.version` is left at `0.3.0-SNAPSHOT`). Task 5's build fails on a SNAPSHOT build
   whose template `roux.version` differs from the project version.

---

### Task 1: Cut `templates/app` from the dojo

**Files:**
- Create: `templates/app/**`, copied from `examples/dojo` with what is listed below removed
- Modify: `pom.xml` (the `examples` profile's `<modules>`: add `templates/app`)
- Modify: `.github/workflows/ci.yml` (upload `templates/app/target/{playwright.log,app.log,surefire-reports/,failsafe-reports/}` beside the dojo's)

**Interfaces:**
- Produces: a buildable `templates/app` whose name spots are exactly the ones Task 5 lists. Java
  package `app`, with `app.App` as the `@SpringBootApplication`.

- [ ] **Step 1: Copy and trim.** Copy `examples/dojo` without `target/`, `node_modules/`,
  `frontend/src/node_modules/`, `e2e/test-results/`, `*.tsbuildinfo` or `FINDINGS.md`. Delete the
  domain: the Java packages `attendance`, `plans`, `classes`, `students`, `ranks`, `memberships`,
  `payments` and `web/Csv*`/`ExportTooLarge*` with their tests, the `users/UserCsv` and
  `UsersExportController` classes with their tests, the frontend feature folders of the same names,
  `shell/ExportButton*`, the routes `payments`, `plans`, `ranks`, `timetable`, and every E2E spec
  except `owner`, `members-lifecycle`, `appearance`, `look`, `csp`, `caching`, `problems`, `url`,
  `code`, plus `helpers.ts`.
- [ ] **Step 2: Repackage.** Move `org.jwcarman.roux.examples.dojo` to `app`, and rename
  `DojoApplication` to `App` and `DojoApplicationTests` to `AppTests`. Rename the frontend's
  `members/` folder to `users/` (and the `/members` routes to `/users`, updating
  `SpaController`-style route lists and the E2E specs). `PackageLayoutTest` stays as it is: it checks
  directories, not names.
- [ ] **Step 3: Schema.** In `db.changelog-master.xml`, keep only `spring-session.xml` and
  `roles.xml`. roux's modules ship their own changelogs, so `members.xml`, `theme.xml` and
  `theme-moved.xml` are dojo history and go. Rewrite `roles.xml` as one changeset
  `app-roles-1` that inserts role `USER` (`ON CONFLICT (name) DO NOTHING`) and grants OWNER only the
  `users.*` permissions roux expects apps to grant (what the dojo grants OWNER today, minus every
  domain permission). `Permissions` keeps no domain constants. `PermissionsTest` still checks the
  changelog against `Permissions` and writes `permissions.gen.ts`.
- [ ] **Step 4: Config.** In `application.yml`: `spring.application.name: roux-app`,
  `roux.theme.app-name: "Roux App"`, `who.email.from: noreply@roux-app.test`,
  `roux.roles.invitable: [USER]`, `roux.organization.time-zone: UTC`, `locale: en-US`. Comment the
  last two "set these to where the app's users are". Remove `roux.money`.
- [ ] **Step 5: The pom.** Rewrite it as Global Constraints say: parent `spring-boot-starter-parent`,
  `groupId` `app`, `artifactId` `roux-app`, `<name>roux-app</name>` (the slug, since XML never takes
  `appName`). Declare explicitly everything the dojo inherited from `roux-parent`: the Java 25
  release, Lombok's annotation processor path, failsafe for `E2eIT`, and Spotless with
  google-java-format GOOGLE style and the same import order (versions as `roux-parent` sets them
  today). Put the `roux-web-npm-ci` and `roux-web-build` executions (working directory `../../web`)
  in a profile with id `roux-repository`, activated by `<file><exists>${basedir}/../../web/roux-web/package.json</exists></file>`.
  Everything else in the frontend plugin stays in the main build.
- [ ] **Step 6: Frontend and e2e names.** `frontend/package.json` `name` becomes `roux-app-web`,
  and `e2e/package.json` `name` becomes `roux-app-e2e`. The roux-web dependency stays
  `file:../../../web/roux-web`. Run `npm install` in both to refresh the locks.
- [ ] **Step 7: Home.** `shell/Home.tsx` becomes the placeholder: heading `Home`,
  `Welcome, {displayName}`, and links to Settings and, with `USERS_READ`, Users. The existing
  Home test (or a new `Home.test.tsx`) asserts the Users link shows only with `USERS_READ`.
- [ ] **Step 8: Add to the reactor.** Add `<module>templates/app</module>` to the `examples` profile
  in the root `pom.xml`, and add the CI log upload paths.
- [ ] **Step 9: Verify.** Run `./mvnw -B verify -pl templates/app -am`. Expected: BUILD SUCCESS,
  Vitest green, and `E2eIT` passing every remaining spec. Then run
  `grep -rIl --exclude-dir=node_modules --exclude-dir=target -e 'dojo' -e 'Dojo' templates/app`.
  Expected: no output.
- [ ] **Step 10: Commit.** `feat(templates): the app template, the dojo with no domain`

### Task 2: The template's own docs, CI and noir config

**Files:**
- Create: `templates/app/README.md`, `templates/app/CLAUDE.md`, `templates/app/.github/workflows/ci.yml`, `templates/app/.noir/project.yaml`
- Modify: `templates/app/.gitignore` (if the dojo's names anything dojo-specific)

**Interfaces:**
- Consumes: Task 1's template.
- Produces: `README.md` whose first line is exactly `# Roux App` (a name spot for Task 5).

- [ ] **Step 1: README.md.** Title `# Roux App`. Sections: Running locally (`docker compose up -d`,
  `./mvnw spring-boot:run`, Mailpit at http://localhost:8025 for the owner's sign-in link,
  `roux.owner.email`/`roux.owner.name`), Production (the settings `application-prod.yml` reads from
  the environment, SMTP, owner email), Starting a new app from this template (the
  `mvn archetype:generate` command from the design's "How noir uses it", then
  `chmod +x mvnw && git init`), Adding a first feature (points at the roux plugin's skill and
  `docs/guides`).
- [ ] **Step 2: CLAUDE.md.** Rewrite the dojo's as the template's. It covers where things go
  (package by feature under `app`, changelog per feature, route file + page in the feature folder,
  nav entry), the rules that are easy to miss (permissions not roles, Problem Details, injected
  `Clock`, versions and 409, `meta.refreshes`), tests (`@AppTest`, `TestUsers`, strict MSW,
  `renderRoute`), and "use the roux skill; read its guide before writing code". No dojo or
  domain words.
- [ ] **Step 3: CI and noir.** Copy `noir-app-template`'s `.github/workflows/ci.yml` (verify with
  Chromium system libraries, logs uploaded on failure), but not `native.yml`. Copy
  `noir-app-template`'s `.noir/project.yaml` (postgres:16 and mailpit services, `typescript.root:
  frontend`).
- [ ] **Step 4: Verify.** `grep -c 'Roux App' templates/app/README.md` prints at least `1`. Then run
  `grep -rIl --exclude-dir=node_modules --exclude-dir=target -e 'Roux App' -e 'roux-app' templates/app`.
  Expected: exactly `pom.xml`, `src/main/resources/application.yml`, `frontend/package.json`,
  `frontend/package-lock.json`, `e2e/package.json`, `e2e/package-lock.json`, `README.md`. If any
  other file shows up, change it so it doesn't mention the name.
- [ ] **Step 5: Commit.** `docs(templates): the app template's README, CLAUDE.md, CI and noir config`

### Task 3: The template meets roux's coverage and mutation gates

**Files:**
- Modify: `templates/app/pom.xml` (JaCoCo check, `pit` profile, the frontend build runs `npm run coverage`)
- Modify: `templates/app/frontend/package.json` (scripts `coverage`, `mutate`; devDependencies `@vitest/coverage-v8`, `@stryker-mutator/core`, `@stryker-mutator/vitest-runner` at roux-web's versions)
- Modify: `templates/app/frontend/vite.config.ts` (coverage thresholds 100, excludes)
- Create: `templates/app/frontend/stryker.config.json`
- Modify: `templates/app/.gitignore` (`.mutation-history/`, `reports/`)
- Create/modify: tests under `templates/app/src/test/java/app/**` and `templates/app/frontend/src/**/*.test.tsx` until the gates pass
- Modify: `.github/workflows/ci.yml` (a `template-mutation` job: `./mvnw -B -Ppit verify` and `npm run mutate` in `templates/app`)

**Interfaces:**
- Consumes: Tasks 1 and 2's template.
- Produces: `npm run coverage` and `npm run mutate` in `frontend/`, `./mvnw -Ppit verify` at the root, which Task 6's generated apps inherit.

- [ ] **Step 1: Java gates.** Copy roux's root pom JaCoCo setup (`prepare-agent`, `report`, a `check`
  rule of `LINE` and `BRANCH` `COVEREDRATIO` minimum `1.00`, the `@{jacocoArgLine}` surefire argLine)
  and its `pit` profile (pitest-maven, pitest-junit5-plugin, pitest-history-plugin, the same
  `mutationThreshold`/`timestampedReports`/history settings, history under
  `.mutation-history/`), with versions as roux's root pom sets them today. Exclude `app.App` from
  coverage only if `AppTests` cannot reach its `main`; prefer a test that calls it.
- [ ] **Step 2: Frontend gates.** Copy roux-web's coverage config (v8 provider, thresholds 100
  everywhere) and `stryker.config.json` (vitest runner, `perTest`, `break: 100`, incremental file
  `../.mutation-history/stryker-incremental.json`). `mutate` covers `src/**/*.{ts,tsx}` except
  `*.test.*`, `src/testing/**`, `src/routeTree.gen.ts` and `src/permissions.gen.ts`. The pom's
  `npm-test` execution runs `run coverage`.
- [ ] **Step 3: Run the gates and see them fail.** Run `./mvnw -B verify -pl templates/app -am
  -DskipITs`. Expected: FAIL at JaCoCo's check or Vitest's thresholds. Record the uncovered files.
- [ ] **Step 4: Add tests until coverage passes.** Add tests through the public behaviour (rendered
  screens with MSW, `@AppTest` endpoints) for each uncovered file. Re-run Step 3's command. Expected:
  BUILD SUCCESS.
- [ ] **Step 5: Kill every mutant.** Run `./mvnw -B -Ppit verify` and `npm run mutate` in
  `templates/app` (the first run is full, then it's incremental). Add or sharpen tests until
  both report no survivors. Never use an equivalent-mutant exclusion without first showing the
  mutant can't change behaviour, and if you do, add a comment naming why.
- [ ] **Step 6: CI job.** Add the `template-mutation` job, which caches `templates/app/.mutation-history`
  the way the `Mutation` workflow caches roux's.
- [ ] **Step 7: Commit.** `test(templates): the app template has full coverage and no surviving mutants`

### Task 4: The template builds and runs native

**Files:**
- Modify: `templates/app/pom.xml` (profiles `native`, `native-e2e`, `native-trace`, `traced`, and the `remove-aot-output` clean-up, from `~/IdeaProjects/noir-app-template/pom.xml`)
- Create: `templates/app/scripts/trace.sh` (from noir-app-template), `templates/app/.github/workflows/native.yml` (from noir-app-template)
- Modify: `templates/app/src/test/java/app/E2eIT.java` (run the binary when `native-e2e` says so, as noir-app-template's does)
- Create: `.github/workflows/native.yml` in roux (nightly `cron` and `workflow_dispatch`; GraalVM 25; `./mvnw -B install -DskipTests` then `./mvnw -B -Pnative-e2e verify` in `templates/app`; logs uploaded on failure)
- Modify: whichever `runtime/roux-*` modules the native run shows missing metadata, each with a `*RuntimeHints` class registered the way `roux-problems`' `ProblemsRuntimeHints` is, and a unit test using `RuntimeHintsPredicates`

**Interfaces:**
- Consumes: Task 3's template.
- Produces: `./mvnw -Pnative-e2e verify` green in `templates/app`.

- [ ] **Step 1: Profiles.** Copy the four profiles, the AOT clean-up and `trace.sh`, adapting names
  (`noir-app-template` → `${project.artifactId}`, the binary at
  `target/${project.artifactId}`). Compare `E2eIT` with noir-app-template's and bring over its way
  of starting the binary.
- [ ] **Step 2: First native run.** With GraalVM 25 as `JAVA_HOME`, run `./mvnw -B install -DskipTests`
  at the root, then `./mvnw -B -Pnative-e2e verify` in `templates/app`. Expected: it may fail. Record
  every failure (build-time errors, and runtime `MissingReflectionRegistrationError`, missing
  resources or proxies in `target/app.log` and Playwright's report) and the roux module each belongs to.
- [ ] **Step 3: Trace what's missing.** Run the `native-trace` profile and diff
  `target/native-trace` against what roux's modules register, to find each missing hint's type,
  resource or proxy.
- [ ] **Step 4: Fix each in roux, test first.** For each module, write a failing
  `RuntimeHintsPredicates` test (e.g. `reflection().onType(UserRow.class)` for
  `RouxUsersRuntimeHints`), add the hints class and its registration, and run the module's tests.
  Each module's 100% coverage and PIT gates still apply. One commit per module:
  `fix(<module>): native hints for <what>`.
- [ ] **Step 5: Native passes.** Repeat Step 2 until `./mvnw -B -Pnative-e2e verify` in
  `templates/app` is BUILD SUCCESS with every Playwright spec passing against the binary.
- [ ] **Step 6: roux's native workflow.** Add `.github/workflows/native.yml` and run it once with
  `gh workflow run native.yml` after pushing (Task 7). Expected: success.
- [ ] **Step 7: Commit.** `feat(templates): the app template builds and runs native`

### Task 5: `roux-app-archetype` builds the archetype from the template

**Files:**
- Create: `runtime/roux-app-archetype/pom.xml` (packaging `maven-archetype`, extension `org.apache.maven.archetype:archetype-packaging:3.4.1`)
- Create: `runtime/roux-app-archetype/src/main/resources/META-INF/maven/archetype-metadata.xml`
- Modify: root `pom.xml` (`<modules>`: add `runtime/roux-app-archetype` after `roux-test`)

**Interfaces:**
- Consumes: the `templates/app` files (after Tasks 3 and 4) and Task 2's name spots.
- Produces: `org.jwcarman.roux:roux-app-archetype:${project.version}`, an archetype jar whose
  `archetype-resources/` is the template. Required properties are `artifactId` and `appName`. In a
  SNAPSHOT build, roux-web is a packed tgz at
  `runtime/roux-app-archetype/target/roux-web/jwcarman-roux-web-${project.version}.tgz`.

- [ ] **Step 1: Copy the template** (antrun, `generate-resources`). Copy `${basedir}/../../templates/app`
  to `${project.build.directory}/classes/archetype-resources` with `defaultexcludes="false"` and these
  excludes: `**/target/**`, `**/node_modules/**`, `**/dist/**`, `**/test-results/**`,
  `**/playwright-report/**`, `**/.mutation-history/**`, `**/reports/**`, `**/*.tsbuildinfo`, `**/.vite/**`, `.idea/**`, `*.iml`. Copying straight
  into `classes/`, rather than through the resources plugin, keeps `.gitignore`.
- [ ] **Step 2: Drift check** (antrun, before the replacements). When `project.version` ends with
  `-SNAPSHOT`, fail with the message `templates/app's roux.version is not ${project.version}: bump it
  with roux's version` unless the copied `pom.xml` contains `<roux.version>${project.version}</roux.version>`.
  Release builds skip the check.
- [ ] **Step 3: Versions and the repository profile.** In the copied `pom.xml`, set
  `<roux.version>` to `${project.version}` (the concrete value), and delete the
  `<profile>` whose `<id>` is `roux-repository` (regex replace over the whole element). In
  `frontend/package.json`, replace `file:../../../web/roux-web` with `${roux-web.spec}`. That
  property defaults to `file:${project.build.directory}/roux-web/jwcarman-roux-web-${project.version}.tgz`,
  and the `release` profile in the root pom sets it to `${project.version}`.
- [ ] **Step 4: Pack roux-web and regenerate the lock** (frontend-maven-plugin, `process-resources`).
  Install node v24.15.0. When not in the `release` profile, run `npm pack -w @jwcarman/roux-web
  --pack-destination ${project.build.directory}/roux-web` in `../../web` (after `npm ci` and the
  build, as the dojo does). Then run `npm install --package-lock-only --ignore-scripts` in
  `classes/archetype-resources/frontend`. In the release profile the same command resolves roux-web
  from npm, which release.yml has already published.
- [ ] **Step 5: Name spots** (antrun `replace`, after the lock is regenerated, because npm would
  reject a package named `${artifactId}-web`). Replace `roux-app` with `${artifactId}` in `pom.xml`,
  `src/main/resources/application.yml`, `frontend/package.json`, `frontend/package-lock.json`,
  `e2e/package.json` and `e2e/package-lock.json`. Replace `Roux App` with `${appName}` in
  `src/main/resources/application.yml` and `README.md`. Then fail the build if `Roux App` or
  `roux-app` is left anywhere under `archetype-resources`.
- [ ] **Step 6: archetype-metadata.xml.** `requiredProperties`: `artifactId` and `appName` with
  Global Constraints' regexes, `groupId` default `app`, `version` default `0.0.1-SNAPSHOT`. File
  sets: one `filtered="true"` set with exactly `pom.xml`, `src/main/resources/application.yml`,
  `frontend/package.json`, `frontend/package-lock.json`, `e2e/package.json`,
  `e2e/package-lock.json`, `README.md`, and one `filtered="false"` set with `**/*` excluding those
  seven. Every file set has `packaged="false"`, since the package is fixed. In `application.yml`, the
  `app-name` value stays double-quoted: `"${appName}"`.
- [ ] **Step 7: Skip what does not apply.** In the module's pom, skip JaCoCo's coverage check and
  PIT, since the module has no Java. Keep publishing on, because this module ships to Central.
- [ ] **Step 8: Verify.** Run `./mvnw -B package -pl runtime/roux-app-archetype -am -DskipTests`.
  Expected: BUILD SUCCESS. Then `unzip -l runtime/roux-app-archetype/target/roux-app-archetype-0.3.0-SNAPSHOT.jar | grep -c node_modules`
  prints `0`, and the same listing contains `archetype-resources/.gitignore` and
  `archetype-resources/.mvn/wrapper/maven-wrapper.properties`. Next, change
  `templates/app/pom.xml`'s `roux.version` to `0.0.0-SNAPSHOT` and re-run: expected BUILD FAILURE with
  Step 2's message. Then revert it.
- [ ] **Step 9: Commit.** `feat(archetype): roux-app-archetype, built from templates/app`

### Task 6: The archetype's integration test generates and builds apps

**Files:**
- Create: `runtime/roux-app-archetype/src/test/resources/projects/acme-gym/{archetype.properties,goal.txt}`
- Create: `runtime/roux-app-archetype/src/test/resources/projects/scoops/{archetype.properties,goal.txt}`
- Create: `runtime/roux-app-archetype/src/test/resources/projects/verify.groovy` (post-build hook; or one per project if the plugin requires it)
- Create: `runtime/roux-app-archetype/src/it/settings.xml`
- Modify: `runtime/roux-app-archetype/pom.xml`

**Interfaces:**
- Consumes: Task 5's archetype jar.

- [ ] **Step 1: Test projects.** `acme-gym/archetype.properties`: `groupId=app`,
  `artifactId=acme-gym`, `version=0.0.1-SNAPSHOT`, `package=app`, `appName=Acme Gym`.
  `scoops/archetype.properties`: `artifactId=scoops`, `appName=Ben & Jerry's (Scoops)`, otherwise the
  same. `goal.txt` in each holds `verify -DskipITs`.
- [ ] **Step 2: The post-build checks** (`verify.groovy`, run on each generated project). They assert:
  - these exist: `.gitignore`, `.mvn/wrapper/maven-wrapper.properties`, `mvnw`,
    `.github/workflows/ci.yml`, `.noir/project.yaml`, `compose.yaml`,
    `src/main/java/app/App.java`;
  - none of these exist: `frontend/node_modules/.vite`, `e2e/test-results`, `e2e/node_modules`
    (the hook runs after the goal, so `target/` and `frontend/node_modules` are the build's own;
    Task 5's jar listing covers what was shipped);
  - `pom.xml` contains `<artifactId>${artifactId}</artifactId>` with the real value, and
    `<roux.version>${project.version}</roux.version>` with the concrete version;
  - `application.yml` contains `app-name: "Acme Gym"` (and `"Ben & Jerry's (Scoops)"` for scoops) and
    `name: acme-gym`;
  - `README.md` starts with `# Acme Gym`;
  - no file contains `web/roux-web`, `roux-parent`, `roux-repository`, `Roux App` or `roux-app`.
- [ ] **Step 3: Run them failing.** Run `./mvnw -B verify -pl runtime/roux-app-archetype -am`
  before wiring the local repository (Step 4). Expected: FAIL resolving
  `roux-bom:0.3.0-SNAPSHOT`, since `verify` installs nothing to `~/.m2`.
- [ ] **Step 4: An isolated local repository.** The module depends (scope `provided`) on
  `roux-spring-boot-starter`, `roux-theme`, `roux-test` and `roux-bom` (type `pom`), and
  `maven-invoker-plugin:install` (phase `pre-integration-test`) puts them in
  `${project.build.directory}/it-repo`. `archetype:integration-test` runs with
  `localRepositoryPath=${project.build.directory}/it-repo` and `settingsFile=src/it/settings.xml`,
  which mirrors central to the developer's own local repository (`file://${settings.localRepository}`,
  filtered in), with central behind it. That way third-party artifacts and plugins are not
  downloaded again. Archetype resolution for the test comes from the module itself.
- [ ] **Step 5: Run them passing.** Run `./mvnw -B verify -pl runtime/roux-app-archetype -am`.
  Expected: BUILD SUCCESS. Both generated apps compile, and their Java tests (Testcontainers), Vitest
  and both coverage gates pass.
- [ ] **Step 6: Prove the checks bite.** Temporarily delete the `.gitignore` copy's
  `defaultexcludes="false"` from Task 5's Step 1 and re-run. Expected: FAIL on the `.gitignore`
  assertion. Then revert it.
- [ ] **Step 7: Commit.** `test(archetype): generated apps build, with names and versions set`

### Task 7: Release, docs and the plugin

**Files:**
- Modify: root `pom.xml` (`release` profile: `<roux-web.spec>${project.version}</roux-web.spec>`)
- Modify: `.github/workflows/release.yml` (only if needed; see Step 2)
- Modify: `README.md` (Modules: `runtime/roux-app-archetype`, `templates/app`; Releasing: the template's `roux.version` is bumped with roux's own)
- Modify: `docs/guides/getting-started.md` (a "Start a new app" section first: the archetype command, then `chmod +x mvnw`, `git init`, before the hand-wiring sections)
- Modify: `plugins/roux/skills/roux/references/getting-started.md` via `plugins/roux/scripts/sync-references.sh`
- Modify: `CHANGELOG.md` (Unreleased: the template and the archetype)

- [ ] **Step 1: The release profile.** Add `roux-web.spec` to the `release` profile. In a scratch
  clone, run `./mvnw -B versions:set -DnewVersion=9.9.9 -DprocessAllModules=true
  -DgenerateBackupPoms=false`, then `./mvnw -B -P release -DskipTests package -pl
  runtime/roux-app-archetype -am`. Expected: BUILD FAILURE at `npm install --package-lock-only` with `No matching
  version found for @jwcarman/roux-web@9.9.9`. That proves the release path resolves roux-web from npm.
- [ ] **Step 2: release.yml.** Confirm the Central job's `mvn ... versions:set` plus build includes the
  archetype module (it is a regular module, so it should), that node is available to it
  (frontend-maven-plugin installs its own), and that the npm job runs first (`needs: [verify, npm]`,
  already true). Change the workflow only if one of those fails. Check that the Central bundle step's
  `find runtime/roux-*/target -name "roux-*-${RELEASE_TAG}.jar"` picks up `roux-app-archetype`.
- [ ] **Step 3: Docs.** README, getting-started (then `sync-references.sh`, and
  `check-guides.mjs` passes), CHANGELOG.
- [ ] **Step 4: Full verification.** Run `./mvnw -B verify`. Expected: BUILD SUCCESS (dojo, template
  and archetype). Then run `./mvnw -B -Ppit verify`. Expected: BUILD SUCCESS; the examples profile is
  off, so the template is not mutation-tested, and the archetype module has PIT skipped.
- [ ] **Step 5: Commit and push.** `docs: start a new app from roux-app-archetype`, then
  `git push origin main`.
