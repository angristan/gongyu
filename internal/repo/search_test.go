package repo

import "testing"

func TestBuildTsQuery(t *testing.T) {
	query := buildTsQuery("advanced PHP!!")
	if query != "advanced:* & PHP:*" {
		t.Fatalf("unexpected tsquery: %s", query)
	}
}

func TestBuildFtsQuery(t *testing.T) {
	query := buildFtsQuery("laravel react")
	if query != `"laravel"* AND "react"*` {
		t.Fatalf("unexpected fts query: %s", query)
	}
}
