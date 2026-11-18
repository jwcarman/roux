# The shell: theme and sign-in

roux serves the app's shell (`index.html`, with its nonce, its Content-Security-Policy and the theme in
place: [Getting started](getting-started.md#the-shell)) and ships the pieces every shell needs, from
`@jwcarman/roux-web/theme`. The pages are the app's: the sign-in page and the appearance page stay app code, composed from roux's components.

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

`@jwcarman/roux-web/signin` ships the pieces; the page is the app's (`routes/signin/index.tsx`
composes them, and is the app's to change). who is `@jwcarman/who-client` (a peer dependency).

```tsx
import { EmailSignIn, PasskeySignInButton, ProviderSignInButtons } from "@jwcarman/roux-web/signin";

export function SignIn() {
  return (
    <Stack gap="6">
      <Heading as="h2">Sign in</Heading>
      <EmailSignIn />
      <PasskeySignInButton />
      <ProviderSignInButtons />
    </Stack>
  );
}
```

- `EmailSignIn`: "Email me a link" for an address (`email()` rule), then `Check your email` and "Open the
  link, or type the code from the email": a code field (`autoComplete="one-time-code"`) whose
  "Sign in" calls `who.email.signIn({ email, code })`; who's refusal is told under the field.
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

## Don't

- Don't mount `ChakraProvider` or Emotion's `CacheProvider` yourself next to `ThemeProvider`.
- Don't write the theme, the nonce or the page's title into `index.html` by hand: the server does.
- Don't call `/api/theme` from the app; `AppearanceSettings` is the only caller.
- Don't hand-write sign-in calls to who: use the components.
