package handler

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/stanislas/gongyu/internal/database"
	"github.com/stanislas/gongyu/internal/db"
	"github.com/stanislas/gongyu/internal/importer"
)

func (h *Handler) AdminImportPage(w http.ResponseWriter, r *http.Request) {
	h.render(w, r, "admin_import.html", map[string]any{"Title": "Import"})
}

func (h *Handler) AdminImport(w http.ResponseWriter, r *http.Request) {
	r.ParseMultipartForm(10 << 20)
	importType := r.FormValue("type")

	var bookmarks []db.Bookmark
	var err error

	switch importType {
	case "shaarli_api":
		url := strings.TrimSpace(r.FormValue("shaarli_url"))
		secret := strings.TrimSpace(r.FormValue("shaarli_secret"))
		if url == "" || secret == "" {
			h.render(w, r, "admin_import.html", map[string]any{
				"Title": "Import", "Errors": []string{"Shaarli URL and API secret are required"},
			})
			return
		}
		bookmarks, err = importer.FetchFromShaarliAPI(url, secret)

	case "shaarli_datastore":
		content, readErr := readUploadedFile(r, "file")
		if readErr != nil {
			h.render(w, r, "admin_import.html", map[string]any{
				"Title": "Import", "Errors": []string{"Failed to read uploaded file"},
			})
			return
		}
		bookmarks, err = importer.ParseShaarliDatastore(content)

	case "netscape":
		content, readErr := readUploadedFile(r, "file")
		if readErr != nil {
			h.render(w, r, "admin_import.html", map[string]any{
				"Title": "Import", "Errors": []string{"Failed to read uploaded file"},
			})
			return
		}
		bookmarks = importer.ParseNetscapeBookmarks(content)

	case "gongyu":
		content, readErr := readUploadedFile(r, "file")
		if readErr != nil {
			h.render(w, r, "admin_import.html", map[string]any{
				"Title": "Import", "Errors": []string{"Failed to read uploaded file"},
			})
			return
		}
		bookmarks, err = importer.ParseGongyuJSON(content)

	default:
		h.render(w, r, "admin_import.html", map[string]any{
			"Title": "Import", "Errors": []string{"Unknown import type"},
		})
		return
	}

	if err != nil {
		h.render(w, r, "admin_import.html", map[string]any{
			"Title": "Import", "Errors": []string{"Failed to parse: " + err.Error()},
		})
		return
	}

	// Fill in short URLs and timestamps for import
	for i := range bookmarks {
		if bookmarks[i].ShortUrl == "" {
			bookmarks[i].ShortUrl = database.GenerateShortURL()
		}
		if bookmarks[i].CreatedAt.IsZero() {
			bookmarks[i].CreatedAt = time.Now().UTC()
		}
		if bookmarks[i].UpdatedAt.IsZero() {
			bookmarks[i].UpdatedAt = bookmarks[i].CreatedAt
		}
	}

	imported, skipped, err := h.Store.BulkImportBookmarks(r.Context(), bookmarks)
	if err != nil {
		h.render(w, r, "admin_import.html", map[string]any{
			"Title": "Import", "Errors": []string{"Import failed: " + err.Error()},
		})
		return
	}

	setFlash(w, fmt.Sprintf("Imported %d bookmarks, skipped %d duplicates", imported, skipped))
	http.Redirect(w, r, "/admin/settings?tab=import", http.StatusFound)
}

func readUploadedFile(r *http.Request, fieldName string) (string, error) {
	file, _, err := r.FormFile(fieldName)
	if err != nil {
		return "", err
	}
	defer file.Close()
	data, err := io.ReadAll(file)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
