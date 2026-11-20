# The business activity log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** roux gains a business activity log (`roux-activity` and `@jwcarman/roux-web/activity`), and the dojo moves onto it.

**Architecture:** A new runtime module, laid out like roux-theme: a JPA entity over its own table (`roux_activity`, created by its changelog through migratory), a service (`ActivityLog`) that appends typed records as JSON and reads a record's history a page at a time, and auto-configuration in roux-autoconfigure. roux-web gets an `./activity` entry (the wire type and `ActivityList`) and `formatRelativeTime` in `./dates`. The dojo's own `activity/` package goes.

**Tech Stack:** Java 25, Spring Boot 4.1, Hibernate 7 (jsonb and `uuid[]` via `@JdbcTypeCode`), Jackson 3 (`tools.jackson`), jpa-utils (`BaseEntity`, `PageSpec`, `PageDto`, `Paginator`), Liquibase through migratory, PostgreSQL (Testcontainers in roux-contract-tests), React 19 + Chakra 3, Vitest + MSW, Stryker.

**Spec:** `docs/superpowers/specs/2026-11-20-activity-log-design.md`

## Global Constraints

- Each kind is a Java **record** implementing `BusinessActivity` (`String type()`, `String describe()`); `append` refuses anything else.
- The write method is `ActivityLog.append(UUID anchor, BusinessActivity activity, UUID... related)`; it is **never named `record`**.
- `append` needs a running transaction (`Propagation.MANDATORY`).
- A type code is lower-case and dotted, at most 100 characters: `[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+`. A description is non-blank, at most 500 characters.
- No foreign keys from `roux_activity`; rows are never updated.
- Details are written with the app's Jackson mapper and read back as a JSON object, never as the app's records.
- Actor names: `"System"` for no actor, `"Unknown"` for an actor `ActorNames` does not name (or with no `ActorNames` bean).
- roux's standing rules: Problem Details, time from the injected `Clock`, no warning suppression, no star imports, 100% line and branch coverage per roux module, Stryker (incremental, `npm run mutate`) on roux-web, every public name in a guide (`node plugins/roux/scripts/check-guides.mjs`).
- Liquibase changesets only, never edited once run.
- New Java files carry the license header copied from an existing roux source file.
- Commit trailer, exactly:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014GnzDJxXVyWy4Ec18M195n
  ```

## Review Focus

1. Two activities appended in one transaction, at the same clock instant: history must list the later one first, every time (Task 1 unit test on the query's order; Task 2 contract test on real rows).
2. The anchor passed again among the related ids, or a related id twice: one row, and history lists it once (Task 1 test).
3. A record with a `null` component, or a `Money` or `LocalDate` component: details are written as the API writes them, `null` as JSON `null` (Task 2 contract test).
4. An `ActorNames` bean that names only some actors on a page: the rest are `"Unknown"`, the system `"System"`, and it is asked once per page (Task 1 test).
5. A page index below zero, a size of zero or above the maximum: clamped as roux's other lists are, never an error (Task 1 test).

---

### Task 1: roux-activity: the log, its entity and its table

**Files:**
- Create: `runtime/roux-activity/pom.xml` (like `runtime/roux-theme/pom.xml`: roux-jpa, jpa-utils, spring-boot-starter-data-jpa, who-spring-security, Jackson; test: spring-boot-starter-test)
- Create in `runtime/roux-activity/src/main/java/org/jwcarman/roux/activity/`: `BusinessActivity.java`, `Activity.java`, `ActorNames.java`, `ActivityLog.java`, `ActivityEntry.java`, `ActivityRepository.java`
- Create: `runtime/roux-activity/src/main/resources/org/jwcarman/roux/activity/db/roux-activity-changelog.xml`, `runtime/roux-activity/src/main/resources/META-INF/migratory.properties`
- Modify: root `pom.xml` (module, before `roux-autoconfigure`), `runtime/roux-bom/pom.xml`, `runtime/roux-spring-boot-starter/pom.xml`
- Test: `runtime/roux-activity/src/test/java/org/jwcarman/roux/activity/ActivityLogTest.java`

**Interfaces:**
- Produces:
  - `public interface BusinessActivity { String type(); String describe(); }`
  - `public record Activity(UUID id, Instant occurredAt, String type, String description, @Nullable UUID actorId, String actorName, JsonNode details)` (`tools.jackson.databind.JsonNode`); constants `Activity.SYSTEM = "System"`, `Activity.UNKNOWN = "Unknown"`.
  - `@FunctionalInterface public interface ActorNames { Map<UUID, String> namesOf(Set<UUID> identityIds); }`
  - `public class ActivityLog`, constructor `ActivityLog(ActivityRepository entries, JsonMapper json, Clock clock, ActorNames names)`; `@Transactional(propagation = MANDATORY) void append(UUID anchor, BusinessActivity activity, UUID... related)`; `@Transactional(readOnly = true) PageDto<Activity> history(UUID id, PageSpec page)`.
  - `ActivityEntry` (entity, extends jpa-utils `BaseEntity`, table `roux_activity`): `occurredAt`, `actorId`, `anchorId`, `relatedIds` (`UUID[]`, `@JdbcTypeCode(SqlTypes.ARRAY)`), `type`, `description`, `details` (`String`, `@JdbcTypeCode(SqlTypes.JSON)`).
  - `ActivityRepository extends JpaRepository<ActivityEntry, UUID>` with `Page<ActivityEntry> history(UUID id, Pageable page)`: a native query, `where anchor_id = :id or :id = any(related_ids) order by occurred_at desc, id desc`, with its count query.
  - Keep `ActivityEntry` and `ActivityRepository` package-private if Spring Data and Hibernate accept it (then they need no guide entry); if not, public, and Task 6 names them.

- [ ] **Step 1: Write the failing tests** (`ActivityLogTest`, repository mocked as `ThemeServiceTest` does; a fixed `Clock`; `TestingAuthenticationToken` over a `WhoPrincipal` for the actor; `record Renamed(String from, String to) implements BusinessActivity` with type `"member.renamed"`):
  - `appends_the_kind_its_sentence_and_its_fields`: saved entry has `type` `"member.renamed"`, `description` `"Renamed from Ada to Ada King"`, `details` `{"from":"Ada","to":"Ada King"}`, `occurredAt` the clock's instant, `actorId` the principal's identity id, `anchorId` the anchor, `relatedIds` empty.
  - `a_system_action_has_no_actor`: no authentication (and a non-who principal) → `actorId` null.
  - `related_ids_are_kept_without_the_anchor_or_repeats`: `append(a, x, r, r, a)` → `relatedIds` `[r]`.
  - `refuses_a_kind_that_is_not_a_record`: an anonymous `BusinessActivity` → `IllegalArgumentException` naming its class.
  - `refuses_a_malformed_type`: `"Member.Renamed"`, `"renamed"`, `"member."`, 101 characters → `IllegalArgumentException` containing `type`.
  - `refuses_a_blank_or_long_description`: `" "` and 501 characters → `IllegalArgumentException` containing `description`.
  - `refuses_a_null_related_id`: `IllegalArgumentException`.
  - `history_is_newest_first_with_names_asked_once_per_page`: repository returns three entries (actors A, B, null); `ActorNames` names only A → `actorName`s `"Ann"`, `"Unknown"`, `"System"`; `namesOf` called once with `{A, B}`; `details` as a `JsonNode` equal to the stored JSON.
  - `history_without_actor_names_says_unknown`: an `ActorNames` returning an empty map.
  - `history_clamps_the_page`: `PageSpec` index `-1`, size `0` → `Pageable` page 0, size 1; size `10_000` → `Paginator.DEFAULT_MAX_PAGE_SIZE`; nulls → page 0, `Paginator.DEFAULT_PAGE_SIZE`.
  - `history_answers_the_page_as_roux_lists_do`: `PageDto` content and `PaginationDto` from the repository's `Page`.

- [ ] **Step 2: Run to watch it fail**
  Run: `./mvnw -q verify -pl runtime/roux-activity`
  Expected: compilation fails (`ActivityLog` not defined).

- [ ] **Step 3: Implement the types above.** `append` reads the actor from `SecurityContextHolder` (a `WhoPrincipal`'s identity id, else null), validates in the order record → type → description → related, and serialises with `json.writeValueAsString(activity)`. `history` builds `PageRequest.of(index, size)` (unsorted: the native query orders), then one `namesOf` call over the page's non-null actor ids. The changelog creates `roux_activity` (`id uuid` primary key, `version bigint not null`, `occurred_at timestamptz not null`, `actor_id uuid`, `anchor_id uuid not null`, `related_ids uuid[] not null default '{}'`, `type varchar(100) not null`, `description varchar(500) not null`, `details jsonb not null`), index `ix_roux_activity_anchor (anchor_id, occurred_at desc, id desc)` and a GIN index `ix_roux_activity_related` on `related_ids` (raw SQL change); changeset ids `roux-activity-1`, `roux-activity-2`. `migratory.properties`: `name=roux-activity`, the changelog path, `after=who-jdbc`.

- [ ] **Step 4: Run to watch it pass**
  Run: `./mvnw -q install -pl runtime/roux-activity` (with JaCoCo)
  Expected: exit 0, coverage 100%.

- [ ] **Step 5: Register the module** in the root pom, the BOM and the starter; `./mvnw -q install -pl runtime/roux-bom,runtime/roux-spring-boot-starter` → exit 0.

- [ ] **Step 6: Commit** — `feat: roux-activity: the business activity log`

### Task 2: Auto-configuration and the real database

**Files:**
- Create: `runtime/roux-autoconfigure/src/main/java/org/jwcarman/roux/autoconfigure/activity/RouxActivityAutoConfiguration.java`, `RouxActivityPersistenceAutoConfiguration.java`
- Modify: `runtime/roux-autoconfigure/pom.xml` (optional dependency on roux-activity), `runtime/roux-autoconfigure/src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`
- Test: `runtime/roux-autoconfigure/src/test/java/org/jwcarman/roux/autoconfigure/activity/RouxActivityAutoConfigurationTest.java`, `runtime/roux-contract-tests/src/test/java/org/jwcarman/roux/contracts/ActivityContractTest.java`

**Interfaces:**
- Consumes: Task 1's `ActivityLog` constructor, `ActorNames`, `BusinessActivity`.
- Produces: an `ActivityLog` bean (`@ConditionalOnMissingBean`), built from the app's `JsonMapper`, `Clock` (`ObjectProvider`, else `Clock.systemUTC()`), and `ObjectProvider<ActorNames>` (else `ids -> Map.of()`). Persistence: `@AutoConfigurationPackage(basePackageClasses = BusinessActivity.class)`, before Spring Data JPA's repositories and Hibernate's auto-configuration, as `RouxThemePersistenceAutoConfiguration` is.

- [ ] **Step 1: Write the failing tests.**
  - `RouxActivityAutoConfigurationTest`: `the_log_is_there_with_a_jpa_app` (single `ActivityLog`); `an_apps_actor_names_are_used` (a bean naming one id; the log's history names it — through a mocked repository or by asserting the bean is the one injected); `an_apps_own_log_replaces_rouxs`; `without_jpa_there_is_no_log`.
  - `ActivityContractTest` (real PostgreSQL, migratory ran the changelog, Hibernate `validate` passed):
    - `appends_and_reads_back_a_records_history`: in a `TransactionTemplate`, `append(student, new Promoted("Yellow", money, date), rank)`; `history(student, page)` has one `Activity` with type, description, actor `"System"` and `details` `{"rank":"Yellow","fee":{"minorUnits":1500,"currency":"USD"},"on":"2026-11-20","note":null}` (a `Money`, a `LocalDate`, a `null`).
    - `a_related_record_finds_it_too`: `history(rank, page)` has it.
    - `the_later_of_two_at_the_same_instant_comes_first`: two appends, fixed clock → second first.
    - `outside_a_transaction_it_is_refused`: `IllegalTransactionStateException`.
    - `the_history_outlives_nothing_it_points_at`: an anchor id with no row anywhere → appends fine (no foreign key).

- [ ] **Step 2: Run to watch it fail**
  Run: `./mvnw -q verify -pl runtime/roux-autoconfigure -Dtest=RouxActivityAutoConfigurationTest -Dsurefire.failIfNoSpecifiedTests=false`
  Expected: compilation fails (`RouxActivityAutoConfiguration` not defined).

- [ ] **Step 3: Implement the two auto-configurations** and register them in the imports file.

- [ ] **Step 4: Run to watch them pass**
  Run: `./mvnw -q install -pl runtime/roux-autoconfigure,runtime/roux-spring-boot-starter && ./mvnw -q verify -pl runtime/roux-contract-tests`
  Expected: exit 0 (the contract tests read the starter from `~/.m2`, so it is reinstalled first).

- [ ] **Step 5: Commit** — `feat: roux-activity is auto-configured; real-database contract tests`

### Task 3: roux-web: `./activity` and `formatRelativeTime`

**Files:**
- Create: `web/roux-web/src/activity/{Activity.ts, ActivityList.tsx, index.ts}`, `web/roux-web/src/activity/ActivityList.test.tsx`, `web/roux-web/src/dates/relative.ts`, `web/roux-web/src/dates/relative.test.ts`
- Modify: `web/roux-web/package.json` (`"./activity"` export; the build and the guide checker read it), `web/roux-web/src/dates/index.ts`

**Interfaces:**
- Produces:
  - `interface Activity { id: string; occurredAt: string; type: string; description: string; actorId: string | null; actorName: string; details: Record<string, unknown> }`
  - `ActivityList(props: { "aria-label": string; query: PageQuery<Activity>; now?: Date; emptyText?: string })` — from the dojo's, showing `description`; default empty text `"Nothing has happened yet."`, error text `"Could not load the history."`.
  - `formatRelativeTime(iso: string, now?: Date): string` in `./dates`, in the organization's locale (`Intl.RelativeTimeFormat(organization().locale, { numeric: "auto" })`): `"just now"` under a minute, then minutes, hours, days (`"yesterday"`), months (30 days), years (365 days).

- [ ] **Step 1: Write the failing tests** (move the dojo's `relativeTime.test.ts` cases to `relative.test.ts` with ISO strings, plus `"il y a 5 minutes"` for `fr-FR`; move the dojo's `ActivityList.test.tsx`, showing `description`, the title `"Nov 5, 2026, 7:00 AM"` for `2026-11-05T12:00:00Z`, `"by James · 3 days ago"`, the empty text and a custom `emptyText`).

- [ ] **Step 2: Run to watch it fail**
  Run: `cd web/roux-web && npx vitest run src/activity src/dates/relative.test.ts`
  Expected: FAIL (modules not found).

- [ ] **Step 3: Implement** the three files and the export.

- [ ] **Step 4: Run to watch it pass**
  Run: `npm run build && npx vitest run --coverage && npm run mutate`
  Expected: build exit 0 with `dist/activity/index.js`; coverage 100%; no new Stryker survivors (round 3's ruled `join("")` and round 4's ruled day-watch reports aside).

- [ ] **Step 5: Commit** — `feat(web): ActivityList and formatRelativeTime`

### Task 4: The dojo's server on roux's log

**Files:**
- Delete: `examples/dojo/src/main/java/org/jwcarman/roux/examples/dojo/activity/` (all five), `members/MemberActivity.java`, `memberships/MembershipActivity.java`, and their tests
- Create: records for each kind the dojo writes (in their features' packages; names and facts the builder's: at least `MemberInvited`, `MemberRenamed`, `MemberDeactivated`, `MemberReactivated`, `MembershipStarted`, `PaymentRecorded`, `PaymentRemoved`, and new `StudentPromoted`), `members/MemberActorNames.java` (an `ActorNames` over member profiles)
- Create: `examples/dojo/src/main/resources/db/changelog/activity-to-roux.xml` (copies `activity` rows into `roux_activity`: `subject_id`→`anchor_id`, `action`→`type`, `summary`→`description`, `related_ids` `'{}'`, `details` `'{}'::jsonb`, keeping `id`, `version`, `occurred_at`, `actor_id`; then drops `activity`), included in the master changelog after `activity.xml`
- Modify: `MemberService`, `InviteController`, `MembershipService`, `PromotionService` (append, with the rank as related id), `MembersController` (history through `ActivityLog`), `StudentsController` (new `GET /api/students/{id}/activities`, `@RequiresPermission(Permissions.PAYMENTS_RECORD)`: payments are in it), `memberships/Recorders` (names through `ActorNames`)
- Test: the existing member history and activity tests, rewritten; `StudentHistoryTest` (new)

**Interfaces:**
- Consumes: `ActivityLog.append`, `ActivityLog.history(UUID, PageSpec)`, `ActorNames`, `Activity`.
- Produces: `GET /api/students/{id}/activities` → `PageDto<Activity>`.

- [ ] **Step 1: Write the failing tests:**
  - `StudentHistoryTest`: `a_promotion_starts_and_payments_are_in_the_students_history` (newest first: payment recorded, membership started, promoted, with `type`s and `details.periods`); `a_promotion_is_in_the_ranks_related_history` (through `ActivityLog.history(rankId, ...)`); `a_member_without_payments_record_is_refused` (403).
  - The member history test: `actorName` is the profile's name, `"System"` for the bootstrap, `details` `{"from": ..., "to": ...}` on a rename.
  - `ActivityMigrationTest`: `the_old_table_is_gone` (`to_regclass('activity')` is null after the master changelog ran). The row copy itself is checked by hand once against a database made before this task (a ledger line), since a test database never holds pre-migration rows.

- [ ] **Step 2: Run to watch it fail**
  Run: `cd examples/dojo && ../../mvnw -q verify -Djacoco.skip=true -DskipITs -Dskip.npm=true -Dfrontend.test.skip=true -De2e.skip=true`
  Expected: compilation fails, then the new tests fail.

- [ ] **Step 3: Implement** the records, the calls and the endpoint; remove the old package.

- [ ] **Step 4: Run to watch it pass** — same command → exit 0.

- [ ] **Step 5: Commit** — `feat(dojo): history through roux's activity log; the student's history`

### Task 5: The dojo's frontend on roux's `ActivityList`

**Files:**
- Delete: `examples/dojo/frontend/src/activity/` (ActivityList, relativeTime and tests)
- Modify: `frontend/src/api.ts` (drop `Activity`; import roux's), `members/MemberDetailView.tsx`, `members/members.ts`, `queryKeys.ts` (`students.activities(id)`), `students/students.ts` (`studentActivitiesPage(id)`), `students/StudentPage.tsx` (a History section, shown with `payments.record`), and `refreshes` on the membership, payment and promotion mutations to include the student's activities
- Test: `students/StudentPage.test.tsx` (`shows the student's history to someone who records payments`, `hides it from someone who does not`)

