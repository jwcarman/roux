package users

import (
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authn/emaillink"
	"github.com/jwcarman/roux/problem"
)

// BasePath is where the users' endpoints live.
const BasePath = "/api/users"

type nameChange struct {
	DisplayName *string `json:"displayName"`
	Version     *int64  `json:"version"`
}

type roleChange struct {
	Role *string `json:"role"`
}

type invitationRequest struct {
	Name  *string `json:"name"`
	Email *string `json:"email"`
	Role  *string `json:"role"`
}

// invitationResult is what became of an invitation's email.
type invitationResult struct {
	LinkSent bool `json:"linkSent"`
}

func strip(p *string) string {
	if p == nil {
		return ""
	}
	return strings.TrimSpace(*p)
}

// nameViolations checks a display name as roux's forms do: not blank, at most 80.
func nameViolations(field, name string) []problem.Violation {
	switch {
	case name == "":
		return []problem.Violation{{Field: field, Message: problem.MustNotBeBlank}}
	case utf8.RuneCountInString(name) > MaxNameLength:
		return []problem.Violation{{Field: field, Message: problem.MustBeBetween(0, MaxNameLength)}}
	}
	return nil
}

func (r nameChange) validate() (name string, err error) {
	name = strip(r.DisplayName)
	v := nameViolations("displayName", name)
	if r.Version == nil {
		v = append(v, problem.Violation{Field: "version", Message: problem.MustNotBeEmpty})
	}
	if len(v) > 0 {
		return "", problem.Validation(v...)
	}
	return name, nil
}

func (r invitationRequest) validate() (name, email, role string, err error) {
	name, email, role = strip(r.Name), strip(r.Email), strip(r.Role)
	v := nameViolations("name", name)
	switch {
	case email == "":
		v = append(v, problem.Violation{Field: "email", Message: problem.MustNotBeBlank})
	case !emaillink.IsAddress(email):
		v = append(v, problem.Violation{Field: "email", Message: problem.ValidEmail})
	}
	if role == "" {
		v = append(v, problem.Violation{Field: "role", Message: problem.MustNotBeBlank})
	}
	if len(v) > 0 {
		return "", "", "", problem.Validation(v...)
	}
	return name, email, role, nil
}

// userID reads the {id} of the path. An id that is not even a UUID names no one: 404.
func userID(r *http.Request) (uuid.UUID, error) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		return uuid.Nil, problem.New(http.StatusNotFound, "")
	}
	return id, nil
}

func me(r *http.Request) uuid.UUID { return authn.PrincipalFrom(r.Context()).IdentityID }

