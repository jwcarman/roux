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
		checkArgs(e.Describe())
		e.register(k)
	}
}

// checkArgs panics, naming the endpoint, unless a query's or lookup's args are a struct whose every
// exported field is a string tagged `query`: the shape argsOf reads and the contract describes.
// Mount and TypeScript both call it, so a bad args struct fails at start-up and in the contract
// test rather than as a 500 on every request.
func checkArgs(d Description) {
	if d.Kind == KindCommand {
		return
	}
	if d.In.Kind() != reflect.Struct {
		panic(fmt.Sprintf("cqrs: %s %q takes args of type %s; args are a struct of query-tagged strings, or cqrs.NoArgs", d.Kind, d.Name, d.In))
	}
	for i := range d.In.NumField() {
		f := d.In.Field(i)
		name := f.Tag.Get("query")
		switch {
		case name == "" && f.IsExported():
			panic(fmt.Sprintf("cqrs: %s %q arg field %s has no query tag; tag it query:%q or unexport it", d.Kind, d.Name, f.Name, lowerFirst(f.Name)))
		case name == "":
		case !f.IsExported():
			panic(fmt.Sprintf("cqrs: %s %q arg %s is unexported; export it or drop its query tag", d.Kind, d.Name, f.Name))
		case f.Type.Kind() != reflect.String:
			panic(fmt.Sprintf("cqrs: %s %q arg %s has type %s; query args are strings — make it a string (with oneof for a fixed set)", d.Kind, d.Name, f.Name, f.Type))
		}
	}
}