- [ ] **Step 1: Write the failing tests** (as above; MSW answers `/api/students/s1/activities` with one entry, description `"Promoted to Yellow"`).
- [ ] **Step 2: Run** `cd examples/dojo/frontend && npx vitest run src/students` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx tsc -b && npx vitest run && npm run build` → all pass; `grep -rn "relativeTime\|activity/ActivityList" src` → nothing.
- [ ] **Step 5: Commit** — `feat(dojo): the student's history, with roux's ActivityList`

### Task 6: Guide, findings, CHANGELOG, the whole build

**Files:**
- Create: `docs/guides/activity-log.md` + identical `plugins/roux/skills/roux/references/activity-log.md`
- Modify: `docs/guides/README.md` (index), `plugins/roux/skills/roux/SKILL.md` (row: "A record's history: who did what, when (`ActivityLog`, `BusinessActivity`, `ActivityList`)"), `docs/guides/getting-started.md` (+copy: the starter's module list), `docs/guides/dates-and-time.md` (+copy: `formatRelativeTime`), `plugins/roux/scripts/check-guides.mjs` (exclude the two auto-configurations), `CHANGELOG.md` (Added), `examples/dojo/FINDINGS.md` (a fixed entry: "Every app writes its own activity log")

The guide covers, in this order: what it is (and what it is not: Envers); declare a kind (the `MemberRenamed` example); append it (the transaction, related ids); the history endpoint (the app's permission); `ActivityList`; `ActorNames`; the table; and the Don't list from the spec (never rename a `type()` once rows exist; never put a secret in a record's fields; don't append outside the change's transaction; don't use it for column auditing).

- [ ] **Step 1:** Write the guide and entries; `node plugins/roux/scripts/check-guides.mjs` → `ok: ... references current`.
- [ ] **Step 2: Run** `./mvnw -q verify` (root, with the dojo's E2eIT) → exit 0; `grep -E "[0-9]+ (passed|failed)" examples/dojo/target/playwright.log` → all passed.
- [ ] **Step 3: Commit** — `docs: the activity log guide; CHANGELOG, findings`
