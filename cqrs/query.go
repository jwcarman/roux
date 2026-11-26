package cqrs

import (
	"context"
	"net/http"
	"net/url"
	"reflect"
	"slices"
	"sort"
	"strings"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/app"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/page"
	"github.com/jwcarman/roux/problem"
)

// Query is a typed, paged read: Args are its filters (string fields tagged `query:"name"`, with
// an optional `oneof:"A,B"`), Row is one row of its page.
type Query[A, R any] struct {
	Name       string
	Permission string
	// DependsOn names the events after which a screen showing this query refetches it.
	DependsOn []string
	// Paging is the paginator's rules (list.Config()).
	Paging page.Config
	Run    func(ctx context.Context, db page.Querier, caller *authn.Principal, req page.Request, search string, args A) (page.Page[R], error)
}

func (q Query[A, R]) Describe() Description {
	return Description{Kind: KindQuery, Name: q.Name, Permission: q.Permission, Events: q.DependsOn,
		In: reflect.TypeFor[A](), Out: reflect.TypeFor[R]()}
}

func (q Query[A, R]) register(k *app.Kit) {
	k.Handle("GET /api/queries/"+q.Name, q.Permission, func(w http.ResponseWriter, r *http.Request) error {
		req, err := api.PageRequest(r, q.Paging)
		if err != nil {
			return err
		}
		args, err := argsOf[A](r.URL.Query(), "pageIndex", "pageSize", "sortBy", "sortDirection", "search")
		if err != nil {
			return err
		}
		out, err := q.Run(r.Context(), k.Pool, authn.PrincipalFrom(r.Context()), req, r.URL.Query().Get("search"), args)
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, out)
	})
}

// Lookup is a typed read that is not a list: one record, a summary, a short fixed set of options.
type Lookup[A, R any] struct {
	Name       string
	Permission string
	DependsOn  []string
	Run        func(ctx context.Context, db page.Querier, caller *authn.Principal, args A) (R, error)
}

func (l Lookup[A, R]) Describe() Description {
	return Description{Kind: KindLookup, Name: l.Name, Permission: l.Permission, Events: l.DependsOn,
		In: reflect.TypeFor[A](), Out: reflect.TypeFor[R]()}
}

func (l Lookup[A, R]) register(k *app.Kit) {
	k.Handle("GET /api/queries/"+l.Name, l.Permission, func(w http.ResponseWriter, r *http.Request) error {
		args, err := argsOf[A](r.URL.Query())
		if err != nil {
			return err
		}
		out, err := l.Run(r.Context(), k.Pool, authn.PrincipalFrom(r.Context()), args)
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, out)
	})
}

// NoArgs is the args of a query that takes none.
type NoArgs struct{}

// argsOf fills A's `query`-tagged string fields from the URL. An empty value is absent: the field
// stays "". A parameter nobody reads, or a value outside a field's `oneof`, is a 400 on that
// parameter, the first naming the parameters that are known.
func argsOf[A any](q url.Values, paging ...string) (A, error) {
	var args A
	v := reflect.ValueOf(&args).Elem()
	t := v.Type()
	known := slices.Clone(paging)
	var bad []problem.Violation
	for i := range t.NumField() {
		f := t.Field(i)
		name := f.Tag.Get("query")
		if name == "" {
			continue
		}
		known = append(known, name)
		s := strings.TrimSpace(q.Get(name))
		if allowed := f.Tag.Get("oneof"); s != "" && allowed != "" && !slices.Contains(strings.Split(allowed, ","), s) {
			bad = append(bad, problem.Violation{Field: name, Message: name + " must be one of " + strings.Join(strings.Split(allowed, ","), ", ")})
			continue
		}
		v.Field(i).SetString(s)
	}
	sort.Strings(known)
	for key := range q {
		if !slices.Contains(known, key) {
			msg := key + " is not a parameter of this query, which takes none"
			if len(known) > 0 {
				msg = key + " is not a parameter of this query; the parameters are " + strings.Join(known, ", ")
			}
			bad = append(bad, problem.Violation{Field: key, Message: msg})
		}
	}
	if len(bad) > 0 {
		return args, problem.Validation(bad...)
	}
	return args, nil
}
