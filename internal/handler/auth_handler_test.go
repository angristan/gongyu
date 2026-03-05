package handler

import (
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/stanislas/gongyu/internal/auth"
	"github.com/stanislas/gongyu/internal/model"
)

func TestLoginPageGuest(t *testing.T) {
	store := &mockStore{
		getSession: noSessionStore(),
	}

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/login")
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
}

func TestLoginPageRedirectsAuthed(t *testing.T) {
	store := &mockStore{}
	user := &model.User{ID: 1, Name: "Test", Email: "test@example.com"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	req, _ := http.NewRequest("GET", srv.URL+"/login", nil)
	req.AddCookie(cookie)
	resp, err := noRedirectClient().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 302 {
		t.Errorf("status = %d, want 302", resp.StatusCode)
	}
	loc := resp.Header.Get("Location")
	if loc != "/admin/dashboard" {
		t.Errorf("Location = %q, want /admin/dashboard", loc)
	}
}

func TestLoginSubmitSuccess(t *testing.T) {
	hash, _ := auth.HashPassword("password123")
	store := &mockStore{
		getUserByEmail: func(ctx context.Context, email string) (model.User, error) {
			if email == "test@example.com" {
				return model.User{ID: 1, Email: "test@example.com", Password: hash}, nil
			}
			return model.User{}, sql.ErrNoRows
		},
		createSession: func(ctx context.Context, arg model.CreateSessionParams) error {
			return nil
		},
		getSession: noSessionStore(),
	}

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	form := url.Values{"email": {"test@example.com"}, "password": {"password123"}}
	resp, err := noRedirectClient().PostForm(srv.URL+"/login", form)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 302 {
		t.Errorf("status = %d, want 302", resp.StatusCode)
	}
	loc := resp.Header.Get("Location")
	if loc != "/admin/dashboard" {
		t.Errorf("Location = %q, want /admin/dashboard", loc)
	}

	var found bool
	for _, c := range resp.Cookies() {
		if c.Name == "gongyu_session" && c.Value != "" {
			found = true
		}
	}
	if !found {
		t.Error("session cookie not set")
	}
}

func TestLoginSubmitBadCredentials(t *testing.T) {
	store := &mockStore{
		getUserByEmail: func(ctx context.Context, email string) (model.User, error) {
			return model.User{}, sql.ErrNoRows
		},
		getSession: noSessionStore(),
	}

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	form := url.Values{"email": {"bad@example.com"}, "password": {"wrong"}}
	resp, err := http.PostForm(srv.URL+"/login", form)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
}

func TestLogout(t *testing.T) {
	store := &mockStore{
		deleteSession: func(ctx context.Context, token string) error {
			return nil
		},
		getSession: noSessionStore(),
	}

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	req, _ := http.NewRequest("POST", srv.URL+"/logout", nil)
	req.AddCookie(&http.Cookie{Name: "gongyu_session", Value: "some-token"})
	resp, err := noRedirectClient().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 302 {
		t.Errorf("status = %d, want 302", resp.StatusCode)
	}
}

func TestSetupPageShowsFormWhenNoUsers(t *testing.T) {
	store := &mockStore{
		countUsers: func(ctx context.Context) (int64, error) {
			return 0, nil
		},
		getSession: noSessionStore(),
	}

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/setup")
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
}

func TestSetupPageRedirectsWhenUsersExist(t *testing.T) {
	store := &mockStore{
		countUsers: func(ctx context.Context) (int64, error) {
			return 1, nil
		},
		getSession: noSessionStore(),
	}

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	resp, err := noRedirectClient().Get(srv.URL + "/setup")
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 302 {
		t.Errorf("status = %d, want 302", resp.StatusCode)
	}
}

func TestSetupSubmitCreatesUser(t *testing.T) {
	var createdEmail string
	store := &mockStore{
		countUsers: func(ctx context.Context) (int64, error) {
			return 0, nil
		},
		createUser: func(ctx context.Context, arg model.CreateUserParams) (model.User, error) {
			createdEmail = arg.Email
			return model.User{ID: 1, Name: arg.Name, Email: arg.Email, Password: arg.Password}, nil
		},
		createSession: func(ctx context.Context, arg model.CreateSessionParams) error {
			return nil
		},
		getSession: noSessionStore(),
	}

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	form := url.Values{
		"name":                  {"Admin"},
		"email":                 {"admin@example.com"},
		"password":              {"password123"},
		"password_confirmation": {"password123"},
	}
	resp, err := noRedirectClient().PostForm(srv.URL+"/setup", form)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 302 {
		t.Errorf("status = %d, want 302", resp.StatusCode)
	}
	if createdEmail != "admin@example.com" {
		t.Errorf("created email = %q, want admin@example.com", createdEmail)
	}
}

func TestSetupSubmitValidation(t *testing.T) {
	store := &mockStore{
		countUsers: func(ctx context.Context) (int64, error) {
			return 0, nil
		},
		getSession: noSessionStore(),
	}

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	form := url.Values{
		"name":                  {""},
		"email":                 {""},
		"password":              {"short"},
		"password_confirmation": {"different"},
	}
	resp, err := http.PostForm(srv.URL+"/setup", form)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
}
