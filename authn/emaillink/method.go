// Package emaillink is sign-in by an emailed link or typed code: who's
// who-email-link. A person enters an address and gets an email with a link and a
// short code; opening the link or typing the code signs them in. It mounts two
// endpoints under who's base path:
//
//	POST /who/email/send     {"email"}                      always 202, whoever is asked about
//	POST /who/email/sign-in  {"token"} or {"email","code"}  200 {"identityId"} + session, or 401
//
// Only registered addresses can sign in. Every failed sign-in is the same 401 and
// a request for a link is always answered 202, so neither reveals which addresses
// exist; a code allows a few guesses and then burns; the link's token and the
// code are stored only as hashes.
package emaillink

import (
	"context"
	"crypto/subtle"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/pgdb"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Migration is the email-link schema; it runs after who's.
var Migration = pgdb.Migration{Name: "roux-authn-emaillink", FS: migrations, Dir: "migrations", After: []string{"roux-authn"}}

// maxBodyBytes caps the JSON a sign-in or send request may carry.
const maxBodyBytes = 8192

// Sign-in methods as /who/me reports them.
const (
	methodLink = "email-link"
	methodCode = "email-code"
)

// Outcome says what became of a request for a link.
type Outcome string

const (
	Sent             Outcome = "sent"
	UnknownAddress   Outcome = "unknown-address"
	InactiveIdentity Outcome = "inactive-identity"
	ResendSuppressed Outcome = "resend-suppressed"
	SendFailed       Outcome = "send-failed"
)

// Method is email-link sign-in. Pass it to authn.Register.
type Method struct {
	cfg    Config
	hasher hasher
	store  store
	wg     sync.WaitGroup
}

// New validates the configuration (naming the fix in any error) and returns the method.
func New(cfg Config) (*Method, error) {
	cfg, err := cfg.withDefaults()
	if err != nil {
		return nil, err
	}
	return &Method{cfg: cfg, hasher: hasher{key: []byte(cfg.CodeSecret)}}, nil
}

func (m *Method) now() time.Time { return m.cfg.Clock().UTC() }

// Contribute turns email sign-in on in GET /who/sign-in.
func (m *Method) Contribute(o *authn.SignInOptions) { o.Email = true }

// Mount registers the endpoints and the credential counter.
func (m *Method) Mount(h *authn.Host) error {
	pool := h.Pool()
	if pool == nil {
		return errors.New("emaillink: authn.Config.Pool is required")
	}
	m.store = store{pool: pool}
	h.AddCounter(authn.Counter{Kind: "email", Count: m.store.count})
	h.Handle("POST /email/send", m.send(h))
	h.Handle("POST /email/sign-in", m.signIn(h))
	m.mountAddresses(h)
	return nil
}

// Wait blocks until the emails still being sent have been handed off; call it at
// shutdown so a send accepted a moment ago is not lost.
func (m *Method) Wait() { m.wg.Wait() }

// readStrings reads a JSON object of at most maxBodyBytes and returns the
// string-valued members named in fields. Anything else (a bigger body, bad JSON,
// not an object, a member that is not a string) is simply absent, which callers
// treat as a malformed request.
func readStrings(r *http.Request, fields ...string) map[string]string {
	out := map[string]string{}
	body, err := io.ReadAll(io.LimitReader(r.Body, maxBodyBytes+1))
	if err != nil || len(body) > maxBodyBytes {
		return out
	}
	var obj map[string]json.RawMessage
	if json.Unmarshal(body, &obj) != nil {
		return out
	}
	for _, f := range fields {
		var s string
		if raw, ok := obj[f]; ok && json.Unmarshal(raw, &s) == nil {
			out[f] = s
		}
	}
	return out
}

func present(s string) bool { return strings.TrimSpace(s) != "" }

// send answers 202 at once, whoever is asked about, and does the lookup and the
// sending after it has answered, so the response says nothing about the address.
func (m *Method) send(h *authn.Host) api.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		address := readStrings(r, "email")["email"]
		// The work outlives the request, but stays in its trace and logging context.
		ctx := context.WithoutCancel(r.Context())
		w.WriteHeader(http.StatusAccepted)
		m.wg.Add(1)
		go func() {
			defer m.wg.Done()
			m.Issue(ctx, address)
		}()
		return nil
	}
}

