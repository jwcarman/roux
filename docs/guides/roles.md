# Roles and permissions

A roux app checks **permissions**, never roles: `@RequiresPermission(Permissions.CLASSES_READ)` on an
endpoint, a `permission` on a navigation item. A **role** is a named set of permissions that people
hold. Permissions are constants in code; roles and what they grant are **data**, changed by Liquibase
changesets like any schema.

## What roux gives every app

- **`OWNER`** (`RouxRoles.OWNER`). roux-roles' changelog creates it and grants it who-admin's
  permissions (`who.identities.read`, `who.identities.manage`). Each roux module grants `OWNER` its own
  permissions in its own changelog: roux-theme grants `theme.manage`
  (`RouxThemePermissions.THEME_MANAGE`), and roux-users grants `users.read`, `users.invite` and
  `users.manage` (`RouxUserPermissions`, [Users](users.md)). A roux upgrade that adds a permission brings its grant with it.
  The app grants `OWNER` its own permissions.
- **The first owner**, from `roux.owner.email` and `roux.owner.name` (both required). While no active
  identity holds `OWNER`, roux creates one at startup and publishes `UserJoined` for it inside that
  transaction (below).

  Once an active owner exists, the settings change nothing. If none is active (someone changed the
  database by hand), the next start makes one again; when another identity already holds the
  address, startup fails naming `roux.owner.email`.
- **Invitable roles**, from `roux.roles.invitable` (a list, empty by default; `OWNER` can never be
  listed). roux refuses any invitation that gives another role, inside the invitation's transaction,
  whichever endpoint sent it, with who's `InvalidInvitationException` (who's own
  `POST /who/invitations` answers it as a `400` with code `invalid-request`). It serves the list at
  `GET /api/roles/invitable` for the invite form. List only roles the app's changelog creates.
- **The last owner stays.** See "Keep someone who can manage people" below.

## A user joined: UserJoined

A **user** is anyone who can sign in. roux publishes `UserJoined(identityId, name, email, role)`
whenever a user is created: the first owner at startup (role `OWNER`), someone invited through
`UserInvitations` (the role they were invited with), and a test's person (`TestUsers.signedIn`,
[Testing](testing.md)). It is published synchronously, inside the transaction that creates the user,
so an app that keeps its own data for some users makes it in one listener, and a listener that throws
rolls the user back. `role` lets a listener act for one role only:

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

`email` is the address as who registered it (trimmed and lower-cased); `role` is the role's name.

## Inviting a user: UserInvitations

roux-users' `POST /api/users/invitations` (`users.invite`) invites by name, email and role
([Users](users.md)). An app endpoint that invites for a purpose of its own (a coach, made from a form
that also asks for their belt) invites through `UserInvitations`, which wraps who's
`InvitationService` and publishes `UserJoined` inside who's invitation transaction:

```java
Invitation invitation =
    invitations.invite(
        request.name(),
        request.email(),
        Roles.INSTRUCTOR,
        identity -> coaches.save(new Coach(identity.id(), request.belt())));
```

- `invite(name, email, role)` returns who's `Invitation` (the new identity's id, and whether the link
  was sent). `invite(name, email, role, alsoInTransaction)` runs the app's other work that must commit
  with the invitation (an activity, a row of its own) after `UserJoined`, in the same transaction.
- The role is checked as every invitation's is (invitable roles, above). An address already registered
  is refused with who's `EmailAddressTakenException`, for the endpoint to turn into a field error on
  `email`.
