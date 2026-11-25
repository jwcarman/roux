package emaillink_test

import (
	"context"
	"encoding/json"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/authn/emaillink"
)

var confirmRe = regexp.MustCompile(`#confirm-address=([A-Za-z0-9_-]+)`)

func confirmTokenOf(t *testing.T, m emaillink.Message) string {
	t.Helper()
	g := confirmRe.FindStringSubmatch(m.Text)
	if g == nil {
		t.Fatalf("no confirmation link in the email:\n%s", m.Text)
	}
	return g[1]
}

// ask requests an address and returns the email it produced (the last one sent).
func (e *env) ask(b *browser, address string, replaces any) emaillink.Message {
	e.t.Helper()
	before := e.settle()
	body := map[string]any{"address": address}
	if replaces != nil {
		body["replaces"] = replaces
	}
	if r := b.post("/who/me/email-addresses", body); r.StatusCode != 202 {
		e.t.Fatalf("ask: %d %s", r.StatusCode, r.body)
	}
	return e.waitForMail(before + 1)[before]
}

func addressList(t *testing.T, b *browser) []map[string]any {
	t.Helper()
	r := b.get("/who/me/email-addresses")
	if r.StatusCode != 200 {
		t.Fatalf("%d %s", r.StatusCode, r.body)
	}
	var list []map[string]any
	if err := json.Unmarshal(r.body, &list); err != nil {
		t.Fatal(err)
	}
	return list
}

func (e *env) idOfAddress(address string) string {
	var id uuid.UUID
	if err := e.pool.QueryRow(context.Background(), `select id from roux_email_credential where address = $1`, address).Scan(&id); err != nil {
		e.t.Fatal(err)
	}
	return id.String()
}

func TestListingMyAddresses(t *testing.T) {
	e := setup(t)
	b := e.signedIn()
	e.clock.advance(time.Minute)
	if err := e.method.Register(context.Background(), e.ownerID, "second@example.test"); err != nil {
		t.Fatal(err)
	}
	list := addressList(t, b)
	if len(list) != 2 || list[0]["address"] != owner || list[1]["address"] != "second@example.test" {
		t.Fatalf("oldest first: %v", list)
	}
	if len(list[0]) != 3 || list[0]["id"] != e.idOfAddress(owner) || list[0]["createdAt"] == nil {
		t.Fatalf("shape: %v", list[0])
	}
	if r := e.browser().get("/who/me/email-addresses"); r.StatusCode != 401 || r.header("Who-Error") != "not-signed-in" {
		t.Fatalf("signed out: %d", r.StatusCode)
	}
}

func (r reply) header(k string) string { return r.Header.Get(k) }

func TestAddingAnAddress(t *testing.T) {
	e := setup(t)
	b := e.signedIn()

	msg := e.ask(b, "  New@Example.test ", nil)
	if msg.To != "new@example.test" || msg.Subject != "Confirm your email address for Acme Gym" ||
		!strings.Contains(msg.Text, "Add this address to your account: http://app.test/signin/link#confirm-address=") ||
		!strings.Contains(msg.Text, "work once, while you are signed in.") {
		t.Fatalf("the email: %+v", msg)
	}
	if len(addressList(t, b)) != 1 {
		t.Fatal("asking must not add the address: only confirming does")
	}

	r := b.post("/who/me/email-addresses/confirmations", map[string]string{"token": confirmTokenOf(t, msg)})
	if body := r.json(t); r.StatusCode != 200 || body["credentialId"] != e.idOfAddress("new@example.test") {
		t.Fatalf("confirm: %d %s", r.StatusCode, r.body)
	}
	list := addressList(t, b)
	if len(list) != 2 || list[1]["address"] != "new@example.test" {
		t.Fatalf("after confirming: %v", list)
	}
	if got := b.get("/who/me").json(t)["credentials"].(map[string]any)["email"]; got != float64(2) {
		t.Fatalf("credentials: %v", got)
	}
	// The new address signs in, like any other.
	e.clock.advance(2 * time.Minute)
	other := e.browser()
	if r := other.signInWithToken(tokenOf(t, e.issueFor(other, "new@example.test"))); r.StatusCode != 200 || r.json(t)["identityId"] != e.ownerID.String() {
		t.Fatalf("signing in with the new address: %d %s", r.StatusCode, r.body)
	}
	// The link works once.
	if r := b.post("/who/me/email-addresses/confirmations", map[string]string{"token": confirmTokenOf(t, msg)}); r.StatusCode != 400 {
		t.Fatalf("a spent link: %d", r.StatusCode)
	}
}

