package cqrs_test

import (
	"net/http"
	"testing"
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
	first := w.ada.DoJSONWith("POST", "/api/commands/addThing", body, w.csrf(idem(key))).Want(t, http.StatusOK, "first")
	second := w.ada.DoJSONWith("POST", "/api/commands/addThing", body, w.csrf(idem(key))).Want(t, http.StatusOK, "second")
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
	w.ada.DoJSONWith("POST", "/api/commands/addThing", body, w.csrf(idem(key))).Want(t, http.StatusOK, "first")
	r := w.ada.DoJSONWith("POST", "/api/commands/addOther", body, w.csrf(idem(key))).Want(t, http.StatusConflict, "other command")
	if r.JSON(t)["detail"] != "This Idempotency-Key was used for another command" {
		t.Fatalf("answer: %s", r.Body)
	}
}

func TestIdempotencyKeyMustBeAUUID(t *testing.T) {
	w := setup(t)
	r := w.ada.DoJSONWith("POST", "/api/commands/addThing", map[string]string{"title": "x"}, w.csrf(idem("abc"))).Want(t, http.StatusBadRequest, "not a uuid")
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
