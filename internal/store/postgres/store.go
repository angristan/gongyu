package postgres

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"log"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/stanislas/gongyu/internal/db"
	"github.com/stanislas/gongyu/internal/store/postgres/pgdb"
)

// Store implements db.Store for PostgreSQL using sqlc-generated queries.
type Store struct {
	sqlDB *sql.DB
	q     *pgdb.Queries
}

// Open opens a PostgreSQL database, runs migrations, and returns a Store.
func Open(connStr string, migrationsFS embed.FS) (*Store, error) {
	sqlDB, err := sql.Open("pgx", connStr)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	if err := sqlDB.Ping(); err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	goose.SetBaseFS(migrationsFS)
	if err := goose.SetDialect("postgres"); err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("set dialect: %w", err)
	}
	if err := goose.Up(sqlDB, "migrations", goose.WithAllowMissing()); err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("run migrations: %w", err)
	}
	log.Println("database migrations applied")

	return &Store{sqlDB: sqlDB, q: pgdb.New(sqlDB)}, nil
}

func (s *Store) Close() error { return s.sqlDB.Close() }

// --- Bookmark conversions ---

func convertBookmark(b pgdb.Bookmark) db.Bookmark { return db.Bookmark(b) }

func convertBookmarks(bs []pgdb.Bookmark) []db.Bookmark {
	result := make([]db.Bookmark, len(bs))
	for i, b := range bs {
		result[i] = db.Bookmark(b)
	}
	return result
}

// --- Bookmarks (sqlc-delegated) ---

func (s *Store) AllBookmarks(ctx context.Context) ([]db.Bookmark, error) {
	bs, err := s.q.AllBookmarks(ctx)
	if err != nil {
		return nil, err
	}
	return convertBookmarks(bs), nil
}

func (s *Store) GetBookmarkByID(ctx context.Context, id int64) (db.Bookmark, error) {
	b, err := s.q.GetBookmarkByID(ctx, id)
	return convertBookmark(b), err
}

func (s *Store) GetBookmarkByShortURL(ctx context.Context, shortUrl string) (db.Bookmark, error) {
	b, err := s.q.GetBookmarkByShortURL(ctx, shortUrl)
	return convertBookmark(b), err
}

func (s *Store) GetBookmarkByURL(ctx context.Context, url string) (db.Bookmark, error) {
	b, err := s.q.GetBookmarkByURL(ctx, url)
	return convertBookmark(b), err
}

func (s *Store) GetBookmarkByShaarliHash(ctx context.Context, hash string) (db.Bookmark, error) {
	b, err := s.q.GetBookmarkByShaarliHash(ctx, hash)
	return convertBookmark(b), err
}

func (s *Store) ListBookmarks(ctx context.Context, limit, offset int64) ([]db.Bookmark, error) {
	bs, err := s.q.ListBookmarks(ctx, pgdb.ListBookmarksParams{
		Limit:  int32(limit),
		Offset: int32(offset),
	})
	if err != nil {
		return nil, err
	}
	return convertBookmarks(bs), nil
}

func (s *Store) RecentBookmarks(ctx context.Context, limit int64) ([]db.Bookmark, error) {
	bs, err := s.q.RecentBookmarks(ctx, int32(limit))
	if err != nil {
		return nil, err
	}
	return convertBookmarks(bs), nil
}

func (s *Store) CountBookmarks(ctx context.Context) (int64, error) {
	return s.q.CountBookmarks(ctx)
}

func (s *Store) CountBookmarksSince(ctx context.Context, since time.Time) (int64, error) {
	return s.q.CountBookmarksSince(ctx, since)
}

func (s *Store) ShortURLExists(ctx context.Context, shortUrl string) (bool, error) {
	return s.q.ShortURLExists(ctx, shortUrl)
}

func (s *Store) CreateBookmark(ctx context.Context, arg db.CreateBookmarkParams) (db.Bookmark, error) {
	b, err := s.q.CreateBookmark(ctx, pgdb.CreateBookmarkParams(arg))
	return convertBookmark(b), err
}

func (s *Store) UpdateBookmark(ctx context.Context, arg db.UpdateBookmarkParams) error {
	return s.q.UpdateBookmark(ctx, pgdb.UpdateBookmarkParams(arg))
}

func (s *Store) DeleteBookmark(ctx context.Context, id int64) error {
	return s.q.DeleteBookmark(ctx, id)
}

