# Users

A user is a member of the team: anyone who can sign in. roux's users module (`app.UsersFromEnv`,
package `users`) keeps each one's display name in `roux_user`, serves the endpoints that list,
invite and manage them under `/api/roux/users`, and the template's `frontend/src/users/` pages use
them. An app adds what its own people are, never a second user table.

## Rules

- Anything that signs in is a user; what never signs in is not. Pick a shape:
  - nothing but a person with permissions (an organizer): **a role only**, no table;
  - always signs in and has fields of its own (a person's team): **a table whose `id` is the user's**,
    `id uuid primary key references roux_user (id) on delete cascade`;
  - sometimes signs in (a contact, some with a login): **its own id and a nullable
    `user_id uuid references roux_user (id) on delete set null`**.
- Never add columns to `roux_user`, keep a second display name, or copy the email: read them from
  `roux_user_directory`, which follows sign-in.
- Store a person's id only after `users.MustBeActive` in the same transaction: an unknown or
  deactivated id would be kept silently.
- Change users through roux's endpoints or `users.Service`, never your own SQL on roux's tables:
  they apply the invitable roles, the last administrator and the activity log.

## Names

- `users.MustBeActive(ctx, tx, field, ids)`: a `400` on `field`, "Must be active members of the team"
  (`users.MustBeActiveMembers`), unless every id is an active member.
- `users.ActiveMembers(ctx, db)`: every active member as `users.Member`, by name: a picker's
  options (an assignee). Serve them from the feature's own endpoint under its read permission
  (`GET /api/tasks/assignees`), never by querying `roux_user_directory` yourself.
- `users.Members(ctx, db, ids)`: each as `users.Member` (`ID`, `Name`, `Active`), by name, leaving
  out ids that are no member; for showing people a record keeps, including those who left.
- `users.Service`: `Invite(ctx, name, email, role) (linkSent bool, err error)`, `Rename`,
  `ChangeRole`, `Deactivate`, `Reactivate`, `MakeOwner`, `SignOutEverywhere`, `List`, `Detail`,
  `Me`, `Names`.
- `users.MaxNameLength` (80); `users.StatusActive`, `users.StatusDeactivated`; `users.NotFound()` (404 "No such user");
  `users.BasePath` (`/api/roux/users`).
- Permissions, granted to `OWNER` by roux: `users.read` (`users.UsersRead`), `users.invite`
  (`users.UsersInvite`), `users.manage` (`users.UsersManage`), `users.owners`
  (`users.UsersOwners`). The template grants `users.read` to `USER`.
- `roux_user_directory` (a view): `id`, `version`, `display_name`, `email` (the oldest address),
  `role`, `status` (`ACTIVE` or `DEACTIVATED`), `joined_at`, `invited`.
- Endpoints under `/api/roux/users`: `GET /me`, `PUT /me` (rename yourself); `GET /` (page; `search`,
  `role`, `status`; sorts `NAME`, `EMAIL`, `ROLE`, `JOINED`); `GET /{id}`; `GET /{id}/activities`;
  `POST /invitations` (`{ name, email, role }`, `202 { linkSent }`); `POST /{id}/invitation`
  (resend); `PUT /{id}/name`; `PUT /{id}/role`; `POST /{id}/deactivate`; `POST /{id}/reactivate`;
  `POST /{id}/sign-out`; `POST /{id}/owner` (needs `users.owners` and a sign-in within 10 minutes).
- Activities recorded against a user: `user.invited` (`users.UserInvited`), `user.signed_up`
  (`users.UserSignedUp`), `user.renamed` (`users.UserRenamed`), `user.deactivated`
  (`users.UserDeactivated`), `user.reactivated` (`users.UserReactivated`), `user.role_changed`
  (`users.UserRoleChanged`).
- `users.ListConfig`: the user list's sorts and page sizes, for `api.PageRequest` in an app's own
  endpoint over `users.Service.List`.

## Example: a table that shares the user's id

```sql
create table profile (
    id      uuid primary key references roux_user (id) on delete cascade,
    team    text not null default '',
    version bigint not null default 0
);
```

roux has no hook when a user joins, so make the row when it is first needed:

```go
if _, err := tx.Exec(ctx, `insert into profile (id) values ($1) on conflict (id) do nothing`, userID); err != nil {
	return err
}
```

A list of profiles with their names joins the directory in a view (`create view profile_list as
select d.id, d.display_name, d.email, d.status, p.team from profile p join roux_user_directory d on
d.id = p.id`) and pages it with `page.New` (`lists.md`), filtered by
`page.Where("status = ?", users.StatusActive)`.

## Example: assigning people

```go
err := pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
	if err := users.MustBeActive(ctx, tx, "assigneeIds", in.Assignees); err != nil {
		return err
	}
	// ...insert the task and its assignees...
	return nil
})
```

## In the browser

`@jwcarman/roux-web/users` is the client for roux's endpoints: `usersApi` (`list`, `get`,
`invite`, `changeStatus`, `renameMe`); queries `usersPage(filters)` (`UserFilters`; rows are
`User`), `userQuery(id)` (`UserDetail`), `userActivitiesPage(id)`, `invitableRolesQuery`, keyed
under `userKeys`; mutations `inviteUser` (an `Invitation`, answering an `InvitationResult`),
`changeUserStatus(id)` (a `UserStatusAction`), `renameMe(version)`; schemas `invitationSchema`,
`renameSchema`; `MAX_NAME` (80). The signed-in person's name and
email: `useSession().profile` (`Profile`: `displayName`, `email`, `version`); after a rename,
`refreshProfile()` (as the mutation's `onSettled`). See `app-setup.md`.

## Check

A Go test that stores an id of someone deactivated (`a.Deactivate(id)`) gets the `400` on the field
(`tests.md`).

## Pitfalls

- `users.MustBeActive` called with the pool outside the transaction that stores the ids: someone
  deactivated in between is kept.
- A table that shares the user's id but has `not null` columns without defaults: the row cannot be
  made with just the id when it is first needed.
- `POST /{id}/owner` from a sign-in older than 10 minutes is `401`: the person signs in again.
- Changing a role with SQL of your own skips the last-administrator rule (`permissions.md`).
