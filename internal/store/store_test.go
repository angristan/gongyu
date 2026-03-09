package store

import "testing"

func TestBuildTSQuery(t *testing.T) {
	tests := []struct {
		input, want string
	}{
		{"", ""},
		{"  ", ""},
		{"hello", "hello:*"},
		{"hello world", "hello:* & world:*"},
		{"  hello   world  ", "hello:* & world:*"},
		// Special chars stripped
		{`"quoted"`, "quoted:*"},
		{"it's", "its:*"},
		{"a*b", "ab:*"},
		{"(group)", "group:*"},
		{"a:b", "ab:*"},
		{"a+b&c|d!e", "abcde:*"},
		{"^test-case", "testcase:*"},
		// Only special chars → empty
		{"\"'*():-+&|!", ""},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := buildTSQuery(tt.input)
			if got != tt.want {
				t.Errorf("buildTSQuery(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestPageBounds(t *testing.T) {
	tests := []struct {
		total, page, perPage int
		wantPage, wantLast   int
	}{
		{0, 1, 10, 1, 1},
		{1, 1, 10, 1, 1},
		{10, 1, 10, 1, 1},
		{11, 1, 10, 1, 2},
		{25, 3, 10, 3, 3},
		{25, 0, 10, 1, 3},  // page < 1 clamped
		{25, 99, 10, 3, 3}, // page > last clamped
		{100, 5, 20, 5, 5},
		{101, 5, 20, 5, 6},
	}

	for _, tt := range tests {
		p := pageBounds(tt.total, tt.page, tt.perPage)
		if p.page != tt.wantPage || p.lastPage != tt.wantLast {
			t.Errorf("pageBounds(%d, %d, %d) = {%d, %d}, want {%d, %d}",
				tt.total, tt.page, tt.perPage, p.page, p.lastPage, tt.wantPage, tt.wantLast)
		}
	}
}

func TestSearchPage(t *testing.T) {
	tests := []struct {
		total, page, perPage int
		wantPage, wantLast   int
		wantOffset           int32
	}{
		{0, 1, 20, 1, 1, 0},
		{25, 1, 10, 1, 3, 0},
		{25, 3, 10, 3, 3, 20},
		{25, 99, 10, 3, 3, 20},
	}

	for _, tt := range tests {
		p, offset := searchPage(tt.total, tt.page, tt.perPage)
		if p.page != tt.wantPage || p.lastPage != tt.wantLast || offset != tt.wantOffset {
			t.Errorf("searchPage(%d, %d, %d) = {%d, %d}, %d; want {%d, %d}, %d",
				tt.total, tt.page, tt.perPage, p.page, p.lastPage, offset, tt.wantPage, tt.wantLast, tt.wantOffset)
		}
	}
}
