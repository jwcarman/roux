# Permissions and roles

Code checks permissions; roles are data (Liquibase) that grant them. Adding a feature's permission
is `feature.md` step 5; this card covers the rest.

## Rules

- Check a permission, never a role name (`@RequiresPermission`, a nav item's `permission`,
  `requirePermission` on a route). No `hasRole`, no `role.equals("OWNER")`.
- Roles and grants are changesets, by role **name** (ids differ between databases). Never create
  roles or grants from startup code; never edit a changeset that has run.
- `frontend/src/permissions.gen.ts` is written by `PermissionsListTest`; never edit it or keep a
  second list in the frontend.
- Deactivating someone or removing a role goes through `LastAdminGuard`.

## Names

- `RouxRoles.OWNER`. roux grants `OWNER` its own modules' permissions: `RouxThemePermissions`
  (`theme.manage`), `RouxUserPermissions` (`users.read`, `users.invite`, `users.manage`,
  `users.owners`), and who-admin's `WhoAdminPermissions` (`who.identities.read`,
  `who.identities.manage`). The app grants `OWNER` its own.
- `app.identity.Permissions`: one `public static final String` per permission (`"ranks.read"`).
  `Permissions.allOf(Class...)` and `Permissions.constantsOf` (roux's, used by the tests) read them.
- Tests (in `src/test/java/app/identity/`): `PermissionClasses.ALL` lists every class of
  constants; `PermissionsTest` calls `RoleGrantsCheck.check(jdbc, allOf(PermissionClasses.ALL))`
  (needs Docker); `PermissionsListTest` calls `PermissionsTypeScript.verify(Path.of("frontend/src/permissions.gen.ts"), PermissionClasses.ALL)`
  (no Docker).
- `UserJoined(identityId, name, email, role)`: published synchronously in the transaction that
  creates any user (the first owner, an invitation, `TestUsers.signedIn`). An `@EventListener`
  makes the app's data for a new user; throwing rolls the user back.
- `UserInvitations.invite(name, email, role[, identity -> ...])`: an app's own invite endpoint
  (see `users.md`).
- `OwnerBootstrap` makes the first owner from `roux.owner.email` and `roux.owner.name`
  (`RouxOwnerProperties`, both required).
- `roux.roles.invitable` (`RouxRolesProperties`): roles an invitation may give, `OWNER` never.
  `InvitableRoles`, `InvitableRolesGuard` (refuses others, in the invitation's transaction),
  `InvitableRolesController` (`GET /api/roles/invitable`).
- `CallerPermissions`: `has(permission)`, `require(permission, what)` for a part of a response
  (`lists.md`).
- `LastAdminGuard` (who-admin): `lastAdmin.deactivate(id, () -> ...)`,
  `lastAdmin.removeRole(identityId, roleId, () -> ...)`; refusal `LastAdminException`, answered by
  `WhoAdminProblemsAdvice` as 409 `last-admin`, "The team needs someone active who can manage people".

## Steps: a new role

1. `public static final String COACH = "COACH";` in `app.identity.Roles`.
2. A new changeset in `roles.xml`:

   ```xml
   <changeSet id="coach-role" author="app">
     <sql>
       INSERT INTO who_role (id, name) VALUES (gen_random_uuid(), 'COACH') ON CONFLICT (name) DO NOTHING;
       INSERT INTO who_role_permission (role_id, permission)
         SELECT r.id, 'ranks.read' FROM who_role r WHERE r.name = 'COACH'
         ON CONFLICT DO NOTHING;
     </sql>
   </changeSet>
   ```
3. If invitations may give it: `roux.roles.invitable` in `application.yml`.
4. Its label in `frontend/src/users/users.ts` (`ROLE_LABELS`) and `api.ts`'s `User.role`.

Rename a role: a changeset `UPDATE who_role SET name = 'COACH' WHERE name = 'INSTRUCTOR';`. Take a
permission away: a changeset deleting the grant.

## Example: data for a new user of one role

```java
@Component
class InstructorProfiles {
  private final InstructorProfileRepository profiles;

  InstructorProfiles(InstructorProfileRepository profiles) {
    this.profiles = profiles;
  }

  @EventListener
  void on(UserJoined user) {
    if (Roles.INSTRUCTOR.equals(user.role())) {
      profiles.save(new InstructorProfile(user.identityId()));
    }
  }
}
```

## Check

`./mvnw test -Dskip.npm -Dtest=PermissionsListTest` until it passes after any permission change (the
first run rewrites `permissions.gen.ts` and fails). `PermissionsTest` (Docker) fails naming each
constant `OWNER` lacks, or each grant no constant declares.

## Pitfalls

- A new app's first permission: create `Permissions` and add `Permissions.class` to
  `PermissionClasses.ALL` (roux refuses a class with no constants, so it isn't there before).
- Two permission classes giving one field name different values fail `PermissionsTypeScript`.
- who-admin's own `POST /who/invitations` publishes no `UserJoined`: users invited that way get no
  app data.
- Granting `who.identities.manage` to another role lets the last owner be removed.