// Issue sends the address a sign-in link and code, if the address is registered
// to an active identity and none was sent within the resend interval. It never
// fails loudly: the outcome is for logs and for callers who may see it (an
// invitation sent by the owner), never for the person asking.
func (m *Method) Issue(ctx context.Context, address string) Outcome {
	outcome := m.issue(ctx, address, signInMessage)
	slog.DebugContext(ctx, "sign-in email requested", "outcome", outcome)
	return outcome
}

// Invite sends an invitation: the same link and code as a sign-in email, in an
// invitation's words. The address must already be registered to an identity (see
// RegisterIn); the outcome says whether the email went out, and the invitation
// stands either way.
func (m *Method) Invite(ctx context.Context, address string) Outcome {
	outcome := m.issue(ctx, address, invitationMessage)
	slog.DebugContext(ctx, "invitation email requested", "outcome", outcome)
	return outcome
}

// ErrNoAddress means the identity has no email address to send to.
var ErrNoAddress = errors.New("emaillink: the identity has no email address")

// ResendInvitation sends the identity's invitation again: a new link to their oldest
// address, replacing the one they have, unless the resend interval has not passed
// (ResendSuppressed). It does not check whether they have signed in.
func (m *Method) ResendInvitation(ctx context.Context, identityID uuid.UUID) (Outcome, error) {
	address, err := oldestAddress(ctx, m.store.pool, identityID)
	if err != nil {
		return "", err
	}
	if address == "" {
		return "", ErrNoAddress
	}
	return m.Invite(ctx, address), nil
}

// oldestAddress is the identity's oldest registered address, or "" if it has none.
func oldestAddress(ctx context.Context, db authn.DBTX, identityID uuid.UUID) (string, error) {
	var address string
	err := db.QueryRow(ctx, `
		select e.address from roux_credential_identity ci
		  join roux_email_credential e on e.id = ci.credential_id
		 where ci.identity_id = $1 order by e.id limit 1`, identityID).Scan(&address)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return address, err
}

