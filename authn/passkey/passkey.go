// Package passkey is sign-in with passkeys (WebAuthn). A passkey is the
// only factor: the device verifies the person (a PIN, a fingerprint, a face) and holds
// a discoverable credential, so nobody types a name. Endpoints under /api/roux/auth:
//
//	POST   /api/roux/auth/passkey/sign-in/options   a challenge for the browser; no session needed
//	POST   /api/roux/auth/passkey/sign-in           200 {"identityId"} and a session, or 401
//	POST   /api/roux/auth/me/passkeys/options       a challenge to create a passkey   (recent sign-in)
//	POST   /api/roux/auth/me/passkeys               {"publicKey":{"credential","label"}} -> {"success":true}
//	GET    /api/roux/auth/me/passkeys               [{credentialId,label,createdAt,lastUsedAt}], oldest first
//	DELETE /api/roux/auth/me/passkeys/{credentialId}  204 (recent sign-in; never the last way in)
//
// A challenge lives in a ceremony: one database row behind a short-lived cookie, used
// once. Registering needs a recent sign-in, so the first factor (usually the mailbox)
// stays the root of trust; sign-in by passkey cannot be an app's only way in.
package passkey

import (
	"context"
	"embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/pgdb"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Migration is the passkey schema; it runs after authn's.
var Migration = pgdb.Migration{Name: "roux-authn-passkey", FS: migrations, Dir: "migrations", After: []string{"roux-authn"}}

const (
	// methodName is how /api/roux/auth/me reports a session that signed in by passkey.
	methodName = "passkey"
	// maxBody caps a WebAuthn response (an attestation can run to several KB).
	maxBody  = 64 << 10
	maxLabel = 64
)

// Method is passkey sign-in. Pass it to authn.Register.
type Method struct {
	cfg  Config
	web  *webauthn.WebAuthn
	pool *pgxpool.Pool
	host *authn.Host
	wg   sync.WaitGroup
}

// New validates the configuration (naming the fix in any error) and returns the method.
// User verification and a discoverable credential are always required.
func New(cfg Config) (*Method, error) {
	cfg, err := cfg.validate()
	if err != nil {
		return nil, err
	}
	required := true
	web, err := webauthn.New(&webauthn.Config{
		RPID:                  cfg.RPID,
		RPDisplayName:         cfg.RPName,
		RPOrigins:             cfg.AllowedOrigins,
		AttestationPreference: protocol.PreferNoAttestation,
		AuthenticatorSelection: protocol.AuthenticatorSelection{
			RequireResidentKey: &required,
			ResidentKey:        protocol.ResidentKeyRequirementRequired,
			UserVerification:   protocol.VerificationRequired,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("passkey: %w", err)
	}
	return &Method{cfg: cfg, web: web}, nil
}

func (m *Method) now() time.Time { return m.cfg.Clock().UTC() }

// Contribute turns passkey sign-in on in GET /api/roux/auth/sign-in.
func (m *Method) Contribute(o *authn.SignInOptions) { o.Passkey = true }

// Wait blocks until the "passkey added" notices still being sent are done.
func (m *Method) Wait() { m.wg.Wait() }

// Mount registers the endpoints and the credential counter.
func (m *Method) Mount(h *authn.Host) error {
	if m.pool = h.Pool(); m.pool == nil {
		return errors.New("passkey: authn.Config.Pool is required")
	}
	m.host = h
	h.AddCounter(authn.Counter{Kind: "passkey", Count: count})

	h.Handle("POST /passkey/sign-in/options", m.signInOptions)
	h.Handle("POST /passkey/sign-in", m.signIn)
	h.HandleSigned("POST /me/passkeys/options", m.registerOptions)
	h.HandleSigned("POST /me/passkeys", m.register)
	h.HandleSigned("GET /me/passkeys", m.list)
	h.HandleSigned("DELETE /me/passkeys/{credentialId}", m.remove)
	return nil
}

// ---- roux's errors ----

func invalidRegistration() error {
	return authn.NewError(http.StatusBadRequest, "invalid-passkey-registration", "Invalid passkey registration")
}

func notFound() error {
	return authn.NewError(http.StatusNotFound, "passkey-not-found", "No such passkey")
}

// ---- the person: a WebAuthn user ----

type account struct {
	handle        []byte
	name, display string
	credentials   []webauthn.Credential
}

func (a account) WebAuthnID() []byte                         { return a.handle }
func (a account) WebAuthnName() string                       { return a.name }
func (a account) WebAuthnDisplayName() string                { return a.display }
func (a account) WebAuthnCredentials() []webauthn.Credential { return a.credentials }

// ---- sign in ----

func (m *Method) signInOptions(w http.ResponseWriter, r *http.Request) error {
	assertion, session, err := m.web.BeginDiscoverableLogin(webauthn.WithUserVerification(protocol.VerificationRequired))
	if err != nil {
		return err
	}
	if err := m.startCeremony(r.Context(), w, r, kindSignIn, nil, *session); err != nil {
		return err
	}
	return api.JSON(w, http.StatusOK, assertion.Response)
}

// signIn checks an assertion. Every failure is the same SignInFailed; the reason goes to
// the debug log only. The ceremony is spent first, so a response can be tried only once.
func (m *Method) signIn(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	fail := func(reason string, err error) error {
		slog.DebugContext(ctx, "passkey sign-in failed", "reason", reason, "err", err)
		return authn.SignInFailed()
	}

	cer, ok, err := m.takeCeremony(ctx, w, r, kindSignIn)
	if err != nil {
		return err
	}
	if !ok {
		return fail("no ceremony", nil)
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, maxBody+1))
	if err != nil || len(body) > maxBody {
		return fail("body", err)
	}
	parsed, err := protocol.ParseCredentialRequestResponseBytes(body)
	if err != nil {
		return fail("parse", err)
	}

	var passkey stored
	_, credential, err := m.web.ValidatePasskeyLogin(func(rawID, userHandle []byte) (webauthn.User, error) {
		var acc account
		var found bool
		var err error
		if passkey, acc, found, err = m.byWebAuthnID(ctx, m.pool, rawID); err != nil {
			return nil, err
		} else if !found {
			return nil, errors.New("unknown credential")
		}
		if !equal(acc.handle, userHandle) {
			return nil, errors.New("user handle does not match the credential")
		}
		return acc, nil
	}, cer.session, parsed)
	if err != nil {
		return fail("validation", err)
	}
	if credential.Authenticator.CloneWarning {
		// The counter went backwards: a copied authenticator. Refuse, and say so in the log.
		slog.WarnContext(ctx, "passkey sign-in refused: possible cloned authenticator", "credential", passkey.id)
		return authn.SignInFailed()
	}

	res, identityID, err := authn.Resolve(ctx, m.pool, passkey.id)
	if err != nil {
		return err
	}
	if res != authn.Resolved {
		return fail("identity not active", nil)
	}
	if err := m.recordUse(ctx, passkey.id, *credential); err != nil {
		return err
	}
	if err := m.host.StartSession(w, r, identityID, passkey.id, methodName); err != nil {
		return err
	}
	return api.JSON(w, http.StatusOK, struct {
		IdentityID string `json:"identityId"`
	}{identityID.String()})
}

func equal(a, b []byte) bool { return string(a) == string(b) }

// ---- register ----

func (m *Method) registerOptions(w http.ResponseWriter, r *http.Request, p *authn.Principal) error {
	ctx := r.Context()
	if err := m.host.RequireRecent(p); err != nil {
		return err
	}
	name, err := m.cfg.NameFor(ctx, m.pool, p.IdentityID, p.CredentialID)
	if err != nil {
		return err
	}
	if name == "" {
		name = p.IdentityID.String()
	}
	handle, err := m.ensureUser(ctx, m.pool, p.IdentityID, name)
	if err != nil {
		return err
	}
	existing, err := m.credentialsOf(ctx, m.pool, handle)
	if err != nil {
		return err
	}
	acc := account{handle: handle, name: name, display: name, credentials: credentialsOf(existing)}
	creation, session, err := m.web.BeginRegistration(acc,
		webauthn.WithExclusions(webauthn.Credentials(acc.credentials).CredentialDescriptors()))
	if err != nil {
		return err
	}
	if err := m.startCeremony(ctx, w, r, kindRegister, &p.IdentityID, *session); err != nil {
		return err
	}
	return api.JSON(w, http.StatusOK, creation.Response)
}

// registration is the body of POST /api/roux/auth/me/passkeys.
type registration struct {
	PublicKey struct {
		Credential json.RawMessage `json:"credential"`
		Label      string          `json:"label"`
	} `json:"publicKey"`
}

func validLabel(label string) bool {
	if strings.TrimSpace(label) == "" || utf8.RuneCountInString(label) > maxLabel {
		return false
	}
	for _, r := range label {
		if unicode.IsControl(r) {
			return false
		}
	}
	return true
}

func (m *Method) register(w http.ResponseWriter, r *http.Request, p *authn.Principal) error {
	ctx := r.Context()
	if err := m.host.RequireRecent(p); err != nil {
		return err
	}
	cer, ok, err := m.takeCeremony(ctx, w, r, kindRegister)
	if err != nil {
		return err
	}
	if !ok {
		return authn.NewError(http.StatusBadRequest, "invalid-request", "No passkey registration is in progress")
	}
	fail := func(reason string, err error) error {
		slog.DebugContext(ctx, "passkey registration refused", "reason", reason, "err", err)
		return invalidRegistration()
	}
	// The options were asked for by whoever is signed in now, not by someone who was
	// signed in on this browser before the registration finished.
	if cer.identityID == nil || *cer.identityID != p.IdentityID {
		return fail("ceremony belongs to another identity", nil)
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, maxBody+1))
	var req registration
	if err != nil || len(body) > maxBody || json.Unmarshal(body, &req) != nil || len(req.PublicKey.Credential) == 0 {
		return fail("body", err)
	}
	if !validLabel(req.PublicKey.Label) {
		return fail("label", nil)
	}
	parsed, err := protocol.ParseCredentialCreationResponseBytes(req.PublicKey.Credential)
	if err != nil {
		return fail("parse", err)
	}

	handle := cer.session.UserID
	existing, err := m.credentialsOf(ctx, m.pool, handle)
	if err != nil {
		return err
	}
	credential, err := m.web.CreateCredential(account{handle: handle, credentials: credentialsOf(existing)}, cer.session, parsed)
	if err != nil {
		return fail("verification", err)
	}

	id, err := uuid.NewV7()
	if err != nil {
		return err
	}
	if err := m.save(ctx, id, handle, *credential, req.PublicKey.Label, p.IdentityID); err != nil {
		if isDuplicate(err) {
			return fail("already registered", err)
		}
		return err
	}
	m.notify(ctx, p.IdentityID, req.PublicKey.Label)
	return api.JSON(w, http.StatusOK, struct {
		Success bool `json:"success"`
	}{true})
}

// notify tells the owner a passkey was added, after the response: a failure is logged
// and never fails the registration.
func (m *Method) notify(ctx context.Context, identityID uuid.UUID, label string) {
	if m.cfg.Notify == nil {
		return
	}
	ctx = context.WithoutCancel(ctx)
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()
		if err := m.cfg.Notify(ctx, identityID, label); err != nil {
			slog.ErrorContext(ctx, "could not send the passkey-added notice", "err", err)
		}
	}()
}

