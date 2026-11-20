# Dojo round 4: the organization's time zone, locale and "today"

## Intent

Round 3 found that a roux app has no idea where it is. "Today" is the server clock's date in UTC, so
a school in the Americas sees students overdue a day early and late payments land in the wrong
month. The browser uses the device's own date, zone and locale, so a dialog's default date and the
server's `@NotInFuture` can disagree, and money is formatted with the browser's digits while it is
parsed with the server's. Three open findings come from this one gap ("roux has no school time zone,
or locale", "A money form waits for the currency before it exists", "The browser and the server can
disagree on a currency's digits").

Round 4 gives every roux app one **organization context**: the organization's time zone, locale and
currency, set in configuration, with the **server as the authority on what today is**. The browser
gets it written into the page, as it already gets the theme, so it is there before any code runs.

The audience is the organization's own members (staff). Customers come in a later round.

## Goals

- An app declares its time zone and locale once; startup fails without them.
- "Today" and "this month" on the server and in the browser are the organization's, from the
  server's injected `Clock`: the two can never disagree, and a test that fixes the server's clock
  fixes the browser's today.
- Every date, moment and amount the app shows is written in the organization's locale, a moment in
  its time zone, an amount with the server's digits.
- A money schema is an ordinary module constant again: no fetch, no settings prop.
- The rule "store the moment, or the date the person picked; never a date computed from the clock" is
  in the guides.

## Non-goals

- A viewer's own locale (customers, a mixed-language team). The formatters read the locale from the
  context, never a fixed value, so a later round can add a per-viewer locale without rewriting them.