// AddressFor is the address that names an identity to a person: the one the session
// signed in with, if it signed in by email (the address they just proved they own),
// else the identity's oldest, else "". Passkeys use it to name themselves in the
// browser's picker.
func (m *Method) AddressFor(ctx context.Context, db authn.DBTX, identityID, sessionCredentialID uuid.UUID) (string, error) {
	var address string
	err := db.QueryRow(ctx, `
		select e.address from roux_email_credential e
		  join roux_credential_identity ci on ci.credential_id = e.id
		 where e.id = $1 and ci.identity_id = $2`, sessionCredentialID, identityID).Scan(&address)
	if err == nil {
		return address, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	return oldestAddress(ctx, db, identityID)
}

// PasskeyAdded emails the identity's oldest address that a passkey was added, so that
// someone who did not add it notices. An identity with no address is not emailed. A
// failure is returned for the caller to log; it must not fail the registration.
func (m *Method) PasskeyAdded(ctx context.Context, identityID uuid.UUID, label string) error {
	address, err := oldestAddress(ctx, m.store.pool, identityID)
	if err != nil || address == "" {
		return err
	}
	return m.cfg.Sender.Send(ctx, passkeyAddedMessage(m.cfg.AppName, m.cfg.BrandColor, address, label))
}

// AccountLinked emails the identity's oldest address that a provider account was linked
// (provider is its name as the sign-in page shows it, such as "google"). An identity with no
// address is not emailed. A failure is returned for the caller to log; it must not fail the link.
func (m *Method) AccountLinked(ctx context.Context, identityID uuid.UUID, provider string) error {
	address, err := oldestAddress(ctx, m.store.pool, identityID)
	if err != nil || address == "" {
		return err
	}
	return m.cfg.Sender.Send(ctx, accountLinkedMessage(m.cfg.AppName, m.cfg.BrandColor, address, provider))
}

// IsAddress reports whether the text is a plain email address (no display name, no
// angle brackets, no whitespace), of a sane length.
func IsAddress(s string) bool { return looksLikeAnAddress(s) }

func (m *Method) issue(ctx context.Context, address string, build messageBuilder) Outcome {
	if !looksLikeAnAddress(address) {
		return UnknownAddress
	}
	address = normalizeAddress(address)
	credentialID, found, err := m.store.findCredential(ctx, address)
	if err != nil {
		slog.WarnContext(ctx, "sign-in link: address lookup failed", "err", err)
		return SendFailed
	}
	if !found {
		return UnknownAddress
	}
	res, _, err := authn.Resolve(ctx, m.store.pool, credentialID)
	if err != nil {
		slog.WarnContext(ctx, "sign-in link: identity lookup failed", "err", err)
		return SendFailed
	}
	if res != authn.Resolved {
		return InactiveIdentity
	}

	token, code := newToken(), newCode(m.cfg.CodeLength)
	tokenHash := sha256Hex(token)
	now := m.now()
	issued, err := m.store.issue(ctx, credentialID, tokenHash, m.hasher.hash(credentialID, code),
		now, now.Add(m.cfg.TokenTTL), m.cfg.ResendInterval)
	if err != nil {
		slog.WarnContext(ctx, "sign-in link: could not store the token", "err", err)
		return SendFailed
	}
	if !issued {
		return ResendSuppressed
	}

	link := m.cfg.LinkBaseURL + "#token=" + token
	msg := build(m.cfg.AppName, m.cfg.BrandColor, address, link, formatCode(code), m.cfg.TokenTTL)
	if err := m.cfg.Sender.Send(ctx, msg); err != nil {
		// Never log the message: it carries the link and the code.
		slog.WarnContext(ctx, "sign-in link: could not send the email", "err", err)
		if derr := m.store.deleteToken(context.WithoutCancel(ctx), credentialID, tokenHash); derr != nil {
			slog.WarnContext(ctx, "sign-in link: could not remove the unsent token", "err", derr)
		}
		return SendFailed
	}
	return Sent
}

type signedIn struct {
	IdentityID string `json:"identityId"`
}

// signIn answers a link's token, or an address with its code. Every failure is
// the same SignInFailed; the reason goes to the log only.
func (m *Method) signIn(h *authn.Host) api.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		ctx := r.Context()
		f := readStrings(r, "token", "email", "code")
		hasToken, hasEmail, hasCode := present(f["token"]), present(f["email"]), present(f["code"])

		var (
			credentialID uuid.UUID
			method       string
			reason       string
		)
		var err error
		switch {
		case hasToken && !hasEmail && !hasCode:
			method = methodLink
			credentialID, reason, err = m.authenticateLink(ctx, f["token"])
		case !hasToken && hasEmail && hasCode:
			method = methodCode
			credentialID, reason, err = m.authenticateCode(ctx, f["email"], f["code"])
		default:
			reason = "malformed"
		}
		if err != nil {
			return err
		}
		if reason != "" {
			slog.DebugContext(ctx, "email sign-in failed", "reason", reason)
			return authn.SignInFailed()
		}

		res, identityID, err := authn.Resolve(ctx, m.store.pool, credentialID)
		if err != nil {
			return err
		}
		if res != authn.Resolved {
			slog.DebugContext(ctx, "email sign-in failed", "reason", "identity-not-active")
			return authn.SignInFailed()
		}
		if err := h.StartSession(w, r, identityID, credentialID, method); err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, signedIn{IdentityID: identityID.String()})
	}
}

// authenticateLink spends the token. reason is non-empty when it did not work.
func (m *Method) authenticateLink(ctx context.Context, token string) (uuid.UUID, string, error) {
	id, ok, err := m.store.consume(ctx, sha256Hex(token), m.now())
	if err != nil {
		return uuid.Nil, "", err
	}
	if !ok {
		return uuid.Nil, "invalid-link", nil
	}
	return id, "", nil
}

// authenticateCode counts a guess against the address's code and checks it.
func (m *Method) authenticateCode(ctx context.Context, typedAddress, typedCode string) (uuid.UUID, string, error) {
	code, okCode := normalizeCode(typedCode, m.cfg.CodeLength)
	if !looksLikeAnAddress(typedAddress) || !okCode {
		return uuid.Nil, "malformed", nil
	}
	address := normalizeAddress(typedAddress)
	now := m.now()

	id, storedHash, ok, err := m.store.attemptCode(ctx, address, m.cfg.CodeMaxAttempts, now)
	if err != nil {
		return uuid.Nil, "", err
	}
	if !ok {
		// Spend the same work as a real check, so a wrong guess costs about the same
		// whether or not the address has a live code.
		m.hasher.hash(uuid.Nil, code)
		return uuid.Nil, "no-live-code", nil
	}
	presented := m.hasher.hash(id, code)
	if subtle.ConstantTimeCompare([]byte(presented), []byte(storedHash)) != 1 {
		return uuid.Nil, "wrong-code", nil
	}
	used, err := m.store.consumeCode(ctx, id, presented, now)
	if err != nil {
		return uuid.Nil, "", err
	}
	if !used {
		return uuid.Nil, "code-already-used", nil
	}
	return id, "", nil
}

