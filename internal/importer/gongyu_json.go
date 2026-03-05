package importer

import (
	"encoding/json"
	"fmt"

	"github.com/stanislas/gongyu/internal/db"
)

type gongyuExport struct {
	Bookmarks []db.Bookmark `json:"bookmarks"`
}

// ParseGongyuJSON parses a Gongyu JSON export file.
func ParseGongyuJSON(content string) ([]db.Bookmark, error) {
	var export gongyuExport
	if err := json.Unmarshal([]byte(content), &export); err != nil {
		return nil, fmt.Errorf("parse JSON: %w", err)
	}
	return export.Bookmarks, nil
}
