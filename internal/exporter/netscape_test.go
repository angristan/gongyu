package exporter

import (
	"strings"
	"testing"
	"time"

	"github.com/stanislas/gongyu/internal/model"
)

func TestGenerateNetscape(t *testing.T) {
	bookmarks := []model.Bookmark{
		{
			Url:       "https://example.com",
			Title:     "Example",
			ShortUrl:  "abc123",
			CreatedAt: time.Unix(1700000000, 0),
			UpdatedAt: time.Unix(1700000100, 0),
		},
		{
			Url:             "https://go.dev",
			Title:           "Go Dev",
			Description:     "The Go programming language",
			ShortUrl:        "def456",
			ShaarliShortUrl: "shaarli1",
			CreatedAt:       time.Unix(1700000200, 0),
			UpdatedAt:       time.Unix(1700000300, 0),
		},
	}

	result := GenerateNetscape(bookmarks)

	if !strings.Contains(result, "<!DOCTYPE NETSCAPE-Bookmark-file-1>") {
		t.Error("missing DOCTYPE header")
	}
	if !strings.Contains(result, `HREF="https://example.com"`) {
		t.Error("missing first bookmark URL")
	}
	if !strings.Contains(result, `SHORTURL="abc123"`) {
		t.Error("missing shorturl attribute")
	}
	if !strings.Contains(result, `ADD_DATE="1700000000"`) {
		t.Error("missing ADD_DATE")
	}
	if !strings.Contains(result, `>Example</A>`) {
		t.Error("missing first bookmark title")
	}
	if !strings.Contains(result, `<DD>The Go programming language`) {
		t.Error("missing description for second bookmark")
	}
	if !strings.Contains(result, `SHAARLI_SHORTURL="shaarli1"`) {
		t.Error("missing SHAARLI_SHORTURL attribute")
	}
	// First bookmark has no description — no DD tag
	lines := strings.Split(result, "\n")
	for i, line := range lines {
		if strings.Contains(line, ">Example</A>") {
			if i+1 < len(lines) && strings.Contains(lines[i+1], "<DD>") {
				t.Error("first bookmark should not have <DD> tag")
			}
		}
	}
}

func TestGenerateNetscapeEmpty(t *testing.T) {
	result := GenerateNetscape(nil)
	if !strings.Contains(result, "<!DOCTYPE NETSCAPE-Bookmark-file-1>") {
		t.Error("empty input should still produce header")
	}
	if !strings.Contains(result, "</DL><p>") {
		t.Error("empty input should still produce closing tag")
	}
}

func TestGenerateNetscapeHTMLEscaping(t *testing.T) {
	bookmarks := []model.Bookmark{
		{
			Url:       "https://example.com?a=1&b=2",
			Title:     `Title with "quotes" & <tags>`,
			ShortUrl:  "x",
			CreatedAt: time.Unix(0, 0),
			UpdatedAt: time.Unix(0, 0),
		},
	}

	result := GenerateNetscape(bookmarks)
	if strings.Contains(result, `HREF="https://example.com?a=1&b=2"`) {
		t.Error("URL should be HTML-escaped")
	}
	if !strings.Contains(result, "&amp;") {
		t.Error("& should be escaped to &amp;")
	}
	if strings.Contains(result, `<tags>`) {
		t.Error("angle brackets in title should be escaped")
	}
}
