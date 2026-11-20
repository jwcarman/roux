# Roles and permissions

**Status:** redesigned 2026-11-20, after who declined declared roles; the last-owner guard reuses
who-admin's `LastAdminGuard` (2026-11-20); waits on the user's approval.
The 2026-11-18 version (roles declared in code, synced at startup) is withdrawn: see "Why not a
startup sync".

## Why

Every app needs roles. The dojo hand-writes them: permission constants and a role enum
(`AppRoles`), a 119-line `OwnerBootstrap` (advisory lock, speculative transaction) that also syncs
every role's grants at each start, the last-owner check in `MemberService`, `InvitableRole` and
`InvitableRolesGuard`, and the permission list copied into `permissions.json` and `api.ts` with a
drift test on each side. A new app would copy all of it, and an agent would get some of it wrong.

## Decisions (with the user, 2026-11-18 to 11-20)

- **Permissions are plain constants**, a utility class per module (`WhoAdminPermissions` in who,
  `RouxThemePermissions`, the app's `Permissions`). `@RequiresPermission` takes one; a role holds
  many. Nothing registers them.
- **Roles and grants are data, changed by Liquibase changesets**, like any schema. No startup
  sync: it breaks rolling deploys (an old instance that restarts fails on, or undoes, what the new
  version added), and ordering changes needs a history, which Liquibase already has.
- **Libraries' changesets run through migratory**, before the app's changelog, each declared in
  its jar's `META-INF/migratory.properties`. roux grants its own permissions in its own changesets;
  a roux upgrade brings them with no edit in the app.
- **Owner is a roux opinion** (who has none): every roux app has an `OWNER` role holding every
  permission there is.
- **Completeness is checked in the build, not at startup.** A test the app keeps fails when OWNER
  lacks a permission constant or a grant names no constant. Startup checks would break rolling
  deploys the same way the sync did.

## What roux ships

### `roux-roles`, a new module in the starter

- **Its changelog** (`classpath:org/jwcarman/roux/roles/db/roux-roles-changelog.xml`, declared
  `name=roux-roles`, `after=who-rbac`) creates `OWNER` and grants it `WhoAdminPermissions` (who
  grants nothing itself; the starter brings who-admin, so roux does). It refers to roles by name,
  never by id, and inserts only what is missing (`ON CONFLICT DO NOTHING`), so a database whose
  OWNER the dojo's bootstrap made long ago gains nothing twice.
- **Other roux modules grant their own permissions to OWNER** in their own changelogs, declared
  `after=roux-roles`: roux-theme grants `theme.manage`. A module the app leaves out grants nothing,
  and its permission is then no constant the app's test expects.
- **`Permissions.allOf(Class<?>... types)`**: every `public static final String` field of the
  classes given, in declaration order, without duplicates; private constants are helpers and
  ignored. It throws when a class yields none (a missing native-image hint must not empty a check).
- **The first owner.** On start, while no identity holds OWNER, roux creates one from
  `roux.owner.email` and `roux.owner.name` (both required; startup fails with the setting's name).
  It keeps what the dojo learned: an advisory lock for concurrent first starts, and who deciding
  whether the address is free. Once an owner exists, the settings change nothing. The app adds its
  own data for the new owner (the dojo's member profile) by listening for roux's `OwnerCreated`
  event, published in the owner's transaction.
- **Someone can always manage people.** roux reuses who-admin's `LastAdminGuard` rather than
  writing its own. The guard refuses (`LastAdminException`) a role removal or deactivation that
  would leave no active identity holding `who.identities.manage`; it locks the `who_role` rows
  granting that permission, so two concurrent demotions cannot both pass. who-admin's endpoints
  already go through it. So:
  - the starter brings who-admin (every roux app manages people, and gets who's admin endpoints);
  - roux-roles' changelog grants `WhoAdminPermissions` to OWNER, and no other roux role holds
    `who.identities.manage`, so "the last one who can manage people" is the last owner;
  - the app's own service wraps its role removals and deactivations in
    `lastAdminGuard.removeRole(...)` / `deactivate(...)` (who's docs say direct `RbacService` or
    `WhoService.deactivate` calls are not guarded); the guide shows it;
  - roux maps `LastAdminException` to a 409 problem.

  The invariant is "someone can still manage people", not "an identity named OWNER": an app that
  also grants `who.identities.manage` to an ADMIN role may remove the last owner while an admin
  remains. That is the invariant that matters (keeping control of the app), and it needs nothing
  new from who.
- **Recovery.** The bootstrap counts only *active* owners: if none is active (someone changed the
  database by hand), the next start creates one from `roux.owner.email`, or, when who reports that
  address taken, fails naming the setting.
- **Invitable roles.** `roux.roles.invitable` (a list; default empty) names the roles an
  invitation may give. OWNER can never be listed (startup fails). roux's listener refuses any
  invitation outside the list, inside the invitation's transaction, whatever endpoint sent it.

### For the app (the dojo now, the new-app template later)

- **`Permissions`**: the app's constants. **Its roles** in its own changelog, written like roux's:
  create the role, grant by name. Adding a permission means a constant and a changeset granting
  it.
- **The test** (roux ships the assertion, the app one test): runs every migration on PostgreSQL,
  then asserts OWNER holds exactly `allOf(Permissions.class, RouxThemePermissions.class, …)` and
  every role's grants are among those constants. A forgotten grant or a typo fails CI and names the
  permission.
- **The frontend's list, generated.** The same test writes `frontend/src/permissions.gen.ts` from
  the constants (a union type and the array `defineNav` takes) and fails when the committed file is
  stale, so the file is never hand-written and never drifts. This replaces `permissions.json` and
  both drift tests. Role names for the invite form come from the server at run time, since roles
  are data.

## The dojo after

`AppRoles` becomes `Permissions` (constants only); its roles move to `db/changelog/roles.xml`;
`OwnerBootstrap`, `InvitableRole` and `InvitableRolesGuard` go; `MemberService`'s owner count
gives way to `LastAdminGuard`;
`app.owner-*` becomes `roux.owner.*`; a listener for `OwnerCreated` makes the profile. An existing
dojo database upgrades with nothing run twice, proved the way the migratory move was (migrate with
main, start the branch).

## Not in this

- A role editor in the app. Roles change by changeset; who-admin still assigns them to people.
- Rename and merge helpers: they are ordinary changesets (`UPDATE who_role SET name`), shown in the
  guide.
- The new-app template and the upgrade story: designed next, together, on top of this.

## Proving it

- roux-roles: `allOf` (public, private, duplicates, a class with none); the bootstrap (first
  start, concurrent starts, owner exists, only a deactivated owner exists, address held by
  another, settings missing); the dojo's service refusing to demote or deactivate the last owner
  (409), and allowing it while a second owner is active; invitable roles (listed, unlisted, OWNER listed); the changelog
  against a database whose OWNER already exists.
- Contract tests: OWNER holds who's and roux-theme's permissions after migratory runs.
- The dojo: its suite and end-to-end test unchanged in behaviour; the completeness test; the
  upgrade check.

## Left to the builder

Package names inside roux-roles, the event's exact name and fields, the assertion's API shape,
and the generated file's exact contents.

## Why not a startup sync (withdrawn 2026-11-18 design)

Roles declared in code (`WhoRoles`, `DeclaredRole`) and synced at startup, failing on an
undeclared role. who declined it: an old instance restarting during a rolling deploy sees a role
the new version added and fails, and a sync that removes grants makes old and new instances undo
each other.
