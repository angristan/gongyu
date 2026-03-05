package service

import "testing"

func TestSettingsCryptoRoundTrip(t *testing.T) {
	crypto := NewSettingsCrypto("my-secret")
	encoded, err := crypto.Encrypt("sensitive-value")
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	if encoded == "" {
		t.Fatal("expected encrypted value")
	}
	decoded, err := crypto.Decrypt(encoded)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if decoded != "sensitive-value" {
		t.Fatalf("unexpected decrypted value: %s", decoded)
	}
}