func (s *Store) DeleteAllBookmarks(ctx context.Context) (int64, error) {
	return s.q.DeleteAllBookmarks(ctx)
}

func (s *Store) BulkImportBookmarks(ctx context.Context, bookmarks []db.Bookmark) (imported, skipped int, err error) {
	tx, err := s.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback()

	qtx := s.q.WithTx(tx)
	for _, b := range bookmarks {
		rows, err := qtx.InsertBookmarkIgnore(ctx, pgdb.InsertBookmarkIgnoreParams{
			ShortUrl:        b.ShortUrl,
			Url:             b.Url,
			Title:           b.Title,
			Description:     b.Description,
			ThumbnailUrl:    b.ThumbnailUrl,
			ShaarliShortUrl: b.ShaarliShortUrl,
			CreatedAt:       b.CreatedAt,
			UpdatedAt:       b.UpdatedAt,
		})
		if err != nil {
			return 0, 0, err
		}
		if rows > 0 {
			imported++
		} else {
			skipped++
		}
	}

	return imported, skipped, tx.Commit()
}

func (s *Store) BookmarksOverTime(ctx context.Context, since time.Time) ([]db.BookmarksOverTimeRow, error) {
	rows, err := s.q.BookmarksOverTime(ctx, since)
	if err != nil {
		return nil, err
	}
	result := make([]db.BookmarksOverTimeRow, len(rows))
	for i, r := range rows {
		result[i] = db.BookmarksOverTimeRow{Date: r.Date, Count: int(r.Count)}
	}
	return result, nil
}

func (s *Store) TopDomains(ctx context.Context, since time.Time, limit int) ([]db.TopDomainsRow, error) {
	rows, err := s.q.TopDomains(ctx, pgdb.TopDomainsParams{
		CreatedAt: since,
		Limit:     int32(limit),
	})
	if err != nil {
		return nil, err
	}
	result := make([]db.TopDomainsRow, len(rows))
	for i, r := range rows {
		result[i] = db.TopDomainsRow{Domain: r.Domain, Count: int(r.Count)}
	}
	return result, nil
}

// --- Search (hand-written, uses FTS + ILIKE fallback) ---

const (
	bookmarkCols = `id, short_url, url, title, description, thumbnail_url, shaarli_short_url, created_at, updated_at`
	ftsExpr      = `to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(url, ''))`
)

func scanBookmarks(rows *sql.Rows) ([]db.Bookmark, error) {
	var bookmarks []db.Bookmark
	for rows.Next() {
		var b db.Bookmark
		if err := rows.Scan(&b.ID, &b.ShortUrl, &b.Url, &b.Title, &b.Description, &b.ThumbnailUrl, &b.ShaarliShortUrl, &b.CreatedAt, &b.UpdatedAt); err != nil {
			return nil, err
		}
		bookmarks = append(bookmarks, b)
	}
	if bookmarks == nil {
		bookmarks = []db.Bookmark{}
	}
	return bookmarks, rows.Err()
}

