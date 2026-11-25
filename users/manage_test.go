package users_test

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/authn/authntest"
)

// What OWNER holds in this environment: who's identity permissions and users.*
// (the theme's migration is not part of it).
const ownerPermissions = "users.invite users.manage users.owners users.read who.identities.manage who.identities.read"

func permissionsOf(t *testing.T, b *authntest.Browser) string {
	t.Helper()
	var out []string
	for _, p := range b.Get("/who/me").JSON(t)["permissions"].([]any) {
		out = append(out, p.(string))
	}
	return strings.Join(out, " ")
}

func detailAt(t *testing.T, b *authntest.Browser, id uuid.UUID) map[string]any {
	t.Helper()
	r := b.Get("/api/users/" + id.String())
	if r.StatusCode != 200 {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	return r.JSON(t)
}

func descriptions(t *testing.T, b *authntest.Browser, id uuid.UUID) []string {
	t.Helper()
	var out []string
	for _, e := range decodePage(t, b.Get("/api/users/"+id.String()+"/activities")).Data {
		out = append(out, e["description"].(string))
	}
	return out
}

func TestRenamingSomeone(t *testing.T) {
	f := setup(t)
	ada := f.person("Ada Lovelace", "ada@example.test", "USER")
	owner := f.SignedIn(f.owner)
	path := "/api/users/" + ada.String() + "/name"

	r := owner.Put(path, map[string]any{"displayName": " Ada King ", "version": 0})
	if d := r.JSON(t); r.StatusCode != 200 || d["displayName"] != "Ada King" || d["version"] != float64(1) || d["email"] != "ada@example.test" {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	if got := descriptions(t, owner, ada); len(got) != 1 || got[0] != "Renamed from Ada Lovelace to Ada King" {
		t.Fatalf("history: %v", got)
	}
	if r := owner.Put(path, map[string]any{"displayName": "Again", "version": 0}); r.StatusCode != 409 {
		t.Fatalf("stale: %d", r.StatusCode)
	}
	if got := errorsOf(t, owner.Put(path, map[string]any{"displayName": "", "version": 1})); got["displayName"] != "Must not be blank" {
		t.Fatalf("blank: %v", got)
	}
	if r := owner.Put("/api/users/"+uuid.NewString()+"/name", map[string]any{"displayName": "X", "version": 0}); r.StatusCode != 404 {
		t.Fatalf("unknown: %d", r.StatusCode)
	}
}

func TestOnlyOneOfTwoRenamesFromTheSameVersionWins(t *testing.T) {
	f := setup(t)
	ada := f.person("Ada", "ada@example.test", "USER")
	a, b := f.SignedIn(f.owner), f.SignedIn(f.manager("Hr", "hr@example.test"))
	a.Get("/api/users/me")
	b.Get("/api/users/me")
	statuses := make(chan int, 2)
	var wg, start sync.WaitGroup
	start.Add(1)
	for i, br := range []*authntest.Browser{a, b} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			start.Wait()
			statuses <- br.Put("/api/users/"+ada.String()+"/name", map[string]any{"displayName": "Name " + string(rune('A'+i)), "version": 0}).StatusCode
		}()
	}
	start.Done()
	wg.Wait()
	close(statuses)
	wins, conflicts := 0, 0
	for s := range statuses {
		switch s {
		case 200:
			wins++
		case 409:
			conflicts++
		}
	}
	if wins != 1 || conflicts != 1 {
		t.Fatalf("%d wins, %d conflicts", wins, conflicts)
	}
	if n := len(descriptions(t, a, ada)); n != 1 {
		t.Fatalf("%d renames recorded, want 1", n)
	}
}