// ErrAddressTaken means the address belongs to another identity already.
var ErrAddressTaken = errors.New("emaillink: that address is registered to another identity")

// Register makes address sign in as identityID. Call it only with an address you
// vouch for (an invitation, the owner): it does not verify the mailbox.
// Registering an address already linked to that identity is a no-op;
// one linked to another identity is ErrAddressTaken.
func (m *Method) Register(ctx context.Context, identityID uuid.UUID, address string) error {
	tx, err := m.store.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // a no-op after commit
	if err := m.RegisterIn(ctx, tx, identityID, address); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// RegisterIn is Register inside a transaction of the caller's, for work that must
// commit or roll back together with the identity it registers an address for (an
// invitation creates the person, their role and their address as one).
func (m *Method) RegisterIn(ctx context.Context, db authn.DBTX, identityID uuid.UUID, address string) error {
	_, err := m.registerIn(ctx, db, identityID, address)
	return err
}

// registerIn is RegisterIn, returning the id of the credential that now has the address.
func (m *Method) registerIn(ctx context.Context, db authn.DBTX, identityID uuid.UUID, address string) (uuid.UUID, error) {
	if !looksLikeAnAddress(address) {
		return uuid.Nil, fmt.Errorf("emaillink: %q is not an email address", address)
	}
	address = normalizeAddress(address)

	credentialID, found, err := m.store.findCredentialTx(ctx, db, address)
	if err != nil {
		return uuid.Nil, err
	}
	if found {
		owner, linked, err := ownerOf(ctx, db, credentialID)
		if err != nil {
			return uuid.Nil, err
		}
		if linked && owner == identityID {
			return credentialID, nil
		}
		if linked {
			return uuid.Nil, ErrAddressTaken
		}
		// A credential whose identity is gone: replace it.
		if _, err := db.Exec(ctx, `delete from roux_email_credential where id = $1`, credentialID); err != nil {
			return uuid.Nil, err
		}
	}
	if credentialID, err = uuid.NewV7(); err != nil {
		return uuid.Nil, err
	}
	if _, err := db.Exec(ctx, `insert into roux_email_credential (id, address, created_at) values ($1, $2, $3)`,
		credentialID, address, m.now()); err != nil {
		return uuid.Nil, err
	}
	return credentialID, authn.LinkCredential(ctx, db, credentialID, identityID)
}

// EnsureIdentity returns the identity that signs in with address, creating the
// identity and registering the address if there is none: how an app's first
// owner comes to exist. created reports whether it made them.
func (m *Method) EnsureIdentity(ctx context.Context, address string) (id uuid.UUID, created bool, err error) {
	if !looksLikeAnAddress(address) {
		return uuid.Nil, false, fmt.Errorf("emaillink: %q is not an email address", address)
	}
	normalized := normalizeAddress(address)
	if credentialID, found, err := m.store.findCredential(ctx, normalized); err != nil {
		return uuid.Nil, false, err
	} else if found {
		if owner, linked, err := ownerOf(ctx, m.store.pool, credentialID); err != nil || linked {
			return owner, false, err
		}
	}
	id, err = authn.CreateIdentity(ctx, m.store.pool, m.now())
	if err != nil {
		return uuid.Nil, false, err
	}
	if err := m.Register(ctx, id, address); err != nil {
		return uuid.Nil, false, err
	}
	return id, true, nil
}

func ownerOf(ctx context.Context, db authn.DBTX, credentialID uuid.UUID) (uuid.UUID, bool, error) {
	var owner uuid.UUID
	err := db.QueryRow(ctx, `select identity_id from roux_credential_identity where credential_id = $1`, credentialID).Scan(&owner)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, false, nil
	}
	return owner, err == nil, err
}
