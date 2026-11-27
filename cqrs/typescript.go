package cqrs

import (
	"fmt"
	"reflect"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/money"
)

// TypeScript is the app's contract.gen.ts: an interface per Go type the endpoints name (from their
// json tags), a table of every query and command with its types, and the events each depends on or
// emits. roux-web's runtime reads the table and the TypeScript compiler checks a screen's binding
// against the types. The text is the same whatever order the endpoints come in. A type the
// contract can't describe, such as a map, or an exported field with no json tag, panics naming
// the field.
//
// A struct used both in an input and elsewhere is described twice when the two differ (an input's
// pointer members are optional): the input's interface is named <Name>Input.
func TypeScript(endpoints []Endpoint) string {
	suffixed := map[reflect.Type]bool{}
	for {
		g := &tsGen{texts: map[tsKey]string{}, suffixed: suffixed}
		out := g.generate(endpoints)
		clash := false
		for k, text := range g.texts {
			if k.input {
				continue
			}
			if in, both := g.texts[tsKey{k.t, true}]; both && in != text && !suffixed[k.t] {
				suffixed[k.t] = true
				clash = true
			}
		}
		if !clash {
			return out
		}
	}
}

type tsKey struct {
	t     reflect.Type
	input bool
}

type tsRow struct{ name, typed, table string }

type tsGen struct {
	// texts is each struct's interface, written with \x00 where its own name goes, per context.
	texts map[tsKey]string
	// suffixed are the structs whose input-side interface is named <Name>Input.
	suffixed map[reflect.Type]bool
}

func (g *tsGen) name(t reflect.Type, input bool) string {
	if input && g.suffixed[t] {
		return t.Name() + "Input"
	}
	return t.Name()
}

func (g *tsGen) generate(endpoints []Endpoint) string {
	var queries, commands []tsRow
	for _, e := range endpoints {
		d := e.Describe()
		checkArgs(d)
		in := g.ref(d.In, d.Kind == KindCommand, d.In.String())
		out := g.ref(d.Out, false, d.Out.String())
		if d.Kind == KindCommand {
			commands = append(commands, tsRow{d.Name,
				fmt.Sprintf("  %s: { input: %s; result: %s; emits: %s };\n", d.Name, in, out, jsList(d.Events)),
				fmt.Sprintf("    %s: { emits: %s },\n", d.Name, jsList(d.Events))})
			continue
		}
		queries = append(queries, tsRow{d.Name,
			fmt.Sprintf("  %s: { kind: %q; args: %s; row: %s; dependsOn: %s };\n", d.Name, d.Kind, in, out, jsList(d.Events)),
			fmt.Sprintf("    %s: { kind: %q, dependsOn: %s },\n", d.Name, d.Kind, jsList(d.Events))})
	}
	for _, rows := range [][]tsRow{queries, commands} {
		sort.Slice(rows, func(i, j int) bool { return rows[i].name < rows[j].name })
	}

	keys := make([]tsKey, 0, len(g.texts))
	for k := range g.texts {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool { return qualified(keys[i].t) < qualified(keys[j].t) })
	named := map[string]string{}
	owner := map[string]reflect.Type{}
	for _, k := range keys {
		n := g.name(k.t, k.input)
		if prior, taken := owner[n]; taken && prior != k.t {
			panic(fmt.Sprintf("cqrs: two types would both be named %q in the contract (%s and %s); rename one", n, qualified(prior), qualified(k.t)))
		}
		owner[n] = k.t
		named[n] = strings.ReplaceAll(g.texts[k], "\x00", n)
	}
	names := make([]string, 0, len(named))
	for n := range named {
		names = append(names, n)
	}
	sort.Strings(names)

	var b strings.Builder
	b.WriteString("// Generated from the Go queries and commands. Do not edit.\n\n")
	for _, n := range names {
		b.WriteString(named[n] + "\n")
	}
	lines := func(rows []tsRow, typed bool) string {
		var l strings.Builder
		for _, r := range rows {
			if typed {
				l.WriteString(r.typed)
			} else {
				l.WriteString(r.table)
			}
		}
		return l.String()
	}
	b.WriteString("export interface Queries {\n" + lines(queries, true) + "}\n\n")
	b.WriteString("export interface Commands {\n" + lines(commands, true) + "}\n\n")
	b.WriteString("/** Each query's events and each command's, for the runtime (the types above are for the compiler). */\n")
	b.WriteString("export const contract = {\n  queries: {\n" + lines(queries, false) + "  },\n  commands: {\n" + lines(commands, false) + "  },\n} as const;\n")
	return b.String()
}

