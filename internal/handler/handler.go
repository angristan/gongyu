package handler

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/a-h/templ"
	"github.com/angristan/gongyu/internal/auth"
	"github.com/angristan/gongyu/internal/background"
	"github.com/angristan/gongyu/internal/model"
	"github.com/angristan/gongyu/internal/view"
)

const (
	sessionCookieName   = "gongyu_session"
	guestCSRFCookieName = "gongyu_csrf"
)

// Handler holds dependencies shared across all HTTP handlers.
type Handler struct {
	Store      model.Store
	EncKey     []byte
	BaseURL    string
	Background *background.Runner

	StaticFS      fs.FS
	StaticVersion string // content hash for cache busting
	loginLimiter  *ipLimiter
}

// New creates a Handler.
func New(store model.Store, encKey []byte, baseURL string, staticFS embed.FS, bg *background.Runner) *Handler {
	staticSub, err := fs.Sub(staticFS, "static")
	if err != nil {
		panic(fmt.Sprintf("static fs: %v", err))
	}

	return &Handler{
		Store:         store,
		EncKey:        encKey,
		BaseURL:       strings.TrimRight(baseURL, "/"),
		Background:    bg,
		StaticFS:      staticSub,
		StaticVersion: hashFS(staticSub),
		loginLimiter:  newIPLimiter(),
	}
}

func (h *Handler) layoutData(w http.ResponseWriter, r *http.Request) view.LayoutData {
	return view.LayoutData{
		User:          auth.UserFromContext(r.Context()),
		BaseURL:       h.BaseURL,
		Flash:         getFlash(w, r),
		StaticVersion: h.StaticVersion,
		CsrfToken:     h.formCSRFToken(w, r),
	}
}

// csrfToken derives a CSRF token from the session token using HMAC.
func csrfToken(sessionToken string, key []byte) string {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(sessionToken))
	return hex.EncodeToString(mac.Sum(nil))[:32]
}

func (h *Handler) formCSRFToken(w http.ResponseWriter, r *http.Request) string {
	if c, err := r.Cookie(sessionCookieName); err == nil && c.Value != "" {
		return csrfToken(c.Value, h.EncKey)
	}

	if c, err := r.Cookie(guestCSRFCookieName); err == nil && c.Value != "" {
		return c.Value
	}

	token, err := randomToken(32)
	if err != nil {
		slog.Error("failed to generate guest CSRF token", "error", err)
		return ""
	}

	http.SetCookie(w, &http.Cookie{
		Name:     guestCSRFCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   authIsHTTPS(r),
		MaxAge:   int((24 * time.Hour).Seconds()),
	})

	return token
}

func randomToken(size int) (string, error) {
	b := make([]byte, size)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// hashFS computes a short content hash of all files in the FS.
func hashFS(fsys fs.FS) string {
	h := sha256.New()
	fs.WalkDir(fsys, ".", func(path string, d fs.DirEntry, err error) error { //nolint:errcheck
		if err != nil || d.IsDir() {
			return nil
		}
		data, err := fs.ReadFile(fsys, path)
		if err != nil {
			return nil
		}
		h.Write([]byte(path))
		h.Write(data)
		return nil
	})
	return hex.EncodeToString(h.Sum(nil))[:12]
}

func (h *Handler) render(w http.ResponseWriter, r *http.Request, component templ.Component) {
	if err := component.Render(r.Context(), w); err != nil {
		slog.Error("render failed", "error", err)
	}
}

func (h *Handler) jsonResponse(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		enc := json.NewEncoder(w)
		enc.SetEscapeHTML(false)
		if err := enc.Encode(data); err != nil {
			slog.Error("json encode failed", "error", err)
		}
	}
}
