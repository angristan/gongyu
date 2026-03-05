package importer

import (
	"encoding/json"
	"fmt"

	"github.com/angristan/gongyu/internal/model"
)

type gongyuExport struct {
	Bookmarks []model.Bookmark `json:"bookmarks"`
}

// ParseGongyuJSON parses a Gongyu JSON export file.
func ParseGongyuJSON(content string) ([]model.Bookmark, error) {
	var export gongyuExport
	if err := json.Unmarshal([]byte(content), &export); err != nil {
		return nil, fmt.Errorf("parse JSON: %w", err)
	}
	return export.Bookmarks, nil
}
