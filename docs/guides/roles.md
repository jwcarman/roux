# Roles and permissions

A roux app checks **permissions**, never roles: `k.Handle("GET /api/labels", labels.LabelsRead, ...)`
on an endpoint, a `permission` on a navigation item. A **role** is a named set of permissions that
people hold. Permissions are constants in Go; roles and what they grant are **data**, changed by
migrations like any schema.

## What roux gives every app

- **`OWNER`** (`authz.RoleOwner`). roux's migrations create it, and each of roux's modules grants
  `OWNER` its own permissions in its own migration: `theme.manage` (`theme.ThemeManage`),
  `users.read`, `users.invite`, `users.manage` and `users.owners` (`users.UsersRead` and the others,
  [Users](users.md)), and `roux.admin` (`authz.Admin`, below). `app.RouxPermissions()` lists them. A
  roux upgrade that adds a permission brings its grant with it. The app grants `OWNER` its own
  permissions.
- **The first owner**, from `OWNER_EMAIL` and `OWNER_NAME` (both or neither). While no active
  identity holds `OWNER`, the users module creates one at startup. Once an active owner exists, the
  settings change nothing. If none is active (someone changed the database by hand), the next start
  makes one again; when another identity already holds the address, startup fails.
- **Invitable roles**, from `INVITABLE_ROLES` (comma separated, default `USER`; `OWNER` is
  refused). An invitation or a role change that gives another role is refused, `400` on `role`. The
  list is served at `GET /api/roux/roles/invitable` for the invite form, in the order given. List
  only roles a migration creates.
