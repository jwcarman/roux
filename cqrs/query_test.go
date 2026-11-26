package cqrs_test

import (
	"net/http"
	"testing"

	"github.com/jwcarman/roux/authn/authntest"
)

func problemFields(t *testing.T, r authntest.Reply) []map[string]any {
	t.Helper()
	var out []map[string]any
	for _, e := range r.JSON(t)["errors"].([]any) {
		out = append(out, e.(map[string]any))
	}
	return out
}

func TestQueryAnswersAPageOfRows(t *testing.T) {
	w := setup(t)
	r := w.ada.Get("/api/queries/things?pageIndex=0&pageSize=2").Want(t, http.StatusOK, "page one")
	body := r.JSON(t)
	data := body["data"].([]any)
	pg := body["pagination"].(map[string]any)
	if len(data) != 2 || data[0].(map[string]any)["title"] != "Ada" {
		t.Fatalf("data: %s", r.Body)
	}
	if pg["pageIndex"] != 0.0 || pg["pageSize"] != 2.0 || pg["totalElementCount"] != 3.0 ||
		pg["totalPageCount"] != 2.0 || pg["hasNext"] != true || pg["hasPrevious"] != false {
		t.Fatalf("pagination: %s", r.Body)
	}
	if w.seen.caller == nil {
		t.Fatal("Run got no caller")
	}
}

func TestQueryArgsFillTaggedFields(t *testing.T) {
	w := setup(t)
	w.ada.Get("/api/queries/things?status=open").Want(t, http.StatusOK, "status open")
	if w.seen.args.Status != "open" {
		t.Fatalf("status: %q", w.seen.args.Status)
	}
	w.ada.Get("/api/queries/things?status=").Want(t, http.StatusOK, "empty status")
	if w.seen.args.Status != "" {
		t.Fatalf("an empty value is absent, got %q", w.seen.args.Status)
	}
}

func TestQueryRefusesAnUnknownParameter(t *testing.T) {
	w := setup(t)
	r := w.ada.Get("/api/queries/things?colour=red").Want(t, http.StatusBadRequest, "colour")
	e := problemFields(t, r)[0]
	if e["field"] != "colour" || e["message"] != "colour is not a parameter of this query; the parameters are pageIndex, pageSize, search, sortBy, sortDirection, status" {
		t.Fatalf("error: %v", e)
	}
	r = w.ada.Get("/api/queries/counts?colour=red").Want(t, http.StatusBadRequest, "colour on a lookup")
	if m := problemFields(t, r)[0]["message"]; m != "colour is not a parameter of this query, which takes none" {
		t.Fatalf("message: %v", m)
	}
}

func TestQueryRefusesAValueOutsideOneof(t *testing.T) {
	w := setup(t)
	r := w.ada.Get("/api/queries/things?status=maybe").Want(t, http.StatusBadRequest, "status")
	e := problemFields(t, r)[0]
	if e["field"] != "status" || e["message"] != "status must be one of open, done" {
		t.Fatalf("error: %v", e)
	}
}

func TestQueryChecksItsPermission(t *testing.T) {
	w := setup(t)
	bo := w.SignedIn(w.Person("Bo", "GUEST"))
	bo.Get("/api/queries/things").Want(t, http.StatusForbidden, "Bo has no permission")
	bo.Get("/api/queries/counts").Want(t, http.StatusForbidden, "Bo has no permission")
	w.Browser().Get("/api/queries/things").Want(t, http.StatusUnauthorized, "signed out")
}

func TestLookupAnswersItsValue(t *testing.T) {
	w := setup(t)
	r := w.ada.Get("/api/queries/counts").Want(t, http.StatusOK, "counts")
	if string(r.Body) != `{"open":2}`+"\n" && string(r.Body) != `{"open":2}` {
		t.Fatalf("body: %s", r.Body)
	}
}
