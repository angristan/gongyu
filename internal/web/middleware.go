package web

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"gongyu/internal/app"
	"gongyu/internal/service"
	"gongyu/internal/session"
)

type Middleware func(http.Handler) http.Handler

func chain(handler http.Handler, middlewares ...Middleware) http.Handler {
	for i := len(middlewares) - 1; i >= 0; i-- {
		handler = middlewares[i](handler)
	}
	return handler
}

func requestLogger(application *app.App) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			next.ServeHTTP(w, r)
			application.Logger.Info("http request", "method", r.Method, "path", r.URL.Path, "duration", time.Since(start))
		})
	}
}

func recoverer(application *app.App) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if recovered := recover(); recovered != nil {
					application.Logger.Error("panic recovered", "error", recovered)
					http.Error(w, "internal server error", http.StatusInternalServerError)
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

func sessionLoader(application *app.App) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			data, err := application.Sessions.Read(r)
			if err != nil {
				data = createAnonymousSession()
				_ = application.Sessions.Write(w, data, application.SecureCookies)
			}

			ctx := withSessionData(r.Context(), data)
			if data.UserID > 0 {
				user, err := application.Repos.Users.FindByID(ctx, data.UserID)
				if err == nil && user != nil {
					ctx = withCurrentUser(ctx, user)
				}
			}

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if currentUser(r.Context()) == nil {
			http.Redirect(w, r, "/login", http.StatusFound)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func requireGuest(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if currentUser(r.Context()) != nil {
			http.Redirect(w, r, "/", http.StatusFound)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func verifyCSRF(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}

		session := sessionDataFromContext(r.Context())
		if session.CSRFToken == "" {
			http.Error(w, "invalid csrf token", http.StatusForbidden)
			return
		}

		_ = r.ParseMultipartForm(10 << 20)
		provided := strings.TrimSpace(r.FormValue("_csrf"))
		if provided == "" {
			provided = strings.TrimSpace(r.Header.Get("X-CSRF-Token"))
		}
		if provided == "" || provided != session.CSRFToken {
			http.Error(w, "invalid csrf token", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func createAnonymousSession() session.Data {
	return session.Data{
		UserID:    0,
		CSRFToken: service.RandomToken(24),
	}
}

func methodOverride(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			_ = r.ParseForm()
			override := strings.ToUpper(strings.TrimSpace(r.FormValue("_method")))
			switch override {
			case http.MethodPatch, http.MethodDelete, http.MethodPut:
				r.Method = override
			}
		}
		next.ServeHTTP(w, r)
	})
}

func requireSetupOpen(application *app.App) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			count, err := application.Repos.Users.Count(r.Context())
			if err != nil {
				http.Error(w, "database error", http.StatusInternalServerError)
				return
			}
			if count > 0 {
				http.Redirect(w, r, "/", http.StatusFound)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func mustURL(path string) string {
	if path == "" {
		return "/"
	}
	if strings.HasPrefix(path, "/") {
		return path
	}
	return fmt.Sprintf("/%s", path)
}
