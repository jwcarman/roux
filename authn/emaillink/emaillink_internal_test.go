package emaillink

import (
	"bufio"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io"
	"io/fs"
	"math/big"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/google/uuid"
)

func TestNormalizeCode(t *testing.T) {
	cases := []struct {
		in     string
		length int
		want   string
		ok     bool
	}{
		{"K7F2QM", 6, "K7F2QM", true},
		{"K7F-2QM", 6, "K7F2QM", true},
		{"k7f 2qm", 6, "K7F2QM", true},
		{"  k7f--2qm  ", 6, "K7F2QM", true},
		{"o0il1L", 6, "001111", true}, // O reads as 0; I and L read as 1
		{"K7F2Q", 6, "", false},       // too short
		{"K7F2QMX", 6, "", false},     // too long
		{"K7F2QU", 6, "", false},      // U is not in the alphabet
		{"K7F2Q!", 6, "", false},
		{"K7F2QÉ", 6, "", false}, // non-ASCII
		{"", 6, "", false},
		{strings.Repeat("A", 65), 6, "", false}, // over the raw length cap
		{"ABCD-EFGH", 8, "ABCDEFGH", true},
	}
	for _, c := range cases {
		got, ok := normalizeCode(c.in, c.length)
		if got != c.want || ok != c.ok {
			t.Errorf("normalizeCode(%q, %d) = %q, %v; want %q, %v", c.in, c.length, got, ok, c.want, c.ok)
		}
	}
}

