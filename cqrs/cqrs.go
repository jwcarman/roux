// Package cqrs is typed queries and commands over one Postgres: the one HTTP shape every screen's
// runtime speaks. A query is GET /api/queries/{name} answering roux's page.Page; a command is
// POST /api/commands/{name} answering {result, events}. Each is registered as its own kit route,
// so roux's permission, CSRF and sign-in checks apply per name.
package cqrs

import (
	"context"
	"embed"
	"fmt"
	"reflect"

	"github.com/jwcarman/roux/app"
	"github.com/jwcarman/roux/pgdb"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Module is the command log's table. Turn it on before any module that registers commands.
type Module struct{}

func (Module) Name() string { return "roux-cqrs" }

func (Module) Migrations() []pgdb.Migration {
	return []pgdb.Migration{{Name: "roux-cqrs", FS: migrations, Dir: "migrations", After: []string{"roux-users"}}}
}

func (Module) Mount(context.Context, *app.Kit) error { return nil }

// Kind is what an endpoint is.
type Kind string

const (
	KindQuery   Kind = "query"   // paged: page.Page[Row]
	KindLookup  Kind = "lookup"  // one value, not paged
	KindCommand Kind = "command" // a change: {result, events}
)

// Description is an endpoint as the contract generator sees it.
type Description struct {
	Kind       Kind
	Name       string
	Permission string
	// Events a command emits, or a query depends on.
	Events []string
	// In is the query's args or the command's input; Out is the row, the lookup's value or the
	// command's result.
	In, Out reflect.Type
}

// Endpoint is a Query, a Lookup or a Command.
type Endpoint interface {
	Describe() Description
	// register mounts the endpoint on the kit, which checks its permission.
	register(k *app.Kit)
}

// Mount serves every endpoint. Names are unique across queries, lookups and commands, because the
// generated client names its functions by them; a repeated name panics when the app starts.
func Mount(k *app.Kit, endpoints ...Endpoint) {
	seen := map[string]bool{}
	for _, e := range endpoints {
		name := e.Describe().Name
		if seen[name] {
			panic(fmt.Sprintf("cqrs: two endpoints are named %q; give each its own name", name))
		}
		seen[name] = true
		e.register(k)
	}
}
