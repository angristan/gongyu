package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/angristan/gongyu/internal/model"
	"golang.org/x/crypto/bcrypt"
)

type contextKey string

const userKey contextKey = "user"

const (
	cookieName    = "gongyu_session"
	sessionMaxAge = 30 * 24 * time.Hour
)

func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(hash), err
}

func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func Login(w http.ResponseWriter, r *http.Request, store model.Store, user *model.User, remember bool) error {
	token, err := generateToken()
	if err != nil {
		return err
	}
	maxAge := sessionMaxAge
	if !remember {
		maxAge = 24 * time.Hour
	}
	err = store.CreateSession(r.Context(), model.CreateSessionParams{
		Token:     token,
		UserID:    user.ID,
		ExpiresAt: time.Now().Add(maxAge),
	})
	if err != nil {
		return err
	}

	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil,
		MaxAge:   int(maxAge.Seconds()),
	})
	return nil
}

func Logout(w http.ResponseWriter, r *http.Request, store model.Store) {
	cookie, err := r.Cookie(cookieName)
	if err == nil {
		if err := store.DeleteSession(r.Context(), cookie.Value); err != nil {
			log.Printf("failed to delete session: %v", err)
		}
	}
	http.SetCookie(w, &http.Cookie{
		Name: cookieName, Value: "", Path: "/", HttpOnly: true, MaxAge: -1,
	})
}

func UserFromContext(ctx context.Context) *model.User {
	u, _ := ctx.Value(userKey).(*model.User)
	return u
}

func Middleware(store model.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(cookieName)
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}

			session, err := store.GetSession(r.Context(), cookie.Value)
			if err != nil || time.Now().After(session.ExpiresAt) {
				if err == nil {
					if delErr := store.DeleteSession(r.Context(), cookie.Value); delErr != nil {
						log.Printf("failed to delete expired session: %v", delErr)
					}
				}
				next.ServeHTTP(w, r)
				return
			}

			user, err := store.GetUserByID(r.Context(), session.UserID)
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}

			ctx := context.WithValue(r.Context(), userKey, &user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if UserFromContext(r.Context()) == nil {
			http.Redirect(w, r, "/login", http.StatusFound)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func RequireGuest(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if UserFromContext(r.Context()) != nil {
			http.Redirect(w, r, "/admin/dashboard", http.StatusFound)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func Authenticate(ctx context.Context, store model.Store, email, password string) (*model.User, error) {
	user, err := store.GetUserByEmail(ctx, email)
	if err != nil {
		return nil, errors.New("invalid credentials")
	}
	if !CheckPassword(user.Password, password) {
		return nil, errors.New("invalid credentials")
	}
	return &user, nil
}
