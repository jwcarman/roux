package app

import (
	"context"
	"strings"
	"testing"

	"github.com/jwcarman/roux/api"
)

// order records the order modules mount in.
type order struct {
	name string
	log  *[]string
}

func (o order) Name() string { return o.name }
func (o order) Mount(context.Context, *Kit) error {
	*o.log = append(*o.log, o.name)
	return nil
}

type orderFirst struct{ order }

func (orderFirst) mountsFirst() {}

func TestAModuleThatMountsFirstMountsBeforeTheOthersWhereverItIsListed(t *testing.T) {
	var log []string
	mods := []Module{order{"a", &log}, order{"b", &log}, orderFirst{order{"f", &log}}}
	k := &Kit{Mux: api.NewMux(), AppName: "Acme"}
	if err := Assemble(context.Background(), k, mods...); err != nil {
		t.Fatal(err)
	}
	if got, want := strings.Join(log, ","), "f,a,b"; got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestTheUsersModuleMountsFirst(t *testing.T) {
	var m Module = &Users{}
	if _, ok := m.(mountsFirst); !ok {
		t.Fatal("the users module sets what the others read while mounting: it must mount first")
	}
}
