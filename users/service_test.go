package users_test

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authz"
	"github.com/jwcarman/roux/problem"
)

// wantProblem fails unless err is a problem with the status and detail.
func wantProblem(t *testing.T, err error, status int, detail string) {
	t.Helper()
	var p *problem.Problem
	if !errors.As(err, &p) || p.Status != status || p.Detail != detail {
		t.Fatalf("want %d %q, got %v", status, detail, err)
	}
}

func TestResendingToSomeoneWithNoAddressSaysSo(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	var id uuid.UUID
	err := pgx.BeginFunc(ctx, f.Pool, func(tx pgx.Tx) error {
		var err error
		if id, err = authn.CreateIdentity(ctx, tx, f.Clock.Now()); err != nil {
			return err
		}
		return f.svc.SignUp(ctx, tx, id, "Ada Lovelace", "USER") // a provider sign-up: no address
	})
	if err != nil {
		t.Fatal(err)
	}

	_, err = f.svc.ResendInvitation(ctx, id)

	wantProblem(t, err, http.StatusBadRequest, "They have no email address to send to")
}

func TestRenamingYourselfWhenYouAreGoneIsNotFound(t *testing.T) {
	f := setup(t)

	_, err := f.svc.RenameMe(context.Background(), uuid.New(), "Ghost", nil)

	wantProblem(t, err, http.StatusNotFound, "No such user")
}

func TestManagingSomeoneTakesASignedInCaller(t *testing.T) {
	f := setup(t)
	ada := f.person("Ada", "ada@example.test", "USER")

	_, err := f.svc.ChangeRole(context.Background(), ada, "COACH")

	wantProblem(t, err, http.StatusForbidden, problem.Forbidden().Detail)
}

func TestMakingAnOwnerOfAnOwnerChangesNothing(t *testing.T) {
	f := setup(t)
	ctx := context.Background()

	d, err := f.svc.MakeOwner(ctx, f.owner)

	if err != nil || d.Role == nil || *d.Role != authz.RoleOwner {
		t.Fatalf("%+v %v", d, err)
	}
	roles, err := authz.RolesOf(ctx, f.Pool, f.owner)
	if err != nil || len(roles) != 1 {
		t.Fatalf("%v %v", roles, err)
	}
	if n := f.count(`select count(*) from roux_activity where type = 'user.role_changed'`); n != 0 {
		t.Fatalf("%d role changes recorded", n)
	}
}
