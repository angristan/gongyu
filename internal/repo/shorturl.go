package repo

import (
	"crypto/rand"
)

const shortURLEnabledChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

func GenerateShortURL() string {
	buffer := make([]byte, 8)
	_, err := rand.Read(buffer)
	if err != nil {
		return "abc12345"
	}
	for i := range buffer {
		buffer[i] = shortURLEnabledChars[int(buffer[i])%len(shortURLEnabledChars)]
	}
	return string(buffer)
}
