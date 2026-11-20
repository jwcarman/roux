# The app skeleton: roux owns the frame and the users

## Intent

roux is the stack a software factory builds every app on, and agents are the ones writing those apps.
Today every app carries its own copy of the same frame and the same "people who sign in" code: the
dojo's `main.tsx`, root and guard routes, session, guards, layout, colour mode, settings page and its
whole `members` package (about 850 lines of Java, plus the screens). An agent rewrites it per app,
slightly differently each time, and every subtle bug (a stale email copy, a missing permission check)
is made again per app.

roux should own the frame an app runs in and the users who sign in to it, so a new app is its own
features, a nav list and a handful of pages composed from roux components.

## Goals

- A new app's startup is one call; its layout is chosen by name; its pages are its own.
- "Anything that can sign in is associated with a user" is the one rule for login, in every app.
- An app's users page, settings page and sign-in page are each a few roux components under a heading.
- An app can show, sort and search its own fields in the users list.
- The dojo shrinks by its shell and members code, and its tests and E2E suite keep passing.

## Non-goals

- Public (signed-out) pages beyond sign-in. The door stays open (see Constraints).
- Runtime role editing: roles and their permissions stay in the app's code.
- Self sign-up, and more than one organization per app.
- The top bar layout (deferred: this work keeps the seam, so it is a drop-in later), and any layout
  beyond sidebar and top bar; a kiosk page is a route without a layout.
- "Last signed in" (who records no sign-in time and publishes no sign-in event; dropped for now).

## Anti-goals

- **Generic pages.** roux never ships a page (no default home, users or settings page). It ships the
  frame and components; the app composes every page.
- **A rich user.** `AppUser` never gains domain fields (phone, birth date, department). They belong on
  the app's own entities.
- **A copy of who's data.** roux's user never stores what who owns (status, sign-in emails, passkeys,
  roles); it reads them.
- A guard around the whole app (it would block public pages later).

## Decided with the user

