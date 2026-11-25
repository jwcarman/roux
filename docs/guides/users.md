# Users

A **user** is a member of the team: anyone who can sign in. roux's sign-in owns what makes them
able to: the identity, its status, its email addresses and passkeys, its roles. The users module
(`app.UsersFromEnv`, package `users`) adds the one thing every app shows, a **display name**, in
its own table, and the endpoints that list, invite and manage users.

Its table, `roux_user`, and its view, `roux_user_directory`, come from its own migration
(`users.Migration`, named `roux-users`), which runs before the app's.

## The rule: anything that signs in is a user

Anything in the app that can sign in is a user; what never signs in is not. Roles say what a user
may do; the app's own table, when it has one, says what they are. Pick one of three shapes:

| The app's thing | Shape | Example |
| --- | --- | --- |
| Is nothing but a person with permissions | **A role only.** No table: the user and their role are all there is. | An organizer who can change everyone's items |
| Always signs in, and has fields of its own | **A table that shares the user's id.** | A person's profile: the team they are on |
| Sometimes signs in | **A table with an optional reference to a user**, set when it is given a login. | A contact (a supplier, a venue), some of whom get a login |

A table that shares the user's id makes it its key, and goes when the user does:

```sql
create table profile (
    id      uuid primary key references roux_user (id) on delete cascade,
    team    text not null default '',
    version bigint not null default 0
);
```

roux has no hook that runs when a user joins, so the app makes the row when it is first needed
(`insert into profile (id) values ($1) on conflict (id) do nothing`), or from its own invite
endpoint after `users.Service.Invite`.

A table for something that only sometimes signs in has its own id and a nullable
`user_id uuid references roux_user (id) on delete set null`, set when the app invites that row.

`roux_user` holds the id (the identity's id), `display_name` (trimmed, 1 to `users.MaxNameLength`,
80, characters), a version and when they first signed in. It takes no domain columns: put them on
the app's table.

## Referring to people

A feature that assigns work to people, or lists who came, keeps their ids, and checks them in
the transaction that stores them:

```go
if err := users.MustBeActive(ctx, tx, "assigneeIds", in.Assignees); err != nil {
	return err // 400 on assigneeIds: "Must be active members of the team"
}
```

`users.MustBeActive(ctx, db, field, ids)` refuses an id that is not an active member (unknown, or
deactivated) as a `400` on `field` (`users.MustBeActiveMembers`); the same id twice is one member.
To show them, `users.Members(ctx, db, ids)` answers each as a `users.Member` (`id`, `name`,
`active`), by name, leaving out an id that is no member, so a feature that keeps people who have
since left can still name them and mark them inactive. A feature's table refers to them with
`references roux_user (id)`.

## The endpoints

All under `/api/roux/users` (`users.BasePath`), each behind one of the users' permissions
(`users.UsersRead`, `users.UsersInvite`, `users.UsersManage`, `users.UsersOwners`), which its
migration grants to `OWNER`. Grant them to the app's own roles in the app's migration (the
template grants `users.read` to `USER`).

| Endpoint | Permission | Does |
| --- | --- | --- |
| `GET /me` | signed in | The caller: `{ id, displayName, email, version }` (`users.Me`) |
| `PUT /me` | signed in | Renames the caller: `{ displayName, version }` |
| `GET /` | `users.read` | A page of `users.Row` (`id, displayName, email, role, status`); `search`, `role`, `status` (`ACTIVE` by default, or `DEACTIVATED`), sorted by `NAME` (the default), `EMAIL`, `ROLE` or `JOINED` |
| `GET /{id}` | `users.read` | `users.Detail`: the row plus `joinedAt`, `invited` (never signed in) and `version` |
| `GET /{id}/activities` | `users.read` | The user's history, newest first ([The activity log](activity-log.md)) |
| `POST /invitations` | `users.invite` | Invites `{ name, email, role }`; `202 { linkSent }` |
| `POST /{id}/invitation` | `users.invite` | Sends the invitation again; `202 { linkSent }`, `false` within the resend interval |
| `PUT /{id}/name` | `users.manage` | Renames them: `{ displayName, version }` |
| `PUT /{id}/role` | `users.manage` | Gives them one role in place of theirs: `{ role }` |
| `POST /{id}/deactivate` | `users.manage` | Deactivates them |
| `POST /{id}/reactivate` | `users.manage` | Reactivates them |
| `POST /{id}/sign-out` | `users.manage` | Ends every session they have; `204` |
| `POST /{id}/owner` | `users.owners`, and a recent sign-in | Makes them an owner, in place of their role |

`email` and `role` may be `null` (someone who signs in only with a provider has no address).
roux-web's `@jwcarman/roux-web/users` is the client for all of them.

What they refuse ([Errors](errors.md)):

- An unknown id is `404` "No such user" (`users.NotFound()`). A stale `version` is `409`; a missing
  one a `400` on `version`.
