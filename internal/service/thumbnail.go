package service

import "net/url"

func ResolveThumbnailURL(pageURL string, ogImage string) string {
	if ogImage == "" {
		return ""
	}
	parsedOG, err := url.Parse(ogImage)
	if err == nil && parsedOG.IsAbs() {
		return ogImage
	}
	parsedPage, err := url.Parse(pageURL)
	if err != nil {
		return ""
	}
	if parsedOG != nil {
		return parsedPage.ResolveReference(parsedOG).String()
	}
	return ""
}
