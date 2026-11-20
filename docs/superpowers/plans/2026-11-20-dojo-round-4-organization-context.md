# Organization Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every roux app declares its organization's time zone and locale; the server is the authority on "today"; the browser gets the context written into the page and formats every date, moment and amount from it.

**Architecture:** A new `roux-organization` module holds `OrganizationCalendar` (today, this month, today's end, from the app's `Clock` in the organization's zone), the `OrganizationContext` wire record, a source interface and `GET /api/organization`. roux-autoconfigure binds `roux.organization.*` (required) and wires it with the money currency; roux-spa writes the context into `#app-context`; `@NotInFuture` checks against the calendar. roux-web gains an `./organization` entry (read, load, `today()`, `useToday()`, the midnight rollover) and its formatters, `money()` and `MoneyField` read the context. The dojo moves onto all of it.

**Tech Stack:** Java 25, Spring Boot 4.1.3, JUnit 5, AssertJ; React 19, TanStack Query/Form, Zod, Vitest + MSW, Stryker; Playwright.

**Spec:** `docs/superpowers/specs/2026-11-20-dojo-round-4-organization-context-design.md`

## Global Constraints

- Settings: `roux.organization.time-zone` (IANA zone, required), `roux.organization.locale` (BCP 47 tag, required). The dojo sets `America/New_York` and `en-US`.
- Missing setting messages: `roux.organization.time-zone must be set to the organization's time zone (an IANA name such as America/New_York)` and `roux.organization.locale must be set to the organization's locale (a BCP 47 tag such as en-US)`. A locale that does not round-trip or is not in `Locale.getAvailableLocales()`: `roux.organization.locale is not a locale this server knows: <tag>`.
- Wire shape (both the page and `GET /api/organization`): `{"timeZone","locale","today","todayEndsAt","currency","fractionDigits"}`; `currency`/`fractionDigits` are `null` without `roux.money.currency`.
- Page placeholder: `__APP_CONTEXT__` inside `<script type="application/json" id="app-context">`, `<` escaped as `<` (as the theme).
- `GET /api/money` and `moneySettingsQuery` are removed; `GET /api/organization` is a public path (the page gives the same data to anyone).
- No context in the browser throws: `No organization context: call loadOrganization() before rendering (main.tsx), or setOrganization(testOrganization()) in a test's setup`.
- No `new Date()` / `LocalDate.now()` / `YearMonth.now()` for a business date anywhere in roux or the dojo (a moment's "how long ago" may use the device's now).
- roux's standing rules: no warning suppression, no star imports, 100% line and branch coverage per roux module, Stryker incremental (`npm run mutate`) on roux-web with no survivors, every public name in a guide (`node plugins/roux/scripts/check-guides.mjs`), guide copies under `plugins/roux/skills/roux/references/` byte-identical, spotless per module (`./mvnw -q -pl <module> spotless:apply`).
- Commit trailer on every commit:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_014GnzDJxXVyWy4Ec18M195n`.

## Review Focus

1. A zone ahead of UTC (`Pacific/Auckland`) late in the UTC day: the server's today is already tomorrow there; today, this month and `@NotInFuture` must all say so (Task 1 and Task 3 tests).
2. The last day of a month in the organization's zone while UTC is in the next month: Payments' "this month" must stay in the organization's month (Task 7 test).
3. A tab left open past midnight, or a device asleep through it: the next visible moment must take the new day and refresh every query; a failed or same-day fetch must keep the old day and retry (Task 5 tests).
4. A schema built at module load (before `loadOrganization()` resolves in development): `money()` must read the context when it validates, not when it is built (Task 6 test).
5. An app upgraded without the new `index.html` line: startup must fail naming `__APP_CONTEXT__` (Task 4 test).

---

### Task 1: `roux-organization`: the calendar, the context, the endpoint

**Files:**
- Create: `runtime/roux-organization/pom.xml` (like `runtime/roux-money/pom.xml`: spring-webmvc and jackson annotations as the money module has them, jspecify)
- Create: `runtime/roux-organization/src/main/java/org/jwcarman/roux/organization/{OrganizationCalendar,OrganizationContext,OrganizationContextSource,OrganizationController}.java`
- Test: `runtime/roux-organization/src/test/java/org/jwcarman/roux/organization/{OrganizationCalendarTest,OrganizationContextTest,OrganizationControllerTest}.java`
- Modify: root `pom.xml` (the module listed before `roux-validation` and `roux-spa`, which will depend on it), `runtime/roux-bom/pom.xml`, `runtime/roux-spring-boot-starter/pom.xml`

**Interfaces:**
- Produces:
  - `public final class OrganizationCalendar { public OrganizationCalendar(Clock clock, ZoneId zone, Locale locale); ZoneId zone(); Locale locale(); ZonedDateTime now(); LocalDate today(); YearMonth thisMonth(); Instant todayEndsAt(); }` — reads `clock.instant()` only, never the clock's zone; `todayEndsAt()` is `today().plusDays(1).atStartOfDay(zone).toInstant()`.
  - `public record OrganizationContext(String timeZone, String locale, LocalDate today, Instant todayEndsAt, @Nullable String currency, @Nullable Integer fractionDigits) { static OrganizationContext of(OrganizationCalendar calendar, @Nullable Currency currency); }` (`locale` as `toLanguageTag()`).
  - `@FunctionalInterface public interface OrganizationContextSource { OrganizationContext current(); }`
  - `@RestController public class OrganizationController { public static final String PATH = "/api/organization"; public OrganizationController(OrganizationContextSource source); @GetMapping(PATH) OrganizationContext organization(); }`

- [ ] **Step 1: Write the failing tests**

`OrganizationCalendarTest` (a fixed `Clock` per case; `NY = ZoneId.of("America/New_York")`):
- `todayIsTheOrganizationsDateNotUtcs`: instant `2026-11-21T03:00:00Z`, NY → `today()` is `2026-11-20`, `thisMonth()` `2026-11`.
- `aZoneAheadOfUtcIsAlreadyTomorrow`: `2026-11-20T12:00:00Z`, `Pacific/Auckland` → `2026-11-21`.
- `theClocksOwnZoneIsIgnored`: `Clock.fixed(2026-11-21T03:00:00Z, ZoneId.of("Asia/Tokyo"))`, NY → `2026-11-20`.
- `todayEndsAtTheNextLocalMidnight`: `2026-11-20T15:00:00Z`, NY → `2026-11-21T05:00:00Z`.
- `aShortDayEndsAfter23Hours`: `2026-03-08T12:00:00Z`, NY → `todayEndsAt()` `2026-03-09T04:00:00Z`.
- `aLongDayEndsAfter25Hours`: `2026-11-01T12:00:00Z`, NY → `2026-11-02T05:00:00Z`.
- `theLastDayOfTheMonthInTheZone`: `2026-12-01T03:00:00Z`, NY → `thisMonth()` `2026-11`.
- `nowIsInTheZone`, and null arguments → `NullPointerException` naming the argument.

`OrganizationContextTest`: `of(calendar, Currency.getInstance("USD"))` serializes (a `JsonMapper`) to exactly
`{"timeZone":"America/New_York","locale":"en-US","today":"2026-11-20","todayEndsAt":"2026-11-21T05:00:00Z","currency":"USD","fractionDigits":2}`; with `null` currency, `"currency":null,"fractionDigits":null`; JPY gives `0`.

`OrganizationControllerTest` (standalone MockMvc): `GET /api/organization` answers the source's context.

- [ ] **Step 2: Run them to see them fail**

Run: `./mvnw -q -pl runtime/roux-organization verify`
Expected: compile errors (the classes do not exist).

- [ ] **Step 3: Implement the four types; add the module to the root pom, the BOM and the starter**

- [ ] **Step 4: Run them to see them pass**

Run: `./mvnw -q -pl runtime/roux-organization spotless:apply && ./mvnw -q -pl runtime/roux-organization install`
Expected: exit 0, coverage checks met.

- [ ] **Step 5: Commit** — `feat: roux-organization: the organization's calendar and context`

---

### Task 2: The settings, the wiring, and `GET /api/money` goes

**Files:**
- Create: `runtime/roux-autoconfigure/src/main/java/org/jwcarman/roux/autoconfigure/organization/{RouxOrganizationProperties,RouxOrganizationAutoConfiguration}.java`
- Test: `runtime/roux-autoconfigure/src/test/java/org/jwcarman/roux/autoconfigure/organization/RouxOrganizationAutoConfigurationTest.java`
- Modify: `runtime/roux-autoconfigure/pom.xml` (optional `roux-organization`), `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` (after money), `RouxMoneyAutoConfiguration` (drop the controller bean)
- Delete: `runtime/roux-money/src/main/java/org/jwcarman/roux/money/MoneyController.java` and its tests in `MoneyTest`/`RouxMoneyAutoConfigurationTest`
- Modify: `runtime/roux-contract-tests/src/test/resources/application.properties` (`roux.organization.time-zone=America/New_York`, `roux.organization.locale=en-US`); `MoneyContractTest` (drop the `GET /api/money` case)
- Create: `runtime/roux-contract-tests/src/test/java/org/jwcarman/roux/contracts/OrganizationContractTest.java`

**Interfaces:**
- Consumes: Task 1's types.
- Produces: beans `OrganizationCalendar` (from `ObjectProvider<Clock>`, else `Clock.systemUTC()`), `OrganizationContextSource` (`() -> OrganizationContext.of(calendar, moneySettings?.currency())` from `ObjectProvider<MoneySettings>`), `OrganizationController` (servlet apps), and a `WhoPublicPathContributor` for `/api/organization` (when who is present); all `@ConditionalOnMissingBean`.
- `@ConfigurationProperties("roux.organization") public record RouxOrganizationProperties(@Nullable ZoneId timeZone, @Nullable String locale)` whose compact constructor throws `IllegalArgumentException` with the Global Constraints messages; `Locale toLocale()` gives the checked locale.

- [ ] **Step 1: Write the failing tests** (`ApplicationContextRunner` with `RouxOrganizationAutoConfiguration` and `RouxMoneyAutoConfiguration`):
  - `bothSettingsMakeTheCalendar`: zone and locale as set.
  - `missingTimeZoneFailsStartup` / `missingLocaleFailsStartup`: the failure's root cause message is the exact Global Constraints text.
  - `unknownTimeZoneFailsStartupNamingTheSetting`: `America/Nwe_York` → the failure mentions `roux.organization.time-zone`.
  - `malformedOrUnknownLocaleFailsStartup`: `en_US` and `xx-YY` → `roux.organization.locale is not a locale this server knows: <tag>`.
  - `theCalendarReadsTheAppsClock`: a `Clock` bean fixed at `2026-11-21T03:00:00Z` → `today()` `2026-11-20`.
  - `theContextCarriesTheCurrencyWhenThereIsOne` / `andNullsWithout`.
  - `anAppsOwnSourceReplacesRouxs`.
  - `OrganizationContractTest`: `GET /api/organization` signed out → 200 with `timeZone` `America/New_York` and `locale` `en-US`; `GET /api/money` → 404.
- [ ] **Step 2: Run them to see them fail** — `./mvnw -q -pl runtime/roux-autoconfigure verify` → compile errors.
- [ ] **Step 3: Implement; remove `MoneyController`**
- [ ] **Step 4: Run** `./mvnw -q -pl runtime/roux-money,runtime/roux-autoconfigure,runtime/roux-contract-tests -am install` → exit 0, coverage met.
- [ ] **Step 5: Commit** — `feat: roux.organization.time-zone and locale, required; GET /api/organization replaces GET /api/money`

---

### Task 3: `@NotInFuture` against the organization's today

**Files:**
- Modify: `runtime/roux-validation/pom.xml` (depends on `roux-organization`), `runtime/roux-validation/src/main/java/org/jwcarman/roux/validation/NotInFutureValidator.java`
- Test: its existing test class, and a case in `runtime/roux-contract-tests` (the existing `@NotInFuture` contract test, or a new one beside `MoneyContractTest`)

**Interfaces:**
- `@Autowired public NotInFutureValidator(ObjectProvider<OrganizationCalendar> calendar)`: with a calendar, valid when `!value.isAfter(calendar.today())`; without one (and the no-argument constructor), today's behaviour: system default zone, one day's allowance. The javadoc says the fallback is for use outside a roux app.

- [ ] **Step 1: Failing tests**: `tomorrowIsInTheFutureWithACalendar` (calendar at NY `2026-11-20`: `2026-11-21` invalid, `2026-11-20` valid); `aZoneAheadOfUtcAcceptsItsToday` (Auckland, instant `2026-11-20T12:00:00Z`: `2026-11-21` valid, `2026-11-22` invalid); `withoutACalendarTomorrowIsAllowed` (the old case, kept). Contract test: a request with tomorrow's date (from the app's calendar) is a 400 `Must not be in the future`.
- [ ] **Step 2: Run** `./mvnw -q -pl runtime/roux-validation -am install` → FAIL (`2026-11-21` accepted).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `./mvnw -q -pl runtime/roux-validation,runtime/roux-contract-tests -am install` → exit 0.
- [ ] **Step 5: Commit** — `feat: @NotInFuture checks against the organization's today`

