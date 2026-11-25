package apikey

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/authn"
)

func cannotManageKeys() error {
	return authn.NewError(http.StatusForbidden, "api-key-cannot-manage-keys", "An API key cannot manage API keys")
}
func notFound() error {
	return authn.NewError(http.StatusNotFound, "api-key-not-found", "No such API key")
}
func invalid(detail string) error {
	return authn.NewError(http.StatusBadRequest, "invalid-request", detail)
}

func (m *Method) mountEndpoints(h *authn.Host) {
	h.HandleAny("GET /me/api-keys", m.manager(m.list))
	h.HandleAny("POST /me/api-keys", m.manager(m.create))
	h.HandleAny("POST /me/api-keys/{id}/rotations", m.manager(m.rotate))
	h.HandleAny("DELETE /me/api-keys/{id}", m.manager(m.revoke))
	h.HandleAny("GET /me/api-keys/current", m.current)
}

// manager is the guard of the endpoints that manage keys: a person at a browser. A request an
// API key signed in is refused in its own words, so a leaked key can never make itself
// permanent; a key beside a session cookie is refused like every other account endpoint.
func (m *Method) manager(fn func(http.ResponseWriter, *http.Request, *authn.Principal) error) func(http.ResponseWriter, *http.Request, *authn.Principal) error {
	return func(w http.ResponseWriter, r *http.Request, p *authn.Principal) error {
		switch {
		case p.Method == authn.MethodAPIKey:
			return cannotManageKeys()
		case !p.Browser && p.Method != authn.MethodJWT: // a bearer token may manage keys, as a person may
			return authn.BrowserSessionRequired()
		}
		return fn(w, r, p)
	}
}

type keyView struct {
	ID         uuid.UUID  `json:"id"`
	Name       string     `json:"name"`
	Scopes     []string   `json:"scopes"`
	CreatedAt  time.Time  `json:"createdAt"`
	ExpiresAt  time.Time  `json:"expiresAt"`
	LastUsedAt *time.Time `json:"lastUsedAt"`
}

type newKeyView struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Scopes    []string  `json:"scopes"`
	ExpiresAt time.Time `json:"expiresAt"`
	Key       string    `json:"key"`
}

func scanView(row pgx.Row) (keyView, error) {
	var v keyView
	err := row.Scan(&v.ID, &v.Name, &v.Scopes, &v.CreatedAt, &v.ExpiresAt, &v.LastUsedAt)
	v.CreatedAt, v.ExpiresAt = v.CreatedAt.UTC(), v.ExpiresAt.UTC()
	if v.LastUsedAt != nil {
		u := v.LastUsedAt.UTC()
		v.LastUsedAt = &u
	}
	if v.Scopes == nil {
		v.Scopes = []string{}
	}
	return v, err
}

const viewColumns = `id, name, scopes, created_at, expires_at, last_used_at`

func (m *Method) list(w http.ResponseWriter, r *http.Request, p *authn.Principal) error {
	rows, err := m.pool.Query(r.Context(), `select `+viewColumns+` from roux_api_key where identity_id = $1 order by name, created_at, id`, p.IdentityID)
	if err != nil {
		return err
	}
	keys, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (keyView, error) { return scanView(row) })
	if err != nil {
		return err
	}
	if keys == nil {
		keys = []keyView{}
	}
	return api.JSON(w, http.StatusOK, keys)
}

// current is the key that signed this request in, taken from the sign-in and never from the
// request, so a machine can read its own expiry and nothing else.
func (m *Method) current(w http.ResponseWriter, r *http.Request, p *authn.Principal) error {
	if p.Method != authn.MethodAPIKey {
		return notFound()
	}
	v, err := scanView(m.pool.QueryRow(r.Context(), `select `+viewColumns+` from roux_api_key where id = $1 and identity_id = $2`, p.CredentialID, p.IdentityID))
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound()
	}
	if err != nil {
		return err
	}
	return api.JSON(w, http.StatusOK, v)
}

type createRequest struct {
	Name     *string  `json:"name"`
	Lifetime *string  `json:"lifetime"`
	Scopes   []string `json:"scopes"`
}

func (c createRequest) validate(longest time.Duration, held []string) (name string, lifetime time.Duration, scopes []string, err error) {
	switch {
	case c.Name == nil || strings.TrimSpace(*c.Name) == "":
		return "", 0, nil, invalid("name must not be blank")
	case utf8.RuneCountInString(strings.TrimSpace(*c.Name)) > maxText:
		return "", 0, nil, invalid("name must be at most 255 characters")
	case c.Lifetime == nil:
		return "", 0, nil, invalid("lifetime is required, as an ISO-8601 duration such as P90D")
	case len(c.Scopes) == 0:
		return "", 0, nil, invalid("scopes must name at least one permission")
	}
	if lifetime, err = parseDuration(*c.Lifetime); err != nil {
		return "", 0, nil, invalid("lifetime: " + err.Error())
	}
	if lifetime <= 0 || lifetime > longest {
		return "", 0, nil, invalid("lifetime must be longer than zero and at most " + dayText(longest))
	}
	for _, s := range c.Scopes {
		switch {
		case strings.TrimSpace(s) == "":
			return "", 0, nil, invalid("a scope must not be blank")
		case utf8.RuneCountInString(s) > maxText:
			return "", 0, nil, invalid("a scope must be at most 255 characters")
		case !slices.Contains(held, s):
			return "", 0, nil, invalid("scopes may only be permissions you hold now")
		case !slices.Contains(scopes, s):
			scopes = append(scopes, s)
		}
	}
	sort.Strings(scopes)
	return strings.TrimSpace(*c.Name), lifetime, scopes, nil
}

