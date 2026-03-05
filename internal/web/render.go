package web

import (
	"context"
	"net/http"

	"github.com/a-h/templ"
)

func renderComponent(ctx context.Context, w http.ResponseWriter, component templ.Component) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := component.Render(ctx, w); err != nil {
		http.Error(w, "render error", http.StatusInternalServerError)
	}
}