---

### Task 4: The context in the page

**Files:**
- Modify: `runtime/roux-spa/pom.xml` (depends on `roux-organization`), `runtime/roux-spa/src/main/java/org/jwcarman/roux/spa/ShellPage.java`, `RouxSpaAutoConfiguration.shellPage(...)`, `runtime/roux-autoconfigure/src/test/resources/static/index.html`, `examples/dojo/frontend/index.html`
- Test: `ShellPageTest`, `ShellRoutesTest`, `SpaFallbackFilterMvcTest`

**Interfaces:**
- `public static final String CONTEXT_PLACEHOLDER = "__APP_CONTEXT__";` added to `PLACEHOLDERS`.
- `public ShellPage(String template, ContentSecurityPolicy policy, ShellThemeSource themes, OrganizationContextSource contexts, JsonMapper json)`.
- Both index.html files gain, after `#app-theme`: `<script type="application/json" id="app-context">__APP_CONTEXT__</script>` (with the nonce attribute the theme's tag has, if it has one).

- [ ] **Step 1: Failing tests** in `ShellPageTest`: `writesTheContextIntoThePage` (the page contains the context's exact JSON inside `#app-context`); `aPageWithoutTheContextPlaceholderIsRefused` (message names `__APP_CONTEXT__`); `theContextIsEscaped` (a source whose `timeZone` is `"</script><script>x"` → no `</script><script>` in the output, `<` present); `aPlaceholderInsideTheContextIsNotFilledAgain`.
- [ ] **Step 2: Run** `./mvnw -q -pl runtime/roux-spa -am install` → compile errors.
- [ ] **Step 3: Implement; update the wiring and both index.html files**
- [ ] **Step 4: Run** `./mvnw -q -pl runtime/roux-spa,runtime/roux-autoconfigure,runtime/roux-contract-tests -am install` → exit 0.
- [ ] **Step 5: Commit** — `feat: the shell writes the organization's context into the page`

---

### Task 5: roux-web `./organization`: read, load, today, the rollover

**Files:**
- Create: `web/roux-web/src/organization/{organization.ts,useToday.ts,dayWatch.ts,index.ts}` and tests beside them
- Modify: `web/roux-web/package.json` (`"./organization"` export like `./money`), `web/roux-web/src/testing/setup.ts` (`beforeEach(() => setOrganization(testOrganization()))`)

**Interfaces:**
- Produces (all from `@jwcarman/roux-web/organization`):
  - `interface OrganizationContext { timeZone: string; locale: string; today: string; todayEndsAt: string; currency: string | null; fractionDigits: number | null }`
  - `readPageOrganization(doc?: Document): OrganizationContext | undefined` — `undefined` for no `#app-context`, empty, or the unfilled placeholder; throws `The page's organization context (#app-context) ...` for not-JSON, a missing/blank field, or a locale `Intl.NumberFormat.supportedLocalesOf` lacks.
  - `loadOrganization(): Promise<OrganizationContext>` — the page's when present, else `GET /api/organization` (roux-web's api fetch); sets it.
  - `setOrganization(context: OrganizationContext): void`, `organization(): OrganizationContext` (throws the Global Constraints message when none), `today(): string`.
  - `useToday(): string` (re-renders when the day changes; `useSyncExternalStore` over the module's state).
  - `startDayWatch(queryClient: QueryClient): () => void` — a timer to `todayEndsAt`, and a `visibilitychange` check when the page becomes visible after it; fetches `GET /api/organization`; a different `today` → `setOrganization`, `queryClient.invalidateQueries()`; a failure or the same day → keeps the day, retries in 60 s or at the next visibility change; returns a stop function.
  - `testOrganization(overrides?: Partial<OrganizationContext>): OrganizationContext` — defaults `America/New_York`, `en-US`, today `2026-06-15`, todayEndsAt `2026-06-16T04:00:00Z`, `USD`, `2`.

- [ ] **Step 1: Failing tests** (Vitest, MSW, fake timers):
  - read: placeholder/missing → `undefined`; the dojo's JSON → the object; `{` → throws `is not JSON`; no `today` → throws naming `today`; locale `xx-YY` → throws naming the locale.
  - `organization()` before any set → throws the exact message; after `setOrganization`, `today()` is its today.
  - `loadOrganization` with a filled page → no request; without → one `GET /api/organization`.
  - day watch: at `todayEndsAt` with the server answering `2026-06-16` → `today()` `2026-06-16`, `invalidateQueries` called once, a `useToday()` component re-renders; the server failing → today unchanged, one retry 60 s later; the same day answered → unchanged, retried; a hidden tab past `todayEndsAt` becoming visible → fetches; the stop function cancels the timer.
- [ ] **Step 2: Run** `cd web/roux-web && npx vitest run src/organization` → FAIL (module not found).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx tsc -b && npx vitest run && npm run mutate` → all pass, no survivors.
- [ ] **Step 5: Commit** — `feat(web): the organization's context, today and the day's rollover`

---

### Task 6: roux-web formatters, money and `notInFuture()` read the context

**Files:**
- Create: `web/roux-web/src/dates/format.ts` (+ test); export from `src/dates/index.ts`
- Modify: `web/roux-web/src/money/money.ts` (+`index.ts`), `src/form/rules.ts`, `src/form/values.ts`, the `MoneyField` component and its props, `src/form/rules.test.ts`, `src/form/rules.contract.test.ts`, money tests

**Interfaces:**
- Consumes: `organization()`, `today()` (Task 5).
- Produces:
  - `formatDate(iso: string | null): string` (a LocalDate on its own day, organization locale, `dateStyle: "medium"`; `""` for null; text that is not a date as it is), `formatTime(iso: string): string` (`timeStyle: "short"`), `formatDateTime(iso: string | null): string` (an instant, `medium`/`short`, in the organization's `timeZone`), `formatNumber(value: number | null): string`.
  - `formatMoney(money: Money): string` — organization locale, `minimumFractionDigits`/`maximumFractionDigits` = the context's `fractionDigits`.
  - `money(): MoneyRule`, `moneyInputOf(money: Money | null): string`, `MoneyFieldProps` without `settings`; all read `organization()` when used (validation time, render time), never at construction. A context without a currency → `money()` validation throws `roux.money.currency is not set: the organization has no currency`.
  - Removed: `moneySettingsQuery`, `MoneySettings`.
  - `date().notInFuture()` compares with `today()`.
- [ ] **Step 1: Failing tests**:
  - `formatDate("2026-03-01")` → `"Mar 1, 2026"` with `en-US`, and `"1 mars 2026"` with `fr-FR` (set via `setOrganization(testOrganization({ locale: "fr-FR" }))`); `formatDateTime("2026-11-21T03:00:00Z")` → `"Nov 20, 2026, 10:00 PM"` in NY and the 21st with `Pacific/Auckland`.
  - `formatMoney({ minorUnits: 150000, currency: "HUF" })` with `fractionDigits: 2` → two decimals (`"HUF 1,500.00"` as Intl writes it in en-US: assert on `/1,500\.00/`).
  - `money()` built before any context, then validated after `setOrganization` → parses `"150"` to `{ minorUnits: 15000, currency: "USD" }`.
  - `notInFuture()`: with today `2026-06-15`, `"2026-06-16"` is `Must not be in the future`, `"2026-06-15"` passes.
  - The money contract fixture (`contracts/money.json`) still passes with no settings argument.
- [ ] **Step 2: Run** `npx vitest run src/dates src/money src/form` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx tsc -b && npx vitest run && npm run mutate` → pass, no survivors.
- [ ] **Step 5: Commit** — `feat(web): formatters, money and notInFuture read the organization's context`

---

### Task 7: The dojo's server on the organization's calendar

**Files:**
- Modify: `examples/dojo/src/main/resources/application.yml` (`roux.organization.time-zone: America/New_York`, `locale: en-US`), `students/StudentService.java`, `memberships/MembershipService.java`, `memberships/PaymentsService.java`, `members/MemberCsv.java` (and whatever constructs it)
- Test: `StudentListPaymentTest`, `PaymentsControllerTest`, `MembershipsControllerTest`, the members CSV test

**Interfaces:**
- Consumes: `OrganizationCalendar` (inject instead of `Clock` where a date is taken); `TestClock.set(String)` still drives it.
- History money text: `amount.format(calendar.locale())`.

- [ ] **Step 1: Failing tests**:
  - `aStudentPaidThroughYesterdayInNewYorkIsNotOverdueBeforeNewYorksMidnight`: paid through `2026-11-20`, clock `2026-11-21T03:00:00Z` → Paid, not Overdue (UTC would say Overdue).
  - `thisMonthIsNewYorksMonthAtUtcsMonthStart`: clock `2026-12-01T03:00:00Z`, a payment taken `2026-11-30` → in this month's payments; the monthly totals' newest month is `2026-11`.
  - CSV: a member joined at `2026-11-21T03:00:00Z` → joined `2026-11-20`.
- [ ] **Step 2: Run** `./mvnw -q -pl examples/dojo verify -Dtest='StudentListPaymentTest,PaymentsControllerTest,MembersControllerTest' -Dsurefire.failIfNoSpecifiedTests=false -Djacoco.skip=true` (the CSV test class as it is named) → the three new cases FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command without `-Dtest` restrictions on Java tests → pass.
- [ ] **Step 5: Commit** — `feat(dojo): today and this month are the school's`

---

### Task 8: The dojo's frontend on the context

**Files:**
- Modify: `examples/dojo/frontend/src/main.tsx` (`await loadOrganization()` before `createRoot(...).render`; `startDayWatch(queryClient)`), `src/testing/setup.ts` (`beforeEach(() => setOrganization(testOrganization()))`)
- Delete: `src/shell/format.ts`; move `yesNo` to `src/shell/yesNo.ts`; every importer uses `@jwcarman/roux-web/dates` formatters
- Modify: `PromoteDialog`, `StudentDialog`, `RecordPaymentDialog`, `StartMembershipDialog` (defaults from `today()`), `classes/classes.ts` (`latestOn(weekday, today = today())` on ISO strings), `plans/*` (no `settings`, no `moneySettingsQuery`; the Plans page no longer waits), tests that assumed the device's date

**Interfaces:**
- Consumes: Tasks 5 and 6.

- [ ] **Step 1: Failing tests**: `RecordPaymentDialog` defaults "Date taken" to `2026-06-15` (the test context's today); the Plans page shows "New plan" with no `GET /api/money` handler; a promotion dated tomorrow (`2026-06-16`) shows `Must not be in the future`.
- [ ] **Step 2: Run** `cd examples/dojo/frontend && npx vitest run` → those FAIL.
- [ ] **Step 3: Implement.** `relativeTime` keeps the device's now (it measures a moment, not a date).
- [ ] **Step 4: Run** `npx tsc -b && npx vitest run` (re-run `tsc -b` after vitest if the route tree regenerates) → all pass; `grep -rn "new Date()" src --include=*.ts* | grep -v test` lists only `relativeTime`.
- [ ] **Step 5: Commit** — `feat(dojo): dates, amounts and today from the organization's context`

---

### Task 9: End to end, guides, findings, CHANGELOG

**Files:**
- Modify: `examples/dojo/e2e/tests/payments.spec.ts` (the membership still starts a week back, so the student is overdue, but the date is computed from the page's `#app-context` `today`, not the browser's clock; the rest of the path is unchanged)
- Create: `docs/guides/dates-and-time.md` + identical `plugins/roux/skills/roux/references/dates-and-time.md`; a row in the skill's task table (`plugins/roux/skills/roux/SKILL.md`) and the guides index
- Modify: `docs/guides/money.md` (+copy: no settings, no `GET /api/money`, the digits note becomes "digits come from the server on both sides"), `docs/guides/getting-started.md` (+copy: the two settings in the yml example and table; the `#app-context` line in `index.html`), `docs/guides/shell.md` (+copy: the fourth placeholder), `CHANGELOG.md`, `examples/dojo/FINDINGS.md`, `examples/dojo/README.md` if it lists settings

The dates-and-time guide covers: the two settings and their failures; `OrganizationCalendar` (`today()`, `thisMonth()`, `todayEndsAt()`, `zone()`, `locale()`, `now()`); `@NotInFuture`; the context in the page and `GET /api/organization`; `loadOrganization`, `today()`, `useToday()`, `startDayWatch`, `setOrganization`, `testOrganization`, `readPageOrganization`; the formatters; what changing a setting does (the spec's table); and the Don't list (no `new Date()`/`LocalDate.now()` for a business date; never store a date computed from the clock and a zone; no locale or zone passed to a formatter).

CHANGELOG: Breaking — the two required settings; the `#app-context` line in `index.html`. Changed — money reads the context (`money()`, `MoneyField`, `moneyInputOf` lose `settings`; `moneySettingsQuery`, `MoneySettings` (web) and `GET /api/money` removed); `@NotInFuture` exact in a roux app. Added — `roux-organization`, `./organization`, the formatters in `./dates`.

FINDINGS: mark fixed "roux has no school time zone, or locale", "A money form waits for the currency before it exists", "The browser and the server can disagree on a currency's digits"; add anything new.

- [ ] **Step 1:** Write the guides and entries; `node plugins/roux/scripts/check-guides.mjs` → `ok: ... references current`.
- [ ] **Step 2:** Update the e2e spec.
- [ ] **Step 3: Run** `./mvnw -q verify` (root; includes the dojo's E2eIT) → exit 0; `grep -E "[0-9]+ (passed|failed)" examples/dojo/target/playwright.log` → all passed.
- [ ] **Step 4: Commit** — `docs: dates and time guide; round 4 findings, CHANGELOG`
