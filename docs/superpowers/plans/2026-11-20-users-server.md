# Users on the Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** roux owns the users of every app on the server: a thin `AppUser`, a read-only directory over who's tables, the self-service and admin endpoints (one role per user), sign out everywhere and resend invitation, the pieces an app reuses for its own list (A1), and the dojo moved onto them.

**Architecture:** A new module, `roux-users` (in the starter), holds `AppUser` and its changelog, the `roux_user_directory` view and its read-only entity, `Users` (the service) and two controllers, roux's activity kinds and permissions. `UserJoined` and `UserInvitations` stay in roux-roles, where their publishers are; `roux-users`' listener on `UserJoined` makes the `AppUser` row first. The dojo deletes its `members` package except CSV export, and its browser code changes only its API paths and permission strings (the screens are plan 3).

**Tech Stack:** Java 25, Spring Boot 4, Spring Data JPA, jpa-utils (`AuditableEntity`, `SearchableRepository`, `Paginator`, `PageDto`), who 0.25.0 (`WhoService`, `RbacService`, `WhoSessions`, `EmailCredentialService`, `LastAdminGuard`), Liquibase, PostgreSQL, Maven (`mise exec -- ./mvnw`), PIT, JaCoCo.

**Spec:** `docs/superpowers/specs/2026-11-20-app-skeleton-design.md` (build order step 2; "The server").

## Global Constraints

