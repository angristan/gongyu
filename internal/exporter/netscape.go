package exporter

import (
	"fmt"
	"html"
	"strings"

	"github.com/stanislas/gongyu/internal/model"
)

func GenerateNetscape(bookmarks []model.Bookmark) string {
	var sb strings.Builder
	sb.WriteString("<!DOCTYPE NETSCAPE-Bookmark-file-1>\n")
	sb.WriteString("<!-- This is an automatically generated file.\n     It will be read and overwritten.\n     DO NOT EDIT! -->\n")
	sb.WriteString("<META HTTP-EQUIV=\"Content-Type\" CONTENT=\"text/html; charset=UTF-8\">\n")
	sb.WriteString("<TITLE>Bookmarks</TITLE>\n")
	sb.WriteString("<H1>Bookmarks</H1>\n")
	sb.WriteString("<DL><p>\n")

	for _, b := range bookmarks {
		fmt.Fprintf(&sb, "    <DT><A HREF=\"%s\" ADD_DATE=\"%d\" SHORTURL=\"%s\"",
			html.EscapeString(b.Url), b.CreatedAt.Unix(), html.EscapeString(b.ShortUrl))
		if b.ShaarliShortUrl != "" {
			fmt.Fprintf(&sb, " SHAARLI_SHORTURL=\"%s\"", html.EscapeString(b.ShaarliShortUrl))
		}
		fmt.Fprintf(&sb, " LAST_MODIFIED=\"%d\">%s</A>\n",
			b.UpdatedAt.Unix(), html.EscapeString(b.Title))
		if b.Description != "" {
			fmt.Fprintf(&sb, "    <DD>%s\n", html.EscapeString(b.Description))
		}
	}

	sb.WriteString("</DL><p>\n")
	return sb.String()
}
