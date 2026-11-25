package users_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/problem"
	"github.com/jwcarman/roux/users"
)

func TestOnlyActiveMembersPassTheCheck(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	ada := f.person("Ada", "ada@example.test", "")
	grace := f.person("Grace", "grace@example.test", "")
	if err := users.MustBeActive(ctx, f.Pool, "assigneeIds", []uuid.UUID{ada, grace, ada}); err != nil {
		t.Fatalf("active members, one twice: %v", err)
	}
	if err := users.MustBeActive(ctx, f.Pool, "assigneeIds", nil); err != nil {
		t.Fatalf("nobody: %v", err)
	}
	if _, err := f.Pool.Exec(ctx, `update roux_identity set status = 'DEACTIVATED' where id = $1`, grace); err != nil {
		t.Fatal(err)
	}
	for name, ids := range map[string][]uuid.UUID{"deactivated": {ada, grace}, "a stranger": {uuid.New()}} {
		err := users.MustBeActive(ctx, f.Pool, "assigneeIds", ids)
		var p *problem.Problem
		if !errors.As(err, &p) || p.Status != 400 || len(p.Errors) != 1 ||
			p.Errors[0].Field != "assigneeIds" || p.Errors[0].Message != users.MustBeActiveMembers {
			t.Errorf("%s: %v", name, err)
		}
	}
}

func TestMembersAreNamedInOrderWithWhetherTheyAreActive(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	grace := f.person("grace Hopper", "grace@example.test", "")
	ada := f.person("Ada Lovelace", "ada@example.test", "")
	if _, err := f.Pool.Exec(ctx, `update roux_identity set status = 'DEACTIVATED' where id = $1`, grace); err != nil {
		t.Fatal(err)
	}
	got, err := users.Members(ctx, f.Pool, []uuid.UUID{grace, ada, uuid.New()})
	if err != nil {
		t.Fatal(err)
	}
	want := []users.Member{{ID: ada, Name: "Ada Lovelace", Active: true}, {ID: grace, Name: "grace Hopper", Active: false}}
	if len(got) != 2 || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestActiveMembersAreEveryoneWhoMayBeAssignedNow(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	grace := f.person("Grace Hopper", "grace@example.test", "")
	lin := f.person("lin Chen", "lin@example.test", "")
	ada := f.person("Ada Lovelace", "ada@example.test", "")
	if _, err := f.Pool.Exec(ctx, `update roux_identity set status = 'DEACTIVATED' where id = $1`, grace); err != nil {
		t.Fatal(err)
	}
	got, err := users.ActiveMembers(ctx, f.Pool)
	if err != nil {
		t.Fatal(err)
	}
	// setup's owner, Olive, is a member too.
	want := []users.Member{{ID: ada, Name: "Ada Lovelace", Active: true}, {ID: lin, Name: "lin Chen", Active: true}, {ID: f.owner, Name: "Olive Owner", Active: true}}
	if len(got) != 3 || got[0] != want[0] || got[1] != want[1] || got[2] != want[2] {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}
