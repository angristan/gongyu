package db

import (
	"time"
)

type Bookmark struct {
	ID              int64     `json:"id"`
	ShortUrl        string    `json:"short_url"`
	Url             string    `json:"url"`
	Title           string    `json:"title"`
	Description     string    `json:"description"`
	ThumbnailUrl    string    `json:"thumbnail_url"`
	ShaarliShortUrl string    `json:"shaarli_short_url"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type Session struct {
	Token     string    `json:"token"`
	UserID    int64     `json:"user_id"`
	ExpiresAt time.Time `json:"expires_at"`
}

type Setting struct {
	Key       string `json:"key"`
	Value     string `json:"value"`
	Encrypted int64  `json:"encrypted"`
}

type User struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Password  string    `json:"password"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