func TestFormatCode(t *testing.T) {
	for in, want := range map[string]string{"K7F2QM": "K7F-2QM", "ABCDEFGH": "ABCD-EFGH", "ABCDEFG": "ABCD-EFG"} {
		if got := formatCode(in); got != want {
			t.Errorf("formatCode(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestNewCodeIsUniformAndInTheAlphabet(t *testing.T) {
	const n = 64000
	counts := map[byte]int{}
	for i := 0; i < n/8; i++ {
		code := newCode(8)
		if len(code) != 8 {
			t.Fatalf("length %d", len(code))
		}
		if _, ok := normalizeCode(code, 8); !ok {
			t.Fatalf("code %q does not survive its own normalization", code)
		}
		for j := 0; j < len(code); j++ {
			counts[code[j]]++
		}
	}
	if len(counts) != 32 {
		t.Fatalf("saw %d distinct characters, want 32", len(counts))
	}
	// 2000 expected each (sd ~44): a bias would show far outside this band.
	for c, k := range counts {
		if k < 1700 || k > 2300 {
			t.Errorf("character %q appeared %d times of %d, expected about 2000", c, k, n)
		}
	}
}

func TestNewTokenIsLongURLSafeAndUnique(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 1000; i++ {
		tok := newToken()
		if len(tok) != 43 || strings.ContainsAny(tok, "+/=#&? ") {
			t.Fatalf("token %q: want 43 URL-safe characters", tok)
		}
		if seen[tok] {
			t.Fatal("duplicate token")
		}
		seen[tok] = true
	}
}

func TestHasherBindsSecretCredentialAndCode(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	h := hasher{key: []byte(strings.Repeat("s", 32))}
	base := h.hash(a, "K7F2QM")
	if len(base) != 64 || base != h.hash(a, "K7F2QM") {
		t.Fatalf("hash %q should be 64 hex chars and deterministic", base)
	}
	if base == h.hash(b, "K7F2QM") {
		t.Error("the credential id must be part of the hash")
	}
	if base == h.hash(a, "K7F2QN") {
		t.Error("the code must be part of the hash")
	}
	if base == (hasher{key: []byte(strings.Repeat("t", 32))}).hash(a, "K7F2QM") {
		t.Error("the secret must be part of the hash")
	}
}

func TestLooksLikeAnAddress(t *testing.T) {
	good := []string{"a@b.co", "User.Name+tag@Example.com", "  padded@example.com  ", "trailing@example.com\n"} // ends are trimmed
	bad := []string{
		"", "a", "a@", "@b.co", "a b@c.d", "Name <a@b.co>", "a@b.co, c@d.ef", "a@b.co;c@d.ef",
		"a@b.co\nBcc: x@y.z", "a@b.co\r\nBcc: x@y.z", "<a@b.co>", strings.Repeat("a", 320) + "@b.co",
	}
	for _, s := range good {
		if !looksLikeAnAddress(s) {
			t.Errorf("%q should be accepted", s)
		}
	}
	for _, s := range bad {
		if looksLikeAnAddress(s) {
			t.Errorf("%q should be refused", s)
		}
	}
	if normalizeAddress("  User@Example.COM ") != "user@example.com" {
		t.Error("addresses are trimmed and lower-cased")
	}
}

func okSender() Sender {
	return SenderFunc(func(context.Context, Message) error { return nil })
}

func TestConfigValidation(t *testing.T) {
	good := Config{LinkBaseURL: "http://localhost:8080/signin/link", CodeSecret: strings.Repeat("x", 32), Sender: okSender()}
	if _, err := New(good); err != nil {
		t.Fatalf("a minimal config must be accepted: %v", err)
	}

	cases := []struct {
		name   string
		mutate func(*Config)
		want   string
	}{
		{"no link base url", func(c *Config) { c.LinkBaseURL = " " }, "LinkBaseURL is required"},
		{"link base url with fragment", func(c *Config) { c.LinkBaseURL = "http://x/y#z" }, "no query or fragment"},
		{"code length", func(c *Config) { c.CodeLength = 5 }, "CodeLength must be at least 6"},
		{"max attempts", func(c *Config) { c.CodeMaxAttempts = -1 }, "CodeMaxAttempts must be at least 1"},
		{"no secret", func(c *Config) { c.CodeSecret = "" }, "CodeSecret is required"},
		{"short secret", func(c *Config) { c.CodeSecret = "short" }, "at least 32 characters"},
		{"unresolved placeholder", func(c *Config) { c.CodeSecret = "${CODE_SECRET}" }, "unresolved placeholder"},
		{"resend longer than ttl", func(c *Config) { c.ResendInterval = 10 * time.Minute }, "must not be longer than TokenTTL"},
		{"no sender", func(c *Config) { c.Sender = nil }, "Sender is required"},
	}
	for _, c := range cases {
		cfg := good
		c.mutate(&cfg)
		if _, err := New(cfg); err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: err = %v, want containing %q", c.name, err, c.want)
		}
	}

	// Defaults are roux's.
	m, _ := New(good)
	if m.cfg.CodeLength != 6 || m.cfg.CodeMaxAttempts != 5 || m.cfg.TokenTTL != 5*time.Minute || m.cfg.ResendInterval != time.Minute {
		t.Errorf("defaults: %+v", m.cfg)
	}
	// A logged config must not leak the secret.
	if s := fmt.Sprintf("%v %+v %s", m.cfg, m.cfg, m.cfg); strings.Contains(s, strings.Repeat("x", 32)) {
		t.Errorf("config printed its secret: %s", s)
	}
}

func TestExpiresIn(t *testing.T) {
	for d, want := range map[time.Duration]string{
		5 * time.Minute: "5 minutes", time.Minute: "1 minute", 90 * time.Second: "2 minutes",
		30 * time.Second: "30 seconds", time.Second: "1 second",
	} {
		if got := expiresIn(d); got != want {
			t.Errorf("expiresIn(%s) = %q, want %q", d, got, want)
		}
	}
}

func TestSignInMessage(t *testing.T) {
	m := stock(t, emailSignIn, "ada@example.com", mailData{App: "Acme Gym", BrandColor: "#3b82f6",
		Link: "http://x/signin/link#token=abc", Code: "K7F-2QM", ExpiresIn: expiresIn(5 * time.Minute)})
	if m.To != "ada@example.com" || m.Subject != "Sign in to Acme Gym" {
		t.Fatalf("%+v", m)
	}
	for _, want := range []string{"Acme Gym", "Sign in: http://x/signin/link#token=abc", "Or enter this code: K7F-2QM", "expire in 5 minutes and work once"} {
		if !strings.Contains(m.Text, want) {
			t.Errorf("text lacks %q:\n%s", want, m.Text)
		}
	}
	for _, want := range []string{"Acme Gym", `href="http://x/signin/link#token=abc"`, "K7F-2QM", "5 minutes"} {
		if !strings.Contains(m.HTML, want) {
			t.Errorf("html lacks %q", want)
		}
	}

	// Hostile values cannot break out of the HTML.
	h := stock(t, emailSignIn, "a@b.co", mailData{App: `<script>alert(1)</script>`, BrandColor: `red"onload="x`,
		Link: `http://x/"><script>alert(2)</script>`, Code: "K7F-2QM", ExpiresIn: "1 minute"})
	if strings.Contains(h.HTML, "<script>") || strings.Contains(h.HTML, `"onload=`) {
		t.Errorf("html injection survived:\n%s", h.HTML)
	}
}

// stock renders one of roux's own emails.
func stock(t *testing.T, name, to string, d mailData) Message {
	t.Helper()
	ts, err := loadTemplates(nil)
	if err != nil {
		t.Fatal(err)
	}
	m, err := ts[name].render(to, d)
	if err != nil {
		t.Fatal(err)
	}
	return m
}

func TestAnAppsTemplateReplacesRouxsByName(t *testing.T) {
	own := fstest.MapFS{
		"sign-in.txt":  {Data: []byte("{{define \"subject\"}}Your link for\n {{.App}}{{end}}Go: {{.Link}}\n")},
		"sign-in.html": {Data: []byte(`{{define "body"}}<p>Go to <a href="{{.Link}}">{{.App}}</a></p>{{end}}`)},
	}
	ts, err := loadTemplates(own)
	if err != nil {
		t.Fatal(err)
	}
	m, err := ts[emailSignIn].render("a@b.co", mailData{App: "Tea & Co", BrandColor: "#000000", Link: "http://x/l#token=t"})
	if err != nil {
		t.Fatal(err)
	}
	if m.Subject != "Your link for Tea & Co" || m.Text != "Go: http://x/l#token=t\n" {
		t.Errorf("%q / %q", m.Subject, m.Text)
	}
	if !strings.Contains(m.HTML, `<p>Go to <a href="http://x/l#token=t">Tea &amp; Co</a></p>`) || !strings.Contains(m.HTML, "<!DOCTYPE html>") {
		t.Errorf("the app's body, in roux's layout, escaped:\n%s", m.HTML)
	}
	inv, err := ts[emailInvitation].render("a@b.co", mailData{App: "Tea & Co"})
	if err != nil || inv.Subject != "You've been invited to Tea & Co" {
		t.Errorf("an email the app does not override stays roux's: %q %v", inv.Subject, err)
	}
}

func TestATemplateThatCannotRenderStopsStartup(t *testing.T) {
	for _, tc := range []struct {
		files fs.FS
		want  string
	}{
		{fstest.MapFS{"invitation.txt": {Data: []byte("Hello {{.App}}")}}, "invitation.txt has no subject"},
		{fstest.MapFS{"invitation.html": {Data: []byte("<p>{{.App}}</p>")}}, "invitation.html has no body"},
		{fstest.MapFS{"passkey-added.txt": {Data: []byte(`{{define "subject"}}x{{end}}{{.Passcode}}`)}}, "the passkey-added email does not render"},
		{fstest.MapFS{"layout.html": {Data: []byte("{{.App")}}, "layout.html"},
		{fstest.MapFS{"sign-in.txt": {Data: []byte("{{if}}")}}, "sign-in.txt"},
		{fstest.MapFS{"sign-in.html": {Data: []byte("{{end}}")}}, "sign-in.html"},
		{fstest.MapFS{"sign-in.txt": {Mode: fs.ModeDir}}, "reading sign-in.txt from Templates"},
		{fstest.MapFS{"sign-in.html": {Mode: fs.ModeDir}}, "reading sign-in.html from Templates"},
		{fstest.MapFS{"layout.html": {Mode: fs.ModeDir}}, "reading layout.html from Templates"},
		{fstest.MapFS{"signin.txt": {Data: []byte("x")}, "README.md": {Data: []byte("x")}}, "Templates has signin.txt, which is no email roux sends"},
		{badDir{}, "reading Templates"},
	} {
		if _, err := loadTemplates(tc.files); err == nil || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("want an error naming %q, got %v", tc.want, err)
		}
	}
}

func TestATemplateThatFailsOnSomeDataIsAnErrorNotAMessage(t *testing.T) {
	fails := "{{if .Change}}{{.Change.Nope}}{{end}}"
	for _, own := range []fstest.MapFS{
		{"address-confirmation.txt": {Data: []byte(`{{define "subject"}}` + fails + `{{end}}x`)}},
		{"address-confirmation.txt": {Data: []byte(`{{define "subject"}}x{{end}}` + fails)}},
		{"address-confirmation.html": {Data: []byte(`{{define "body"}}` + fails + `{{end}}`)}},
	} {
		ts, err := loadTemplates(own)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := ts[emailAddressConfirmation].render("a@b.co", mailData{Change: true}); err == nil {
			t.Errorf("%v rendered", own)
		}
		m := &Method{templates: ts}
		if err := m.notify(t.Context(), emailAddressConfirmation, "a@b.co", mailData{Change: true}); err == nil {
			t.Errorf("%v was sent", own)
		}
	}
}

// badDir is a file system whose top directory cannot be read.
type badDir struct{}

func (badDir) Open(string) (fs.File, error) { return nil, fs.ErrPermission }

func TestEveryStockEmailRendersCleanly(t *testing.T) {
	ts, err := loadTemplates(nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, change := range []bool{false, true} {
		for _, name := range emailNames {
			d := sampleData
			d.Change = change
			m, err := ts[name].render("a@b.co", d)
			if err != nil {
				t.Fatal(name, err)
			}
			for _, part := range []string{m.Subject, m.Text, m.HTML} {
				// %!( was a format string's missing verb, shown in the address confirmation email.
				if strings.Contains(part, "%!") || strings.Contains(part, "<no value>") || strings.TrimSpace(part) == "" {
					t.Errorf("%s (change %v):\n%s", name, change, part)
				}
			}
		}
	}
}

func TestSMTPBuildIsMultipartAlternativeAndSafe(t *testing.T) {
	s := &SMTPSender{Addr: "localhost:1025", From: "no-reply@example.com"}
	msg := Message{To: "ada@example.com", Subject: "Sign in to Café Gym", Text: "plain ✓", HTML: "<p>html ✓</p>"}
	raw, err := s.build(msg)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := mail.ReadMessage(strings.NewReader(string(raw)))
	if err != nil {
		t.Fatal(err)
	}
	if got := parsed.Header.Get("To"); !strings.Contains(got, "ada@example.com") {
		t.Errorf("To = %q", got)
	}
	subject, _ := new(mime.WordDecoder).DecodeHeader(parsed.Header.Get("Subject"))
	if subject != "Sign in to Café Gym" {
		t.Errorf("Subject = %q", subject)
	}
	if parsed.Header.Get("Message-ID") == "" || parsed.Header.Get("Date") == "" || parsed.Header.Get("MIME-Version") != "1.0" {
		t.Errorf("headers: %v", parsed.Header)
	}
	mt, params, err := mime.ParseMediaType(parsed.Header.Get("Content-Type"))
	if err != nil || mt != "multipart/alternative" {
		t.Fatalf("Content-Type = %q %v", mt, err)
	}
	mr := multipart.NewReader(parsed.Body, params["boundary"])
	var types, bodies []string
	for {
		p, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		decoded, _ := io.ReadAll(quotedprintable.NewReader(p))
		pt, _, _ := mime.ParseMediaType(p.Header.Get("Content-Type"))
		types, bodies = append(types, pt), append(bodies, string(decoded))
	}
	if strings.Join(types, ",") != "text/plain,text/html" || bodies[0] != "plain ✓" || bodies[1] != "<p>html ✓</p>" {
		t.Errorf("parts: %v %q", types, bodies)
	}

	// Header injection is refused.
	for _, bad := range []Message{
		{To: "a@b.co\r\nBcc: x@y.z", Subject: "s", Text: "t"},
		{To: "a@b.co", Subject: "s\r\nBcc: x@y.z", Text: "t"},
		{To: "not an address", Subject: "s", Text: "t"},
	} {
		if _, err := s.build(bad); err == nil {
			t.Errorf("message %+v should be refused", bad)
		}
	}
	if _, err := (&SMTPSender{From: "a@b.co\r\nBcc: x"}).build(Message{To: "a@b.co", Subject: "s"}); err == nil {
		t.Error("a From with a line break should be refused")
	}
}

// fakeSMTP is just enough of an SMTP server to take one message.
func fakeSMTP(t *testing.T) (addr string, got chan string) {
	t.Helper()
	return fakeSMTPWith(t, fakeServer{})
}

// fakeSMTPOn is fakeSMTP on a listener of the test's, such as a TLS one.
func fakeSMTPOn(t *testing.T, ln net.Listener) (addr string, got chan string) {
	t.Helper()
	return fakeSMTPWith(t, fakeServer{listener: ln})
}

// fakeServer is how the fake SMTP server behaves.
type fakeServer struct {
	listener net.Listener      // default: plain TCP on a free port
	startTLS *tls.Config       // offers STARTTLS, upgrading with this
	refuse   map[string]string // a command (by its first word) answered with this reply
}

func fakeSMTPWith(t *testing.T, f fakeServer) (addr string, got chan string) {
	t.Helper()
	ln := f.listener
	if ln == nil {
		var err error
		if ln, err = net.Listen("tcp", "127.0.0.1:0"); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() { _ = ln.Close() })
	got = make(chan string, 1)
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		c := &fakeConn{fakeServer: f, conn: conn, r: bufio.NewReader(conn)}
		defer func() { _ = c.conn.Close() }()
		defer func() { got <- c.log.String() }()
		c.reply("220 fake ESMTP")
		for {
			line, err := c.r.ReadString('\n')
			if err != nil || !c.answer(strings.TrimRight(line, "\r\n")) {
				return
			}
		}
	}()
	return ln.Addr().String(), got
}

// fakeConn is one conversation with the fake SMTP server, logging what the test asserts on.
type fakeConn struct {
	fakeServer
	conn net.Conn
	r    *bufio.Reader
	log  strings.Builder
}

func (c *fakeConn) reply(s string) { _, _ = fmt.Fprintf(c.conn, "%s\r\n", s) }

// answer replies to one command line; false ends the conversation.
func (c *fakeConn) answer(line string) bool {
	cmd := strings.ToUpper(line)
	if answer, ok := c.refuse[strings.Fields(cmd + " ")[0]]; ok {
		c.log.WriteString("refused " + line + "\n")
		c.reply(answer)
		return true
	}
	switch {
	case strings.HasPrefix(cmd, "EHLO"), strings.HasPrefix(cmd, "HELO"):
		c.hello()
	case cmd == "STARTTLS":
		return c.upgrade()
	case strings.HasPrefix(cmd, "AUTH"):
		c.log.WriteString("AUTH\n")
		c.reply("235 accepted")
	case strings.HasPrefix(cmd, "MAIL FROM"), strings.HasPrefix(cmd, "RCPT TO"):
		c.log.WriteString(line + "\n")
		c.reply("250 ok")
	case cmd == "DATA":
		c.data()
	case cmd == "QUIT":
		c.reply("221 bye")
		return false
	default:
		c.reply("250 ok")
	}
	return true
}

// hello offers STARTTLS until the connection is secured, when the server has it.
func (c *fakeConn) hello() {
	if _, secured := c.conn.(*tls.Conn); c.startTLS != nil && !secured {
		c.reply("250-fake")
		c.reply("250 STARTTLS")
		return
	}
	c.reply("250 fake")
}

func (c *fakeConn) upgrade() bool {
	c.reply("220 go ahead")
	secured := tls.Server(c.conn, c.startTLS)
	if err := secured.Handshake(); err != nil {
		c.log.WriteString("handshake failed\n")
		return false
	}
	c.log.WriteString("STARTTLS\n")
	c.conn, c.r = secured, bufio.NewReader(secured)
	return true
}

// data logs the message up to its closing dot.
func (c *fakeConn) data() {
	c.reply("354 go ahead")
	for {
		l, err := c.r.ReadString('\n')
		if err != nil || l == ".\r\n" {
			break
		}
		c.log.WriteString(l)
	}
	c.reply("250 queued")
}

func TestSMTPSendSpeaksSMTP(t *testing.T) {
	addr, got := fakeSMTP(t)
	s := &SMTPSender{Addr: addr, From: "no-reply@example.com", Timeout: 5 * time.Second}
	err := s.Send(context.Background(), Message{To: "ada@example.com", Subject: "Hi", Text: "hello", HTML: "<p>hello</p>"})
	if err != nil {
		t.Fatal(err)
	}
	select {
	case log := <-got:
		for _, want := range []string{"MAIL FROM:<no-reply@example.com>", "RCPT TO:<ada@example.com>", "Subject: Hi", "multipart/alternative"} {
			if !strings.Contains(log, want) {
				t.Errorf("server saw no %q:\n%s", want, log)
			}
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the server never finished the conversation")
	}

	// A server off this machine that offers no STARTTLS is refused, unless the network is trusted.
	if !loopback("::1") || loopback("mail.example.com") || loopback("10.0.0.5") {
		t.Error("loopback")
	}

	// A server that is not there is an error, not a hang.
	dead := &SMTPSender{Addr: "127.0.0.1:1", From: "a@b.co", Timeout: time.Second}
	if err := dead.Send(context.Background(), Message{To: "a@b.co", Subject: "s", Text: "t"}); err == nil {
		t.Error("sending to nothing must fail")
	}
}

// A relay elsewhere: the fake server, reached as if it were mail.example.com.
func remote(addr string, allow bool) *SMTPSender {
	return &SMTPSender{
		Addr: "mail.example.com:25", From: "no-reply@example.com", Timeout: 5 * time.Second, AllowPlaintext: allow,
		dial: func(ctx context.Context, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, "tcp", addr)
		},
	}
}

func TestSMTPRefusesPlainTextToAServerElsewhere(t *testing.T) {
	addr, _ := fakeSMTP(t)
	err := remote(addr, false).Send(context.Background(), Message{To: "ada@example.com", Subject: "Hi", Text: "hello"})
	if err == nil || !strings.Contains(err.Error(), "offers no STARTTLS") {
		t.Fatalf("%v", err)
	}
}

func TestSMTPSendsPlainTextToATrustedRelay(t *testing.T) {
	addr, got := fakeSMTP(t)
	if err := remote(addr, true).Send(context.Background(), Message{To: "ada@example.com", Subject: "Hi", Text: "hello"}); err != nil {
		t.Fatal(err)
	}
	select {
	case log := <-got:
		if !strings.Contains(log, "RCPT TO:<ada@example.com>") {
			t.Errorf("%s", log)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the server never finished the conversation")
	}
}

// selfSigned is a certificate for host, and a pool that trusts it.
func selfSigned(t *testing.T, host string) (tls.Certificate, *x509.CertPool) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		DNSNames:     []string{host},
		NotBefore:    time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC),
		NotAfter:     time.Date(2100, 1, 1, 0, 0, 0, 0, time.UTC),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatal(err)
	}
	roots := x509.NewCertPool()
	roots.AddCert(cert)
	return tls.Certificate{Certificate: [][]byte{der}, PrivateKey: key}, roots
}

