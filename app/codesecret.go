package app

import (
	"fmt"
	"log/slog"
	"math"
	"strings"
)

// developmentCodeSecret is the CODE_SECRET `make dev` sets (template/Makefile): public, so it
// protects nothing. It is fine on a developer's machine and refused behind an https:// PUBLIC_URL.
const developmentCodeSecret = "development-only-code-secret-do-not-deploy"

// minCodeSecretBits is the strength below which a CODE_SECRET draws a warning.
const minCodeSecretBits = 128

// checkCodeSecret refuses the development secret in a deployment (a PUBLIC_URL that starts with
// https://), and warns when the secret is weaker than minCodeSecretBits. The development secret
// itself is never warned about: the warning is for secrets someone chose.
func checkCodeSecret(secret, publicURL string) error {
	if secret == developmentCodeSecret {
		if strings.HasPrefix(strings.ToLower(publicURL), "https://") {
			return fmt.Errorf("CODE_SECRET is the development secret, which is public, but PUBLIC_URL is %s, a "+
				"deployment: set CODE_SECRET to a secret of your own (openssl rand -base64 32)", publicURL)
		}
		return nil
	}
	if bits := codeSecretBits(secret); bits < minCodeSecretBits {
		slog.Warn(fmt.Sprintf("CODE_SECRET is weak (about %.0f bits, under %d): anyone who guesses it can forge sign-in codes; "+
			"make one with openssl rand -base64 32", bits, minCodeSecretBits))
	}
	return nil
}

// codeSecretBits estimates a secret's strength in bits: its length times log2 of the characters
// that could have been chosen, the alphabet being the character classes it uses (lower case 26,
// upper case 26, digits 10, anything else 33). It assumes the characters were chosen at random,
// so it is an upper bound: it finds a secret that is too short or too plain, not one that is a
// word. A secret of one character repeated is worth one character.
func codeSecretBits(secret string) float64 {
	var lower, upper, digit, other bool
	distinct := map[rune]bool{}
	length := 0
	for _, r := range secret {
		length++
		distinct[r] = true
		switch {
		case r >= 'a' && r <= 'z':
			lower = true
		case r >= 'A' && r <= 'Z':
			upper = true
		case r >= '0' && r <= '9':
			digit = true
		default:
			other = true
		}
	}
	if len(distinct) == 1 {
		length = 1
	}
	pool := 0
	for _, c := range []struct {
		used bool
		size int
	}{{lower, 26}, {upper, 26}, {digit, 10}, {other, 33}} {
		if c.used {
			pool += c.size
		}
	}
	if pool == 0 {
		return 0
	}
	return float64(length) * math.Log2(float64(pool))
}
