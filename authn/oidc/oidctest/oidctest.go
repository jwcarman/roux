// Package oidctest is a provider for tests of provider sign-in: an OpenID Connect provider
// (discovery, keys, authorize, token) and a GitHub-shaped one (user, emails) on one
// http://127.0.0.1 server. Before each sign-in, say who it signs in with (NextUser); the
// Tweaks forge what a hostile or broken provider would send.
package oidctest

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"testing"
	"time"
)

// Client is the id and secret the provider accepts.
const (
	ClientID     = "test-client"
	ClientSecret = "test-secret"
)

// Tweaks make the next token (or answer) wrong in one way.
type Tweaks struct {
	Issuer        string // the ID token's iss
	Audience      string // the ID token's aud
	Nonce         string // the ID token's nonce
	NoSubject     bool
	Expired       bool
	BadSignature  bool   // signed with another key
	WrongVerifier bool   // the token endpoint behaves as if the PKCE check failed
	TokenStatus   int    // the token endpoint answers with this status
	DenyAuthorize string // the authorize endpoint sends this error instead of a code
	WrongState    string // the authorize endpoint sends this state instead
	FailEmails    bool   // GitHub's /user/emails fails
	DelayEmails   time.Duration
}

// Provider is the test server.
type Provider struct {
	Server *httptest.Server
	key    *rsa.PrivateKey
	other  *rsa.PrivateKey

	mu     sync.Mutex
	user   map[string]any
	emails []map[string]any
	tweaks Tweaks
	codes  map[string]grant
	Seen   []url.Values // the authorize requests, for checking what was asked
	Tokens int          // token requests answered
}

type grant struct {
	challenge, nonce, clientID string
	user                       map[string]any
}

// Start runs the provider until the test ends.
func Start(t *testing.T) *Provider {
	t.Helper()
	k, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	o, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	p := &Provider{key: k, other: o, codes: map[string]grant{}}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /.well-known/openid-configuration", p.discovery)
	mux.HandleFunc("GET /jwks", p.jwks)
	mux.HandleFunc("GET /authorize", p.authorize)
	mux.HandleFunc("POST /token", p.token)
	mux.HandleFunc("GET /user", p.userInfo)
	mux.HandleFunc("GET /user/emails", p.userEmails)
	p.Server = httptest.NewServer(mux)
	t.Cleanup(p.Server.Close)
	return p
}

// Issuer is the provider's issuer (and the address discovery happens at).
func (p *Provider) Issuer() string { return p.Server.URL }

// NextUser says who the next sign-in is: sub is the subject (an OpenID Connect sub, GitHub's
// id), claims everything else (email, email_verified, name, hd, login...).
func (p *Provider) NextUser(sub string, claims map[string]any) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.user = map[string]any{"sub": sub}
	for k, v := range claims {
		p.user[k] = v
	}
}

// NextEmails sets what GitHub's /user/emails answers.
func (p *Provider) NextEmails(emails ...map[string]any) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.emails = emails
}

// Tweak sets what goes wrong next; it is cleared once the sign-in is over (Reset).
func (p *Provider) Tweak(fn func(*Tweaks)) {
	p.mu.Lock()
	defer p.mu.Unlock()
	fn(&p.tweaks)
}

// Reset clears the tweaks and what was seen.
func (p *Provider) Reset() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.tweaks, p.Seen, p.Tokens = Tweaks{}, nil, 0
}

// Authorize plays the person at the provider: it opens the authorize address the app sent the
// browser to and returns the callback address the provider sends it back to.
func (p *Provider) Authorize(t *testing.T, authorizeURL string) string {
	t.Helper()
	c := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := c.Get(authorizeURL)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusFound {
		t.Fatalf("the provider answered the authorize request with %d", resp.StatusCode)
	}
	return resp.Header.Get("Location")
}

func (p *Provider) discovery(w http.ResponseWriter, r *http.Request) {
	base := p.Server.URL
	writeJSON(w, map[string]any{
		"issuer": base, "authorization_endpoint": base + "/authorize", "token_endpoint": base + "/token",
		"jwks_uri": base + "/jwks", "userinfo_endpoint": base + "/user",
		"id_token_signing_alg_values_supported": []string{"RS256"},
		"response_types_supported":              []string{"code"}, "subject_types_supported": []string{"public"},
	})
}

func (p *Provider) jwks(w http.ResponseWriter, r *http.Request) {
	e := big.NewInt(int64(p.key.E)).Bytes()
	writeJSON(w, map[string]any{"keys": []map[string]any{{
		"kty": "RSA", "use": "sig", "alg": "RS256", "kid": "k1",
		"n": b64(p.key.N.Bytes()), "e": b64(e),
	}}})
}

func (p *Provider) authorize(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	p.mu.Lock()
	defer p.mu.Unlock()
	p.Seen = append(p.Seen, q)
	redirect := q.Get("redirect_uri")
	if q.Get("client_id") != ClientID || redirect == "" || q.Get("response_type") != "code" ||
		q.Get("code_challenge_method") != "S256" || q.Get("code_challenge") == "" || q.Get("state") == "" {
		http.Error(w, "bad authorize request", http.StatusBadRequest)
		return
	}
	back, _ := url.Parse(redirect)
	v := back.Query()
	state := q.Get("state")
	if p.tweaks.WrongState != "" {
		state = p.tweaks.WrongState
	}
	v.Set("state", state)
	if p.tweaks.DenyAuthorize != "" {
		v.Set("error", p.tweaks.DenyAuthorize)
	} else {
		code := randomString()
		p.codes[code] = grant{challenge: q.Get("code_challenge"), nonce: q.Get("nonce"), clientID: q.Get("client_id"), user: p.user}
		v.Set("code", code)
	}
	back.RawQuery = v.Encode()
	http.Redirect(w, r, back.String(), http.StatusFound)
}

