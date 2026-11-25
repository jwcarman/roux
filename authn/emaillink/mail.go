package emaillink

import (
	"context"
	"fmt"
	"html"
	"strings"
	"time"
	"unicode/utf8"
)

// Message is one email to send.
type Message struct {
	To      string
	Subject string
	Text    string
	HTML    string
}

// Sender delivers emails. Rendering and delivery are separate, so what the
// emails say can change without touching how they go out.
type Sender interface {
	Send(ctx context.Context, m Message) error
}

// SenderFunc adapts a function to Sender.
type SenderFunc func(ctx context.Context, m Message) error

func (f SenderFunc) Send(ctx context.Context, m Message) error { return f(ctx, m) }

// expiresIn writes a duration for a person: "5 minutes", "1 minute", "30 seconds".
func expiresIn(d time.Duration) string {
	plural := func(n int, unit string) string {
		if n == 1 {
			return fmt.Sprintf("1 %s", unit)
		}
		return fmt.Sprintf("%d %ss", n, unit)
	}
	if d >= time.Minute {
		return plural(int(d.Round(time.Minute)/time.Minute), "minute")
	}
	return plural(int(d.Round(time.Second)/time.Second), "second")
}

// messageBuilder writes one kind of email that carries a link and a code.
type messageBuilder func(app, brandColor, to, link, formattedCode string, ttl time.Duration) Message

// linkEmail is the shape shared by emails that carry a link and a code; only the
// wording differs. (Hard-coded for now; templates come later.)
type linkEmail struct {
	subject   string                  // "Sign in to {app}"
	textLead  func(app string) string // what comes before the link in the text
	htmlLead  string                  // the sentence above the button, HTML (already escaped)
	button    string                  // the button's label
	ignoreTip string                  // what to do with an email nobody expected
	onceNote  string                  // after "work once", e.g. ", while you are signed in"
}

func (k linkEmail) build(app, brandColor, to, link, formattedCode string, ttl time.Duration) Message {
	valid := expiresIn(ttl)
	text := fmt.Sprintf(`%[1]s

%[2]s %[3]s

Or enter this code: %[4]s

The link and the code expire in %[5]s and work once%[7]s.

%[6]s Never share this code with anyone.

You got this email from %[1]s.
`, app, k.textLead(app), link, formattedCode, valid, k.ignoreTip, k.onceNote)

	a, l, c, v, b := html.EscapeString(app), html.EscapeString(link), html.EscapeString(formattedCode), html.EscapeString(valid), html.EscapeString(brandColor)
	page := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%[1]s</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;">
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:100%%;max-width:480px;background-color:#ffffff;border:1px solid #e4e4e7;border-radius:8px;">
<tr><td style="padding:24px 32px;border-bottom:4px solid %[5]s;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:28px;font-weight:bold;color:#18181b;">%[1]s</td></tr>
<tr><td style="padding:24px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#27272a;">
<p style="margin:0 0 16px 0;">%[6]s</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;"><tr><td style="border-radius:6px;background-color:%[5]s;"><a href="%[2]s" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">%[7]s</a></td></tr></table>
<p style="margin:0 0 16px 0;">Or enter this code:</p>
<p style="margin:0 0 24px 0;padding:16px;background-color:#f4f4f5;border-radius:6px;text-align:center;font-family:'Courier New',Courier,monospace;font-size:28px;line-height:36px;font-weight:bold;letter-spacing:4px;color:#18181b;">%[3]s</p>
<p style="margin:0 0 16px 0;color:#52525b;font-size:14px;line-height:20px;">The link and the code expire in %[4]s and work once%[9]s.</p>
<p style="margin:0 0 16px 0;color:#52525b;font-size:14px;line-height:20px;">%[8]s Never share this code with anyone.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`, a, l, c, v, b, fmt.Sprintf(k.htmlLead, "<strong>"+a+"</strong>"), fmt.Sprintf(k.button, a), html.EscapeString(k.ignoreTip), html.EscapeString(k.onceNote))

	return Message{To: to, Subject: fmt.Sprintf(k.subject, app), Text: text, HTML: page}
}

// signInTo is the button that signs in, and the subject of the sign-in email.
const signInTo = "Sign in to %s"

// signInMessage is the email that carries a sign-in link and code. The wording is roux's.
var signInMessage messageBuilder = linkEmail{
	subject:   signInTo,
	textLead:  func(string) string { return "Sign in:" },
	htmlLead:  "Use the button to sign in to %s.",
	button:    signInTo,
	ignoreTip: "If you didn't ask to sign in, ignore this email.",
}.build

// invitationMessage is the email that invites someone: the same link and code, with an
// invitation's words. The wording is roux's.
var invitationMessage messageBuilder = linkEmail{
	subject:   "You've been invited to %s",
	textLead:  func(app string) string { return "You have been invited to " + app + ". Accept by signing in:" },
	htmlLead:  "You have been invited to %s. Accept by signing in.",
	button:    signInTo,
	ignoreTip: "If you weren't expecting this invitation, ignore this email.",
}.build

// notice is the shape shared by emails that only tell someone something: a lead and a tip,
// both given as already-escaped HTML, and the same words as text.
func notice(app, brandColor, to, subject, text, htmlLead, htmlTip string) Message {
	a, b := html.EscapeString(app), html.EscapeString(brandColor)
	page := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%[1]s</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;">
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:100%%;max-width:480px;background-color:#ffffff;border:1px solid #e4e4e7;border-radius:8px;">
<tr><td style="padding:24px 32px;border-bottom:4px solid %[2]s;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:28px;font-weight:bold;color:#18181b;">%[1]s</td></tr>
<tr><td style="padding:24px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#27272a;">
<p style="margin:0 0 16px 0;">%[3]s</p>
<p style="margin:0 0 16px 0;color:#52525b;font-size:14px;line-height:20px;">%[4]s</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`, a, b, htmlLead, htmlTip)
	return Message{To: to, Subject: subject, Text: text, HTML: page}
}

