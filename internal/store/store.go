package store

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/XSAM/otelsql"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"

	"github.com/angristan/gongyu/internal/model"
	"github.com/angristan/gongyu/internal/store/postgres"
)

// Store implements model.Store for PostgreSQL using sqlc-generated queries.
type Store struct {
	sqlDB *sql.DB
	q     *postgres.Queries
}

// Open opens a PostgreSQL database, runs migrations, and returns a Store.
func Open(connStr string) (*Store, error) {
	sqlDB, err := otelsql.Open("pgx", connStr, otelsql.WithAttributes(semconv.DBSystemPostgreSQL))
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	closeOnErr := func(origErr error) error {
		if cerr := sqlDB.Close(); cerr != nil {
			return fmt.Errorf("%w (also failed to close db: %v)", origErr, cerr)
		}
		return origErr
	}

	if err := sqlDB.Ping(); err != nil {
		return nil, closeOnErr(fmt.Errorf("ping database: %w", err))
	}

	if _, err := otelsql.RegisterDBStatsMetrics(sqlDB, otelsql.WithAttributes(semconv.DBSystemPostgreSQL)); err != nil {
		slog.Warn("failed to register db stats metrics", "error", err)
	}

	goose.SetBaseFS(migrationsFS)
	if err := goose.SetDialect("postgres"); err != nil {
		return nil, closeOnErr(fmt.Errorf("set dialect: %w", err))
	}
	if err := goose.Up(sqlDB, "migrations", goose.WithAllowMissing()); err != nil {
		return nil, closeOnErr(fmt.Errorf("run migrations: %w", err))
	}
	slog.Info("database migrations applied")

	return &Store{sqlDB: sqlDB, q: postgres.New(sqlDB)}, nil
}

func (s *Store) Ping(ctx context.Context) error { return s.sqlDB.PingContext(ctx) }
func (s *Store) Close() error                   { return s.sqlDB.Close() }

// --- Bookmark conversions ---

func convertBookmark(b postgres.Bookmark) model.Bookmark { return model.Bookmark(b) }

func convertBookmarks(bs []postgres.Bookmark) []model.Bookmark {
	result := make([]model.Bookmark, len(bs))
	for i, b := range bs {
		result[i] = model.Bookmark(b)
	}
	return result
}

// --- Bookmarks (sqlc-delegated) ---

func (s *Store) AllBookmarks(ctx context.Context) ([]model.Bookmark, error) {
	bs, err := s.q.AllBookmarks(ctx)
	if err != nil {
		return nil, err
	}
	return convertBookmarks(bs), nil
}

func (s *Store) GetBookmarkByID(ctx context.Context, id int64) (model.Bookmark, error) {
	b, err := s.q.GetBookmarkByID(ctx, id)
	return convertBookmark(b), err
}

func (s *Store) GetBookmarkByShortURL(ctx context.Context, shortUrl string) (model.Bookmark, error) {
	b, err := s.q.GetBookmarkByShortURL(ctx, shortUrl)
	return convertBookmark(b), err
}

func (s *Store) GetBookmarkByURL(ctx context.Context, url string) (model.Bookmark, error) {
	b, err := s.q.GetBookmarkByURL(ctx, url)
	return convertBookmark(b), err
}

func (s *Store) GetBookmarkByShaarliHash(ctx context.Context, hash string) (model.Bookmark, error) {
	b, err := s.q.GetBookmarkByShaarliHash(ctx, hash)
	return convertBookmark(b), err
}

func (s *Store) ListBookmarks(ctx context.Context, limit, offset int64) ([]model.Bookmark, error) {
	bs, err := s.q.ListBookmarks(ctx, postgres.ListBookmarksParams{
		Limit:  int32(limit),
		Offset: int32(offset),
	})
	if err != nil {
		return nil, err
	}
	return convertBookmarks(bs), nil
}

