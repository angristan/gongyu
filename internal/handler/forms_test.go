package handler

import (
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestParseLoginForm(t *testing.T) {
	req := httptest.NewRequest("POST", "/login", strings.NewReader(url.Values{
		"email":    {"  user@example.com  "},
		"password": {"secret"},
		"remember": {"on"},
	}.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	form, err := parseLoginForm(req)
	if err != nil {
		t.Fatalf("parseLoginForm() error = %v", err)
	}

	if form.Email != "user@example.com" {
		t.Fatalf("Email = %q", form.Email)
	}
	if form.Password != "secret" {
		t.Fatalf("Password = %q", form.Password)
	}
	if !form.Remember {
		t.Fatal("Remember = false, want true")
	}
}

func TestSetupFormValidate(t *testing.T) {
	form := setupForm{
		Name:                 "",
		Email:                "",
		Password:             "short",
		PasswordConfirmation: "different",
	}

	errors := form.Validate()
	if len(errors) != 4 {
		t.Fatalf("len(errors) = %d, want 4", len(errors))
	}
}

func TestParseBookmarkForm(t *testing.T) {
	req := httptest.NewRequest("POST", "/admin/bookmarks", strings.NewReader(url.Values{
		"url":         {" https://example.com "},
		"title":       {"  Example Title  "},
		"description": {"  Example Description  "},
		"share":       {"on"},
		"source":      {"bookmarklet"},
	}.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	form, err := parseBookmarkForm(req)
	if err != nil {
		t.Fatalf("parseBookmarkForm() error = %v", err)
	}

	if form.URL != "https://example.com" {
		t.Fatalf("URL = %q", form.URL)
	}
	if form.Title != "Example Title" {
		t.Fatalf("Title = %q", form.Title)
	}
	if form.Description != "Example Description" {
		t.Fatalf("Description = %q", form.Description)
	}
	if !form.Share {
		t.Fatal("Share = false, want true")
	}
	if form.Source != "bookmarklet" {
		t.Fatalf("Source = %q", form.Source)
	}
}

func TestBookmarkFormValidate(t *testing.T) {
	form := bookmarkForm{}
	errors := form.Validate()
	if len(errors) != 2 {
		t.Fatalf("len(errors) = %d, want 2", len(errors))
	}
}
