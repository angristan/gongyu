package title

import "testing"

func TestClean(t *testing.T) {
	tests := []struct {
		input, want string
	}{
		{"", ""},
		{"  ", ""},
		{"Simple Title", "Simple Title"},
		{"How to use Git | GitHub", "How to use Git"},
		{"Some article — YouTube", "Some article"},
		{"A post – Reddit", "A post"},
		{"Interesting · Medium", "Interesting"},
		{"Breaking news - CNN", "Breaking news"},
		{"Title | Unknown Site", "Title | Unknown Site"},
		{"Multiple | Separators | YouTube", "Multiple | Separators"},
		{"YouTube", "YouTube"},                   // suffix is entire title
		{"| YouTube", "| YouTube"},               // nothing before separator
		{"  spaced  | YouTube  ", "spaced"},       // trimming
		{"Title - Hacker News", "Title"},
		{"Title | Stack Overflow", "Title"},
		{"Title — Ars Technica", "Title"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := Clean(tt.input)
			if got != tt.want {
				t.Errorf("Clean(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}