func TestChangingARole(t *testing.T) {
	f := setup(t)
	ada := f.person("Ada", "ada@example.test", "USER")
	owner := f.SignedIn(f.owner)
	path := "/api/users/" + ada.String() + "/role"

	r := owner.Put(path, map[string]string{"role": "COACH"})
	if d := r.JSON(t); r.StatusCode != 200 || d["role"] != "COACH" {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	if got := descriptions(t, owner, ada); len(got) != 1 || got[0] != "Role changed from USER to COACH" {
		t.Fatalf("history: %v", got)
	}
	// Giving the role someone already has changes nothing and records nothing.
	if r := owner.Put(path, map[string]string{"role": "COACH"}); r.StatusCode != 200 || len(descriptions(t, owner, ada)) != 1 {
		t.Fatalf("same role: %d", r.StatusCode)
	}
	if f.count(`select count(*) from roux_identity_role where identity_id = $1`, ada) != 1 {
		t.Fatal("a user holds exactly one role")
	}

	for _, role := range []string{"OWNER", "NOPE"} { // never invitable
		if got := errorsOf(t, owner.Put(path, map[string]string{"role": role})); got["role"] != "That role cannot be given" {
			t.Fatalf("%s: %v", role, got)
		}
	}
	if got := errorsOf(t, owner.Put(path, map[string]string{})); got["role"] != "Must not be blank" {
		t.Fatalf("blank: %v", got)
	}
	if r := owner.Put("/api/users/"+uuid.NewString()+"/role", map[string]string{"role": "COACH"}); r.StatusCode != 404 {
		t.Fatalf("unknown: %d", r.StatusCode)
	}
}

func TestMakingAnOwnerNeedsAFreshSignIn(t *testing.T) {
	f := setup(t)
	ada := f.person("Ada", "ada@example.test", "USER")
	owner := f.SignedIn(f.owner)
	path := "/api/users/" + ada.String() + "/owner"

	f.Clock.Advance(11 * time.Minute) // still signed in (30 minutes idle), no longer recently
	r := owner.Post(path, nil)
	if body := r.JSON(t); r.StatusCode != 401 || body["type"] != "urn:who:error:reauthentication-required" || body["detail"] != "Sign in again to continue" {
		t.Fatalf("stale sign-in: %d %s", r.StatusCode, r.Body)
	}
	if detailAt(t, owner, ada)["role"] != "USER" {
		t.Fatal("a refused request changed the role")
	}

	fresh := f.SignedIn(f.owner)
	r = fresh.Post(path, nil)
	if d := r.JSON(t); r.StatusCode != 200 || d["role"] != "OWNER" {
		t.Fatalf("fresh: %d %s", r.StatusCode, r.Body)
	}
	if got := descriptions(t, fresh, ada); len(got) != 1 || got[0] != "Role changed from USER to OWNER" {
		t.Fatalf("history: %v", got)
	}
	if got := permissionsOf(t, f.SignedIn(ada)); got != ownerPermissions {
		t.Fatalf("a new owner holds every permission: %s", got)
	}
}

func TestDeactivatingAndReactivating(t *testing.T) {
	f := setup(t)
	ada := f.person("Ada", "ada@example.test", "USER")
	owner := f.SignedIn(f.owner)
	adaBrowser := f.SignedIn(ada)
	if adaBrowser.Get("/api/users/me").StatusCode != 200 {
		t.Fatal("Ada is not signed in")
	}
	path := "/api/users/" + ada.String()

	// You cannot deactivate yourself.
	r := owner.Post("/api/users/"+f.owner.String()+"/deactivate", nil)
	if r.StatusCode != 400 || r.JSON(t)["detail"] != "You cannot deactivate yourself" {
		t.Fatalf("self: %d %s", r.StatusCode, r.Body)
	}

	r = owner.Post(path+"/deactivate", nil)
	if d := r.JSON(t); r.StatusCode != 200 || d["status"] != "DEACTIVATED" {
		t.Fatalf("deactivate: %d %s", r.StatusCode, r.Body)
	}
	if r := owner.Post(path+"/deactivate", nil); r.StatusCode != 409 || r.JSON(t)["detail"] != "Already deactivated" {
		t.Fatalf("again: %d %s", r.StatusCode, r.Body)
	}
	// Her session ends with her next request, and she is out of the default list.
	if r := adaBrowser.Get("/api/users/me"); r.StatusCode != 401 {
		t.Fatalf("a deactivated user's session still works: %d", r.StatusCode)
	}
	if got := decodePage(t, owner.Get("/api/users?search=ada")).names(); len(got) != 0 {
		t.Fatalf("still listed: %v", got)
	}
	if got := decodePage(t, owner.Get("/api/users?search=ada&status=DEACTIVATED")).names(); len(got) != 1 {
		t.Fatalf("not in the deactivated list: %v", got)
	}

	r = owner.Post(path+"/reactivate", nil)
	if d := r.JSON(t); r.StatusCode != 200 || d["status"] != "ACTIVE" {
		t.Fatalf("reactivate: %d %s", r.StatusCode, r.Body)
	}
	if r := owner.Post(path+"/reactivate", nil); r.StatusCode != 409 || r.JSON(t)["detail"] != "Already active" {
		t.Fatalf("again: %d %s", r.StatusCode, r.Body)
	}
	// Reactivating does not revive the session that ended.
	if adaBrowser.Get("/api/users/me").StatusCode != 401 {
		t.Fatal("the dead session came back to life")
	}
	// The history, newest first, with who did each.
	got := descriptions(t, owner, ada)
	if strings.Join(got, "|") != "Reactivated|Deactivated" {
		t.Fatalf("history: %v", got)
	}
	if first := decodePage(t, owner.Get(path+"/activities")).Data[0]; first["actorName"] != "Olive Owner" {
		t.Fatalf("actor: %v", first)
	}
	if r := owner.Post("/api/users/"+uuid.NewString()+"/deactivate", nil); r.StatusCode != 404 {
		t.Fatalf("unknown: %d", r.StatusCode)
	}
}

func TestSigningSomeoneOutEverywhere(t *testing.T) {
	f := setup(t)
	ada := f.person("Ada", "ada@example.test", "USER")
	phone, laptop := f.SignedIn(ada), f.SignedIn(ada)
	owner := f.SignedIn(f.owner)

	if r := owner.Post("/api/users/"+ada.String()+"/sign-out", nil); r.StatusCode != 204 || len(r.Body) != 0 {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	for name, b := range map[string]*authntest.Browser{"phone": phone, "laptop": laptop} {
		if b.Get("/api/users/me").StatusCode != 401 {
			t.Errorf("%s is still signed in", name)
		}
	}
	if owner.Get("/api/users/me").StatusCode != 200 {
		t.Fatal("someone else's session ended")
	}
	if r := owner.Post("/api/users/"+uuid.NewString()+"/sign-out", nil); r.StatusCode != 404 {
		t.Fatalf("unknown: %d", r.StatusCode)
	}
}

func TestTheLastAdministratorStays(t *testing.T) {
	f := setup(t)
	hr := f.SignedIn(f.manager("Hr", "hr@example.test")) // may manage users, is not an administrator
	path := "/api/users/" + f.owner.String()

	// Deactivating the only administrator, or taking their role away, is refused with who's last-admin.
	for name, r := range map[string]authntest.Reply{
		"deactivate": hr.Post(path+"/deactivate", nil),
		"demote":     hr.Put(path+"/role", map[string]string{"role": "USER"}),
	} {
		body := r.JSON(t)
		if r.StatusCode != 409 || body["type"] != "urn:who:error:last-admin" || body["code"] != "last-admin" ||
			body["detail"] != "The team needs someone active who can manage people" {
			t.Errorf("%s: %d %s", name, r.StatusCode, r.Body)
		}
	}
	d := detailAt(t, hr, f.owner)
	if d["status"] != "ACTIVE" || d["role"] != "OWNER" {
		t.Fatalf("the refused changes must leave no trace: %v", d)
	}
	if got := descriptions(t, hr, f.owner); len(got) != 0 {
		t.Fatalf("a refused change was recorded: %v", got)
	}

	// With a second administrator, the first can go.
	second := f.person("Second Owner", "second@example.test", "")
	if r := f.SignedIn(f.owner).Post("/api/users/"+second.String()+"/owner", nil); r.StatusCode != 200 {
		t.Fatalf("second owner: %d %s", r.StatusCode, r.Body)
	}
	if r := hr.Post(path+"/deactivate", nil); r.StatusCode != 200 {
		t.Fatalf("now deactivating the first is fine: %d %s", r.StatusCode, r.Body)
	}
}

func TestTwoAtOnceCannotRemoveEveryAdministrator(t *testing.T) {
	f := setup(t)
	second := f.person("Second Owner", "second@example.test", "")
	if r := f.SignedIn(f.owner).Post("/api/users/"+second.String()+"/owner", nil); r.StatusCode != 200 {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	hrOne := f.SignedIn(f.manager("Hr One", "hr1@example.test"))
	hrTwo := f.SignedIn(f.manager("Hr Two", "hr2@example.test"))
	hrOne.Get("/api/users/me")
	hrTwo.Get("/api/users/me")

	for round := 0; round < 6; round++ {
		var wg, start sync.WaitGroup
		start.Add(1)
		statuses := make(chan int, 2)
		for _, c := range []struct {
			b      *authntest.Browser
			target uuid.UUID
		}{{hrOne, f.owner}, {hrTwo, second}} {
			wg.Add(1)
			go func() {
				defer wg.Done()
				start.Wait()
				statuses <- c.b.Post("/api/users/"+c.target.String()+"/deactivate", nil).StatusCode
			}()
		}
		start.Done()
		wg.Wait()
		close(statuses)
		ok, refused := 0, 0
		for s := range statuses {
			switch s {
			case 200:
				ok++
			case 409:
				refused++
			}
		}
		if ok != 1 || refused != 1 {
			t.Fatalf("round %d: %d deactivated, %d refused: exactly one administrator may go", round, ok, refused)
		}
		if n := f.count(`select count(*) from roux_user_directory u join roux_identity_role ir on ir.identity_id = u.id
		                   join roux_role_permission rp on rp.role_id = ir.role_id
		                  where u.status = 'ACTIVE' and rp.permission = 'who.identities.manage'`); n != 1 {
			t.Fatalf("round %d: %d active administrators", round, n)
		}
		// Put them both back for the next round.
		if _, err := f.Pool.Exec(context.Background(), `update roux_identity set status = 'ACTIVE' where id in ($1, $2)`, f.owner, second); err != nil {
			t.Fatal(err)
		}
	}
}

func TestAUsersHistory(t *testing.T) {
	f := setup(t)
	ada := f.person("Ada", "ada@example.test", "USER")
	owner := f.SignedIn(f.owner)
	for i, name := range []string{"One", "Two", "Three", "Four"} {
		f.Clock.Advance(time.Minute)
		if r := owner.Put("/api/users/"+ada.String()+"/name", map[string]any{"displayName": name, "version": i}); r.StatusCode != 200 {
			t.Fatalf("%d %s", r.StatusCode, r.Body)
		}
	}
	p := decodePage(t, owner.Get("/api/users/"+ada.String()+"/activities?pageSize=3"))
	if len(p.Data) != 3 || p.Data[0]["description"] != "Renamed from Three to Four" || p.Pagination["totalElementCount"] != float64(4) || p.Pagination["hasNext"] != true {
		t.Fatalf("%+v %v", p.Data, p.Pagination)
	}
	e := p.Data[0]
	if len(e) != 7 || e["type"] != "user.renamed" || e["actorId"] != f.owner.String() || e["actorName"] != "Olive Owner" ||
		e["occurredAt"] == nil || e["id"] == nil {
		t.Fatalf("entry: %v", e)
	}
	if d := e["details"].(map[string]any); d["from"] != "Three" || d["to"] != "Four" {
		t.Fatalf("details: %v", d)
	}
	// The order is fixed: a sort parameter is ignored, not refused.
	if r := owner.Get("/api/users/" + ada.String() + "/activities?sortBy=NOPE&sortDirection=DESC"); r.StatusCode != 200 {
		t.Fatalf("sort ignored: %d %s", r.StatusCode, r.Body)
	}
	if r := owner.Get("/api/users/" + uuid.NewString() + "/activities"); r.StatusCode != 404 {
		t.Fatalf("unknown: %d", r.StatusCode)
	}
}

func TestMakingTheFirstOwner(t *testing.T) {
	f := setup(t) // setup already made Olive
	ctx := context.Background()

	// With an active owner, starting again changes nothing, whatever the settings say.
	for _, c := range []struct{ email, name string }{{ownerAddress, "Olive Owner"}, {"someone-else@example.test", "Someone Else"}} {
		if created, err := f.svc.BootstrapOwner(ctx, c.email, c.name); err != nil || created {
			t.Fatalf("%v: created=%v err=%v", c, created, err)
		}
	}
	if f.count(`select count(*) from roux_user`) != 1 {
		t.Fatal("a second owner was made")
	}
	d := f.SignedIn(f.owner).Get("/api/users/me").JSON(t)
	if d["displayName"] != "Olive Owner" || d["email"] != ownerAddress {
		t.Fatalf("owner: %v", d)
	}
	if got := permissionsOf(t, f.SignedIn(f.owner)); got != ownerPermissions {
		t.Fatalf("the owner holds every permission: %s", got)
	}

	// An owner's name must be a name.
	if _, err := f.svc.BootstrapOwner(ctx, "x@example.test", "  "); err == nil {
		t.Fatal("a blank name")
	}
}

func TestTheFirstOwnerWontTakeSomeonesAddress(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	// no active owner now
	if _, err := f.Pool.Exec(ctx, `update roux_identity set status = 'DISABLED' where id = $1`, f.owner); err != nil {
		t.Fatal(err)
	}
	f.person("Squatter", "squatter@example.test", "USER")

	_, err := f.svc.BootstrapOwner(ctx, "squatter@example.test", "New Owner")
	if err == nil || !strings.Contains(err.Error(), "belongs to another identity") {
		t.Fatalf("err = %v", err)
	}
	if f.count(`select count(*) from roux_identity`) != 2 {
		t.Fatal("a refused bootstrap left an identity behind")
	}
	// A free address works: the next start makes an owner again.
	if created, err := f.svc.BootstrapOwner(ctx, "fresh@example.test", "Fresh Owner"); err != nil || !created {
		t.Fatalf("%v %v", created, err)
	}
}

func TestConcurrentStartsMakeOneOwner(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	// start from nothing
	if _, err := f.Pool.Exec(ctx, `delete from roux_identity`); err != nil {
		t.Fatal(err)
	}

	var wg, start sync.WaitGroup
	start.Add(1)
	created := make(chan bool, 6)
	for i := 0; i < 6; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			start.Wait()
			c, err := f.svc.BootstrapOwner(ctx, ownerAddress, "Olive Owner")
			if err != nil {
				t.Errorf("start: %v", err)
			}
			created <- c
		}()
	}
	start.Done()
	wg.Wait()
	close(created)
	n := 0
	for c := range created {
		if c {
			n++
		}
	}
	if n != 1 || f.count(`select count(*) from roux_user`) != 1 {
		t.Fatalf("%d starts made an owner, %d owners exist", n, f.count(`select count(*) from roux_user`))
	}
}
