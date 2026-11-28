package pgtest

import (
	"os"
	"path/filepath"
	"testing"
)

// A platform that mounts its Postgres as a service binding needs no TEST_DATABASE_URL. (The only
// test here: the bindings are read once per test binary.)
func TestURLIsAPostgresqlBindingWhenNothingIsSet(t *testing.T) {
	t.Setenv("TEST_DATABASE_URL", "")
	t.Setenv("DATABASE_URL", "")
	root := t.TempDir()
	db := filepath.Join(root, "db")
	if err := os.Mkdir(db, 0o755); err != nil {
		t.Fatal(err)
	}
	for entry, value := range map[string]string{"type": "postgresql", "uri": "postgres://bound:5432/app"} {
		if err := os.WriteFile(filepath.Join(db, entry), []byte(value), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("SERVICE_BINDING_ROOT", root)
	if got := URL(t); got != "postgres://bound:5432/app" {
		t.Fatalf("URL = %q, want the binding's", got)
	}
}
