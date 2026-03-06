package handler

import (
	"net/http"
	"strings"
	"time"

	"github.com/angristan/gongyu/internal/auth"
	"github.com/angristan/gongyu/internal/model"
	"github.com/angristan/gongyu/internal/view"
)

func (h *Handler) LoginPage(w http.ResponseWriter, r *http.Request) {
	h.render(w, r, view.LoginPage(view.LoginData{
		LayoutData: h.layoutData(w, r),
	}))
}

func (h *Handler) LoginSubmit(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	email := strings.TrimSpace(r.FormValue("email"))
	password := r.FormValue("password")
	remember := r.FormValue("remember") == "on"

	user, err := auth.Authenticate(r.Context(), h.Store, email, password)
	if err != nil {
		h.render(w, r, view.LoginPage(view.LoginData{
			LayoutData: h.layoutData(w, r),
			Error:      "The provided credentials do not match our records.",
			Email:      email,
		}))
		return
	}

	if err := auth.Login(w, r, h.Store, user, remember); err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "/admin/dashboard", http.StatusFound)
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	auth.Logout(w, r, h.Store)
	http.Redirect(w, r, "/", http.StatusFound)
}

func (h *Handler) SetupPage(w http.ResponseWriter, r *http.Request) {
	count, err := h.Store.CountUsers(r.Context())
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	if count > 0 {
		http.Redirect(w, r, "/", http.StatusFound)
		return
	}
	h.render(w, r, view.SetupPage(view.SetupData{
		LayoutData: h.layoutData(w, r),
	}))
}

func (h *Handler) SetupSubmit(w http.ResponseWriter, r *http.Request) {
	count, err := h.Store.CountUsers(r.Context())
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	if count > 0 {
		http.Redirect(w, r, "/", http.StatusFound)
		return
	}

	if err := r.ParseForm(); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(r.FormValue("name"))
	email := strings.TrimSpace(r.FormValue("email"))
	password := r.FormValue("password")
	passwordConfirm := r.FormValue("password_confirmation")

	var errors []string
	if name == "" {
		errors = append(errors, "Name is required")
	}
	if email == "" {
		errors = append(errors, "Email is required")
	}
	if len(password) < 8 {
		errors = append(errors, "Password must be at least 8 characters")
	}
	if password != passwordConfirm {
		errors = append(errors, "Passwords do not match")
	}
	if len(errors) > 0 {
		h.render(w, r, view.SetupPage(view.SetupData{
			LayoutData: h.layoutData(w, r),
			Errors:     errors,
			Name:       name,
			Email:      email,
		}))
		return
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	now := time.Now().UTC()
	user, err := h.Store.CreateUser(r.Context(), model.CreateUserParams{
		Name: name, Email: email, Password: hash, CreatedAt: now, UpdatedAt: now,
	})
	if err != nil {
		h.render(w, r, view.SetupPage(view.SetupData{
			LayoutData: h.layoutData(w, r),
			Errors:     []string{"Failed to create account. Email may already be in use."},
			Name:       name,
			Email:      email,
		}))
		return
	}

	if err := auth.Login(w, r, h.Store, &user, false); err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/admin/dashboard", http.StatusFound)
}
