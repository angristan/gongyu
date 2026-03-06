package handler

import (
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/angristan/gongyu/internal/auth"
	"github.com/angristan/gongyu/internal/model"
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

	var found bool
	for _, c := range resp.Cookies() {
		if c.Name == guestCSRFCookieName && c.Value != "" {
			found = true
		}
	}
	if !found {
		t.Fatal("guest CSRF cookie not set")
	}
}

func TestLoginPageRedirectsAuthed(t *testing.T) {
	store := &mockStore{}
	user := &model.User{ID: 1, Name: "Test", Email: "test@example.com"}
	cookie := loginSession(store, user)

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	req, err := http.NewRequest("GET", srv.URL+"/login", nil)
	if err != nil {
		t.Fatal(err)
	}
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
	hash, err := auth.HashPassword("password123")
	if err != nil {
		t.Fatal(err)
	}
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

	guestCookie := &http.Cookie{Name: guestCSRFCookieName, Value: "guest-login-csrf"}
	form := withGuestCsrf(url.Values{"email": {"test@example.com"}, "password": {"password123"}}, guestCookie)
	req, err := http.NewRequest("POST", srv.URL+"/login", strings.NewReader(form.Encode()))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.AddCookie(guestCookie)
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

	guestCookie := &http.Cookie{Name: guestCSRFCookieName, Value: "guest-login-csrf"}
	form := withGuestCsrf(url.Values{"email": {"bad@example.com"}, "password": {"wrong"}}, guestCookie)
	req, err := http.NewRequest("POST", srv.URL+"/login", strings.NewReader(form.Encode()))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.AddCookie(guestCookie)
	resp, err := http.DefaultClient.Do(req)
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

	cookie := &http.Cookie{Name: "gongyu_session", Value: "some-token"}
	form := withCsrf(nil, cookie)
	req, err := http.NewRequest("POST", srv.URL+"/logout", strings.NewReader(form.Encode()))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.AddCookie(cookie)
	resp, err := noRedirectClient().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 302 {
		t.Errorf("status = %d, want 302", resp.StatusCode)
	}
}

func TestLoginRateLimit(t *testing.T) {
	store := &mockStore{
		getUserByEmail: func(ctx context.Context, email string) (model.User, error) {
			return model.User{}, sql.ErrNoRows
		},
		getSession: noSessionStore(),
	}

	srv := httptest.NewServer(newTestHandler(store))
	defer srv.Close()

	client := noRedirectClient()
	guestCookie := &http.Cookie{Name: guestCSRFCookieName, Value: "guest-login-csrf"}

	// Exhaust the burst (5 requests)
	for i := range 5 {
		form := withGuestCsrf(url.Values{"email": {"bad@example.com"}, "password": {"wrong"}}, guestCookie)
		req, err := http.NewRequest("POST", srv.URL+"/login", strings.NewReader(form.Encode()))
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.AddCookie(guestCookie)
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		closeTestBody(t, resp)
		if resp.StatusCode == http.StatusTooManyRequests {
			t.Fatalf("rate limited too early on attempt %d", i+1)
		}
	}

	// 6th request should be rate limited
	form := withGuestCsrf(url.Values{"email": {"bad@example.com"}, "password": {"wrong"}}, guestCookie)
	req, err := http.NewRequest("POST", srv.URL+"/login", strings.NewReader(form.Encode()))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.AddCookie(guestCookie)
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != http.StatusTooManyRequests {
		t.Errorf("status = %d, want %d", resp.StatusCode, http.StatusTooManyRequests)
	}
}

func TestLoginSubmitRequiresGuestCSRF(t *testing.T) {
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

	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("status = %d, want %d", resp.StatusCode, http.StatusForbidden)
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

	var found bool
	for _, c := range resp.Cookies() {
		if c.Name == guestCSRFCookieName && c.Value != "" {
			found = true
		}
	}
	if !found {
		t.Fatal("guest CSRF cookie not set")
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

	guestCookie := &http.Cookie{Name: guestCSRFCookieName, Value: "guest-setup-csrf"}
	form := withGuestCsrf(url.Values{
		"name":                  {"Admin"},
		"email":                 {"admin@example.com"},
		"password":              {"password123"},
		"password_confirmation": {"password123"},
	}, guestCookie)
	req, err := http.NewRequest("POST", srv.URL+"/setup", strings.NewReader(form.Encode()))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.AddCookie(guestCookie)
	resp, err := noRedirectClient().Do(req)
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

	guestCookie := &http.Cookie{Name: guestCSRFCookieName, Value: "guest-setup-csrf"}
	form := withGuestCsrf(url.Values{
		"name":                  {""},
		"email":                 {""},
		"password":              {"short"},
		"password_confirmation": {"different"},
	}, guestCookie)
	req, err := http.NewRequest("POST", srv.URL+"/setup", strings.NewReader(form.Encode()))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.AddCookie(guestCookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
}

func TestSetupSubmitRequiresGuestCSRF(t *testing.T) {
	store := &mockStore{
		countUsers: func(ctx context.Context) (int64, error) {
			return 0, nil
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
	resp, err := http.PostForm(srv.URL+"/setup", form)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTestBody(t, resp)

	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("status = %d, want %d", resp.StatusCode, http.StatusForbidden)
	}
}
