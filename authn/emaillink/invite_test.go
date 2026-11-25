package emaillink_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authn/emaillink"
)

func TestInvitationEmailUsesRouxsWords(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	id, err := authn.CreateIdentity(ctx, e.pool, e.clock.Now())
	if err != nil {
		t.Fatal(err)
	}
	if err := e.method.Register(ctx, id, "ada@example.test"); err != nil {
		t.Fatal(err)
	}
	if got := e.method.Invite(ctx, "ada@example.test"); got != emaillink.Sent {
		t.Fatalf("outcome = %s", got)
	}
	m := e.waitForMail(1)[0]
	if m.To != "ada@example.test" || m.Subject != "You've been invited to Acme Gym" {
		t.Fatalf("%+v", m)
	}
	for _, want := range []string{"You have been invited to Acme Gym. Accept by signing in: http://app.test/signin/link#token=", "Or enter this code: ", "expire in 5 minutes and work once", "If you weren't expecting this invitation"} {
		if !strings.Contains(m.Text, want) {
			t.Errorf("text lacks %q:\n%s", want, m.Text)
		}
	}
	if !strings.Contains(m.HTML, "You have been invited to <strong>Acme Gym</strong>. Accept by signing in.") {
		t.Errorf("html:\n%s", m.HTML)
	}

	// The invitation's link signs the person in, like any other.
	b := e.browser()
	if r := b.signInWithToken(tokenOf(t, m)); r.StatusCode != 200 || r.json(t)["identityId"] != id.String() {
		t.Fatalf("accepting the invitation: %d %s", r.StatusCode, r.body)
	}
}

func TestInvitationOutcomes(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	if got := e.method.Invite(ctx, "nobody@example.test"); got != emaillink.UnknownAddress {
		t.Fatalf("an address no one has: %s", got)
	}
	if got := e.method.Invite(ctx, "not an address"); got != emaillink.UnknownAddress {
		t.Fatalf("not an address: %s", got)
	}
	// Too soon after the last email to that address (sign-in and invitation share the interval).
	if got := e.method.Issue(ctx, owner); got != emaillink.Sent {
		t.Fatalf("first: %s", got)
	}
	if got := e.method.Invite(ctx, owner); got != emaillink.ResendSuppressed {
		t.Fatalf("within the resend interval: %s", got)
	}
	if n := e.settle(); n != 1 {
		t.Fatalf("%d emails, want 1", n)
	}
}

func TestResendingAnInvitation(t *testing.T) {
	e := setup(t)
	ctx := context.Background()

	if _, err := e.method.ResendInvitation(ctx, uuid.New()); !errors.Is(err, emaillink.ErrNoAddress) {
		t.Fatalf("an identity with no address: %v", err)
	}
	// An identity with two addresses is written to at the oldest.
	id, _ := authn.CreateIdentity(ctx, e.pool, e.clock.Now())
	if err := e.method.Register(ctx, id, "first@example.test"); err != nil {
		t.Fatal(err)
	}
	if err := e.method.Register(ctx, id, "second@example.test"); err != nil {
		t.Fatal(err)
	}

	got, err := e.method.ResendInvitation(ctx, id)
	if err != nil || got != emaillink.Sent {
		t.Fatalf("%v %v", got, err)
	}
	first := e.waitForMail(1)[0]
	if first.To != "first@example.test" || !strings.Contains(first.Subject, "invited") {
		t.Fatalf("%+v", first)
	}

	if got, _ := e.method.ResendInvitation(ctx, id); got != emaillink.ResendSuppressed {
		t.Fatalf("resent at once: %s", got)
	}
	// After the interval a new link goes out and replaces the old one.
	e.clock.advance(61 * time.Second)
	if got, _ := e.method.ResendInvitation(ctx, id); got != emaillink.Sent {
		t.Fatalf("after the interval: %s", got)
	}
	second := e.waitForMail(2)[1]
	e.browser().signInWithToken(tokenOf(t, first)).failedSignIn(t)
	if r := e.browser().signInWithToken(tokenOf(t, second)); r.StatusCode != 200 {
		t.Fatalf("the newest link: %d", r.StatusCode)
	}
}

func TestRegisteringInsideTheCallersTransaction(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	id, _ := authn.CreateIdentity(ctx, e.pool, e.clock.Now())

	tx, err := e.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err := e.method.RegisterIn(ctx, tx, id, "rolled@example.test"); err != nil {
		t.Fatal(err)
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	if got := e.method.Invite(ctx, "rolled@example.test"); got != emaillink.UnknownAddress {
		t.Fatalf("a rolled-back registration left an address behind: %s", got)
	}

	tx, _ = e.pool.Begin(ctx)
	if err := e.method.RegisterIn(ctx, tx, id, "kept@example.test"); err != nil {
		t.Fatal(err)
	}
	// Taken by another identity, in the same transaction or another.
	other, _ := authn.CreateIdentity(ctx, e.pool, e.clock.Now())
	if err := e.method.RegisterIn(ctx, tx, other, "kept@example.test"); !errors.Is(err, emaillink.ErrAddressTaken) {
		t.Fatalf("taken: %v", err)
	}
	// the failed statement does not poison what was fine, but we are done
	if err := tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	if emaillink.IsAddress("a@b.co") != true || emaillink.IsAddress("Name <a@b.co>") || emaillink.IsAddress("") {
		t.Fatal("IsAddress")
	}
}
