# The business activity log

## Intent

Most business apps need to show "who did what to this, and when": a member renamed, a student
promoted, a payment taken and then removed. The dojo wrote its own (`activity/`: a table, a service,
a repository, a view, a history endpoint and an `ActivityList` component), and nothing in it is
about a dojo. Every app the generator makes would write it again, a little differently each time.

roux gains a **business activity log**: the app says what happened, in its own terms, as a small
typed record; roux stores it once, with who did it and when, and serves a record's history a page at
a time to a list component in the browser.

## Goals

- Adding a kind of activity is one record and one call: no migration, no registration, nothing in
  the browser unless a page wants a custom view.
- The facts of an activity (a rename's old and new names) are kept as structured data whose shape
  the compiler checks where it is written, not a free-form map that drifts.
- A record's history is read by its id, newest first, a page at a time, and shown with one component.
- An activity is written in the same transaction as the change it describes, or not at all.

## Non-goals

- **Change auditing** (every column's before and after, automatically): Hibernate Envers does that;
  an app that needs it adds Envers.
- Descriptions in a viewer's language: a description is written when the activity happens, in the
  organization's locale (round 4).
- Retention, purging, notifications, subscriptions or a feed across all records.
- Customer-facing activity: members (staff) only, like round 4.

## Anti-goals

- A polymorphic table or class hierarchy for storage (a table per kind, a discriminator mapped to
  subclasses). One table, whatever the kind.
- Unstructured metadata (`Map<String, String>`): nothing keeps its keys consistent.
- Turning stored JSON back into the app's records when reading: an old row must still read after its
  record changes or is deleted.
- A foreign key from an activity to the record it is about: the history must outlive the record
  ("Plan removed" is exactly the activity worth keeping).

## Prior art (from the conversation)

Two families exist. Change auditing (Envers, JaVers, PaperTrail, audited, django-simple-history)
records rows' before and after automatically; it knows columns, not meaning. Business activity logs
(spatie/laravel-activitylog, public_activity, django-activity-stream and W3C Activity Streams, and
the hosted audit logs of GitHub, Stripe and WorkOS) record what the app says happened: an actor, a
dotted action code, the target(s), a time, a description and metadata. The mature ones key the
metadata's shape on the action code: CloudEvents' `type` and `data`, event-sourcing frameworks'
typed events serialised to JSON in one stream, WorkOS's schema per action. Free-form properties
(spatie, public_activity) are their most common complaint. roux follows the typed-at-write,
JSON-at-rest shape.

## Approaches (the activity's extra data)

1. **A typed record per kind, stored as JSON (chosen).** The app declares
   `record MemberRenamed(String from, String to) implements BusinessActivity`; roux stores its code,
   its description and its fields as JSON. Typed where written, one table at rest.
2. A free-form map beside the code and description: simplest, but its keys drift.
3. Code and description only: enough for a list, but the facts are lost beyond the sentence.

The user chose 1 ("If we went unstructured, you likely couldn't use the metadata consistently").

## Decided with the user

- Each activity is anchored to a record by its **UUID** (not an entity type): not every anchor is a
  roux entity (a member's history is anchored to who's identity id), the history must outlive the
  record, and the caller should not have to load an entity to write a line.
- It records **who did it**, a **type code** and a **human-readable description**.
- **No polymorphic storage**; the extra data is a typed record serialised to JSON.
- The method that writes one is **not named `record`** (`append`, the builder's name below).

## The server (`roux-activity`, in the starter)

### Writing

```java
/** What happened: a record whose fields are the facts kept, with its code and its sentence. */
public interface BusinessActivity {
  /** The kind's code, dotted and stable once rows exist: "member.renamed". */
  String type();
  /** What happened, in a sentence: "Renamed from Ada to Ada King". */
  String describe();
}

public record MemberRenamed(String from, String to) implements BusinessActivity {
  public String type() { return "member.renamed"; }
  public String describe() { return "Renamed from " + from + " to " + to; }
}

@Transactional
public MemberDetail rename(UUID memberId, String name) {
  ...
  activityLog.append(memberId, new MemberRenamed(old, name));
}
```

- `ActivityLog.append(UUID anchor, BusinessActivity activity, UUID... related)` writes one row:
  a new id (UUIDv7), the time from the app's `Clock`, the actor (the signed-in who identity, or
  none for the system), the anchor, the related ids, `type()`, `describe()`, and the record as JSON
  through the app's Jackson mapper (so a `Money` or a `LocalDate` field is written as the API writes
  it).
- It needs a running transaction (`Propagation.MANDATORY`): outside one it throws, so an activity
  never outlives a rolled-back change.
- It refuses, with `IllegalArgumentException` naming the problem: an activity that is not a Java
  record; a `type()` that is not a lower-case dotted code (`member.renamed`, at most 100 characters);
  a blank `describe()` or one over 500 characters.
- **Related ids** are the other records an activity concerns: a promotion is anchored to the
  student and related to the rank, so the rank's side can find it too.

### Reading

- `ActivityLog.history(UUID id, PageParams page)`: `PageDto<Activity>`, newest first (then by id),
  every activity anchored to `id` or related to it. The page size follows roux's paging defaults; a
  sort in the params is ignored.
- The app writes the endpoint, with its own permission, as it does for any child list:

  ```java
  @GetMapping("/{id}/activities")
  @RequiresPermission(Permissions.MEMBERS_READ)
  public PageDto<Activity> history(@PathVariable UUID id, @ModelAttribute PageParams page) {
    return activityLog.history(id, page);
  }
  ```

- `Activity` (the wire shape): `{ id, occurredAt, type, description, actorId, actorName, details }`,
  `details` the stored JSON object as it was written.
- **Actor names** come from an `ActorNames` bean the app may declare (identity id to display name,
  for a page of ids at once). Without one, or for an id it does not know, the name is `"Unknown"`;
  a system action (no actor) is `"System"`.

### Storage

- roux-activity's own changelog (run by migratory, as roux-theme's is): one table, `roux_activity`:
  `id uuid` (primary key), `occurred_at timestamptz`, `actor_id uuid` (null for the system),
  `anchor_id uuid`, `related_ids uuid[]` (empty when none), `type varchar(100)`,
  `description varchar(500)`, `details jsonb`. Indexes: `(anchor_id, occurred_at desc, id desc)`
  and a GIN index on `related_ids`. No foreign keys. Rows are never updated.

