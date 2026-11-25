package app_test

import (
	"bufio"
	"context"
	"net"
	"strings"
	"testing"

	"github.com/jwcarman/roux/app"
)

func TestEmailLinkRefusesMailSettingsThatCouldNeverWork(t *testing.T) {
	t.Setenv("CODE_SECRET", secret)
	for _, addr := range []string{"smtp.example.com", ":587", "smtp.example.com:smtp", "smtp.example.com:70000"} {
		t.Setenv("SMTP_ADDR", addr)
		_, err := app.EmailLinkFromEnv("Acme", nil)
		wantError(t, err, "SMTP_ADDR is \""+addr+"\"", "host:port", "smtp.example.com:587")
	}
	t.Setenv("SMTP_ADDR", "")
	t.Setenv("MAIL_FROM", "Acme Gym")
	_, err := app.EmailLinkFromEnv("Acme", nil)
	wantError(t, err, `MAIL_FROM is "Acme Gym"`, "no-reply@example.com")
}

// fakeMailServer answers on this machine as a mail server that offers nothing and accepts QUIT.
func fakeMailServer(t *testing.T) string {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer func() { _ = conn.Close() }()
		r := bufio.NewReader(conn)
		_, _ = conn.Write([]byte("220 fake\r\n"))
		for {
			line, err := r.ReadString('\n')
			if err != nil {
				return
			}
			if strings.HasPrefix(line, "QUIT") {
				_, _ = conn.Write([]byte("221 bye\r\n"))
				return
			}
			_, _ = conn.Write([]byte("250 ok\r\n"))
		}
	}()
	return ln.Addr().String()
}

func TestTheMailServerIsCheckedAtStart(t *testing.T) {
	t.Setenv("SMTP_ADDR", fakeMailServer(t))
	e := emailLink(t)
	out := logged(t, func() {
		if err := e.Start(context.Background(), nil); err != nil {
			t.Fatal(err)
		}
		e.Drain()
	})
	if !strings.Contains(out, "level=INFO") || !strings.Contains(out, "mail server ready") {
		t.Fatalf("%s", out)
	}
}

func TestAMailServerThatCannotBeUsedIsAnErrorButNotAFailedStart(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	closed := ln.Addr().String()
	_ = ln.Close()
	t.Setenv("SMTP_ADDR", closed)
	e := emailLink(t)
	out := logged(t, func() {
		if err := e.Start(context.Background(), nil); err != nil {
			t.Fatalf("a mail outage stopped startup: %v", err)
		}
		e.Drain()
	})
	if !strings.Contains(out, "level=ERROR") || !strings.Contains(out, "sign-in emails will not go out") ||
		!strings.Contains(out, "connect to "+closed) {
		t.Fatalf("%s", out)
	}
}