- `AppUser` is `id` (= who's identity id) and `displayName`, plus `AuditableEntity`'s version and audit columns. Nothing else, ever: no email, status, roles or domain fields.
- The email shown for a user is who's `EmailCredentialService.findOldestFor(identityId)` rule: the credential with the lowest id. The view uses the same rule. Never copied into roux's tables.
- One role per user. Inviting gives one; changing a user's role removes the old one and grants the new one in one transaction. Only roles in `InvitableRoles` may be granted (so never `OWNER`).
- A display name is trimmed, not blank, at most 80 characters (`AppUser.MAX_NAME = 80`, the dojo's limit).
- Permissions (roux declares them, its changelog grants all three to `OWNER`): `users.read`, `users.invite`, `users.manage`, as `RouxUserPermissions.USERS_READ`, `USERS_INVITE`, `USERS_MANAGE`.
- Activity kinds (types): `user.invited`, `user.renamed`, `user.deactivated`, `user.reactivated`, `user.role_changed`.
- Endpoints, all under `/api/users`: `GET /me`, `PUT /me`, `GET` (list), `GET /{id}`, `GET /{id}/activities`, `POST /invitations`, `POST /{id}/invitation` (resend), `PUT /{id}/name`, `PUT /{id}/role`, `POST /{id}/deactivate`, `POST /{id}/reactivate`, `POST /{id}/sign-out`.
- Table `roux_user`, view `roux_user_directory`, changelog `classpath:org/jwcarman/roux/users/db/roux-users-changelog.xml`. `roux_user.id` references `who_identity(id)` on delete cascade (so `TestUsers.reset` empties it).
- 100% line coverage and 100% PIT per roux module; every public name in a guide (`node plugins/roux/scripts/check-guides.mjs` → ok); no warning suppression; no star imports; Spotless (`spotless:apply` per module).
- Never run Prettier over `examples/dojo/frontend`. Builds: `mise exec -- ./mvnw ...`.

## Review Focus

- **The last owner.** Deactivating, or changing the role of, the only active owner is refused as `409 last-admin`, through who-admin's `LastAdminGuard`, whichever endpoint does it.
- **A rename that lost a race.** `PUT /me` or `PUT /{id}/name` with a stale `version` is a `409`, and nothing changes (no activity entry).
- **A user with two addresses.** The list, the detail and `/me` show the oldest (lowest id) address, and searching by the other address does not find them.
- **An app's listener on `UserJoined`.** It runs after roux's, so an app entity with `@MapsId AppUser` can be saved in it; a listener that throws rolls back the `AppUser` too.
- **A deactivated or signed-out-everywhere user's open browser.** Its next request is `401`.

---

### Task 1: `roux-users`: `AppUser`, made when a user joins

**Files:**
- Create: `runtime/roux-users/pom.xml` (depends on roux-roles, roux-jpa, roux-activity-log, roux-problems, jpa-utils, `spring-boot-starter-data-jpa`, `spring-boot-starter-validation`, who-spring-security, who-email-link, who-admin, who-rbac); add the module to the root `pom.xml` (after roux-activity-log), `roux-bom` and `roux-spring-boot-starter`.
- Create: `runtime/roux-users/src/main/java/org/jwcarman/roux/users/AppUser.java`, `AppUserRepository.java`, `AppUsers.java` (the listener)
- Create: `runtime/roux-users/src/main/resources/org/jwcarman/roux/users/db/roux-users-changelog.xml`
- Create: `runtime/roux-autoconfigure/src/main/java/org/jwcarman/roux/autoconfigure/users/RouxUsersAutoConfiguration.java`, `RouxUsersPersistenceAutoConfiguration.java` (as roux-theme's pair), registered in `AutoConfiguration.imports`
- Modify: `runtime/roux-contract-tests` (the dojo-free contract app includes the changelog); `runtime/roux-test/.../TestUsers.java` only if a test shows it needs to
- Test: `runtime/roux-users/src/test/java/org/jwcarman/roux/users/AppUserTest.java`, `AppUsersTest.java`; `runtime/roux-contract-tests/src/test/java/org/jwcarman/roux/contracts/AppUserContractTest.java`

**Interfaces:**
- Consumes: `UserJoined(UUID identityId, String name, String email, String role)` (roux-roles).
- Produces:
  - `public class AppUser extends AuditableEntity` with `public static final int MAX_NAME = 80`, `protected AppUser()`, `public AppUser(UUID id, String displayName)`, `public String getDisplayName()`, `public void rename(String displayName)` (trims; `IllegalArgumentException` when blank or over 80 after trimming).
  - `public interface AppUserRepository extends JpaRepository<AppUser, UUID>`.
  - `public class AppUsers` with `@EventListener @Order(Ordered.HIGHEST_PRECEDENCE) void on(UserJoined joined)`, which saves `new AppUser(joined.identityId(), joined.name())`.

- [ ] **Step 1: Write the failing tests.**
  - `AppUserTest`: `new AppUser(id, "  Ada Lovelace ")` has display name `"Ada Lovelace"`; `rename(" ")` and `rename("x".repeat(81))` throw `IllegalArgumentException`; `"x".repeat(80)` is accepted.
  - `AppUsersTest` (unit, with a mocked repository): `on(new UserJoined(id, "Ada", "ada@example.org", "MEMBER"))` saves an `AppUser` with that id and name.
  - `AppUserContractTest` (whole app, PostgreSQL): the owner made at startup has an `AppUser` named `roux.owner.name`; `TestUsers.signedIn("Ada Lovelace", "ada@example.org", "MEMBER")` leaves `roux_user` holding `(ada.id(), "Ada Lovelace")`; a test listener for `UserJoined` with default order finds the `AppUser` already in the repository; a test listener that throws leaves no `roux_user` row; `TestUsers.reset()` leaves only the owner's row.
- [ ] **Step 2: Run them and see them fail.** `mise exec -- ./mvnw -q -pl runtime/roux-users -am test` → compilation errors naming `AppUser`.
- [ ] **Step 3: Implement.** The module, the entity (table `roux_user`: `id uuid` primary key and foreign key to `who_identity(id)` on delete cascade, `display_name varchar(80) not null`, and `AuditableEntity`'s columns, as `roux-theme-changelog.xml` writes them), the repository, the listener, and the auto-configurations (`RouxUsersPersistenceAutoConfiguration` adds the package before the JPA auto-configurations; `RouxUsersAutoConfiguration` declares `AppUsers`). The contract app's master changelog includes roux-users' after who's.
- [ ] **Step 4: Run them and see them pass.** `mise exec -- ./mvnw -q -pl runtime/roux-users,runtime/roux-autoconfigure,runtime/roux-contract-tests -am install` → exit 0 (coverage and PIT at 100%).
- [ ] **Step 5: Commit.** `feat(users): AppUser, made when a user joins`

### Task 2: The directory, its search and sorts, and actor names

**Files:**
- Modify: `roux-users-changelog.xml` (the view, in its own changeset)
- Create in `org.jwcarman.roux.users`: `UserDirectoryEntry.java`, `UserDirectory.java` (repository), `UserStatus.java`, `UserFilter.java`, `UserSort.java`, `UserRow.java`, `AppUserActorNames.java`
- Modify: `RouxUsersAutoConfiguration` (declares `AppUserActorNames` `@ConditionalOnMissingBean(ActorNames.class)`, running before `RouxActivityLogAutoConfiguration`)
- Test: `UserFilterTest.java`, `AppUserActorNamesTest.java`; contract `UserDirectoryContractTest.java`

**Interfaces:**
- Produces:
  - View `roux_user_directory(id, display_name, email, role, status, joined_at, invited)`:
    - `email`: the identity's email credential with the lowest id (`who_credential_identity` joined to `who_email_credential`), null when it has none;
    - `role`: its role's name (the lowest name if who-admin gave it several);
    - `status`: `'ACTIVE'` when `who_identity.status = 'ACTIVE'`, else `'DEACTIVATED'`;
    - `joined_at`: `who_identity.created_at`;
    - `invited`: true when no `who_session` row has the identity (it has never signed in).
    - Only identities with a `roux_user` row appear.
  - `@Entity @Immutable public class UserDirectoryEntry` mapping the view, with getters; `@Searchable` on `displayName` and `email`.
  - `public interface UserDirectory extends SearchableRepository<UserDirectoryEntry, UUID>`.
  - `public enum UserStatus { ACTIVE, DEACTIVATED }`.
  - `public enum UserSort implements SortPropertyProvider { NAME("displayName"), EMAIL("email"), ROLE("role"), JOINED("joinedAt") }`.
  - `public record UserRow(UUID id, String displayName, String email, String role, String status)` with `static UserRow of(UserDirectoryEntry)`.
  - `public record UserFilter(String search, String role, UserStatus status)`:
    - `Specification<UserDirectoryEntry> specification(UserDirectory directory)`: the search, the role when given, and the status (`ACTIVE` when null);
    - `<T> Specification<T> specification(Function<Root<T>, From<?, UserDirectoryEntry>> users)`: the same conditions over an app entity that joins the view (A1), searching `displayName` and `email` case-insensitively, as `SearchableRepository` does.
  - `public class AppUserActorNames implements ActorNames`: `namesOf(ids)` from `AppUserRepository.findAllById`.

- [ ] **Step 1: Write the failing tests.**
  - `UserDirectoryContractTest`:
    - Ada (MEMBER) appears as `UserRow(ada.id(), "Ada Lovelace", "ada@example.org", "MEMBER", "ACTIVE")`.
    - After a second credential `"aaa@example.org"` is registered for her through `EmailCredentialService.register`, she still shows `"ada@example.org"`.
    - A deactivated identity shows `"DEACTIVATED"` and is left out by the default filter.
    - `invited` is true before her browser has signed in and false after `ada.perform(get("/who/me"))` has made a session. If `TestUsers.signedIn` itself starts a who session, assert instead on an identity made through `UserInvitations.invite`.
    - Searching `"lovel"` finds her, and `"aaa@"` does not.
    - `UserSort.NAME` orders `["Ada Lovelace", "Grace Hopper", <owner>]` by name.
    - The `Function` form over a test entity `@Entity class TestProfile { @Id UUID id; @OneToOne @JoinColumn(name = "id", insertable = false, updatable = false) UserDirectoryEntry user; }` finds Ada by `"lovel"`.
  - `UserFilterTest`: a null status filters `ACTIVE`.
  - `AppUserActorNamesTest`: `namesOf(Set.of(ada))` is `Map.of(ada, "Ada Lovelace")`, and an unknown id is absent.
- [ ] **Step 2: Run them and see them fail.** `mise exec -- ./mvnw -q -pl runtime/roux-users test` → compilation errors naming `UserDirectoryEntry`.
- [ ] **Step 3: Implement** the view (one `createView`, `replaceIfExists="true"`) and the types above.
- [ ] **Step 4: Run them and see them pass.** As Task 1, Step 4.
- [ ] **Step 5: Commit.** `feat(users): the user directory, its filter and sorts, and actor names`

### Task 3: `Users` and the endpoints: me, list, detail, invite, rename, role, status, sign out

**Files:**
- Create in `org.jwcarman.roux.users`:
  - `Users.java` (service);
  - `UsersController.java` (admin);
  - `MeController.java`;
  - `RouxUserPermissions.java`;
  - `UserDetail.java`, `Me.java`, `UserNotFoundException.java`;
  - activity records `UserInvited.java`, `UserRenamed.java`, `UserDeactivated.java`, `UserReactivated.java`, `UserRoleChanged.java`.
- Modify: `roux-users-changelog.xml` (a changeset granting the three permissions to `OWNER`, `ON CONFLICT DO NOTHING`, as roux-theme's does); `RouxUsersAutoConfiguration` (declares `Users` and both controllers)
- Test: `UsersControllerTest.java`, `MeControllerTest.java` (in roux-contract-tests, through `TestUsers` browsers); `UsersTest.java` for the branches the endpoints don't reach

**Interfaces:**
- Consumes: Tasks 1–2; `UserInvitations`, `InvitableRoles` (roux-roles); `WhoService.deactivate/reactivate`, `RbacService.findRolesForIdentity/findRequiredRole/assignRoleToIdentity/removeRoleFromIdentity`, `WhoSessions.endAll(UUID)`, `LastAdminGuard.deactivate(UUID, Supplier)` and `removeRole(UUID, UUID, Supplier)`, `ActivityLog`; `Versions.require` (roux-jpa).
- Produces:
  - `public record Me(UUID id, String displayName, String email, long version)`.
  - `public record UserDetail(UUID id, String displayName, String email, String role, String status, Instant joinedAt, boolean invited, long version)`.
  - `Users` methods:
    - `Me me(UUID id)`;
    - `Me renameMe(UUID id, String displayName, long version)`;
    - `PageDto<UserRow> list(PageSpec spec, UserFilter filter)`;
    - `UserDetail detail(UUID id)`;
    - `PageDto<Activity> activities(UUID id, PageSpec spec)`;
    - `Invitation invite(String name, String email, String role)`;
    - `UserDetail rename(UUID id, String displayName, long version)`;
    - `UserDetail changeRole(UUID id, String role)`;
    - `UserDetail deactivate(UUID actorId, UUID id)`;
    - `UserDetail reactivate(UUID id)`;
    - `void signOutEverywhere(UUID id)`.
  - Endpoints and permissions:

    | Endpoint | Permission | Body / answer |
    |---|---|---|
    | `GET /api/users/me` | (signed in) | → `Me` |
    | `PUT /api/users/me` | (signed in) | `{displayName, version}` → `Me` |
    | `GET /api/users?page&size&sort&search&role&status` | `users.read` | → `PageDto<UserRow>` |
    | `GET /api/users/{id}` | `users.read` | → `UserDetail` |
    | `GET /api/users/{id}/activities` | `users.read` | → `PageDto<Activity>` |
    | `POST /api/users/invitations` | `users.invite` | `{name, email, role}` → `202 {linkSent}` |
    | `PUT /api/users/{id}/name` | `users.manage` | `{displayName, version}` → `UserDetail` |
    | `PUT /api/users/{id}/role` | `users.manage` | `{role}` → `UserDetail` |
    | `POST /api/users/{id}/deactivate` | `users.manage` | → `UserDetail` |
    | `POST /api/users/{id}/reactivate` | `users.manage` | → `UserDetail` |
    | `POST /api/users/{id}/sign-out` | `users.manage` | → `204` |

- [ ] **Step 1: Write the failing tests** (each through a signed-in browser):
  - `GET /me` as Ada → `{id: ada, displayName: "Ada Lovelace", email: "ada@example.org", version: 0}`.
  - `PUT /me {displayName: " Ada King ", version: 0}` → `displayName "Ada King"`, plus one `user.renamed` activity on Ada with details from/to.
  - The same with `version: 5` → `409`; with `""` → `400` field error on `displayName`.
  - The list as a MEMBER without `users.read` → `403`. As the owner → Ada's `UserRow`. `role=NOPE` → `400` field error on `role`. `status=DEACTIVATED` lists only deactivated users.
  - `GET /{unknown}` → `404`.
  - Invite `{name: "Grace Hopper", email: "grace@example.org", role: "MEMBER"}` → `202 {linkSent: true}`, plus a `user.invited` activity. The same address again → `400` field error on `email` "That address already belongs to a user". `role: "OWNER"` → `400` (who's `InvalidInvitationException`, as roux-problems answers it).
  - Rename Ada by the owner → `user.renamed` activity, with the owner as actor.
  - `PUT /{ada}/role {role: "INSTRUCTOR"}` (with `roux.roles.invitable` `MEMBER, INSTRUCTOR` in the contract app) → role `INSTRUCTOR`, who holds only that role, and a `user.role_changed` activity (from/to). The same role again → `200` with no new activity. `role: "OWNER"` → `400` field error on `role`. The owner's own role changed while they are the only owner → `409` `last-admin`.
  - Deactivate Ada → status `DEACTIVATED`, `user.deactivated` activity, and Ada's browser's next `GET /api/users/me` is `401`.
  - Deactivating yourself → `409` "You cannot deactivate yourself".
  - Deactivate twice → `409` "Already deactivated". Reactivate → `ACTIVE` with a `user.reactivated` activity; reactivating an active user → `409` "Already active".
  - Deactivating the only active owner (by a second user granted `users.manage` and `who.identities.manage` in a test changeset) → `409` `last-admin`.
  - `POST /{ada}/sign-out` → `204`, and Ada's browser's next request is `401`, while the owner's still works.
- [ ] **Step 2: Run them and see them fail.** `mise exec -- ./mvnw -q -pl runtime/roux-users,runtime/roux-contract-tests -am test` → compilation errors naming `Users`.
- [ ] **Step 3: Implement.**
  - Status and role changes take one transaction-scoped advisory lock (`pg_advisory_xact_lock`, a constant key), as the dojo's `MemberService` does.
  - `changeRole` checks the role with `InvitableRoles`. Through `LastAdminGuard.removeRole`, it removes every current role and assigns the new one.
  - `deactivate` goes through `LastAdminGuard.deactivate`. who's session repository ends the deactivated user's sessions on their next request (`SessionEndReason.IDENTITY_INACTIVE`), so roux adds nothing for that.
  - `signOutEverywhere` is `WhoSessions.endAll(id)` after a `404` check.
  - Activities are appended in the same transaction. A missing `AppUser` is `UserNotFoundException extends NotFoundException` ("No such user").
  - The invite endpoint takes `UserInvitations.invite(name, email, role, identity -> activityLog.append(identity.id(), new UserInvited(name)))` and turns `EmailAddressTakenException` into the field error.
- [ ] **Step 4: Run them and see them pass.** As Task 1, Step 4.
- [ ] **Step 5: Commit.** `feat(users): the users endpoints: me, list, detail, invite, rename, role, status, sign out everywhere`

### Task 4: Resend an invitation

**Precondition (met):** who 0.26.0 adds `InvitationService.resend(UUID identityId)`. It sends a new `InvitationMessage` to the identity's oldest address, naming its current roles. The new link replaces the outstanding one, and who's resend interval applies (`RESEND_SUPPRESSED`). It returns an `EmailLinkOutcome`, and throws `InvalidInvitationException` for an identity with no address. who cannot tell whether someone has signed in, so roux checks that itself with the directory's `invited` flag.

**Files:**
- Modify: root `pom.xml` (`who.version` 0.26.0); `UserInvitations.java` (roux-roles) gains `EmailLinkOutcome resend(UUID identityId)`; `Users.java` and `UsersController.java`
- Test: `UserInvitationsTest.java`; contract `UsersControllerTest.java`

**Interfaces:**
- Produces: `UserInvitations.resend(UUID identityId)` → `EmailLinkOutcome`; `Users.resendInvitation(UUID id)` → `boolean linkSent`; `POST /api/users/{id}/invitation` (`users.invite`) → `202 {linkSent}`.

- [ ] **Step 1: Write the failing tests.**
  - Resending to Grace (invited, never signed in), after her link's `created_at` is moved back past the resend interval → `202 {linkSent: true}`, and `TestMail` holds a second invitation to `grace@example.org`. Right away instead → `202 {linkSent: false}`.
  - Resending to Ada after her browser signed in → `409` "Already signed in".
  - Resending to an unknown id → `404`.
- [ ] **Step 2: Run them and see them fail.** As Task 3, Step 2 → compilation error naming `resend`.
- [ ] **Step 3: Implement.** `Users.resendInvitation` checks the directory's `invited` flag first, refusing with the `409`, then calls `UserInvitations.resend`.
- [ ] **Step 4: Run them and see them pass.** As Task 1, Step 4.
- [ ] **Step 5: Commit.** `feat(users): resend an invitation`

### Task 5: The dojo on roux's users

**Files:**
- Delete from `examples/dojo/src/main/java/org/jwcarman/roux/examples/dojo/members/`:
  - `MemberService`, `MembersController`, `InviteController`;
  - `MemberProfile`, `MemberProfileRepository`, `MemberProfiles`, `MemberProfileNotFoundException`;
  - `MemberDirectoryEntry`, `MemberDirectoryRepository`, `MemberDirectorySpecifications`, `MemberSort`, `MemberStatus`;
  - `MemberActorNames`;
  - the activity records `MemberInvited`, `MemberRenamed`, `MemberDeactivated`, `MemberReactivated`;
  - and their tests.
- Keep, moved onto roux: `MemberCsv` and the export endpoint, as `UsersExportController` at `GET /api/users/export.csv` (`users.read`). It reads `UserDirectory` with `UserFilter` and `UserSort`, and keeps `ExportTooLargeException` and `app.export.max-rows`.
- Modify: `classes/ClassService.java` (instructor names from `AppUserRepository`); `Permissions.java` (drop `MEMBERS_*`); `db/changelog/roles.xml` (a new changeset: grant `users.read` to `INSTRUCTOR` and `MEMBER`; delete the `members.*` grants); a new changeset in `members.xml` that inserts `roux_user` rows from `member_profile` (`ON CONFLICT DO NOTHING`), then drops the view `member_directory` and the table `member_profile`; the master changelog includes roux-users' changelog after roux-roles'.
- Modify (browser, paths and permission strings only):
  - `frontend/src/members/members.ts`: `members…` paths become `users…`, and `rename` becomes `PUT users/me`;
  - `frontend/src/shell/session.tsx`: `/api/users/me`;
  - the nav's `members.read` becomes `users.read`;
  - each matching MSW handler and test.
- Modify: dojo Java tests that called the old endpoints or used `MemberProfile`

**Interfaces:**
- Consumes: everything Tasks 1–4 produce.

- [ ] **Step 1: Point the tests at roux.**
  - The dojo's endpoint tests (for example `InviteControllerTest`, `InvitationsSecurityTest`) call `/api/users/...` and assert roux's answers. Where roux's own contract tests already cover a case, delete the dojo test.
  - An export test asserts `GET /api/users/export.csv` returns the CSV header and Ada's row.
  - The browser tests' handlers serve `/api/users...`.
- [ ] **Step 2: Run them and see them fail.** `mise exec -- ./mvnw -q -pl examples/dojo test -Dskip.npm=true` → failures on `/api/users/...` (404s).
- [ ] **Step 3: Move the dojo.** Delete and modify as listed. Run `spotless:apply` on the dojo.
- [ ] **Step 4: Run the dojo whole.** `mise exec -- ./mvnw -q -pl examples/dojo verify` → exit 0, with `examples/dojo/target/playwright.log` fresh and all passed. Also `cd examples/dojo/frontend && npx vitest run` → all pass.
- [ ] **Step 5: Commit.** `refactor(dojo): users from roux`

### Task 6: The guides

**Files:**
- Create: `docs/guides/users.md` and its plugin copy
- Modify: `docs/guides/roles.md` (its `Permissions` example and invite endpoint use one app's permission names consistently; roux's `users.*` permissions), `getting-started.md` (roux-users in the starter, its changelog in the master changelog), `activity-log.md` (roux's user kinds; `AppUserActorNames`), the plugin copies, `plugins/roux/skills/roux/SKILL.md` (a row for users), `CHANGELOG.md` (Unreleased), `examples/dojo/FINDINGS.md` (one line under the test kits entry: the member names were later renamed to user)

- [ ] **Step 1: Write `users.md`.** It covers:
  - The rule: anything that can sign in is associated with a user. The three shapes, and when to use each:
    - a role only;
    - an entity whose every row signs in (`@OneToOne @MapsId AppUser user`, made in a `UserJoined` listener for its role);
    - an entity where only some rows sign in (an optional link, set when it is given a login).
  - `AppUser` takes no domain fields.
  - The endpoints and their permissions (the table from Task 3, plus resend).
  - One role per user.
  - Sign out everywhere, and deactivation ending sessions.
  - The directory and its email rule.
  - A1: an app's own list endpoint over its entity, with `UserFilter.specification(Function)` and its own sort enum, with a worked example.
  - The activity kinds.
- [ ] **Step 2: Check.** `node plugins/roux/scripts/check-guides.mjs` → `ok`.
- [ ] **Step 3: Run the whole build.** `mise exec -- ./mvnw -q verify` from the root → exit 0, with `examples/dojo/target/playwright.log` fresh and all passed.
- [ ] **Step 4: Commit.** `docs: users`
