package handler

import (
	"net/http"
	"strings"
)

type loginForm struct {
	Email    string
	Password string
	Remember bool
}

func parseLoginForm(r *http.Request) (loginForm, error) {
	if err := r.ParseForm(); err != nil {
		return loginForm{}, err
	}
	return loginForm{
		Email:    strings.TrimSpace(r.FormValue("email")),
		Password: r.FormValue("password"),
		Remember: r.FormValue("remember") == "on",
	}, nil
}

type setupForm struct {
	Name                 string
	Email                string
	Password             string
	PasswordConfirmation string
}

func parseSetupForm(r *http.Request) (setupForm, error) {
	if err := r.ParseForm(); err != nil {
		return setupForm{}, err
	}
	return setupForm{
		Name:                 strings.TrimSpace(r.FormValue("name")),
		Email:                strings.TrimSpace(r.FormValue("email")),
		Password:             r.FormValue("password"),
		PasswordConfirmation: r.FormValue("password_confirmation"),
	}, nil
}

func (f setupForm) Validate() []string {
	var errors []string
	if f.Name == "" {
		errors = append(errors, "Name is required")
	}
	if f.Email == "" {
		errors = append(errors, "Email is required")
	}
	if len(f.Password) < 8 {
		errors = append(errors, "Password must be at least 8 characters")
	}
	if f.Password != f.PasswordConfirmation {
		errors = append(errors, "Passwords do not match")
	}
	return errors
}

type bookmarkForm struct {
	URL         string
	Title       string
	Description string
	Share       bool
	Source      string
}

func parseBookmarkForm(r *http.Request) (bookmarkForm, error) {
	if err := r.ParseForm(); err != nil {
		return bookmarkForm{}, err
	}
	return bookmarkForm{
		URL:         strings.TrimSpace(r.FormValue("url")),
		Title:       strings.TrimSpace(r.FormValue("title")),
		Description: strings.TrimSpace(r.FormValue("description")),
		Share:       r.FormValue("share") == "on",
		Source:      r.FormValue("source"),
	}, nil
}

func (f bookmarkForm) Validate() []string {
	var errors []string
	if f.URL == "" {
		errors = append(errors, "URL is required")
	}
	if f.Title == "" {
		errors = append(errors, "Title is required")
	}
	return errors
}
