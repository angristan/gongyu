package handler

import (
	"embed"
	"encoding/json"
	"fmt"
	"html/template"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/angristan/gongyu/internal/auth"
	"github.com/angristan/gongyu/internal/model"
)

// Handler holds dependencies shared across all HTTP handlers.
type Handler struct {
	Store   model.Store
	EncKey  []byte
	BaseURL string

	templates map[string]*template.Template
	StaticFS  fs.FS
}

// New creates a Handler and parses templates.
func New(store model.Store, encKey []byte, baseURL string, templateFS embed.FS, staticFS embed.FS) *Handler {
	funcMap := template.FuncMap{
		"domain": extractDomain,
		"timeago": func(t time.Time) string {
			d := time.Since(t)
			switch {
			case d < time.Minute:
				return "just now"
			case d < time.Hour:
				m := int(d.Minutes())
				if m == 1 {
					return "1 minute ago"
				}
				return fmt.Sprintf("%d minutes ago", m)
			case d < 24*time.Hour:
				h := int(d.Hours())
				if h == 1 {
					return "1 hour ago"
				}
				return fmt.Sprintf("%d hours ago", h)
			case d < 30*24*time.Hour:
				days := int(d.Hours() / 24)
				if days == 1 {
					return "1 day ago"
				}
				return fmt.Sprintf("%d days ago", days)
			default:
				return t.Format("Jan 2, 2006")
			}
		},
		"formatDate": func(t time.Time) string {
			return t.Format("Jan 2, 2006")
		},
		"formatDateShort": func(t time.Time) string {
			return t.Format("2006-01-02")
		},
		"truncate": func(s string, n int) string {
			if len(s) <= n {
				return s
			}
			return s[:n-1] + "…"
		},
		"add": func(a, b int) int { return a + b },
		"sub": func(a, b int) int { return a - b },
		"seq": func(start, end int) []int {
			var s []int
			for i := start; i <= end; i++ {
				s = append(s, i)
			}
			return s
		},
		"safeHTML": func(s string) template.HTML {
			return template.HTML(s)
		},
		"queryEscape": url.QueryEscape,
		"jsonMarshal": func(v any) template.JS {
			b, _ := json.Marshal(v)
			return template.JS(b)
		},
	}

	pages := []string{
		"home.html",
		"bookmark.html",
		"login.html",
		"setup.html",
		"admin_dashboard.html",
		"admin_bookmarks.html",
		"admin_bookmark_form.html",
		"admin_settings.html",
		"admin_import.html",
		"bookmarklet.html",
	}

	templates := make(map[string]*template.Template)
	for _, page := range pages {
		t := template.Must(
			template.New("").Funcs(funcMap).ParseFS(templateFS, "templates/layout.html", "templates/"+page),
		)
		templates[page] = t
	}

	templates["bookmarklet_saved.html"] = template.Must(
		template.New("").Funcs(funcMap).ParseFS(templateFS, "templates/bookmarklet_saved.html"),
	)

	staticSub, err := fs.Sub(staticFS, "static")
	if err != nil {
		log.Fatalf("static fs: %v", err)
	}

	return &Handler{
		Store:     store,
		EncKey:    encKey,
		BaseURL:   strings.TrimRight(baseURL, "/"),
		templates: templates,
		StaticFS:  staticSub,
	}
}

func (h *Handler) render(w http.ResponseWriter, r *http.Request, name string, data map[string]any) {
	if data == nil {
		data = map[string]any{}
	}
	data["User"] = auth.UserFromContext(r.Context())
	data["BaseURL"] = h.BaseURL
	data["Flash"] = getFlash(w, r)

	tmpl, ok := h.templates[name]
	if !ok {
		log.Printf("template not found: %s", name)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")

	execName := "layout"
	if name == "bookmarklet_saved.html" {
		execName = name
	}

	if err := tmpl.ExecuteTemplate(w, execName, data); err != nil {
		log.Printf("template error (%s): %v", name, err)
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
			log.Printf("json encode error: %v", err)
		}
	}
}

func extractDomain(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	host := u.Hostname()
	host = strings.TrimPrefix(host, "www.")
	return host
}
