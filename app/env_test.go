package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// envIn makes a working directory holding .env (none when dotenv is ""), with no bindings, and
// clears names.
func envIn(t *testing.T, dotenv string, names ...string) string {
	t.Helper()
	dir := t.TempDir()
	if dotenv != "" {
		if err := os.WriteFile(filepath.Join(dir, ".env"), []byte(dotenv), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	t.Chdir(dir)
	t.Setenv("SERVICE_BINDING_ROOT", "")
	for _, name := range names {
		t.Setenv(name, "") // put back afterwards; unset now, as .env fills only what is unset
		if err := os.Unsetenv(name); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func TestLoadEnvReadsDotEnvWithoutOverwriting(t *testing.T) {
	envIn(t, "ROUX_TEST_A=from-file\nROUX_TEST_B=from-file\n", "ROUX_TEST_A", "ROUX_TEST_B")
	t.Setenv("ROUX_TEST_B", "typed")
	if err := LoadEnv(); err != nil {
		t.Fatal(err)
	}
	if got := os.Getenv("ROUX_TEST_A"); got != "from-file" {
		t.Errorf("ROUX_TEST_A = %q, want the .env value", got)
	}
	if got := os.Getenv("ROUX_TEST_B"); got != "typed" {
		t.Errorf("ROUX_TEST_B = %q, want the variable already set", got)
	}
}

func TestLoadEnvNeedsNoDotEnv(t *testing.T) {
	envIn(t, "")
	if err := LoadEnv(); err != nil {
		t.Fatal(err)
	}
}

// A binding is the platform's, so it comes before one machine's .env.
func TestLoadEnvPutsBindingsBeforeDotEnv(t *testing.T) {
	dir := envIn(t, "DATABASE_URL=postgres://from-file/app\n", "DATABASE_URL", "TEST_DATABASE_URL")
	db := filepath.Join(dir, "bindings", "db")
	if err := os.MkdirAll(db, 0o755); err != nil {
		t.Fatal(err)
	}
	for entry, value := range map[string]string{"type": "postgresql", "uri": "postgres://bound/app"} {
		if err := os.WriteFile(filepath.Join(db, entry), []byte(value), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("SERVICE_BINDING_ROOT", filepath.Join(dir, "bindings"))
	if err := LoadEnv(); err != nil {
		t.Fatal(err)
	}
	if got := os.Getenv("DATABASE_URL"); got != "postgres://bound/app" {
		t.Errorf("DATABASE_URL = %q, want the binding's", got)
	}
}

func TestLoadEnvStopsOnABrokenBinding(t *testing.T) {
	envIn(t, "")
	t.Setenv("SERVICE_BINDING_ROOT", filepath.Join(t.TempDir(), "nowhere"))
	if err := LoadEnv(); err == nil || !strings.Contains(err.Error(), "SERVICE_BINDING_ROOT") {
		t.Fatalf("error %v, want one naming SERVICE_BINDING_ROOT", err)
	}
}

func TestLoadEnvStopsOnADotEnvItCannotRead(t *testing.T) {
	dir := envIn(t, "")
	if err := os.Mkdir(filepath.Join(dir, ".env"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := LoadEnv(); err == nil || !strings.Contains(err.Error(), ".env") {
		t.Fatalf("error %v, want one naming .env", err)
	}
}
