package emaillink

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"strings"
	"testing"
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

	// Defaults are who's.
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
	m := signInMessage("Acme Gym", "#3b82f6", "ada@example.com", "http://x/signin/link#token=abc", "K7F-2QM", 5*time.Minute)
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
	h := signInMessage(`<script>alert(1)</script>`, `red"onload="x`, "a@b.co", `http://x/"><script>alert(2)</script>`, "K7F-2QM", time.Minute)
	if strings.Contains(h.HTML, "<script>") || strings.Contains(h.HTML, `"onload=`) {
		t.Errorf("html injection survived:\n%s", h.HTML)
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
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	got = make(chan string, 1)
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer func() { _ = conn.Close() }()
		r := bufio.NewReader(conn)
		var log strings.Builder
		reply := func(s string) { _, _ = fmt.Fprintf(conn, "%s\r\n", s) }
		reply("220 fake ESMTP")
		for {
			line, err := r.ReadString('\n')
			if err != nil {
				return
			}
			line = strings.TrimRight(line, "\r\n")
			switch cmd := strings.ToUpper(line); {
			case strings.HasPrefix(cmd, "EHLO"), strings.HasPrefix(cmd, "HELO"):
				reply("250 fake")
			case strings.HasPrefix(cmd, "MAIL FROM"), strings.HasPrefix(cmd, "RCPT TO"):
				log.WriteString(line + "\n")
				reply("250 ok")
			case cmd == "DATA":
				reply("354 go ahead")
				for {
					l, err := r.ReadString('\n')
					if err != nil || l == ".\r\n" {
						break
					}
					log.WriteString(l)
				}
				reply("250 queued")
			case cmd == "QUIT":
				reply("221 bye")
				got <- log.String()
				return
			default:
				reply("250 ok")
			}
		}
	}()
	return ln.Addr().String(), got
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
