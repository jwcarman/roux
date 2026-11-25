package passkey_test

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authn/authntest"
	"github.com/jwcarman/roux/authn/emaillink"
	"github.com/jwcarman/roux/authn/passkey"
	"github.com/jwcarman/roux/authn/passkey/passkeytest"
)

const (
	origin = "http://localhost:8080"
	rpID   = "localhost"
)

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

type fx struct {
	*authntest.Env
	pk    *passkey.Method
	email *emaillink.Method
	out   *outbox
	auth  *passkeytest.Authenticator
}

func setup(t *testing.T) *fx { return build(t, false) }

// build is setup with a say in whether who marks every cookie Secure.
func build(t *testing.T, secure bool) *fx {
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
	pk, err := passkey.New(passkey.Config{
		RPID: rpID, RPName: "Acme Gym", AllowedOrigins: []string{origin},
		NameFor: email.AddressFor, Notify: email.PasskeyAdded, Clock: clk.Now,
	})
	if err != nil {
		t.Fatal(err)
	}
	env := authntest.NewWithConfig(t, "passkey", clk, func(c *authn.Config) { c.SecureCookies = secure }, []authn.Method{email, pk}, emaillink.Migration, passkey.Migration)
	env.Serve()
	t.Cleanup(func() { pk.Wait(); email.Wait() })
	return &fx{Env: env, pk: pk, email: email, out: out, auth: passkeytest.New(t, origin, rpID)}
}

// person is an identity with an email address, and a browser signed in as them.
func (f *fx) person(address string) (uuid.UUID, *authntest.Browser) {
	f.T.Helper()
	id, _, err := f.email.EnsureIdentity(context.Background(), address)
	if err != nil {
		f.T.Fatal(err)
	}
	return id, f.SignedIn(id)
}

// register adds a passkey through the endpoints, as the browser does.
func (f *fx) register(b *authntest.Browser, label string, tw passkeytest.Tweaks) authntest.Reply {
	f.T.Helper()
	opts := b.Post("/api/roux/auth/me/passkeys/options", nil)
	if opts.StatusCode != 200 {
		f.T.Fatalf("registration options: %d %s", opts.StatusCode, opts.Body)
	}
	return b.Post("/api/roux/auth/me/passkeys", map[string]any{"publicKey": map[string]any{
		"credential": f.auth.Create(opts.Body, tw), "label": label,
	}})
}

// signIn signs a signed-out browser in with the authenticator's passkey.
func (f *fx) signIn(b *authntest.Browser, tw passkeytest.Tweaks) authntest.Reply {
	f.T.Helper()
	opts := b.Post("/api/roux/auth/passkey/sign-in/options", nil)
	if opts.StatusCode != 200 {
		f.T.Fatalf("sign-in options: %d %s", opts.StatusCode, opts.Body)
	}
	return b.Post("/api/roux/auth/passkey/sign-in", f.auth.Get(opts.Body, tw))
}

func (f *fx) count(sql string, args ...any) int {
	f.T.Helper()
	var n int
	if err := f.Pool.QueryRow(context.Background(), sql, args...).Scan(&n); err != nil {
		f.T.Fatal(err)
	}
	return n
}

func (f *fx) advance(d time.Duration) { f.Clock.Advance(d) }
