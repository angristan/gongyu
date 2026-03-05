package handler

import (
	"crypto/hmac"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

func logMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(sw, r)
		slog.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", sw.status,
			"duration", time.Since(start).Round(time.Millisecond),
		)
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func cacheControl(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		next.ServeHTTP(w, r)
	})
}

func (h *Handler) csrfProtect(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			next.ServeHTTP(w, r)
			return
		}

		// JSON requests are protected by CORS preflight — skip CSRF check.
		ct := r.Header.Get("Content-Type")
		if strings.HasPrefix(ct, "application/json") {
			next.ServeHTTP(w, r)
			return
		}

		// No session cookie means unauthenticated; SameSite=Lax protects those routes.
		c, err := r.Cookie("gongyu_session")
		if err != nil {
			next.ServeHTTP(w, r)
			return
		}

		expected := csrfToken(c.Value, h.EncKey)
		got := r.FormValue("_csrf")
		if !hmac.Equal([]byte(got), []byte(expected)) {
			http.Error(w, "Forbidden - invalid CSRF token", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func recoverMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				slog.Error("panic recovered", "error", err)
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}
