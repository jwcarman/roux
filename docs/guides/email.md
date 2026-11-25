# Email

roux sends the emails that sign-in needs, finished: each names the app, wears its brand colour,
and comes as plain text and as HTML. The app writes none of them. Delivery is SMTP, configured from
the environment.

## The emails

| Email | Sent when | Subject |
| --- | --- | --- |
| Sign-in | Someone asks for a link on the sign-in page | `Sign in to Acme Gym` |
| Invitation | An owner invites someone ([Users](users.md)) | `You've been invited to Acme Gym` |
| Address confirmation | Someone adds or changes an address on their account | `Confirm your email address for Acme Gym` |
| Address changed | An address was changed, to the old address | `Your Acme Gym email address was changed` |
| Passkey added, API key made, account linked | A passkey or an API key is added, or a provider's account linked | a notice naming what was added |

A sign-in, invitation or confirmation email carries a link and a short code: the person opens the
link, or types the code on the page they asked from. Both expire (`EMAIL_TOKEN_TTL`, five minutes
by default) and work once. The text names the app first and ends with "You got this email from
Acme Gym."; the HTML is a single card of tables with inline styles, so mail clients show it
alike, with the brand colour as its accent.

The wording is roux's, in English. There is no way yet to change it, or to send in another
language.

## Delivery

| Variable | What it is |
| --- | --- |
| `SMTP_ADDR` | The mail server, `host:port` (default `localhost:1025`: Mailpit, from `compose.yaml`). |
| `MAIL_FROM` | The address every email is sent from (default `no-reply@localhost`). |
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
