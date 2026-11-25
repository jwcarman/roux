package items

import (
	"net/http"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/app"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/problem"
)

// BasePath is where the items' endpoints live.
const BasePath = "/api/items"

// Register serves the items' endpoints; each is a kit route, so CSRF, sign-in and the
// permission are checked before the handler runs.
//
//	GET    /api/items       a page of items: search, when, assignee, status   items.read
//	POST   /api/items       add an item                                       items.write
//	GET    /api/items/{id}  one item, with what its dialog needs              items.read
//	PUT    /api/items/{id}  change it, from the version last seen (409)       items.write
//	DELETE /api/items/{id}  delete it: its author, or items.delete.any        items.write
func Register(k *app.Kit, svc Service) {
	k.Handle("GET "+BasePath, ItemsRead, func(w http.ResponseWriter, r *http.Request) error {
		req, err := api.PageRequest(r, list.Config())
		if err != nil {
			return err
		}
		f, err := filterOf(r)
		if err != nil {
			return err
		}
		out, err := svc.List(r.Context(), req, f)
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, out)
	})
	k.Handle("POST "+BasePath, ItemsWrite, func(w http.ResponseWriter, r *http.Request) error {
		in, _, err := decode(r, false)
		if err != nil {
			return err
		}
		d, err := svc.Create(r.Context(), authn.PrincipalFrom(r.Context()), in)
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusCreated, d)
	})
	k.Handle("GET "+BasePath+"/{id}", ItemsRead, func(w http.ResponseWriter, r *http.Request) error {
		id, err := itemID(r)
		if err != nil {
			return err
		}
		d, err := svc.Get(r.Context(), authn.PrincipalFrom(r.Context()), id)
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, d)
	})
	k.Handle("PUT "+BasePath+"/{id}", ItemsWrite, func(w http.ResponseWriter, r *http.Request) error {
		id, err := itemID(r)
		if err != nil {
			return err
		}
		in, version, err := decode(r, true)
		if err != nil {
			return err
		}
		d, err := svc.Update(r.Context(), authn.PrincipalFrom(r.Context()), id, version, in)
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, d)
	})
	k.Handle("DELETE "+BasePath+"/{id}", ItemsWrite, func(w http.ResponseWriter, r *http.Request) error {
		id, err := itemID(r)
		if err != nil {
			return err
		}
		if err := svc.Delete(r.Context(), authn.PrincipalFrom(r.Context()), id); err != nil {
			return err
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	})
}

func decode(r *http.Request, needVersion bool) (Input, int64, error) {
	var b body
	if err := api.DecodeLenient(r, &b); err != nil {
		return Input{}, 0, err
	}
	in, err := b.validate(needVersion)
	if err != nil {
		return Input{}, 0, err
	}
	var version int64
	if b.Version != nil {
		version = *b.Version
	}
	return in, version, nil
}

func itemID(r *http.Request) (uuid.UUID, error) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		return uuid.Nil, notFound()
	}
	return id, nil
}

// filterOf reads the list's filters; a value it does not know is a 400 on its field.
func filterOf(r *http.Request) (Filter, error) {
	q := r.URL.Query()
	f := Filter{Search: q.Get("search"), When: When(q.Get("when"))}
	switch f.When {
	case "", Anytime, Overdue, Today, ThisWeek:
	default:
		return Filter{}, problem.InvalidField("when", problem.MustBeOneOf(string(Overdue), string(Today), string(ThisWeek), string(Anytime)))
	}
	switch q.Get("status") {
	case "":
	case "open":
		f.Done = new(false)
	case "done":
		f.Done = new(true)
	default:
		return Filter{}, problem.InvalidField("status", problem.MustBeOneOf("open", "done"))
	}
	switch a := q.Get("assignee"); a {
	case "":
	case "me":
		f.Assignee = &authn.PrincipalFrom(r.Context()).IdentityID
	default:
		id, err := uuid.Parse(a)
		if err != nil {
			return Filter{}, problem.InvalidField("assignee", problem.InvalidValue)
		}
		f.Assignee = &id
	}
	return f, nil
}
