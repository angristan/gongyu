package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/angristan/gongyu/internal/model"
)

func TestHashPasswordAndCheck(t *testing.T) {
	hash, err := HashPassword("mypassword")
	if err != nil {
		t.Fatalf("HashPassword error: %v", err)
	}
	if hash == "mypassword" {
		t.Error("hash should not equal plaintext")
	}
	if !CheckPassword(hash, "mypassword") {
		t.Error("CheckPassword should return true for correct password")
	}
	if CheckPassword(hash, "wrongpassword") {
		t.Error("CheckPassword should return false for wrong password")
	}
}

func TestUserFromContext(t *testing.T) {
	// No user
	ctx := context.Background()
	if u := UserFromContext(ctx); u != nil {
		t.Errorf("expected nil user, got %v", u)
	}

	// With user
	user := &model.User{ID: 1, Name: "test", Email: "test@example.com"}
	ctx = context.WithValue(ctx, userKey, user)
	got := UserFromContext(ctx)
	if got == nil || got.ID != 1 {
		t.Errorf("expected user with ID 1, got %v", got)
	}
}

func TestRequireAuth(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := RequireAuth(inner)

	// No user → redirect
	req := httptest.NewRequest("GET", "/admin/dashboard", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusFound {
		t.Errorf("no user: status = %d, want %d", w.Code, http.StatusFound)
	}
	if loc := w.Header().Get("Location"); loc != "/login" {
		t.Errorf("redirect Location = %q, want /login", loc)
	}

	// With user → pass through
	user := &model.User{ID: 1}
	ctx := context.WithValue(req.Context(), userKey, user)
	req = req.WithContext(ctx)
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("with user: status = %d, want %d", w.Code, http.StatusOK)
	}
}

func TestRequireGuest(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := RequireGuest(inner)

	// No user → pass through
	req := httptest.NewRequest("GET", "/login", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("no user: status = %d, want %d", w.Code, http.StatusOK)
	}

	// With user → redirect
	user := &model.User{ID: 1}
	ctx := context.WithValue(req.Context(), userKey, user)
	req = req.WithContext(ctx)
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusFound {
		t.Errorf("with user: status = %d, want %d", w.Code, http.StatusFound)
	}
	if loc := w.Header().Get("Location"); loc != "/admin/dashboard" {
		t.Errorf("redirect Location = %q, want /admin/dashboard", loc)
	}
}

// mockStore implements just enough of model.Store for auth tests.
type mockStore struct {
	model.Store // embed to satisfy interface; unused methods will panic
	users       map[string]model.User
	sessions    map[string]model.Session
}

func (m *mockStore) GetUserByEmail(_ context.Context, email string) (model.User, error) {
	u, ok := m.users[email]
	if !ok {
		return model.User{}, context.DeadlineExceeded // any error
	}
	return u, nil
}

func (m *mockStore) GetUserByID(_ context.Context, id int64) (model.User, error) {
	for _, u := range m.users {
		if u.ID == id {
			return u, nil
		}
	}
	return model.User{}, context.DeadlineExceeded
}

func (m *mockStore) CreateSession(_ context.Context, arg model.CreateSessionParams) error {
	m.sessions[arg.Token] = model.Session(arg)
	return nil
}

func (m *mockStore) GetSession(_ context.Context, token string) (model.Session, error) {
	s, ok := m.sessions[token]
	if !ok {
		return model.Session{}, context.DeadlineExceeded
	}
	return s, nil
}

func (m *mockStore) DeleteSession(_ context.Context, token string) error {
	delete(m.sessions, token)
	return nil
}

func TestAuthenticate(t *testing.T) {
	hash, err := HashPassword("correct")
	if err != nil {
		t.Fatal(err)
	}
	store := &mockStore{
		users: map[string]model.User{
			"user@test.com": {ID: 1, Email: "user@test.com", Password: hash},
		},
	}

	// Correct credentials
	user, err := Authenticate(context.Background(), store, "user@test.com", "correct")
	if err != nil {
		t.Fatalf("Authenticate error: %v", err)
	}
	if user.ID != 1 {
		t.Errorf("user.ID = %d, want 1", user.ID)
	}

	// Wrong password
	_, err = Authenticate(context.Background(), store, "user@test.com", "wrong")
	if err == nil {
		t.Error("expected error for wrong password")
	}

	// Unknown email
	_, err = Authenticate(context.Background(), store, "unknown@test.com", "any")
	if err == nil {
		t.Error("expected error for unknown email")
	}
}

func TestMiddleware(t *testing.T) {
	hash, err := HashPassword("pass")
	if err != nil { t.Fatal(err) }
	store := &mockStore{
		users: map[string]model.User{
			"user@test.com": {ID: 42, Email: "user@test.com", Password: hash},
		},
		sessions: map[string]model.Session{
			"valid-token": {Token: "valid-token", UserID: 42, ExpiresAt: time.Now().Add(time.Hour)},
			"expired":     {Token: "expired", UserID: 42, ExpiresAt: time.Now().Add(-time.Hour)},
		},
	}

	var gotUser *model.User
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotUser = UserFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	mw := Middleware(store)(inner)

	// No cookie → no user
	req := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	gotUser = nil
	mw.ServeHTTP(w, req)
	if gotUser != nil {
		t.Error("no cookie: expected nil user")
	}

	// Valid session cookie → user set
	req = httptest.NewRequest("GET", "/", nil)
	req.AddCookie(&http.Cookie{Name: CookieName, Value: "valid-token"})
	w = httptest.NewRecorder()
	gotUser = nil
	mw.ServeHTTP(w, req)
	if gotUser == nil || gotUser.ID != 42 {
		t.Errorf("valid session: expected user ID 42, got %v", gotUser)
	}

	// Expired session → no user, session deleted
	req = httptest.NewRequest("GET", "/", nil)
	req.AddCookie(&http.Cookie{Name: CookieName, Value: "expired"})
	w = httptest.NewRecorder()
	gotUser = nil
	mw.ServeHTTP(w, req)
	if gotUser != nil {
		t.Error("expired session: expected nil user")
	}
	if _, ok := store.sessions["expired"]; ok {
		t.Error("expired session should be deleted from store")
	}

	// Invalid token → no user
	req = httptest.NewRequest("GET", "/", nil)
	req.AddCookie(&http.Cookie{Name: CookieName, Value: "nonexistent"})
	w = httptest.NewRecorder()
	gotUser = nil
	mw.ServeHTTP(w, req)
	if gotUser != nil {
		t.Error("invalid token: expected nil user")
	}
}
