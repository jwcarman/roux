# roux's finished emails

**Status:** designed; waits on two who features (below). 2026-11-18.

## Why

who 0.23.0 renders its five emails (sign-in, invitation, address-confirmation, address-changed,
passkey-added) from Mustache templates, plain text only, in its own words. None of them names the
app: the subject is "Your sign-in link and code", the body "Sign in: https://…". Someone with
accounts on two apps cannot tell which one wrote. An agent building a roux app should not have to
remember to brand five emails, so roux ships them finished: every roux app's emails name the app and
wear its brand colour with no work.

## Approaches

- **Values only:** roux supplies `appName`, brand colour etc. and each app writes its own
  templates. Cheap for roux; every app (every agent) has to remember five templates. Rejected.
- **Finished emails (chosen by the user):** roux ships text and HTML templates for all five and
  the values they read; an app replaces any one by dropping its own file.

## Design

- **A new module, `roux-email`**, brought by the starter (as the starter brings `who-email`):
  the templates and a `WhoEmailModelContributor`.
- **Values.** The contributor reads the shell's theme (`ShellThemeSource`) at each send, so an
  owner's change on the Appearance page shows in the next email. Every email gets the same keys, so
  a template never misses one: `extra.roux.appName`, `extra.roux.brandColor` (`#rrggbb`: the brand
  colour for palette `brand`, otherwise a fixed hex per Chakra palette, the shade the app's buttons
  use), `extra.roux.buttonText` (white or near-black, whichever contrasts better with the brand
  colour).
- **Text bodies:** who's wording, with the app named first and a closing line "You got this email
  from <app>."
- **HTML bodies:** one centred card: the app name as a header; the action as a button in the brand
  colour; the code large and monospaced; who's expiry and "ignore this" lines; a small footer.
  Tables and inline styles only, no images, no web fonts, so it renders alike in Gmail, Outlook and
  Apple Mail. The app name is owner-entered; `.html` templates escape it (Mustache `{{ }}`, never
  `{{{ }}}`).
- **Subjects** name the app: "Sign in to Dojo", "You've been invited to Dojo", and so on.

## Needs from who: planned for who 0.24.0

who-28 agreed both (2026-11-18; who's design: `docs/superpowers/specs/2026-11-18-library-email-templates-design.md`
in the who repo):

1. **Library templates:** roux's auto-configuration registers
   `new WhoEmailTemplates("classpath:/org/jwcarman/roux/email/", "org/jwcarman/roux/email/email-messages")`
   (`org.jwcarman.who.email`). Per file (templates and partials) who searches the app's
   `who.email.templates` (a list), then each `WhoEmailTemplates` location in `@Order` order, then
   its built-ins; subjects resolve the same way (app `MessageSource`, then each library's bundle, then
   who's). An app overrides any one of roux's files from its own location.
2. **Subjects with values:** `who.email.<template>.subject` is rendered as Mustache with the body's
   model and collapsed to one line, so roux's bundle says
   `who.email.sign-in.subject=Sign in to {{extra.roux.appName}}`.

roux also registers `RuntimeHints` resources for its template location and bundle (native images).
roux builds this once who 0.24.0 ships.

## Not in this

- Greeting the invitee by name: the dojo's own contributor adds that (`extra.displayName`).
- Logos or images; dark-mode tuning.

## Proving it

- Contract tests render every template through who's real renderer: each names the app, the HTML
  escapes an app name holding `<b>&`, the brand colour and button text are the expected hex for a
  named palette and for `brand`, and an app template replaces roux's for one email only.
- The dojo's end-to-end test reads the invitation from Mailpit and finds the app's name in the
  subject and both bodies.

## Left to the builder

Exact wording beyond "names the app", the HTML card's spacing and type sizes, and the per-palette
hex table (the shade Chakra's solid buttons use).
