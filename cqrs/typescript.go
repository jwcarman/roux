package cqrs

import (
	"fmt"
	"reflect"
	"slices"
	"sort"
	"strings"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/money"
)

// TypeScript is the app's contract.gen.ts: an interface per Go type the endpoints name (from their
// json tags), a table of every query and command with its types, and the events each depends on or
// emits. roux-web's runtime reads the table and the TypeScript compiler checks a screen's binding
// against the types. A type the contract can't describe, such as a map, panics naming the field.
func TypeScript(endpoints []Endpoint) string {
	g := tsGen{named: map[string]string{}, types: map[string]reflect.Type{}}
	var queries, commands []string
	var queryTable, commandTable []string
	for _, e := range endpoints {
		d := e.Describe()
		isCommand := d.Kind == KindCommand
		in := g.ref(d.In, isCommand, d.In.String())
		out := g.ref(d.Out, false, d.Out.String())
		switch d.Kind {
		case KindCommand:
			commands = append(commands, fmt.Sprintf("  %s: { input: %s; result: %s; emits: %s };", d.Name, in, out, jsList(d.Events)))
			commandTable = append(commandTable, fmt.Sprintf("    %s: { emits: %s },", d.Name, jsList(d.Events)))
		default:
			queries = append(queries, fmt.Sprintf("  %s: { kind: %q; args: %s; row: %s; dependsOn: %s };", d.Name, d.Kind, in, out, jsList(d.Events)))
			queryTable = append(queryTable, fmt.Sprintf("    %s: { kind: %q, dependsOn: %s },", d.Name, d.Kind, jsList(d.Events)))
		}
	}
	names := make([]string, 0, len(g.named))
	for n := range g.named {
		names = append(names, n)
	}
	sort.Strings(names)

	var b strings.Builder
	b.WriteString("// Generated from the Go queries and commands. Do not edit.\n\n")
	for _, n := range names {
		b.WriteString(g.named[n])
		b.WriteString("\n")
	}
	b.WriteString("export interface Queries {\n" + strings.Join(queries, "\n") + "\n}\n\n")
	b.WriteString("export interface Commands {\n" + strings.Join(commands, "\n") + "\n}\n\n")
	b.WriteString("/** Each query's events and each command's, for the runtime (the types above are for the compiler). */\n")
	b.WriteString("export const contract = {\n  queries: {\n")
	for _, l := range queryTable {
		b.WriteString(l + "\n")
	}
	b.WriteString("  },\n  commands: {\n")
	for _, l := range commandTable {
		b.WriteString(l + "\n")
	}
	b.WriteString("  },\n} as const;\n")
	return b.String()
}

func jsList(s []string) string {
	q := make([]string, len(s))
	for i, v := range s {
		q[i] = fmt.Sprintf("%q", v)
	}
	return "[" + strings.Join(q, ", ") + "]"
}

type tsGen struct {
	named map[string]string
	types map[string]reflect.Type
}

var (
	uuidType  = reflect.TypeFor[uuid.UUID]()
	moneyType = reflect.TypeFor[money.Money]()
)

// ref is the TypeScript for t, found at where (for the panic message); a struct becomes a named
// interface. In an input a pointer member is optional; elsewhere a pointer is a value or null.
func (g tsGen) ref(t reflect.Type, input bool, where string) string {
	switch t {
	case uuidType:
		return "string"
	case moneyType:
		g.named["Money"] = "export interface Money {\n  minorUnits: number;\n  currency: string;\n}\n"
		return "Money"
	}
	switch t.Kind() {
	case reflect.Pointer:
		return g.ref(t.Elem(), input, where) + " | null"
	case reflect.String:
		return "string"
	case reflect.Bool:
		return "boolean"
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		return "number"
	case reflect.Slice:
		elem := g.ref(t.Elem(), input, where)
		if strings.Contains(elem, " ") {
			elem = "(" + elem + ")"
		}
		return elem + "[]"
	case reflect.Struct:
		name := t.Name()
		if prior, seen := g.types[name]; seen {
			if prior != t {
				panic(fmt.Sprintf("cqrs: two different types are named %s, which the contract can't tell apart; rename one", name))
			}
			return name
		}
		g.types[name] = t
		g.named[name] = "" // a placeholder, against recursion
		g.named[name] = g.iface(t, input)
		return name
	}
	panic(fmt.Sprintf("cqrs: %s is a %s, which the contract can't describe; use a struct or a slice", where, t))
}

func (g tsGen) iface(t reflect.Type, input bool) string {
	var members []string
	g.members(t, input, &members)
	if len(members) == 0 {
		return fmt.Sprintf("export type %s = Record<string, never>;\n", t.Name())
	}
	return fmt.Sprintf("export interface %s {\n%s}\n", t.Name(), strings.Join(members, ""))
}

// members appends t's members, flattening embedded structs as encoding/json does.
func (g tsGen) members(t reflect.Type, input bool, out *[]string) {
	for i := range t.NumField() {
		f := t.Field(i)
		where := t.Name() + "." + f.Name
		if name := f.Tag.Get("query"); name != "" {
			typ := "string"
			if allowed := f.Tag.Get("oneof"); allowed != "" {
				typ = `"` + strings.Join(strings.Split(allowed, ","), `" | "`) + `"`
			}
			*out = append(*out, fmt.Sprintf("  %s?: %s;\n", name, typ))
			continue
		}
		parts := strings.Split(f.Tag.Get("json"), ",")
		if parts[0] == "-" || !f.IsExported() && !f.Anonymous {
			continue
		}
		if f.Anonymous && parts[0] == "" && f.Type.Kind() == reflect.Struct {
			g.members(f.Type, input, out)
			continue
		}
		if parts[0] == "" || !f.IsExported() {
			continue
		}
		optional := ""
		if input && f.Type.Kind() == reflect.Pointer || slices.Contains(parts[1:], "omitempty") {
			optional = "?"
		}
		*out = append(*out, fmt.Sprintf("  %s%s: %s;\n", parts[0], optional, g.ref(f.Type, input, where)))
	}
}
