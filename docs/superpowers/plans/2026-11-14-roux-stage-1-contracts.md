# roux Stage 1: the Contracts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the template's error handling, API client, paging, tables and forms into roux, as
`roux-problems` plus `roux-bom` and `roux-spring-boot-starter` on the Java side and
`@jwcarman/roux-web` in the browser. Fixture tests prove the two halves agree. Then
`noir-app-template` moves onto them.

**Architecture:** The repository has a Maven reactor under `runtime/` and an npm workspace under
`web/`, and both read the wire-shape fixtures in `contracts/`. Code moves from `noir-app-template`
unchanged in behaviour. The only changes are the ones the spec names: advice is split by classpath,
`ConflictException` is new, and `configureApi` and the API path prefix become settings. `who` and
`jpa-utils` are curated (pinned in the BOM), not absorbed.

**Tech Stack:** Java 25, Spring Boot 4.1.2, Maven (wrapper), JUnit 5, JaCoCo, PIT. TypeScript, React
19, Chakra UI v3, TanStack Query/Table/Form, Vite 8 library mode, Vitest 5 with `@vitest/coverage-v8`,
MSW 3, Stryker.

**Spec:** `docs/superpowers/specs/2026-11-14-roux-design.md` (section 3 is this plan's scope).

**Source of moved code:** `~/IdeaProjects/noir-app-template` (`T/` below), Java package
`org.jwcarman.noir.app.web.problems`, frontend `T/frontend/src/`.

## Global Constraints

- Maven groupId `org.jwcarman.roux`; Java package root `org.jwcarman.roux`. npm package `@jwcarman/roux-web`.
- First version: Maven `0.1.0-SNAPSHOT` until the release sets `0.1.0`; npm `0.1.0`. One version for all of roux's parts.
- Java 25; Spring Boot 4.1.2. Curated pins in `roux-bom`: `who` 0.15.0 and `jpa-utils` 0.2.0 (`who` as the template uses it; `jpa-utils` at its current release, whose only change is tie order under a descending sort).
- License: Apache 2.0. Every Java file carries the same license header `who` uses, applied by Spotless with google-java-format, as in `who`'s POM.
- No `@SuppressWarnings`, `eslint-disable`, `// @ts-ignore` or other suppressions. No star imports in any language.
- Moved code keeps its behaviour, its messages and its doc comments. Cleanups are separate commits with their own tests.
- Every moved or new file meets the builder bar: 100% line and branch coverage (JaCoCo; Vitest V8), no surviving PIT mutants and no surviving Stryker mutants.
- Nothing noir-specific in roux: no `noir` in names, settings or text.
- Third-party versions are pinned exactly (no `^` in `devDependencies`; plugin versions as properties). Peer dependency ranges are the template's current ranges.
- Spring Boot 4 test slices live in their own modules (e.g. `spring-boot-webmvc-test`); use those, not Boot 3 imports.

## Review Focus

1. **A `who` sign-in failure must say "Sign-in failed", not "Sign in to continue".** `SignInFailedException` and `ReauthenticationRequiredException` extend Spring Security's `AuthenticationException`. Once the handlers sit in separate advice classes, the `who` advice has to be consulted before the security advice. → Task 2, test `signInFailureIsNotGenericSignIn`.
2. **An app with no Spring Security, no `who` and no `jpa-utils` starts cleanly.** `roux-problems` must not touch their classes when they are absent. → Task 2, `ApplicationContextRunner` with `FilteredClassLoader` tests.
3. **An app that defines its own error controller or advice keeps it.** roux's beans back off. → Task 1, `backsOffForUserErrorController`.
4. **A missing page outside the API still reaches the HTML error page**, including when the API prefix is configured to something other than `/api/`. → Task 1, `missingPageOutsideCustomPrefixGoesToErrorPage`.
5. **The template must end up with exactly one copy of `@jwcarman/roux-web` and React.** With two copies, `onSessionLost` listeners and form contexts would split and silently stop working. → Task 9, `npm ls` check plus the template's existing session-lost test.

---

## File Structure

```
roux/
  LICENSE                                  Apache 2.0 (copy from who)
  README.md                                first line: "roux (said "roo")…"; what roux is; modules
  mvnw, .mvn/                              Maven wrapper (copy from who)
  pom.xml                                  roux-parent: reactor, properties, plugins, profiles
  contracts/                               wire-shape fixtures, read by Java and Vitest tests
    problem-not-found.json  problem-invalid-fields.json  problem-invariant.json
    problem-conflict.json   problem-server-error.json    problem-unknown-sort.json
    page.json               page-params.json             session.json
  runtime/
    roux-bom/pom.xml                       roux modules + who 0.15.0 + jpa-utils 0.2.0
    roux-problems/                         errors (3.1)
      src/main/java/org/jwcarman/roux/problems/…
      src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
    roux-spring-boot-starter/pom.xml       roux-problems + jpa-utils
    roux-contract-tests/                   Java side of contracts/ (not published)
  web/
    package.json                           npm workspace root (private)
    roux-web/
      package.json  tsconfig.json  vite.config.ts  stryker.config.json
      src/problem/  src/api/  src/paging/  src/table/  src/form/  src/testing/ (private)
      src/contracts.test.ts                Vitest side of contracts/
  .github/workflows/ci.yml  release.yml
```

Java package `org.jwcarman.roux.problems` keeps the template's visibility. Public: the exceptions,
`FieldProblem`, `ProblemsAdvice`, `RootProblemsAdvice`, `ProblemErrorController`. Package-private:
`FieldErrors`, `ServerErrors`, `ProblemsRuntimeHints`. Auto-configuration lives in the same package,
so it can reach the package-private classes.

---

### Task 1: The Java build and `roux-problems`' core

**Files:**
- Create: `pom.xml`, `mvnw`, `.mvn/wrapper/*`, `LICENSE`, `README.md`, `.gitignore`
- Create: `runtime/roux-problems/pom.xml`
- Create (moved from `T/src/main/java/org/jwcarman/noir/app/web/problems/`): `FieldErrors`, `FieldProblem`, `InvalidFieldException`, `InvariantViolationException`, `NotFoundException`, `ProblemErrorController`, `ProblemsAdvice`, `ProblemsRuntimeHints`, `RootProblemsAdvice`, `ServerErrors` → `runtime/roux-problems/src/main/java/org/jwcarman/roux/problems/`
- Create: `ConflictException.java`, `RouxProblemsProperties.java`, `RouxProblemsAutoConfiguration.java`, `META-INF/spring/…AutoConfiguration.imports`
- Create: `runtime/roux-problems/src/main/resources/ValidationMessages.properties` (moved from `T/src/main/resources/`)
- Test (moved and adapted from `T/src/test/java/…/web/problems/`): `FieldErrorsTest`, `InvariantViolationExceptionTest`, `ProblemErrorControllerTest`, `ProblemsAdviceTest`, `ProblemsRuntimeHintsTest`, `ProblemsTestController`; new `RouxProblemsAutoConfigurationTest`, `ProblemsTestApplication`

**Interfaces:**
- Produces:
  - `public class ConflictException extends RuntimeException { public ConflictException(String pattern, Object... args) }`. It formats its message exactly as `InvariantViolationException` does (`String.format(Locale.ROOT, …)` when there are args). `ProblemsAdvice` answers it with 409, the detail being the message.
  - `@ConfigurationProperties("roux.problems") public record RouxProblemsProperties(@DefaultValue("true") boolean enabled, @DefaultValue("/api/") String apiPathPrefix)`
  - `@AutoConfiguration(before = ErrorMvcAutoConfiguration.class) @ConditionalOnWebApplication(type = SERVLET) @ConditionalOnBooleanProperty(name = "roux.problems.enabled", matchIfMissing = true) @EnableConfigurationProperties(RouxProblemsProperties.class) @ImportRuntimeHints(ProblemsRuntimeHints.class) public class RouxProblemsAutoConfiguration`, with `@Bean @ConditionalOnMissingBean` methods for `ProblemsAdvice`, `RootProblemsAdvice`, and `ProblemErrorController` (the last `@ConditionalOnMissingBean(ErrorController.class)`).
  - In `ProblemsAdvice`, `problem(HttpStatus, String)`, `invalid(List<FieldProblem>)` (private in the template; it becomes package-private), `INVALID_FIELDS` and `SIGN_IN` are package-private statics, which Task 2 uses.
  - `ProblemsAdvice(RouxProblemsProperties properties)` uses `properties.apiPathPrefix()` where the template hard-codes `"/api/"` in `handleNoResourceFoundException`.

- [ ] **Step 1: Root POM and module POM.** Model `pom.xml` on `~/IdeaProjects/who/pom.xml`:
  - Copy who's properties (Java 25, the reproducible-build timestamp, plugin versions) and import `spring-boot-dependencies` 4.1.2.
  - Copy who's enforcer, Spotless (license header + google-java-format), JaCoCo, the `pit` profile and the `release` profile (central-publishing, source, javadoc, gpg).
  - Add a JaCoCo `check` execution bound to `verify`: LINE and BRANCH coverage ratio 1.00 per module.
  - Set PIT's `mutationThreshold` to 100.
  - List the modules `runtime/roux-bom`, `runtime/roux-problems`, `runtime/roux-spring-boot-starter`, `runtime/roux-contract-tests`, adding each one in the task that creates it; Task 1 lists only `roux-problems`.
  - `roux-problems` dependencies:
    - compile: Spring Boot 4's Spring MVC starter and `spring-boot-autoconfigure`;
    - optional (`<optional>true</optional>`): `spring-boot-starter-validation`, `spring-security-core`, `spring-security-web`, `org.jwcarman.who:who-spring-security`, `org.jwcarman.jpa:jpa-utils`;
    - test: `spring-boot-starter-test`, `spring-boot-webmvc-test`, `spring-security-test`.

- [ ] **Step 2: Move the template's tests first.**
  - Copy the six test files into `runtime/roux-problems/src/test/java/org/jwcarman/roux/problems/` and rename the package.
  - Replace `@AppTest` and `TestMembers` with `@SpringBootTest(classes = ProblemsTestApplication.class) @AutoConfigureMockMvc`, plus a `MockMvc` field. `ProblemsTestApplication` is a `@SpringBootApplication` in the test sources, excluding DataSource and JPA auto-configuration.
  - Requests that were signed in use `.with(user("tester"))`.
  - Keep `ProblemsTestController` and its `NoteService` as they are.
  - Remove the `ExportTooLargeException` test case: that exception stays in the template.
  - Leave the template's `who`, security and sort test cases (`WhoProblemsTest`, and the `ProblemsAdviceTest` cases for denied, unauthenticated and unknown sort) out of this task. Task 2 moves them.

- [ ] **Step 3: Add the new tests.**

```java
// ProblemsAdviceTest
@Test void conflictIs409WithItsMessage() // GET /api/test/problems/conflict throws new ConflictException("The name %s is taken", "Ada")
  → isProblem(result, 409, "Conflict").andExpect(jsonPath("$.detail").value("The name Ada is taken"))

// RouxProblemsAutoConfigurationTest (ApplicationContextRunner / WebApplicationContextRunner)
@Test void registersAdviceAndErrorController()       → context has ProblemsAdvice, RootProblemsAdvice, ProblemErrorController
@Test void disabledByProperty()                     → withPropertyValues("roux.problems.enabled=false"): none of the three beans
@Test void backsOffForUserErrorController()         → user ErrorController bean present: no ProblemErrorController
@Test void backsOffForUserProblemsAdvice()          → user ProblemsAdvice bean present: it is the only ProblemsAdvice
@Test void notInNonWebApplication()                 → ApplicationContextRunner (non-web): none of the three beans

// ProblemsAdviceTest, with @TestPropertySource(properties = "roux.problems.api-path-prefix=/rest/")
@Test void missingPageOutsideCustomPrefixGoesToErrorPage() → GET /api/nothing with Accept text/html: status 404, not application/problem+json
@Test void missingApiResourceUnderCustomPrefixIsProblem()  → GET /rest/nothing: 404 application/problem+json
```

- [ ] **Step 4: Run the tests and confirm they fail.** Run `./mvnw -q -pl runtime/roux-problems verify`. Expected: compilation fails (no main classes yet).

- [ ] **Step 5: Move the main classes.**
  - Copy the ten classes and `ValidationMessages.properties`, rename the package to `org.jwcarman.roux.problems`, and remove the imports and handlers for `who`, Spring Security, `jpa-utils` and `ExportTooLargeException` (they come back in Task 2, apart from `ExportTooLargeException`).
  - Remove `@RestControllerAdvice` scanning concerns: keep the annotations, but beans come only from the auto-configuration. `ProblemErrorController` loses `@Controller`, which a `@Bean` makes redundant.
  - `ProblemsAdvice` loses `@ImportRuntimeHints`, which moves to the auto-configuration.
  - Then add `ConflictException`, `RouxProblemsProperties`, the auto-configuration and the `.imports` file.

- [ ] **Step 6: Run the tests and confirm they pass.** Run `./mvnw -q -pl runtime/roux-problems verify`. Expected: BUILD SUCCESS, with JaCoCo's check at 100%.

- [ ] **Step 7: Run the mutation bar.** Run `./mvnw -q -Ppit -pl runtime/roux-problems verify`. Expected: 0 surviving mutants. Kill any survivor with a test, not with an exclusion.

- [ ] **Step 8: Commit.** Commit message: `feat(problems): move the template's Problem Details handling into roux-problems`

### Task 2: Advice for Spring Security, `who` and `jpa-utils`, each only when present

**Files:**
- Create: `runtime/roux-problems/src/main/java/org/jwcarman/roux/problems/SecurityProblemsAdvice.java`, `WhoProblemsAdvice.java`, `PagingProblemsAdvice.java`
- Modify: `RouxProblemsAutoConfiguration.java` (three nested `@Configuration(proxyBeanMethods = false)` classes)
- Test: move `T/…/WhoProblemsTest.java` and the template's denied, unauthenticated and unknown-sort cases (into new `SecurityProblemsTest` and `PagingProblemsTest`); extend `RouxProblemsAutoConfigurationTest`

**Interfaces:**
- Consumes: `ProblemsAdvice.problem(HttpStatus, String)` and `ProblemsAdvice.INVALID_FIELDS` / `SIGN_IN` (package-private statics), plus an `invalid(List<FieldProblem>)` helper that Task 1 keeps package-private so these classes can share it.
- Produces three `@RestControllerAdvice` classes, each `@ConditionalOnMissingBean` in its nested configuration:
  - `WhoProblemsAdvice`: `@Order(Ordered.LOWEST_PRECEDENCE - 3)`, `@ConditionalOnClass(SignInFailedException.class)`. Handles `SignInFailedException` → 401 "Sign-in failed", `ReauthenticationRequiredException` → 401 "Sign in again to continue", `InvalidPasskeyRegistrationException` → 400 "The passkey could not be registered".
  - `SecurityProblemsAdvice`: `@Order(Ordered.LOWEST_PRECEDENCE - 2)`, `@ConditionalOnClass(AccessDeniedException.class)`. Handles `AccessDeniedException` (anonymous → 401 `SIGN_IN`, otherwise 403 "You do not have permission") and `AuthenticationException` → 401 `SIGN_IN`.
  - `PagingProblemsAdvice`: `@Order(Ordered.LOWEST_PRECEDENCE - 2)`, `@ConditionalOnClass(UnknownSortByValueException.class)`. Handles `UnknownSortByValueException` → 400 `INVALID_FIELDS` with `errors: [{field: "sortBy", message: ex.getMessage()}]`.

- [ ] **Step 1: Write the failing tests.** Move the cases (template behaviour, unchanged) and add:

```java
// WhoProblemsTest
@Test void signInFailureIsNotGenericSignIn()      // handler throws SignInFailedException
  → 401, $.detail == "Sign-in failed"
@Test void reauthenticationIsNotGenericSignIn()   // throws ReauthenticationRequiredException
  → 401, $.detail == "Sign in again to continue"

// RouxProblemsAutoConfigurationTest
@Test void withoutWhoNoWhoAdvice()          → FilteredClassLoader(SignInFailedException.class): no WhoProblemsAdvice, context starts
@Test void withoutSecurityNoSecurityAdvice()→ FilteredClassLoader(AccessDeniedException.class): no SecurityProblemsAdvice, no WhoProblemsAdvice, context starts
@Test void withoutJpaUtilsNoPagingAdvice()  → FilteredClassLoader(UnknownSortByValueException.class): no PagingProblemsAdvice, context starts
@Test void withEverythingAllThree()         → all three advice beans present
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `./mvnw -q -pl runtime/roux-problems verify`. Expected: the new tests fail (classes missing).

- [ ] **Step 3: Implement the three advice classes and the nested configurations.** Each nested configuration carries its own `@ConditionalOnClass`, so the outer class never loads an optional type.

- [ ] **Step 4: Run the tests and confirm they pass.** Run `./mvnw -q -pl runtime/roux-problems verify`, then `./mvnw -q -Ppit -pl runtime/roux-problems verify`. Expected: BUILD SUCCESS, 100% coverage, 0 survivors.

- [ ] **Step 5: Commit.** Commit message: `feat(problems): security, who and paging handlers only when their libraries are present`

### Task 3: BOM, starter and the Java side of the contracts

**Files:**
- Create: `runtime/roux-bom/pom.xml`, `runtime/roux-spring-boot-starter/pom.xml`
- Create: `runtime/roux-contract-tests/pom.xml` (sets `maven.deploy.skip` and `skipPublishing` / central-publishing skip; not in the BOM)
- Create: `contracts/*.json` (see the table below)
- Test: `runtime/roux-contract-tests/src/test/java/org/jwcarman/roux/contracts/ProblemContractTest.java`, `PageContractTest.java`, `SessionContractTest.java`, plus `ContractTestApplication.java`, `ContractTestController.java`, `StandInSecurity.java`, `Fixtures.java`

**Interfaces:**
- Consumes: `roux-problems` (Tasks 1–2), `jpa-utils` 0.2.0 (`PageDto`, `PaginationDto`, `PageParams`, `PagingWebAutoConfiguration`).
- Produces the fixture files that Task 4 reads, with these exact names and shapes:

| File | Content |
|---|---|
| `problem-not-found.json` | `{"title":"Not Found","status":404,"detail":"No note 42","instance":"/api/contract/not-found"}` |
| `problem-invalid-fields.json` | the 400 for posting `{"title":""}` to a `@Valid` record with `@NotBlank String title`: `title` "Bad Request", `detail` "The request has invalid fields", `errors` `[{"field":"title","message":<the template's message>}]`, `instance` |
| `problem-invariant.json` | 400 from `new InvariantViolationException("A class meets at most %d times a week", 7)` |
| `problem-conflict.json` | 409 from `new ConflictException("The name %s is taken", "Ada")` |
| `problem-server-error.json` | 500, `detail` "Something went wrong", `errorId` `"<uuid>"` (a placeholder matched as any UUID) |
| `problem-unknown-sort.json` | 400 for `GET /api/contract/page?sortBy=nope`, `errors[0].field` "sortBy" |
| `page.json` | `PageDto` of two rows `{"id":"1","name":"Ada"}`, `{"id":"2","name":"Grace"}` with `pagination` `{"pageIndex":0,"pageSize":2,"totalElementCount":3,"totalPageCount":2,"hasNext":true,"hasPrevious":false}` |
| `page-params.json` | an array of `{"query": "...", "pageIndex": n\|null, "pageSize": n\|null, "sortBy": s\|null, "sortDirection": "ASC"\|"DESC"\|null}`. Entries: `""`; `"?pageIndex=2&pageSize=25"`; `"?pageIndex=0&pageSize=25&sortBy=name&sortDirection=DESC"`; `"?sortBy=name&sortDirection=ASC"` |
| `session.json` | `{"csrfBootstrapPath":"/who/me","sessionPathPrefix":"/api/","csrfCookie":"XSRF-TOKEN","csrfHeader":"X-XSRF-TOKEN","sessionLostStatus":401}` |

Fixture values without an exact value above (validation message text, `instance`) are taken from the
first run's actual output, checked by eye against the template's behaviour, then committed. From then
on they are frozen.

- [ ] **Step 1: Write the BOM and the starter.**
  - `roux-bom` manages `roux-problems`, `roux-spring-boot-starter`, `org.jwcarman.who:who-bom:0.15.0` (import) and `org.jwcarman.jpa:jpa-utils:0.2.0`.
  - The starter depends on `roux-problems` and `jpa-utils`.
  - Add both modules to the reactor, then run `./mvnw -q verify`. Expected: BUILD SUCCESS.

- [ ] **Step 2: Write the failing contract tests.** `Fixtures.read(String name)` resolves `../../contracts/<name>` from the module directory with Jackson.

```java
// ProblemContractTest: for each problem fixture, the endpoint in ContractTestController that raises it
@ParameterizedTest @CsvSource({"problem-not-found.json,GET,/api/contract/not-found", …})
void responseMatchesFixture(String fixture, String method, String path)
  → status == fixture.status; Content-Type starts with application/problem+json;
    JSON equals fixture, ignoring field order; "<uuid>" matches any UUID

// PageContractTest
@Test void pageMatchesFixture()            → GET /api/contract/page?pageIndex=0&pageSize=2 equals page.json
@ParameterizedTest void paramsBind()       → for each page-params.json entry, GET /api/contract/echo-params<query>
                                             returns the bound PageParams equal to the entry's values

// SessionContractTest (StandInSecurity: http.csrf(CsrfConfigurer::spa), /who/me permitAll, /api/** authenticated,
//                      entry point answering 401 for /api/**)
@Test void bootstrapSetsCsrfCookie()       → GET csrfBootstrapPath: Set-Cookie has csrfCookie
@Test void postWithoutHeaderIsRefused()    → authenticated POST /api/contract/echo without csrfHeader: 403
@Test void postWithHeaderIsAccepted()      → same POST with csrfHeader = cookie value: 200
@Test void signedOutApiCallIsSessionLost() → anonymous GET /api/contract/page: status == sessionLostStatus
```

- [ ] **Step 3: Run the tests and confirm they fail.** Run `./mvnw -q -pl runtime/roux-contract-tests verify`. Expected: FAIL (fixtures or controller missing).

- [ ] **Step 4: Implement the controller and stand-in security, then write the fixtures.** Write `ContractTestController` and `StandInSecurity`, then the fixtures from the table above, capturing the unspecified values from the first run.

- [ ] **Step 5: Run the tests and confirm they pass.** Run `./mvnw -q verify` (whole reactor). Expected: BUILD SUCCESS.

- [ ] **Step 6: Commit.** Commit message: `feat: roux-bom, the starter, and Java contract tests against shared fixtures`

### Task 3b: Spring Boot's idiomatic starter layout

Added after Task 3, at James's direction. It follows `who`'s layout (`~/IdeaProjects/who/who-autoconfigure`
and `who-spring-boot-starter`).

**Files:**
- Create: `runtime/roux-autoconfigure/pom.xml`. Move into it, under package `org.jwcarman.roux.autoconfigure.problems`: `RouxProblemsAutoConfiguration` (with its nested security / who / paging configurations), `RouxProblemsProperties`, the `META-INF/spring/…AutoConfiguration.imports` file, and the auto-configuration tests (`RouxProblemsAutoConfigurationTest` and its condition and back-off cases).
- Create: `runtime/roux-spring-boot-starter/pom.xml`: jar packaging, no code (as `who-spring-boot-starter`).
- Modify: `runtime/roux-problems`: remove the Spring Boot auto-configuration dependency and annotations, so it is a library. The classes the auto-configuration creates become public with public constructors (`ProblemsAdvice`, `RootProblemsAdvice`, `ProblemErrorController`, `SecurityProblemsAdvice`, `WhoProblemsAdvice`, `PagingProblemsAdvice`, `ProblemsRuntimeHints`). `ProblemsAdvice` takes `String apiPathPrefix` instead of `RouxProblemsProperties`. Its tests wire the advice explicitly (`@Import`) instead of through auto-configuration, and keep 100% coverage of the module.
- Modify: `runtime/roux-bom/pom.xml`: no parent that imports `spring-boot-dependencies`; it manages `roux-problems`, `roux-autoconfigure`, `roux-spring-boot-starter`, the `who-bom` 0.15.0 import and `jpa-utils` 0.2.0. It carries its own release metadata (name, URL, licence, developers, SCM) and the release profile's plugins.
- Modify: `runtime/roux-contract-tests/pom.xml`: depend on `roux-spring-boot-starter` (test scope) instead of the individual modules, so the contracts are tested through the starter, as an app gets them.
- Modify: the root `pom.xml` module list.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `roux-autoconfigure`: `@AutoConfiguration(before = ErrorMvcAutoConfiguration.class) @ConditionalOnClass(ProblemsAdvice.class) … public class RouxProblemsAutoConfiguration`. The conditions, properties and bean methods are as in Task 1, and the nested configurations as in Task 2. `roux-problems`, Spring Security, `who-spring-security` and `jpa-utils` are `<optional>true</optional>`. `spring-boot-configuration-processor` and `spring-boot-autoconfigure-processor` are annotation processors, so the property metadata is generated.
  - `roux-spring-boot-starter`: depends on `roux-autoconfigure`, `roux-problems`, `jpa-utils`, `spring-boot-starter-validation` and Spring Boot 4's Spring MVC starter.

- [ ] **Step 1: Move the auto-configuration tests to `roux-autoconfigure` and write the new ones.**

```java
// roux-autoconfigure: RouxProblemsAutoConfigurationTest (moved cases, plus)
@Test void notWithoutRouxProblems()  → FilteredClassLoader(ProblemsAdvice.class): no roux beans, context starts
// roux-autoconfigure: RouxProblemsPropertiesMetadataTest
@Test void metadataDescribesProperties() → META-INF/spring-configuration-metadata.json on the classpath lists roux.problems.enabled and roux.problems.api-path-prefix
// roux-contract-tests: StarterTest
@Test void starterBringsTheWholeContract() → a context built from the starter alone has ProblemsAdvice, PagingProblemsAdvice and jpa-utils' PagingWebAutoConfiguration
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `./mvnw -q verify`. Expected: FAIL (module missing).
- [ ] **Step 3: Restructure as listed under Files.**
- [ ] **Step 4: Verify.**
  - Run `./mvnw verify` and `./mvnw -q -Ppit verify`. Expected: BUILD SUCCESS, 100% coverage per module, 0 survivors, and no new warnings.
  - Run `./mvnw -q -pl runtime/roux-bom help:effective-pom | grep -c spring-boot-dependencies`. Expected: `0`.
- [ ] **Step 5: Commit.** Commit message: `refactor: idiomatic starter layout — roux-autoconfigure and a code-free starter`

### Task 4: The web package, and the problem, paging and API client modules

**Files:**
- Create: `web/package.json` (`{"private": true, "workspaces": ["roux-web"]}`), `web/package-lock.json`
- Create: `web/roux-web/package.json`, `tsconfig.json`, `vite.config.ts`, `stryker.config.json`, `.gitignore`
- Create (moved from `T/frontend/src/`): `problem.ts` → `src/problem/problem.ts`; `paging.ts` → `src/paging/paging.ts`; the client part of `api.ts` → `src/api/client.ts`
- Create: `src/problem/index.ts`, `src/paging/index.ts`, `src/api/index.ts`, `src/api/config.ts`
- Create (copied, private): `src/testing/setup.ts`, `server.ts`, `render.tsx`, `problems.ts` from `T/frontend/src/testing/`, with app-specific parts (routes, nav, session, members) removed
- Test (moved): `problem.test.ts`, `paging.test.ts`, `api.test.ts` (client cases only); new `src/api/config.test.ts`, `src/contracts.test.ts`

**Interfaces:**
- Produces:
  - `@jwcarman/roux-web/problem`: `Problem`, `FieldProblem`, `problemOf(response: Response): Promise<Problem>`, unchanged.
  - `@jwcarman/roux-web/paging`: everything `paging.ts` exports today, unchanged.
  - `@jwcarman/roux-web/api`: `ApiError`, `isSessionLost`, `onSessionLost`, `get`, `send`, `getJson`, and
    ```ts
    export interface ApiSettings { csrfBootstrapPath: string; sessionPathPrefix: string }
    export function configureApi(settings: Partial<ApiSettings>): void   // merges over the current settings
    export function apiSettings(): ApiSettings                            // defaults: { csrfBootstrapPath: "/who/me", sessionPathPrefix: "/api/" }
    ```
    `get`/`send` read the settings at call time, not at import time.
  - `package.json`:
    - `"name": "@jwcarman/roux-web"`, `"version": "0.1.0"`, `"type": "module"`, `"license": "Apache-2.0"`, `"sideEffects": false`, `"files": ["dist"]`;
    - `"exports"`: `./problem`, `./api`, `./paging`, `./table`, `./form`, each `{ "types": "./dist/<name>/index.d.ts", "import": "./dist/<name>/index.js" }` (`./table` and `./form` are added in Tasks 6–7);
    - `"peerDependencies"`: exactly the third-party packages the source imports, at the template's ranges (`react ^19.3.1`, `@chakra-ui/react ^3.38.0`, `@emotion/react ^11.14.0`, `@tanstack/react-query ^5.107.1`, `@tanstack/react-table ^8.21.3`, `@tanstack/react-form ^1.33.5`, `react-icons ^5.7.0`; add or drop entries to match the imports);
    - `devDependencies`: the same packages pinned exactly, plus the template's test tooling, `@vitest/coverage-v8` at the Vitest version, `@stryker-mutator/core` and `@stryker-mutator/vitest-runner`;
    - `"scripts"`: `build` (`tsc -p tsconfig.json --emitDeclarationOnly && vite build`), `test` (`vitest run`), `coverage` (`vitest run --coverage`), `mutate` (`stryker run`).
  - `vite.config.ts`:
    - library mode with one entry per subpath (`src/<name>/index.ts`), `formats: ["es"]`, `preserveModules`;
    - `rollupOptions.external`: every peer dependency and its subpaths;
    - test settings as in the template (`environment: "node"`, jsdom per file by docblock, `setupFiles: ["src/testing/setup.ts"]`);
    - `coverage: { provider: "v8", include: ["src/**/*.{ts,tsx}"], exclude: ["src/testing/**", "src/**/index.ts", "src/**/*.test.*"], thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 } }`.
  - `stryker.config.json`: `testRunner: "vitest"`, `mutate: ["src/**/*.{ts,tsx}", "!src/testing/**", "!src/**/*.test.*", "!src/**/index.ts"]`, `thresholds: { break: 100 }`.

- [ ] **Step 1: Move the tests and add new ones.** Move the three test files with their imports updated, then add:

```ts
// config.test.ts
it("defaults to who's paths")            → apiSettings() equals { csrfBootstrapPath: "/who/me", sessionPathPrefix: "/api/" }
it("merges a partial setting")           → configureApi({ sessionPathPrefix: "/rest/" }); apiSettings().csrfBootstrapPath === "/who/me"
it("bootstraps CSRF from the configured path") → configureApi({ csrfBootstrapPath: "/auth/me" }); with no XSRF cookie, send("POST", "/rest/x") first fetches "/auth/me"
it("reports a lost session under the configured prefix only") → prefix "/rest/": 401 on /rest/x fires the listener; 401 on /api/x does not
it("reads settings at call time")        → a send() after configureApi() uses the new path

// contracts.test.ts (reads ../../contracts/*.json via node:fs)
it.each(problemFixtures)("problemOf reads %s exactly") → problemOf(new Response(JSON.stringify(f), { status: f.status, headers: { "Content-Type": "application/problem+json" } })) deep-equals f ("<uuid>" kept as the string)
it("page.json is a PageDto")             → const page = fixture satisfies PageDto<{ id: string; name: string }>; nextPageIndex(page) === 1; rowRange(page.pagination, 2) equals { first: 1, last: 2, total: 3 }
it.each(pageParams)("pageQuery sends %s") → pageQuery({ pageIndex, pageSize, sortBy, sortDirection } without nulls) === entry.query
it("session.json matches the client")    → apiSettings() defaults equal session.json's two paths; with an MSW handler that sets session.csrfCookie, send() sends session.csrfHeader; a sessionLostStatus answer fires onSessionLost
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `cd web && npm install && npm test -w @jwcarman/roux-web`. Expected: FAIL (modules missing).

- [ ] **Step 3: Move the source.**
  - Move `problem.ts` and `paging.ts` unchanged.
  - Split `api.ts`: `ApiError`, the session-lost listeners, the CSRF code, `get`, `send` and `getJson` go to `src/api/client.ts`, with the literal `/who/me` and `"/api/"` replaced by `apiSettings()`. `Me`, `fetchMe`, `Passkey`, the permission constants and the domain types stay in the template.
  - Write `config.ts` and the `index.ts` barrels.

- [ ] **Step 4: Run the tests, the build and the bar.** In `web/`, run `npm test -w @jwcarman/roux-web && npm run coverage -w @jwcarman/roux-web && npm run build -w @jwcarman/roux-web && npm run mutate -w @jwcarman/roux-web`. Expected: all pass, 100% coverage, `dist/{problem,api,paging}/index.{js,d.ts}` exist, 0 survivors.

- [ ] **Step 5: Commit.** Commit message: `feat(web): @jwcarman/roux-web with problem, paging and a configurable API client`

### Task 5: Server actions and notifications

**Files:**
- Create (moved): `T/frontend/src/serverAction.ts` → `web/roux-web/src/api/serverAction.ts`; `components/feedback/notify.ts`, `toaster.tsx` → `src/api/notify.ts`, `src/api/toaster.tsx`
- Modify: `src/api/index.ts` (export `useServerAction`, `ServerActionOptions`, `ServerAction`, `notify`, `toaster`, `Toaster`)
- Test (moved): `serverAction.test.tsx`, `notify.test.tsx`

**Interfaces:**
- Consumes: `problemOf` (Task 4), `ApiError` (Task 4).
- Produces: `useServerAction<Variables = void>(options: ServerActionOptions<Variables>): ServerAction<Variables>`, `notify`, `toaster`, `Toaster`, all unchanged from the template.

- [ ] **Step 1: Move the tests and update their imports.**
- [ ] **Step 2: Run the tests and confirm they fail.** Run `npm test -w @jwcarman/roux-web`. Expected: FAIL (modules missing).
- [ ] **Step 3: Move the three source files and update their imports and the barrel.**
- [ ] **Step 4: Run the tests and the bar.** Run `npm test`, `npm run coverage`, `npm run build` and `npm run mutate` in the workspace. Expected: all pass, 100%, 0 survivors.
- [ ] **Step 5: Commit.** Commit message: `feat(web): server actions and notifications in roux-web/api`

### Task 6: Tables

**Files:**
- Create (moved from `T/frontend/src/`): `components/table/{QueryTable,SimpleQueryTable,TableView,TanstackTable,TablePagination,TablePageSizeSelect,TableStatus,selectColumn,FilterChips}.tsx`, `hooks/useQueryTable.ts`, `hooks/useDebounce.ts`, `components/common/ErrorMessage.tsx` → `web/roux-web/src/table/`
- Create: `src/table/index.ts`; add `./table` to `package.json` `exports` and `vite.config.ts` entries
- Test (moved): every matching `*.test.tsx` / `*.test.ts`

**Interfaces:**
- Consumes: `@jwcarman/roux-web/paging` internals by relative import (`../paging/paging`).
- Produces: `QueryTable`, `SimpleQueryTable`, `TableView`, `TanstackTable`, `TablePagination`, `TablePageSizeSelect`, `TableStatus`, `selectColumn`, `FilterChips`, `useQueryTable`, `UseQueryTableOptions`, `DEFAULT_PAGE_SIZE`, `useDebounce`, `ErrorMessage`, plus their exported prop types, all unchanged. `ExportButton` is **not** moved (CSV is out of scope).

- [ ] **Step 1: Move the tests and update their imports.**
- [ ] **Step 2: Run the tests and confirm they fail.** Expected: FAIL (modules missing).
- [ ] **Step 3: Move the source, flattening into `src/table/` and fixing relative imports.**
- [ ] **Step 4: Run the tests and the bar.** Run `test`, `coverage`, `build` and `mutate`. Expected: all pass, 100%, 0 survivors, `dist/table/index.js` exists.
- [ ] **Step 5: Commit.** Commit message: `feat(web): query tables in roux-web/table`

### Task 6b: A `feedback` subpath (James's direction)

The template keeps its user feedback together (`components/feedback`), and `ErrorMessage` is used by
non-table components that stay in the app. So roux-web gets a fifth subpath,
`@jwcarman/roux-web/feedback`, holding:
- `ErrorMessage` and `ErrorMessageProps` (moved from `src/table/`);
- `notify`, `toaster` and `Toaster` (moved from `src/api/`);
- `ConfirmProvider`, `useConfirm` and `ConfirmOptions`, which Task 7 adds here, not under `form`.

`/api` keeps the client, its configuration and `useServerAction`. `/table` keeps only tables.
Internal imports between subpaths are relative (`../feedback/notify`). Add `./feedback` to `exports`
and the Vite entries, and move the matching tests. Done when test, coverage, typecheck, build and
mutate pass, and `dist/feedback/index.js` exists. Commit message:
`refactor(web): a feedback subpath for notifications, confirmation and error messages`.

### Task 7: Forms

**Files:**
- Create (moved from `T/frontend/src/`): `form/{form.tsx,formContext.ts,errors.ts,values.ts}`, `form/fields/*.tsx`, `components/form/FormDialog.tsx`  → `web/roux-web/src/form/` (fields in `src/form/fields/`)
- Create: `src/form/index.ts`; add `./form` to `exports` and the Vite entries
- Test (moved): `form.test.tsx`, `showProblem.test.tsx`, `errors.test.ts`, `values.test.ts`, `fields/CheckboxField.test.tsx`, `FormDialog.test.tsx`; and `components/feedback/ConfirmProvider.tsx` with its test → `src/feedback/` (Task 6b)

**Interfaces:**
- Consumes: `problemOf`, `Problem` (Task 4), `notify` (Task 5).
- Produces: `useAppForm`, `withForm`, `showServerErrors`, `showProblem`, `fieldContext`, `useFieldContext`, `formContext`, `useFormContext`, `errorMessages`, `fieldErrorsOf`, `textOrNull`, `numberOrNull`, `numberInputOf`, `inputOf`, `dateTimeInputOf`, `instantOrNull`, the field components, `FormDialog`, all unchanged (from `form`); and `ConfirmProvider`, `useConfirm`, `ConfirmOptions` (from `feedback`).
- `ConfirmProvider`'s `import { DANGER_PALETTE } from "../../theme"` becomes a module constant `const DANGER_PALETTE = "red";` (the template's value).

- [ ] **Step 1: Move the tests and update their imports.**
- [ ] **Step 2: Run the tests and confirm they fail.** Expected: FAIL (modules missing).
- [ ] **Step 3: Move the source and update imports and the barrel.**
- [ ] **Step 4: Run the tests and the bar.** Run `test`, `coverage`, `build` and `mutate`. Expected: all pass, 100%, 0 survivors, `dist/form/index.js` exists.
- [ ] **Step 5: Commit.** Commit message: `feat(web): forms that show problems in roux-web/form`

### Task 8: CI and the release workflow

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- Modify: `README.md` (modules, how to depend on them, the `NPM_TOKEN` and Central secrets a maintainer needs)

**Interfaces:**
- `ci.yml`: runs on push and on pull requests to `main`. Job `java`: Liberica Java 25, `./mvnw -B verify`. Job `web`: Node LTS, `npm ci`, then `test`, `coverage` and `build` in `web/`. Mutation (`-Ppit`, `npm run mutate`) runs in a third job, on pull requests only. Actions are pinned by SHA, as in `who`'s workflows.
- `release.yml`: on `release: types: [created]`. Job `maven`: a copy of `who`'s `maven-publish.yml`, with `-pl '!runtime/roux-contract-tests'` and the attestation paths changed to `runtime/roux-*/target/roux-*.jar`. Job `npm`:
  - `actions/setup-node` with `registry-url: https://registry.npmjs.org`;
  - `npm ci` in `web/`;
  - `npm version "$RELEASE_TAG" --no-git-tag-version -w @jwcarman/roux-web`;
  - `npm run build -w @jwcarman/roux-web`;
  - `npm publish -w @jwcarman/roux-web --access public --provenance` with `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`;
  - permissions `id-token: write`.

- [ ] **Step 1: Write both workflows.**
- [ ] **Step 2: Lint the workflows.** Run `actionlint .github/workflows/*.yml` (install with `brew install actionlint` if missing). Expected: no output.
- [ ] **Step 3: Rehearse the npm publish locally.** In `web/`, run `npm publish -w @jwcarman/roux-web --dry-run`. Expected: the tarball lists only `dist/**`, `package.json`, `README.md`, `LICENSE`.
- [ ] **Step 4: Push the branch and open a PR.** Expected: the `java`, `web` and mutation jobs are green.
- [ ] **Step 5: Commit.** Commit message: `ci: build, test and publish roux to Maven Central and npm`

### Task 9: Move `noir-app-template` onto roux (verified against local builds)

Work in `~/IdeaProjects/noir-app-template` on a new branch, `roux-stage-1`.

**Files (template):**
- Modify: `pom.xml`:
  - import `org.jwcarman.roux:roux-bom:0.1.0-SNAPSHOT`;
  - depend on `roux-spring-boot-starter`;
  - remove the `jpa-utils` and `who.version` pins the BOM now supplies (keep the dependencies themselves).
- Delete: `src/main/java/org/jwcarman/noir/app/web/problems/` and its tests; `src/main/resources/ValidationMessages.properties`.
- Modify: `ExportTooLargeException` extends `org.jwcarman.roux.problems.InvalidFieldException` with field `"export"`; update the code that imports the moved classes.
- Modify: `frontend/package.json`, adding `"@jwcarman/roux-web": "file:<packed tarball>"` for verification.
- Delete: the frontend files moved in Tasks 4–7 and their tests.
- Modify: every import of them, to `@jwcarman/roux-web/<subpath>`, and `api.ts`, which keeps only `Me`, `fetchMe`, `Passkey`, the permission constants and the domain types.

- [ ] **Step 1: Install roux locally.**
  - In roux, run `./mvnw -q install -DskipTests`.
  - In `web/`, run `npm run build -w @jwcarman/roux-web && npm pack -w @jwcarman/roux-web`. Expected: `jwcarman-roux-web-0.1.0.tgz`.

- [ ] **Step 2: Write the export test in the template first.** `CsvTest` (or the export endpoint's test) asserts that the too-large export still answers 400 with `errors[0].field == "export"` and the same message. Run it and confirm it fails to compile once the problems package is deleted.

- [ ] **Step 3: Make the template changes listed above.**

- [ ] **Step 4: Check there is one copy of each shared package.** In `frontend/`, run `npm ls @jwcarman/roux-web react @chakra-ui/react @tanstack/react-query @tanstack/react-form`. Expected: one version of each, with no duplicates under `@jwcarman/roux-web/node_modules`.

- [ ] **Step 5: Run the whole template build.** Run `./mvnw verify` (Java tests, the frontend build, Vitest), then the Playwright and native profiles the template's README names. Expected: all pass, with no test edited except for imports, the deleted moved tests, and Step 2's test.

- [ ] **Step 6: Make a fresh app the way noir makes one.** Copy the template to a scratch directory, set `app-name.properties`, and run `./mvnw verify` there. Expected: BUILD SUCCESS. `grep -r "class ProblemsAdvice\|function problemOf\|function useQueryTable" src frontend/src` finds nothing.

- [ ] **Step 7: Commit on the template branch; don't push.** Commit message: `build: depend on roux for problems, API client, paging, tables and forms`

### Task 10: Release 0.1.0 and point the template at it

- [ ] **Step 1: Release roux.** Merge the roux PR. James adds the repository secrets (`NPM_TOKEN`, plus the Central and GPG secrets `who` uses) and creates GitHub release `0.1.0`, following the `cutting-oss-release` skill (CHANGELOG, then bump to `0.2.0-SNAPSHOT`).
- [ ] **Step 2: Verify the release.** Check that the `release.yml` run is green and that `npm view @jwcarman/roux-web version` prints `0.1.0`. Then check Maven Central:

```sh
curl -sI https://repo1.maven.org/maven2/org/jwcarman/roux/roux-problems/0.1.0/roux-problems-0.1.0.pom | head -1
```

Expected: `HTTP/2 200` (Central can take up to about 30 minutes).

- [ ] **Step 3: Point the template at the release.** On the template branch, change the BOM to `0.1.0` and `@jwcarman/roux-web` to `"0.1.0"`, run `npm install`, and rerun Task 9 Steps 4–5. Expected: the same results.
- [ ] **Step 4: Commit and open the template PR.** Commit message: `build: roux 0.1.0`. Then push and open the PR with James's OK.