- roux owns the frame: startup, session, guards, layouts, the account area. The app owns every page.
- Layouts are chosen by name, from the same nav and account pieces: **sidebar** (today's `AppShell`)
  now, **top bar** later.
- The account area is roux's (display name, light/dark switch, sign out) with a slot for app extras.
- Signed out: only roux's sign-in pieces for now. The sign-in guard stays on the signed-in route group.
- **"Member" becomes "user"** everywhere roux names it (the business's own "member" stays free). The
  entity is **`AppUser`** (Spring Security owns `User`); the rest says user: `UserJoined`,
  `UserInvitations`, `TestUsers`, `TestUser`, "Users" in the nav. Nothing named member has shipped.
- **Anything that can sign in is associated with a user.** An app entity whose every row signs in shares
  the user's id (`@OneToOne @MapsId AppUser user`); one where only some rows sign in has an optional
  link, set when it is given a login. Things that never sign in have no user. Roles say what a user may
  do; the app's entity says what they are.
- roux owns a **thin `AppUser`**, not the app (every app would rewrite it) and not who.
- **Self-service:** a user changes their own display name, and their sign-in email through who's
  add/confirm/remove flow.
- **One role per user.** Inviting gives one role; changing it replaces it (only grantable roles).
- **Admin actions:** list (search, sort, page), detail, invite (name, email, role), rename, change
  role (only grantable ones), deactivate and reactivate; plus **resend invitation** and **sign out
  everywhere**.
- **Roles stay in code.**
- **The users list takes app columns** (sortable and searchable), so the list extension is approach A1.

## Approaches

**Who owns the user.**
1. The app owns it all. Simplest for roux; every generated app rewrites and re-tests about 850 lines.
2. **roux owns a thin `AppUser` (chosen).** who already owns status, emails, passkeys and roles; roux
   adds the display name, plus endpoints and components over who.
3. who owns the display name; roux owns no table. Cleanest data, but a who release, and no JPA entity
   for an app's entity to join to.

**How an app adds its own fields to the users list.**
- **A1 (chosen):** the app's entity points at `AppUser`; an app that wants extra columns writes its own
  list endpoint over its entity, using roux's user search specification, sorts and row shape, and
  `UsersTable` takes the extra columns and that endpoint. Every column can be sorted and searched.
- A2: roux's endpoint asks an app bean for extra fields per page. No app endpoint, but the fields can be
  shown and not sorted or searched. A possible later shortcut for display-only fields.
- Rejected: inheritance from a roux `@MappedSuperclass` (roux could not own the table; every app would
  migrate roux's columns), and a JSON attributes column (no constraints, sorting or real queries).

## The server

- **`AppUser`** (JPA, roux's table and changelog): `id` (= who's identity id) and `displayName`, plus
  jpa-utils' `version` (a rename is checked against it, as the
  dojo's is) and audit columns. Nothing else. Status, emails and roles are read from who.
- **The directory is a read-only view** in roux's changelog, `roux_user_directory`, joining `AppUser`
  to who's identity (status, joined date), email credential and role tables, mapped as a read-only
  entity with roux's search specification and sorts over it. roux already depends on who's table names
  (the owner bootstrap, `TestMembers`); the view is the one place it does for reading. "The" email is
  the identity's oldest email credential (who has no primary flag). An app's own list endpoint (A1)
  joins its entity to this view, so name, email, status and roles sort and search there too.
- **`UserJoined(UUID identityId, String name, String email, String role)`** replaces
  `MemberJoined`, gaining the role so a listener can make an app entity for one role only. It stays
  synchronous, in the creating transaction. roux's own listener makes the `AppUser` row and runs first
  (highest precedence), so an app's `@MapsId` entity, made by its own listener, can reference it. The
  owner bootstrap, `UserInvitations` and `TestUsers` publish it as today. No backfill: apps start fresh.
- **`UserInvitations`** replaces `MemberInvitations`, and gains **resend**: revoke the user's pending
  links and send a new one, for a user who has not accepted yet.
- **Permissions:** roux declares its own (for example `users.read`, `users.manage`) in its changelog
  and grants them to `OWNER`, as roux-roles does with who-admin's today; an app grants them to its own
  roles in its changelog. Which roles an admin may grant is the existing `InvitableRoles`.
- **Endpoints:**
  - the signed-in user: read me, rename me (email changes go to who's `/who/me/email-addresses`);
  - admin: list (search, sort, page), read one, invite, resend invitation, rename, change roles,
    change role, deactivate, reactivate, sign out everywhere.
- **One role:** who allows several roles per identity; roux keeps exactly one. Changing a user's role
  removes the old one and grants the new one in one transaction, and the directory's role column is
  that one role. `TestUsers` and the owner bootstrap already give one.
- **Sign out everywhere:** delete the user's sessions found by identity id (who indexes them so).
  Deactivating a user also ends their sessions (who-admin does not), in the same transaction (Spring
  Session's tables are in the same database).
- **Activity:** roux records `UserInvited`, `UserRenamed`, `UserDeactivated` and `UserReactivated` in the
  activity log (today the dojo's own kinds), and a user's last-owner refusal stays who's.
- **The email** shown for a user is read from who, never copied. Which address when there are several
  (who's primary, if it has one, else the first) is settled against who's API during planning.
- **For A1:** a public search specification over users (name, email, status), the sort keys, and the
  row record, for an app's own list endpoint to reuse.
- The activity log's actor names come from `AppUser`, so apps stop writing `MemberActorNames`.
- **What the dojo's members code becomes:** the role filter, joined date, rename's version check, the
  activity entries and the last-owner refusal move into roux; CSV export (`MemberCsv`, the row cap,
  `ExportTooLargeException`) stays the dojo's, reading roux's directory.

## The browser

- **Startup:** `startApp({ routeTree, nav, logo, layout })` creates the query client and router,
  loads the organization, starts the day watch, waits for the session, re-runs guards when it changes,
  mounts the toaster and confirmations, and sends a 401 back to sign-in. The app keeps TanStack
  Router's type registration and its route files.
- **Guards** stay visible in the app's route files (`requireSignedIn`, `requireSignedOut`,
  `requirePermission`), now imported from roux.
- **Layouts:** `sidebar` (today's `AppShell`), drawing the signed-in frame from the nav, the account
  area and the page, behind a `layout` choice that a top bar can join later; one signed-out frame for
  the sign-in pages.
- **Account area:** display name, light/dark switch (`ColorModeButton` moves into roux), sign out, and
  an app slot.
- **Components for the app's pages:**
  - users: `UsersTable` (base columns, app columns, any endpoint), invite dialog, user detail pieces,
    the admin actions (rename, change role, deactivate/reactivate, resend, sign out everywhere);
  - settings: `ProfileSettings` (my name), `EmailAddressSettings` (who's address flow),
    `PasskeySettings` (moved out of the dojo's 164-line `Settings.tsx`);
  - sign-in pieces and `AppearanceSettings` as today.
- **Tests:** `renderRoute` moves into `@jwcarman/roux-web/testing`, taking the app's route tree.

## The dojo

- Deletes its shell (`main.tsx` down to `startApp`, `Layout`, `colorMode`, `session`, `guards`,
  `Settings`' passkey code, `testing/route.tsx`) and its `members` package except what is dojo-only.
- Its pages (home, users, settings, sign-in) become compositions of roux components.
- Its instructors stay "a role" (approach 1 of the three shapes), so it needs no app user entity; the
  guide's worked example of an app entity linked to a user can be a new small one in the dojo (an
  instructor profile with a bio) if that proves the A1 list end to end.

## Build order

1. **Rename** member to user in roux and the dojo (mechanical, unreleased names).
2. **Users on the server:** `AppUser`, the directory view, the endpoints, one role, sign out
   everywhere, resend, the A1 pieces; the dojo moves onto them.
3. **The frame and the users screens:** startup, guards, the sidebar layout, account area,
   the users and settings components, `renderRoute`; the dojo's shell goes.

Each is its own plan, with the dojo kept green after each.

## Constraints

- roux's standing rules: 100% coverage and mutation score per module (incremental Stryker on
  roux-web), every public name in a guide, no warning suppression, no star imports.
- The sign-in guard is on the signed-in route group, never around the whole app.
- The guides teach the user rule with the three shapes (a role only; an entity that always signs in;
  an entity that may) and when to use each, and say `AppUser` takes no domain fields.
- The dojo frontend is never Prettier-formatted.

## My calls (for the user to check)

- Startup is frame, so roux owns it (`startApp`).
- `UserJoined` gains the role.
- The directory is a view over who's tables; "the" email is the oldest credential.
- roux's activity kinds for users; CSV export stays the dojo's.
- Deactivating a user ends their sessions.
- The activity log's actor names come from `AppUser`.
- Three plans, in the order above.

## Left to the builder

- Module layout: a new `roux-users` module (in the starter) or the user code in `roux-roles`; the event
  stays where its publishers can see it.
- roux-web entry names (`./app`, `./users`) and component names beyond those above.
- The endpoints' exact paths, and the permission names roux declares for the admin actions.
- `startApp`'s exact signature (typed route tree), and the account slot's shape (a prop taking a
  render function, like `AppShell`'s `account`).
