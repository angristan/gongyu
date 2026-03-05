package handler

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/angristan/gongyu/internal/importer"
	"github.com/angristan/gongyu/internal/model"
	"github.com/angristan/gongyu/internal/view"
)

func (h *Handler) AdminImportPage(w http.ResponseWriter, r *http.Request) {
	h.render(w, r, view.AdminImportPage(view.ImportData{
		LayoutData: h.layoutData(w, r),
	}))
}

func (h *Handler) AdminImport(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	importType := r.FormValue("type")

	renderErr := func(msg string) {
		h.render(w, r, view.AdminImportPage(view.ImportData{
			LayoutData: h.layoutData(w, r),
			Errors:     []string{msg},
		}))
	}

	var bookmarks []model.Bookmark
	var err error

	switch importType {
	case "shaarli_api":
		url := strings.TrimSpace(r.FormValue("shaarli_url"))
		secret := strings.TrimSpace(r.FormValue("shaarli_secret"))
		if url == "" || secret == "" {
			renderErr("Shaarli URL and API secret are required")
			return
		}
		bookmarks, err = importer.FetchFromShaarliAPI(url, secret)

	case "shaarli_datastore":
		content, readErr := readUploadedFile(r, "file")
		if readErr != nil {
			renderErr("Failed to read uploaded file")
			return
		}
		bookmarks, err = importer.ParseShaarliDatastore(content)

	case "netscape":
		content, readErr := readUploadedFile(r, "file")
		if readErr != nil {
			renderErr("Failed to read uploaded file")
			return
		}
		bookmarks = importer.ParseNetscapeBookmarks(content)

	case "gongyu":
		content, readErr := readUploadedFile(r, "file")
		if readErr != nil {
			renderErr("Failed to read uploaded file")
			return
		}
		bookmarks, err = importer.ParseGongyuJSON(content)

	default:
		renderErr("Unknown import type")
		return
	}

	if err != nil {
		renderErr("Failed to parse: " + err.Error())
		return
	}

	// Fill in short URLs and timestamps for import
	for i := range bookmarks {
		if bookmarks[i].ShortUrl == "" {
			bookmarks[i].ShortUrl = model.GenerateShortURL()
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
		renderErr("Import failed: " + err.Error())
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
	defer func() {
		if err := file.Close(); err != nil {
			log.Printf("failed to close uploaded file: %v", err)
		}
	}()
	data, err := io.ReadAll(file)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
