# Email

who sends five emails (sign-in, invitation, address-confirmation, address-changed, passkey-added).
who's own wording names no app, so roux ships them finished: the starter brings `roux-email`
(`org.jwcarman.roux.email`), and every roux app's emails name the app and wear its brand colour with no
work. Delivery is still the app's choice (`who-email-smtp`, or its own `WhoEmailSender`; see
`getting-started.md`).

## What the emails say

| Template | Subject | Sent when |
| --- | --- | --- |
| `sign-in` | Sign in to *App* | someone asks for a sign-in link |
| `invitation` | You've been invited to *App* | the owner invites someone |
| `address-confirmation` | Confirm your email address for *App* | someone asks to add or change an address |
| `address-changed` | Your *App* email address was changed | an address is replaced (goes to the old one) |
| `passkey-added` | A passkey was added to your *App* account | a passkey is added |

Each has a plain-text body (the app named first, who's wording, "You got this email from *App*." last) and an
HTML body: one centred card with the app's name as a header, the action as a button in the brand colour, the
code large and monospaced, who's expiry and "ignore this" lines and a small footer. The HTML uses tables and
inline styles only, no images and no web fonts, so it looks alike in Gmail, Outlook and Apple Mail.

*App* is the name on the Appearance page. The theme is read at each send, so a rename or a new colour shows in
the next email.

## The values: `extra.roux`

`RouxEmailModelContributor` (a `WhoEmailModelContributor`) gives every email the same keys, so a template never
misses one:

| Key | Value |
| --- | --- |
| `extra.roux.appName` | the app's name |
| `extra.roux.brandColor` | `#rrggbb`: the brand colour when the palette is `brand`, otherwise a fixed colour per Chakra palette (the shade its solid buttons use) |
| `extra.roux.buttonText` | `#ffffff` or a near-black `#18181b`, whichever has the higher WCAG contrast against `brandColor` |

who adds `email` (the record: `{{email.link}}`, `{{email.formattedCode}}`, `{{email.expiresIn}}`, ...) and `app`
(`who.email.model.*`); see who's email guide for what each record carries.

## Change one email

An app replaces any one file by putting its own with the same name where who looks first: `who.email.templates`
(a list of Spring locations, `classpath:/templates/who/email/` by default). Put `sign-in.txt` and `sign-in.html`
there and only the sign-in email changes; the other four stay roux's. A file you don't give comes from roux, so
you can replace the text only, or the HTML only. The partials are files too: `card-start.html` and
`card-end.html` (the card's head and foot) replace the frame of all five at once.

```html
<p>Hi from {{extra.roux.appName}}.</p>
<p><a href="{{email.link}}" style="background-color:{{extra.roux.brandColor}};color:{{extra.roux.buttonText}}">Sign in</a></p>
```

Use `{{ }}`, never `{{{ }}}`, in an `.html` file: `{{ }}` escapes, and the app's name is typed by the owner
(`<b>&` shows as written). `.txt` files do not escape, so a link's `&` stays as it is. A variable the model
doesn't have fails the render, so use only the names above, `email.*`, `app.*` and what your own
`WhoEmailModelContributor` adds (a display name under `extra.displayName`, say).

## Change one subject

A subject is the message `who.email.<template>.subject`, rendered as Mustache with the same values as the body
(and collapsed to one line). Set it in the app's own messages (`spring.messages.basename`, such as
`messages.properties`) and it wins over roux's:

```properties
who.email.sign-in.subject=Your {{extra.roux.appName}} sign-in link
```

## Where they are

The templates are at `RouxEmail.TEMPLATES` (`classpath:/org/jwcarman/roux/email/`) and the subjects in the bundle
`RouxEmail.MESSAGES`; the auto-configuration registers both with who as a `WhoEmailTemplatesContributor` library. A library of
your own registers one the same way (who's email guide), after roux's if it should win over it.

## Native images

The auto-configuration registers the templates and the subjects bundle as resources; an app that adds its own
templates under `classpath:` lists them in its own hints.

## Don't

- Don't write five templates to name the app: it is already named. Replace only the email that needs different
  wording.
- Don't use `{{{ }}}` in an HTML template.
- Don't hard-code the app's name or colour in a template: read `extra.roux`, so the Appearance page keeps working.
- Don't add images or web fonts: they do not render alike in every mail app.