func dayText(d time.Duration) string {
	if days := int(d / (24 * time.Hour)); days != 1 {
		return fmt.Sprintf("%d days", days)
	}
	return "1 day"
}

// create makes a key for the caller, who must have signed in recently. The key is in this
// answer and nowhere else.
func (m *Method) create(w http.ResponseWriter, r *http.Request, p *authn.Principal) error {
	if err := m.requireRecent(p); err != nil {
		return err
	}
	var body createRequest
	if err := api.DecodeLenient(r, &body); err != nil {
		return invalid("the body must be a JSON object with name, lifetime and scopes")
	}
	name, lifetime, scopes, err := body.validate(m.cfg.MaxLifetime, p.Permissions)
	if err != nil {
		return err
	}
	now := m.now()
	v, err := m.insert(r.Context(), m.pool, p.IdentityID, name, scopes, now, now.Add(lifetime))
	if err != nil {
		return err
	}
	m.notify(r.Context(), p.IdentityID, name)
	return api.JSON(w, http.StatusCreated, v)
}

func (m *Method) insert(ctx context.Context, db authn.DBTX, identityID uuid.UUID, name string, scopes []string, created, expires time.Time) (newKeyView, error) {
	key, err := newKey(m.cfg.Prefix)
	if err != nil {
		return newKeyView{}, err
	}
	id, err := uuid.NewV7()
	if err != nil {
		return newKeyView{}, err
	}
	if _, err := db.Exec(ctx, `
		insert into roux_api_key (id, identity_id, name, scopes, key_hash, created_at, expires_at)
		values ($1, $2, $3, $4, $5, $6, $7)`, id, identityID, name, scopes, hashOf(key), created, expires); err != nil {
		return newKeyView{}, err
	}
	return newKeyView{ID: id, Name: name, Scopes: scopes, ExpiresAt: expires.UTC(), Key: key}, nil
}

type rotateRequest struct {
	Overlap *string `json:"overlap"`
}

// rotate replaces one of the caller's keys: a new key with the old one's name and scopes and the
// old one's lifetime counted from now (at most the longest a key may last). The old key keeps
// working for the overlap, then expires; sooner if it already would.
func (m *Method) rotate(w http.ResponseWriter, r *http.Request, p *authn.Principal) error {
	ctx := r.Context()
	if err := m.requireRecent(p); err != nil {
		return err
	}
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		return notFound()
	}
	var body rotateRequest
	if err := api.DecodeLenient(r, &body); err != nil || body.Overlap == nil {
		return invalid("the body must be a JSON object with overlap, an ISO-8601 duration such as PT1H")
	}
	overlap, err := parseDuration(*body.Overlap)
	if err != nil {
		return invalid("overlap: " + err.Error())
	}
	if overlap < 0 || overlap > MaxOverlap {
		return invalid("overlap must be between zero and 7 days")
	}

	tx, err := m.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // a no-op after commit
	var (
		name            string
		scopes          []string
		created, expiry time.Time
	)
	err = tx.QueryRow(ctx, `select name, scopes, created_at, expires_at from roux_api_key where id = $1 and identity_id = $2 for update`,
		id, p.IdentityID).Scan(&name, &scopes, &created, &expiry)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound()
	}
	if err != nil {
		return err
	}
	now := m.now()
	if !expiry.After(now) {
		return invalid("that key has already expired and cannot be rotated")
	}
	lifetime := min(expiry.Sub(created), m.cfg.MaxLifetime)
	v, err := m.insert(ctx, tx, p.IdentityID, name, scopes, now, now.Add(lifetime))
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `update roux_api_key set expires_at = least(expires_at, $2) where id = $1`, id, now.Add(overlap)); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	m.notify(ctx, p.IdentityID, name)
	return api.JSON(w, http.StatusCreated, v)
}

// revoke deletes one of the caller's keys: the next request with it is refused.
func (m *Method) revoke(w http.ResponseWriter, r *http.Request, p *authn.Principal) error {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		return notFound()
	}
	tag, err := m.pool.Exec(r.Context(), `delete from roux_api_key where id = $1 and identity_id = $2`, id, p.IdentityID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return notFound()
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// requireRecent: making or rotating a key needs a recent sign-in, for a browser and a bearer
// token alike. A key outlives the token by months, so a leaked token must not be able to make
// one; a token's sign-in is its auth_time, which a refresh does not move.
func (m *Method) requireRecent(p *authn.Principal) error {
	return m.host.RequireRecent(p)
}
