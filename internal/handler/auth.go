package handler

import (
	"net/http"
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
	form, err := parseLoginForm(r)
	if err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	user, err := auth.Authenticate(r.Context(), h.Store, form.Email, form.Password)
	if err != nil {
		h.render(w, r, view.LoginPage(view.LoginData{
			LayoutData: h.layoutData(w, r),
			Error:      "The provided credentials do not match our records.",
			Email:      form.Email,
		}))
		return
	}

	if err := auth.Login(w, r, h.Store, user, form.Remember); err != nil {
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

	form, err := parseSetupForm(r)
	if err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	errors := form.Validate()
	if len(errors) > 0 {
		h.render(w, r, view.SetupPage(view.SetupData{
			LayoutData: h.layoutData(w, r),
			Errors:     errors,
			Name:       form.Name,
			Email:      form.Email,
		}))
		return
	}

	hash, err := auth.HashPassword(form.Password)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	now := time.Now().UTC()
	user, err := h.Store.CreateUser(r.Context(), model.CreateUserParams{
		Name: form.Name, Email: form.Email, Password: hash, CreatedAt: now, UpdatedAt: now,
	})
	if err != nil {
		h.render(w, r, view.SetupPage(view.SetupData{
			LayoutData: h.layoutData(w, r),
			Errors:     []string{"Failed to create account. Email may already be in use."},
			Name:       form.Name,
			Email:      form.Email,
		}))
		return
	}

	if err := auth.Login(w, r, h.Store, &user, false); err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/admin/dashboard", http.StatusFound)
}
