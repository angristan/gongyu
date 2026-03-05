package handler

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"strings"

	"github.com/a-h/templ"
	"github.com/angristan/gongyu/internal/auth"
	"github.com/angristan/gongyu/internal/model"
	"github.com/angristan/gongyu/internal/view"
)

// Handler holds dependencies shared across all HTTP handlers.
type Handler struct {
	Store   model.Store
	EncKey  []byte
	BaseURL string

	StaticFS fs.FS
}

// New creates a Handler.
func New(store model.Store, encKey []byte, baseURL string, staticFS embed.FS) *Handler {
	staticSub, err := fs.Sub(staticFS, "static")
	if err != nil {
		panic(fmt.Sprintf("static fs: %v", err))
	}

	return &Handler{
		Store:    store,
		EncKey:   encKey,
		BaseURL:  strings.TrimRight(baseURL, "/"),
		StaticFS: staticSub,
	}
}

func (h *Handler) layoutData(w http.ResponseWriter, r *http.Request) view.LayoutData {
	return view.LayoutData{
		User:    auth.UserFromContext(r.Context()),
		BaseURL: h.BaseURL,
		Flash:   getFlash(w, r),
	}
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
