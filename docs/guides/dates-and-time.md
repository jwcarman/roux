# Dates and time

A roux app knows where its organization is. The organization's **time zone** and **locale** are
configuration, and the **server says what today is**: "today", "this month", every default date and
every "not in the future" check are the organization's, on the server and in the browser alike.
Every date, time and amount the app shows is written in the organization's locale, and a moment in
its zone.

This is for the organization's own members (staff). A viewer's own locale is not supported yet.

## The settings

```yaml
roux:
  organization:
    time-zone: America/New_York   # an IANA zone: where the organization's day starts and ends
    locale: en-US                 # a BCP 47 tag: how dates, numbers and amounts are written
```

Both are required (`RouxOrganizationProperties`). There is no default: a missing setting fails
startup with `roux.organization.time-zone must be set to the organization's time zone` (or
`roux.organization.locale must be set to the organization's locale`); an unknown zone fails binding
`roux.organization.time-zone`, and a fixed offset (`+05:00`, `UTC+3`) is refused: a place's zone
knows its daylight saving time, an offset does not (`UTC` and `Etc/GMT+5` are fine). A tag written
another way says how to write it (`roux.organization.locale must be written en-US, not en-us`), and a
malformed tag or one the JVM has no locale for fails with
`roux.organization.locale is not a locale this server knows: <tag>`.

### What changing a setting does

A redeploy with a new zone or locale is safe: nothing stored is reinterpreted.

| What | After the change |
| --- | --- |
| Stored moments (`Instant`, `created_date`) | Unchanged; shown in the new zone. |
| Stored dates a person picked (a birth date, the day a payment was taken) | Unchanged. |
| Today, this month, overdue, the default dates | Move to the new zone's. |
| A date computed from the clock and a zone, then stored | Keeps the old zone's day (which is why you never store one). |
| Tabs already open | Move on their next load. |

## The server: `OrganizationCalendar`

`roux-organization` (in the starter) provides the `OrganizationCalendar` bean. Inject it wherever
the server needs today:

- `today()`: the organization's `LocalDate`;
- `thisMonth()`: its `YearMonth`;
- `now()`: a `ZonedDateTime` in the organization's zone;
- `todayEndsAt()`: the `Instant` the next day starts (a 23- or 25-hour day is right);
- `zone()` and `locale()`: the settings, for a date taken from an instant
  (`joinedAt.atZone(calendar.zone()).toLocalDate()`) or text the server writes
  (`money.format(calendar.locale())`).

Each reads the instant from the app's `Clock` bean (who's, UTC; `Clock.systemUTC()` without one) and
applies the organization's zone, never the clock's own. A test that sets the clock sets today on
both sides:

```java
@Service
class PaymentsService {
  private final OrganizationCalendar calendar;

  MonthlyTotals totals() {
    YearMonth now = calendar.thisMonth();
    ...
  }
}
```

**`@NotInFuture`** (roux-validation) checks against `OrganizationCalendar.today()`, exactly: the
browser defaults and checks against the same day, so the two never disagree. Outside a roux app (no
calendar bean) it falls back to the system clock's today plus one day.

## The context in the page

