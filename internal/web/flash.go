package web

import (
	"net/http"
	"net/url"
	"time"

	"gongyu/internal/view"
)

const (
	flashSuccessCookie = "gongyu_flash_success"
	flashErrorCookie   = "gongyu_flash_error"
)

func setFlashSuccess(w http.ResponseWriter, value string) {
	setFlashCookie(w, flashSuccessCookie, value)
}

func setFlashError(w http.ResponseWriter, value string) {
	setFlashCookie(w, flashErrorCookie, value)
}

func setFlashCookie(w http.ResponseWriter, name, value string) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    url.QueryEscape(value),
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int((5 * time.Minute).Seconds()),
	})
}

func popFlash(w http.ResponseWriter, r *http.Request) view.Flash {
	flash := view.Flash{}
	if cookie, err := r.Cookie(flashSuccessCookie); err == nil {
		if value, err := url.QueryUnescape(cookie.Value); err == nil {
			flash.Success = value
		}
		clearCookie(w, flashSuccessCookie)
	}
	if cookie, err := r.Cookie(flashErrorCookie); err == nil {
		if value, err := url.QueryUnescape(cookie.Value); err == nil {
			flash.Error = value
		}
		clearCookie(w, flashErrorCookie)
	}
	return flash
}

func clearCookie(w http.ResponseWriter, name string) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}
