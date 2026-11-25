# Email

roux sends the emails that sign-in needs, finished: each names the app, wears its brand colour,
and comes as plain text and as HTML. The app writes none of them, and may reword any of them. Delivery
is SMTP, configured from the environment.

## The emails

| Email | Sent when | Subject |
| --- | --- | --- |
| Sign-in | Someone asks for a link on the sign-in page | `Sign in to Team Planner` |
| Invitation | An owner invites someone ([Users](users.md)) | `You've been invited to Team Planner` |
| Address confirmation | Someone adds or changes an address on their account | `Confirm your email address for Team Planner` |
| Address changed | An address was changed, to the old address | `Your Team Planner email address was changed` |
| Address added | An address was added, to the account's other addresses | `An email address was added to your Team Planner account` |
| Passkey added, API key made, account linked | A passkey or an API key is added, or a provider's account linked | a notice naming what was added |

A sign-in, invitation or confirmation email carries a link and a short code: the person opens the
link, or types the code on the page they asked from. Both expire (`EMAIL_TOKEN_TTL`, five minutes
by default) and work once. The text names the app first and ends with "You got this email from
Team Planner."; the HTML is a single card of tables with inline styles, so mail clients show it
alike, with the brand colour as its accent.

## Your own wording

Each email is two Go templates in roux (`authn/emaillink/templates`): `<name>.txt`, a
`{{define "subject"}}` then the text body (`text/template`), and `<name>.html`, a
`{{define "body"}}` placed in `layout.html`, the card every email's HTML sits in (`html/template`,
which escapes every value). To reword one, copy roux's two files for it into the app's
`cmd/server/emails/` folder and change them. A file there replaces roux's file of the same name;
the emails you don't copy stay roux's. The template embeds the folder and hands it to
`app.EmailLinkFromEnv(k.AppName, emails)` (`emaillink.Config.Templates`).

| Email | Its values, beside `.App` and `.BrandColor` |
| --- | --- |
| `sign-in`, `invitation` | `.Link`, `.Code`, `.ExpiresIn` ("5 minutes") |
| `address-confirmation` | `.Link`, `.Code`, `.ExpiresIn`, and `.Change` (true when the address replaces the old one) |
| `passkey-added` | `.Passkey`, the passkey's name |
| `account-linked` | `.Provider`, such as `google` |
| `api-key-made` | `.APIKey`, the key's name |
| `address-added`, `address-changed` | `.Address`, the other address, masked: `n***@example.com` |

```text
{{define "subject"}}Your link for {{.App}}{{end -}}
Hello from {{.App}}. Sign in: {{.Link}}

Or type {{.Code}}. Both work once, for {{.ExpiresIn}}.
```

The server renders every email once as it starts. A file named after no email (`signin.txt`), a
`.txt` without a subject, an `.html` without a body, or a value that doesn't exist (`{{.Name}}`)
stops startup with an error naming the file. A subject is always one line. The emails are sent in
one language: the app's templates choose it.

## Delivery

| Variable | What it is |
| --- | --- |
| `SMTP_ADDR` | The mail server, `host:port` (default `localhost:1025`: Mailpit, from `compose.yaml`). |
| `MAIL_FROM` | The address every email is sent from (default `no-reply@localhost`). |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | The mail server's login (SendGrid, SES, Postmark and the like give one), both or neither. It is sent only over TLS, or to this machine. |
| `SMTP_ALLOW_PLAINTEXT` | `true` to send without STARTTLS to a server off this machine, on a network you trust. Without it, such a server must offer STARTTLS. |
| `EMAIL_RESEND_INTERVAL` | The least time between two emails to one address (default `60s`). |
| `EMAIL_TOKEN_TTL` | How long a link and code stay valid (default `5m`). |
| `PUBLIC_URL` | Where links point: `PUBLIC_URL/signin/link#token=...`. |

An email is sent after the change that causes it commits (an invitation stands even if its email
fails, and the answer says whether it went: `linkSent`). Emails accepted a moment before the server
stops still go out: the modules drain them during shutdown.

In development, Mailpit catches every email; read them, and open their links, at
<http://localhost:8025>. The end-to-end tests read the sign-in link from Mailpit's API
([Testing](testing.md#playwright)).

## Don't

- Don't send sign-in links or codes from the app's own code: ask roux (the sign-in page, an
  invitation through `users.Service.Invite`).
- Don't put a password or a token in an email of the app's own.
