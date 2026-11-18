# Roles and permissions

**Status:** designed with the user 2026-11-18; who's part proposed to who-28, roux's waits on it.

## Why

Every app needs roles. The dojo hand-writes them in six files and eight lists: permission constants,
a role enum, a startup sync, a ~150-line owner bootstrap (advisory lock, speculative transaction),
the last-owner guard, invitable roles, and the permission list copied into `permissions.json` and
`api.ts` with drift tests. A new app would copy all of it.

## Decisions

- **Permissions are plain constants**, a utility class per module (`WhoAdminPermissions`,
  `RouxThemePermissions`, the app's `Permissions`). Nothing registers them. `@RequiresPermission`
  is single-valued and not repeatable: one permission per method; a role holds many. Custom
  permission annotations stay an app's choice for readability; roles never use them (they add API
  and buy only what the startup check already catches).
- **Roles are declared in code** (who's part, below): an enum implementing `DeclaredRole`, given
  to a `WhoRoles` bean, with `.renamed(old, new)` and `.retired(old, moveHoldersTo)` for migrations.
- **Two modes, chosen by whether `WhoRoles` beans exist.** Declared: code owns every role; the
  database must match; role-changing APIs and endpoints are off; assigning roles to people stays.
  Managed (no beans): who's runtime role management, as today. Switching is adding or removing the
  beans; no data changes on the way to managed, and the strict check runs on the way back.
- **Losing access is never silent.** A role in the database that is not declared, renamed or
  retired fails startup (origin does not matter: no "declared" marker). A grant a declaration no
  longer lists is removed and logged.

## who's part (proposed 2026-11-18)

`WhoRoles` / `DeclaredRole`; a startup sync after Liquibase under a lock (create, add, remove,
rename with merge, retire); strict startup failures (undeclared role, a grant no
`@RequiresPermission` method uses, bad rename/retire targets); declared mode turning off
`RbacService`'s role-changing methods and who-admin's role-writing endpoints; the permission set
(every `@RequiresPermission` value) exposed as a bean.

## roux's part (after who ships it)

- **Owner is a roux opinion** (who has none): every roux app has an `OWNER` role holding every
  permission in who's set, including ones a later module adds; the first owner is created from
  `roux.owner.email` / `roux.owner.name` on first start; the last active owner cannot be removed.
- **Invitable roles:** which declared roles an invitation may give, enforced on the server.
- **Generated frontend types:** the permission set and role names served by roux, so `defineNav`
  and the invite form are typed from the server, and no app keeps a copy.
- `theme.manage` moves to `RouxThemePermissions`.
- The dojo moves onto all of it; the new-app template is cut after.
