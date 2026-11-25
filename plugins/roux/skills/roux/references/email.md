# Email

roux sends the emails sign-in needs, finished: each names the app, uses its brand colour, and comes
as plain text and HTML. The app writes none of them; it may reword any by overriding its templates.
Delivery is SMTP, set by the environment.

## Rules

- Don't send sign-in links or codes from the app's own code: ask roux (the sign-in page; an
  invitation through `POST /api/roux/users/invitations` or `users.Service.Invite`).
- Never put a password or a token in an email of the app's own.
- To change an email's wording or language, copy roux's template files for it into
  `cmd/server/emails/` and edit them; never build or send the email yourself.

## Names

| Email | Sent when | Subject |
| --- | --- | --- |
| Sign-in | someone asks for a link | `Sign in to Team Planner` |
| Invitation | someone is invited (`users.md`) | `You've been invited to Team Planner` |
| Address confirmation | an address is added or changed | `Confirm your email address for Team Planner` |
| Address changed | to the old address | `Your Team Planner email address was changed` |
| Address added | to the account's other addresses | `An email address was added to your Team Planner account` |
| Notices | a passkey or API key added, a provider's account linked | a notice naming it |

- Settings: `SMTP_ADDR` (default `localhost:1025`, Mailpit; port `465` is TLS from the first byte,
  any other is upgraded with STARTTLS), `MAIL_FROM` (default
  `no-reply@localhost`), `SMTP_USERNAME` and `SMTP_PASSWORD` (the server's login, both or neither),
  `SMTP_ALLOW_PLAINTEXT` (`true` to send without STARTTLS to a server off
  this machine), `EMAIL_RESEND_INTERVAL` (`60s`), `EMAIL_TOKEN_TTL` (`5m`), `PUBLIC_URL` (links
  point to `PUBLIC_URL/signin/link#token=...`).
- An email service (Postmark, SendGrid, Mailgun, SES, Resend) is used through its SMTP endpoint:
  `SMTP_ADDR=<its host>:587`, its SMTP login in `SMTP_USERNAME`/`SMTP_PASSWORD`, and a `MAIL_FROM`
  the service has verified. No code, and no sender of the app's own.
- The app's name is `APP_NAME`, or the owner's saved theme's; the colour is the theme's brand
  colour.
- Package `github.com/jwcarman/roux/authn/emaillink`: `Message` (`To`, `Subject`, `Text`, `HTML`),
  `Sender` (`Send(ctx, m)`), `SenderFunc`, `SMTPSender`, `Config` (`Templates`).
  `app.EmailLinkFromEnv(appName, emails)` builds it from the environment; an app rarely names these.
- An email goes after the change that causes it commits: an invitation stands even if its email
  fails, and the answer says so (`linkSent`). Emails accepted just before shutdown still go out.

## Steps: reword an email

1. Copy roux's `<name>.txt` and `<name>.html` from `authn/emaillink/templates` in the roux module
   (`$(go env GOMODCACHE)/github.com/jwcarman/roux@<version>/`) into `cmd/server/emails/`. The
   names: `sign-in`, `invitation`, `address-confirmation`, `passkey-added`, `account-linked`,
   `api-key-made`, `address-added`, `address-changed`; `layout.html` is the card around every
   HTML body.
2. Edit them. `.txt` is `{{define "subject"}}...{{end}}` then the text body (`text/template`);
   `.html` is `{{define "body"}}...{{end}}` (`html/template`: values are escaped, so never
   pre-escape them). Values: `.App`, `.BrandColor` in all; `.Link`, `.Code`, `.ExpiresIn` in
   the three link emails (`.Change` in `address-confirmation`); `.Passkey`, `.Provider`,
   `.APIKey`, `.Address` (masked) in the notices.
3. Run the server (or `go test ./cmd/server`): every email renders at startup, and a bad one
   stops it naming the file.

## Check

In development, Mailpit (<http://localhost:8025>) shows every email; the Playwright suite reads the
sign-in link from Mailpit's API.

## Pitfalls

- Without `CODE_SECRET`, sign-in is off and no email is sent.
- A file in `cmd/server/emails/` named after no email (`signin.txt`) stops startup: name it as
  above. Other files (the folder's `README.md`) are ignored.
- Copying only the `.txt` changes the subject and text; the HTML stays roux's. Copy both.
- A mail server off this machine without STARTTLS refuses to send unless `SMTP_ALLOW_PLAINTEXT=true`.
- A `PUBLIC_URL` that browsers cannot reach makes every link in every email dead.
