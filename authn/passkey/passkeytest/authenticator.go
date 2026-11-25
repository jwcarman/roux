// Package passkeytest is a software authenticator for testing passkeys: it creates
// real ES256 credentials from the options a server sends and signs real assertions,
// the way a browser's virtual authenticator does, and it can be told to misbehave (a
// wrong origin, a missing user verification, a tampered signature, a counter that goes
// backwards) so tests can show the server refuses each.
package passkeytest

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"testing"

	"github.com/fxamacker/cbor/v2"
)

// Authenticator holds credentials for one origin and relying party.
type Authenticator struct {
	t      *testing.T
	Origin string // as the browser reports it: http://localhost:8080
	RPID   string // localhost
	creds  []*credential
}

type credential struct {
	id     []byte
	key    *ecdsa.PrivateKey
	handle []byte
	count  uint32
}

// New returns an authenticator with no credentials.
func New(t *testing.T, origin, rpID string) *Authenticator {
	return &Authenticator{t: t, Origin: origin, RPID: rpID}
}

// Tweaks make an authenticator misbehave. The zero value is a good authenticator.
type Tweaks struct {
	Origin             string // sign for this origin instead
	Challenge          string // sign this challenge (base64url) instead
	RPID               string // hash this relying party id instead
	NoUserVerification bool   // do not set the user-verified flag
	NoUserPresence     bool   // do not set the user-present flag
	CorruptSignature   bool   // flip a bit of the signature
	SignCount          *uint32
	UserHandle         []byte // answer with this user handle instead
	OmitUserHandle     bool
	Credential         int // which credential to assert with (default: the newest)
}

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func unb64(t *testing.T, s string) []byte {
	t.Helper()
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		t.Fatalf("passkeytest: bad base64url %q: %v", s, err)
	}
	return b
}

func (a *Authenticator) pick(t Tweaks) *credential {
	if len(a.creds) == 0 {
		a.t.Fatal("passkeytest: the authenticator holds no credential")
	}
	if t.Credential > 0 && t.Credential < len(a.creds) {
		return a.creds[t.Credential]
	}
	return a.creds[len(a.creds)-1]
}

func (a *Authenticator) origin(t Tweaks) string {
	if t.Origin != "" {
		return t.Origin
	}
	return a.Origin
}

func (a *Authenticator) rpHash(t Tweaks) []byte {
	id := a.RPID
	if t.RPID != "" {
		id = t.RPID
	}
	h := sha256.Sum256([]byte(id))
	return h[:]
}

func flags(t Tweaks, attested bool) byte {
	var f byte
	if !t.NoUserPresence {
		f |= 0x01
	}
	if !t.NoUserVerification {
		f |= 0x04
	}
	if attested {
		f |= 0x40
	}
	return f
}

func (a *Authenticator) clientData(typ, challenge string, t Tweaks) []byte {
	if t.Challenge != "" {
		challenge = t.Challenge
	}
	raw, err := json.Marshal(map[string]any{
		"type": typ, "challenge": challenge, "origin": a.origin(t), "crossOrigin": false,
	})
	if err != nil {
		a.t.Fatal(err)
	}
	return raw
}

// Create answers a server's creation options (the JSON body of
// POST /who/me/passkeys/options) with a new credential, in the shape a browser sends:
// the "credential" of a registration.
func (a *Authenticator) Create(optionsJSON []byte, tw Tweaks) map[string]any {
	a.t.Helper()
	var opts struct {
		Challenge string `json:"challenge"`
		User      struct {
			ID string `json:"id"`
		} `json:"user"`
	}
	if err := json.Unmarshal(optionsJSON, &opts); err != nil || opts.Challenge == "" {
		a.t.Fatalf("passkeytest: creation options %s: %v", optionsJSON, err)
	}

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		a.t.Fatal(err)
	}
	id := make([]byte, 32)
	rand.Read(id)
	c := &credential{id: id, key: key, handle: unb64(a.t, opts.User.ID)}
	a.creds = append(a.creds, c)

	point, err := key.PublicKey.Bytes()
	if err != nil {
		a.t.Fatal(err)
	}
	x, y := point[1:33], point[33:65]
	cose, err := cbor.Marshal(map[int]any{1: 2, 3: -7, -1: 1, -2: x, -3: y}) // EC2, ES256, P-256
	if err != nil {
		a.t.Fatal(err)
	}
	count := make([]byte, 4)
	if tw.SignCount != nil {
		binary.BigEndian.PutUint32(count, *tw.SignCount)
	}
	idLen := make([]byte, 2)
	binary.BigEndian.PutUint16(idLen, uint16(len(id)))

	authData := append([]byte{}, a.rpHash(tw)...)
	authData = append(authData, flags(tw, true))
	authData = append(authData, count...)
	authData = append(authData, make([]byte, 16)...) // AAGUID: none
	authData = append(authData, idLen...)
	authData = append(authData, id...)
	authData = append(authData, cose...)

	attestation, err := cbor.Marshal(map[string]any{"fmt": "none", "attStmt": map[string]any{}, "authData": authData})
	if err != nil {
		a.t.Fatal(err)
	}
	return map[string]any{
		"id": b64(id), "rawId": b64(id), "type": "public-key",
		"response": map[string]any{
			"attestationObject": b64(attestation),
			"clientDataJSON":    b64(a.clientData("webauthn.create", opts.Challenge, tw)),
			"transports":        []string{"internal"},
		},
		"clientExtensionResults":  map[string]any{},
		"authenticatorAttachment": "platform",
	}
}

// Get answers a server's request options (the JSON body of POST /who/passkey/sign-in/options)
// with an assertion, in the shape a browser sends.
func (a *Authenticator) Get(optionsJSON []byte, tw Tweaks) map[string]any {
	a.t.Helper()
	var opts struct {
		Challenge string `json:"challenge"`
	}
	if err := json.Unmarshal(optionsJSON, &opts); err != nil || opts.Challenge == "" {
		a.t.Fatalf("passkeytest: request options %s: %v", optionsJSON, err)
	}
	c := a.pick(tw)
	if tw.SignCount != nil {
		c.count = *tw.SignCount
	} else {
		c.count++
	}
	count := make([]byte, 4)
	binary.BigEndian.PutUint32(count, c.count)

	authData := append([]byte{}, a.rpHash(tw)...)
	authData = append(authData, flags(tw, false))
	authData = append(authData, count...)

	clientData := a.clientData("webauthn.get", opts.Challenge, tw)
	hash := sha256.Sum256(clientData)
	digest := sha256.Sum256(append(append([]byte{}, authData...), hash[:]...))
	sig, err := ecdsa.SignASN1(rand.Reader, c.key, digest[:])
	if err != nil {
		a.t.Fatal(err)
	}
	if tw.CorruptSignature {
		sig[len(sig)-1] ^= 0x01
	}

	var handle any = b64(c.handle)
	switch {
	case tw.OmitUserHandle:
		handle = nil
	case tw.UserHandle != nil:
		handle = b64(tw.UserHandle)
	}
	return map[string]any{
		"id": b64(c.id), "rawId": b64(c.id), "type": "public-key",
		"response": map[string]any{
			"authenticatorData": b64(authData),
			"clientDataJSON":    b64(clientData),
			"signature":         b64(sig),
			"userHandle":        handle,
		},
		"clientExtensionResults":  map[string]any{},
		"authenticatorAttachment": "platform",
	}
}

// CredentialID is the base64url credential id of the i-th credential created.
func (a *Authenticator) CredentialID(i int) string { return b64(a.creds[i].id) }
