package api_test

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/problem"
)

type order struct {
	Item string `json:"item"`
}

// decodeWith reads body with decode, answering the order and the problem it refused it with.
func decodeWith(decode func(*http.Request, any) error, body string) (order, *problem.Problem) {
	var o order
	err := decode(httptest.NewRequest("POST", "/orders", strings.NewReader(body)), &o)
	var p *problem.Problem
	errors.As(err, &p)
	return o, p
}

func TestDecodeIsStrict(t *testing.T) {
	if o, p := decodeWith(api.Decode, `{"item":"tea"}`); p != nil || o.Item != "tea" {
		t.Fatalf("%+v %v", o, p)
	}
	for body, detail := range map[string]string{
		`{"item":"tea","extra":1}`: "does not take: extra",
		`{"item":`:                 "not valid JSON",
		`{"item":"tea"} {}`:        "single JSON object",
	} {
		if _, p := decodeWith(api.Decode, body); p == nil || p.Status != 400 || !strings.Contains(p.Detail, detail) {
			t.Errorf("%s: %+v", body, p)
		}
	}
}

func TestDecodeLenientIgnoresWhatItDoesNotKnow(t *testing.T) {
	if o, p := decodeWith(api.DecodeLenient, `{"item":"tea","extra":1}`); p != nil || o.Item != "tea" {
		t.Fatalf("%+v %v", o, p)
	}
}

func TestADecodeErrorNamesNoGoType(t *testing.T) {
	for body, detail := range map[string]string{
		`{"item":42}`:    "Request body is not valid JSON: item has the wrong type.",
		`{"item":`:       "Request body is not valid JSON.",
		`{"other":1}`:    "Request body has a member this endpoint does not take: other.",
		`["item","tea"]`: "Request body is not valid JSON: it must be an object.",
	} {
		_, p := decodeWith(api.Decode, body)
		if p == nil || p.Detail != detail {
			t.Errorf("%s: %+v, want %q", body, p, detail)
		}
	}
	big := `{"item":"` + strings.Repeat("x", 1<<20) + `"}`
	if _, p := decodeWith(api.Decode, big); p == nil || p.Status != 413 || p.Detail != "Request body is too large." {
		t.Errorf("a body over 1 MiB: %+v", p)
	}
}
