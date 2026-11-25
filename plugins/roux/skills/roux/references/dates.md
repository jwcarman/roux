# Dates and time

The organization's time zone and locale are configuration; the server says what today is. Today,
this month, default dates and "not in the future" are the organization's on both sides.

## Rules

- Never a business date from `new Date()` (browser) or `time.Now()` (server): use `today()` in the
  browser and the service's `today()` (below) on the server.
- Time comes from the module's clock (`Clock func() time.Time`, `time.Now` when nil), never
  `time.Now()` in a service: tests move the clock.
- Never store a date computed from the clock and a zone: store the moment (`timestamptz`), or the
  date the person picked (`date`).
- Never pass a locale or zone to a formatter, or use `Intl`/`toLocaleString`: use roux's formatters,
  which use the organization's locale and zone so every viewer sees the same date.
- "Not in the future" compares with the organization's today (`problem.MustNotBeInFuture`), never
  the server's zone: near midnight they differ.
- Date arithmetic with date-fns (`addDays`, `isAfter`); no hand-written date math.

## Names

Settings: `ORG_TIME_ZONE` (an IANA zone, default `UTC`; an offset is refused), `ORG_LOCALE`
(BCP 47, default `en-US`).

Server: `k.Organization()` → `organization.Context` (in the browser, `OrganizationContext`) (`TimeZone`, `Locale`, `Today`, `TodayEndsAt`,
`Currency`, `FractionDigits`); the users module sets it before any other module mounts, so read it at `Mount` or per request. The same context is in every
page and at `GET /api/roux/organization` (`organization.Path`, signed in), built by the users
module's `organization.Calendar`.

Columns and wire: a date is a `date` column, a `time.Time` at midnight UTC, answered `"2026-11-17"`
(`d.Format(time.DateOnly)`); a time of day is a `time` column, `pgtype.Time`, answered `"18:30"`, a
wall-clock time in the organization's zone; a moment is `timestamptz` and `time.Time`, an ISO string.
A paged list's row reads strings its view formats: `to_char(day, 'YYYY-MM-DD')`,
`to_char(at_time, 'HH24:MI')` (`lists.md`).

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

A time from the server starts a form through `timeInputOf`.

## Example

```go
// Service is the payments' operations.
type Service struct {
	Pool  *pgxpool.Pool
	Clock func() time.Time
	// Zone is the organization's time zone, for "today" and "this month".
	Zone func() string
}

// today is the organization's date now, at midnight UTC (how a Postgres date travels).
func (s Service) today() (time.Time, error) {
	zone, err := time.LoadLocation(s.Zone())
	if err != nil {
		return time.Time{}, err
	}
	y, m, d := s.Clock().In(zone).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC), nil
}
```

The module passes `Zone: func() string { return k.Organization().TimeZone }`. A date's arithmetic is
`d.AddDate(0, 0, n)`; the Monday of its week is `d.AddDate(0, 0, -(int(d.Weekday())+6)%7)`.

```ts
defaultValues: { takenOn: today() },
// the most recent Tuesday up to today
formatIsoDate(previousTuesday(parseIsoDate(today())!));
```

## Check

- Browser tests run in `testOrganization()`: New York, `en-US`, USD, today `2026-06-15` (a Monday).
  Another day: `setOrganization(testOrganization({ today: "2026-11-17" }))`. Never fake the device
  clock or answer `/api/roux/organization`.
- Go tests pass `a.Clock.Now` as the clock and move it with `a.At(moment)`; today is that moment's
  date in the organization's zone (`2026-04-15T03:00:00Z` is April 14 in New York).

## Pitfalls

- `time.Now()` in a service: the test's `a.At` changes nothing, and a test that passes today fails
  near midnight.
- `time.Now().Format(time.DateOnly)` for today: the server's zone, not the organization's.
- A `date` scanned into a `time.Time` and formatted in a zone other than UTC: off by a day.
- Without the context loaded, `today()`, the formatters and the money rule throw (browser).
- An offset-style zone (`-05:00`) or a mis-cased locale (`en-us`) stops startup naming the setting.
