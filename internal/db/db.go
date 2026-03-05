package db

import (
	"database/sql"
	"fmt"
	"strings"

	_ "github.com/jackc/pgx/v5/stdlib"
	_ "github.com/mattn/go-sqlite3"
)

type Driver string

const (
	DriverSQLite   Driver = "sqlite"
	DriverPostgres Driver = "postgres"
)

type Connection struct {
	DB     *sql.DB
	Driver Driver
}

func Open(databaseURL string) (Connection, error) {
	switch {
	case strings.HasPrefix(databaseURL, "sqlite://"):
		path := strings.TrimPrefix(databaseURL, "sqlite://")
		dsn := fmt.Sprintf("file:%s?_busy_timeout=5000&_foreign_keys=on", path)
		db, err := sql.Open("sqlite3", dsn)
		if err != nil {
			return Connection{}, err
		}
		if err := db.Ping(); err != nil {
			return Connection{}, err
		}
		return Connection{DB: db, Driver: DriverSQLite}, nil
	case strings.HasPrefix(databaseURL, "postgres://"), strings.HasPrefix(databaseURL, "postgresql://"):
		db, err := sql.Open("pgx", databaseURL)
		if err != nil {
			return Connection{}, err
		}
		if err := db.Ping(); err != nil {
			return Connection{}, err
		}
		return Connection{DB: db, Driver: DriverPostgres}, nil
	default:
		return Connection{}, fmt.Errorf("unsupported DATABASE_URL: %s", databaseURL)
	}
}