func (s *Store) RecentBookmarks(ctx context.Context, limit int64) ([]model.Bookmark, error) {
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

func (s *Store) CreateBookmark(ctx context.Context, arg model.CreateBookmarkParams) (model.Bookmark, error) {
	b, err := s.q.CreateBookmark(ctx, postgres.CreateBookmarkParams(arg))
	return convertBookmark(b), err
}

func (s *Store) UpdateBookmark(ctx context.Context, arg model.UpdateBookmarkParams) error {
	return s.q.UpdateBookmark(ctx, postgres.UpdateBookmarkParams(arg))
}

func (s *Store) DeleteBookmark(ctx context.Context, id int64) error {
	return s.q.DeleteBookmark(ctx, id)
}

func (s *Store) DeleteAllBookmarks(ctx context.Context) (int64, error) {
	return s.q.DeleteAllBookmarks(ctx)
}

func (s *Store) BulkImportBookmarks(ctx context.Context, bookmarks []model.Bookmark) (imported, skipped int, err error) {
	tx, err := s.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, err
	}
	defer func() {
		if err := tx.Rollback(); err != nil && err != sql.ErrTxDone {
			slog.Error("failed to rollback transaction", "error", err)
		}
	}()

	qtx := s.q.WithTx(tx)
	for _, b := range bookmarks {
		rows, err := qtx.InsertBookmarkIgnore(ctx, postgres.InsertBookmarkIgnoreParams{
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

func (s *Store) BookmarksOverTime(ctx context.Context, since time.Time) ([]model.BookmarksOverTimeRow, error) {
	rows, err := s.q.BookmarksOverTime(ctx, since)
	if err != nil {
		return nil, err
	}
	result := make([]model.BookmarksOverTimeRow, len(rows))
	for i, r := range rows {
		result[i] = model.BookmarksOverTimeRow{Date: r.Date, Count: int(r.Count)}
	}
	return result, nil
}

func (s *Store) TopDomains(ctx context.Context, since time.Time, limit int) ([]model.TopDomainsRow, error) {
	rows, err := s.q.TopDomains(ctx, postgres.TopDomainsParams{
		CreatedAt: since,
		Limit:     int32(limit),
	})
	if err != nil {
		return nil, err
	}
	result := make([]model.TopDomainsRow, len(rows))
	for i, r := range rows {
		result[i] = model.TopDomainsRow{Domain: r.Domain, Count: int(r.Count)}
	}
	return result, nil
}

// --- Search (hand-written, uses FTS + ILIKE fallback) ---

const (
	bookmarkCols = `id, short_url, url, title, description, thumbnail_url, shaarli_short_url, created_at, updated_at`
	ftsExpr      = `to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(url, ''))`
)

func scanBookmarks(rows *sql.Rows) ([]model.Bookmark, error) {
	var bookmarks []model.Bookmark
	for rows.Next() {
		var b model.Bookmark
		if err := rows.Scan(&b.ID, &b.ShortUrl, &b.Url, &b.Title, &b.Description, &b.ThumbnailUrl, &b.ShaarliShortUrl, &b.CreatedAt, &b.UpdatedAt); err != nil {
			return nil, err
		}
		bookmarks = append(bookmarks, b)
	}
	if bookmarks == nil {
		bookmarks = []model.Bookmark{}
	}
	return bookmarks, rows.Err()
}

func (s *Store) SearchBookmarks(ctx context.Context, query string, page, perPage int) (*model.PaginatedBookmarks, error) {
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
	defer func() {
		if err := rows.Close(); err != nil {
			slog.Error("failed to close rows", "error", err)
		}
	}()

	bookmarks, err := scanBookmarks(rows)
	if err != nil {
		return nil, err
	}

	return &model.PaginatedBookmarks{
		Bookmarks: bookmarks, CurrentPage: p.page, LastPage: p.lastPage, PerPage: perPage, Total: total,
	}, nil
}

func (s *Store) paginateBookmarks(ctx context.Context, page, perPage int) (*model.PaginatedBookmarks, error) {
	total, err := s.CountBookmarks(ctx)
	if err != nil {
		return nil, err
	}
	p := pageBounds(int(total), page, perPage)
	bookmarks, err := s.ListBookmarks(ctx, int64(perPage), int64((p.page-1)*perPage))
	if err != nil {
		return nil, err
	}
	return &model.PaginatedBookmarks{
		Bookmarks: bookmarks, CurrentPage: p.page, LastPage: p.lastPage, PerPage: perPage, Total: int(total),
	}, nil
}

func (s *Store) searchILike(ctx context.Context, query string, page, perPage int) (*model.PaginatedBookmarks, error) {
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
	defer func() {
		if err := rows.Close(); err != nil {
			slog.Error("failed to close rows", "error", err)
		}
	}()

	bookmarks, err := scanBookmarks(rows)
	if err != nil {
		return nil, err
	}

	return &model.PaginatedBookmarks{
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

func (s *Store) CreateUser(ctx context.Context, arg model.CreateUserParams) (model.User, error) {
	u, err := s.q.CreateUser(ctx, postgres.CreateUserParams(arg))
	return model.User(u), err
}

func (s *Store) GetUserByEmail(ctx context.Context, email string) (model.User, error) {
	u, err := s.q.GetUserByEmail(ctx, email)
	return model.User(u), err
}

func (s *Store) GetUserByID(ctx context.Context, id int64) (model.User, error) {
	u, err := s.q.GetUserByID(ctx, id)
	return model.User(u), err
}

func (s *Store) CountUsers(ctx context.Context) (int64, error) {
	return s.q.CountUsers(ctx)
}

// --- Settings (sqlc-delegated) ---

func (s *Store) GetSetting(ctx context.Context, key string) (model.Setting, error) {
	st, err := s.q.GetSetting(ctx, key)
	return model.Setting(st), err
}

func (s *Store) UpsertSetting(ctx context.Context, key, value string, encrypted int64) error {
	return s.q.UpsertSetting(ctx, postgres.UpsertSettingParams{
		Key:       key,
		Value:     value,
		Encrypted: encrypted,
	})
}

// --- Sessions (sqlc-delegated) ---

func (s *Store) CreateSession(ctx context.Context, arg model.CreateSessionParams) error {
	return s.q.CreateSession(ctx, postgres.CreateSessionParams(arg))
}

func (s *Store) GetSession(ctx context.Context, token string) (model.Session, error) {
	sess, err := s.q.GetSession(ctx, token)
	return model.Session(sess), err
}

func (s *Store) DeleteSession(ctx context.Context, token string) error {
	return s.q.DeleteSession(ctx, token)
}