func TestSMTPSpeaksTLSFromTheFirstByteOnPort465(t *testing.T) {
	cert, roots := selfSigned(t, "mail.example.com")
	ln, err := tls.Listen("tcp", "127.0.0.1:0", &tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12})
	if err != nil {
		t.Fatal(err)
	}
	addr, got := fakeSMTPOn(t, ln)
	s := &SMTPSender{
		Addr: "mail.example.com:465", From: "no-reply@example.com", Username: "u", Password: "p",
		Timeout: 5 * time.Second, roots: roots,
		dial: func(ctx context.Context, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, "tcp", addr)
		},
	}
	if err := s.Send(context.Background(), Message{To: "ada@example.com", Subject: "Hi", Text: "hello"}); err != nil {
		t.Fatal(err)
	}
	select {
	case log := <-got:
		if !strings.Contains(log, "AUTH\n") || !strings.Contains(log, "RCPT TO:<ada@example.com>") {
			t.Errorf("signed in and sent over TLS: %s", log)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the server never finished the conversation")
	}
}

func TestSMTPOnPort465RefusesACertificateItCannotTrust(t *testing.T) {
	cert, _ := selfSigned(t, "mail.example.com")
	ln, err := tls.Listen("tcp", "127.0.0.1:0", &tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12})
	if err != nil {
		t.Fatal(err)
	}
	addr, _ := fakeSMTPOn(t, ln)
	s := &SMTPSender{
		Addr: "mail.example.com:465", From: "no-reply@example.com", Timeout: 5 * time.Second,
		dial: func(ctx context.Context, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, "tcp", addr)
		},
	}
	err = s.Send(context.Background(), Message{To: "ada@example.com", Subject: "Hi", Text: "hello"})
	if err == nil || !strings.Contains(err.Error(), "smtp: TLS on port 465:") {
		t.Fatalf("%v", err)
	}
}