// ---- list and remove ----

type view struct {
	CredentialID string  `json:"credentialId"`
	Label        string  `json:"label"`
	CreatedAt    string  `json:"createdAt"`
	LastUsedAt   *string `json:"lastUsedAt"`
}

func (m *Method) list(w http.ResponseWriter, r *http.Request, p *authn.Principal) error {
	passkeys, err := m.listFor(r.Context(), m.pool, p.IdentityID)
	if err != nil {
		return err
	}
	out := make([]view, len(passkeys))
	for i, k := range passkeys {
		out[i] = view{
			CredentialID: base64.RawURLEncoding.EncodeToString(k.webAuthnID),
			Label:        k.label,
			CreatedAt:    k.created.UTC().Format(time.RFC3339Nano),
		}
		if k.lastUsed != nil {
			s := k.lastUsed.UTC().Format(time.RFC3339Nano)
			out[i].LastUsedAt = &s
		}
	}
	return api.JSON(w, http.StatusOK, out)
}

// remove deletes one of the caller's passkeys, never the last way in. A stale sign-in is
// refused before the id is looked at, so it learns nothing about any passkey; someone
// else's passkey and one that does not exist are the same 404.
func (m *Method) remove(w http.ResponseWriter, r *http.Request, p *authn.Principal) error {
	ctx := r.Context()
	if err := m.host.RequireRecent(p); err != nil {
		return err
	}
	rawID, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(r.PathValue("credentialId"), "="))
	if err != nil {
		return notFound()
	}
	owned, ok, err := m.ownedBy(ctx, m.pool, p.IdentityID, rawID)
	if err != nil {
		return err
	}
	if !ok {
		return notFound()
	}
	err = m.host.RemoveIfNotLast(ctx, p.IdentityID, func(ctx context.Context, tx pgx.Tx) error {
		gone, err := m.revoke(ctx, tx, owned.id)
		if err != nil {
			return err
		}
		if !gone {
			return notFound() // removed by someone else meanwhile
		}
		return nil
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