func (p *Provider) token(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()
	p.mu.Lock()
	defer p.mu.Unlock()
	p.Tokens++
	id, secret, ok := r.BasicAuth()
	if !ok {
		id, secret = r.PostForm.Get("client_id"), r.PostForm.Get("client_secret")
	}
	if p.tweaks.TokenStatus != 0 {
		http.Error(w, "tweaked", p.tweaks.TokenStatus)
		return
	}
	g, found := p.codes[r.PostForm.Get("code")]
	delete(p.codes, r.PostForm.Get("code")) // a code works once
	sum := sha256.Sum256([]byte(r.PostForm.Get("code_verifier")))
	if !found || id != ClientID || secret != ClientSecret || r.PostForm.Get("grant_type") != "authorization_code" ||
		b64(sum[:]) != g.challenge || p.tweaks.WrongVerifier {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "invalid_grant"})
		return
	}
	out := map[string]any{"access_token": "at-" + randomString(), "token_type": "Bearer", "expires_in": 3600}
	if g.nonce != "" { // an OpenID Connect sign-in asks for a nonce; GitHub's does not
		out["id_token"] = p.idToken(g)
	}
	writeJSON(w, out)
}

func (p *Provider) idToken(g grant) string {
	t := p.tweaks
	claims := map[string]any{}
	for k, v := range g.user {
		claims[k] = v
	}
	claims["iss"], claims["aud"] = p.Server.URL, g.clientID
	if t.Issuer != "" {
		claims["iss"] = t.Issuer
	}
	if t.Audience != "" {
		claims["aud"] = t.Audience
	}
	claims["nonce"] = g.nonce
	if t.Nonce != "" {
		claims["nonce"] = t.Nonce
	}
	if t.NoSubject {
		delete(claims, "sub")
	}
	now := time.Now()
	claims["iat"], claims["exp"] = now.Unix(), now.Add(time.Hour).Unix()
	if t.Expired {
		claims["exp"] = now.Add(-time.Hour).Unix()
	}
	key := p.key
	if t.BadSignature {
		key = p.other
	}
	head, _ := json.Marshal(map[string]string{"alg": "RS256", "typ": "JWT", "kid": "k1"})
	body, _ := json.Marshal(claims)
	signing := b64(head) + "." + b64(body)
	sum := sha256.Sum256([]byte(signing))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
	if err != nil {
		panic(err)
	}
	return signing + "." + b64(sig)
}

// userInfo is GitHub's /user: the same user, with its id and login.
func (p *Provider) userInfo(w http.ResponseWriter, r *http.Request) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if r.Header.Get("Authorization") == "" || p.user == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	out := map[string]any{}
	for k, v := range p.user {
		out[k] = v
	}
	if sub, ok := p.user["sub"]; ok {
		if _, has := out["id"]; !has {
			out["id"] = sub
		}
	}
	writeJSON(w, out)
}

func (p *Provider) userEmails(w http.ResponseWriter, r *http.Request) {
	p.mu.Lock()
	t, emails := p.tweaks, p.emails
	p.mu.Unlock()
	if t.DelayEmails > 0 {
		time.Sleep(t.DelayEmails)
	}
	if t.FailEmails {
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
		return
	}
	writeJSON(w, emails)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func randomString() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%x", b)
}

// Mint signs an access token with the provider's key, for a test of bearer sign-in: the claims
// default to iss (this provider), iat and an exp an hour away; whatever the test passes wins, and
// a nil value removes a claim.
func (p *Provider) Mint(claims map[string]any) string { return p.mint(p.key, "RS256", claims) }

// MintSignedByAnotherKey is Mint with a key the provider does not publish.
func (p *Provider) MintSignedByAnotherKey(claims map[string]any) string {
	return p.mint(p.other, "RS256", claims)
}

// MintUnsigned is a token with alg none and no signature, which no verifier may accept.
func (p *Provider) MintUnsigned(claims map[string]any) string { return p.mint(nil, "none", claims) }

func (p *Provider) mint(key *rsa.PrivateKey, alg string, over map[string]any) string {
	now := time.Now()
	claims := map[string]any{"iss": p.Server.URL, "iat": now.Unix(), "exp": now.Add(time.Hour).Unix()}
	for k, v := range over {
		if v == nil {
			delete(claims, k)
		} else {
			claims[k] = v
		}
	}
	head, _ := json.Marshal(map[string]string{"alg": alg, "typ": "JWT", "kid": "k1"})
	body, _ := json.Marshal(claims)
	signing := b64(head) + "." + b64(body)
	if key == nil {
		return signing + "."
	}
	sum := sha256.Sum256([]byte(signing))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
	if err != nil {
		panic(err)
	}
	return signing + "." + b64(sig)
}