// toFake is a sender for host:port that reaches the fake server at addr.
func toFake(hostPort, addr string, roots *x509.CertPool) *SMTPSender {
	return &SMTPSender{
		Addr: hostPort, From: "no-reply@example.com", Username: "u", Password: "p",
		Timeout: 5 * time.Second, roots: roots,
		dial: func(ctx context.Context, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, "tcp", addr)
		},
	}
}

func TestSMTPUpgradesWithSTARTTLSBeforeSigningIn(t *testing.T) {
	cert, roots := selfSigned(t, "mail.example.com")
	addr, got := fakeSMTPWith(t, fakeServer{startTLS: &tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12}})
	if err := toFake("mail.example.com:587", addr, roots).Send(context.Background(), Message{To: "ada@example.com", Subject: "Hi", Text: "hello"}); err != nil {
		t.Fatal(err)
	}
	log := <-got
	tlsAt, authAt := strings.Index(log, "STARTTLS\n"), strings.Index(log, "AUTH\n")
	if tlsAt < 0 || authAt < tlsAt || !strings.Contains(log, "RCPT TO:<ada@example.com>") {
		t.Errorf("the login went before the upgrade, or never:\n%s", log)
	}
}

func TestSMTPRefusesASTARTTLSCertificateItCannotTrust(t *testing.T) {
	cert, _ := selfSigned(t, "mail.example.com")
	addr, _ := fakeSMTPWith(t, fakeServer{startTLS: &tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12}})
	err := toFake("mail.example.com:587", addr, nil).Send(context.Background(), Message{To: "ada@example.com", Subject: "Hi", Text: "hello"})
	if err == nil || !strings.Contains(err.Error(), "smtp: starttls:") {
		t.Fatalf("%v", err)
	}
}