## The browser (`@jwcarman/roux-web/activity`)

- `Activity` (the wire type) and `ActivityList` (moved from the dojo): the query a page gives it
  (a resource module's `pageQuery`), each entry's description, who and when ("3 days ago", with the
  moment in the organization's zone as its title), "Show more" for the next page, and an empty text.
- The relative time ("3 days ago", "yesterday") moves into `@jwcarman/roux-web/dates` as
  `formatRelativeTime(iso)`, in the organization's locale.
- A page that wants a richer view of one kind reads `details` (typed by the app as it likes).

## The dojo

- Its `activity/` package, `ActivityList.tsx` and `relativeTime.ts` go; it uses roux's.
- Each activity it writes becomes a record (`MemberInvited`, `MemberRenamed`, `MemberDeactivated`,
  `MemberReactivated`, `MembershipStarted`, `PaymentRecorded`, `PaymentRemoved`, ...), with the facts
  it has (a payment's amount and periods, a rename's names).
- Its `ActorNames` reads member profiles (what its repository's join does today); `Recorders` uses it.
- Its existing rows move into `roux_activity` with a changeset (`subject_id` to `anchor_id`, `action`
  to `type`, `summary` to `description`, `details` `{}`), and its `activity` table is dropped.
- The student page gains a History section (promotions, memberships and payments), so related ids are
  exercised: a promotion shows in the student's history.

## Docs

- A guide, `docs/guides/activity-log.md` (with its plugin copy and a row in the skill's task table):
  declare a kind, append it, write the history endpoint, show it with `ActivityList`, `ActorNames`;
  and a Don't list: never rename a `type()` once rows exist (add a new one); never put what must not
  be kept forever in a record's fields (a password, a token); don't append outside the transaction
  that makes the change; don't use it for column-level auditing (Envers).
- CHANGELOG (Added), getting-started's module list.

## Constraints

- roux's standing rules: Problem Details for refusals, time from the injected `Clock`, no warning
  suppression, no star imports, 100% line and branch coverage per roux module, Stryker (incremental)
  on roux-web, every public name in a guide.
- Liquibase changesets only, never edited once run; roux's table through migratory.

## My calls (for the user to check)

- `append` for the verb; `BusinessActivity` for the interface; `Activity` for the read side.
- `type()` and `describe()` as methods, not an annotation: the compiler checks them.
- Related ids beside the one anchor, and `history(id)` returns both kinds.
- `ActorNames` as the way to name actors, "Unknown" and "System" otherwise.
- Details written with the app's Jackson mapper; read back as raw JSON, never as the app's records.
- The dojo's existing history is migrated, not dropped.

## Left to the builder

- Whether roux-activity stores through JPA or `JdbcClient`.
- The exact `ActivityList` props beyond those it has in the dojo.
- The names of the dojo's activity records and which facts each keeps.
