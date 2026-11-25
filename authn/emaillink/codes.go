package emaillink

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"strings"

	"github.com/google/uuid"
)

// alphabet is Crockford base32: 0-9 and A-Z without I, L, O and U.
const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

const maxRawCodeLength = 64

// newCode returns a random code of the given length. 256 is a multiple of 32, so
// masking a random byte to five bits picks each character with equal probability.
func newCode(length int) string {
	b := make([]byte, length)
	if _, err := rand.Read(b); err != nil {
		panic("emaillink: no randomness for a code: " + err.Error())
	}
	out := make([]byte, length)
	for i, v := range b {
		out[i] = alphabet[v&31]
	}
	return string(out)
}

// newToken returns a 256-bit URL-safe value for the sign-in link.
func newToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic("emaillink: no randomness for a token: " + err.Error())
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

func sha256Hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

// normalizeCode reads what a person typed: case-insensitive, spaces and dashes
// ignored, and O read as 0 and I and L as 1, so a mistyped look-alike still
// works. It reports false for anything that cannot be a code of this length.
func normalizeCode(raw string, length int) (string, bool) {
	if len(raw) > maxRawCodeLength {
		return "", false
	}
	var b strings.Builder
	for i := 0; i < len(raw); i++ {
		c := raw[i]
		if c > 0x7F {
			return "", false
		}
		switch {
		case c == ' ' || c == '-':
			continue
		case c >= 'a' && c <= 'z':
			c -= 'a' - 'A'
		}
		switch c {
		case 'O':
			c = '0'
		case 'I', 'L':
			c = '1'
		}
		b.WriteByte(c)
	}
	code := b.String()
	if len(code) != length {
		return "", false
	}
	for i := 0; i < len(code); i++ {
		if strings.IndexByte(alphabet, code[i]) < 0 {
			return "", false
		}
	}
	return code, true
}

// formatCode groups a code for reading and typing: K7F2QM becomes K7F-2QM.
func formatCode(code string) string {
	split := (len(code) + 1) / 2
	return code[:split] + "-" + code[split:]
}

// hasher stores codes as an HMAC keyed with the server's secret and the
// credential id, so a copy of the database cannot be used to check a code.
type hasher struct{ key []byte }

func (h hasher) hash(credentialID uuid.UUID, code string) string {
	mac := hmac.New(sha256.New, h.key)
	mac.Write([]byte(credentialID.String() + ":" + code))
	return hex.EncodeToString(mac.Sum(nil))
}