func TestAskingIsAlwaysAccepted(t *testing.T) {
	e := setup(t)
	b := e.signedIn()
	base := e.settle()
	if _, _, err := e.method.EnsureIdentity(context.Background(), "taken@example.test"); err != nil {
		t.Fatal(err)
	}
	for i, body := range []any{
		map[string]string{"address": "taken@example.test"}, // registered to someone else
		map[string]string{"address": owner},                // registered to the caller
		map[string]string{"address": "not an address"},
		map[string]string{"address": ""},
		map[string]string{},
		`{"address": 7}`, `{nope`, `[1]`,
	} {
		if r := b.post("/who/me/email-addresses", body); r.StatusCode != 202 || len(r.body) != 0 {
			t.Errorf("body %d: %d %q (the answer must not tell whether the address is taken)", i, r.StatusCode, r.body)
		}
	}
	if n := e.settle() - base; n != 0 {
		t.Fatalf("%d emails sent for requests that should send none", n)
	}
}

func TestAskingNeedsAFreshSignInAndChecksReplaces(t *testing.T) {
	e := setup(t)
	b := e.signedIn()
	base := e.settle()
	ownID := e.idOfAddress(owner)

	// replaces must be one of the caller's own addresses.
	otherID, _, _ := e.method.EnsureIdentity(context.Background(), "other@example.test")
	_ = otherID
	for name, replaces := range map[string]string{"someone else's": e.idOfAddress("other@example.test"), "unknown": uuid.NewString(), "malformed": "nope"} {
		r := b.post("/who/me/email-addresses", map[string]any{"address": "x@example.test", "replaces": replaces})
		if body := r.json(t); r.StatusCode != 404 || body["code"] != "email-address-not-found" {
			t.Errorf("%s: %d %s", name, r.StatusCode, r.body)
		}
	}
	if e.settle() != base {
		t.Fatal("a refused request sent an email")
	}

	// A stale sign-in is refused before the body is looked at.
	e.clock.advance(11 * time.Minute)
	for _, c := range []struct{ method, path string }{
		{"POST", "/who/me/email-addresses"}, {"POST", "/who/me/email-addresses/confirmations"}, {"DELETE", "/who/me/email-addresses/" + ownID},
	} {
		r := b.do(c.method, c.path, nil, true)
		if body := r.json(t); r.StatusCode != 401 || body["code"] != "reauthentication-required" {
			t.Errorf("%s %s stale: %d %s", c.method, c.path, r.StatusCode, r.body)
		}
	}
	// Signed out is 401 not-signed-in, everywhere.
	for _, c := range []struct{ method, path string }{
		{"POST", "/who/me/email-addresses"}, {"POST", "/who/me/email-addresses/confirmations"}, {"DELETE", "/who/me/email-addresses/" + ownID},
	} {
		if r := e.browser().do(c.method, c.path, nil, true); r.StatusCode != 401 || r.json(t)["code"] != "not-signed-in" {
			t.Errorf("%s %s signed out: %d", c.method, c.path, r.StatusCode)
		}
	}
}

