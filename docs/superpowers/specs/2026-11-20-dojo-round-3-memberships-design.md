# Dojo round 3: memberships and payments

## Intent

The dojo is built round by round to push shapes through roux before the app creator freezes them
(see `2026-11-17-dojo-example-design.md`). Rounds 1 and 2 covered lists, detail pages, child lists,
ordering, a timetable and check-in. Round 3 adds what most business apps need and nothing in roux
handles yet: **money**, a record with a **lifecycle** (a membership that is paid up or overdue) and
**summary figures** (money taken per month).

Money goes into roux itself, not only the dojo: every app the creator makes will copy whatever the
dojo does, so roux decides money once.

## Goals

- The owner keeps plans with prices; staff put a student on a plan and record the payments they take.
- Each student's "paid through" date and overdue state follow from their payments.
- The owner sees money taken per month.
- roux gains money: a Java value, its wire shape, validation, a form field, and display.

## Non-goals

- Taking payments (card processing, a payment provider). The school takes money at the desk on its
  own terminal; the app records it.
- Partial payments, balances, discounts, taxes, refunds as such, invoices, receipts.
- More than one currency in a school, and currency conversion.
- Ending a membership other than by changing plan (a later round if needed).

## Anti-goals

- Floating-point money anywhere: in Java, on the wire or in the browser.
- A stored "paid through" or stored totals that can drift from the payments.
- Money helpers written in the dojo that every app would need (they belong in roux).

## Approaches (money)

1. **In roux from the start (chosen).** A small `Money` value on the server, one wire shape, a
   `money()` form rule, a money field and `formatMoney` in roux-web; the dojo is the first user.
   Every later app gets it; it is designed from one app's needs, so taxes, several currencies and
   division rounding wait for an app that needs them.
2. In the dojo first (a `long` of cents, a number on the wire), extracted later: the usual round
   rhythm, but money is plainly general, so it would be built twice.
3. A curated library (JSR 354 / Moneta) through the BOM: well tested on the server, heavy for this,
   nothing for the browser, and its JSON shape would still be ours to decide.

The user chose 1.

## The domain (decided with the user)

### Plans

- The owner keeps plans: a name (required, up to 60 characters, unique in the school, compared
  ignoring case), a price (more than 0), a period (Monthly or Yearly) and Active (yes/no).
- A Plans page lists them (a short list, not paged), with add and edit dialogs.
- A plan no membership has ever used can be removed (asks first). One that has been used cannot:
  the owner sets it inactive instead. An inactive plan is not offered for new memberships; existing
  memberships on it continue, and payments on them still use its price.
- Changing a plan's price affects payments recorded afterwards only.
- A plan's period cannot change once a membership has used it (a 400 on `period`, "A plan in use
  keeps its period"), since paid through is computed from it. Its name, price and Active can. An
  inactive plan can be made active again.

### Memberships

- On a student's page, staff start a membership: a plan (active plans only) and a start date.
  The start date defaults to today, or, when the student has a current membership paid through
  today or later, to the day after its paid-through date: **a change of plan takes effect when the
  paid time runs out** (decided by the user). Staff may choose an earlier date; the dialog then
  warns, before saving, "<first name> is paid through <date>; starting earlier gives up the paid
  time after that." Nothing is carried over or converted between plans.
- A student has at most one current membership. Starting a new one ends the current one the day
  before the new start date (which may not be on or before the current one's start: a 400 on
  `startDate`, "Must be after the current membership's start (<date>)"). Ended memberships are
  kept and listed on the student's page, newest first, like rank history. Since a membership ends
  only when another starts, a student who has ever had one always has a current one.
- A membership whose start date is in the future is still the current one (its paid through is
  the day before it starts); the student is not overdue until that date passes, since paid
  through is then before today only from the start onward. Payments may be recorded against it.
- **Paid through** = the start date, plus the number of periods paid on that membership in months
  (Monthly) or years (Yearly), minus one day. With nothing paid it is the day before the start, so a
  new member owes from their first day. Example: a monthly membership starting Mar 15 with one
  period paid is paid through Apr 14; with three, through Jun 14. Month arithmetic is PostgreSQL's
  and Java's `plusMonths` (Jan 31 + 1 month = Feb 28), and the two must agree.
- A student is **Overdue** when they are Active, have a current membership, and its paid-through
  date is before today (from the injected `Clock`). Inactive students are never overdue;
  deactivating a student does not end their membership.

### Payments

- Recorded on the student's page, against the current membership: periods (a whole number, 1 to
  12, default 1), the date taken (default today, not in the future), a method (Cash, Card, Cheque,
  Other) and an optional note (up to 200 characters).
- The amount is the plan's price times the periods, computed by the server and stored with the
  payment (so a later price change does not rewrite history). The dialog shows it before saving.
- Each payment moves paid through forward by its periods.
- A mistaken payment can be removed (asks first); paid through moves back. Any payment can be
  removed, not only the latest: paid through is a count of periods, not a chain of dates.
- Payments on an ended membership stay listed with it, and can still be removed, but none can be
  added to it.

### Overdue and totals

- The Students list gets a **Payment** filter (Paid, Overdue, No membership) and a **Paid through**
  column, sortable. ("Paid" means a current membership that is not overdue.)
