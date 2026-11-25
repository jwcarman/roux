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
		`{"item":"tea","extra":1}`: "not valid JSON",
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
