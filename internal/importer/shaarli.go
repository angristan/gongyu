package importer

import (
	"crypto/hmac"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"
)

func buildShaarliJWT(secret string) string {
	header := base64URLEncode(mustJSON(map[string]string{
		"typ": "JWT",
		"alg": "HS512",
	}))
	payload := base64URLEncode(mustJSON(map[string]int64{
		"iat": time.Now().Unix(),
	}))

	mac := hmac.New(sha512.New, []byte(secret))
	_, _ = mac.Write([]byte(fmt.Sprintf("%s.%s", header, payload)))
	signature := base64URLEncode(mac.Sum(nil))
	return fmt.Sprintf("%s.%s.%s", header, payload, signature)
}

func base64URLEncode(value []byte) string {
	return base64.RawURLEncoding.EncodeToString(value)
}

func mustJSON(value any) []byte {
	encoded, _ := json.Marshal(value)
	return encoded
}
