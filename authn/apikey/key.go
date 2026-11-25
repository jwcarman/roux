package apikey

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"hash/crc32"
	"math/big"
	"strings"
)

// A key is the prefix, 30 random base62 characters (about 178 bits), and a 6-character base62
// CRC-32 of those 30: the shape GitHub uses for its tokens. The prefix makes a leaked key
// recognizable to a secret scanner; the checksum tells a real key from look-alike text without
// a database query. It is not a security check: the secret is the random part.
const (
	randomLength   = 30
	checksumLength = 6
	alphabet       = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
)

func randomBase62(n int) (string, error) {
	var b strings.Builder
	max := big.NewInt(int64(len(alphabet)))
	for i := 0; i < n; i++ {
		v, err := rand.Int(rand.Reader, max) // uniform, no modulo bias
		if err != nil {
			return "", err
		}
		b.WriteByte(alphabet[v.Int64()])
	}
	return b.String(), nil
}

func checksum(random string) string {
	n := uint64(crc32.ChecksumIEEE([]byte(random)))
	out := make([]byte, checksumLength)
	for i := checksumLength - 1; i >= 0; i-- {
		out[i] = alphabet[n%62]
		n /= 62
	}
	return string(out)
}

// newKey makes a key with the prefix.
func newKey(prefix string) (string, error) {
	random, err := randomBase62(randomLength)
	if err != nil {
		return "", err
	}
	return prefix + random + checksum(random), nil
}

// wellFormed says whether the text has the key's shape and a right checksum, so that a wrong
// guess never reaches the database.
func wellFormed(prefix, key string) bool {
	if !strings.HasPrefix(key, prefix) || len(key) != len(prefix)+randomLength+checksumLength {
		return false
	}
	body := key[len(prefix):]
	for _, c := range body {
		if !strings.ContainsRune(alphabet, c) {
			return false
		}
	}
	return checksum(body[:randomLength]) == body[randomLength:]
}

// hashOf is what is stored: a key is looked up by its hash, so changing the prefix leaves
// existing keys working.
func hashOf(key string) string {
	sum := sha256.Sum256([]byte(key))
	return hex.EncodeToString(sum[:])
}
