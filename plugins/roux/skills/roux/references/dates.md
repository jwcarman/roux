# Dates and time

The organization's time zone and locale are configuration; the server says what today is. Today,
this month, default dates and "not in the future" are the organization's on both sides.

## Rules

- Never a business date from `new Date()` (browser) or `LocalDate.now()` (server): use `today()` and
  `OrganizationCalendar`.
- Time comes from the injected `Clock`; never `now()` without it.
- Never store a date computed from the clock and a zone: store the `Instant`, or the date the person
  picked.
- Never pass a locale or zone to a formatter, or use `Intl`/`toLocaleString`: use roux's formatters.
- `@NotInFuture`, never `@PastOrPresent`, for a picked date.
- Date arithmetic with date-fns (`addDays`, `isAfter`); no hand-written date math.

## Names

Settings (required, `RouxOrganizationProperties`): `roux.organization.time-zone` (an IANA zone, not
an offset), `roux.organization.locale` (`en-US`).

Server, `OrganizationCalendar` (inject it): `today()` (`LocalDate`), `thisMonth()` (`YearMonth`),
`now()` (`ZonedDateTime`), `todayEndsAt()`, `zone()`, `locale()`. `@NotInFuture` checks against
its `today()`. The page's context is an `OrganizationContext` (`timeZone`, `locale`, `today`,
`todayEndsAt`, `currency`, `fractionDigits`), also at `GET /api/organization`.

Browser, `@jwcarman/roux-web/organization`: `loadOrganization()` and `startDayWatch(queryClient)` in
`main.tsx` (`app-setup.md`); `today()` (`"2026-11-20"`), `useToday()` in a component;
`organization()`, `setOrganization(context)`, `onOrganizationChange(listener)`,
`clearOrganization()`; `readPageOrganization()`, `fetchOrganization()`, `ORGANIZATION_PATH`,
`CONTEXT_PLACEHOLDER`, `RETRY_MS`; `testOrganization(overrides)` for tests.

Browser, `@jwcarman/roux-web/dates` (organization's locale, `""` for `null`):

| Function | Input | Shows |
| --- | --- | --- |
| `formatDate` | `"2026-03-01"` | `Mar 1, 2026` |
| `formatTime` | `"16:30:00"` | `4:30 PM` |
| `formatDateTime` | an instant | `Nov 20, 2026, 10:00 PM` in the organization's zone |
| `formatInstantDate` | an instant | the day it falls on there |
| `formatNumber` | `1234.5` | `1,234.5` |
| `formatRelativeTime` | an instant | `3 days ago` |

Plus `parseIsoDate`, `formatIsoDate`, `parseIsoTime`, `formatIsoTime` to go between ISO strings and
`Date` (strict: `2026-02-30` is `undefined`). Money: `formatMoney` (`money.md`).

Wire: `LocalDate` `2026-11-17`; `LocalTime` `18:30` (server writes `18:30:00`; start a form with
`timeInputOf`); `Instant` an ISO string.

## Example

```java
@Service
class PaymentsService {
  private final OrganizationCalendar calendar;

  PaymentsService(OrganizationCalendar calendar) {
    this.calendar = calendar;
  }

  MonthlyTotals totals() {
    YearMonth month = calendar.thisMonth();
    // ...
  }
}
```

```ts
defaultValues: { takenOn: today() },
// the most recent Tuesday up to today
formatIsoDate(previousTuesday(parseIsoDate(today())!));
```

## Check

- Browser tests run in `testOrganization()`: New York, `en-US`, USD, today `2026-06-15` (a Monday).
  Another day: `setOrganization(testOrganization({ today: "2026-11-17" }))`. Never fake the device
  clock or answer `/api/organization`.
- Server tests set `TestClock`; today is that instant's date in the organization's zone
  (`2026-04-15T03:00:00Z` is April 14 in New York).

## Pitfalls

- Moving the clock hours or weeks signs everyone out (who's sessions use it): the next request is
  401. Sign in again after moving it.
- who stamps its rows with PostgreSQL's `now()`, not the clock: set such a column with SQL in a test.
- Without the context loaded, `today()`, the formatters and the money rule throw.
- A missing or offset-style zone, or a mis-cased locale (`en-us`), fails startup naming the setting.
