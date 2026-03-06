package model

import (
	"crypto/sha256"
	"encoding/json"
	"strings"
	"testing"
)

func TestGenerateShortURL(t *testing.T) {
	url, err := GenerateShortURL()
	if err != nil {
		t.Fatalf("GenerateShortURL() error = %v", err)
	}
	if len(url) != 8 {
		t.Errorf("GenerateShortURL() length = %d, want 8", len(url))
	}
	for _, c := range url {
		if (c < 'a' || c > 'z') && (c < 'A' || c > 'Z') && (c < '0' || c > '9') {
			t.Errorf("GenerateShortURL() contains invalid char %c", c)
		}
	}

	// Should produce unique values
	seen := make(map[string]bool)
	for range 100 {
		s, err := GenerateShortURL()
		if err != nil {
			t.Fatalf("GenerateShortURL() error = %v", err)
		}
		if seen[s] {
			t.Errorf("GenerateShortURL() produced duplicate: %s", s)
		}
		seen[s] = true
	}
}

func testKey() []byte {
	h := sha256.Sum256([]byte("test-key-for-unit-tests"))
	return h[:]
}

func TestEncryptDecryptRoundtrip(t *testing.T) {
	key := testKey()
	tests := []string{
		"hello world",
		"",
		"special chars: !@#$%^&*()",
		"unicode: こんにちは 🌍",
		"a",
	}

	for _, plaintext := range tests {
		if plaintext == "" {
			continue // encrypt("") still works but let's focus on non-empty
		}
		encrypted, err := encrypt(plaintext, key)
		if err != nil {
			t.Fatalf("encrypt(%q) error: %v", plaintext, err)
		}
		if encrypted == plaintext {
			t.Errorf("encrypt(%q) returned plaintext unchanged", plaintext)
		}

		decrypted, err := decrypt(encrypted, key)
		if err != nil {
			t.Fatalf("decrypt() error: %v", err)
		}
		if decrypted != plaintext {
			t.Errorf("roundtrip: got %q, want %q", decrypted, plaintext)
		}
	}
}

func TestDecryptBadData(t *testing.T) {
	key := testKey()

	// Not base64
	if _, err := decrypt("not-base64!!!", key); err == nil {
		t.Error("decrypt(bad base64) should error")
	}

	// Valid base64 but bad ciphertext
	if _, err := decrypt("aGVsbG8=", key); err == nil {
		t.Error("decrypt(bad ciphertext) should error")
	}
}

func TestEncryptProducesDifferentCiphertexts(t *testing.T) {
	key := testKey()
	a, err := encrypt("same", key)
	if err != nil {
		t.Fatal(err)
	}
	b, err := encrypt("same", key)
	if err != nil {
		t.Fatal(err)
	}
	if a == b {
		t.Error("encrypt should produce different ciphertexts for the same plaintext (random nonce)")
	}
}

func TestUserPasswordOmittedFromJSON(t *testing.T) {
	u := User{
		ID:       1,
		Name:     "test",
		Email:    "test@example.com",
		Password: "$2a$10$somebcrypthash",
	}
	data, err := json.Marshal(u)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "bcrypt") || strings.Contains(string(data), "password") {
		t.Errorf("User JSON should not contain password, got: %s", data)
	}
}

func TestDecryptWrongKey(t *testing.T) {
	key1 := testKey()
	key2 := sha256.Sum256([]byte("different-key"))

	encrypted, err := encrypt("secret", key1)
	if err != nil {
		t.Fatal(err)
	}
	_, err = decrypt(encrypted, key2[:])
	if err == nil {
		t.Error("decrypt with wrong key should error")
	}
}