func TestOnlyTheOneWhoAskedCanConfirm(t *testing.T) {
	e := setup(t)
	ada := e.signedIn()
	otherID, _, _ := e.method.EnsureIdentity(context.Background(), "other@example.test")
	grace := e.browser()
	e.clock.advance(2 * time.Minute)
	grace.signInWithToken(tokenOf(t, e.issueFor(grace, "other@example.test")))
	_ = otherID

	msg := e.ask(ada, "new@example.test", nil)
	token, code := confirmTokenOf(t, msg), codeOf(t, msg)
	if r := grace.post("/who/me/email-addresses/confirmations", map[string]string{"token": token}); r.StatusCode != 400 || r.json(t)["code"] != "invalid-confirmation" {
		t.Fatalf("someone else's token: %d %s", r.StatusCode, r.body)
	}
	if r := grace.post("/who/me/email-addresses/confirmations", map[string]string{"code": code}); r.StatusCode != 400 {
		t.Fatalf("someone else's code: %d", r.StatusCode)
	}
	// Ada's request was not spent by Grace's attempts.
	if r := ada.post("/who/me/email-addresses/confirmations", map[string]string{"token": token}); r.StatusCode != 200 {
		t.Fatalf("Ada: %d %s", r.StatusCode, r.body)
	}
}

func TestConfirmingWithATypedCode(t *testing.T) {
	e := setup(t)
	b := e.signedIn()
	msg := e.ask(b, "new@example.test", nil)
	code := codeOf(t, msg)

	// Neither, or both, is refused, whatever else is right.
	for name, body := range map[string]any{
		"neither": map[string]string{}, "both": map[string]string{"token": confirmTokenOf(t, msg), "code": code},
		"blank code": map[string]string{"code": ""}, "malformed code": map[string]string{"code": "!!"},
	} {
		r := b.post("/who/me/email-addresses/confirmations", body)
		if name == "blank code" || name == "malformed code" {
			if r.StatusCode != 400 {
				t.Errorf("%s: %d", name, r.StatusCode)
			}
			continue
		}
		if r.StatusCode != 400 || r.json(t)["code"] != "invalid-confirmation" {
			t.Errorf("%s: %d %s", name, r.StatusCode, r.body)
		}
	}

	// A few wrong guesses, then the right one, typed the way people type it.
	for i := 0; i < 4; i++ {
		if r := b.post("/who/me/email-addresses/confirmations", map[string]string{"code": wrongCode(code)}); r.StatusCode != 400 {
			t.Fatalf("wrong code: %d", r.StatusCode)
		}
	}
	typed := strings.ToLower(strings.Replace(code, "-", " ", 1))
	if r := b.post("/who/me/email-addresses/confirmations", map[string]string{"code": typed}); r.StatusCode != 200 {
		t.Fatalf("right code after 4 wrong: %d %s", r.StatusCode, r.body)
	}
}

func TestACodeForAnAddressBurnsAfterTooManyGuesses(t *testing.T) {
	e := setup(t) // 5 attempts
	b := e.signedIn()
	msg := e.ask(b, "new@example.test", nil)
	code := codeOf(t, msg)
	for i := 0; i < 5; i++ {
		b.post("/who/me/email-addresses/confirmations", map[string]string{"code": wrongCode(code)})
	}
	if r := b.post("/who/me/email-addresses/confirmations", map[string]string{"code": code}); r.StatusCode != 400 {
		t.Fatalf("a burnt code worked: %d", r.StatusCode)
	}
	// The link in the same email still works.
	if r := b.post("/who/me/email-addresses/confirmations", map[string]string{"token": confirmTokenOf(t, msg)}); r.StatusCode != 200 {
		t.Fatalf("the link should still work: %d %s", r.StatusCode, r.body)
	}
}