- `resend(identityId)` sends the invitation again (who's resend interval applies); it does not know
  whether they have signed in, which roux-users' endpoint checks.
- who-admin's own `POST /who/invitations` takes no name, so it publishes no `UserJoined`: a user
  invited that way gets no `AppUser` and no app data from a listener. Invite through roux's endpoint
  or the app's.

## The app's permissions

One class of constants, `public static final String` each:

```java
public final class Permissions {
  public static final String CLASSES_READ = "classes.read";
  public static final String CLASSES_MANAGE = "classes.manage";

  private Permissions() {}
}
```

### Parts of a response only some callers see

`@RequiresPermission` guards a whole endpoint. When the endpoint is open to more people than one of its
parts (a list's column, and the filter and sort over it), inject roux's `CallerPermissions` and check
inside it: `has(permission)` answers for the signed-in caller (`false` signed out), and
`require(permission, what)` refuses with a `403` problem. See
[Tables and paging](tables-and-paging.md#a-column-only-some-people-see).

## The app's roles

In the app's own changelog (included from its master), by name, inserting only what is missing:

```xml
<changeSet id="app-roles-1" author="app">
    <sql>
        INSERT INTO who_role (id, name) VALUES (gen_random_uuid(), 'MEMBER')
          ON CONFLICT (name) DO NOTHING;
        INSERT INTO who_role_permission (role_id, permission)
          SELECT r.id, p.permission FROM who_role r
          CROSS JOIN (VALUES ('classes.read'), ('classes.manage')) AS p(permission)
          WHERE r.name = 'OWNER'
          ON CONFLICT DO NOTHING;
        INSERT INTO who_role_permission (role_id, permission)
          SELECT r.id, 'classes.read' FROM who_role r WHERE r.name = 'MEMBER'
          ON CONFLICT DO NOTHING;
    </sql>
</changeSet>
```

Never change a changeset that has run; add a new one.

- **Adding a permission** is a constant and a changeset granting it to `OWNER` (and to any other role
  that should hold it).
- **Renaming a role** is a changeset: `UPDATE who_role SET name = 'COACH' WHERE name = 'INSTRUCTOR';`.
  Holders keep it: assignments refer to the role's id.
- **Taking a permission away** is a changeset deleting the grant from `who_role_permission`.

No startup code creates or syncs roles. A sync breaks a rolling deploy: an old instance that restarts
meets a role the new version added, or undoes its grants.

## The app's roles test

One test checks the constants and the grants agree, after every migration has run, and keeps the
frontend's list of permissions generated:

```java
@SpringBootTest
class PermissionsTest {

  private static final Class<?>[] ALL = {
    Permissions.class,
    RouxThemePermissions.class,
    RouxUserPermissions.class,
    WhoAdminPermissions.class
  };

  @Autowired JdbcClient jdbc;

  @Test
  void rolesGrantExactlyTheDeclaredPermissions() {
    RoleGrantsCheck.check(jdbc, allOf(ALL)); // static import of org.jwcarman.roux.roles.Permissions.allOf
  }

  @Test
  void frontendListIsCurrent() {
    PermissionsTypeScript.verify(Path.of("frontend/src/permissions.gen.ts"), ALL);
  }
}
```

- `RoleGrantsCheck.check` fails, naming each one, when `OWNER` lacks a constant, holds a permission no
  constant declares, or any role grants one (a typo in a changeset).
- `PermissionsTypeScript.verify` writes `permissions.gen.ts` (each constant under its Java name, and
  `PERMISSIONS`, the array `defineNav` takes) and fails when the committed file was stale: run the
  test, commit the file. Never edit it by hand. Two classes that give one field name different
  values fail: rename one.
- List every class whose permissions the app's roles hold: the app's, `RouxThemePermissions` when the
  app has roux-theme, `RouxUserPermissions` when it has roux-users, and `WhoAdminPermissions`.

## Keep someone who can manage people

who-admin's `LastAdminGuard` refuses a change that would leave no active identity holding
`who.identities.manage`. In a roux app only `OWNER` holds it, so the guard keeps an active owner.
who-admin's own endpoints (`/who/identities`) and roux-users' (`/api/users/{id}/deactivate`,
`/api/users/{id}/role`) use it. The app's own service must too, whenever it deactivates someone or
takes a role away. Calling `WhoService.deactivate` or `RbacService.removeRoleFromIdentity` directly is
not guarded:

```java
lastAdmin.deactivate(
    id,
    () -> {
      who.deactivate(id);
      activityLog.append(id, new UserDeactivated());
      return true;
    });
```

For a role removal, wrap it in `lastAdmin.removeRole(identityId, roleId, () -> ...)`. The guard runs
the change in a transaction (joining the caller's) after locking the roles that grant the permission,
so two concurrent changes cannot both pass. A refusal is `LastAdminException`, which roux answers as a
`409` problem with code `last-admin` and the detail "The team needs someone active who can manage
people".

The rule is about managing people, not the name `OWNER`: an app that also grants
`who.identities.manage` to another role may remove the last owner while someone holding that role is
active. Grant it to `OWNER` alone unless that is what you want.

## The pieces

- `RouxRoles.OWNER`; `Permissions.allOf(Class...)` (every `public static final String`, in declaration
  order, without duplicates; it throws for a class that has none) and `Permissions.constantsOf`, which
  keeps the field names.
- `OwnerBootstrap`, the `ApplicationRunner` that makes the first owner, configured by
  `RouxOwnerProperties` (`roux.owner.*`); `UserJoined`, published for every user who joins,
  with their role; `UserInvitations`, invitations by name.
- `InvitableRoles` (the checked list, from `RouxRolesProperties`, `roux.roles.*`),
  `InvitableRolesGuard` (the listener on who's `IdentityInvited`) and `InvitableRolesController`.
- `RoleGrantsCheck` and `PermissionsTypeScript`, for the app's roles test.
- `CallerPermissions`, for the parts of a response only some callers see.
- `RouxThemePermissions`; `WhoAdminProblemsAdvice`, which answers `LastAdminException` on the app's
  endpoints.

## Don't

- Don't check a role's name in code (`hasRole`, `if (role.equals("OWNER"))`): check a permission.
- Don't create roles or grant permissions from startup code (an `ApplicationRunner`, a
  `@PostConstruct`); write a changeset.
- Don't refer to a role by its id in a changeset: ids differ between databases. Use its name.
- Don't edit `permissions.gen.ts`, or keep a second list of permissions in the frontend.
- Don't deactivate someone or remove a role with `WhoService` or `RbacService` alone: wrap the change
  in `LastAdminGuard`.
- Don't list `OWNER` in `roux.roles.invitable`, or grant `who.identities.manage` to another role
  without meaning to.