- A **Payments** page: money taken per month for the last 12 months including this one (a table:
  month and total, with months with no payments shown as zero), and this month's payments as a
  paged list, newest first: date, student (a link), plan, periods, amount, method, who recorded it
  (the member's display name from their profile; "Unknown" if there is none).
- Each membership started, payment recorded and payment removed is a history entry on the student
  (`ActivityLog`).

### Permissions

- `plans.manage` (Owner): the Plans page.
- `payments.record` (Owner, Instructor): the membership and payments section on a student's page,
  starting a membership, recording and removing payments, reading active plans for the picker, and
  the Students list's Payment filter and Paid through column.
- `payments.read` (Owner): the Payments page.
- Members see none of it. The Students list endpoint refuses (403) the Payment filter and the
  Paid through sort without `payments.record`, and leaves the plan, paid-through and payment status
  fields null in its rows for such a caller; the page hides the filter and column. New permissions follow `docs/guides/roles.md`: constants in
  `identity/Permissions`, a new changeset in `roles.xml`, `permissions.gen.ts` regenerated.

### Today and time zones (my call)

- "Today" for overdue, "this month" and the 12 monthly buckets is the server's: the date of the
  injected `Clock` in its zone (UTC in the dojo, as for every other date it has). Dates a person
  picks (start, taken on) default to the browser's today and are checked with `@NotInFuture` /
  `notInFuture()` as elsewhere. Near midnight UTC a school in the Americas sees tomorrow's date for
  overdue; the round logs this as a finding (roux has no school time zone) rather than solving it.

## Money in roux

### The value and its wire shape

- `Money(long minorUnits, Currency currency)`: the amount in the currency's minor units (cents for
  USD, none for JPY, from `Currency.getDefaultFractionDigits()`). Arithmetic the dojo needs:
  `times(int)`, `plus(Money)` (same currency, else `IllegalArgumentException`), `isPositive()`.
- JSON: `{ "minorUnits": 15000, "currency": "USD" }` both ways. The browser never does arithmetic
  on decimals; it formats with `Intl.NumberFormat` from the minor units and the currency's digits.
- Stored as two columns, `<name>_minor_units bigint` and `<name>_currency char(3)`, as an embedded
  value on an entity (the builder picks the mapping: an `@Embeddable` record or an attribute
  converter pair).
- Digits come from the currency (`Currency.getDefaultFractionDigits()` on the server); the browser
  derives the same from `Intl.NumberFormat(..., { style: "currency", currency }).resolvedOptions()`
  and, to be safe, `GET /api/money` also returns them: `{ "currency": "USD", "fractionDigits": 2 }`.
- `roux.money.currency` (an ISO 4217 code, required once money is used; the dojo sets `USD`): the
  school's one currency. roux serves it at `GET /api/money` (`{ "currency": "USD" }`) so a form can
  make a new amount.

### Validation

- A constraint for a request's money field, checking it is in `roux.money.currency` ("Must be in
  USD") and, where asked, more than zero ("Must be more than 0") or at least zero. Messages in roux's
  words, like `@Phone` and `@NotInFuture`, with field errors on the field.

### roux-web (`@jwcarman/roux-web/money`, or within `/form` and a display entry: the builder's call)

- `Money` type; `formatMoney(money)` in the browser's locale; a `currencyQuery` (or hook) over
  `GET /api/money`.
- A `money()` rule for `useSchemaForm` schemas: the user types `150`, `150.5` or `150.50` (no
  currency symbol required, a leading one tolerated, thousands separators tolerated); it becomes
  `Money` in the server's currency; too many decimals, a negative or text is a field error in the
  server's words. A shared fixture under `contracts/` (like `contracts/phone.json`) lists inputs
  and their results, and a contract test on each side keeps the browser's parsing and the server's
  rules identical.
- A money input field (`f.MoneyField`), showing the currency's symbol beside the input.
- Money in tables formats the same way (a column helper or `formatMoney` in a cell: the builder's
  call), right-aligned.

### Docs

- A `docs/guides/money.md` guide (with its copy under the plugin's `references/`, and the skill's
  task table), the getting-started setting, and CHANGELOG entries. The guide checker requires every
  new public name to appear in a guide.

## Data (dojo)

- `plan`: id, name, price (money columns), period, active, version, auditing columns.
- `membership`: id, student, plan, start date, end date (null while current), version.
- `payment`: id, membership, periods, amount (money columns), taken on, method, note, recorded by
  (identity), auditing columns.
- `student_list` (the read-model view) gains the current membership's plan name, paid-through date
  and whether there is a current membership, so the list filters and sorts on them. The overdue
  filter compares paid through with today passed as a parameter (the view cannot know today).
- Monthly totals: one grouped query over `payment.taken_on`. Nothing about money is stored except
  each payment's amount.

## Constraints

- roux's standing rules: Problem Details for every refusal (`NotFoundException`,
  `InvariantViolationException`, `InvalidFieldException`), versions on edited records (409 when
  stale), time from the injected `Clock`, `meta.refreshes` on mutations, icons from
  `react-icons/lu`, no warning suppression, no star imports, 100% line and branch coverage per roux
  module.
- The dojo's round rules: friction goes in `examples/dojo/FINDINGS.md`; small general fixes go into
  roux in the same round; the dojo's tests follow its style (`@AppTest`, Vitest with MSW, and the
  Playwright end-to-end test extended by one path: record a payment and see paid through move).
- Liquibase changesets only; never edit one that has run.

## Also in this round

- Mark the two roles findings in `FINDINGS.md` fixed by the roles work ("A new role is written in
  six files, eight lists", "Every app keeps a copy of its permission list").
- Not a deliverable of this round's plan: the plugin benchmark the dojo design describes, run
  after the round only with the user's go-ahead (it costs agent runs).

## Left to the builder

- The Java mapping of `Money` (embeddable or converters) and the module it lives in (a new
  `roux-money` in the starter, or an existing module).
- How roux-web exposes money (its own entry point or within existing ones).
- Screen layout within the existing pages' patterns, labels and empty states.
- Where the Plans and Payments pages sit in the navigation (`defineNav`), and their descriptions.
