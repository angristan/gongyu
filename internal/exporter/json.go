package exporter

import (
	"encoding/json"
	"time"

	"github.com/angristan/gongyu/internal/model"
)

type jsonExport struct {
	ExportedAt string        `json:"exported_at"`
	Version    string        `json:"version"`
	Count      int           `json:"count"`
	Bookmarks  []model.Bookmark `json:"bookmarks"`
}

func GenerateJSON(bookmarks []model.Bookmark) ([]byte, error) {
	export := jsonExport{
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
		Version:    "1.0",
		Count:      len(bookmarks),
		Bookmarks:  bookmarks,
	}
	return json.MarshalIndent(export, "", "  ")
}
