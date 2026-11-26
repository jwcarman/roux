package cqrs_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/jwcarman/roux/authn/authntest"
)

func idem(key string) map[string]string { return map[string]string{"Idempotency-Key": key} }

func TestCommandAnswersResultAndEvents(t *testing.T) {
	w := setup(t)
	r := w.ada.Post("/api/commands/addThing", map[string]string{"title": "Ship it"}).Want(t, http.StatusOK, "add")
	body := r.JSON(t)
	res := body["result"].(map[string]any)
	ev := body["events"].([]any)
	if res["title"] != "Ship it" || len(ev) != 1 || ev[0] != "thingsChanged" {
		t.Fatalf("answer: %s", r.Body)
	}
	if w.thingCount() != 1 {
		t.Fatal("the thing was not written")
	}
}

func TestCommandValidationIsAFieldProblem(t *testing.T) {
	w := setup(t)
	r := w.ada.Post("/api/commands/addThing", map[string]string{"title": ""}).Want(t, http.StatusBadRequest, "no title")
	if e := problemFields(t, r)[0]; e["field"] != "title" {
		t.Fatalf("error: %v", e)
	}
	if w.thingCount() != 0 {
		t.Fatal("an invalid command wrote")
	}
}

func TestCommandRollsBackOnError(t *testing.T) {
	w := setup(t)
	r := w.ada.Post("/api/commands/addThingThenFail", map[string]string{"title": "x"}).Want(t, http.StatusConflict, "fails")
	if r.JSON(t)["detail"] != "No room for another thing" {
		t.Fatalf("answer: %s", r.Body)
	}
	if w.thingCount() != 0 {
		t.Fatal("the failed command's write survived")
	}
}

func TestIdempotencyKeyReplaysTheFirstAnswer(t *testing.T) {
	w := setup(t)
	key := newKey()
	body := map[string]string{"title": "Once"}
	first := w.ada.DoJSONWith("POST", "/api/commands/addThing", body, w.csrf(w.ada, idem(key))).Want(t, http.StatusOK, "first")
	second := w.ada.DoJSONWith("POST", "/api/commands/addThing", body, w.csrf(w.ada, idem(key))).Want(t, http.StatusOK, "second")
	if string(first.Body) != string(second.Body) {
		t.Fatalf("answers differ: %s vs %s", first.Body, second.Body)
	}
	if second.Header.Get("Idempotent-Replayed") != "true" || first.Header.Get("Idempotent-Replayed") != "" {
		t.Fatal("only the second answer is marked replayed")
	}
	if w.thingCount() != 1 {
		t.Fatalf("want one row, got %d", w.thingCount())
	}
}

func TestIdempotencyKeyForAnotherCommandConflicts(t *testing.T) {
	w := setup(t)
	key := newKey()
	body := map[string]string{"title": "x"}
	w.ada.DoJSONWith("POST", "/api/commands/addThing", body, w.csrf(w.ada, idem(key))).Want(t, http.StatusOK, "first")
	r := w.ada.DoJSONWith("POST", "/api/commands/addOther", body, w.csrf(w.ada, idem(key))).Want(t, http.StatusConflict, "other command")
	if r.JSON(t)["detail"] != "This Idempotency-Key was used for another command" {
		t.Fatalf("answer: %s", r.Body)
	}
}

func TestIdempotencyKeyMustBeAUUID(t *testing.T) {
	w := setup(t)
	r := w.ada.DoJSONWith("POST", "/api/commands/addThing", map[string]string{"title": "x"}, w.csrf(w.ada, idem("abc"))).Want(t, http.StatusBadRequest, "not a uuid")
	if r.JSON(t)["detail"] != "The Idempotency-Key header must be a UUID" {
		t.Fatalf("answer: %s", r.Body)
	}
	if w.thingCount() != 0 {
		t.Fatal("a refused key still ran the command")
	}
}

func TestTheKeyInTheQueryStringIsNotAKey(t *testing.T) {
	w := setup(t)
	path := "/api/commands/addThing?idempotencyKey=" + newKey()
	w.ada.Post(path, map[string]string{"title": "a"}).Want(t, http.StatusOK, "first")
	w.ada.Post(path, map[string]string{"title": "a"}).Want(t, http.StatusOK, "second")
	if w.thingCount() != 2 {
		t.Fatalf("only the header is a key; want two rows, got %d", w.thingCount())
	}
}

func TestIdempotencyKeyOfAnotherCallerConflicts(t *testing.T) {
	w := setup(t)
	bo := w.SignedIn(w.Person("Bo", "USER"))
	key := newKey()
	body := map[string]string{"title": "Ada's"}
	w.ada.DoJSONWith("POST", "/api/commands/addThing", body, w.csrf(w.ada, idem(key))).Want(t, http.StatusOK, "Ada")
	r := bo.DoJSONWith("POST", "/api/commands/addThing", body, w.csrf(bo, idem(key))).Want(t, http.StatusConflict, "Bo reuses Ada's key")
	if strings.Contains(string(r.Body), "Ada's") {
		t.Fatalf("Bo was shown Ada's answer: %s", r.Body)
	}
	if r.JSON(t)["detail"] != "This Idempotency-Key was used by someone else; send a new one (a fresh UUID per attempt)" {
		t.Fatalf("answer: %s", r.Body)
	}
}

func TestIdempotencyKeyIsReusableAfterTheFirstAttemptRolledBack(t *testing.T) {
	w := setup(t)
	key := newKey()
	body := map[string]string{"title": "Again"}
	w.ada.DoJSONWith("POST", "/api/commands/failOnce", body, w.csrf(w.ada, idem(key))).Want(t, http.StatusConflict, "first attempt fails")
	if w.thingCount() != 0 {
		t.Fatal("the failed attempt wrote")
	}
	first := w.ada.DoJSONWith("POST", "/api/commands/failOnce", body, w.csrf(w.ada, idem(key))).Want(t, http.StatusOK, "retry runs again")
	again := w.ada.DoJSONWith("POST", "/api/commands/failOnce", body, w.csrf(w.ada, idem(key))).Want(t, http.StatusOK, "third is a replay")
	if string(first.Body) != string(again.Body) || again.Header.Get("Idempotent-Replayed") != "true" || w.thingCount() != 1 {
		t.Fatalf("retry was not stored: %s vs %s, %d rows", first.Body, again.Body, w.thingCount())
	}
}

func TestConcurrentRequestsWithOneKeyWriteOnce(t *testing.T) {
	w := setup(t)
	key := newKey()
	body := map[string]string{"title": "Once"}
	send := func() authntest.Reply {
		return w.ada.DoJSONWith("POST", "/api/commands/slowAdd", body, w.csrf(w.ada, idem(key)))
	}
	replies := make(chan authntest.Reply, 2)
	go func() { replies <- send() }()
	<-w.started // the first holds its transaction open
	go func() { replies <- send() }()
	close(w.release)
	a, b := <-replies, <-replies
	a.Want(t, http.StatusOK, "one")
	b.Want(t, http.StatusOK, "two")
	if string(a.Body) != string(b.Body) {
		t.Fatalf("answers differ: %s vs %s", a.Body, b.Body)
	}
	if w.thingCount() != 1 {
		t.Fatalf("want one row, got %d", w.thingCount())
	}
}
