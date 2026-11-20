# Member to User Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename roux's unreleased "member" API to "user" and give `UserJoined` the joining user's role, with the dojo moved onto the new names.

**Architecture:** A mechanical rename across roux-roles, roux-autoconfigure, roux-contract-tests, roux-test, the guides and the dojo, plus one new record component (`role`) set by each of the three publishers. The dojo's own `members` package keeps its names (plan 2 replaces it); only its references to roux's API change.

**Tech Stack:** Java 25, Spring Boot 4, who, Maven (`mise exec -- ./mvnw`), PIT, JaCoCo.

**Spec:** `docs/superpowers/specs/2026-11-20-app-skeleton-design.md` (build order step 1; "Decided with the user": member becomes user; "The server": `UserJoined`).

## Global Constraints

- New names, exactly: `MemberJoined` → `UserJoined`, `MemberInvitations` → `UserInvitations`, `TestMembers` → `TestUsers`, `TestMember` → `TestUser`, `MemberJoinedContractTest` → `UserJoinedContractTest`, bean `rouxMemberInvitations` → `rouxUserInvitations`.
- `UserJoined(UUID identityId, String name, String email, String role)`: the role's name (`"OWNER"`, `"MEMBER"`, ...), one role per user.
- roux's own prose says "user" for someone who signs in (Javadoc, guides, CHANGELOG, comments). The business word "member" stays where it is the dojo's or an app's own (the dojo's `members` package, `MemberProfile`, its "Members" nav entry, its role named `MEMBER`).
- Nothing named member has shipped, so there are no deprecations or aliases: the old names are removed.
- 100% line coverage and 100% PIT mutation score per roux module; every public name in a guide (`node plugins/roux/scripts/check-guides.mjs` → ok); no warning suppression; no star imports; Spotless (`spotless:apply`).
- Never run Prettier over `examples/dojo/frontend`.
- Builds: `mise exec -- ./mvnw ...` (the shell has no `JAVA_HOME`).

## Review Focus

- Each publisher sends the right role: the owner bootstrap `OWNER`; an invitation the role it was asked to grant; `TestUsers.signedIn(..., String role)` and `signedIn(..., Role role)` that role's name.
- A listener that reads `role` gets it inside the joining transaction, as it gets the rest today (the contract test checks the field, not just the type).
- `TestUsers.signedIn` with an unknown role still lists the roles in its message.
- No stale old name survives anywhere outside `docs/superpowers/` and the CHANGELOG's released sections (`git grep` check in Task 3).
- The dojo's own member words are left alone (its tests and E2E still pass unchanged in substance).

---

### Task 1: `UserJoined` with its role, and `UserInvitations`

**Files:**
- Rename: `runtime/roux-roles/src/main/java/org/jwcarman/roux/roles/MemberJoined.java` → `UserJoined.java`; `MemberInvitations.java` → `UserInvitations.java`; their tests `MemberInvitationsTest.java` → `UserInvitationsTest.java`
- Modify: `runtime/roux-roles/src/main/java/org/jwcarman/roux/roles/OwnerBootstrap.java`, `runtime/roux-roles/src/test/java/org/jwcarman/roux/roles/OwnerBootstrapTest.java`
- Modify: `runtime/roux-autoconfigure/src/main/java/org/jwcarman/roux/autoconfigure/roles/RouxRolesAutoConfiguration.java` and its test
- Rename: `runtime/roux-contract-tests/src/test/java/org/jwcarman/roux/contracts/MemberJoinedContractTest.java` → `UserJoinedContractTest.java`; modify `OwnerBootstrapContractTest.java`
- Modify (dojo references only): `examples/dojo/src/main/java/org/jwcarman/roux/examples/dojo/members/MemberProfiles.java`, `members/InviteController.java`, and dojo tests that name `MemberJoined`/`MemberInvitations`

**Interfaces:**
- Produces: `record UserJoined(UUID identityId, String name, String email, String role)`; `UserInvitations(InvitationService, ApplicationEventPublisher)` with `Invitation invite(String name, String email, String role)` and `invite(String name, String email, String role, Consumer<Identity> alsoInTransaction)` (unchanged signatures); bean method `rouxUserInvitations`.

- [ ] **Step 1: Write the failing tests.** Rename the test classes and their uses to the new names, and add the role to every assertion on the event:
  - `UserInvitationsTest`: the published event equals `new UserJoined(identity.id(), "Ana Souza", "ana@example.com", "MEMBER")` for `invite("Ana Souza", "ana@example.com", "MEMBER")`.
  - `OwnerBootstrapTest`: the published event's `role()` is `RouxRoles.OWNER`.
  - `UserJoinedContractTest`: the recorded event after inviting with role `"MEMBER"` has `role()` `"MEMBER"`; the owner's has `"OWNER"`.
  - `RouxRolesAutoConfigurationTest`: `getBean(UserInvitations.class)` is an instance of `UserInvitations`.