func TestARequestExpiresAndIsReplacedByTheNext(t *testing.T) {
	e := setup(t)
	b := e.signedIn()

	old := e.ask(b, "first@example.test", nil)
	e.clock.advance(5*time.Minute + time.Second)
	if r := b.post("/who/me/email-addresses/confirmations", map[string]string{"token": confirmTokenOf(t, old)}); r.StatusCode != 400 {
		t.Fatalf("expired: %d", r.StatusCode)
	}

	// A new request replaces the identity's earlier one, once the resend interval has passed.
	older := e.ask(b, "second@example.test", nil)
	e.clock.advance(61 * time.Second)
	newer := e.ask(b, "third@example.test", nil)
	if r := b.post("/who/me/email-addresses/confirmations", map[string]string{"token": confirmTokenOf(t, older)}); r.StatusCode != 400 {
		t.Fatalf("a replaced request still worked: %d", r.StatusCode)
	}
	if r := b.post("/who/me/email-addresses/confirmations", map[string]string{"token": confirmTokenOf(t, newer)}); r.StatusCode != 200 {
		t.Fatalf("the newest: %d %s", r.StatusCode, r.body)
	}
}

func TestTheResendIntervalProtectsInboxes(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	ada := e.signedIn()
	if _, _, err := e.method.EnsureIdentity(ctx, "other@example.test"); err != nil {
		t.Fatal(err)
	}
	grace := e.browser()
	e.clock.advance(2 * time.Minute)
	grace.signInWithToken(tokenOf(t, e.issueFor(grace, "other@example.test")))

	base := e.settle()
	e.ask(ada, "victim@example.test", nil)
	// The same identity, for any address, within the interval: accepted, nothing sent.
	ada.post("/who/me/email-addresses", map[string]string{"address": "another@example.test"})
	// Someone else, for the same address, within the interval: accepted, nothing sent.
	grace.post("/who/me/email-addresses", map[string]string{"address": "victim@example.test"})
	if n := e.settle() - base; n != 1 {
		t.Fatalf("%d emails, want 1: nobody may email an address over and over", n)
	}
	e.clock.advance(61 * time.Second)
	e.ask(grace, "victim@example.test", nil) // after the interval, it goes out
}

func TestAFailedSendLeavesNoRequestBehind(t *testing.T) {
	e := setup(t)
	b := e.signedIn()
	e.out.mu.Lock()
	e.out.fail = true
	e.out.mu.Unlock()
	if r := b.post("/who/me/email-addresses", map[string]string{"address": "new@example.test"}); r.StatusCode != 202 {
		t.Fatalf("%d", r.StatusCode)
	}
	e.method.Wait()
	var n int
	if err := e.pool.QueryRow(context.Background(), `select count(*) from roux_email_address_request`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("%d requests left behind by a send that failed", n)
	}
	// And it does not count against the resend interval: a retry goes straight out.
	e.out.mu.Lock()
	e.out.fail = false
	e.out.mu.Unlock()
	e.ask(b, "new@example.test", nil)
}

// signedInAs signs a browser in with another registered address of the owner.
func (e *env) signedInAs(address string) *browser {
	e.t.Helper()
	if err := e.method.Register(context.Background(), e.ownerID, address); err != nil {
		e.t.Fatal(err)
	}
	b := e.browser()
	if r := b.signInWithToken(tokenOf(e.t, e.issueFor(b, address))); r.StatusCode != 200 {
		e.t.Fatalf("sign-in: %d %s", r.StatusCode, r.body)
	}
	return b
}

