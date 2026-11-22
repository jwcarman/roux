# The shell: theme, sign-in and navigation

roux serves the app's shell (`index.html`, with its nonce, its Content-Security-Policy, the theme and the
organization's context (`#app-context`, [Dates and time](dates-and-time.md)) in place:
[Getting started](getting-started.md#the-shell)) and ships the pieces every shell needs, from
`@jwcarman/roux-web/theme`. The pages are the app's: the sign-in page, the appearance page and the navigation declaration stay app code, composed from roux's components.

## The theme

```tsx
// main.tsx: once, above everything that uses Chakra
import { ThemeProvider } from "@jwcarman/roux-web/theme";

<ThemeProvider>
  <App />
</ThemeProvider>;
```

`ThemeProvider` reads the theme the server wrote into the page (`<script type="application/json"
id="app-theme">`, a `ShellTheme`: `appName`, `palette`, `brandColor`, `shape`, `headingFont`,
`bodyFont`) and mounts, in one place: Chakra's provider with the system built from it
(`createThemeSystem`), the bundled font the theme uses, Emotion's cache with the page's CSP nonce
(`cspNonce()`; without it the browser refuses Emotion's styles), and the app's name as the document
title. It replaces `ChakraProvider`. Mount no other Chakra provider, and no Emotion `CacheProvider`.

- A page with no theme, or one the server has not filled in (Vite's dev server), gets Chakra's
  stock look and the name `App`.
- A theme with a value the app has no look for (a palette the server knows and this version of
  roux-web does not) throws at startup, naming it: the server and the app disagree.
- `useShellTheme()` answers a `ShellThemeState`, `{ saved, shown, preview, commit }` (themes are `ShellTheme` values whose parts are the `Palette`, `Shape` and `Font` unions): the app's header shows
  `shown.appName`, so the owner sees a draft name while editing. It throws outside a
  `ThemeProvider`. Chakra's `colorPalette` follows the theme; a destructive button says
  `colorPalette="red"`, whatever the theme.
- `ThemeProvider theme={...}` starts from another theme: a test's, or a storybook's.
- Light or dark mode is the visitor's own (a visitor's choice is not part of the owner's theme).
  An app with a mode switch passes `cspNonce()` to it (next-themes' `nonce` prop) and sets the mode
  before first paint in `index.html`.

## The appearance page

```tsx
import { AppearanceSettings } from "@jwcarman/roux-web/theme";

export const Route = createFileRoute("/_signedIn/appearance")({
  beforeLoad: ({ context }) => requirePermission(context.session.currentMe(), "theme.manage"),
  component: () => (
    <Stack gap="8">
      <Heading as="h2" size="lg">Appearance</Heading>
      <AppearanceSettings />
    </Stack>
  ),
});
```

`AppearanceSettings` is the whole form: five ready-made looks, then the app's name, a colour,
shapes and lettering, with the owner's own colour and a live preview on the owner's own screen
(through `useShellTheme().preview`) until it is saved. It reads and saves through roux-theme's
`/api/theme` (a built-in `useSchemaForm`: a refusal from the server is under its field, a `409` starts
the form over from the other owner's look), toasts `The new look is saved` with an Undo that puts the
earlier look back, and `Cancel` drops the draft. It takes no props. Its page is the app's, and so
is the route guard: guard it with `theme.manage`, which the server enforces too.

## Sign-in

`@jwcarman/roux-web/signin` ships the sign-in page whole, and the pieces for an app that lays out its
own. who is `@jwcarman/who-client` (a peer dependency).

```tsx
import { SignInCard, SignInFrame } from "@jwcarman/roux-web/signin";

// The signed-out layout: the card centred on a tinted page, the mode switch in the corner.
<SignInFrame tools={<ColorModeButton />}>
  <Outlet />
</SignInFrame>;

// The sign-in page (routes/signin/index.tsx).
export function SignIn() {
  const appName = useShellTheme().shown.appName;
  return <SignInCard appName={appName} logo={<Logo boxSize="9" />} />;
}
```

- `SignInFrame`: a card no wider than 400px, centred on a tinted page from a small screen up; on a
  phone the card is the page. `tools` sit in the top corner. Its children are the card's contents, so
  the emailed link's landing page (`/signin/link`) wears the same card.
- `SignInCard`: "Sign in to `appName`" under `logo`, then the ways who reports as on
  (`who.signInOptions()`; email and a passkey when who cannot be asked). The emailed link comes first,
  with "Email me a link" at the field's right edge; below a divider, "Have a passkey?" beside "Use a
  passkey" when that is the only other way, or "Other ways to sign in" above a wrapping row of the
  passkey and a `ProviderSignInButton` per provider. Buttons are their label's width. Once the link is
  sent the card turns to `Check your email`: the address it went to, the code beside "Sign in", "Use a
  different email" (back, the address kept) and "Send it again" (who has no cooldown, so neither does
  the card). Refusals are told on the card (`role="alert"`).

The pieces, for a page of the app's own:

- `EmailSignIn`: "Email me a link" for an address (`email()` rule), then `Check your email` and "Open the
  link, or type the code from the email": a short code field (`autoComplete="one-time-code"`) with
  "Sign in" beside it, which calls `who.email.signIn({ email, code })`; who's refusal is told under the field.
- `PasskeySignInButton`: "Sign in with a passkey"; a refusal or cancel is told under it (`role="alert"`).
- `ProviderSignInButtons`: one `ProviderSignInButton` per provider `who.signInOptions()` reports, with
  who's display names; nothing when there are none. `ProviderSignInButton provider="google"` alone is
  a link (a full page load, because the provider's own page must open) to who's authorize URL, "Continue with
  Google", drawn as the provider's guidance asks (Google: the four-color G on white with a #747775
  outline, #131314 in dark mode; Microsoft's four squares; Apple, GitHub, GitLab, Okta). Any other provider
  gets a generic icon and `name` (who's display name; `ProviderSignInButtons` passes it, else the id).
  `label` and `icon` override (`ProviderSignInButtonProps` also takes the button's own Chakra props).
- `EmailLinkLanding`: the page who's `email-link.link-base-url` opens (`/signin/link`): redeems the token once,
  then goes on. A bad link says so, with a link to `signInPath` (`/signin`).
- `useSignInReturn()` returns the function every component calls on success: it opens the page the
  visitor asked for, else Home, as a full page load (so the app starts as the person who signed in).
  The route guard that sends a signed-out visitor to sign in calls `rememberSignInReturn(path)`
  (`isReturnable` says which paths count: never Home, sign-in, `/api` or `/who`; `takeSignInReturn` reads it once).
  After a sign-in of your own, call `useSignInReturn()()`.

## Navigation

`@jwcarman/roux-web/navigation` owns the sidebar. The app declares its places in a typed module:

```ts
// nav.ts
import { LuHouse, LuUsers } from "react-icons/lu";
import { defineNav } from "@jwcarman/roux-web/navigation";
import { PERMISSIONS } from "./api"; // ["users.read", ...] as const

export const nav = defineNav(PERMISSIONS, [
  { label: "Home", to: "/", icon: LuHouse, description: "A welcome page." },
  { label: "Users", to: "/users", icon: LuUsers, permission: "users.read", description: "Who can use the app." },
]);
```

`to` is a route the router knows (a misspelt route is a type error), `icon` is a component, and
`permission` must be one of the app's declared permissions: TypeScript checks it, and `defineNav` throws
when the module loads for a typo that gets past it, for two items with one place or label, two start places,
and a Home item beside a start place elsewhere. A renamed server permission therefore fails at once, in dev
and in tests (import `nav` in a test), instead of hiding a page from everyone.

`navItemsFor(nav, permissions)` is what a person may open (`me.permissions`, a `Permissions` list; none when
signed out); `startPathFor` and `openingRedirect(nav, permissions, home)` say where `/` sends them. The
types are `Nav` (what `defineNav` returns), `NavEntry` (one item) and `NavTo` (a route the router knows).

`<AppShell>` is the signed-in frame (`AppShellProps`: `nav`, `permissions`, `appName`, `logo`, `account`): a sidebar
from `lg`, an icon rail at `md`, and a drawer opened by "Open navigation" below. The page is its `children`
(`<Outlet />`), and `account` draws the person's area under the links, given an `AccountLayout`
(`({ compact, close }) => ...`: `compact` in the rail, `close` closes the drawer). `<NavLinks>`
(`NavLinksProps`) is the link list alone, and `RAIL_LABELS` hides labels in the rail. Needs
`@tanstack/react-router`.

`<AccountMenu>` (`AccountMenuProps`: `name`, `email`, `compact`, `children`) is that area as one button,
"Account": the person's initials, name and email, opening a menu above it (only the initials in the rail).
Its items are `<AccountMenuLink to icon onNavigate>` (a page; pass the layout's `close`),
`<AccountMenuItem icon onSelect>` (an action, such as signing out), `<AccountMenuSwitch icon checked
onCheckedChange>` (a setting flipped in place, such as dark mode) and `<AccountMenuSeparator />`. The person's
own pages (their settings) belong here, not in the navigation:

```tsx
account={({ compact, close }) => (
  <AccountMenu name={profile?.displayName} email={profile?.email} compact={compact}>
    <AccountMenuLink to="/settings" icon={LuSettings} onNavigate={close}>Settings</AccountMenuLink>
    <AccountMenuSeparator />
    <AccountMenuItem icon={LuLogOut} onSelect={() => void signOut()}>Sign out</AccountMenuItem>
  </AccountMenu>
)}
```

## Don't

- Don't mount `ChakraProvider` or Emotion's `CacheProvider` yourself next to `ThemeProvider`.
- Don't write the theme, the nonce or the page's title into `index.html` by hand: the server does.
- Don't call `/api/theme` from the app; `AppearanceSettings` is the only caller.
- Don't hand-write sign-in calls to who or a navigation list of strings: use the components and `defineNav`.