- **The last administrator stays.** See [Keep someone who can manage people](#keep-someone-who-can-manage-people).

## The app's permissions

Constants in the package that checks them, and a list of them:

```go
// The labels' permissions (migrations/001_label.sql grants them).
const (
	LabelsRead   = "labels.read"
	LabelsManage = "labels.manage"
)

// Permissions is every permission labels checks, for the app's list of them.
var Permissions = []string{LabelsRead, LabelsManage}
```

A permission is lowercase words joined by dots: the feature, then what it allows (`labels.read`,
`items.delete.any`). Reading and changing are usually two (`labels.read`, `labels.manage`); "only
the owner" is a permission granted to `OWNER` alone.

`cmd/server/modules.go` lists every permission the app checks, roux's first:

```go
func permissions() []string {
	return append(app.RouxPermissions(), labels.Permissions...)
}
```

### Parts of a response only some callers see

`k.Handle` guards a whole endpoint. When the endpoint is open to more people than one of its parts
(a list's column, a delete button's `canDelete`), check the caller inside:

```go
caller := authn.PrincipalFrom(r.Context())
if !caller.Has(ItemsDeleteAny) && caller.IdentityID != author {
	return problem.Forbidden()
}
```

`Principal.Has(permission)` answers from the permissions the caller held when the request began;
`Principal.IdentityID` is who they are. See
[Tables and paging](tables-and-paging.md#a-column-only-some-people-see).

## The app's roles

The app's own roles are made by its own migration, `cmd/server/migrations/`, by name, inserting
only what is missing:

```sql
-- This application's own roles and what each grants. OWNER is roux's: it holds every
-- permission (each module's migration grants it its own). USER is anyone invited.
insert into roux_role (id, name) values (gen_random_uuid(), 'USER') on conflict (name) do nothing;
insert into roux_role_permission (role_id, permission)
select r.id, 'users.read' from roux_role r where r.name = 'USER'
on conflict do nothing;
```

The template's `appRoles` module (`modules.go`) runs it, named `app-roles`, after `roux-users`.
Each feature then grants its own permissions in its own migration, after `app-roles`:

```sql
insert into roux_role_permission (role_id, permission)
select r.id, p.permission
  from roux_role r
 cross join (values ('labels.read')) as p(permission)
 where r.name in ('USER', 'OWNER')
on conflict do nothing;

insert into roux_role_permission (role_id, permission)
select r.id, 'labels.manage' from roux_role r where r.name = 'OWNER'
on conflict do nothing;
```

Never change a migration that has run; add a new one.

- **Adding a permission** is a constant, an entry in the feature's `Permissions`, and a migration
  granting it to `OWNER` (and to any other role that should hold it).
- **Adding a role** is a migration in `cmd/server/migrations/` (and, if people may be invited to
  it, an entry in `INVITABLE_ROLES`).
- **Renaming a role** is a migration: `update roux_role set name = 'LEAD' where name = 'ORGANIZER';`.
  Holders keep it: assignments refer to the role's id.
- **Taking a permission away** is a migration deleting the grant from `roux_role_permission`.

No startup code creates or syncs roles. A sync breaks a rolling deploy: an old instance that
restarts meets a role the new version added, or undoes its grants.

## The permissions tests

`cmd/server/permissions_test.go` holds two tests, over `permissions()`:

```go
// The front end's list of permissions is the server's: a permission added here is rewritten into
// frontend/src/permissions.gen.ts, and this test fails once so the change is committed.
func TestTheFrontEndListsEveryPermission(t *testing.T) {
	rouxtest.PermissionsFile(t, "../../frontend/src/permissions.gen.ts", permissions()...)
}

// After every migration the app runs, OWNER holds every permission and no role grants one that
// is not declared: a forgotten grant or a typo in a migration fails here, naming it.
func TestEveryGrantIsADeclaredPermissionAndOwnerHoldsThemAll(t *testing.T) {
	t.Setenv("CODE_SECRET", strings.Repeat("s", 40))
	t.Setenv("PUBLIC_URL", "http://localhost:8080")
	a := rouxtest.New(t, "app_grants")
	mods, err := modules(a.Kit())
	if err != nil {
		t.Fatal(err)
	}
	var migrations []pgdb.Migration
	for _, m := range mods {
		if mg, ok := m.(app.Migrator); ok {
			migrations = append(migrations, mg.Migrations()...)
		}
	}
	a.Migrate(migrations...)
	rouxtest.CheckGrants(t, a.Pool, permissions()...)
}
```

- `rouxtest.PermissionsFile` writes `permissions.gen.ts` (a constant per permission, named from it:
  `labels.read` is `LABELS_READ`; and `PERMISSIONS`, the array `defineNav` takes) and fails when the
  committed file was stale. After adding a permission, run `go test ./cmd/server`: the first run
  rewrites the file and fails, the second passes; commit the file. Never edit it by hand.
- `rouxtest.CheckGrants` fails, naming each one, when `OWNER` lacks a permission, or any role
  grants one nobody declares (a typo in a migration). It needs the database.

## Keep someone who can manage people

`roux.admin` (`authz.Admin`) makes its holder an administrator, and roux refuses a change that
would leave no active identity holding it. In a roux app only `OWNER` holds it, so the rule keeps
an active owner. roux's own endpoints (deactivating someone, changing a role) apply it; a change
it refuses is a `409` with code `last-admin` and the detail "The team needs someone active who can
manage people" (`authz.LastAdminProblem()`).

The app's own code must apply it too, whenever it deactivates someone or takes a role away. Inside
the transaction, after the change, call `authz.EnsureAdmin(ctx, tx)`; it returns
`authz.ErrLastAdmin` when nobody active is left holding `roux.admin`, and the transaction must then
roll back:

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

Two such changes at once could both pass; take a lock that serializes them first (roux's own use
a transaction-scoped advisory lock). Prefer roux's endpoints for these changes where you can.

The rule is about managing people, not the name `OWNER`: an app that also grants `roux.admin` to
another role may remove the last owner while someone holding that role is active. Grant it to
`OWNER` alone unless that is what you want.

## The pieces

- `authz.RoleOwner`, `authz.Admin`; `app.RouxPermissions()`.
- `authz.FindRole(ctx, db, name)`, `authz.RolesOf(ctx, db, identityID)`, `authz.Assign`,
  `authz.Remove`, `authz.EnsureAdmin`, `authz.ErrLastAdmin`, `authz.LastAdminProblem()`.
- `authz.Invitable` (`NewInvitable(names)`, `Contains`, `Names`), served by
  `authz.RegisterInvitable` at `authz.InvitablePath`.
- `authn.Principal`: `Has(permission)`, `IdentityID`, `Permissions`.
- `rouxtest.PermissionsFile` and `rouxtest.CheckGrants`, for the app's permissions tests.
- The tables: `roux_role` (`id`, `name`), `roux_role_permission` (`role_id`, `permission`),
  `roux_identity_role` (`identity_id`, `role_id`).

## Don't

- Don't check a role's name in code (`if role == "OWNER"`): check a permission.
- Don't create roles or grant permissions from startup code (a module's `Start`); write a
  migration.
- Don't refer to a role by its id in a migration: ids differ between databases. Use its name.
- Don't edit `permissions.gen.ts`, or keep a second list of permissions in the front end.
- Don't deactivate someone or remove a role without `authz.EnsureAdmin` in the same transaction.
- Don't list `OWNER` in `INVITABLE_ROLES`, or grant `roux.admin` to another role without meaning
  to.
