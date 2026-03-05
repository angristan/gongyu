package repo

import (
	"database/sql"

	"gongyu/internal/db"
)

type Repositories struct {
	Users     *UserRepository
	Bookmarks *BookmarkRepository
	Settings  *SettingRepository
}

func New(dbConn db.Connection) Repositories {
	return Repositories{
		Users:     &UserRepository{db: dbConn.DB, driver: dbConn.Driver},
		Bookmarks: &BookmarkRepository{db: dbConn.DB, driver: dbConn.Driver},
		Settings:  &SettingRepository{db: dbConn.DB, driver: dbConn.Driver},
	}
}

func placeholder(driver db.Driver, idx int) string {
	if driver == db.DriverPostgres {
		return "$" + itoa(idx)
	}
	return "?"
}

func itoa(value int) string {
	if value == 0 {
		return "0"
	}
	if value < 0 {
		value = -value
	}
	var digits [20]byte
	pos := len(digits)
	for value > 0 {
		pos--
		digits[pos] = byte('0' + value%10)
		value /= 10
	}
	return string(digits[pos:])
}

type scanner interface {
	Scan(dest ...any) error
}

func nullString(value sql.NullString) string {
	if value.Valid {
		return value.String
	}
	return ""
}
