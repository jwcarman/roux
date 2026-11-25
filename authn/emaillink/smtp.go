package emaillink

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"errors"
	"fmt"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"net/smtp"
	"net/textproto"
	"strings"
	"time"
)

// SMTPSender delivers email over SMTP, over STARTTLS, authenticating when Username
// is set. Without STARTTLS it sends only to a server on this machine (Mailpit, on
// localhost:1025 for local development, offers neither), unless AllowPlaintext says
// the network between is trusted: a sign-in link sent in the clear can be read and used.
type SMTPSender struct {
	// Addr is host:port of the SMTP server.
	Addr string
	// From is the sender's address.
	From string
	// Username and Password enable PLAIN authentication (only sent over TLS, or to localhost).
	Username, Password string
	// Timeout bounds connecting and the whole conversation; default 30 seconds.
	Timeout time.Duration
	// AllowPlaintext sends to a server off this machine that offers no STARTTLS, for a
	// relay on a network you trust.
	AllowPlaintext bool

	dial func(ctx context.Context, addr string) (net.Conn, error) // tests reach a fake server by another name
}

// loopback reports whether host is this machine.
func loopback(host string) bool {
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// Send delivers one message.
func (s *SMTPSender) Send(ctx context.Context, m Message) error {
	body, err := s.build(m)
	if err != nil {
		return err
	}
	timeout := s.Timeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	host, _, err := net.SplitHostPort(s.Addr)
	if err != nil {
		return fmt.Errorf("smtp: bad address %q: %w", s.Addr, err)
	}

	dialer := net.Dialer{Timeout: timeout}
	dial := s.dial
	if dial == nil {
		dial = func(ctx context.Context, addr string) (net.Conn, error) { return dialer.DialContext(ctx, "tcp", addr) }
	}
	conn, err := dial(ctx, s.Addr)
	if err != nil {
		return fmt.Errorf("smtp: connect: %w", err)
	}
	deadline := time.Now().Add(timeout)
	if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
		deadline = d
	}
	_ = conn.SetDeadline(deadline)

	c, err := smtp.NewClient(conn, host)
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("smtp: greeting: %w", err)
	}
	defer func() { _ = c.Close() }() // after Quit this only reports the connection already closed

	if ok, _ := c.Extension("STARTTLS"); ok {
		if err := c.StartTLS(&tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}); err != nil {
			return fmt.Errorf("smtp: starttls: %w", err)
		}
	} else if !loopback(host) && !s.AllowPlaintext {
		return fmt.Errorf("smtp: %s offers no STARTTLS, and is not on this machine: refusing to send a sign-in link in the clear (set AllowPlaintext for a relay on a trusted network)", s.Addr)
	}
	if s.Username != "" {
		if err := c.Auth(smtp.PlainAuth("", s.Username, s.Password, host)); err != nil {
			return fmt.Errorf("smtp: auth: %w", err)
		}
	}
	if err := c.Mail(s.From); err != nil {
		return fmt.Errorf("smtp: MAIL FROM: %w", err)
	}
	if err := c.Rcpt(m.To); err != nil {
		return fmt.Errorf("smtp: RCPT TO: %w", err)
	}
	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("smtp: DATA: %w", err)
	}
	if _, err := w.Write(body); err != nil {
		return fmt.Errorf("smtp: write: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp: send: %w", err)
	}
	return c.Quit()
}

// build writes the message as MIME: multipart/alternative, text first, then HTML.
func (s *SMTPSender) build(m Message) ([]byte, error) {
	for _, v := range []string{s.From, m.To, m.Subject} {
		if strings.ContainsAny(v, "\r\n") {
			return nil, errors.New("smtp: header value contains a line break")
		}
	}
	from, err := mail.ParseAddress(s.From)
	if err != nil {
		return nil, fmt.Errorf("smtp: bad From %q: %w", s.From, err)
	}
	to, err := mail.ParseAddress(m.To)
	if err != nil {
		return nil, fmt.Errorf("smtp: bad recipient: %w", err)
	}
	idBytes := make([]byte, 12)
	if _, err := rand.Read(idBytes); err != nil {
		return nil, err
	}
	domain := from.Address[strings.LastIndex(from.Address, "@")+1:]

	// The headers must precede the body but name its boundary, so write the body to
	// a scratch buffer first, then the headers, then the body.
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	for _, part := range []struct{ typ, content string }{{"text/plain", m.Text}, {"text/html", m.HTML}} {
		if part.content == "" {
			continue
		}
		pw, err := mw.CreatePart(textproto.MIMEHeader{
			"Content-Type":              {part.typ + "; charset=utf-8"},
			"Content-Transfer-Encoding": {"quoted-printable"},
		})
		if err != nil {
			return nil, err
		}
		qp := quotedprintable.NewWriter(pw)
		if _, err := qp.Write([]byte(part.content)); err != nil {
			return nil, err
		}
		if err := qp.Close(); err != nil {
			return nil, err
		}
	}
	if err := mw.Close(); err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	header := func(k, v string) { fmt.Fprintf(&buf, "%s: %s\r\n", k, v) }
	header("From", from.String())
	header("To", to.String())
	header("Subject", mime.QEncoding.Encode("utf-8", m.Subject))
	header("Date", time.Now().Format(time.RFC1123Z))
	header("Message-ID", "<"+hex.EncodeToString(idBytes)+"@"+domain+">")
	header("MIME-Version", "1.0")
	header("Content-Type", `multipart/alternative; boundary="`+mw.Boundary()+`"`)
	buf.WriteString("\r\n")
	buf.Write(body.Bytes())
	return buf.Bytes(), nil
}
