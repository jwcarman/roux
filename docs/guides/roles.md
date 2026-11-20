# Roles and permissions

A roux app checks **permissions**, never roles: `@RequiresPermission(Permissions.MEMBERS_READ)` on an
endpoint, a `permission` on a navigation item. A **role** is a named set of permissions that people
hold. Permissions are constants in code; roles and what they grant are **data**, changed by Liquibase
changesets like any schema.

## What roux gives every app

- **`OWNER`** (`RouxRoles.OWNER`). roux-roles' changelog creates it and grants it who-admin's
  permissions (`who.identities.read`, `who.identities.manage`). Each roux module grants `OWNER` its own
  permissions in its own changelog: roux-theme grants `theme.manage`
  (`RouxThemePermissions.THEME_MANAGE`). A roux upgrade that adds a permission brings its grant with it.
  The app grants `OWNER` its own permissions.
- **The first owner**, from `roux.owner.email` and `roux.owner.name` (both required). While no active
  identity holds `OWNER`, roux creates one at startup and publishes `MemberJoined` for it inside that
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

## A member joined: MemberJoined

roux publishes `MemberJoined(identityId, name, email)` whenever a member is created: the first owner
at startup, someone invited through `MemberInvitations`, and a test's person (`TestMembers.signedIn`,
[Testing](testing.md)). It is published synchronously, inside the transaction that creates the
member, so an app that keeps its own data per person (a profile) makes it in one listener, and a
listener that throws rolls the member back:

```java
@Component
class MemberProfiles {
  private final MemberProfileRepository profiles;

  MemberProfiles(MemberProfileRepository profiles) {
    this.profiles = profiles;
  }

  @EventListener
  void on(MemberJoined member) {
    profiles.save(new MemberProfile(member.identityId(), member.name(), member.email()));
  }
}
```

`email` is the address as who registered it (trimmed and lower-cased).

## Inviting a member: MemberInvitations

The app's invite endpoint (its permission, its request, its field errors) invites through
`MemberInvitations`, which wraps who's `InvitationService` and publishes `MemberJoined` inside who's
invitation transaction:

```java
@PostMapping("/api/members/invitations")
@ResponseStatus(HttpStatus.ACCEPTED)
@RequiresPermission(Permissions.MEMBERS_INVITE)
public InvitationResult invite(@Valid @RequestBody InvitationRequest request) {
  Invitation invitation;
  try {
    invitation =
        invitations.invite(
            request.name(),
            request.email(),
            request.role(),
            identity -> activityLog.append(identity.id(), new MemberInvited(request.name())));
  } catch (EmailAddressTakenException _) {
    throw new InvalidFieldException("email", "That address is already a member");
  }
  return new InvitationResult(invitation.linkSent());
}
```

- `invite(name, email, role)` returns who's `Invitation` (the new identity's id, and whether the link
  was sent). `invite(name, email, role, alsoInTransaction)` runs the app's other work that must commit
  with the invitation (an activity, say) after `MemberJoined`, in the same transaction.
- The role is checked as every invitation's is (invitable roles, above). An address already registered
  is refused with who's `EmailAddressTakenException`, for the endpoint to turn into a field error.
- who-admin's own `POST /who/invitations` takes no name, so it publishes no `MemberJoined`: a member
  invited that way has no app profile. Invite through the app's endpoint.

## The app's permissions

One class of constants, `public static final String` each:

```java
public final class Permissions {
  public static final String MEMBERS_READ = "members.read";
  public static final String MEMBERS_MANAGE = "members.manage";

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
          CROSS JOIN (VALUES ('members.read'), ('members.manage')) AS p(permission)
          WHERE r.name = 'OWNER'
          ON CONFLICT DO NOTHING;
        INSERT INTO who_role_permission (role_id, permission)
          SELECT r.id, 'members.read' FROM who_role r WHERE r.name = 'MEMBER'
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
    Permissions.class, RouxThemePermissions.class, WhoAdminPermissions.class
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
  app has roux-theme, and `WhoAdminPermissions`.

## Keep someone who can manage people

who-admin's `LastAdminGuard` refuses a change that would leave no active identity holding
`who.identities.manage`. In a roux app only `OWNER` holds it, so the guard keeps an active owner.
who-admin's own endpoints (`/who/identities`) use it. The app's own service must too, whenever it
deactivates someone or takes a role away. Calling `WhoService.deactivate` or
`RbacService.removeRoleFromIdentity` directly is not guarded:

```java
public MemberDetail deactivate(UUID actorId, UUID memberId) {
  MemberDirectoryEntry member = entry(memberId);
  // ... the app's own checks ...
  return lastAdmin.deactivate(
      memberId,
      () -> {
        who.deactivate(memberId);
        activityLog.record(MemberActivity.SUBJECT, memberId, MemberActivity.DEACTIVATED, "Deactivated");
        return MemberDetail.of(member).withStatus(MemberStatus.DEACTIVATED.name());
      });
}
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
  `RouxOwnerProperties` (`roux.owner.*`); `MemberJoined`, published for every member who joins;
  `MemberInvitations`, invitations by name.
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
