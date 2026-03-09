package title

import "strings"

var knownSuffixes = []string{
	"YouTube", "Wikipedia", "Reddit", "Twitter", "X", "GitHub",
	"Stack Overflow", "Medium", "Amazon", "eBay", "LinkedIn",
	"Facebook", "Instagram", "TikTok", "Pinterest", "Hacker News",
	"The Verge", "Ars Technica", "BBC", "CNN", "NPR",
}

var separators = []string{" | ", " — ", " – ", " · ", " - "}

// Clean removes common website name suffixes from page titles.
func Clean(t string) string {
	t = strings.TrimSpace(t)
	if t == "" {
		return t
	}

	for _, sep := range separators {
		idx := strings.LastIndex(t, sep)
		if idx <= 0 {
			continue
		}
		suffix := strings.TrimSpace(t[idx+len(sep):])
		for _, known := range knownSuffixes {
			if strings.EqualFold(suffix, known) {
				cleaned := strings.TrimSpace(t[:idx])
				if cleaned != "" {
					return cleaned
				}
				return t
			}
		}
	}
	return t
}
