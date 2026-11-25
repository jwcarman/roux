package authn_test

import (
	"context"
	"testing"
	"time"

	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authn/authntest"
)

func TestASessionEndsAtItsLifetimeHoweverBusyItIs(t *testing.T) {
	env := authntest.New(t, "authn_lifetime")
	env.Serve()
	b := env.SignedIn(env.Identity())
	// A request every 20 minutes keeps it from idling out; 12 hours in, it ends anyway.
	for elapsed := time.Duration(0); elapsed < 12*time.Hour-20*time.Minute; elapsed += 20 * time.Minute {
		env.Clock.Advance(20 * time.Minute)
		b.Get("/api/roux/auth/me").Want(t, 200, "a busy session within its lifetime")
	}
	env.Clock.Advance(21 * time.Minute)
	b.Get("/api/roux/auth/me").Want(t, 401, "a session past its 12-hour lifetime")
}

func TestASessionLifetimeCanBeSet(t *testing.T) {
	env := authntest.NewWithConfig(t, "authn_lifetime_set", authntest.NewClock(), func(c *authn.Config) {
		c.SessionLifetime = time.Hour
	}, nil)
	env.Serve()
	b := env.SignedIn(env.Identity())
	env.Clock.Advance(25 * time.Minute)
	b.Get("/api/roux/auth/me").Want(t, 200, "within the hour")
	env.Clock.Advance(25 * time.Minute)
	b.Get("/api/roux/auth/me").Want(t, 200, "within the hour")
	env.Clock.Advance(11 * time.Minute)
	b.Get("/api/roux/auth/me").Want(t, 401, "past the hour")
}

func TestSigningInClearsSessionsDeadForAMonth(t *testing.T) {
	env := authntest.New(t, "authn_purge")
	env.Serve()
	id := env.Identity()
	sessions := func() int {
		var n int
		if err := env.Pool.QueryRow(context.Background(),
			`select count(*) from roux_session where identity_id = $1`, id).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	gone := env.SignedIn(id)
	gone.Post("/api/roux/auth/logout", nil)
	env.SignedIn(id) // abandoned: it idles out
	env.Clock.Advance(31 * 24 * time.Hour)
	recent := env.SignedIn(id)
	recent.Post("/api/roux/auth/logout", nil) // dead, but only just
	env.SignedIn(id)
	if got := sessions(); got != 2 {
		t.Fatalf("%d sessions, want 2: the month-dead two cleared, the recent two kept", got)
	}
}
