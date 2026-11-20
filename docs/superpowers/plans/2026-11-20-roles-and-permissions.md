# Roles and Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every roux app gets an OWNER role, its first owner, the last-owner rule, invitable roles and a build-time completeness check from roux, and the dojo drops its hand-written versions.

**Architecture:** A new module, `roux-roles` (in the starter, with who-admin), ships a migratory changelog that creates OWNER and grants it who-admin's permissions, a first-owner bootstrap, an invitation guard, `Permissions.allOf`, and the check plus TypeScript generator an app's test calls. roux-theme grants its own permission in its own changeset. The last-owner rule is who-admin's `LastAdminGuard`, which the app's service calls; roux-problems turns its exception into a 409.

**Tech Stack:** Java 25, Spring Boot 4.1.3, who 0.25.0 (who-rbac, who-admin, who-email-link), migratory 0.1.0, Liquibase on PostgreSQL, Testcontainers, React + Vitest (the dojo's frontend).

**Spec:** `docs/superpowers/specs/2026-11-18-roles-and-permissions-design.md`

## Global Constraints

- No `@SuppressWarnings` (or any suppression), no star imports, in Java and TypeScript.
- Format with `./mvnw -q -pl <module> spotless:apply` per module (a root-level `spotless:apply` fails).
- Liquibase changesets refer to roles by name, never by id, and insert only what is missing (`ON CONFLICT DO NOTHING`).
- The role is named `OWNER`. who-admin's permissions are `who.identities.read` and `who.identities.manage`; roux-theme's is `theme.manage`.
- `roux.owner.email` and `roux.owner.name` are both required: startup fails naming the missing setting.
- `roux.roles.invitable`: a list, empty by default. Listing `OWNER` fails startup.
- No other roux role is granted `who.identities.manage`.
- Mutation testing is incremental only (`npm run mutate` in the frontend; PIT runs as CI configures it). Never start a fresh full Stryker run.
- Commits go to `main` and stay local until the user approves a push. Every commit ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014GnzDJxXVyWy4Ec18M195n
  ```
- Every new source file carries the license header the other files carry (`spotless:apply` adds it).

## Review Focus

1. **The changelog meets a database the dojo's old bootstrap filled.** OWNER, INSTRUCTOR and MEMBER and their grants already exist; nothing fails and nothing is added twice (Task 1 test; Task 10 upgrade check).
2. **The only owner has been deactivated by hand.** The next start makes a new owner from `roux.owner.email`; when that address is the deactivated owner's own, startup fails naming `roux.owner.email` rather than looping or silently doing nothing (Task 2 tests).
3. **Two constants in different classes share a field name**, such as `MANAGE`. The generator fails naming both classes instead of writing a TypeScript file that doesn't compile (Task 5 test).
4. **An invitation sent through who's own endpoint with an unlisted role, or OWNER.** It is refused and rolled back whatever endpoint sent it (Task 3 test).
5. **Demoting or deactivating the last owner from who-admin's `/who/identities` endpoints**, not just the dojo's. The answer is the same 409 problem (Task 4 test).

---

## File Structure

**New module `runtime/roux-roles`** (package `org.jwcarman.roux.roles`):

- `RouxRoles.java`: the `OWNER` constant.
- `Permissions.java`: `allOf`.
- `OwnerBootstrap.java`: an `ApplicationRunner`.
- `OwnerCreated.java`: the event.
- `InvitableRoles.java`: the validated list.
- `InvitableRolesGuard.java`: a listener on who's `IdentityInvited`.
- `InvitableRolesController.java`: `GET /api/roles/invitable`.
- `check/RoleGrantsCheck.java` and `check/PermissionsTypeScript.java`: what an app's test calls.
- `src/main/resources/META-INF/migratory.properties` and `org/jwcarman/roux/roles/db/roux-roles-changelog.xml`.

**`runtime/roux-autoconfigure`:** a new package `org.jwcarman.roux.autoconfigure.roles`, holding:

- `RouxRolesAutoConfiguration`;
- `RouxOwnerProperties` (prefix `roux.owner`);
- `RouxRolesProperties` (prefix `roux.roles`).

**Changed:**

- `runtime/roux-spring-boot-starter/pom.xml`: adds roux-roles and who-admin.
- The root `pom.xml` module list, and `runtime/roux-bom`.
- roux-theme: adds `RouxThemePermissions`, a changeset, and `migratory.properties`.
- roux-problems: `WhoProblemsAdvice`.
- The contract tests.
- The dojo.
- The docs, the plugin's copies of them, and the CHANGELOG.

---

### Task 1: roux-roles: the module, OWNER, `allOf`, and the starter

**Files:**
- Create: `runtime/roux-roles/pom.xml`.
  - Parent `roux-parent`.
  - Dependencies:
    - who-rbac;
    - who-admin;
    - who-email-link;
    - who-spring-security;
    - spring-boot-starter-jdbc;
    - spring-boot-starter-webmvc.
  - Test dependencies: spring-boot-starter-test.
  - Copy roux-theme's plugin and coverage setup.
- Create: `runtime/roux-roles/src/main/java/org/jwcarman/roux/roles/RouxRoles.java`, `Permissions.java`
- Create: `runtime/roux-roles/src/main/resources/META-INF/migratory.properties`
- Create: `runtime/roux-roles/src/main/resources/org/jwcarman/roux/roles/db/roux-roles-changelog.xml`
- Modify: `pom.xml` (add `runtime/roux-roles` after `runtime/roux-jpa`), `runtime/roux-bom/pom.xml`, `runtime/roux-spring-boot-starter/pom.xml` (add `roux-roles` and `org.jwcarman.who:who-admin`)
- Test: `runtime/roux-roles/src/test/java/org/jwcarman/roux/roles/PermissionsTest.java`, `runtime/roux-contract-tests/src/test/java/org/jwcarman/roux/contracts/RolesContractTest.java`

**Interfaces:**
- Produces:
  - `RouxRoles.OWNER = "OWNER"`;
  - `static List<String> Permissions.allOf(Class<?>... types)`;
  - the migratory name `roux-roles`.

- [ ] **Step 1: Write `PermissionsTest`**, with fixture classes nested in the test:

```java
static final class A { public static final String X = "a.x"; public static final String Y = "a.y";
  private static final String HIDDEN = "a.hidden"; public static String notFinal = "n"; public final String inst = "i"; }
static final class B { public static final String Y = "a.y"; public static final String Z = "b.z"; }
static final class None { private static final String P = "p"; }

@Test void listsPublicConstantsInDeclarationOrder() {
  assertThat(Permissions.allOf(A.class)).containsExactly("a.x", "a.y"); }
@Test void dropsDuplicatesAcrossClasses() {
  assertThat(Permissions.allOf(A.class, B.class)).containsExactly("a.x", "a.y", "b.z"); }
@Test void classWithNoneFails() {
  assertThatIllegalArgumentException().isThrownBy(() -> Permissions.allOf(A.class, None.class))
      .withMessageContaining(None.class.getName()); }
@Test void noClassesFails() {
  assertThatIllegalArgumentException().isThrownBy(Permissions::allOf); }
```

- [ ] **Step 2: Run it and see it fail.**
  - Run: `./mvnw -q -pl runtime/roux-roles -am test -Dtest=PermissionsTest -Dsurefire.failIfNoSpecifiedTests=false`
  - Expected: a compilation failure, because `Permissions` doesn't exist.

- [ ] **Step 3: Implement `Permissions.allOf` and `RouxRoles`.**
  - `allOf` reads `getDeclaredFields()`, keeping only fields that are `public static final String`. Java returns them in declaration order. It collects into a `LinkedHashSet` and returns `List.copyOf`.
  - The Javadoc says why "none" throws: a missing native-image hint must not empty a check.
  - `RouxRoles` is a final utility class with `public static final String OWNER = "OWNER";` and a private constructor.

- [ ] **Step 4: Write the changelog and `migratory.properties`.**
  - `migratory.properties`:
    ```
    # OWNER and who-admin's permissions for it, migrated by migratory before the app's changelog.
    name=roux-roles
    changelog=classpath:org/jwcarman/roux/roles/db/roux-roles-changelog.xml
    after=who-rbac
    ```
  - The changelog: one changeset, `id="roux-roles-1" author="roux"`, written as `<sql>` like this (keep the theme changelog's license header and schema):
    ```sql
    INSERT INTO who_role (id, name) VALUES (gen_random_uuid(), 'OWNER') ON CONFLICT (name) DO NOTHING;
    INSERT INTO who_role_permission (role_id, permission)
      SELECT r.id, p.permission FROM who_role r
      CROSS JOIN (VALUES ('who.identities.read'), ('who.identities.manage')) AS p(permission)
      WHERE r.name = 'OWNER'
      ON CONFLICT DO NOTHING;
    ```

- [ ] **Step 5: Write `RolesContractTest`.** It uses `@SpringBootTest(classes = ContractTestApplication.class)` and `JdbcClient`, and `TestDatabase` the same way `ThemeContractTest` does. Test cases:
  - `ownerHoldsWhoAdminPermissions`: OWNER's permissions include `"who.identities.read"` and `"who.identities.manage"`.
  - `onlyOwnerMayManageIdentities`: the role names granted `who.identities.manage` are exactly `["OWNER"]`.
  - `changelogMeetsAnExistingOwner`:
    - Delete the `databasechangelog` rows whose `id` starts with `roux-roles-`.
    - Run the changelog again with Liquibase (`new Liquibase("org/jwcarman/roux/roles/db/roux-roles-changelog.xml", new ClassLoaderResourceAccessor(), database).update()`).
    - Assert one OWNER row and the same permission count as before.
  - `starterBringsWhoAdmin` (add it to `StarterTest`): exactly one `LastAdminGuard` bean.

- [ ] **Step 6: Add roux-roles and who-admin to the starter, the bom and the root module list; run.**
  - Run: `./mvnw -q -pl runtime/roux-roles,runtime/roux-contract-tests -am verify`
  - Expected: BUILD SUCCESS.
  - If the contract tests fail on a setting who-admin requires, add that setting to `runtime/roux-contract-tests/src/test/resources/application.properties` with a comment, and say so in the report.

- [ ] **Step 7: Run spotless and commit.** Message: `feat: roux-roles: OWNER, who-admin's permissions and Permissions.allOf`.

---

### Task 2: The first owner

**Files:**
- Create: `runtime/roux-roles/src/main/java/org/jwcarman/roux/roles/OwnerBootstrap.java`, `OwnerCreated.java`
- Create: `runtime/roux-autoconfigure/src/main/java/org/jwcarman/roux/autoconfigure/roles/RouxRolesAutoConfiguration.java`, `RouxOwnerProperties.java`
- Modify: `runtime/roux-autoconfigure/pom.xml` (roux-roles, `<optional>true</optional>` as its other modules are), `.../META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`
- Modify: `runtime/roux-contract-tests/src/test/resources/application.properties` (`roux.owner.email=owner@roux.test`, `roux.owner.name=Contract Owner`)
- Test: `runtime/roux-autoconfigure/src/test/java/org/jwcarman/roux/autoconfigure/roles/RouxOwnerPropertiesTest.java`, `runtime/roux-contract-tests/src/test/java/org/jwcarman/roux/contracts/OwnerBootstrapContractTest.java`

**Interfaces:**
- Consumes: `RouxRoles.OWNER`.
- Produces:
  - `record OwnerCreated(UUID identityId, String name, String email)`. It is published in the owner's transaction, so a listener that throws rolls the owner back.
  - `record RouxOwnerProperties(String email, String name)` (prefix `roux.owner`; name stripped).
  - `OwnerBootstrap(JdbcClient, RbacService, WhoService, EmailCredentialService, ApplicationEventPublisher, PlatformTransactionManager, String email, String name)`, which implements `ApplicationRunner`.

- [ ] **Step 1: Write `RouxOwnerPropertiesTest`.**
  - A blank or missing `email` throws `IllegalArgumentException` with the message `roux.owner.email must be set to the first owner's address`.
  - A blank or missing `name` throws with `roux.owner.name must be set to the first owner's name`.
  - `"  Pat  "` is stripped to `"Pat"`.

- [ ] **Step 2: Write `OwnerBootstrapContractTest`.**
  - It gets the context's `OwnerBootstrap` and calls `run(null)` itself after arranging the database.
  - The context's start already ran the bootstrap once.
  - Other contract tests share the database, so an `@AfterEach` puts it back:
    - delete every identity (`delete from who_identity`; who's foreign keys cascade);
    - clear the throwing flag;
    - run the bootstrap again, leaving one active owner at `owner@roux.test`.
  - A `@TestConfiguration` listener records `OwnerCreated` events and throws when a static flag is set.
  - Test cases:
    - `firstStartMadeTheOwner`: one active identity holds OWNER; its email credential is `owner@roux.test`; one `OwnerCreated` with name `Contract Owner` and that address was recorded.
    - `ownerExistsChangesNothing`: run again; still one identity holds OWNER; no new event.
    - `onlyDeactivatedOwnerGetsANewOne`:
      - Deactivate the owner through `WhoService.deactivate`, then change its email credential's address so `owner@roux.test` is free. Use `EmailCredentialService` if it offers a change; otherwise SQL on who's credential table, named after reading who-email-link's changelog.
      - Run.
      - Expect two identities holding OWNER, one active, and the active one at `owner@roux.test`.
    - `addressHeldWithNoActiveOwnerFails`: deactivate the owner (address unchanged); `run` throws `IllegalStateException` whose message contains `roux.owner.email`, and no identity was created.
    - `listenerFailureRollsTheOwnerBack`: delete all identities, set the throwing flag, `run` throws, and no identity holds OWNER.
    - `concurrentStartsMakeOneOwner`: delete all identities; run the bootstrap on two threads at once (a `CountDownLatch` start gate); expect exactly one identity holding OWNER.

- [ ] **Step 3: Run both tests and see them fail.** They fail to compile.

- [ ] **Step 4: Implement `RouxOwnerProperties`, `OwnerCreated` and `OwnerBootstrap`.**
  - **Port the dojo's bootstrap** (`examples/dojo/src/main/java/org/jwcarman/roux/examples/dojo/identity/OwnerBootstrap.java`). Keep its advisory lock (key `0x726f7578_6f776e65L`), its REQUIRES_NEW `TransactionTemplate`, and its comments on why. Drop its role sync and its `MemberProfile`.
  - **"An owner exists" means an active one:** `who_identity.status = 'ACTIVE'`, joined as the old query joins.
  - **Who decides whether the address is free:** `EmailCredentialService.register`. When it throws `EmailAddressTakenException`, recheck under a new lock. If an active owner now exists, a concurrent start made it, so return. Otherwise throw `IllegalStateException("No active OWNER exists and roux.owner.email (" + email + ") belongs to another identity: set roux.owner.email to a free address")`.
  - **Publish the event** with `ApplicationEventPublisher.publishEvent(new OwnerCreated(...))` inside the owner's transaction, after the credential is registered.
  - **Log it:** info "Created the first OWNER for roux.owner.email".

- [ ] **Step 5: Implement `RouxRolesAutoConfiguration`.**
  - `@AutoConfiguration`, ordered after who's auto-configurations the way `RouxEmailAutoConfiguration` orders itself.
  - `@ConditionalOnClass(OwnerBootstrap.class)`.
  - `@EnableConfigurationProperties(RouxOwnerProperties.class)`.
  - One `@Bean @ConditionalOnMissingBean OwnerBootstrap`.
  - Register it in the imports file.

- [ ] **Step 6: Run.**
  - Run: `./mvnw -q -pl runtime/roux-roles,runtime/roux-autoconfigure,runtime/roux-contract-tests -am verify`
  - Expected: BUILD SUCCESS.

- [ ] **Step 7: Run spotless and commit.** Message: `feat: roux-roles: the first owner from roux.owner.*`.

---

### Task 3: Invitable roles

**Files:**
- Create: `runtime/roux-roles/src/main/java/org/jwcarman/roux/roles/InvitableRoles.java`, `InvitableRolesGuard.java`, `InvitableRolesController.java`
- Create: `runtime/roux-autoconfigure/src/main/java/org/jwcarman/roux/autoconfigure/roles/RouxRolesProperties.java`
- Modify: `RouxRolesAutoConfiguration` (three beans, `@EnableConfigurationProperties` adds `RouxRolesProperties`); the contract tests' `application.properties` (`roux.roles.invitable=MEMBER`)
- Test: `runtime/roux-roles/src/test/java/org/jwcarman/roux/roles/InvitableRolesTest.java`, `runtime/roux-contract-tests/src/test/java/org/jwcarman/roux/contracts/InvitableRolesContractTest.java`

**Interfaces:**
- Consumes: `RouxRoles.OWNER`.
- Produces:
  - `final class InvitableRoles`:
    - `InvitableRoles(List<String> names)`;
    - `List<String> names()`;
    - `boolean contains(String role)`.
  - `record RouxRolesProperties(List<String> invitable)`, defaulting to an empty list.
  - `InvitableRolesController.PATH = "/api/roles/invitable"`. `GET` returns the names as a JSON array in configured order, to any signed-in identity.

- [ ] **Step 1: Write `InvitableRolesTest`.**
  - `new InvitableRoles(List.of("MEMBER", "INSTRUCTOR")).names()` equals `["MEMBER", "INSTRUCTOR"]`.
  - `contains("MEMBER")` is true; `contains("OWNER")` is false.
  - `new InvitableRoles(List.of("MEMBER", "OWNER"))` throws `IllegalArgumentException` with message `roux.roles.invitable may not list OWNER: owners are never invited`.
  - A blank entry throws, naming `roux.roles.invitable`.
  - `null` gives an empty list.
  - The guard's `on(IdentityInvited)`:
    - roles `{"MEMBER"}` passes;
    - `{"OWNER"}` throws `IllegalStateException` with message `An invitation may only give [MEMBER, INSTRUCTOR]`;
    - an empty role set passes.

- [ ] **Step 2: Write `InvitableRolesContractTest`.**
  - `GET /api/roles/invitable` signed in (who-test's way, as `ThemeContractTest` signs in) answers 200 with `["MEMBER"]`.
  - Signed out, it answers 401.
  - `InvitationService.invite("x@roux.test", Set.of("OWNER"), identity -> {})` throws, and afterwards no email credential exists for `x@roux.test`.

- [ ] **Step 3: Run them and see them fail.** Then implement the three classes and the beans. Run:
  - Run: `./mvnw -q -pl runtime/roux-roles,runtime/roux-autoconfigure,runtime/roux-contract-tests -am verify`
  - Expected: BUILD SUCCESS.

- [ ] **Step 4: Run spotless and commit.** Message: `feat: roux-roles: roux.roles.invitable and its guard`.

---

### Task 4: The last owner: a 409 problem for `LastAdminException`

**Files:**
- Modify: `runtime/roux-problems/pom.xml` (add `who-admin`, `<optional>true</optional>`, as `who-spring-security` is). Modify `WhoProblemsAdvice.java`, or add a separate `@ConditionalOnClass`-guarded advice if `WhoProblemsAdvice`'s registration would then need who-admin on every class path. Read `RouxProblemsAutoConfiguration` and choose; say which in the report.
- Test: `runtime/roux-problems/src/test/java/org/jwcarman/roux/problems/WhoProblemsTest.java` (extend it), `runtime/roux-contract-tests/src/test/java/org/jwcarman/roux/contracts/LastOwnerContractTest.java`

**Interfaces:**
- Consumes: who-admin's `LastAdminException` (409, `errorCode()` is `last-admin`).
- Produces: a 409 problem whose `detail` is `The team needs someone active who can manage people`, and which carries who's error code the way `WhoProblemsAdvice` already carries codes for who's other exceptions.

- [ ] **Step 1: Extend `WhoProblemsTest`.** A controller method throwing `new LastAdminException()` answers 409 with `detail` equal to `The team needs someone active who can manage people`.

- [ ] **Step 2: Write `LastOwnerContractTest`.**
  - Sign in as the bootstrap's owner.
  - Call who-admin's endpoint to deactivate that owner. The path comes from who-admin's `IdentitiesController`, under `who.base-path`.
  - Expect 409 with that detail.
  - Then create a second identity holding OWNER, deactivate the first through the same endpoint, and expect success.
  - Reactivate it and delete the second at the end, so other tests still see one active owner.

- [ ] **Step 3: Run, see it fail, implement, run again.**
  - Run: `./mvnw -q -pl runtime/roux-problems,runtime/roux-contract-tests -am verify`
  - Expected: BUILD SUCCESS.

- [ ] **Step 4: Run spotless and commit.** Message: `feat: problems: the last owner is a 409`.

---

### Task 5: The app's check and the generated TypeScript

**Files:**
- Create: `runtime/roux-roles/src/main/java/org/jwcarman/roux/roles/check/RoleGrantsCheck.java`, `PermissionsTypeScript.java`
- Test: `runtime/roux-roles/src/test/java/org/jwcarman/roux/roles/check/PermissionsTypeScriptTest.java`, `runtime/roux-contract-tests/src/test/java/org/jwcarman/roux/contracts/RoleGrantsCheckContractTest.java`

**Interfaces:**
- Consumes: `Permissions.allOf`, `RouxRoles.OWNER`.
- Produces:
  - `static void RoleGrantsCheck.check(JdbcClient jdbc, List<String> permissions)` throws `AssertionError` if any of these hold:
    - OWNER lacks a listed permission: one line per permission, `OWNER lacks <p>`;
    - OWNER holds an unlisted one: `OWNER holds <p>, which no constant declares`;
    - any role grants an unlisted one: `<ROLE> grants <p>, which no constant declares`.

    All lines go in one message, sorted.
  - `static String PermissionsTypeScript.render(Class<?>... types)`.
  - `static void PermissionsTypeScript.verify(Path file, Class<?>... types)`: writes the file when it is missing or differs, then throws `AssertionError("<file> was stale and has been rewritten: commit it")`. When it matches, it does nothing.

- [ ] **Step 1: Write `PermissionsTypeScriptTest`.** Use nested fixture classes like Task 1's. `render(A.class, B.class)` equals exactly:

```ts
// Generated by roux from A, B: do not edit. The app's permissions test rewrites it when it is stale.

export const X = "a.x";
export const Y = "a.y";
export const Z = "b.z";

/** Every permission there is: what the navigation's items may need. */
export const PERMISSIONS = [X, Y, Z] as const;

export type Permission = (typeof PERMISSIONS)[number];
```

  The header uses the classes' simple names, in the order given. Further cases:
  - Two classes declaring the same field name with different values (`C.Y = "c.y"`) throw `IllegalArgumentException` naming both classes and `Y`.
  - The same name with the same value is listed once.
  - `verify` on a missing file writes it and throws.
  - `verify` on a matching file does nothing and leaves the modified time alone.
  - `verify` on a stale file rewrites it and throws a message containing `was stale`.
  - Use JUnit's `@TempDir`.

- [ ] **Step 2: Write `RoleGrantsCheckContractTest`.**
  - `check(jdbc, allOf(WhoAdminPermissions.class, RouxThemePermissions.class))` passes. It is written now and passes after Task 6; until then, list `theme.manage`'s value directly and move to the class in Task 6.
  - `check(jdbc, List.of("who.identities.read"))` throws, naming `OWNER holds who.identities.manage, which no constant declares`.
  - After `INSERT` of a role `TYPO` granting `members.raed` (deleted afterwards), the check throws, naming `TYPO grants members.raed`.

- [ ] **Step 3: Run, see it fail, implement, run.**
  - `render` collects names and values per class with the same field filter as `allOf`. Share it in a package-private helper in `org.jwcarman.roux.roles`, or make it public on `Permissions` as `static Map<String, String> constantsOf(Class<?>... types)`; it's your call, so name it in the report.
  - Run: `./mvnw -q -pl runtime/roux-roles,runtime/roux-contract-tests -am verify`
  - Expected: BUILD SUCCESS.

- [ ] **Step 4: Run spotless and commit.** Message: `feat: roux-roles: the app's grants check and permissions.gen.ts`.

---

### Task 6: roux-theme grants its own permission

**Files:**
- Create: `runtime/roux-theme/src/main/java/org/jwcarman/roux/theme/RouxThemePermissions.java` (`public static final String THEME_MANAGE = "theme.manage";`, private constructor)
- Modify:
  - `ThemeController.java`: remove `MANAGE` and use `RouxThemePermissions.THEME_MANAGE`, including in its Javadoc.
  - `RouxThemeAutoConfiguration.java` Javadoc: the `{@value}` reference.
  - `ThemeControllerTest.java`: the assertion moves to the new class.
- Modify: `runtime/roux-theme/pom.xml` (add `roux-roles`), `runtime/roux-theme/src/main/resources/META-INF/migratory.properties` (`after=who-jdbc,roux-roles`, comment updated), `roux-theme-changelog.xml` (changeset `roux-theme-2`, author `roux`: grant `theme.manage` to OWNER, the same `INSERT … SELECT … ON CONFLICT DO NOTHING` shape as Task 1)
- Test: `RolesContractTest` (add `ownerHoldsThemeManage`), `RoleGrantsCheckContractTest` (switch to `RouxThemePermissions.class`)

- [ ] **Step 1: Add the failing contract test `ownerHoldsThemeManage`.** Run it and see it fail.
- [ ] **Step 2: Make the changes above.**
  - Run: `./mvnw -q -pl runtime/roux-theme,runtime/roux-autoconfigure,runtime/roux-contract-tests -am verify`
  - Expected: BUILD SUCCESS.
- [ ] **Step 3: Run spotless and commit.** Message: `feat: roux-theme grants theme.manage to OWNER`.

---

### Task 7: The dojo: roles as data, roux's owner

**Files:**
- Create: `examples/dojo/src/main/java/org/jwcarman/roux/examples/dojo/identity/Permissions.java`. It holds the 13 constants from `AppRoles`, without `THEME_MANAGE`, which is roux-theme's now.
- Create: `examples/dojo/src/main/java/org/jwcarman/roux/examples/dojo/identity/Roles.java`, with `INSTRUCTOR = "INSTRUCTOR"` and `MEMBER = "MEMBER"`. Code that names OWNER uses `RouxRoles.OWNER`.
- Create: `examples/dojo/src/main/java/org/jwcarman/roux/examples/dojo/members/OwnerProfiles.java`, an `@EventListener` on `OwnerCreated` that saves `new MemberProfile(identityId, name, email)`.
- Create: `examples/dojo/src/main/resources/db/changelog/roles.xml`, included from `db.changelog-master.xml` after the existing includes. One changeset, `dojo-roles-1`:
  - create INSTRUCTOR and MEMBER (`ON CONFLICT (name) DO NOTHING`);
  - grant OWNER all 13 of the dojo's permissions;
  - grant INSTRUCTOR and MEMBER exactly what `AppRole` grants them today;
  - every insert ends with `ON CONFLICT DO NOTHING`.
- Delete:
  - `identity/AppRoles.java`;
  - `identity/OwnerBootstrap.java`;
  - `test/.../identity/OwnerBootstrapTest.java`;
  - `test/.../identity/RolePermissionsTest.java`;
  - `test/.../identity/PermissionsFileTest.java`.
- Modify:
  - `AppProperties`: keep only `baseUrl`.
  - `application.yml` and `application-prod.yml`: `roux.owner.email` and `roux.owner.name` replace `app.owner-*`. Prod reads `${APP_OWNER_EMAIL}` and `${APP_OWNER_NAME}` as before.
  - `src/test/resources/application.properties`: `roux.owner.name=Test Owner`.
  - `AppTest`: `roux.owner.email=…`.
  - `ProductionProfileTest`: keep the env names.
  - `README.md`: the settings table and the "The owner" paragraph, which now describes roux's rule (active owner; a taken address fails startup).
  - Every `AppRoles.X` and `AppRole.X` use: `Permissions.X`, `Roles.X`, `RouxRoles.OWNER`, or `RouxThemePermissions.THEME_MANAGE`.
  - `MemberService.directory`/`exportCsv`, `MembersController` and `MemberDirectorySpecifications.roleIs`: the role filter takes a `String`.
- Test: `examples/dojo/src/test/java/org/jwcarman/roux/examples/dojo/identity/PermissionsTest.java`, and `OwnerProfilesTest`, which can live in an existing `@SpringBootTest` class if one fits.

**Interfaces:**
- Consumes:
  - `OwnerCreated`;
  - `RouxRoles.OWNER`;
  - `Permissions.allOf`;
  - `RoleGrantsCheck.check`;
  - `PermissionsTypeScript.verify`;
  - `RouxThemePermissions`;
  - `WhoAdminPermissions`.
- Produces: `frontend/src/permissions.gen.ts`, committed, which Task 9 uses.

- [ ] **Step 1: Write the dojo's `PermissionsTest`** (a `@SpringBootTest` like the others, on the Testcontainers database):

```java
private static final Class<?>[] ALL = {Permissions.class, RouxThemePermissions.class, WhoAdminPermissions.class};

@Test void rolesGrantExactlyTheDeclaredPermissions() {
  RoleGrantsCheck.check(jdbc, org.jwcarman.roux.roles.Permissions.allOf(ALL)); }
@Test void frontendListIsCurrent() {
  PermissionsTypeScript.verify(Path.of("frontend/src/permissions.gen.ts"), ALL); }
```

  The two `Permissions` names clash: `import static org.jwcarman.roux.roles.Permissions.allOf;` and call `allOf(ALL)`.

  `OwnerProfilesTest`: the bootstrap's owner (`TestMembers.OWNER_EMAIL`) has a `MemberProfile` named `Test Owner`.

- [ ] **Step 2: Make the changes in Files.** Run the dojo's tests once: `frontendListIsCurrent` fails the first time, because it writes the file. Run them again.
  - Run: `./mvnw -q -pl examples/dojo -am verify`
  - Expected: BUILD SUCCESS on the second run.
  - `permissions.gen.ts` lists 15 constants:
    - the 13 dojo ones;
    - `THEME_MANAGE`;
    - `IDENTITIES_READ` and `IDENTITIES_MANAGE`.

- [ ] **Step 3: Check that nothing else names the old settings.**
  - Run: `git grep -n "app.owner\|AppRoles\|AppRole\b" examples/dojo -- ':!*.md'`
  - Expected: no output.
  - The README's mentions were rewritten in Step 2.

- [ ] **Step 4: Run spotless and commit.** Message: `refactor(dojo): roles in a changelog, the owner from roux`. The commit includes the generated `.ts` file.

---

### Task 8: The dojo: last owner and invitations through roux

**Files:**
- Modify: `examples/dojo/src/main/java/org/jwcarman/roux/examples/dojo/members/MemberService.java`.
  - The constructor takes `LastAdminGuard`.
  - In `deactivate`, the owner count goes. `who.deactivate(memberId)` and the activity record run inside `lastAdminGuard.deactivate(memberId, () -> { … })`.
  - Keep the self check, the already-deactivated check, and the status lock; reword the lock's comment, since the owner rule is the guard's now.
  - Update the Javadoc's `@throws`: `LastAdminException` if it would leave no active owner.
- Modify: `members/InviteController.java`.
  - `InvitationRequest.role` is a `String`; a null role means `Roles.MEMBER`.
  - The controller takes `InvitableRoles` and throws `new InvalidFieldException("role", "An invitation cannot give that role")` when `!invitableRoles.contains(role)`.
  - Javadoc: the backstop is roux's guard now.
- Modify: `application.yml`: `roux.roles.invitable: [MEMBER, INSTRUCTOR]`.
- Delete: `members/InvitableRole.java`, `members/InvitableRolesGuard.java`.
- Test: `members/MemberStatusTest.java`, `members/InviteControllerTest.java`, `members/InvitationsSecurityTest.java` (adjust).

- [ ] **Step 1: Update the tests first.**
  - `MemberStatusTest`:
    - deactivating the only active owner answers 409 with detail `The team needs someone active who can manage people`; the test that expected the old 400 and its message changes to this;
    - with a second active owner (made through `TestMembers`), deactivating the first succeeds.
  - `InviteControllerTest`:
    - role `"OWNER"` answers 400 with a field error on `role`;
    - role `"INSTRUCTOR"` invites;
    - a missing role invites a `MEMBER`.
  - `InvitationsSecurityTest`: whatever covered `InvitableRolesGuard` now proves roux's guard, still through who's own invitation endpoint.

- [ ] **Step 2: Run them and see them fail. Implement, then run.**
  - Run: `./mvnw -q -pl examples/dojo -am verify`
  - Expected: BUILD SUCCESS.
- [ ] **Step 3: Run spotless and commit.** Message: `refactor(dojo): the last owner and invitable roles through roux`.

---

### Task 9: The dojo's frontend

**Files:**
- Modify:
  - Every import of a permission constant or `PERMISSIONS` from `api.ts` now imports from `permissions.gen.ts`.
  - `api.ts` drops its constants and `PERMISSIONS`.
  - `shell/nav.ts` imports `PERMISSIONS` from `../permissions.gen`.
- Delete: `frontend/src/permissions.json`, `frontend/src/permissions.test.ts`.
- Modify: `frontend/src/members/members.ts`.
  - `INVITABLE_ROLES` goes.
  - Add `fetchInvitableRoles(): Promise<string[]>`, a `GET /api/roles/invitable` written as the file's other fetches are, with a query key in `queryKeys.ts`.
  - The invite schema's `role` becomes a non-empty string.
  - `ROLE_LABELS` stays, as display text; an unknown role displays as its name.
- Modify: the invite form and its test.
  - Options come from the query, in server order, labelled through `ROLE_LABELS`.
  - The default is the first option.
  - While loading, the select is disabled.
- Test: `members/InviteForm.test.tsx`, plus `MemberDetailView.test.tsx` and `ExportButton.test.tsx` wherever they import moved constants.

- [ ] **Step 1: Update `InviteForm.test.tsx`.**
  - Mock `GET /api/roles/invitable` returning `["MEMBER", "INSTRUCTOR"]`, the way the file already mocks requests.
  - The select offers `Member` and `Instructor` in that order, with `Member` chosen.
  - With `["INSTRUCTOR"]`, it offers only `Instructor`.
- [ ] **Step 2: Make the changes. Run the checks.**
  - Run: `cd examples/dojo/frontend && npx tsc -b && npm test`
  - Expected: no type errors, and every test passes.
  - Then run `npm run mutate` if the project has it (incremental), and report the score for the changed files.
- [ ] **Step 3: Commit.** Message: `refactor(dojo): generated permissions and invitable roles from the server`.

---

### Task 10: Docs, CHANGELOG, and the upgrade check

**Files:**
- Create: `docs/guides/roles.md`, and an identical `plugins/roux/skills/roux/references/roles.md`. It covers:
  - **OWNER:** what roux gives it.
  - **The app's own permissions:** writing the app's `Permissions` class and its `roles.xml`, with a worked changeset.
  - **Adding a permission:** a constant plus a changeset.
  - **Renaming a role:** `UPDATE who_role SET name …` in a changeset.
  - **The app's test:** `RoleGrantsCheck` and `PermissionsTypeScript`.
  - **The settings:** `roux.owner.*` and `roux.roles.invitable`.
  - **The last-owner rule:** wrap role removals and deactivations in `LastAdminGuard`, with the dojo's `deactivate` as the example. Direct `RbacService`/`WhoService.deactivate` calls are unguarded.
  - **The rule is about managing people:** an app that grants `who.identities.manage` to another role may remove the last owner while that role remains.
- Modify:
  - `docs/guides/README.md`, and the plugin's skill index if it lists references: link the guide.
  - `docs/guides/getting-started.md` and the plugin's copy: the required `roux.owner.*` settings.
  - `CHANGELOG.md` Unreleased:
    - Added: roux-roles; who-admin in the starter.
    - Changed: roux-theme grants `theme.manage`; `ThemeController.MANAGE` is now `RouxThemePermissions.THEME_MANAGE`.
    - Under Changed, the steps for an app: set `roux.owner.*`; move role definitions to a changelog; add the test.

- [ ] **Step 1: Write the guide and the other doc changes.** Make the plugin copies byte-identical: `diff docs/guides/roles.md plugins/roux/skills/roux/references/roles.md` prints nothing.
- [ ] **Step 2: Run the full build.**
  - Run: `./mvnw -q verify`
  - Expected: BUILD SUCCESS.
- [ ] **Step 3: Run the upgrade check.** It works the way the migratory move was proved:
  1. Start a fresh PostgreSQL. Check out `77d9c1f` (main before this work) into a temporary worktree and start the dojo there against it with `--app.owner-email=owner@dojo.test --app.owner-name=Owner`; wait for startup, then stop it.
  2. Start this branch's dojo against the same database with `--roux.owner.email=owner@dojo.test --roux.owner.name=Owner`.
  3. Expected:
     - startup succeeds;
     - the log shows the new changesets run once each, and no others: `roux-roles-1`, `roux-theme-2` and `dojo-roles-1`;
     - `select count(*) from who_role` is 3;
     - one identity holds OWNER;
     - no WARN lines from Liquibase or migratory.
  4. Remove the worktree and the database.
- [ ] **Step 4: Commit.** Message: `docs: roles guide, CHANGELOG`.
- [ ] **Step 5: Report to the user.** Ask before pushing.
