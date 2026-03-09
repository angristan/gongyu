package model

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"

	"github.com/angristan/gongyu/internal/crypto"
)

const shortURLChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

func GenerateShortURL() (string, error) {
	b := make([]byte, 8)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(shortURLChars))))
		if err != nil {
			return "", err
		}
		b[i] = shortURLChars[n.Int64()]
	}
	return string(b), nil
}

func UniqueShortURL(ctx context.Context, store Store) (string, error) {
	for {
		s, err := GenerateShortURL()
		if err != nil {
			return "", err
		}
		exists, err := store.ShortURLExists(ctx, s)
		if err != nil {
			return "", err
		}
		if !exists {
			return s, nil
		}
	}
}

// GetSetting retrieves a single setting value, decrypting if needed.
func GetSetting(ctx context.Context, store Store, key string, encKey []byte) string {
	s, err := store.GetSetting(ctx, key)
	if err != nil {
		return ""
	}
	if s.Value == "" {
		return ""
	}
	if s.Encrypted && len(encKey) > 0 {
		dec, err := crypto.Decrypt(s.Value, encKey)
		if err != nil {
			return ""
		}
		return dec
	}
	return s.Value
}

// GetSettings retrieves multiple settings at once, decrypting as needed.
// Returns a map of key → plaintext value (missing/empty keys are omitted).
func GetSettings(ctx context.Context, store Store, keys []string, encKey []byte) map[string]string {
	settings, err := store.GetSettings(ctx, keys)
	if err != nil {
		return map[string]string{}
	}
	result := make(map[string]string, len(settings))
	for key, s := range settings {
		if s.Value == "" {
			continue
		}
		if s.Encrypted && len(encKey) > 0 {
			dec, err := crypto.Decrypt(s.Value, encKey)
			if err != nil {
				continue
			}
			result[key] = dec
		} else {
			result[key] = s.Value
		}
	}
	return result
}

// SetSetting stores a setting, encrypting if requested.
func SetSetting(ctx context.Context, store Store, key, value string, encrypted bool, encKey []byte) error {
	storeValue := value
	if encrypted && len(encKey) > 0 && value != "" {
		enc, err := crypto.Encrypt(value, encKey)
		if err != nil {
			return fmt.Errorf("encrypt setting: %w", err)
		}
		storeValue = enc
	}
	return store.UpsertSetting(ctx, key, storeValue, encrypted)
}