func TestChangingAnAddress(t *testing.T) {
	e := setup(t)
	b := e.signedInAs("keeper@example.test")
	oldID := e.idOfAddress(owner)

	msg := e.ask(b, "better@example.test", oldID)
	if !strings.Contains(msg.Text, "Make this your account's email address, in place of the old one: http://") {
		t.Fatalf("a change reads differently from an addition:\n%s", msg.Text)
	}
	// Someone signed in with the OLD address's credential: confirming ends that session.
	viaOld := e.browser()
	cookie, err := e.host.CreateSession(context.Background(), e.ownerID, uuid.MustParse(oldID), "email-link", "test")
	if err != nil {
		t.Fatal(err)
	}
	viaOld.setCookie("SESSION", cookie)

	r := b.post("/who/me/email-addresses/confirmations", map[string]string{"token": confirmTokenOf(t, msg)})
	if r.StatusCode != 200 || r.json(t)["credentialId"] != e.idOfAddress("better@example.test") {
		t.Fatalf("confirm: %d %s", r.StatusCode, r.body)
	}
	list := addressList(t, b)
	if len(list) != 2 || list[0]["address"] != "keeper@example.test" || list[1]["address"] != "better@example.test" {
		t.Fatalf("the old address must be replaced, not kept: %v", list)
	}
	if viaOld.get("/who/me").StatusCode != 401 {
		t.Fatal("a session signed in with the replaced address must end")
	}
	// The old address hears about it, with the new one masked.
	mails := e.waitForMail(3)
	var last emaillink.Message
	for _, m := range mails {
		if m.To == owner && strings.HasPrefix(m.Subject, "Your ") {
			last = m
		}
	}
	if last.To != owner || last.Subject != "Your Acme Gym email address was changed" ||
		!strings.Contains(last.Text, "changed to b***@example.test") || strings.Contains(last.Text, "better@") {
		t.Fatalf("notice: %+v", last)
	}
	// It no longer signs in.
	e.clock.advance(2 * time.Minute)
	if e.method.Issue(context.Background(), owner) != emaillink.UnknownAddress {
		t.Fatal("the replaced address can still sign in")
	}
}

func TestAFailedNoticeDoesNotUndoAChange(t *testing.T) {
	e := setup(t)
	b := e.signedInAs("keeper@example.test")
	msg := e.ask(b, "better@example.test", e.idOfAddress(owner))
	e.out.mu.Lock()
	e.out.fail = true
	e.out.mu.Unlock()
	if r := b.post("/who/me/email-addresses/confirmations", map[string]string{"token": confirmTokenOf(t, msg)}); r.StatusCode != 200 {
		t.Fatalf("a failing mail server undid the change: %d %s", r.StatusCode, r.body)
	}
	if list := addressList(t, b); len(list) != 2 || list[1]["address"] != "better@example.test" {
		t.Fatalf("%v", list)
	}
}

func TestAnAddressTakenInTheMeantimeIsAConflict(t *testing.T) {
	e := setup(t)
	b := e.signedIn()
	msg := e.ask(b, "contested@example.test", nil)
	// Someone else registers it before the confirmation.
	if _, _, err := e.method.EnsureIdentity(context.Background(), "contested@example.test"); err != nil {
		t.Fatal(err)
	}
	r := b.post("/who/me/email-addresses/confirmations", map[string]string{"token": confirmTokenOf(t, msg)})
	if body := r.json(t); r.StatusCode != 409 || body["code"] != "email-address-taken" {
		t.Fatalf("%d %s", r.StatusCode, r.body)
	}
	if len(addressList(t, b)) != 1 {
		t.Fatal("the contested address was added")
	}
}

func TestOnlyOneOfManyConfirmationsWins(t *testing.T) {
	e := setup(t)
	b := e.signedIn()
	msg := e.ask(b, "new@example.test", nil)
	token := confirmTokenOf(t, msg)
	racers := make([]*browser, 6)
	for i := range racers {
		racers[i] = e.browser()
		racers[i].setCookie("SESSION", b.cookie("SESSION"))
		racers[i].get("/who/sign-in")
	}
	var wg, start sync.WaitGroup
	start.Add(1)
	statuses := make(chan int, len(racers))
	for _, br := range racers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			start.Wait()
			statuses <- br.post("/who/me/email-addresses/confirmations", map[string]string{"token": token}).StatusCode
		}()
	}
	start.Done()
	wg.Wait()
	close(statuses)
	wins := 0
	for s := range statuses {
		if s == 200 {
			wins++
		}
	}
	if wins != 1 || len(addressList(t, b)) != 2 {
		t.Fatalf("%d confirmations won, want 1", wins)
	}
}

