package handler

import (
	"crypto/hmac"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"strings"

	"github.com/a-h/templ"
	"github.com/angristan/gongyu/internal/auth"
	"github.com/angristan/gongyu/internal/background"
	"github.com/angristan/gongyu/internal/model"
	"github.com/angristan/gongyu/internal/view"
)

// Handler holds dependencies shared across all HTTP handlers.
type Handler struct {
	Store      model.Store
	EncKey     []byte
	BaseURL    string
	Background *background.Runner

	StaticFS      fs.FS
	StaticVersion string // content hash for cache busting
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
	}
}

func (h *Handler) layoutData(w http.ResponseWriter, r *http.Request) view.LayoutData {
	var csrf string
	if c, err := r.Cookie("gongyu_session"); err == nil {
		csrf = csrfToken(c.Value, h.EncKey)
	}
	return view.LayoutData{
		User:          auth.UserFromContext(r.Context()),
		BaseURL:       h.BaseURL,
		Flash:         getFlash(w, r),
		StaticVersion: h.StaticVersion,
		CsrfToken:     csrf,
	}
}

// csrfToken derives a CSRF token from the session token using HMAC.
func csrfToken(sessionToken string, key []byte) string {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(sessionToken))
	return hex.EncodeToString(mac.Sum(nil))[:32]
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
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
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
