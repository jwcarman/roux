package users_test

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/activity"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authn/authntest"
	"github.com/jwcarman/roux/authn/emaillink"
	"github.com/jwcarman/roux/authz"
	"github.com/jwcarman/roux/users"
)

const ownerAddress = "owner@example.test"

type outbox struct {
	mu   sync.Mutex
	msgs []emaillink.Message
	fail bool
}

func (o *outbox) Send(_ context.Context, m emaillink.Message) error {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.fail {
		return errors.New("smtp is down")
	}
	o.msgs = append(o.msgs, m)
	return nil
}

func (o *outbox) all() []emaillink.Message {
	o.mu.Lock()
	defer o.mu.Unlock()
	return append([]emaillink.Message(nil), o.msgs...)
}

func (o *outbox) failing(v bool) { o.mu.Lock(); o.fail = v; o.mu.Unlock() }

// fx is users over a fresh schema, with an owner, a USER role (users.read) and a COACH
// role (nothing), and invitations that go to an outbox.
type fx struct {
	*authntest.Env
	svc   users.Service
	out   *outbox
	email *emaillink.Method
	owner uuid.UUID
}

func setup(t *testing.T) *fx {
	t.Helper()
	clk := authntest.NewClock()
	out := &outbox{}
	email, err := emaillink.New(emaillink.Config{
		LinkBaseURL: "http://app.test/signin/link", CodeSecret: strings.Repeat("s", 40),
		AppName: "Acme Gym", Sender: out, Clock: clk.Now,
	})
	if err != nil {
		t.Fatal(err)
	}
	env := authntest.NewWith(t, "users", clk, []authn.Method{email}, activity.Migration, emaillink.Migration, users.Migration)
	invitable, err := authz.NewInvitable([]string{"USER", "COACH"})
	if err != nil {
		t.Fatal(err)
	}
	svc := users.Service{Pool: env.Pool, Host: env.Host, Email: email, Invitable: invitable, Clock: clk.Now}
	users.Register(env.Mux, env.Host, svc)
	env.Serve()

	ctx := context.Background()
	for name, perms := range map[string][]string{"USER": {users.UsersRead}, "COACH": nil} {
		id := uuid.New()
		if _, err := env.Pool.Exec(ctx, `insert into roux_role (id, name) values ($1, $2)`, id, name); err != nil {
			t.Fatal(err)
		}
		for _, p := range perms {
			if _, err := env.Pool.Exec(ctx, `insert into roux_role_permission (role_id, permission) values ($1, $2)`, id, p); err != nil {
				t.Fatal(err)
			}
		}
	}
	f := &fx{Env: env, svc: svc, out: out, email: email}
	if created, err := svc.BootstrapOwner(ctx, ownerAddress, "Olive Owner"); err != nil || !created {
		t.Fatalf("owner: %v %v", created, err)
	}
	f.owner = f.idOf(ownerAddress)
	return f
}

func (f *fx) idOf(address string) uuid.UUID {
	f.T.Helper()
	var id uuid.UUID
	err := f.Pool.QueryRow(context.Background(), `select id from roux_user_directory where email = $1`, address).Scan(&id)
	if err != nil {
		f.T.Fatalf("no user with address %s: %v", address, err)
	}
	return id
}

// person adds a user directly (no email, no invitation) with the role.
func (f *fx) person(name, address, role string) uuid.UUID {
	f.T.Helper()
	ctx := context.Background()
	id, err := authn.CreateIdentity(ctx, f.Pool, f.Clock.Now())
	if err != nil {
		f.T.Fatal(err)
	}
	if err := f.email.Register(ctx, id, address); err != nil {
		f.T.Fatal(err)
	}
	if role != "" {
		r, found, err := authz.FindRole(ctx, f.Pool, role)
		if err != nil || !found {
			f.T.Fatalf("role %s: %v %v", role, found, err)
		}
		if err := authz.Assign(ctx, f.Pool, id, r.ID); err != nil {
			f.T.Fatal(err)
		}
	}
	if _, err := f.Pool.Exec(ctx, `insert into roux_user (id, version, display_name) values ($1, 0, $2)`, id, name); err != nil {
		f.T.Fatal(err)
	}
	return id
}

// manager makes a person who may manage users but is not an administrator.
func (f *fx) manager(name, address string) uuid.UUID {
	f.T.Helper()
	return f.withRole(name, address, "HR", users.UsersRead, users.UsersManage, users.UsersInvite, users.UsersOwners)
}

// lead is someone whose role may invite and manage people, but not owners: what an app grants a
// team lead.
func (f *fx) lead(name, address string) uuid.UUID {
	f.T.Helper()
	return f.withRole(name, address, "LEAD", users.UsersRead, users.UsersManage, users.UsersInvite)
}

// withRole makes a person holding a role of their own with the permissions.
func (f *fx) withRole(name, address, role string, permissions ...string) uuid.UUID {
	f.T.Helper()
	id := f.person(name, address, "")
	ctx := context.Background()
	r := uuid.New()
	if _, err := f.Pool.Exec(ctx, `insert into roux_role (id, name) values ($1, $2) on conflict do nothing`, r, role); err != nil {
		f.T.Fatal(err)
	}
	var roleID uuid.UUID
	if err := f.Pool.QueryRow(ctx, `select id from roux_role where name = $1`, role).Scan(&roleID); err != nil {
		f.T.Fatal(err)
	}
	for _, p := range permissions {
		if _, err := f.Pool.Exec(ctx, `insert into roux_role_permission (role_id, permission) values ($1, $2) on conflict do nothing`, roleID, p); err != nil {
			f.T.Fatal(err)
		}
	}
	if err := authz.Assign(ctx, f.Pool, id, roleID); err != nil {
		f.T.Fatal(err)
	}
	return id
}

func (f *fx) count(sql string, args ...any) int {
	f.T.Helper()
	var n int
	if err := f.Pool.QueryRow(context.Background(), sql, args...).Scan(&n); err != nil {
		f.T.Fatal(err)
	}
	return n
}

func (f *fx) mailTo(address string) []emaillink.Message {
	var out []emaillink.Message
	for _, m := range f.out.all() {
		if m.To == address {
			out = append(out, m)
		}
	}
	return out
}

// pageOf is a {data, pagination} answer.
type pageOf struct {
	Data       []map[string]any `json:"data"`
	Pagination map[string]any   `json:"pagination"`
}

func (p pageOf) names() []string {
	var out []string
	for _, row := range p.Data {
		out = append(out, row["displayName"].(string))
	}
	return out
}
