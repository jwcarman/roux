# Permissions and roles

Code checks permissions; roles are data (SQL migrations) that grant them. Adding a feature's
permission is `feature.md` steps 1, 2 and 6; this card covers the rest.

## Rules

- Check a permission, never a role name (`k.Handle(pattern, permission, fn)`, a nav item's
  `permission`, `requirePermission` on a route). No `if role == "OWNER"`: roles are data an owner
  can change.
- Roles and grants are migrations, by role **name** (ids differ between databases). Never create
  roles or grants from startup code (a module's `Start`): a sync breaks a rolling deploy. Never edit
  a migration that has run.
- `frontend/src/permissions.gen.ts` is written by `go test ./cmd/server`; never edit it or keep a
  second list in the frontend.
- Deactivating someone or removing a role in the app's own code calls `authz.EnsureAdmin` in the
  same transaction.

## Names

- `authz.RoleOwner` (`OWNER`). roux's migrations create it and grant it roux's own permissions:
  `theme.manage` (`theme.ThemeManage`), `users.read`, `users.invite`, `users.manage`, `users.owners`
  (`users.UsersRead`...), and `roux.admin` (`authz.Admin`). `app.RouxPermissions()` lists them. The
  app grants `OWNER` its own.
- A feature's permissions: constants in its package (`RanksRead = "ranks.read"`) and
  `var Permissions = []string{...}`. `permissions()` in `cmd/server/modules.go` is
  `append(app.RouxPermissions(), ranks.Permissions...)`, one more `...` per feature.
- The app's roles: `cmd/server/migrations/` (the `app-roles` migration, after `roux-users`). The
  template makes `USER` there. Tables: `roux_role` (`id`, `name`), `roux_role_permission`
  (`role_id`, `permission`), `roux_identity_role` (`identity_id`, `role_id`).
- `cmd/server/permissions_test.go`: `rouxtest.PermissionsFile` (writes `permissions.gen.ts`: a
  constant per permission, `ranks.read` is `RANKS_READ`, and `PERMISSIONS`; fails when the file was
  stale) and `rouxtest.CheckGrants` (fails naming each permission `OWNER` lacks, and each grant
  nobody declared; needs the database).
- `INVITABLE_ROLES` (comma separated, default `USER`; `OWNER` is refused): the roles an invitation
  or a role change may give. `authz.Invitable` (`NewInvitable`, `Contains`, `Names`), served at
  `GET /api/roux/roles/invitable` (`authz.InvitablePath`, by `authz.RegisterInvitable`; the users
  module does it).
- `OWNER_EMAIL`, `OWNER_NAME` (both or neither): while no active identity holds `OWNER`, the users
  module creates one at startup.
- `authn.PrincipalFrom(r.Context())` is the caller: `Has(permission)`, `IdentityID`,
  `Permissions`. For part of a response only some callers see (`lists.md`).
- `authz.FindRole`, `authz.RolesOf`, `authz.Assign`, `authz.Remove`, `authz.EnsureAdmin`,
  `authz.ErrLastAdmin`, `authz.LastAdminProblem()` (409, code `last-admin`, "The team needs someone
  active who can manage people").

## Steps: a new role

1. A new migration in `cmd/server/migrations/` (`002_coach.sql`):

   ```sql
   insert into roux_role (id, name) values (gen_random_uuid(), 'COACH') on conflict (name) do nothing;
   insert into roux_role_permission (role_id, permission)
   select r.id, 'ranks.read' from roux_role r where r.name = 'COACH'
   on conflict do nothing;
   ```

   A feature migration that grants to `COACH` must run after it: `After: []string{"roux-users",
   "app-roles"}` already does, since `app-roles` is every file in that folder.
2. If invitations may give it: add it to `INVITABLE_ROLES` (the deploy's environment, `compose.yaml`
   or the run command).
3. Its label in `frontend/src/users/users.ts` (`ROLE_LABELS`).

Rename a role: a migration `update roux_role set name = 'COACH' where name = 'INSTRUCTOR';`
(holders keep it). Take a permission away: a migration deleting the grant.

## Example: keep the last administrator

```go
err := pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
	if err := authz.Remove(ctx, tx, identityID, role.ID); err != nil {
		return err
	}
	if err := authz.EnsureAdmin(ctx, tx); errors.Is(err, authz.ErrLastAdmin) {
		return authz.LastAdminProblem()
	} else if err != nil {
		return err
	}
	return nil
})
```

Prefer roux's own endpoints (`users.md`) for these changes: they apply this already.

## Check

`go test ./cmd/server` (twice after a permission change: the first run rewrites
`permissions.gen.ts` and fails). With a database, the grants test fails naming each constant
`OWNER` lacks, or each grant nobody declares (a typo in a migration).

## Pitfalls

- A grant to `USER` in a migration that runs before `app-roles`: it finds no role and grants
  nothing, silently. Set `After`.
- A permission constant that is not in `permissions()`: the route works, but the frontend has no
  constant for it and the grants test calls its grant undeclared.
- A role in `INVITABLE_ROLES` that no migration creates: invitations to it are refused.
- roux has no "user joined" hook: make a user's own row when it is first needed (`users.md`).
- Granting `roux.admin` to another role lets the last owner be removed.