- A blank or overlong name is a field error on `displayName`. An address that already belongs to
  someone is a field error on `email`, "That address already belongs to a user". A role that is not
  invitable (`INVITABLE_ROLES`; never `OWNER`) is a field error on `role`, "That role cannot be
  given", as is an unknown `role` filter on the list ("No such role"), and a role holding a
  permission the caller does not hold ("You cannot give a role with permissions you do not hold").
- Deactivating yourself is `400` "You cannot deactivate yourself". Deactivating someone deactivated
  is `409` "Already deactivated"; reactivating someone active, `409` "Already active". Resending to
  someone who has signed in is `409` "Already signed in".
- A change that would leave no one active who can manage people is `409` with code `last-admin`
  ([Roles](roles.md#keep-someone-who-can-manage-people)).

`users.Service` is the service behind them, for an app's own endpoint or job: `Invite`, `Rename`,
`ChangeRole`, `Deactivate`, `Reactivate`, `MakeOwner`, `SignOutEverywhere`, `List`, `Detail`,
`Me` and `Names`.

## One role per user

An invitation gives one role, and `PUT /{id}/role` replaces whatever the user holds with the one
asked for. Changing to the role they hold already does nothing and records nothing. Only invitable
roles can be given that way.

`OWNER` is given by `POST /{id}/owner`, to someone who is already a user: invite them first, then
make them an owner. It needs `users.owners` (granted to `OWNER` alone; leave it there, since
whoever holds it can hand out everything) and a recent sign-in (within 10 minutes): a caller who
signed in longer ago gets `401` and signs in again. It is recorded as `user.role_changed`.

## Signing out and deactivating

`POST /{id}/sign-out` ends every session the user has, on every device: their next request is
`401`. Deactivating ends them too. A reactivated user signs in again.

## The directory

`roux_user_directory` is one row per user: `id`, `version` and `display_name` from `roux_user`,
and from sign-in the `status` (`ACTIVE`, or `DEACTIVATED` for any other), `joined_at`, the `role`
(the first by name, if someone holds more than one), `invited` and **the `email`: the oldest of
their addresses**, since none is marked primary. A user changes their addresses on their own
account page; the directory follows.

`users.Filter{Search, Role, Status}` is the list's filter: each word of `Search` must be in the
name or the email, ignoring case (`%` and `_` taken literally); `Role` and `Status` must match, and
an empty status means `ACTIVE`.

## An app's own list

An app that shows users with columns of its own (a person's team) writes its own list over a view
that joins its table to the directory, and searches, filters and sorts by the user's fields too:

```sql
create view profile_list as
select d.id, d.display_name, d.email, d.status, p.team
  from profile p
  join roux_user_directory d on d.id = p.id;
```

```go
var list = page.New(page.ListConfig[Sort, Row]{
	From:    "profile_list",
	Columns: "id, display_name, email, team",
	Sorts: map[Sort][]page.Term{
		ByName:  {page.By("lower(display_name)")},
		ByEmail: {page.By("lower(email)")},
		ByTeam:  {page.By("lower(team)")},
	},
	DefaultSort: ByName,
	Search:      []page.Field{page.Contains("display_name"), page.Contains("email")},
	Scan:        scanRow,
})
```

with `page.Where("status = ?", users.StatusActive)` as a filter (`users.StatusDeactivated` for
the others). [Tables and paging](tables-and-paging.md#the-server)
covers the paginator and the endpoint.

## Its activities

Every change is recorded against the user, in its transaction: `user.invited`
(`users.UserInvited`), `user.signed_up` (`users.UserSignedUp`, a provider sign-up),
`user.renamed` (`users.UserRenamed`, from and to; only when the name changed),
`user.deactivated` (`users.UserDeactivated`), `user.reactivated` (`users.UserReactivated`) and
`user.role_changed` (`users.UserRoleChanged`, from and to). The actor is the
signed-in user, named from `roux_user`.

## In the browser: `@jwcarman/roux-web/users`

The template's Users pages are built on this client; an app's own page about people uses it too.

- `usersApi`: `list`, `get`, `invite`, `changeStatus`, `renameMe`, over `/api/roux/users`.
- Queries: `usersPage(filters)` (a `UserFilters`: `search`, `role`, `status`; rows are `User`),
  `userQuery(id)` (a `UserDetail`), `userActivitiesPage(id)`, `invitableRolesQuery`. Their keys are
  `userKeys`, under `["roux", "users"]`.
- Mutations: `inviteUser` (an `Invitation`, answering an `InvitationResult` with `linkSent`),
  `changeUserStatus(id)` (a `UserStatusAction`: `deactivate` or `reactivate`), `renameMe(version)`
  (a `Rename`).
- Schemas: `invitationSchema` and `renameSchema`, in the server's words; `MAX_NAME` is 80, the
  server's `users.MaxNameLength`.

## Don't

- Don't add domain columns to `roux_user`, or a second display name to the app's table: put the
  app's columns on its own table, and read the name from the user.
- Don't keep a copy of the user's email: read it from the directory, which follows sign-in.
- Don't store an id of someone without `users.MustBeActive` in the same transaction.
- Don't deactivate someone or change their role with SQL of your own: use `users.Service`, or keep
  the last administrator ([Roles](roles.md#keep-someone-who-can-manage-people)).
