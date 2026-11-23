# Users

A user is anyone who can sign in. who owns the identity, status, addresses, passkeys and roles;
roux-users (in the starter) adds the display name (`AppUser`, table `roux_user`) and the
`/api/users` endpoints.

## Rules

- Anything that signs in is a user. Pick one shape: **a role only** (no entity); **an entity that
  shares the user's id** (always signs in: `@MapsId`, made in a `UserJoined` listener for its
  role); **an entity with an optional `@OneToOne AppUser user`** (sometimes signs in, set when it's
  invited).
- No domain fields on `AppUser`, no second display name, no copy of the email (read it from the
  directory).
- Deactivate or change a role through `Users` (or wrap the change in `LastAdminGuard`), never
  `WhoService`/`RbacService` alone.
- Sign-in and identity are who's: browser calls go through `@jwcarman/who-client`, never hand-written
  fetches.

## Names

Endpoints, under `/api/users` (permissions from `RouxUserPermissions`: `USERS_READ`, `USERS_INVITE`,
`USERS_MANAGE`, `USERS_OWNERS`):

| Endpoint | Permission | Does |
| --- | --- | --- |
| `GET /me`, `PUT /me` | signed in | the caller (`Me`: `id, displayName, email, version`); rename (`NameChange`) |
| `GET /` | `users.read` | page of `UserRow` (`id, displayName, email, role, status`); `search`, `role`, `status` (`UserStatus`, `ACTIVE` default); `UserSort` `NAME`, `EMAIL`, `ROLE`, `JOINED` |
| `GET /{id}` | `users.read` | `UserDetail` (+ `joinedAt`, `invited`, `version`) |
| `POST /invitations` | `users.invite` | `InvitationRequest` `{ name, email, role }` → 202 `InvitationResult` `{ linkSent }` |
| `POST /{id}/invitation` | `users.invite` | resend |
| `PUT /{id}/name`, `PUT /{id}/role` | `users.manage` | rename; replace their one role (`RoleChange`) |
| `POST /{id}/deactivate`, `/reactivate`, `/sign-out` | `users.manage` | |
| `POST /{id}/owner` | `users.owners` + recent sign-in | make an owner |

Refusals: unknown id 404 "No such user" (`UserNotFoundException`); address taken → field error on
`email`; role not invitable → field error on `role`; deactivate yourself 400; already deactivated /
active / signed in → 409; last owner → 409 `last-admin`.

Java: `Users` (the service), `UsersController`, `MeController`, `AppUser` (`MAX_NAME` 80),
`AppUserRepository`, `AppUsers` (roux's `UserJoined` listener, runs first), `UserDirectory` and
`UserDirectoryEntry` (view `roux_user_directory`: name, status, joined, role, oldest email),
`UserFilter(search, role, status)` with `specification(join)`.

Activities recorded for you: `UserInvited`, `UserRenamed`, `UserDeactivated`, `UserReactivated`,
`UserRoleChanged`; the actor named by `AppUserActorNames` unless the app declares `ActorNames`.

## Example: an entity that always signs in

```java
@Entity
public class Coach {
  @Id private UUID id;

  @MapsId
  @OneToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "id")
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

**Its own list** (columns of its own, filtered by the user's fields): add
`@OneToOne(fetch = FetchType.LAZY) @JoinColumn(name = "id", insertable = false, updatable = false)
UserDirectoryEntry entry;`, make the repository also a `JpaSpecificationExecutor<Coach>`, sort on
`"entry.displayName"`, and filter with `filter.specification(root -> root.join("entry"))`; rows are
`new CoachRow(UserRow.of(coach.getEntry()), coach.getBelt())`.

## Steps: an app's own invite endpoint

`UserInvitations.invite(name, email, role, identity -> ...)` checks the role is invitable, publishes
`UserJoined`, and runs the callback in the invitation's transaction:

```java
Invitation invitation = invitations.invite(request.name(), request.email(), Roles.INSTRUCTOR,
    identity -> coaches.save(new Coach(identity.id(), request.belt())));
```

- Call it outside a transaction; the callback's writes join the invitation's (same transaction
  manager, no `REQUIRES_NEW`), and an exception from them must not be swallowed: everything rolls
  back and nothing is sent.
- The `Identity` carries no address: take it from the request. who's `EmailAddressTakenException`
  means the address is registered: turn it into `InvalidFieldException("email", ...)`.
- A policy check on every invitation is an `@EventListener` for who's `IdentityInvited`.
- who-admin's `POST /who/invitations` publishes no `UserJoined`: invite through roux's or the app's
  endpoint.

who odds and ends: a public path is a `WhoPublicPathContributor` bean (never a replaced
`WhoPublicPaths`); a passkey label is 1–64 characters (`PASSKEY_LABEL_MAX`); errors under `/who/**`
are who's own Problem Details.

## In the browser

The signed-in person's name and email: `useSession().profile` (`Profile`: `displayName`, `email`,
`version`); after a rename, `refreshProfile()` (as the mutation's `onSettled`). See `app-setup.md`.

## Pitfalls

- Without `@JoinColumn(name = "id")`, `@MapsId`'s key column is `user_id`.
- A listener that ignores `role` makes an entity for every user.
- `POST /{id}/owner` needs a sign-in within `who.security.recent-sign-in` (10 minutes); older gets
  who's 401.
