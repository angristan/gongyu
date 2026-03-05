package session

import (
	"errors"
	"net/http"
	"time"

	"github.com/gorilla/securecookie"
)

const CookieName = "gongyu_session"

type Manager struct {
	codec *securecookie.SecureCookie
}

type Data struct {
	UserID    int64  `json:"user_id"`
	CSRFToken string `json:"csrf_token"`
}

func New(secret string) *Manager {
	hashKey := []byte(secret)
	blockKey := []byte(secret)
	if len(blockKey) > 32 {
		blockKey = blockKey[:32]
	} else if len(blockKey) < 32 {
		padding := make([]byte, 32-len(blockKey))
		blockKey = append(blockKey, padding...)
	}

	codec := securecookie.New(hashKey, blockKey)
	codec.MaxAge(int((30 * 24 * time.Hour).Seconds()))
	return &Manager{codec: codec}
}

func (m *Manager) Read(r *http.Request) (Data, error) {
	cookie, err := r.Cookie(CookieName)
	if err != nil {
		return Data{}, err
	}
	var data Data
	if err := m.codec.Decode(CookieName, cookie.Value, &data); err != nil {
		return Data{}, err
	}
	if data.CSRFToken == "" {
		return Data{}, errors.New("invalid session")
	}
	return data, nil
}

func (m *Manager) Write(w http.ResponseWriter, data Data, secure bool) error {
	encoded, err := m.codec.Encode(CookieName, data)
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    encoded,
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int((30 * 24 * time.Hour).Seconds()),
	})
	return nil
}

func (m *Manager) Clear(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}
