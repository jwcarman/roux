package rouxtest_test

import (
	"context"
	"net/http"
	"testing"
	"testing/fstest"
	"time"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authz"
	"github.com/jwcarman/roux/pgdb"
	"github.com/jwcarman/roux/rouxtest"
)

var notes = pgdb.Migration{Name: "notes", Dir: ".", FS: fstest.MapFS{
	"001_notes.sql": {Data: []byte(`create table note (id serial primary key, body text not null);`)},
}}

func TestATeamSignsInWithItsRolesPermissions(t *testing.T) {
	a := rouxtest.New(t, "rouxtest_team", notes)
	a.Role("COACH", "notes.read", "notes.write")
	a.Role("PLAYER", "notes.read")
	k := a.Kit()
	k.Handle("POST /api/notes", "notes.write", func(w http.ResponseWriter, r *http.Request) error {
		return api.JSON(w, http.StatusCreated, map[string]string{"by": authn.PrincipalFrom(r.Context()).IdentityID.String()})
	})
	a.Serve()

	coach := a.Person("Carla Coach", "COACH")
	player := a.Person("Pat Player", "PLAYER")
	a.SignedIn(coach).Post("/api/notes", nil).Want(t, 201, "a coach writes notes")
	a.SignedIn(player).Post("/api/notes", nil).Want(t, 403, "a player only reads them")

	var name string
	if err := a.Pool.QueryRow(context.Background(), `select display_name from roux_user where id = $1`, coach).Scan(&name); err != nil || name != "Carla Coach" {
		t.Fatalf("the person's user: %q %v", name, err)
	}
	if _, err := a.Pool.Exec(context.Background(), `insert into note (body) values ('the app''s migrations ran')`); err != nil {
		t.Fatal(err)
	}
}

func TestAnOwnerHoldsEveryPermissionAndAPersonCanLeave(t *testing.T) {
	a := rouxtest.New(t, "rouxtest_owner")
	a.Serve()
	owner := a.Person("Olive Owner", authz.RoleOwner)
	b := a.SignedIn(owner)
	b.Get("/api/roux/auth/me").Want(t, 200, "the owner is signed in")
	a.Deactivate(owner)
	b.Get("/api/roux/auth/me").Want(t, 401, "a deactivated person is signed out")
}

func TestTheClockMovesToAMoment(t *testing.T) {
	a := rouxtest.New(t, "rouxtest_clock")
	moment := time.Date(2026, 12, 1, 9, 30, 0, 0, time.UTC)
	a.At(moment)
	if !a.Clock.Now().Equal(moment) {
		t.Fatalf("now %v, want %v", a.Clock.Now(), moment)
	}
}

func TestAMigrationRunsAfterTheRolesItGrantsTo(t *testing.T) {
	a := rouxtest.New(t, "rouxtest_later")
	a.Role("USER")
	a.Migrate(pgdb.Migration{Name: "grants", Dir: ".", FS: fstest.MapFS{
		"001_grants.sql": {Data: []byte(`insert into roux_role_permission (role_id, permission) select id, 'notes.read' from roux_role where name = 'USER';`)},
	}})
	a.Serve()
	r := a.SignedIn(a.Person("Pat", "USER")).Get("/api/roux/auth/me").Want(t, 200, "me").JSON(t)
	if perms, _ := r["permissions"].([]any); len(perms) != 1 || perms[0] != "notes.read" {
		t.Fatalf("permissions %v", r["permissions"])
	}
}