roux's shell writes the organization's context into every page it serves, beside the theme
(`<script type="application/json" id="app-context">__APP_CONTEXT__</script>` in `index.html`; see
[Getting started](getting-started.md#the-shell)):

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

`currency` and `fractionDigits` are `null` without `roux.money.currency`. `GET /api/organization`
(`OrganizationController`, open to anyone) answers the same. The value is an `OrganizationContext`
from the `OrganizationContextSource` bean; an app that declares its own source replaces roux's.

## The browser: `@jwcarman/roux-web/organization`

In `main.tsx`, before `render`:

```tsx
import { loadOrganization, startDayWatch } from "@jwcarman/roux-web/organization";

await loadOrganization().catch((error: unknown) => {
  document.getElementById("root")!.textContent = `The app could not start: ${String(error)}`;
  throw error;
});
startDayWatch(queryClient);
```

The `catch` puts a failure (no server in development, a malformed context) on the page; without it the
page stays blank and the reason is only in the console.

- `loadOrganization()` takes the page's context (`readPageOrganization()`), at once; when the page
  has none or the unfilled placeholder (`CONTEXT_PLACEHOLDER`: Vite's dev server serves the page
  itself), it asks the server (`fetchOrganization()`, at `ORGANIZATION_PATH`). A malformed context,
  a currency without its digits or a locale the browser lacks throws.
- `today()`: the organization's date, `"2026-11-20"`, for every default (`defaultValues: { takenOn:
  today() }`). `useToday()` is the same in a component, re-rendering when the day changes.
- `startDayWatch(queryClient)`: at `todayEndsAt`, and when a tab becomes visible after it (a laptop
  waking), it asks the server for the new day, sets it and refreshes every query (overdue and this
  month hang off today). A failure, or the same day back (a device clock ahead of the server's),
  keeps the day and asks again after `RETRY_MS` (a minute). It returns the function that stops it.
- `organization()`: the whole `OrganizationContext`. `setOrganization(context)` sets it and
  `onOrganizationChange(listener)` hears each change (both are what the day watch and `useToday`
  use); `clearOrganization()` forgets it.

With no context loaded or set, `organization()`, `today()`, the formatters and the money rule throw,
naming the fix. There is no fallback to the device's date or locale.

### Format

`@jwcarman/roux-web/dates`, each in the organization's locale, `""` for `null`:

- `formatDate("2026-03-01")`: a `LocalDate`, on that day whatever the zone (`Mar 1, 2026`);
- `formatTime("16:30:00")`: a time of day (`4:30 PM`);
- `formatDateTime("2026-11-21T03:00:00Z")`: a moment, where the organization is
  (`Nov 20, 2026, 10:00 PM`);
- `formatNumber(1234.5)`: `1,234.5`;
- `formatRelativeTime("2026-11-17T12:00:00Z")`: how long ago, from this device's time (`3 days ago`,
  `yesterday`, `now`) ([The activity log](activity-log.md#the-browser-activitylist));
- `formatMoney(money)` (`@jwcarman/roux-web/money`): with the server's digits ([Money](money.md)).

None takes a locale or a zone.

### Test

Every test starts in one fixed organization, set in the Vitest setup:

```ts
import { setOrganization, testOrganization } from "@jwcarman/roux-web/organization";

beforeEach(() => setOrganization(testOrganization()));
```

`testOrganization()` is New York, `en-US`, USD with 2 digits, today `2026-06-15` (a Monday). A test
that needs another day sets it: `setOrganization(testOrganization({ today: "2026-11-17" }))`. No test
fakes the device's clock to move today, and none answers `GET /api/organization`.

On the server, set the `Clock` bean (a test clock) to an instant; today is that instant's date in the
organization's zone (`2026-04-15T03:00:00Z` is still April 14 in New York).

- **who's sessions expire on that clock.** Moving it hours or weeks ahead signs everyone out: the next
  request is `401`, which reads like a permissions bug. Sign the person in again after moving it (a
  fresh browser from `TestMembers`, [Testing](testing.md#signed-in-people-testmembers)).
- **who stamps its own rows with the database's time, not the clock.** An identity's `created_at` (a
  member's joined moment) is PostgreSQL's `now()`; a test of the date shown for it sets the column with
  SQL rather than moving the clock.

## Don't

- Don't take a business date from `new Date()` in the browser, or from `LocalDate.now()` (any clock's
  own zone) on the server. Use `today()` and `OrganizationCalendar`.
- Never store a date computed from the clock and a zone: store the moment (an `Instant`), or the date
  the person picked. A computed date keeps the zone it was computed in.
- Don't pass a locale or a zone to a formatter, or format with `Intl` or `toLocaleString` yourself.
- Don't use `@PastOrPresent` for a date a person picks: use `@NotInFuture`
  ([Forms](forms.md#the-rule-helpers)).
