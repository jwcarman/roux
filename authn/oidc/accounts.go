package oidc

import (
	"context"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/authn"
)

func (m *Method) mountAccounts(h *authn.Host) {
	h.HandleSigned("GET /me/accounts", m.listAccounts)
	h.HandleSigned("POST /me/accounts/{id}", m.startLink)
	h.HandleSigned("DELETE /me/accounts/{id}", m.unlink)
}

// providerOf names an account's provider as the page knows it: the id of the configured
// provider with that issuer, or the issuer itself when none matches any more.
func (m *Method) providerOf(issuer string) string {
	for _, id := range m.order {
		if m.providers[id].p.Issuer == issuer {
			return id
		}
	}
	return issuer
}

func (m *Method) listAccounts(w http.ResponseWriter, r *http.Request, p *authn.Principal) error {
	rows, err := m.pool.Query(r.Context(), `
		select f.id, f.issuer, f.created_at
		  from roux_federated_credential f
		  join roux_credential_identity ci on ci.credential_id = f.id
		 where ci.identity_id = $1
		 order by f.created_at, f.id`, p.IdentityID)
	if err != nil {
		return err
	}
	type account struct {
		ID       uuid.UUID `json:"id"`
		Provider string    `json:"provider"`
		LinkedAt time.Time `json:"linkedAt"`
	}
	list, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (account, error) {
		var a account
		var issuer string
		if err := row.Scan(&a.ID, &issuer, &a.LinkedAt); err != nil {
			return a, err
		}
		a.Provider, a.LinkedAt = m.providerOf(issuer), a.LinkedAt.UTC()
		return a, nil
	})
	if err != nil {
		return err
	}
	if list == nil {
		list = []account{}
	}
	return api.JSON(w, http.StatusOK, list)
}

// startLink begins linking a provider account. It starts only when the person asks, from a
// signed-in browser (so CSRF protection applies and only the app's own pages can start one),
// and the flow remembers on the server which identity asked: nothing in the URL says it is a
// link, so no other site can turn a sign-in into one.
func (m *Method) startLink(w http.ResponseWriter, r *http.Request, p *authn.Principal) error {
	rt, ok := m.providers[r.PathValue("id")]
	if !ok {
		return unknownProvider()
	}
	if err := m.host.RequireRecent(p); err != nil {
		return err
	}
	target, err := m.begin(w, r, rt, &p.IdentityID)
	if err != nil {
		return err
	}
	if wantsJSON(r) {
		return api.JSON(w, http.StatusOK, map[string]string{"redirectUrl": target})
	}
	http.Redirect(w, r, target, http.StatusFound)
	return nil
}

func (m *Method) owns(ctx context.Context, db authn.DBTX, identityID, id uuid.UUID) (bool, error) {
	var found int
	err := db.QueryRow(ctx, `
		select 1 from roux_federated_credential f
		  join roux_credential_identity ci on ci.credential_id = f.id
		 where f.id = $1 and ci.identity_id = $2`, id, identityID).Scan(&found)
	if err == pgx.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

// unlink removes one of the caller's accounts. The last way in stays (409 last-credential),
// and a session that signed in with the account ends with it.
func (m *Method) unlink(w http.ResponseWriter, r *http.Request, p *authn.Principal) error {
	ctx := r.Context()
	if err := m.host.RequireRecent(p); err != nil {
		return err
	}
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		return accountNotFound()
	}
	if owned, err := m.owns(ctx, m.pool, p.IdentityID, id); err != nil {
		return err
	} else if !owned {
		return accountNotFound()
	}
	err = m.host.RemoveIfNotLast(ctx, p.IdentityID, func(ctx context.Context, tx pgx.Tx) error {
		if owned, err := m.owns(ctx, tx, p.IdentityID, id); err != nil {
			return err
		} else if !owned {
			return accountNotFound() // unlinked by someone else meanwhile
		}
		if _, err := tx.Exec(ctx, `delete from roux_credential_identity where credential_id = $1`, id); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `delete from roux_federated_credential where id = $1`, id); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `update roux_session set ended_at = $2 where credential_id = $1 and ended_at is null`, id, m.now())
		return err
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
