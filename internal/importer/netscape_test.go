package importer

import "testing"

func TestParseNetscape(t *testing.T) {
	html := `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
<DT><A HREF="https://example.com/a" ADD_DATE="1700000000">Example A</A>
<DD>Desc A
<DT><A HREF="https://example.com/b?WDWyig">Example B</A>
</DL><p>`

	bookmarks := ParseNetscape(html)
	if len(bookmarks) != 2 {
		t.Fatalf("expected 2 bookmarks, got %d", len(bookmarks))
	}
	if bookmarks[0].URL != "https://example.com/a" {
		t.Fatalf("unexpected first URL: %s", bookmarks[0].URL)
	}
	if bookmarks[1].ShaarliHash != "WDWyig" {
		t.Fatalf("expected Shaarli hash WDWyig, got %s", bookmarks[1].ShaarliHash)
	}
}