- [ ] **Step 2: Run them and see them fail to compile.** `mise exec -- ./mvnw -q -pl runtime/roux-roles test` → compilation error naming `UserJoined`/`UserInvitations`.
- [ ] **Step 3: Rename and add the role.** `git mv` the two classes; add `String role` as the last component of `UserJoined` (Javadoc: the role the user joined with, by name); `OwnerBootstrap` publishes `RouxRoles.OWNER`; `UserInvitations` publishes the `role` argument; rename the auto-configuration's import, Javadoc and bean method; say "user" in the touched Javadoc. Update the dojo's `MemberProfiles` (listens to `UserJoined`) and `InviteController` (uses `UserInvitations`) and any dojo test naming the old types.
- [ ] **Step 4: Run them and see them pass.** `mise exec -- ./mvnw -q -pl runtime/roux-roles,runtime/roux-autoconfigure,runtime/roux-contract-tests -am install` → exit 0 (coverage and PIT at 100%).
- [ ] **Step 5: Commit.** `refactor(roles)!: UserJoined (with its role) and UserInvitations`

### Task 2: `TestUsers` and `TestUser`

**Files:**
- Rename: `runtime/roux-test/src/main/java/org/jwcarman/roux/test/TestMembers.java` → `TestUsers.java`, `TestMember.java` → `TestUser.java`, `src/test/.../TestMembersTest.java` → `TestUsersTest.java`
- Modify: `runtime/roux-test/src/main/java/org/jwcarman/roux/test/AppTest.java`, `TestClock.java` (Javadoc links), `src/test/.../AppTestTest.java`, `OwnPropertiesTest.java`
- Modify: every dojo test that names `TestMembers`/`TestMember` (about 25 files under `examples/dojo/src/test/java`)

**Interfaces:**
- Consumes: `UserJoined(UUID, String, String, String role)` from Task 1.
- Produces: `TestUsers` with `OWNER_EMAIL`, `reset(String... appTables)`, `TestUser signedIn(String name, String email, String role)`, `TestUser signedIn(String name, String email, Role role)`, `TestUser owner()`, `WhoMockMvcBrowser anonymous()`; `record TestUser(UUID id, WhoMockMvcBrowser browser)` with `perform(...)`. Signatures as today apart from the type names.

- [ ] **Step 1: Write the failing tests.** Rename the tests' uses to `TestUsers`/`TestUser`, and in `TestUsersTest` assert that `signedIn("Ana Souza", "ana@example.com", "MEMBER")` publishes `UserJoined` with `role()` `"MEMBER"`, and that the `Role` overload publishes that role's name.
- [ ] **Step 2: Run them and see them fail to compile.** `mise exec -- ./mvnw -q -pl runtime/roux-test test` → compilation error naming `TestUsers`.
- [ ] **Step 3: Rename.** `git mv` the classes; `signedIn` publishes the role's name in `UserJoined`; `AppTest` imports `TestUsers` and sets `roux.owner.email` from `TestUsers.OWNER_EMAIL`; Javadoc says "user". In the dojo's tests, change the types and rename fields and variables of those types from `members`/`member` to `users`/`user` (`@Autowired TestUsers users;`, `TestUser owner = users.owner();`), leaving the dojo's own `member` words (endpoints such as `/api/members`, `MemberProfile`) alone.
- [ ] **Step 4: Run roux-test and the dojo's tests.** `mise exec -- ./mvnw -q install -DskipITs -De2e.skip=true` from the root → exit 0.
- [ ] **Step 5: Commit.** `refactor(test)!: TestUsers and TestUser`

### Task 3: The words in the guides, the skill and the comments; the whole build

**Files:**
- Modify: `docs/guides/roles.md`, `testing.md`, `getting-started.md`, `dates-and-time.md` and their copies in `plugins/roux/skills/roux/references/`; `plugins/roux/skills/roux/SKILL.md`; `CHANGELOG.md` (Unreleased only); `examples/dojo/README.md`, `examples/dojo/CLAUDE.md`
- Modify (comments only): `runtime/roux-activity-log/.../BusinessActivity.java` and `ActivityLog.java` (the example kind becomes `UserRenamed` / `user.renamed`), `web/roux-web/src/activity/Activity.ts` (`user.renamed`), `web/roux-web/src/table/SearchInput.tsx` ("Search users")

**Interfaces:**
- Consumes: the names from Tasks 1 and 2.

- [ ] **Step 1: Rewrite the prose.** Every roux name and every roux sentence about someone who signs in says user; `roles.md` gains, under the `UserJoined` section, the `role` component and an example listener that makes an app entity only for one role (an instructor profile for `INSTRUCTOR`); the CHANGELOG's Unreleased entries use the new names and say `UserJoined` carries the role. Copy each changed guide to the plugin. Leave `FINDINGS.md`'s history and `docs/superpowers/` as written.
- [ ] **Step 2: Check no old name is left.** `git grep -nE '\b(MemberJoined|MemberInvitations|TestMembers?|rouxMemberInvitations)\b' -- ':!docs/superpowers' ':!examples/dojo/FINDINGS.md'` → no output except the CHANGELOG's released sections (there are none for these names, so: no output). `node plugins/roux/scripts/check-guides.mjs` → `ok`.
- [ ] **Step 3: Run the whole build.** `mise exec -- ./mvnw -q verify` from the root → exit 0, with `examples/dojo/target/playwright.log` fresh and all passed. For roux-web's comment edits: `cd web/roux-web && npm run -s lint && npx vitest run` → clean, all pass (Prettier on roux-web only).
- [ ] **Step 4: Commit.** `docs: users, not members` (append `[skip ci]` only if the commit touches nothing but CLAUDE.md files, which it does not).