- A time zone per member, or per location.
- Changing these settings in the app (an owner's settings page): they are configuration.
- Scheduled jobs, and more than one currency.

## Anti-goals

- A silent default (UTC, the JVM's zone, the browser's locale). A missing setting fails startup.
- Business dates from `new Date()` in the browser or `LocalDate.now()` (any clock's own zone) on the
  server.
- A stored date computed from the clock and a zone.
- A loading state the app did not have before (a page waiting for the context).

## Decided with the user

- The time zone and locale are the organization's, in configuration: a business rarely moves, and
  a value that cannot change under live data is one less thing for an agent-built app to get wrong.
- Changing them later (a redeploy) is safe by design: stored moments are UTC instants and stored
  dates are the dates people picked, so nothing stored is reinterpreted; only "now"-relative views
  (overdue, this month, default dates) move, which is right after a move.
- The server says what today is, rather than the browser working it out from the zone.
- Display is in the organization's locale for now; a viewer's locale is for the customer round.
- This round is for members only.
- The context reaches the browser written into the page (approach A below).

## Approaches (how the browser gets the context)

1. **Written into the page, like the theme (chosen).** roux-spa already renders `index.html` per
   request and writes the theme into `#app-theme`. The context goes beside it: there before any code
   runs, no fetch, no loading state, formatters stay plain functions, a money schema is a module
   constant. At the end of the day the browser fetches `GET /api/organization` once for the new day.
   The page carries a little more per-request data; it is never cached and none of it is secret.
2. An endpoint fetched at startup behind a provider (like `/who/me`): conventional, but every page
   waits on one more request, formatters become hooks, and every test answers one more request.
3. Both: approach 1 plus a provider over the endpoint for after midnight: more machinery than the
   rollover needs.

The user chose 1.

## The settings

| Setting | What | Required |
| --- | --- | --- |
| `roux.organization.time-zone` | An IANA zone (`America/New_York`). Where the organization's day starts and ends. | Yes. Missing or unknown fails startup, naming the setting. |
| `roux.organization.locale` | A BCP 47 tag (`en-US`). How dates, numbers and amounts are written. | Yes. Missing, malformed or a locale the JVM does not have fails startup, naming the setting. |
| `roux.money.currency` | As round 3. | When the app has money. |

The dojo sets `America/New_York` and `en-US`. Every roux app must set the two new ones (a breaking
change, in the CHANGELOG with what to do), as `roux.owner.email` is required.

## The server

- **`OrganizationCalendar`** (a bean): `zone()`, `locale()`, `today()` (`LocalDate`), `thisMonth()`
  (`YearMonth`), `todayEndsAt()` (`Instant`: the start of tomorrow in the zone, so a 23- or 25-hour
  day is right), and `now()` (`ZonedDateTime`). Every one reads the instant from the app's `Clock`
  bean (who's, UTC) and applies the organization's zone; it never uses the clock's own zone.
- **`@NotInFuture`** checks against `OrganizationCalendar.today()`, exactly. The one-day allowance it
  has today exists because the browser and the server could disagree; they no longer can.
- **The context**, one shape everywhere:

  ```json
  {
    "timeZone": "America/New_York",
    "locale": "en-US",
    "today": "2026-11-20",
    "todayEndsAt": "2026-11-21T05:00:00Z",
    "currency": "USD",
    "fractionDigits": 2
  }
  ```

  `currency` and `fractionDigits` are null when `roux.money.currency` is not set.
- **`GET /api/organization`** answers it, open to anyone signed in. **`GET /api/money` goes**, and so
  does `moneySettingsQuery` in the browser: the context carries the currency (roux-money is not
  released yet, so this is a change within the unreleased version, noted in the CHANGELOG).
- **The page:** `index.html` gets a fourth placeholder, `__APP_CONTEXT__`, inside
  `<script type="application/json" id="app-context">`, filled per request with the same JSON, escaped
  as the theme is. A built page without it is refused at startup, as the other placeholders are.
- **`Money.format(Locale)`** stays; server-written text (the dojo's history entries) uses the
  organization's locale, not `Locale.US`.

## The browser (roux-web)

- **Reading it:** the page's `#app-context` is read once when the module loads. When the page has
  none, or an unfilled placeholder (Vite's dev server serves the page itself), the app fetches
  `GET /api/organization` before it renders: an `await loadOrganization()` in `main.tsx` that resolves
  at once when the page had it. A page whose context is malformed fails loudly, as `#app-theme` does.
- **Today:** `today()` gives the organization's date (`YYYY-MM-DD`). At `todayEndsAt` the browser
  fetches `GET /api/organization` once and takes the new day; a `useToday()` hook re-renders with it.
  Nothing in the app or roux-web uses `new Date()` for a business date.
- **Formatting moves into roux-web** (from the dojo's `shell/format.ts`): `formatDate` (a `LocalDate`,
  on that day whatever the zone), `formatDateTime` and `formatTime` (a moment, in the organization's
  zone), `formatNumber`, and `formatMoney` (with the context's digits, which fixes the HUF/IDR/COP/
  LBP/IQD disagreement). All in the organization's locale. They read the context; none takes a locale
  argument.
- **Forms:** `date().notInFuture()` compares with `today()`. `money()` takes no settings and
  `f.MoneyField` no `settings` prop: both read the context. A form's date default is `today()`.
- **Tests:** a roux-web testing helper sets a fixed context (zone, locale, today, currency) for a
  Vitest run, and Vitest setup in an app calls it, so no test answers a request for it and a test can
  change today.

## The dojo

- `StudentService`, `MembershipService` and `PaymentsService` take today and this month from
  `OrganizationCalendar`; `MemberCsv` writes the joined date in the organization's zone.
- History entries format money in the organization's locale.
- The frontend's `shell/format.ts` goes; pages use roux-web's formatters. The membership, payment and
  promotion dialogs default dates with `today()`; the plan form and dialogs drop `settings`.
- The end-to-end payments test starts the membership on the server's today (it no longer needs to
  start a week back) and checks overdue.
- `FINDINGS.md`: the three findings above are marked fixed; anything new found is added.

## Docs

- A guide on dates and time (`docs/guides/dates-and-time.md`, with its plugin copy and a row in the
  skill's task table): the two settings, `OrganizationCalendar`, `today()` and `useToday()`, the
  formatters, the context in the page, and a **Don't** list: no `new Date()` or `LocalDate.now()` for
  a business date; never store a date computed from the clock and a zone (store the moment, or the
  date the person picked); no locale or zone passed to a formatter.
- What changing the settings does (the table from the design conversation): stored moments and picked
  dates are untouched; today, this month and default dates move; a date computed and stored from the
  clock keeps the old zone's day; open tabs move on their next load.
- `money.md` updated (no settings, `GET /api/money` gone); getting-started's settings table and the
  CHANGELOG (Breaking: the two required settings; Changed: money reads the context).

## Constraints

- roux's standing rules: Problem Details, versions, time from the injected `Clock`, `meta.refreshes`,
  icons from `react-icons/lu`, no warning suppression, no star imports, 100% line and branch coverage
  per roux module, Stryker (incremental) on roux-web, every public name in a guide.
- The page is never cached (already `no-store`), so a context in it is always this request's.
- Liquibase is untouched: nothing is stored.

## Settled after the builder check (my calls unless marked)

- **No context, no formatting.** `today()`, the formatters, `money()` and `f.MoneyField` throw, naming
  the fix, when no context has been read or set (an app's Vitest run that never called the testing
  helper). No fallback: a silent default is an anti-goal.
- **Which "today" paths change** (from a search of roux): `NotInFutureValidator` (roux-validation,
  today the system clock's zone plus a day) and roux-web's `date().notInFuture()` (`new Date()`) are
  the only ones in roux; the dojo's are the three services and `MemberCsv` above. Nothing else in
  roux's runtime reads a date from a clock.
- **`@NotInFuture` without the calendar.** roux-validation stays usable outside Spring: with an
  `OrganizationCalendar` bean it checks exactly against its today; built without Spring (no bean)
  it keeps today's behaviour (system zone, one day's allowance), documented as the fallback for
  non-roux use only.
- **The clock.** `OrganizationCalendar` uses the app's `Clock` bean when there is one (who supplies
  it, UTC) and `Clock.systemUTC()` otherwise; it always applies the organization's zone, whatever the
  clock's own zone (a test clock in another zone gives the same today).
- **The rollover.** One fetch at `todayEndsAt`, and again when the tab becomes visible after it (a
  laptop waking). A failed fetch, or one that returns the same day (a skewed device clock), retries
  at the next visibility change or a minute later; the old day stays meanwhile, and the server checks
  every date anyway. When the day changes, every query is invalidated
  (`queryClient.invalidateQueries()`): overdue, this month and the monthly totals all hang off today,
  and listing which ones do is the kind of list an agent forgets to keep.
- **The placeholder is breaking.** An app whose `index.html` lacks `__APP_CONTEXT__` fails startup:
  a third Breaking entry in the CHANGELOG, with the line to add. A test writes a hostile value (a
  zone or locale cannot hold `</script>`, so the test uses the escaping path directly) as the theme's
  test does.
- **The locale check.** On the server, the tag must round-trip (`Locale.forLanguageTag(tag)
  .toLanguageTag()` equals the configured tag) and be in `Locale.getAvailableLocales()`. In the
  browser, reading the context refuses a locale `Intl.NumberFormat.supportedLocalesOf` does not
  have, loudly, as a malformed context is.
- **Parity is digits only.** The browser's grouping and symbols are CLDR's in the browser, the
  server's text is the JVM's CLDR; they may differ in small ways (a space or symbol form), which is
  accepted. Fraction digits come from the server on both sides.
- **DST.** `OrganizationCalendar` has tests for a 23-hour day and a 25-hour day in `America/New_York`
  (`todayEndsAt` is the next local midnight) and for a zone ahead of UTC (`Pacific/Auckland`).
- **`MemberCsv`.** `joinedAt` is an `Instant`: its date is taken in the organization's zone.

## Left to the builder

- Which module holds `OrganizationCalendar`, its properties and controller (a new `roux-organization`
  in the starter, or an existing one), and how roux-spa gets the context to write (a source interface
  like `ShellThemeSource`, or the bean directly).
- The names of the browser functions beyond those above, and which roux-web entry holds them.
- How the midnight refetch is scheduled (a timer to `todayEndsAt`, with a check on tab focus).
