package users_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authn/authntest"
	"github.com/jwcarman/roux/page"
	"github.com/jwcarman/roux/users"
)

func decodePage(t *testing.T, r authntest.Reply) pageOf {
	t.Helper()
	if r.StatusCode != 200 {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	var p pageOf
	r.Decode(t, &p)
	return p
}

func errorsOf(t *testing.T, r authntest.Reply) map[string]string {
	t.Helper()
	body := r.JSON(t)
	if r.StatusCode != 400 || body["detail"] != "The request has invalid fields" {
		t.Fatalf("want roux's 400, got %d %s", r.StatusCode, r.Body)
	}
	out := map[string]string{}
	for _, e := range body["errors"].([]any) {
		m := e.(map[string]any)
		out[m["field"].(string)] = m["message"].(string)
	}
	return out
}

// wantDetail fails the test unless the reply is the status and the problem detail wanted.
func wantDetail(t *testing.T, r authntest.Reply, status int, detail, what string) {
	t.Helper()
	if r.StatusCode != status || r.JSON(t)["detail"] != detail {
		t.Fatalf("%s: want %d %q, got %d %s", what, status, detail, r.StatusCode, r.Body)
	}
}

func TestMe(t *testing.T) {
	f := setup(t)
	r := f.SignedIn(f.owner).Get("/api/roux/users/me").Want(t, 200, "me")
	want := `{"id":"` + f.owner.String() + `","displayName":"Olive Owner","email":"owner@example.test","version":0}`
	if got := strings.TrimSpace(string(r.Body)); got != want {
		t.Fatalf("%s\nwant %s", got, want)
	}
}

func TestRenamingYourself(t *testing.T) {
	f := setup(t)
	b := f.SignedIn(f.owner)
	activities := "/api/roux/users/" + f.owner.String() + "/activities"

	// Renaming trims, bumps the version and is recorded.
	r := b.Put("/api/roux/users/me", map[string]any{"displayName": "  Olive O  ", "version": 0}).Want(t, 200, "rename")
	if m := r.JSON(t); m["displayName"] != "Olive O" || m["version"] != float64(1) {
		t.Fatalf("rename: %s", r.Body)
	}
	hist := decodePage(t, b.Get(activities))
	if len(hist.Data) != 1 || hist.Data[0]["description"] != "Renamed from Olive Owner to Olive O" || hist.Data[0]["actorName"] != "Olive O" {
		t.Fatalf("history: %+v", hist.Data)
	}

	// The same name again changes nothing: no new version, no new record.
	r = b.Put("/api/roux/users/me", map[string]any{"displayName": "Olive O", "version": 1})
	if r.JSON(t)["version"] != float64(1) || len(decodePage(t, b.Get(activities)).Data) != 1 {
		t.Fatalf("same name: %s", r.Body)
	}

	// From a stale version it is a conflict, and nothing changes.
	wantDetail(t, b.Put("/api/roux/users/me", map[string]any{"displayName": "Someone", "version": 0}), 409, "This record changed since you loaded it", "stale")
	if b.Get("/api/roux/users/me").JSON(t)["displayName"] != "Olive O" {
		t.Fatal("a refused rename changed the name")
	}
}

func TestYourNewNameIsChecked(t *testing.T) {
	f := setup(t)
	b := f.SignedIn(f.owner)
	got := errorsOf(t, b.Put("/api/roux/users/me", map[string]any{}))
	if got["displayName"] != "Must not be blank" || got["version"] != "Must not be empty" || len(got) != 2 {
		t.Fatalf("empty: %v", got)
	}
	got = errorsOf(t, b.Put("/api/roux/users/me", map[string]any{"displayName": strings.Repeat("x", 81), "version": 1}))
	if got["displayName"] != "Must be between 0 and 80 characters" {
		t.Fatalf("long: %v", got)
	}
	if errorsOf(t, b.Put("/api/roux/users/me", map[string]any{"displayName": "   ", "version": 1}))["displayName"] != "Must not be blank" {
		t.Fatal("a name of spaces is blank")
	}
}

func TestOnlyAUserHasAPageOfTheirOwn(t *testing.T) {
	f := setup(t)
	wantDetail(t, f.SignedIn(f.Identity()).Get("/api/roux/users/me"), 404, "No such user", "not a user")
	f.Browser().Get("/api/roux/users/me").Want(t, 401, "anonymous")
}

func TestTheDirectory(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	f.person("Ada Lovelace", "ada@example.test", "USER")
	f.person("Grace Hopper", "grace@example.test", "USER")
	f.person("Alan Turing", "alan@example.test", "COACH")
	zed := f.person("Zed Gone", "zed@example.test", "USER")
	f.person("Fifty% Off", "fifty@example.test", "USER")
	if _, err := f.Pool.Exec(ctx, `update roux_identity set status = 'DISABLED' where id = $1`, zed); err != nil {
		t.Fatal(err)
	}
	b := f.SignedIn(f.owner)

	names := func(query string) []string { return decodePage(t, b.Get("/api/roux/users"+query)).names() }
	eq := func(got []string, want ...string) {
		t.Helper()
		if strings.Join(got, "|") != strings.Join(want, "|") {
			t.Fatalf("got %v, want %v", got, want)
		}
	}

	// Active people only, by name.
	eq(names(""), "Ada Lovelace", "Alan Turing", "Fifty% Off", "Grace Hopper", "Olive Owner")
	eq(names("?sortDirection=DESC"), "Olive Owner", "Grace Hopper", "Fifty% Off", "Alan Turing", "Ada Lovelace")
	eq(names("?sortBy=EMAIL"), "Ada Lovelace", "Alan Turing", "Fifty% Off", "Grace Hopper", "Olive Owner")
	eq(names("?sortBy=ROLE")[:2], "Alan Turing", "Olive Owner") // COACH, OWNER, then the USERs
	if names("?sortBy=JOINED&sortDirection=DESC") == nil {
		t.Fatal("sort by joined")
	}

	// Filters.
	eq(names("?search=ada"), "Ada Lovelace")
	eq(names("?search=%20%20ADA%20%20"), "Ada Lovelace") // any case, padded
	eq(names("?search=ada%20example"), "Ada Lovelace")   // every word, in the name or the email
	eq(names("?search=lovelace%20hopper"))               // all words must match
	eq(names("?search=%25"), "Fifty% Off")               // % is literal
	eq(names("?search=_"))                               // so is _
	eq(names("?search=example"), "Ada Lovelace", "Alan Turing", "Fifty% Off", "Grace Hopper", "Olive Owner")
	eq(names("?role=COACH"), "Alan Turing")
	eq(names("?status=DEACTIVATED"), "Zed Gone")
	eq(names("?status=ACTIVE&role=USER&search=g"), "Grace Hopper")

	// Paging, in jpa-utils' envelope.
	p := decodePage(t, b.Get("/api/roux/users?pageSize=2&pageIndex=1"))
	eq(p.names(), "Fifty% Off", "Grace Hopper")
	if p.Pagination["pageIndex"] != float64(1) || p.Pagination["pageSize"] != float64(2) || p.Pagination["totalElementCount"] != float64(5) ||
		p.Pagination["totalPageCount"] != float64(3) || p.Pagination["hasNext"] != true || p.Pagination["hasPrevious"] != true {
		t.Fatalf("pagination: %v", p.Pagination)
	}

	// A row is exactly roux's.
	row := decodePage(t, b.Get("/api/roux/users?search=ada")).Data[0]
	if len(row) != 5 || row["email"] != "ada@example.test" || row["role"] != "USER" || row["status"] != "ACTIVE" || row["id"] == nil {
		t.Fatalf("row: %v", row)
	}

	// Bad parameters are field errors.
	if got := errorsOf(t, b.Get("/api/roux/users?role=NOPE")); got["role"] != "No such role" {
		t.Fatalf("role: %v", got)
	}
	if got := errorsOf(t, b.Get("/api/roux/users?status=bogus")); got["status"] != "Must be one of ACTIVE, DEACTIVATED" {
		t.Fatalf("status: %v", got)
	}
	if got := errorsOf(t, b.Get("/api/roux/users?sortBy=PASSWORD")); got["sortBy"] != "Must be one of NAME, EMAIL, ROLE, JOINED" {
		t.Fatalf("sortBy: %v", got)
	}
	if got := errorsOf(t, b.Get("/api/roux/users?pageIndex=abc")); got["pageIndex"] != "Invalid value" {
		t.Fatalf("pageIndex: %v", got)
	}
	if got := decodePage(t, b.Get("/api/roux/users?pageSize=100000&pageIndex=-3")); got.Pagination["pageSize"] != float64(100) || got.Pagination["pageIndex"] != float64(0) {
		t.Fatalf("clamping: %v", got.Pagination)
	}
}

func TestOneUser(t *testing.T) {
	f := setup(t)
	ada := f.person("Ada Lovelace", "ada@example.test", "USER")
	b := f.SignedIn(f.owner)

	d := b.Get("/api/roux/users/" + ada.String()).JSON(t)
	if len(d) != 8 || d["displayName"] != "Ada Lovelace" || d["email"] != "ada@example.test" || d["role"] != "USER" ||
		d["status"] != "ACTIVE" || d["invited"] != true || d["version"] != float64(0) || d["joinedAt"] == nil {
		t.Fatalf("detail: %v", d)
	}
	if r := b.Get("/api/roux/users/" + uuid.NewString()); r.StatusCode != 404 || r.JSON(t)["detail"] != "No such user" {
		t.Fatalf("unknown: %d %s", r.StatusCode, r.Body)
	}
	if r := b.Get("/api/roux/users/not-a-uuid"); r.StatusCode != 404 || r.JSON(t)["title"] != "Not Found" || r.JSON(t)["detail"] != nil {
		t.Fatalf("not a uuid: %d %s", r.StatusCode, r.Body)
	}
}

func TestEveryEndpointChecksItsPermission(t *testing.T) {
	f := setup(t)
	ada := f.person("Ada Lovelace", "ada@example.test", "USER").String()
	read := f.SignedIn(f.Identity(users.UsersRead))
	none := f.SignedIn(f.Identity())
	anon := f.Browser()
	id := "/api/roux/users/" + ada

	type call struct {
		method, path string
		body         any
		needs        string // the permission it asks for
	}
	calls := []call{
		{"GET", "/api/roux/users", nil, users.UsersRead},
		{"GET", id, nil, users.UsersRead},
		{"GET", id + "/activities", nil, users.UsersRead},
		{"POST", "/api/roux/users/invitations", map[string]string{"name": "X", "email": "x@example.test", "role": "USER"}, users.UsersInvite},
		{"POST", id + "/invitation", nil, users.UsersInvite},
		{"PUT", id + "/name", map[string]any{"displayName": "X", "version": 0}, users.UsersManage},
		{"PUT", id + "/role", map[string]string{"role": "COACH"}, users.UsersManage},
		{"POST", id + "/owner", nil, users.UsersOwners},
		{"POST", id + "/deactivate", nil, users.UsersManage},
		{"POST", id + "/reactivate", nil, users.UsersManage},
		{"POST", id + "/sign-out", nil, users.UsersManage},
	}
	for _, c := range calls {
		if r := anon.Do(c.method, c.path, c.body, true); r.StatusCode != 401 || r.JSON(t)["detail"] != "Sign in to continue" {
			t.Errorf("%s %s anonymous: %d %s", c.method, c.path, r.StatusCode, r.Body)
		}
		if r := none.Do(c.method, c.path, c.body, true); r.StatusCode != 403 || r.JSON(t)["detail"] != "You do not have permission" {
			t.Errorf("%s %s with no permission: %d %s", c.method, c.path, r.StatusCode, r.Body)
		}
		if c.needs != users.UsersRead {
			if r := read.Do(c.method, c.path, c.body, true); r.StatusCode != 403 {
				t.Errorf("%s %s with only users.read: %d %s", c.method, c.path, r.StatusCode, r.Body)
			}
		}
	}
	// Nothing above changed anyone.
	if f.count(`select count(*) from roux_activity`) != 0 || f.count(`select count(*) from roux_user`) != 2 {
		t.Fatal("a refused request changed something")
	}
}

func TestInvitingSomeone(t *testing.T) {
	f := setup(t)
	owner := f.SignedIn(f.owner)

	r := owner.Post("/api/roux/users/invitations", map[string]string{"name": "  Ada Lovelace ", "email": "  ADA@Example.test ", "role": "USER"})
	if r.StatusCode != 202 || strings.TrimSpace(string(r.Body)) != `{"linkSent":true}` {
		t.Fatalf("invite: %d %s", r.StatusCode, r.Body)
	}
	f.email.Wait()
	mail := f.mailTo("ada@example.test")
	if len(mail) != 1 || mail[0].Subject != "You've been invited to Acme Gym" {
		t.Fatalf("mail: %+v", f.out.all())
	}

	// She is in the directory, invited, with the role and a normalized address.
	ada := f.idOf("ada@example.test")
	d := owner.Get("/api/roux/users/" + ada.String()).JSON(t)
	if d["displayName"] != "Ada Lovelace" || d["role"] != "USER" || d["invited"] != true || d["status"] != "ACTIVE" {
		t.Fatalf("detail: %v", d)
	}
	hist := decodePage(t, owner.Get("/api/roux/users/"+ada.String()+"/activities"))
	if len(hist.Data) != 1 || hist.Data[0]["description"] != "Invited Ada Lovelace" || hist.Data[0]["actorName"] != "Olive Owner" ||
		hist.Data[0]["type"] != "user.invited" {
		t.Fatalf("history: %+v", hist.Data)
	}

	// She accepts: the link signs her in, and she is no longer invited.
	token := strings.Split(strings.Split(mail[0].Text, "#token=")[1], "\n")[0]
	adaBrowser := f.Browser()
	if r := adaBrowser.Post("/api/roux/auth/email/sign-in", map[string]string{"token": token}); r.StatusCode != 200 || r.JSON(t)["identityId"] != ada.String() {
		t.Fatalf("accepting: %d %s", r.StatusCode, r.Body)
	}
	if got := adaBrowser.Get("/api/roux/users/me").JSON(t); got["displayName"] != "Ada Lovelace" {
		t.Fatalf("me: %v", got)
	}
	if owner.Get("/api/roux/users/" + ada.String()).JSON(t)["invited"] != false {
		t.Fatal("a user who has signed in is still shown as invited")
	}
	// A USER may see the team but not invite.
	adaBrowser.Get("/api/roux/users").Want(t, 200, "USER lists")
	adaBrowser.Post("/api/roux/users/invitations", map[string]string{"name": "X", "email": "x@example.test", "role": "USER"}).Want(t, 403, "USER invites")
}

func TestInvitationsThatAreRefused(t *testing.T) {
	f := setup(t)
	owner := f.SignedIn(f.owner)
	f.person("Taken", "taken@example.test", "USER")
	people, identities := f.count(`select count(*) from roux_user`), f.count(`select count(*) from roux_identity`)

	// An address that belongs to someone.
	got := errorsOf(t, owner.Post("/api/roux/users/invitations", map[string]string{"name": "Dup", "email": "TAKEN@example.test", "role": "USER"}))
	if got["email"] != "That address already belongs to a user" || len(got) != 1 {
		t.Fatalf("taken: %v", got)
	}
	// A role an invitation may not give: OWNER never, and nothing unknown.
	for _, role := range []string{"OWNER", "NOPE"} {
		got := errorsOf(t, owner.Post("/api/roux/users/invitations", map[string]string{"name": "X", "email": "x@example.test", "role": role}))
		if got["role"] != "That role cannot be given" {
			t.Fatalf("role %s: %v", role, got)
		}
	}
	// Invalid input.
	got = errorsOf(t, owner.Post("/api/roux/users/invitations", map[string]string{}))
	if got["name"] != "Must not be blank" || got["email"] != "Must not be blank" || got["role"] != "Must not be blank" {
		t.Fatalf("empty: %v", got)
	}
	got = errorsOf(t, owner.Post("/api/roux/users/invitations", map[string]string{"name": strings.Repeat("x", 81), "email": "nope", "role": "USER"}))
	if got["name"] != "Must be between 0 and 80 characters" || got["email"] != "Must be a valid email address" {
		t.Fatalf("bad: %v", got)
	}

	// None of it left anything behind: no person, no identity, no email.
	f.email.Wait()
	if f.count(`select count(*) from roux_user`) != people || f.count(`select count(*) from roux_identity`) != identities || len(f.out.all()) != 0 {
		t.Fatal("a refused invitation left something behind")
	}
}

func TestAnInvitationStandsWhenTheEmailFails(t *testing.T) {
	f := setup(t)
	f.out.failing(true)
	r := f.SignedIn(f.owner).Post("/api/roux/users/invitations", map[string]string{"name": "Ada", "email": "ada@example.test", "role": "USER"})
	if r.StatusCode != 202 || strings.TrimSpace(string(r.Body)) != `{"linkSent":false}` {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	if f.idOf("ada@example.test") == uuid.Nil {
		t.Fatal("the person should exist")
	}
}

func TestResendingAnInvitation(t *testing.T) {
	f := setup(t)
	owner := f.SignedIn(f.owner)
	owner.Post("/api/roux/users/invitations", map[string]string{"name": "Ada", "email": "ada@example.test", "role": "USER"})
	f.email.Wait()
	ada := f.idOf("ada@example.test")
	path := "/api/roux/users/" + ada.String() + "/invitation"

	// Too soon after the first: accepted, but no email goes out.
	if r := owner.Post(path, nil); r.StatusCode != 202 || strings.TrimSpace(string(r.Body)) != `{"linkSent":false}` {
		t.Fatalf("too soon: %d %s", r.StatusCode, r.Body)
	}
	f.Clock.Advance(61 * time.Second)
	if r := owner.Post(path, nil); r.StatusCode != 202 || strings.TrimSpace(string(r.Body)) != `{"linkSent":true}` {
		t.Fatalf("after the interval: %d %s", r.StatusCode, r.Body)
	}
	if n := len(f.mailTo("ada@example.test")); n != 2 {
		t.Fatalf("%d emails to Ada, want 2", n)
	}

	owner.Post("/api/roux/users/"+uuid.NewString()+"/invitation", nil).Want(t, 404, "unknown")
	// Once she has signed in there is nothing to resend.
	if _, err := f.Pool.Exec(context.Background(), `update roux_user set first_signed_in_at = now() where id = $1`, ada); err != nil {
		t.Fatal(err)
	}
	if r := owner.Post(path, nil); r.StatusCode != 409 || r.JSON(t)["detail"] != "Already signed in" {
		t.Fatalf("already signed in: %d %s", r.StatusCode, r.Body)
	}
}

func TestSigningUpWithAProviderAccount(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	signUp := func(name, role string) (uuid.UUID, error) {
		var id uuid.UUID
		tx, err := f.Pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx) //nolint:errcheck
		if id, err = authn.CreateIdentity(ctx, tx, f.Clock.Now()); err != nil {
			t.Fatal(err)
		}
		if err := f.svc.SignUp(ctx, tx, id, name, role); err != nil {
			return id, err
		}
		return id, tx.Commit(ctx)
	}

	id, err := signUp("  Ada Lovelace ", "COACH")
	if err != nil {
		t.Fatal(err)
	}
	d, err := f.svc.Detail(ctx, id)
	if err != nil || d.DisplayName != "Ada Lovelace" || d.Role == nil || *d.Role != "COACH" || d.Email != nil || d.Status != "ACTIVE" {
		t.Fatalf("%+v %v", d, err)
	}
	history, err := f.svc.Activities(ctx, id, page.Request{Size: 10})
	if err != nil || len(history.Data) != 1 || history.Data[0].Type != "user.signed_up" || history.Data[0].Description != "Ada Lovelace signed up" {
		t.Fatalf("%+v %v", history, err)
	}

	// A long name is shortened; a blank one is replaced; the role must be invitable.
	id, _ = signUp(strings.Repeat("x", 200), "USER")
	if d, _ := f.svc.Detail(ctx, id); len([]rune(d.DisplayName)) != users.MaxNameLength {
		t.Fatalf("%d characters", len([]rune(d.DisplayName)))
	}
	id, _ = signUp("   ", "USER")
	if d, _ := f.svc.Detail(ctx, id); d.DisplayName != "New user" {
		t.Fatalf("%q", d.DisplayName)
	}
	if _, err := signUp("Eve", "OWNER"); err == nil {
		t.Fatal("a sign-up made an owner")
	}
	var n int
	if err := f.Pool.QueryRow(ctx, `select count(*) from roux_user where display_name = 'Eve'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatal("a refused sign-up left a user behind")
	}
}
