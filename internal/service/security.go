package service

import (
	"crypto/rand"
	"encoding/base64"
)

func RandomToken(size int) string {
	if size <= 0 {
		size = 32
	}
	buffer := make([]byte, size)
	_, err := rand.Read(buffer)
	if err != nil {
		return "static-token"
	}
	return base64.RawURLEncoding.EncodeToString(buffer)
}
