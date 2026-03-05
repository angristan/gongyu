package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSetAndGetFlash(t *testing.T) {
	// Set flash
	w := httptest.NewRecorder()
	setFlash(w, "Hello!")

	// Extract the cookie that was set
	resp := w.Result()
	cookies := resp.Cookies()
	var flashCookie *http.Cookie
	for _, c := range cookies {
		if c.Name == flashCookieName {
			flashCookie = c
			break
		}
	}
	if flashCookie == nil {
		t.Fatal("flash cookie not set")
	}
	if flashCookie.Value != "Hello!" {
		t.Errorf("flash cookie value = %q, want %q", flashCookie.Value, "Hello!")
	}

	// Get flash
	req := httptest.NewRequest("GET", "/", nil)
	req.AddCookie(flashCookie)
	w2 := httptest.NewRecorder()
	msg := getFlash(w2, req)
	if msg != "Hello!" {
		t.Errorf("getFlash() = %q, want %q", msg, "Hello!")
	}

	// Cookie should be cleared (MaxAge = -1)
	resp2 := w2.Result()
	for _, c := range resp2.Cookies() {
		if c.Name == flashCookieName && c.MaxAge != -1 {
			t.Errorf("flash cookie MaxAge = %d, want -1", c.MaxAge)
		}
	}
}

func TestGetFlashNoCookie(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	msg := getFlash(w, req)
	if msg != "" {
		t.Errorf("getFlash() with no cookie = %q, want empty", msg)
	}
}