func TestRemovingAnAddress(t *testing.T) {
	e := setup(t)
	b := e.signedIn()
	if err := e.method.Register(context.Background(), e.ownerID, "second@example.test"); err != nil {
		t.Fatal(err)
	}
	secondID := e.idOfAddress("second@example.test")
	if _, _, err := e.method.EnsureIdentity(context.Background(), "other@example.test"); err != nil {
		t.Fatal(err)
	}
	otherID := e.idOfAddress("other@example.test")

	for name, id := range map[string]string{"someone else's": otherID, "unknown": uuid.NewString(), "garbage": "nope"} {
		r := b.del("/who/me/email-addresses/" + id)
		if body := r.json(t); r.StatusCode != 404 || body["code"] != "email-address-not-found" {
			t.Errorf("%s: %d %s", name, r.StatusCode, r.body)
		}
	}
	if r := b.del("/who/me/email-addresses/" + secondID); r.StatusCode != 204 || len(r.body) != 0 {
		t.Fatalf("remove: %d %s", r.StatusCode, r.body)
	}
	if list := addressList(t, b); len(list) != 1 || list[0]["address"] != owner {
		t.Fatalf("%v", list)
	}
	// The last way in stays.
	r := b.del("/who/me/email-addresses/" + e.idOfAddress(owner))
	if body := r.json(t); r.StatusCode != 409 || body["code"] != "last-credential" {
		t.Fatalf("last way in: %d %s", r.StatusCode, r.body)
	}
	if len(addressList(t, b)) != 1 {
		t.Fatal("the last address was removed")
	}
}

func TestTwoRemovalsAtOnceCannotRemoveEveryAddress(t *testing.T) {
	e := setup(t)
	b := e.signedIn()
	if err := e.method.Register(context.Background(), e.ownerID, "second@example.test"); err != nil {
		t.Fatal(err)
	}
	ids := []string{e.idOfAddress(owner), e.idOfAddress("second@example.test")}
	a, c := e.browser(), e.browser()
	for _, br := range []*browser{a, c} {
		br.setCookie("SESSION", b.cookie("SESSION"))
		br.get("/who/sign-in")
	}
	var wg, start sync.WaitGroup
	start.Add(1)
	statuses := make(chan int, 2)
	for i, br := range []*browser{a, c} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			start.Wait()
			statuses <- br.del("/who/me/email-addresses/" + ids[i]).StatusCode
		}()
	}
	start.Done()
	wg.Wait()
	close(statuses)
	ok, refused := 0, 0
	for s := range statuses {
		switch s {
		case 204:
			ok++
		default: // 409 last-credential, or 401/404 when the other removal ended this session first
			refused++
		}
	}
	var left int
	if err := e.pool.QueryRow(context.Background(), `select count(*) from roux_credential_identity where identity_id = $1`, e.ownerID).Scan(&left); err != nil {
		t.Fatal(err)
	}
	if ok != 1 || refused != 1 || left != 1 {
		t.Fatalf("%d removed, %d refused, %d addresses left: exactly one removal may succeed", ok, refused, left)
	}
}

func TestTellingTheOwnerAnAccountWasLinked(t *testing.T) {
	e := setup(t)
	if err := e.method.AccountLinked(context.Background(), e.ownerID, "google"); err != nil {
		t.Fatal(err)
	}
	m := e.waitForMail(1)[0]
	if m.To != owner || m.Subject != "A google account was linked to your Acme Gym account" ||
		!strings.Contains(m.Text, "A google account was linked to your account.") ||
		!strings.Contains(m.HTML, "<strong>google</strong>") {
		t.Fatalf("%+v", m)
	}
	// An identity with no address is not emailed, and that is not an error.
	if err := e.method.AccountLinked(context.Background(), uuid.New(), "google"); err != nil {
		t.Fatal(err)
	}
	if e.settle() != 1 {
		t.Fatal("emailed an identity with no address")
	}
}
