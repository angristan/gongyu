package feed

import (
	"encoding/xml"
	"time"

	"github.com/angristan/gongyu/internal/model"
)

type atomFeed struct {
	XMLName xml.Name    `xml:"feed"`
	XMLNS   string      `xml:"xmlns,attr"`
	Title   string      `xml:"title"`
	Link    atomLink    `xml:"link"`
	Updated string      `xml:"updated"`
	ID      string      `xml:"id"`
	Entries []atomEntry `xml:"entry"`
}

type atomLink struct {
	Href string `xml:"href,attr"`
	Rel  string `xml:"rel,attr,omitempty"`
	Type string `xml:"type,attr,omitempty"`
}

type atomEntry struct {
	Title   string   `xml:"title"`
	Link    atomLink `xml:"link"`
	ID      string   `xml:"id"`
	Updated string   `xml:"updated"`
	Summary *string  `xml:"summary,omitempty"`
}

func GenerateAtom(baseURL string, bookmarks []model.Bookmark) ([]byte, error) {
	feed := atomFeed{
		XMLNS:   "http://www.w3.org/2005/Atom",
		Title:   "Gongyu Bookmarks",
		Link:    atomLink{Href: baseURL + "/feed", Rel: "self", Type: "application/atom+xml"},
		ID:      baseURL + "/feed",
		Updated: time.Now().UTC().Format(time.RFC3339),
	}

	for _, b := range bookmarks {
		entry := atomEntry{
			Title:   b.Title,
			Link:    atomLink{Href: b.Url},
			ID:      baseURL + "/b/" + b.ShortUrl,
			Updated: b.UpdatedAt.UTC().Format(time.RFC3339),
		}
		if b.Description != "" {
			entry.Summary = &b.Description
		}
		feed.Entries = append(feed.Entries, entry)
	}

	output, err := xml.MarshalIndent(feed, "", "  ")
	if err != nil {
		return nil, err
	}
	return append([]byte(xml.Header), output...), nil
}