func TestSMTPSaysWhichStepTheServerRefused(t *testing.T) {
	for command, want := range map[string]string{
		"AUTH": "smtp: auth: the server refused SMTP_USERNAME and SMTP_PASSWORD: 535 \"5.7.8 refused\"",
		"MAIL": "smtp: MAIL FROM: 535 \"5.7.8 refused\"",
		"RCPT": "smtp: RCPT TO: 535 \"5.7.8 refused\"",
		"DATA": "smtp: DATA: 535 \"5.7.8 refused\"",
	} {
		addr, _ := fakeSMTPWith(t, fakeServer{refuse: map[string]string{command: "535 5.7.8 refused"}})
		s := &SMTPSender{Addr: addr, From: "no-reply@example.com", Username: "u", Password: "p", Timeout: 5 * time.Second}
		err := s.Send(context.Background(), Message{To: "ada@example.com", Subject: "Hi", Text: "hello"})
		if err == nil || err.Error() != want {
			t.Errorf("%s: got %v, want %q", command, err, want)
		}
	}
}

func TestSMTPRefusesABadAddressOrSender(t *testing.T) {
	m := Message{To: "ada@example.com", Subject: "Hi", Text: "hello"}
	if err := (&SMTPSender{Addr: "no-port", From: "a@b.co"}).Send(context.Background(), m); err == nil ||
		!strings.Contains(err.Error(), `smtp: bad address "no-port"`) {
		t.Errorf("address: %v", err)
	}
	if err := (&SMTPSender{Addr: "localhost:1025", From: "not an address"}).Send(context.Background(), m); err == nil ||
		!strings.Contains(err.Error(), `smtp: bad From "not an address"`) {
		t.Errorf("sender: %v", err)
	}
	if !loopback("localhost") || !loopback("127.0.0.1") {
		t.Error("loopback")
	}
}