func (s *Store) SearchBookmarks(ctx context.Context, query string, page, perPage int) (*db.PaginatedBookmarks, error) {
	if query == "" {
		return s.paginateBookmarks(ctx, page, perPage)
	}

	tsQuery := buildTSQuery(query)
	if tsQuery == "" {
		return s.paginateBookmarks(ctx, page, perPage)
	}

	var total int
	err := s.sqlDB.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM bookmarks WHERE `+ftsExpr+` @@ to_tsquery('english', $1)`, tsQuery).Scan(&total)
	if err != nil {
		return s.searchILike(ctx, query, page, perPage)
	}

	p := pageBounds(total, page, perPage)

	rows, err := s.sqlDB.QueryContext(ctx,
		`SELECT `+bookmarkCols+` FROM bookmarks
		 WHERE `+ftsExpr+` @@ to_tsquery('english', $1)
		 ORDER BY ts_rank(`+ftsExpr+`, to_tsquery('english', $1)) DESC
		 LIMIT $2 OFFSET $3`, tsQuery, perPage, (p.page-1)*perPage)
	if err != nil {
		return s.searchILike(ctx, query, page, perPage)
	}
	defer rows.Close()

	bookmarks, err := scanBookmarks(rows)
	if err != nil {
		return nil, err
	}

	return &db.PaginatedBookmarks{
		Bookmarks: bookmarks, CurrentPage: p.page, LastPage: p.lastPage, PerPage: perPage, Total: total,
	}, nil
}

func (s *Store) paginateBookmarks(ctx context.Context, page, perPage int) (*db.PaginatedBookmarks, error) {
	total, err := s.CountBookmarks(ctx)
	if err != nil {
		return nil, err
	}
	p := pageBounds(int(total), page, perPage)
	bookmarks, err := s.ListBookmarks(ctx, int64(perPage), int64((p.page-1)*perPage))
	if err != nil {
		return nil, err
	}
	return &db.PaginatedBookmarks{
		Bookmarks: bookmarks, CurrentPage: p.page, LastPage: p.lastPage, PerPage: perPage, Total: int(total),
	}, nil
}

func (s *Store) searchILike(ctx context.Context, query string, page, perPage int) (*db.PaginatedBookmarks, error) {
	like := "%" + query + "%"

	var total int
	err := s.sqlDB.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM bookmarks WHERE title ILIKE $1 OR description ILIKE $2 OR url ILIKE $3`,
		like, like, like).Scan(&total)
	if err != nil {
		return nil, err
	}

	p := pageBounds(total, page, perPage)

	rows, err := s.sqlDB.QueryContext(ctx,
		`SELECT `+bookmarkCols+` FROM bookmarks
		 WHERE title ILIKE $1 OR description ILIKE $2 OR url ILIKE $3
		 ORDER BY created_at DESC LIMIT $4 OFFSET $5`,
		like, like, like, perPage, (p.page-1)*perPage)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	bookmarks, err := scanBookmarks(rows)
	if err != nil {
		return nil, err
	}

	return &db.PaginatedBookmarks{
		Bookmarks: bookmarks, CurrentPage: p.page, LastPage: p.lastPage, PerPage: perPage, Total: total,
	}, nil
}

func buildTSQuery(query string) string {
	query = strings.TrimSpace(query)
	if query == "" {
		return ""
	}
	replacer := strings.NewReplacer(
		"\"", "", "'", "", "*", "", "(", "", ")", "",
		":", "", "^", "", "-", "", "+", "", "&", "", "|", "", "!", "",
	)
	query = replacer.Replace(query)
	words := strings.Fields(query)
	if len(words) == 0 {
		return ""
	}
	var parts []string
	for _, w := range words {
		w = strings.TrimSpace(w)
		if w != "" {
			parts = append(parts, w+":*")
		}
	}
	return strings.Join(parts, " & ")
}

type pageInfo struct{ page, lastPage int }

func pageBounds(total, page, perPage int) pageInfo {
	lastPage := max((total+perPage-1)/perPage, 1)
	if page < 1 {
		page = 1
	}
	if page > lastPage {
		page = lastPage
	}
	return pageInfo{page, lastPage}
}

// --- Users (sqlc-delegated) ---

func (s *Store) CreateUser(ctx context.Context, arg db.CreateUserParams) (db.User, error) {
	u, err := s.q.CreateUser(ctx, pgdb.CreateUserParams(arg))
	return db.User(u), err
}

func (s *Store) GetUserByEmail(ctx context.Context, email string) (db.User, error) {
	u, err := s.q.GetUserByEmail(ctx, email)
	return db.User(u), err
}

func (s *Store) GetUserByID(ctx context.Context, id int64) (db.User, error) {
	u, err := s.q.GetUserByID(ctx, id)
	return db.User(u), err
}

func (s *Store) CountUsers(ctx context.Context) (int64, error) {
	return s.q.CountUsers(ctx)
}

// --- Settings (sqlc-delegated) ---

func (s *Store) GetSetting(ctx context.Context, key string) (db.Setting, error) {
	st, err := s.q.GetSetting(ctx, key)
	return db.Setting(st), err
}

func (s *Store) UpsertSetting(ctx context.Context, key, value string, encrypted int64) error {
	return s.q.UpsertSetting(ctx, pgdb.UpsertSettingParams{
		Key:       key,
		Value:     value,
		Encrypted: encrypted,
	})
}

// --- Sessions (sqlc-delegated) ---

func (s *Store) CreateSession(ctx context.Context, arg db.CreateSessionParams) error {
	return s.q.CreateSession(ctx, pgdb.CreateSessionParams(arg))
}

func (s *Store) GetSession(ctx context.Context, token string) (db.Session, error) {
	sess, err := s.q.GetSession(ctx, token)
	return db.Session(sess), err
}

func (s *Store) DeleteSession(ctx context.Context, token string) error {
	return s.q.DeleteSession(ctx, token)
}
