# Emails

roux sends these emails in its own words. To use yours, copy roux's file for that email from
`authn/emaillink/templates` in the roux module (`go env GOMODCACHE`, then
`github.com/jwcarman/roux@<version>`) into this folder and change it. A file here replaces roux's
file of the same name; an email you don't copy stays roux's.

| Email | Sent when | Its values, beside `.App` and `.BrandColor` |
| --- | --- | --- |
| `sign-in` | someone asks for a link | `.Link`, `.Code`, `.ExpiresIn` |
| `invitation` | someone is invited | `.Link`, `.Code`, `.ExpiresIn` |
| `address-confirmation` | an address is added or changed | `.Link`, `.Code`, `.ExpiresIn`, `.Change` |
| `passkey-added` | a passkey is added | `.Passkey` |
| `account-linked` | a provider account is linked | `.Provider` |
| `api-key-made` | an API key's secret is made | `.APIKey` |
| `address-added` | to the other addresses, when one is added | `.Address` (masked) |
| `address-changed` | to the old address, when it is replaced | `.Address` (masked) |

Each email is `<name>.txt`, `{{define "subject"}}...{{end}}` then the text body (Go
`text/template`), and `<name>.html`, `{{define "body"}}...{{end}}` placed in `layout.html` (Go
`html/template`, which escapes values). `layout.html` is the card every email's HTML sits in.

The server renders every email when it starts: a file named after no email, a missing subject or
body, or a value that doesn't exist stops startup with the file's name.
