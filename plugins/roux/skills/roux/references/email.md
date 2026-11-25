# Email

roux sends the emails sign-in needs, finished: each names the app, uses its brand colour, and comes
as plain text and HTML. The app writes none of them and cannot yet change their wording. Delivery
is SMTP, set by the environment.

## Rules

- Don't send sign-in links or codes from the app's own code: ask roux (the sign-in page; an
  invitation through `POST /api/roux/users/invitations` or `users.Service.Invite`).
- Never put a password or a token in an email of the app's own.
- The emails are English, in roux's words: say so if the user asks for other wording or language,
  rather than inventing an API.

## Names

| Email | Sent when | Subject |
| --- | --- | --- |
| Sign-in | someone asks for a link | `Sign in to Team Planner` |
| Invitation | someone is invited (`users.md`) | `You've been invited to Team Planner` |
| Address confirmation | an address is added or changed | `Confirm your email address for Team Planner` |
| Address changed | to the old address | `Your Team Planner email address was changed` |
| Notices | a passkey or API key added, a provider's account linked | a notice naming it |

- Settings: `SMTP_ADDR` (default `localhost:1025`, Mailpit), `MAIL_FROM` (default
  `no-reply@localhost`), `SMTP_ALLOW_PLAINTEXT` (`true` to send without STARTTLS to a server off
  this machine), `EMAIL_RESEND_INTERVAL` (`60s`), `EMAIL_TOKEN_TTL` (`5m`), `PUBLIC_URL` (links
  point to `PUBLIC_URL/signin/link#token=...`).
- The app's name is `APP_NAME`, or the owner's saved theme's; the colour is the theme's brand
  colour.
- Package `github.com/jwcarman/roux/authn/emaillink`: `Message` (`To`, `Subject`, `Text`, `HTML`),
  `Sender` (`Send(ctx, m)`), `SenderFunc`, `SMTPSender`, `Config`. `app.EmailLinkFromEnv` builds it
  from the environment; an app rarely names these.
- An email goes after the change that causes it commits: an invitation stands even if its email
  fails, and the answer says so (`linkSent`). Emails accepted just before shutdown still go out.

## Check

In development, Mailpit (<http://localhost:8025>) shows every email; the Playwright suite reads the
sign-in link from Mailpit's API.

## Pitfalls

- Without `CODE_SECRET`, sign-in is off and no email is sent.
- A mail server off this machine without STARTTLS refuses to send unless `SMTP_ALLOW_PLAINTEXT=true`.
- A `PUBLIC_URL` that browsers cannot reach makes every link in every email dead.