func TestCheckSignsInAndSendsNothing(t *testing.T) {
	cert, roots := selfSigned(t, "mail.example.com")
	addr, got := fakeSMTPWith(t, fakeServer{startTLS: &tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12}})
	if err := toFake("mail.example.com:587", addr, roots).Check(context.Background()); err != nil {
		t.Fatal(err)
	}
	log := <-got
	if !strings.Contains(log, "STARTTLS\n") || !strings.Contains(log, "AUTH\n") || strings.Contains(log, "MAIL") {
		t.Errorf("want an upgrade and a login, and no message:\n%s", log)
	}
}

func TestCheckNamesWhatIsWrong(t *testing.T) {
	addr, _ := fakeSMTPWith(t, fakeServer{refuse: map[string]string{"AUTH": "535 5.7.8 refused"}})
	s := &SMTPSender{Addr: addr, From: "no-reply@example.com", Username: "u", Password: "p", Timeout: 5 * time.Second}
	if err := s.Check(context.Background()); err == nil || !strings.Contains(err.Error(), "SMTP_USERNAME and SMTP_PASSWORD") {
		t.Errorf("login: %v", err)
	}

	addr, _ = fakeSMTPWith(t, fakeServer{})
	err := toFake("mail.example.com:25", addr, nil).Check(context.Background())
	if err == nil || !strings.Contains(err.Error(), "SMTP_ALLOW_PLAINTEXT=true for a relay") || strings.Contains(err.Error(), "AllowPlaintext") {
		t.Errorf("plaintext: %v", err)
	}

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	closed := ln.Addr().String()
	_ = ln.Close()
	err = (&SMTPSender{Addr: closed, From: "no-reply@example.com", Timeout: 5 * time.Second}).Check(context.Background())
	if err == nil || !strings.Contains(err.Error(), "smtp: connect to "+closed) {
		t.Errorf("connect: %v", err)
	}
}