func jsList(s []string) string {
	q := make([]string, len(s))
	for i, v := range s {
		q[i] = fmt.Sprintf("%q", v)
	}
	return "[" + strings.Join(q, ", ") + "]"
}

var (
	uuidType  = reflect.TypeFor[uuid.UUID]()
	moneyType = reflect.TypeFor[money.Money]()
	timeType  = reflect.TypeFor[time.Time]()
	bytesType = reflect.TypeFor[[]byte]()
)

// ref is the TypeScript for t, found at where (for the panic message); a struct becomes a named
// interface. In an input a pointer member is optional; elsewhere a pointer is a value or null.
func (g *tsGen) ref(t reflect.Type, input bool, where string) string {
	switch t {
	case uuidType, timeType, bytesType: // JSON strings: the id, an RFC 3339 time, base64
		return "string"
	case moneyType:
		k := tsKey{t, false}
		g.texts[k] = "export interface \x00 {\n  minorUnits: number;\n  currency: string;\n}\n"
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
		k := tsKey{t, input}
		if _, done := g.texts[k]; !done {
			g.texts[k] = "" // a placeholder, against recursion
			g.texts[k] = g.iface(t, input)
		}
		return g.name(t, input)
	}
	panic(fmt.Sprintf("cqrs: %s is a %s, which the contract can't describe; use a struct or a slice", where, t))
}

func (g *tsGen) iface(t reflect.Type, input bool) string {
	var members []string
	g.members(t, input, false, &members)
	if len(members) == 0 {
		return "export type \x00 = Record<string, never>;\n"
	}
	return "export interface \x00 {\n" + strings.Join(members, "") + "}\n"
}

// members appends t's members, flattening embedded structs as encoding/json does. Through an
// embedded pointer every member may be absent, so it is nullable (and optional in an input).
func (g *tsGen) members(t reflect.Type, input, nullable bool, out *[]string) {
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
		if parts[0] == "-" {
			continue
		}
		if f.Anonymous && parts[0] == "" {
			if embedded := f.Type; embedded.Kind() == reflect.Struct {
				g.members(embedded, input, nullable, out)
				continue
			} else if embedded.Kind() == reflect.Pointer && embedded.Elem().Kind() == reflect.Struct {
				g.members(embedded.Elem(), input, true, out)
				continue
			}
		}
		if !f.IsExported() {
			continue
		}
		if parts[0] == "" {
			panic(fmt.Sprintf("cqrs: %s has no json tag; tag it (json:%q) or json:\"-\" to leave it out", where, lowerFirst(f.Name)))
		}
		typ := g.ref(f.Type, input, where)
		if nullable && !strings.HasSuffix(typ, " | null") {
			typ += " | null"
		}
		optional := ""
		if input && (nullable || f.Type.Kind() == reflect.Pointer) || slices.Contains(parts[1:], "omitempty") {
			optional = "?"
		}
		*out = append(*out, fmt.Sprintf("  %s%s: %s;\n", parts[0], optional, typ))
	}
}

func lowerFirst(s string) string {
	return strings.ToLower(s[:1]) + s[1:]
}

func qualified(t reflect.Type) string { return t.PkgPath() + "." + t.Name() }
