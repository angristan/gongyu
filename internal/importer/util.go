package importer

import "html"

func htmlUnescape(value string) string {
	return html.UnescapeString(value)
}
