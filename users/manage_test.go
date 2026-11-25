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
const ownerPermissions = "roux.admin users.invite users.manage users.owners users.read"

func permissionsOf(t *testing.T, b *authntest.Browser) string {
	t.Helper()
	var out []string
	for _, p := range b.Get("/api/roux/auth/me").JSON(t)["permissions"].([]any) {
		out = append(out, p.(string))
	}
	return strings.Join(out, " ")
}

func detailAt(t *testing.T, b *authntest.Browser, id uuid.UUID) map[string]any {
	t.Helper()
	r := b.Get("/api/roux/users/" + id.String())
	if r.StatusCode != 200 {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	return r.JSON(t)
}

func descriptions(t *testing.T, b *authntest.Browser, id uuid.UUID) []string {
	t.Helper()
	var out []string
	for _, e := range decodePage(t, b.Get("/api/roux/users/"+id.String()+"/activities")).Data {
		out = append(out, e["description"].(string))
	}
	return out
}

func TestRenamingSomeone(t *testing.T) {
	f := setup(t)
	ada := f.person("Ada Lovelace", "ada@example.test", "USER")
	owner := f.SignedIn(f.owner)
	path := "/api/roux/users/" + ada.String() + "/name"

	r := owner.Put(path, map[string]any{"displayName": " Ada King ", "version": 0})
	if d := r.JSON(t); r.StatusCode != 200 || d["displayName"] != "Ada King" || d["version"] != float64(1) || d["email"] != "ada@example.test" {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	if got := descriptions(t, owner, ada); len(got) != 1 || got[0] != "Renamed from Ada Lovelace to Ada King" {
		t.Fatalf("history: %v", got)
	}
	owner.Put(path, map[string]any{"displayName": "Again", "version": 0}).Want(t, 409, "stale")
	if got := errorsOf(t, owner.Put(path, map[string]any{"displayName": "", "version": 1})); got["displayName"] != "Must not be blank" {
		t.Fatalf("blank: %v", got)
	}
	owner.Put("/api/roux/users/"+uuid.NewString()+"/name", map[string]any{"displayName": "X", "version": 0}).Want(t, 404, "unknown")
}

func TestOnlyOneOfTwoRenamesFromTheSameVersionWins(t *testing.T) {
	f := setup(t)
	ada := f.person("Ada", "ada@example.test", "USER")
	a, b := f.SignedIn(f.owner), f.SignedIn(f.manager("Hr", "hr@example.test"))
	a.Get("/api/roux/users/me")
	b.Get("/api/roux/users/me")
	statuses := make(chan int, 2)
	var wg, start sync.WaitGroup
	start.Add(1)
	for i, br := range []*authntest.Browser{a, b} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			start.Wait()
			statuses <- br.Put("/api/roux/users/"+ada.String()+"/name", map[string]any{"displayName": "Name " + string(rune('A'+i)), "version": 0}).StatusCode
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
	path := "/api/roux/users/" + ada.String() + "/role"

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
	owner.Put("/api/roux/users/"+uuid.NewString()+"/role", map[string]string{"role": "COACH"}).Want(t, 404, "unknown")
}

func TestMakingAnOwnerNeedsAFreshSignIn(t *testing.T) {
	f := setup(t)
	ada := f.person("Ada", "ada@example.test", "USER")
	owner := f.SignedIn(f.owner)
	path := "/api/roux/users/" + ada.String() + "/owner"

	f.Clock.Advance(11 * time.Minute) // still signed in (30 minutes idle), no longer recently
	r := owner.Post(path, nil)
	if body := r.JSON(t); r.StatusCode != 401 || body["type"] != "urn:roux:error:reauthentication-required" || body["detail"] != "Sign in again to continue" {
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

func TestYouCannotDeactivateYourself(t *testing.T) {
	f := setup(t)
	wantDetail(t, f.SignedIn(f.owner).Post("/api/roux/users/"+f.owner.String()+"/deactivate", nil), 400, "You cannot deactivate yourself", "self")
}

func TestDeactivatingAndReactivating(t *testing.T) {
	f := setup(t)
	ada := f.person("Ada", "ada@example.test", "USER")
	owner := f.SignedIn(f.owner)
	adaBrowser := f.SignedIn(ada)
	adaBrowser.Get("/api/roux/users/me").Want(t, 200, "Ada signs in")
	path := "/api/roux/users/" + ada.String()

	if d := owner.Post(path+"/deactivate", nil).Want(t, 200, "deactivate").JSON(t); d["status"] != "DEACTIVATED" {
		t.Fatalf("deactivate: %v", d)
	}
	wantDetail(t, owner.Post(path+"/deactivate", nil), 409, "Already deactivated", "deactivating again")
	// Her session ends with her next request, and she is out of the default list.
	adaBrowser.Get("/api/roux/users/me").Want(t, 401, "a deactivated user's session still works")
	if got := decodePage(t, owner.Get("/api/roux/users?search=ada")).names(); len(got) != 0 {
		t.Fatalf("still listed: %v", got)
	}
	if got := decodePage(t, owner.Get("/api/roux/users?search=ada&status=DEACTIVATED")).names(); len(got) != 1 {
		t.Fatalf("not in the deactivated list: %v", got)
	}

	if d := owner.Post(path+"/reactivate", nil).Want(t, 200, "reactivate").JSON(t); d["status"] != "ACTIVE" {
		t.Fatalf("reactivate: %v", d)
	}
	wantDetail(t, owner.Post(path+"/reactivate", nil), 409, "Already active", "reactivating again")
	// Reactivating does not revive the session that ended.
	adaBrowser.Get("/api/roux/users/me").Want(t, 401, "the dead session came back to life")
	// The history, newest first, with who did each.
	if got := descriptions(t, owner, ada); strings.Join(got, "|") != "Reactivated|Deactivated" {
		t.Fatalf("history: %v", got)
	}
	if first := decodePage(t, owner.Get(path+"/activities")).Data[0]; first["actorName"] != "Olive Owner" {
		t.Fatalf("actor: %v", first)
	}
	owner.Post("/api/roux/users/"+uuid.NewString()+"/deactivate", nil).Want(t, 404, "unknown")
}

func TestDeactivatingEndsEverySessionThereAndThen(t *testing.T) {
	f := setup(t)
	ada := f.person("Ada", "ada@example.test", "USER")
	owner := f.SignedIn(f.owner)
	adaBrowser := f.SignedIn(ada)
	path := "/api/roux/users/" + ada.String()
	owner.Post(path+"/deactivate", nil).Want(t, 200, "deactivate")
	// Reactivated before her session saw a request: it must not come back.
	owner.Post(path+"/reactivate", nil).Want(t, 200, "reactivate")
	adaBrowser.Get("/api/roux/users/me").Want(t, 401, "a session from before the deactivation")
}

func TestSigningSomeoneOutEverywhere(t *testing.T) {
	f := setup(t)
	ada := f.person("Ada", "ada@example.test", "USER")
	phone, laptop := f.SignedIn(ada), f.SignedIn(ada)
	owner := f.SignedIn(f.owner)

	if r := owner.Post("/api/roux/users/"+ada.String()+"/sign-out", nil); r.StatusCode != 204 || len(r.Body) != 0 {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	for name, b := range map[string]*authntest.Browser{"phone": phone, "laptop": laptop} {
		if b.Get("/api/roux/users/me").StatusCode != 401 {
			t.Errorf("%s is still signed in", name)
		}
	}
	if owner.Get("/api/roux/users/me").StatusCode != 200 {
		t.Fatal("someone else's session ended")
	}
	owner.Post("/api/roux/users/"+uuid.NewString()+"/sign-out", nil).Want(t, 404, "unknown")
}

func TestTheLastAdministratorStays(t *testing.T) {
	f := setup(t)
	hr := f.SignedIn(f.manager("Hr", "hr@example.test")) // may manage users, is not an administrator
	path := "/api/roux/users/" + f.owner.String()

	// Deactivating the only administrator, or taking their role away, is refused with who's last-admin.
	for name, r := range map[string]authntest.Reply{
		"deactivate": hr.Post(path+"/deactivate", nil),
		"demote":     hr.Put(path+"/role", map[string]string{"role": "USER"}),
	} {
		body := r.JSON(t)
		if r.StatusCode != 409 || body["type"] != "urn:roux:error:last-admin" || body["code"] != "last-admin" ||
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
	f.SignedIn(f.owner).Post("/api/roux/users/"+second.String()+"/owner", nil).Want(t, 200, "second owner")
	hr.Post(path+"/deactivate", nil).Want(t, 200, "now deactivating the first is fine")
}

// deactivateAtOnce has each browser deactivate its user at the same moment, and counts the
// deactivations that went through and those refused as a conflict.
func deactivateAtOnce(who map[*authntest.Browser]uuid.UUID) (ok, refused int) {
	var wg, start sync.WaitGroup
	start.Add(1)
	statuses := make(chan int, len(who))
	for b, target := range who {
		wg.Go(func() {
			start.Wait()
			statuses <- b.Post("/api/roux/users/"+target.String()+"/deactivate", nil).StatusCode
		})
	}
	start.Done()
	wg.Wait()
	close(statuses)
	for s := range statuses {
		switch s {
		case 200:
			ok++
		case 409:
			refused++
		}
	}
	return ok, refused
}

func TestTwoAtOnceCannotRemoveEveryAdministrator(t *testing.T) {
	f := setup(t)
	second := f.person("Second Owner", "second@example.test", "")
	f.SignedIn(f.owner).Post("/api/roux/users/"+second.String()+"/owner", nil).Want(t, 200, "making a second owner")
	hrOne := f.SignedIn(f.manager("Hr One", "hr1@example.test"))
	hrTwo := f.SignedIn(f.manager("Hr Two", "hr2@example.test"))
	hrOne.Get("/api/roux/users/me")
	hrTwo.Get("/api/roux/users/me")

	for round := 0; round < 6; round++ {
		ok, refused := deactivateAtOnce(map[*authntest.Browser]uuid.UUID{hrOne: f.owner, hrTwo: second})
		if ok != 1 || refused != 1 {
			t.Fatalf("round %d: %d deactivated, %d refused: exactly one administrator may go", round, ok, refused)
		}
		if n := f.count(`select count(*) from roux_user_directory u join roux_identity_role ir on ir.identity_id = u.id
		                   join roux_role_permission rp on rp.role_id = ir.role_id
		                  where u.status = 'ACTIVE' and rp.permission = 'roux.admin'`); n != 1 {
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
		owner.Put("/api/roux/users/"+ada.String()+"/name", map[string]any{"displayName": name, "version": i}).Want(t, 200, "PUT /api/roux/users/")
	}
	p := decodePage(t, owner.Get("/api/roux/users/"+ada.String()+"/activities?pageSize=3"))
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
	owner.Get("/api/roux/users/"+ada.String()+"/activities?sortBy=NOPE&sortDirection=DESC").Want(t, 200, "sort ignored")
	owner.Get("/api/roux/users/"+uuid.NewString()+"/activities").Want(t, 404, "unknown")
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
	d := f.SignedIn(f.owner).Get("/api/roux/users/me").JSON(t)
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

func TestOnlySomeoneWhoMayManageOwnersChangesOne(t *testing.T) {
	f := setup(t)
	lead := f.SignedIn(f.lead("Lee Lead", "lee@example.test"))
	path := "/api/roux/users/" + f.owner.String()
	lead.Put(path+"/role", map[string]string{"role": "COACH"}).Want(t, 403, "a lead demoting an owner")
	lead.Post(path+"/deactivate", nil).Want(t, 403, "a lead deactivating an owner")
	if d := detailAt(t, lead, f.owner); d["status"] != "ACTIVE" || d["role"] != "OWNER" {
		t.Fatalf("a refused change left a trace: %v", d)
	}
	// Someone who is not an owner is the lead's to manage.
	ada := f.person("Ada", "ada@example.test", "COACH")
	lead.Post("/api/roux/users/"+ada.String()+"/deactivate", nil).Want(t, 200, "a lead deactivating a coach")
}

func TestChangingAnOwnerNeedsARecentSignIn(t *testing.T) {
	f := setup(t)
	second := f.person("Second Owner", "second@example.test", "")
	owner := f.SignedIn(f.owner)
	owner.Post("/api/roux/users/"+second.String()+"/owner", nil).Want(t, 200, "a second owner")
	f.Clock.Advance(11 * time.Minute)
	path := "/api/roux/users/" + second.String()
	for name, r := range map[string]authntest.Reply{
		"demote":     owner.Put(path+"/role", map[string]string{"role": "COACH"}),
		"deactivate": owner.Post(path+"/deactivate", nil),
	} {
		if r.StatusCode != 401 || r.JSON(t)["code"] != "reauthentication-required" {
			t.Errorf("%s an owner from a stale sign-in: %d %s", name, r.StatusCode, r.Body)
		}
	}
	f.SignedIn(f.owner).Put(path+"/role", map[string]string{"role": "COACH"}).Want(t, 200, "from a fresh sign-in")
}

func TestNobodyGivesARoleThatHoldsMoreThanTheyDo(t *testing.T) {
	f := setup(t)
	// USER may read users, which COACH may not; a lead may read users too, so give USER one
	// permission the lead lacks.
	if _, err := f.Pool.Exec(context.Background(), `
		insert into roux_role_permission (role_id, permission)
		select id, 'items.secret' from roux_role where name = 'USER'`); err != nil {
		t.Fatal(err)
	}
	lead := f.SignedIn(f.lead("Lee Lead", "lee@example.test"))
	ada := f.person("Ada", "ada@example.test", "COACH")
	for name, r := range map[string]authntest.Reply{
		"invite": lead.Post("/api/roux/users/invitations", map[string]string{"name": "Bob", "email": "bob@example.test", "role": "USER"}),
		"change": lead.Put("/api/roux/users/"+ada.String()+"/role", map[string]string{"role": "USER"}),
	} {
		if r.StatusCode != 400 || !strings.Contains(string(r.Body), "You cannot give a role with permissions you do not hold") {
			t.Errorf("%s to a role holding more: %d %s", name, r.StatusCode, r.Body)
		}
	}
	lead.Post("/api/roux/users/invitations", map[string]string{"name": "Bob", "email": "bob@example.test", "role": "COACH"}).Want(t, 202, "a role within the lead's own")
}
