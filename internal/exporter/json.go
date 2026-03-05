package exporter

import (
	"encoding/json"
	"time"

	"github.com/stanislas/gongyu/internal/db"
)

type jsonExport struct {
	ExportedAt string        `json:"exported_at"`
	Version    string        `json:"version"`
	Count      int           `json:"count"`
	Bookmarks  []db.Bookmark `json:"bookmarks"`
}

func GenerateJSON(bookmarks []db.Bookmark) ([]byte, error) {
	export := jsonExport{
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
		Version:    "1.0",
		Count:      len(bookmarks),
		Bookmarks:  bookmarks,
	}
	return json.MarshalIndent(export, "", "  ")
}
