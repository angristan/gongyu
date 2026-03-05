package handler

import (
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/angristan/gongyu/internal/exporter"
)

func (h *Handler) AdminExport(w http.ResponseWriter, r *http.Request) {
	format := r.URL.Query().Get("format")
	if format != "html" && format != "json" {
		http.Error(w, "Invalid format. Use ?format=html or ?format=json", http.StatusBadRequest)
		return
	}

	bookmarks, err := h.Store.AllBookmarks(r.Context())
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	timestamp := time.Now().Format("20060102_150405")

	switch format {
	case "html":
		content := exporter.GenerateNetscape(bookmarks)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="bookmarks_%s.html"`, timestamp))
		if _, err := w.Write([]byte(content)); err != nil {
			log.Printf("failed to write export: %v", err)
		}

	case "json":
		content, err := exporter.GenerateJSON(bookmarks)
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="bookmarks_%s.json"`, timestamp))
		if _, err := w.Write(content); err != nil {
			log.Printf("failed to write export: %v", err)
		}
	}
}
