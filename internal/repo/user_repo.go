package repo

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"gongyu/internal/db"
	"gongyu/internal/model"
)

type UserRepository struct {
	db     *sql.DB
	driver db.Driver
}

func (r *UserRepository) Count(ctx context.Context) (int64, error) {
	var count int64
	err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&count)
	return count, err
}

func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*model.User, error) {
	query := "SELECT id, name, email, password_hash, created_at, updated_at FROM users WHERE email = " + placeholder(r.driver, 1)
	return r.scanOne(ctx, query, email)
}

func (r *UserRepository) FindByID(ctx context.Context, id int64) (*model.User, error) {
	query := "SELECT id, name, email, password_hash, created_at, updated_at FROM users WHERE id = " + placeholder(r.driver, 1)
	return r.scanOne(ctx, query, id)
}

func (r *UserRepository) Create(ctx context.Context, name, email, passwordHash string) (*model.User, error) {
	now := time.Now().UTC()
	if r.driver == db.DriverPostgres {
		query := "INSERT INTO users (name, email, password_hash, created_at, updated_at) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, password_hash, created_at, updated_at"
		row := r.db.QueryRowContext(ctx, query, name, email, passwordHash, now, now)
		return scanUser(row)
	}

	result, err := r.db.ExecContext(ctx,
		"INSERT INTO users (name, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		name, email, passwordHash, now, now,
	)
	if err != nil {
		return nil, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}
	return r.FindByID(ctx, id)
}

func (r *UserRepository) scanOne(ctx context.Context, query string, arg any) (*model.User, error) {
	row := r.db.QueryRowContext(ctx, query, arg)
	user, err := scanUser(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return user, err
}

func scanUser(row scanner) (*model.User, error) {
	var user model.User
	err := row.Scan(
		&user.ID,
		&user.Name,
		&user.Email,
		&user.PasswordHash,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &user, nil
}
