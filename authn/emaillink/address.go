package emaillink

import (
	"net/mail"
	"strings"
)

const maxAddressLength = 320

// normalizeAddress is how addresses are stored and compared: trimmed and lower-cased.
func normalizeAddress(address string) string {
	return strings.ToLower(strings.TrimSpace(address))
}

// looksLikeAnAddress reports whether the text is a plain address (no display
// name, no angle brackets, no whitespace) of a sane length. It is the gate in
// front of every lookup and every email, so nothing odd is stored or sent.
func looksLikeAnAddress(address string) bool {
	address = strings.TrimSpace(address)
	if address == "" || len(address) > maxAddressLength {
		return false
	}
	for _, r := range address {
		if r < 0x20 || r == 0x7F || r == ' ' || r == '<' || r == '>' || r == ',' || r == ';' {
			return false
		}
	}
	parsed, err := mail.ParseAddress(address)
	return err == nil && parsed.Name == "" && parsed.Address == address
}
