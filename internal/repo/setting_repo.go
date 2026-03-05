package repo

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"gongyu/internal/db"
	"gongyu/internal/model"
)

type SettingRepository struct {
	db     *sql.DB
	driver db.Driver
}

func (r *SettingRepository) Find(ctx context.Context, key string) (*model.Setting, error) {
	query := "SELECT key, value, encrypted, created_at, updated_at FROM settings WHERE key = " + placeholder(r.driver, 1)
	row := r.db.QueryRowContext(ctx, query, key)
	var setting model.Setting
	var value sql.NullString
	if err := row.Scan(&setting.Key, &value, &setting.Encrypted, &setting.CreatedAt, &setting.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	setting.Value = nullString(value)
	return &setting, nil
}

func (r *SettingRepository) Set(ctx context.Context, key string, value string, encrypted bool) error {
	now := time.Now().UTC()
	if r.driver == db.DriverPostgres {
		_, err := r.db.ExecContext(ctx, `
            INSERT INTO settings (key, value, encrypted, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (key)
            DO UPDATE SET value = EXCLUDED.value, encrypted = EXCLUDED.encrypted, updated_at = EXCLUDED.updated_at
        `, key, nullableString(value), encrypted, now, now)
		return err
	}

	_, err := r.db.ExecContext(ctx, `
        INSERT INTO settings (key, value, encrypted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, encrypted = excluded.encrypted, updated_at = excluded.updated_at
    `, key, nullableString(value), boolAsInt(encrypted), now, now)
	return err
}

func (r *SettingRepository) Keys(ctx context.Context, keys []string) (map[string]model.Setting, error) {
	if len(keys) == 0 {
		return map[string]model.Setting{}, nil
	}

	query := "SELECT key, value, encrypted, created_at, updated_at FROM settings WHERE key IN ("
	args := make([]any, 0, len(keys))
	for i, key := range keys {
		if i > 0 {
			query += ", "
		}
		query += placeholder(r.driver, i+1)
		args = append(args, key)
	}
	query += ")"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make(map[string]model.Setting, len(keys))
	for rows.Next() {
		var item model.Setting
		var value sql.NullString
		if err := rows.Scan(&item.Key, &value, &item.Encrypted, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		item.Value = nullString(value)
		items[item.Key] = item
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return items, nil
}

func boolAsInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}
