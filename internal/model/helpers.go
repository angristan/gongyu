package model

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"math/big"
)

const shortURLChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

func GenerateShortURL() string {
	b := make([]byte, 8)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(shortURLChars))))
		b[i] = shortURLChars[n.Int64()]
	}
	return string(b)
}

func UniqueShortURL(ctx context.Context, store Store) (string, error) {
	for {
		s := GenerateShortURL()
		exists, err := store.ShortURLExists(ctx, s)
		if err != nil {
			return "", err
		}
		if !exists {
			return s, nil
		}
	}
}

// GetSetting retrieves a setting value, decrypting if needed.
func GetSetting(ctx context.Context, store Store, key string, encKey []byte) string {
	s, err := store.GetSetting(ctx, key)
	if err != nil {
		return ""
	}
	if s.Value == "" {
		return ""
	}
	if s.Encrypted != 0 && len(encKey) > 0 {
		dec, err := decrypt(s.Value, encKey)
		if err != nil {
			return ""
		}
		return dec
	}
	return s.Value
}

// SetSetting stores a setting, encrypting if requested.
func SetSetting(ctx context.Context, store Store, key, value string, encrypted bool, encKey []byte) error {
	storeValue := value
	if encrypted && len(encKey) > 0 && value != "" {
		enc, err := encrypt(value, encKey)
		if err != nil {
			return fmt.Errorf("encrypt setting: %w", err)
		}
		storeValue = enc
	}
	var encInt int64
	if encrypted {
		encInt = 1
	}
	return store.UpsertSetting(ctx, key, storeValue, encInt)
}

func encrypt(plaintext string, key []byte) (string, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func decrypt(encoded string, key []byte) (string, error) {
	ciphertext, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", errors.New("ciphertext too short")
	}
	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}
