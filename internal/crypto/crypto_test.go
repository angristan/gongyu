package crypto

import (
	"crypto/sha256"
	"testing"
)

func testKey() []byte {
	h := sha256.Sum256([]byte("test-key-for-unit-tests"))
	return h[:]
}

func TestEncryptDecryptRoundtrip(t *testing.T) {
	key := testKey()
	tests := []string{
		"hello world",
		"special chars: !@#$%^&*()",
		"unicode: こんにちは 🌍",
		"a",
	}

	for _, plaintext := range tests {
		encrypted, err := Encrypt(plaintext, key)
		if err != nil {
			t.Fatalf("Encrypt(%q) error: %v", plaintext, err)
		}
		if encrypted == plaintext {
			t.Errorf("Encrypt(%q) returned plaintext unchanged", plaintext)
		}

		decrypted, err := Decrypt(encrypted, key)
		if err != nil {
			t.Fatalf("Decrypt() error: %v", err)
		}
		if decrypted != plaintext {
			t.Errorf("roundtrip: got %q, want %q", decrypted, plaintext)
		}
	}
}

func TestDecryptBadData(t *testing.T) {
	key := testKey()

	if _, err := Decrypt("not-base64!!!", key); err == nil {
		t.Error("Decrypt(bad base64) should error")
	}

	if _, err := Decrypt("aGVsbG8=", key); err == nil {
		t.Error("Decrypt(bad ciphertext) should error")
	}
}

func TestEncryptProducesDifferentCiphertexts(t *testing.T) {
	key := testKey()
	a, err := Encrypt("same", key)
	if err != nil {
		t.Fatal(err)
	}
	b, err := Encrypt("same", key)
	if err != nil {
		t.Fatal(err)
	}
	if a == b {
		t.Error("Encrypt should produce different ciphertexts for the same plaintext (random nonce)")
	}
}

func TestDecryptWrongKey(t *testing.T) {
	key1 := testKey()
	key2 := sha256.Sum256([]byte("different-key"))

	encrypted, err := Encrypt("secret", key1)
	if err != nil {
		t.Fatal(err)
	}
	_, err = Decrypt(encrypted, key2[:])
	if err == nil {
		t.Error("Decrypt with wrong key should error")
	}
}