// passkeyAddedMessage tells the owner that a passkey was added, so that someone who did
// not add one notices. The wording is roux's.
func passkeyAddedMessage(app, brandColor, to, label string) Message {
	text := fmt.Sprintf(`%[1]s

A passkey named "%[2]s" was added to your account. If you did not add it, remove it and secure your account.

You got this email from %[1]s.
`, app, label)
	return notice(app, brandColor, to, "A passkey was added to your "+app+" account", text,
		"A passkey named <strong>"+html.EscapeString(label)+"</strong> was added to your account.",
		"If you did not add it, remove it and secure your account.")
}

// accountLinkedMessage tells the owner that a provider account was linked, so that someone
// who did not link one notices. The wording follows the passkey notice.
func accountLinkedMessage(app, brandColor, to, provider string) Message {
	text := fmt.Sprintf(`%[1]s

A %[2]s account was linked to your account. If you did not link it, unlink it and secure your account.

You got this email from %[1]s.
`, app, provider)
	return notice(app, brandColor, to, "A "+provider+" account was linked to your "+app+" account", text,
		"A <strong>"+html.EscapeString(provider)+"</strong> account was linked to your account.",
		"If you did not link it, unlink it and secure your account.")
}

// apiKeyMadeMessage tells the owner that a secret for an API key was made (a new key or a
// rotation), so that someone who did not make one notices: a key lasts for months.
func apiKeyMadeMessage(app, brandColor, to, name string) Message {
	text := fmt.Sprintf(`%[1]s

A secret for the API key "%[2]s" was made on your account. If you did not make it, revoke it and secure your account.

You got this email from %[1]s.
`, app, name)
	return notice(app, brandColor, to, "An API key was made for your "+app+" account", text,
		"A secret for the API key <strong>"+html.EscapeString(name)+"</strong> was made on your account.",
		"If you did not make it, revoke it and secure your account.")
}

// addressConfirmationMessage asks someone to confirm an address they are adding to their
// account, or making theirs in place of another. The wording is roux's.
func addressConfirmationMessage(change bool) messageBuilder {
	htmlLead := "Add this address to your account."
	textLead := func(string) string { return "Add this address to your account:" }
	if change {
		htmlLead = "Make this your account's email address, in place of the old one."
		textLead = func(string) string { return "Make this your account's email address, in place of the old one:" }
	}
	return linkEmail{
		subject:   "Confirm your email address for %s",
		textLead:  textLead,
		htmlLead:  htmlLead,
		button:    "Confirm this address",
		ignoreTip: "If you didn't ask to add this address, ignore this email and nothing changes.",
		onceNote:  ", while you are signed in",
	}.build
}

// maskAddress hides all but the first character of an address's local part, so the old
// address learns where the account went without being handed the whole address: n***@example.com.
func maskAddress(address string) string {
	first, _ := utf8.DecodeRuneInString(address)
	if at := strings.LastIndex(address, "@"); at > 0 {
		return string(first) + "***" + address[at:]
	}
	return string(first) + "***"
}

// addressChangedMessage tells the old address it was replaced, showing the new one masked:
// it is the address most likely to still belong to the real owner if someone else had their
// session. The wording is roux's.
func addressChangedMessage(app, brandColor, to, newAddress string) Message {
	masked := maskAddress(newAddress)
	text := fmt.Sprintf(`%[1]s

Your account's email address was changed to %[2]s. This address no longer signs in.

If you didn't make this change, someone else may have access to your account: contact the site right away.

You got this email from %[1]s.
`, app, masked)
	a, m, b := html.EscapeString(app), html.EscapeString(masked), html.EscapeString(brandColor)
	page := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%[1]s</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;">
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:100%%;max-width:480px;background-color:#ffffff;border:1px solid #e4e4e7;border-radius:8px;">
<tr><td style="padding:24px 32px;border-bottom:4px solid %[3]s;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:28px;font-weight:bold;color:#18181b;">%[1]s</td></tr>
<tr><td style="padding:24px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#27272a;">
<p style="margin:0 0 16px 0;">Your account's email address was changed to <strong>%[2]s</strong>. This address no longer signs in.</p>
<p style="margin:0 0 16px 0;color:#52525b;font-size:14px;line-height:20px;">If you didn't make this change, someone else may have access to your account: contact the site right away.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`, a, m, b)
	return Message{To: to, Subject: "Your " + app + " email address was changed", Text: text, HTML: page}
}