// Register serves the users' endpoints, and records each user's first sign-in.
//
//	GET  /api/users/me                 the signed-in user                      (signed in)
//	PUT  /api/users/me                 rename themselves                       (signed in)
//	GET  /api/users                    a page of users, filtered              users.read
//	GET  /api/users/{id}               one user                                users.read
//	GET  /api/users/{id}/activities    their history, newest first             users.read
//	POST /api/users/invitations        invite someone                          users.invite
//	POST /api/users/{id}/invitation    send their invitation again             users.invite
//	PUT  /api/users/{id}/name          rename                                  users.manage
//	PUT  /api/users/{id}/role          change their role                       users.manage
//	POST /api/users/{id}/owner         make an owner (recent sign-in)          users.owners
//	POST /api/users/{id}/deactivate    deactivate                              users.manage
//	POST /api/users/{id}/reactivate    reactivate                              users.manage
//	POST /api/users/{id}/sign-out      end all their sessions                  users.manage
func Register(mux *api.Mux, host *authn.Host, svc Service) {
	host.OnSignedIn(svc.FirstSignIn)

	// the signed-in user's own name
	mux.Handle("GET "+BasePath+"/me", host.Guard("", func(w http.ResponseWriter, r *http.Request) error {
		m, err := svc.Me(r.Context(), me(r))
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, m)
	}))
	mux.Handle("PUT "+BasePath+"/me", host.Guard("", func(w http.ResponseWriter, r *http.Request) error {
		var req nameChange
		if err := api.DecodeLenient(r, &req); err != nil {
			return err
		}
		name, err := req.validate()
		if err != nil {
			return err
		}
		m, err := svc.RenameMe(r.Context(), me(r), name, req.Version)
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, m)
	}))

	// reading
	mux.Handle("GET "+BasePath, host.Guard(UsersRead, func(w http.ResponseWriter, r *http.Request) error {
		req, err := api.PageRequest(r, ListConfig)
		if err != nil {
			return err
		}
		q := r.URL.Query()
		status := q.Get("status")
		if status != "" && status != StatusActive && status != StatusDeactivated {
			return problem.InvalidField("status", problem.MustBeOneOf(StatusActive, StatusDeactivated))
		}
		out, err := svc.List(r.Context(), req, Filter{Search: q.Get("search"), Role: q.Get("role"), Status: status})
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, out)
	}))
	mux.Handle("GET "+BasePath+"/{id}", host.Guard(UsersRead, func(w http.ResponseWriter, r *http.Request) error {
		id, err := userID(r)
		if err != nil {
			return err
		}
		d, err := svc.Detail(r.Context(), id)
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, d)
	}))
	mux.Handle("GET "+BasePath+"/{id}/activities", host.Guard(UsersRead, func(w http.ResponseWriter, r *http.Request) error {
		id, err := userID(r)
		if err != nil {
			return err
		}
		req, err := api.PageRequestUnsorted(r)
		if err != nil {
			return err
		}
		out, err := svc.Activities(r.Context(), id, req)
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, out)
	}))

	// invitations
	mux.Handle("POST "+BasePath+"/invitations", host.Guard(UsersInvite, func(w http.ResponseWriter, r *http.Request) error {
		var req invitationRequest
		if err := api.DecodeLenient(r, &req); err != nil {
			return err
		}
		name, email, role, err := req.validate()
		if err != nil {
			return err
		}
		sent, err := svc.Invite(r.Context(), name, email, role)
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusAccepted, invitationResult{LinkSent: sent})
	}))
	mux.Handle("POST "+BasePath+"/{id}/invitation", host.Guard(UsersInvite, func(w http.ResponseWriter, r *http.Request) error {
		id, err := userID(r)
		if err != nil {
			return err
		}
		sent, err := svc.ResendInvitation(r.Context(), id)
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusAccepted, invitationResult{LinkSent: sent})
	}))

	// managing
	mux.Handle("PUT "+BasePath+"/{id}/name", host.Guard(UsersManage, func(w http.ResponseWriter, r *http.Request) error {
		id, err := userID(r)
		if err != nil {
			return err
		}
		var req nameChange
		if err := api.DecodeLenient(r, &req); err != nil {
			return err
		}
		name, err := req.validate()
		if err != nil {
			return err
		}
		d, err := svc.Rename(r.Context(), id, name, req.Version)
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, d)
	}))
	mux.Handle("PUT "+BasePath+"/{id}/role", host.Guard(UsersManage, func(w http.ResponseWriter, r *http.Request) error {
		id, err := userID(r)
		if err != nil {
			return err
		}
		var req roleChange
		if err := api.DecodeLenient(r, &req); err != nil {
			return err
		}
		role := strip(req.Role)
		if role == "" {
			return problem.InvalidField("role", problem.MustNotBeBlank)
		}
		d, err := svc.ChangeRole(r.Context(), id, role)
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, d)
	}))
	mux.Handle("POST "+BasePath+"/{id}/owner", host.Guard(UsersOwners, func(w http.ResponseWriter, r *http.Request) error {
		id, err := userID(r)
		if err != nil {
			return err
		}
		if err := host.RequireRecentSignIn(r.Context()); err != nil {
			return err
		}
		d, err := svc.MakeOwner(r.Context(), id)
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, d)
	}))
	mux.Handle("POST "+BasePath+"/{id}/deactivate", host.Guard(UsersManage, func(w http.ResponseWriter, r *http.Request) error {
		id, err := userID(r)
		if err != nil {
			return err
		}
		d, err := svc.Deactivate(r.Context(), me(r), id)
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, d)
	}))
	mux.Handle("POST "+BasePath+"/{id}/reactivate", host.Guard(UsersManage, func(w http.ResponseWriter, r *http.Request) error {
		id, err := userID(r)
		if err != nil {
			return err
		}
		d, err := svc.Reactivate(r.Context(), id)
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, d)
	}))
	mux.Handle("POST "+BasePath+"/{id}/sign-out", host.Guard(UsersManage, func(w http.ResponseWriter, r *http.Request) error {
		id, err := userID(r)
		if err != nil {
			return err
		}
		if err := svc.SignOutEverywhere(r.Context(), id); err != nil {
			return err
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	}))
}
