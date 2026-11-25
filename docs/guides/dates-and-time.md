# Dates and time

A roux app knows where its organization is. The organization's **time zone** and **locale** are
configuration, and the **server says what today is**: "today", "this month", every default date and
every "not in the future" check are the organization's, on the server and in the browser alike.
Every date, time and amount the app shows is written in the organization's locale, and a moment in
its zone.

This is for the organization's own users (staff). A viewer's own locale is not supported yet.

## The settings

```bash
ORG_TIME_ZONE=America/New_York   # an IANA zone: where the organization's day starts and ends
ORG_LOCALE=en-US                 # a BCP 47 tag: how dates, numbers and amounts are written
```

They default to `UTC` and `en-US`. An unknown zone stops startup (`the time zone "Mars/Base" is
not an IANA zone`), and so does a locale written any other way than its canonical form (`the
locale "en-us" must be a BCP 47 tag written canonically, such as en-US`). Prefer a place's zone to
a fixed offset: a place's zone knows its daylight saving time, an offset does not.

### What changing a setting does

A redeploy with a new zone or locale is safe: nothing stored is reinterpreted.

| What | After the change |
| --- | --- |
| Stored moments (`timestamptz`, `created_at`) | Unchanged; shown in the new zone. |
| Stored dates a person picked (a birth date, the day a payment was taken) | Unchanged. |
| Today, this month, overdue, the default dates | Move to the new zone's. |
| A date computed from the clock and a zone, then stored | Keeps the old zone's day (which is why you never store one). |
| Tabs already open | Move on their next load. |

## The server

A feature that needs today takes the clock and the organization's zone, and works the day out
from them, never from the server's own zone:

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

and its module passes them, from the kit (the users module sets `k.Organization` before any
other module mounts, wherever it is listed):

```go
Register(k, Service{
	Pool:  k.Pool,
	Clock: now,
	Zone:  func() string { return k.Organization().TimeZone },
})
```

- **A date is a `date` column**, read and written as a `time.Time` at midnight UTC, and answered as
  `"2026-11-24"` (`d.Format(time.DateOnly)`). Arithmetic on it is `d.AddDate(0, 0, n)`; the
  Monday of its week is `d.AddDate(0, 0, -(int(d.Weekday())+6)%7)`.
- **A time of day is a `time` column**, read into a `pgtype.Time` and answered as `"18:30"`. It is
  a wall-clock time in the organization's zone, never converted.
- **A moment is a `timestamptz` column** and a `time.Time`, answered as an ISO string (Go's JSON).
- `k.Organization()` is the whole context below (`TimeZone`, `Locale`, `Today`, `TodayEndsAt`,
  `Currency`, `FractionDigits`), for text the server writes (an amount's `Format(locale)`).
- **A test sets the clock**: `rouxtest.App`'s `Clock` (`a.Clock.Now`, moved with `a.At(moment)`),
  passed as the service's `Clock`. Today is that moment's date in the organization's zone
  (`2026-04-15T03:00:00Z` is still April 14 in New York).

A date that may not be in the future is checked against that same day: the day after `today()`
and later are refused with `problem.MustNotBeInFuture`, so the browser's `notInFuture()` and the
server never disagree.

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

`currency` and `fractionDigits` are `null` without `ORG_CURRENCY`. `GET /api/roux/organization`
(signed in; `organization.Path`) answers the same; it is an `organization.Context`, built by the
users module's `organization.Calendar` from the settings.

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

- `formatDate("2026-03-01")`: a date, on that day whatever the zone (`Mar 1, 2026`);
- `formatTime("16:30:00")`: a time of day (`4:30 PM`);
- `formatDateTime("2026-11-21T03:00:00Z")`: a moment, where the organization is
  (`Nov 20, 2026, 10:00 PM`);
- `formatInstantDate("2026-11-21T03:00:00Z")`: the day a moment falls on, where the organization is
  (`Nov 20, 2026`);
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
fakes the device's clock to move today, and none answers `GET /api/roux/organization`.

On the server, set the test's clock to a moment ([The server](#the-server)). Sessions expire on
that clock too: moving it hours or weeks ahead signs everyone out, and the next request is `401`,
which reads like a permissions bug. Sign the person in again after moving it ([Testing](testing.md)).

## Don't

- Don't take a business date from `new Date()` in the browser, or from `time.Now()` (the server's
  own zone) on the server. Use `today()`, and the service's clock in the organization's zone.
- Never store a date computed from the clock and a zone: store the moment (a `timestamptz`), or the date
  the person picked. A computed date keeps the zone it was computed in.
- Don't pass a locale or a zone to a formatter, or format with `Intl` or `toLocaleString` yourself.
- Don't check "not in the future" against the server's own today: use the organization's
  ([Forms](forms.md#the-rule-helpers)).
