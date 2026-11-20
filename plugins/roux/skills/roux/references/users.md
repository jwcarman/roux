# Users

A **user** is anyone who can sign in. who owns what makes them able to: the identity, its status, its
email addresses and passkeys, its roles. roux-users adds the one thing every app shows, a **display
name**, in its own table, and the endpoints that list, invite and manage users over who.

`roux-users` is in the starter. Its table, `roux_user`, and its view, `roux_user_directory`, come from
its own changelog, which migratory runs before the app's
([Getting started](getting-started.md#required-settings)).

## The rule: anything that signs in is a user

Anything in the app that can sign in is associated with a user; what never signs in has none. Roles
say what a user may do; the app's own entity, when it has one, says what they are. Pick one of three
shapes:

| The app's thing | Shape | Example |
| --- | --- | --- |
| Is nothing but a person with permissions | **A role only.** No entity: the user and their role are all there is. | An instructor who teaches classes |
| Always signs in, and has fields of its own | **An entity that shares the user's id**, made when the user joins. | A coach with a belt and a bio |
| Sometimes signs in | **An entity with an optional link to a user**, set when it is given a login. | A student, some of whom get a portal login |

An entity that always signs in maps the user with `@MapsId`, so its id is the user's, and is made in a
`UserJoined` listener for its role ([Roles](roles.md#a-user-joined-userjoined)). roux's own listener
makes the `AppUser` first (it runs at the highest precedence), so the app's can refer to it:

```java
@Entity
public class Coach {
  @Id private UUID id;

  @MapsId
  @OneToOne(fetch = FetchType.LAZY)
  private AppUser user;

  private String belt;

  protected Coach() {}

  public Coach(AppUser user) {
    this.user = user;
  }
}

@Component
class Coaches {
  private final CoachRepository coaches;
  private final AppUserRepository users;

  Coaches(CoachRepository coaches, AppUserRepository users) {
    this.coaches = coaches;
    this.users = users;
  }

  @EventListener
  void on(UserJoined joined) {
    if (Roles.COACH.equals(joined.role())) {
      coaches.save(new Coach(users.getReferenceById(joined.identityId())));
    }
  }
}
```

An entity that only sometimes signs in has an ordinary nullable `@OneToOne AppUser user`, with its own
id: the app sets it when it invites that row (`UserInvitations`, with the app's work in the
invitation's transaction).

`AppUser` holds the id (who's identity id), `displayName` (trimmed, not blank, at most
`AppUser.MAX_NAME`, 80, characters), a version and audit columns. It takes no domain fields: put
them on the app's entity. Deleting the identity deletes the `AppUser`; the app's entity should
cascade from it too.

## The endpoints

All under `/api/users`, each behind one of roux-users' permissions (`RouxUserPermissions`), which its
changelog grants to `OWNER`. Grant them to the app's own roles in the app's changelog.

| Endpoint | Permission | Does |
| --- | --- | --- |
| `GET /me` | signed in | The caller: `{ id, displayName, email, version }` (`Me`) |
| `PUT /me` | signed in | Renames the caller: `{ displayName, version }` (`NameChange`) |
| `GET /` | `users.read` | A page of `UserRow` (`id, displayName, email, role, status`); `search`, `role`, `status` (`ACTIVE` by default, or `DEACTIVATED`), sorted by `UserSort`: `NAME` (default), `EMAIL`, `ROLE`, `JOINED` |
| `GET /{id}` | `users.read` | `UserDetail`: the row plus `joinedAt`, `invited` (never signed in) and `version` |
| `GET /{id}/activities` | `users.read` | The user's history ([The activity log](activity-log.md)) |
| `POST /invitations` | `users.invite` | Invites `{ name, email, role }` (`InvitationRequest`); `202 { linkSent }` (`InvitationResult`) |
| `POST /{id}/invitation` | `users.invite` | Sends the invitation again; `202 { linkSent }`, `false` within who's resend interval |
| `PUT /{id}/name` | `users.manage` | Renames them: `{ displayName, version }` |
| `PUT /{id}/role` | `users.manage` | Gives them one role in place of theirs: `{ role }` (`RoleChange`) |
| `POST /{id}/deactivate` | `users.manage` | Deactivates them |
| `POST /{id}/reactivate` | `users.manage` | Reactivates them |
| `POST /{id}/sign-out` | `users.manage` | Ends every session they have; `204` |

What they refuse ([Errors](errors.md)):

- An unknown id is `404` "No such user" (`UserNotFoundException`). A stale `version` is `409`.
- A blank or overlong name is a field error on `displayName`. An address that already belongs to
  someone is a field error on `email`, "That address already belongs to a user". A role that is not
  invitable (`roux.roles.invitable`; never `OWNER`) is a field error on `role`, as is an unknown
  `role` filter on the list.
- Deactivating yourself is `400` "You cannot deactivate yourself". Deactivating someone deactivated
  is `409` "Already deactivated"; reactivating someone active, `409` "Already active". Resending to
  someone who has signed in is `409` "Already signed in".
- A change that would leave no one active who can manage people is `409` with code `last-admin`
  ([Roles](roles.md#keep-someone-who-can-manage-people)).

`Users` is the service behind them, for an app's own endpoint or job.

## One role per user

An invitation gives one role, and `PUT /{id}/role` replaces whatever the user holds with the one asked
for, removing each old role through `LastAdminGuard`. Changing to the role they hold already does
nothing and records nothing. Only invitable roles can be given; `OWNER` is given only by the first-owner
bootstrap or a changeset.

## Signing out and deactivating

`POST /{id}/sign-out` ends every who session the user has, on every device: their next request is
`401`. Deactivating does the same through who (a deactivated identity's session ends on its next
request), so it needs no sign-out of its own. A reactivated user signs in again.

## The directory

`UserDirectory` reads `roux_user_directory`, one read-only `UserDirectoryEntry` per user: the name and
version from `roux_user`, and from who the status (`ACTIVE`, or `DEACTIVATED` for any other), the
joined date, the role (the first by name, if someone holds more than one) and **the email: the oldest
of their addresses**, since who marks none as primary. A user changes their addresses through who's
`/who/me/email-addresses`; the directory follows.

`UserFilter(search, role, status)` is the list's filter: each word of `search` (up to 10, `%` and `_`
taken literally) must be in the name or the email, ignoring case; `role` and `status` must match, and
a `null` status means `ACTIVE`. `UserStatus` and `UserSort` are the list's values.

## An app's own list (A1)

An app that shows users with columns of its own (a coach's belt) writes its own list endpoint over its
entity, and still searches, filters and sorts by the user's fields. Map the directory onto the entity,
read-only, on the shared id:

```java
@Entity
public class Coach {
  @Id private UUID id;

  @MapsId
  @OneToOne(fetch = FetchType.LAZY)
  private AppUser user;

  @OneToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "id", insertable = false, updatable = false)
  private UserDirectoryEntry entry;

  private String belt;
  // ...
}

public interface CoachRepository
    extends JpaRepository<Coach, UUID>, JpaSpecificationExecutor<Coach> {}

public enum CoachSort implements SortPropertyProvider {
  NAME("entry.displayName"),
  EMAIL("entry.email"),
  BELT("belt");
  // property and getSortProperty() as for any sort enum
}

public record CoachRow(UserRow user, String belt) {}
```

`specification(join)` builds the same filter over the app's entity, given how to reach the directory
from its root:

```java
private static final Paginator PAGES =
    Paginator.of(Coach.class, CoachSort.class, cfg -> cfg.defaultSort(CoachSort.NAME));

@Transactional(readOnly = true)
public PageDto<CoachRow> list(PageSpec spec, UserFilter filter, String belt) {
  Specification<Coach> users = filter.specification(root -> root.join("entry"));
  Specification<Coach> belts =
      (root, query, cb) -> belt == null ? null : cb.equal(root.get("belt"), belt);
  return PAGES.paginate(
      spec,
      pageable -> coaches.findAll(users.and(belts), pageable),
      coach -> new CoachRow(UserRow.of(coach.getEntry()), coach.getBelt()));
}
```

([Tables and paging](tables-and-paging.md#write-a-paged-endpoint) covers the endpoint itself.)

## Its activities

Every change is recorded against the user, in its transaction: `UserInvited` (`user.invited`),
`UserRenamed` (`user.renamed`, from and to; only when the name changed), `UserDeactivated`
(`user.deactivated`), `UserReactivated` (`user.reactivated`) and `UserRoleChanged`
(`user.role_changed`, from and to). The actor is the signed-in user, named by `AppUserActorNames`
unless the app declares its own `ActorNames`.

## The pieces

- `AppUser`, `AppUserRepository`, and `AppUsers`, the `UserJoined` listener that makes each user's row.
- `Users`, the service; `UsersController` and `MeController`, the endpoints; `Me`, `UserDetail`,
  `UserRow`, `NameChange`, `RoleChange`, `InvitationRequest` and `InvitationResult`, what they take
  and answer; `UserNotFoundException`.
- `UserDirectory`, `UserDirectoryEntry`, `UserFilter`, `UserSort` and `UserStatus`, the directory and
  its filter.
- `RouxUserPermissions` (`USERS_READ`, `USERS_INVITE`, `USERS_MANAGE`).
- `AppUserActorNames`, and the activity kinds above.

## Don't

- Don't add domain fields to `AppUser`, or a second display name to the app's entity: put the app's
  fields on its own entity, and read the name from the user.
- Don't make an app entity for every user in a listener that ignores `role`: make it for its role.
- Don't keep a copy of the user's email: read it from the directory, which follows who.
- Don't deactivate someone or change their role with `WhoService` or `RbacService` alone: use `Users`,
  or wrap the change in `LastAdminGuard`.
