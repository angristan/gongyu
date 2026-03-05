package db

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

func Migrate(ctx context.Context, conn Connection) error {
	if err := ensureMigrationsTable(ctx, conn.DB); err != nil {
		return err
	}

	entries, err := migrationFiles.ReadDir("migrations")
	if err != nil {
		return err
	}

	targetSuffix := ".sqlite.sql"
	if conn.Driver == DriverPostgres {
		targetSuffix = ".postgres.sql"
	}

	filenames := make([]string, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		if strings.HasSuffix(name, targetSuffix) {
			filenames = append(filenames, name)
		}
	}
	sort.Strings(filenames)

	for _, name := range filenames {
		version := strings.TrimSuffix(name, filepath.Ext(name))
		version = strings.TrimSuffix(version, filepath.Ext(version))

		applied, err := isMigrationApplied(ctx, conn.DB, version)
		if err != nil {
			return err
		}
		if applied {
			continue
		}

		content, err := migrationFiles.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}

		tx, err := conn.DB.BeginTx(ctx, nil)
		if err != nil {
			return err
		}

		if err := runMigrationStatements(ctx, tx, conn.Driver, string(content)); err != nil {
			tx.Rollback()
			return fmt.Errorf("apply migration %s: %w", name, err)
		}
		var insertQuery string
		if conn.Driver == DriverPostgres {
			insertQuery = "INSERT INTO schema_migrations (version) VALUES ($1)"
		} else {
			insertQuery = "INSERT INTO schema_migrations (version) VALUES (?)"
		}
		if _, err := tx.ExecContext(ctx, insertQuery, version); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}

	return nil
}

func runMigrationStatements(ctx context.Context, tx *sql.Tx, driver Driver, content string) error {
	if driver != DriverSQLite {
		_, err := tx.ExecContext(ctx, content)
		return err
	}

	statements := strings.Split(content, ";")
	for _, raw := range statements {
		statement := strings.TrimSpace(raw)
		if statement == "" {
			continue
		}
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			message := strings.ToLower(err.Error())
			if strings.Contains(message, "no such module: fts5") || strings.Contains(message, "no such table: main.bookmarks_fts") {
				continue
			}
			return err
		}
	}

	return nil
}

func ensureMigrationsTable(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, `
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version VARCHAR(255) PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`)
	if err == nil {
		return nil
	}

	_, err = db.ExecContext(ctx, `
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`)
	return err
}

func isMigrationApplied(ctx context.Context, db *sql.DB, version string) (bool, error) {
	var value string
	if err := db.QueryRowContext(ctx, "SELECT version FROM schema_migrations WHERE version = $1", version).Scan(&value); err == nil {
		return true, nil
	} else if err != sql.ErrNoRows {
		if err := db.QueryRowContext(ctx, "SELECT version FROM schema_migrations WHERE version = ?", version).Scan(&value); err == nil {
			return true, nil
		} else if err != sql.ErrNoRows {
			return false, err
		}
	}

	return false, nil
}
