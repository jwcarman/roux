# The activity log

A record's history: who did what to it, and when. The app says what happened as a typed record, in
the transaction that makes the change; roux stores it with the actor and time and serves it a page
at a time. For column-by-column auditing use Hibernate Envers instead.

## Rules

- Append in the transaction that makes the change, after anything that can still fail.
- Never rename a `type()` once rows exist; a new meaning is a new type.
- Never put secrets (passwords, tokens, card numbers) in a record's components: rows are kept forever.
- Never turn `details` back into the app's records: old rows have old shapes.

## Names

- `BusinessActivity`: a Java record with `type()` (lower-case, dotted, ≤ 100 chars, `"plan.renamed"`)
  and `describe()` (a sentence ≤ 500 chars). Components are stored as JSON; locale-dependent text is
  formatted by the service and passed in as a component.
- `ActivityLog.append(anchor, activity, related...)`: anchor = the record's `UUID` (no foreign key,
  so history outlives the record); related ids put it in their histories too. Needs a transaction
  (else `IllegalTransactionStateException`).
- `ActivityLog.history(id, params)` → `PageDto<Activity>`, newest first, anchored or related.
- `Activity` `{ id, occurredAt, type, description, actorId, actorName, details }`;
  `Activity.UNKNOWN`, `Activity.SYSTEM`.
- `ActorNames` (`namesOf(Set<UUID>)` → `Map<UUID, String>`): declare one to replace roux-users'
  `AppUserActorNames`.
- Table `roux_activity` (`ActivityEntry`, `ActivityRepository`), from roux's own changelog; emptied
  by `users.reset()`. `BusinessActivityAotProcessor` registers native hints for every kind.
- Browser, `@jwcarman/roux-web/activity`: `Activity`, `historyQuery(key, url)`, `ActivityList`
  (`ActivityListProps`: `aria-label`, `query`, `emptyText?`, `now?`). `formatRelativeTime(iso, now?)`
  is in `/dates`.

## Steps

1. A kind:

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
2. Append it in the service:

   ```java
   plan.rename(name);
   activityLog.append(planId, new PlanRenamed(before, plan.getName()));
   ```
3. The endpoint, with the record's own read permission:

   ```java
   @GetMapping("/{id}/activities")
   @RequiresPermission(Permissions.PLANS_READ)
   public PageDto<Activity> activities(@PathVariable UUID id, @ModelAttribute PageParams params) {
     return plans.activities(id, params); // 404 for an unknown plan, then activityLog.history(id, params)
   }
   ```
4. Query key under the record: `activities: (id: string) => [...queryKeys.plans.detail(id), "activities"] as const`.
5. Module: `export const planHistory = (id: string) => historyQuery(queryKeys.plans.activities(id), path\`plans/${id}/activities\`);`
6. Page: `<ActivityList aria-label="History" query={planHistory(plan.id)} />`.

## Check

Controller test: after the change, `GET /api/plans/{id}/activities` has the entry's `type` and
`description`; an unknown id is 404. Vitest: answer with `pageOf([...])`; pass `now` for stable
"3 days ago" text.

## Pitfalls

- A history showing something only some may see (an amount) needs that permission on its endpoint.
- `append` with a non-record, a malformed type, a blank description or a `null` related id throws
  `IllegalArgumentException`.
