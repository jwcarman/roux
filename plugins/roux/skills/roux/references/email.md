# Email

who sends five emails; roux (`roux-email`, in the starter) ships them finished, naming the app and
in its brand colour. Delivery is the app's: `who-email-smtp` (with `spring-boot-starter-mail`,
`who.email.from`), or its own `WhoEmailSender` bean that only delivers the rendered `OutgoingEmail`
(send `text` as `text/plain`).

## Rules

- Don't write templates just to name the app: it's already named. Replace only an email that needs
  other wording.
- `{{ }}`, never `{{{ }}}`, in `.html` (the app's name is typed by the owner).
- Never hard-code the app's name or colour: read `extra.roux`.
- No images or web fonts: many mail clients block them.

## Names

| Template | Subject |
| --- | --- |
| `sign-in` | Sign in to *App* |
| `invitation` | You've been invited to *App* |
| `address-confirmation` | Confirm your email address for *App* |
| `address-changed` | Your *App* email address was changed |
| `passkey-added` | A passkey was added to your *App* account |

Values from `RouxEmailModelContributor`: `extra.roux.appName`, `extra.roux.brandColor` (`#rrggbb`),
`extra.roux.buttonText` (white or near-black for contrast). who adds `email.*` (`email.link`,
`email.formattedCode`, `email.expiresIn`) and `app.*`. A variable the model lacks fails the render.

Where roux's live: `RouxEmail.TEMPLATES` (`classpath:/org/jwcarman/roux/email/`) and
`RouxEmail.MESSAGES` (subjects).

## Steps

- **Replace one email:** put `sign-in.txt` and/or `sign-in.html` in `classpath:/templates/who/email/`
  (`who.email.templates`). Files not given stay roux's. `card-start.html`/`card-end.html` replace
  all five frames.

  ```html
  <p><a href="{{email.link}}" style="background-color:{{extra.roux.brandColor}};color:{{extra.roux.buttonText}}">Sign in</a></p>
  ```
- **Replace one subject:** in the app's `messages.properties` (`spring.messages.basename`):
  `who.email.sign-in.subject=Your {{extra.roux.appName}} sign-in link`.
- **Add a value:** a `WhoEmailModelContributor` bean of the app's (`extra.displayName`, say).

## Check

A Java test with `RecordingWhoEmailSender` (`tests.md`) sees the send; `TestMail` reads the rendered
mail end to end.

## Pitfalls

- Templates added under `classpath:` need their own native-image resource hints.
