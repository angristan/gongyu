package service

import "strings"

func CleanTitle(title string) string {
	title = strings.TrimSpace(title)
	for _, suffix := range []string{" - YouTube", " | YouTube", " - X", " | X"} {
		title = strings.TrimSuffix(title, suffix)
	}
	return strings.TrimSpace(title)
}
