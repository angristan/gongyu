package web

import (
	"context"

	"gongyu/internal/model"
	"gongyu/internal/session"
)

type contextKey string

const (
	userContextKey    contextKey = "current_user"
	sessionContextKey contextKey = "session_data"
)

func withCurrentUser(ctx context.Context, user *model.User) context.Context {
	return context.WithValue(ctx, userContextKey, user)
}

func currentUser(ctx context.Context) *model.User {
	if value := ctx.Value(userContextKey); value != nil {
		if user, ok := value.(*model.User); ok {
			return user
		}
	}
	return nil
}

func withSessionData(ctx context.Context, data session.Data) context.Context {
	return context.WithValue(ctx, sessionContextKey, data)
}

func sessionDataFromContext(ctx context.Context) session.Data {
	if value := ctx.Value(sessionContextKey); value != nil {
		if data, ok := value.(session.Data); ok {
			return data
		}
	}
	return session.Data{}
}
