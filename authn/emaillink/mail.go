package emaillink

import (
	"bytes"
	"context"
	"embed"
	"errors"
	"fmt"
	htmltemplate "html/template"
	"io/fs"
	"strings"
	texttemplate "text/template"
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

// The emails roux sends, by name. Each is two files: <name>.txt (the subject, as a
// {{define "subject"}}, then the text body) and <name>.html (a {{define "body"}} placed in
// layout.html). The names are a contract: an app overrides an email by shipping a file of the
// same name in Config.Templates.
const (
	emailSignIn              = "sign-in"
	emailInvitation          = "invitation"
	emailAddressConfirmation = "address-confirmation"
	emailPasskeyAdded        = "passkey-added"
	emailAccountLinked       = "account-linked"
	emailAPIKeyMade          = "api-key-made"
	emailAddressAdded        = "address-added"
	emailAddressChanged      = "address-changed"
	layoutFile               = "layout.html"
)

var emailNames = []string{emailSignIn, emailInvitation, emailAddressConfirmation, emailPasskeyAdded,
	emailAccountLinked, emailAPIKeyMade, emailAddressAdded, emailAddressChanged}

//go:embed templates
var stockFiles embed.FS

// mailData is what every template is given. App and BrandColor are always set; the rest only in
// the emails that use them (documented on Config.Templates).
type mailData struct {
	App        string
	BrandColor string
	Link       string // sign-in, invitation, address-confirmation
	Code       string // the typed code, formatted: K7F-2QM
	ExpiresIn  string // "5 minutes"
	Change     bool   // address-confirmation: the address replaces the old one
	Passkey    string // passkey-added: the passkey's name
	Provider   string // account-linked: the provider's name, such as "google"
	APIKey     string // api-key-made: the key's name
	Address    string // address-added, address-changed: the other address, masked (n***@example.com)
}

// emailTemplate is one email's parsed templates.
type emailTemplate struct {
	text *texttemplate.Template
	html *htmltemplate.Template
}

// mailTemplates is every email, parsed and checked once at New.
type mailTemplates map[string]emailTemplate

// loadTemplates parses each email from the app's files where it has one, roux's otherwise, and
// renders each with sample data, so a template that cannot render stops startup naming its file.
func loadTemplates(own fs.FS) (mailTemplates, error) {
	stock, err := fs.Sub(stockFiles, "templates")
	if err != nil {
		return nil, err
	}
	read := func(file string) (string, error) {
		if own != nil {
			b, err := fs.ReadFile(own, file)
			if err == nil {
				return string(b), nil
			}
			if !errors.Is(err, fs.ErrNotExist) {
				return "", fmt.Errorf("emaillink: reading %s from Templates: %w", file, err)
			}
		}
		b, err := fs.ReadFile(stock, file)
		return string(b), err
	}
	if err := unknownFiles(own); err != nil {
		return nil, err
	}
	layout, err := read(layoutFile)
	if err != nil {
		return nil, err
	}
	out := mailTemplates{}
	for _, name := range emailNames {
		t, err := parseEmail(name, layout, read)
		if err != nil {
			return nil, err
		}
		if _, err := t.render("check@example.test", sampleData); err != nil {
			return nil, fmt.Errorf("emaillink: the %s email does not render: %w", name, err)
		}
		out[name] = t
	}
	return out, nil
}

// unknownFiles refuses a template file that is no email roux sends (a misspelled name would
// otherwise be ignored and roux's wording sent). Files of other kinds, a README, are left alone.
func unknownFiles(own fs.FS) error {
	if own == nil {
		return nil
	}
	entries, err := fs.ReadDir(own, ".")
	if err != nil {
		return fmt.Errorf("emaillink: reading Templates: %w", err)
	}
	known := map[string]bool{layoutFile: true}
	for _, name := range emailNames {
		known[name+".txt"], known[name+".html"] = true, true
	}
	for _, e := range entries {
		n := e.Name()
		if (strings.HasSuffix(n, ".txt") || strings.HasSuffix(n, ".html")) && !known[n] {
			return fmt.Errorf("emaillink: Templates has %s, which is no email roux sends: name it after one of %s (.txt or .html), or layout.html",
				n, strings.Join(emailNames, ", "))
		}
	}
	return nil
}

func parseEmail(name, layout string, read func(string) (string, error)) (emailTemplate, error) {
	txt, err := read(name + ".txt")
	if err != nil {
		return emailTemplate{}, err
	}
	page, err := read(name + ".html")
	if err != nil {
		return emailTemplate{}, err
	}
	text, err := texttemplate.New(name + ".txt").Option("missingkey=error").Parse(txt)
	if err != nil {
		return emailTemplate{}, fmt.Errorf("emaillink: %w", err)
	}
	if text.Lookup("subject") == nil {
		return emailTemplate{}, fmt.Errorf(`emaillink: %s.txt has no subject: start it with {{define "subject"}}...{{end}}`, name)
	}
	html, err := htmltemplate.New(layoutFile).Option("missingkey=error").Parse(layout)
	if err == nil {
		_, err = html.New(name + ".html").Parse(page)
	}
	if err != nil {
		return emailTemplate{}, fmt.Errorf("emaillink: %w", err)
	}
	if html.Lookup("body") == nil {
		return emailTemplate{}, fmt.Errorf(`emaillink: %s.html has no body: write it as {{define "body"}}...{{end}}`, name)
	}
	return emailTemplate{text: text, html: html}, nil
}

// sampleData renders each template once at startup, every field set.
var sampleData = mailData{
	App: "App", BrandColor: "#3b82f6", Link: "http://localhost/signin/link#token=t", Code: "K7F-2QM",
	ExpiresIn: "5 minutes", Passkey: "Phone", Provider: "google", APIKey: "CI", Address: "n***@example.com",
}

func (t emailTemplate) render(to string, d mailData) (Message, error) {
	var subject, text, page bytes.Buffer
	if err := t.text.ExecuteTemplate(&subject, "subject", d); err != nil {
		return Message{}, err
	}
	if err := t.text.Execute(&text, d); err != nil {
		return Message{}, err
	}
	if err := t.html.ExecuteTemplate(&page, layoutFile, d); err != nil {
		return Message{}, err
	}
	// A subject is one header line: a line break in it would end the header.
	oneLine := strings.Join(strings.Fields(subject.String()), " ")
	return Message{To: to, Subject: oneLine, Text: text.String(), HTML: page.String()}, nil
}

// mail renders the named email for this method's app.
func (m *Method) mail(name, to string, d mailData) (Message, error) {
	d.App, d.BrandColor = m.cfg.AppName, m.cfg.BrandColor
	return m.templates[name].render(to, d)
}

// notify renders and sends a notice; a failure is returned for the caller to log.
func (m *Method) notify(ctx context.Context, name, to string, d mailData) error {
	msg, err := m.mail(name, to, d)
	if err != nil {
		return err
	}
	return m.cfg.Sender.Send(ctx, msg)
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
