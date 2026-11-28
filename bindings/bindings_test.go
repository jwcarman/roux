package bindings

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The variables a binding may set, cleared for each test (t.Setenv puts them back afterwards).
var variables = []string{"DATABASE_URL", "TEST_DATABASE_URL", "SMTP_ADDR", "SMTP_USERNAME", "SMTP_PASSWORD",
	"MAIL_FROM", "E2E_MAILPIT_URL"}

func clean(t *testing.T) string {
	t.Helper()
	for _, name := range variables {
		t.Setenv(name, "")
	}
	root := t.TempDir()
	t.Setenv("SERVICE_BINDING_ROOT", root)
	return root
}

// bind writes one binding directory: name/type, and a file per entry.
func bind(t *testing.T, root, name, kind string, entries map[string]string) {
	t.Helper()
	dir := filepath.Join(root, name)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if kind != "" {
		entries["type"] = kind
	}
	for entry, value := range entries {
		if err := os.WriteFile(filepath.Join(dir, entry), []byte(value), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func apply(t *testing.T) {
	t.Helper()
	if err := Apply(); err != nil {
		t.Fatal(err)
	}
}

func wantEnv(t *testing.T, name, want string) {
	t.Helper()
	if got := os.Getenv(name); got != want {
		t.Errorf("%s = %q, want %q", name, got, want)
	}
}

func wantError(t *testing.T, err error, parts ...string) {
	t.Helper()
	if err == nil {
		t.Fatalf("no error, want one saying %q", parts)
	}
	for _, part := range parts {
		if !strings.Contains(err.Error(), part) {
			t.Errorf("error %q does not say %q", err, part)
		}
	}
}

func TestNoRootChangesNothing(t *testing.T) {
	clean(t)
	t.Setenv("SERVICE_BINDING_ROOT", "")
	apply(t)
	for _, name := range variables {
		wantEnv(t, name, "")
	}
}

func TestAPostgresqlBindingIsTheDatabase(t *testing.T) {
	root := clean(t)
	bind(t, root, "db", "postgresql", map[string]string{
		"host": "postgres", "port": "5432", "database": "app", "username": "app user", "password": "p@ss/w:rd\n",
	})
	apply(t)
	want := "postgres://app%20user:p%40ss%2Fw%3Ard@postgres:5432/app"
	wantEnv(t, "DATABASE_URL", want)
	wantEnv(t, "TEST_DATABASE_URL", want)
}

func TestAPostgresqlBindingKeepsItsSSLMode(t *testing.T) {
	root := clean(t)
	bind(t, root, "db", "postgresql", map[string]string{
		"host": "db.example.com", "port": "6432", "database": "shop", "username": "u", "password": "p", "sslmode": "require",
	})
	apply(t)
	wantEnv(t, "DATABASE_URL", "postgres://u:p@db.example.com:6432/shop?sslmode=require")
}

func TestAPostgresqlBindingsURIWins(t *testing.T) {
	root := clean(t)
	bind(t, root, "db", "postgresql", map[string]string{"uri": "postgres://a:b@c:1/d?sslmode=disable", "host": "ignored"})
	apply(t)
	wantEnv(t, "DATABASE_URL", "postgres://a:b@c:1/d?sslmode=disable")
	wantEnv(t, "TEST_DATABASE_URL", "postgres://a:b@c:1/d?sslmode=disable")
}

func TestAVariableAlreadySetWins(t *testing.T) {
	root := clean(t)
	t.Setenv("DATABASE_URL", "postgres://mine@localhost/app")
	bind(t, root, "db", "postgresql", map[string]string{"uri": "postgres://bound@postgres/app"})
	apply(t)
	wantEnv(t, "DATABASE_URL", "postgres://mine@localhost/app")
	wantEnv(t, "TEST_DATABASE_URL", "postgres://bound@postgres/app")
}

func TestAnSMTPBindingIsTheMailServer(t *testing.T) {
	root := clean(t)
	bind(t, root, "mail", "smtp", map[string]string{
		"host": "smtp.example.com", "port": "587", "username": "u", "password": "p", "from": "shop@example.com",
	})
	apply(t)
	wantEnv(t, "SMTP_ADDR", "smtp.example.com:587")
	wantEnv(t, "SMTP_USERNAME", "u")
	wantEnv(t, "SMTP_PASSWORD", "p")
	wantEnv(t, "MAIL_FROM", "shop@example.com")
}

func TestAnSMTPBindingNeedsNoLogin(t *testing.T) {
	root := clean(t)
	bind(t, root, "mail", "smtp", map[string]string{"host": "mailpit", "port": "1025"})
	apply(t)
	wantEnv(t, "SMTP_ADDR", "mailpit:1025")
	wantEnv(t, "SMTP_USERNAME", "")
	wantEnv(t, "MAIL_FROM", "")
}

func TestAnSMTPLoginIsBothOrNeither(t *testing.T) {
	root := clean(t)
	bind(t, root, "mail", "smtp", map[string]string{"host": "h", "port": "25", "username": "u"})
	wantError(t, Apply(), "mail", "username", "password")
	wantEnv(t, "SMTP_ADDR", "")
}

func TestAMailpitBindingIsTheSuitesInbox(t *testing.T) {
	root := clean(t)
	bind(t, root, "inbox", "mailpit", map[string]string{"uri": "http://mailpit:8025"})
	apply(t)
	wantEnv(t, "E2E_MAILPIT_URL", "http://mailpit:8025")
}

func TestUnknownTypesAndHiddenFilesAreIgnored(t *testing.T) {
	root := clean(t)
	bind(t, root, "cache", "redis", map[string]string{"host": "redis"})
	bind(t, root, "..data", "postgresql", map[string]string{"uri": "postgres://hidden/app"})
	bind(t, root, "db", "postgresql", map[string]string{"uri": "postgres://shown/app", "..2026_11_27": "x"})
	if err := os.WriteFile(filepath.Join(root, "README"), []byte("not a binding"), 0o644); err != nil {
		t.Fatal(err)
	}
	apply(t)
	wantEnv(t, "DATABASE_URL", "postgres://shown/app")
}

// Kubernetes projects a binding's files as links into a hidden directory.
func TestLinkedBindingsAndEntriesAreRead(t *testing.T) {
	root := clean(t)
	bind(t, root, "..data", "postgresql", map[string]string{"uri": "postgres://linked/app"})
	db := filepath.Join(root, "db")
	if err := os.Mkdir(db, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, entry := range []string{"type", "uri"} {
		if err := os.Symlink(filepath.Join("..", "..data", entry), filepath.Join(db, entry)); err != nil {
			t.Fatal(err)
		}
	}
	apply(t)
	wantEnv(t, "DATABASE_URL", "postgres://linked/app")
}

func TestAMissingEntryIsAnErrorNamingTheBinding(t *testing.T) {
	root := clean(t)
	bind(t, root, "db", "postgresql", map[string]string{"host": "postgres", "port": "5432", "username": "u", "password": "p"})
	wantError(t, Apply(), `binding "db"`, "postgresql", "database", "uri")
	wantEnv(t, "DATABASE_URL", "")
}

func TestAnEmptyEntryIsMissing(t *testing.T) {
	root := clean(t)
	bind(t, root, "inbox", "mailpit", map[string]string{"uri": "\n"})
	wantError(t, Apply(), `binding "inbox"`, "uri")
}

func TestABindingWithoutATypeIsAnError(t *testing.T) {
	root := clean(t)
	bind(t, root, "db", "", map[string]string{"uri": "postgres://x/app"})
	wantError(t, Apply(), `binding "db"`, "type")
}

func TestTwoBindingsOfOneTypeAreAnError(t *testing.T) {
	root := clean(t)
	bind(t, root, "db", "postgresql", map[string]string{"uri": "postgres://one/app"})
	bind(t, root, "other", "postgresql", map[string]string{"uri": "postgres://two/app"})
	wantError(t, Apply(), `"db"`, `"other"`, "postgresql")
	wantEnv(t, "DATABASE_URL", "")
}

func TestAnUnreadableRootIsAnError(t *testing.T) {
	clean(t)
	missing := filepath.Join(t.TempDir(), "nowhere")
	t.Setenv("SERVICE_BINDING_ROOT", missing)
	wantError(t, Apply(), "SERVICE_BINDING_ROOT", missing)
}

func TestAnUnreadableEntryIsAnError(t *testing.T) {
	root := clean(t)
	bind(t, root, "db", "postgresql", map[string]string{"uri": "postgres://x/app"})
	if err := os.Symlink(filepath.Join(root, "gone"), filepath.Join(root, "db", "password")); err != nil {
		t.Fatal(err)
	}
	wantError(t, Apply(), `binding "db"`, "password")
}

func TestAnSMTPBindingNeedsItsHostAndPort(t *testing.T) {
	root := clean(t)
	bind(t, root, "mail", "smtp", map[string]string{"host": "smtp.example.com"})
	wantError(t, Apply(), `binding "mail"`, "port")
}

func TestAnUnreadableBindingIsAnError(t *testing.T) {
	root := clean(t)
	bind(t, root, "db", "postgresql", map[string]string{"uri": "postgres://x/app"})
	dir := filepath.Join(root, "db")
	if err := os.Chmod(dir, 0o000); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(dir, 0o755) })
	wantError(t, Apply(), `binding "db"`, "cannot be read")
}
