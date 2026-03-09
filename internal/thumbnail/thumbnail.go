package thumbnail

import (
	"bytes"
	"context"
	"fmt"
	stdhtml "html"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	htmlnode "golang.org/x/net/html"
)

const metadataBodyLimit = 1 << 20

type Metadata struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	OGImage     string `json:"og_image"`
}

// Fetcher fetches bookmark metadata over HTTP.
type Fetcher struct {
	httpClient *http.Client
}

func NewFetcher(httpClient *http.Client) *Fetcher {
	if httpClient == nil {
		httpClient = &http.Client{}
	}
	return &Fetcher{httpClient: httpClient}
}

// FetchMetadata fetches title, description, and og:image from a URL.
func (f *Fetcher) FetchMetadata(ctx context.Context, rawURL string) (*Metadata, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; Gongyu/1.0)")

	resp, err := f.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch %s: %w", rawURL, err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			slog.Error("failed to close response body", "error", err)
		}
	}()

	body, err := io.ReadAll(io.LimitReader(resp.Body, metadataBodyLimit))
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	meta, err := parseMetadata(body)
	if err != nil {
		return nil, err
	}
	if meta.OGImage != "" {
		meta.OGImage = resolveReference(rawURL, meta.OGImage)
	}
	return meta, nil
}

func parseMetadata(body []byte) (*Metadata, error) {
	doc, err := htmlnode.Parse(bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("parse html: %w", err)
	}

	var pageTitle string
	var ogTitle string
	var metaDesc string
	var ogDesc string
	var ogImage string

	var walk func(*htmlnode.Node)
	walk = func(n *htmlnode.Node) {
		if n == nil {
			return
		}

		if n.Type == htmlnode.ElementNode {
			switch strings.ToLower(n.Data) {
			case "title":
				if pageTitle == "" {
					pageTitle = strings.TrimSpace(stdhtml.UnescapeString(nodeText(n)))
				}
			case "meta":
				name := strings.ToLower(attrValue(n, "name"))
				property := strings.ToLower(attrValue(n, "property"))
				content := strings.TrimSpace(stdhtml.UnescapeString(attrValue(n, "content")))
				switch {
				case property == "og:title" && ogTitle == "":
					ogTitle = content
				case property == "og:description" && ogDesc == "":
					ogDesc = content
				case property == "og:image" && ogImage == "":
					ogImage = content
				case name == "description" && metaDesc == "":
					metaDesc = content
				}
			}
		}

		for child := n.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(doc)

	return &Metadata{
		Title:       firstNonEmpty(ogTitle, pageTitle),
		Description: firstNonEmpty(ogDesc, metaDesc),
		OGImage:     ogImage,
	}, nil
}

func attrValue(n *htmlnode.Node, key string) string {
	for _, attr := range n.Attr {
		if strings.EqualFold(attr.Key, key) {
			return attr.Val
		}
	}
	return ""
}

func nodeText(n *htmlnode.Node) string {
	var b strings.Builder
	var walk func(*htmlnode.Node)
	walk = func(node *htmlnode.Node) {
		if node == nil {
			return
		}
		if node.Type == htmlnode.TextNode {
			b.WriteString(node.Data)
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(n)
	return b.String()
}

func resolveReference(rawURL, ref string) string {
	if ref == "" {
		return ""
	}
	if strings.HasPrefix(ref, "http://") || strings.HasPrefix(ref, "https://") {
		return ref
	}

	base, err := url.Parse(rawURL)
	if err != nil {
		return ref
	}
	relative, err := url.Parse(ref)
	if err != nil {
		return ref
	}
	return base.ResolveReference(relative).String()
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
