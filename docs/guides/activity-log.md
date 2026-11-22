# The activity log

A record's history: who did what to it, and when. A user renamed, a student promoted, a payment
taken and then removed. The app says what happened, in its own terms, as a small typed record, in the
transaction that makes the change; roux stores it with who did it and when, and serves a record's
history a page at a time to `ActivityList` in the browser.

This is a **business** activity log: the app decides what is worth saying. It is not change auditing
(every column's before and after, written automatically): for that, add Hibernate Envers.

`roux-activity-log` is in the starter. Its table, `roux_activity`, comes from its own changelog, run by
migratory before the app's ([Getting started](getting-started.md#required-settings)); the app writes no
migration for it.

## Declare a kind

Each kind of activity is a Java record that implements `BusinessActivity`. Its components are the
facts kept; `type()` is its code and `describe()` its sentence:

```java
public record PlanRenamed(String from, String to) implements BusinessActivity {

  @Override
  public String type() {
    return "plan.renamed";
  }

  @Override
  public String describe() {
    return "Renamed from " + from + " to " + to;
  }
}
```

- `type()` is lower case and dotted (`plan.renamed`, `payment.recorded`), at most 100 characters.
- `describe()` is a sentence of at most 500 characters, written once, when the activity happens.
- The components are stored as JSON with the app's own Jackson mapper, so a `Money`, a `LocalDate` or
  an id is written as the API writes it, and `null` as `null`. A record with no components is fine
  (`record UserDeactivated() implements BusinessActivity`).
- `describe()` cannot read the request or the organization: what it needs is a component. Text that
  depends on the locale (an amount as the school writes it) is formatted by the service and passed in:

  ```java
  record PaymentRecorded(UUID paymentId, int periods, Money amount, String each, LocalDate takenOn)
      implements BusinessActivity {
    public String type() { return "payment.recorded"; }
    public String describe() { return "Payment recorded: " + periods + " × " + each; }
  }
  ```

## Append it

Inject `ActivityLog` and call `append` in the transaction that makes the change:

```java
@Transactional
public PlanView rename(UUID planId, String name) {
  Plan plan = find(planId);
  String before = plan.getName();
  plan.rename(name);
  activityLog.append(planId, new PlanRenamed(before, plan.getName()));
  return PlanView.of(plans.saveAndFlush(plan));
}
```

`append(anchor, activity, related...)` writes one row: a new id, the time from the app's `Clock`, the
actor (the signed-in who identity; none for the system), the anchor, the related ids, the type, the
description and the details.

- **The anchor** is the id of the record the activity is about. It is a bare `UUID`, not an entity:
  anything with an id has a history (a user's is anchored to who's identity id), and there is no
  foreign key, so the history outlives the record ("Plan removed" stays).
- **Related ids** are other records the activity concerns. A promotion is anchored to the student and
  related to the rank, so the rank's history has it too:

  ```java
  activityLog.append(studentId, new StudentPromoted(rank.getId(), rank.getName(), on), rank.getId());
  ```

  The anchor among the related ids, and a repeated id, are dropped.
- **It needs a transaction** (`Propagation.MANDATORY`): outside one it throws
  `IllegalTransactionStateException`. An activity rolls back with its change.
- **It refuses** with `IllegalArgumentException`, naming the problem: an activity that is not a record,
  a malformed type, a blank or too-long description, a `null` related id.

## The history endpoint

The app writes the endpoint, with its own permission, as for any child list.
`history(id, page)` returns every activity anchored to `id` or related to it, newest first (then by id,
so two at the same instant always come in the same order), as a `PageDto<Activity>`. The page's index
and size are clamped as roux's other lists are; a sort is ignored.

```java
@GetMapping("/{id}/activities")
@RequiresPermission(Permissions.STUDENTS_READ)
public PageDto<Activity> activities(@PathVariable UUID id, @ModelAttribute PageParams params) {
  return students.activities(id, params); // 404 for an unknown student, then activityLog.history(id, params)
}
```

`Activity` is `{ id, occurredAt, type, description, actorId, actorName, details }`. `details` is the
JSON object the record was written as, never turned back into the record, so an old row still reads
after its record changes or is deleted. A history that holds something only some people may see
(a payment's amount) gets that permission: the dojo's student history needs `payments.record`.

## Who did it: `ActorNames`

The actor is a who identity id. roux-users names actors after their `AppUser` (`AppUserActorNames`,
one query per page), so a history reads "Ada Lovelace". To name them some other way, declare an
`ActorNames` bean; it replaces roux's, and names a page's actors at once:

```java
@Component
public class StaffActorNames implements ActorNames {
  private final StaffRepository staff;

  public StaffActorNames(StaffRepository staff) {
    this.staff = staff;
  }

  @Override
  public Map<UUID, String> namesOf(Set<UUID> identityIds) {
    return staff.findAllById(identityIds).stream()
        .collect(Collectors.toMap(Staff::getId, Staff::getBadgeName));
  }
}
```

roux-users' own kinds, anchored to the user: `UserInvited`, `UserRenamed`, `UserDeactivated`,
`UserReactivated` and `UserRoleChanged` ([Users](users.md)).

An actor it does not name (or every actor, without the bean) is `Activity.UNKNOWN` ("Unknown"); an
activity with no actor is `Activity.SYSTEM` ("System").

## The browser: `ActivityList`

`@jwcarman/roux-web/activity` has the wire type, `Activity`, `historyQuery` and `ActivityList`.
`historyQuery(key, url)` is the page query for the app's history endpoint, which `ActivityList` takes.
`ActivityList` shows each entry's
description, who did it and when ("3 days ago", with the moment in the organization's zone as its
title), "Show more" for the next page, and a line when there is nothing yet.

```ts
// students.ts, the resource module
export const studentHistory = (id: string) =>
  historyQuery(queryKeys.students.activities(id), path`students/${id}/activities`);
```

```tsx
<ActivityList aria-label="History" query={studentHistory(student.id)} />
```

`ActivityListProps`: `aria-label`, `query`, `emptyText` ("Nothing has happened yet." unless given) and
`now` (what "3 days ago" counts from; for a test). Put the history's key under the record's detail key
(`[...detail(id), "activities"]`) so a mutation that refreshes the record refreshes its history; one that
refreshes only part of it adds the history's key. A page that shows one kind its own way reads
`details`, typed as it likes.

`formatRelativeTime(iso, now?)` (`@jwcarman/roux-web/dates`) is the "3 days ago" on its own, in the
organization's language: "now" under a minute (or a little ahead of this device), then minutes, hours,
days ("yesterday"), months and years.

## The table

`roux_activity` (`ActivityEntry`, read through `ActivityRepository`): `id`, `version`, `occurred_at`,
`actor_id` (null for the system), `anchor_id`, `related_ids` (`uuid[]`), `type`, `description`,
`details` (`jsonb`). Indexed by anchor and time, and by related id. Rows are never updated. A test that
starts from an empty history resets it with the app's other tables (`users.reset("roux_activity")`).

## Native images

The details records are read and written as JSON, so a native image needs reflection hints for them.
`BusinessActivityAotProcessor` registers them at build time for every `BusinessActivity` record in
roux's packages and the app's own (it scans `org.jwcarman.roux` and the application's package), so an
app's kinds need nothing extra.

## Don't

- Never rename a `type()` once rows exist: stored rows keep the old code. A new meaning is a new type.
- Never put what must not be kept forever in a record's components (a password, a token, a card
  number): every component is stored, and rows are never updated.
- Don't append outside the transaction that makes the change, or before the change can still fail on
  something the activity does not know.
- Don't use it for column-by-column change tracking: that is Hibernate Envers.
- Don't turn `details` back into the app's records: old rows have old shapes.
