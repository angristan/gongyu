package repo

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	"gongyu/internal/db"
	"gongyu/internal/model"
)

type BookmarkRepository struct {
	db     *sql.DB
	driver db.Driver
}

func (r *BookmarkRepository) Create(ctx context.Context, bookmark model.Bookmark) (*model.Bookmark, error) {
	now := time.Now().UTC()
	if bookmark.CreatedAt.IsZero() {
		bookmark.CreatedAt = now
	}
	if bookmark.UpdatedAt.IsZero() {
		bookmark.UpdatedAt = now
	}

	if r.driver == db.DriverPostgres {
		query := `
            INSERT INTO bookmarks (short_url, url, title, description, thumbnail_url, shaarli_short_url, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, short_url, url, title, description, thumbnail_url, shaarli_short_url, created_at, updated_at`
		row := r.db.QueryRowContext(ctx, query,
			bookmark.ShortURL,
			bookmark.URL,
			bookmark.Title,
			nullOrNil(bookmark.Description),
			nullOrNil(bookmark.ThumbnailURL),
			nullOrNil(bookmark.ShaarliShortURL),
			bookmark.CreatedAt,
			bookmark.UpdatedAt,
		)
		return scanBookmark(row)
	}

	result, err := r.db.ExecContext(ctx, `
        INSERT INTO bookmarks (short_url, url, title, description, thumbnail_url, shaarli_short_url, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
		bookmark.ShortURL,
		bookmark.URL,
		bookmark.Title,
		nullOrNil(bookmark.Description),
		nullOrNil(bookmark.ThumbnailURL),
		nullOrNil(bookmark.ShaarliShortURL),
		bookmark.CreatedAt,
		bookmark.UpdatedAt,
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

func (r *BookmarkRepository) FindByID(ctx context.Context, id int64) (*model.Bookmark, error) {
	query := "SELECT id, short_url, url, title, description, thumbnail_url, shaarli_short_url, created_at, updated_at FROM bookmarks WHERE id = " + placeholder(r.driver, 1)
	row := r.db.QueryRowContext(ctx, query, id)
	bookmark, err := scanBookmark(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return bookmark, err
}

func (r *BookmarkRepository) FindByURL(ctx context.Context, urlValue string) (*model.Bookmark, error) {
	query := "SELECT id, short_url, url, title, description, thumbnail_url, shaarli_short_url, created_at, updated_at FROM bookmarks WHERE url = " + placeholder(r.driver, 1)
	row := r.db.QueryRowContext(ctx, query, urlValue)
	bookmark, err := scanBookmark(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return bookmark, err
}

func (r *BookmarkRepository) FindByShortURL(ctx context.Context, shortURL string) (*model.Bookmark, error) {
	query := "SELECT id, short_url, url, title, description, thumbnail_url, shaarli_short_url, created_at, updated_at FROM bookmarks WHERE short_url = " + placeholder(r.driver, 1)
	row := r.db.QueryRowContext(ctx, query, shortURL)
	bookmark, err := scanBookmark(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return bookmark, err
}

func (r *BookmarkRepository) FindByShaarliShortURL(ctx context.Context, hash string) (*model.Bookmark, error) {
	query := "SELECT id, short_url, url, title, description, thumbnail_url, shaarli_short_url, created_at, updated_at FROM bookmarks WHERE shaarli_short_url = " + placeholder(r.driver, 1)
	row := r.db.QueryRowContext(ctx, query, hash)
	bookmark, err := scanBookmark(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return bookmark, err
}

func (r *BookmarkRepository) Update(ctx context.Context, bookmark model.Bookmark) error {
	bookmark.UpdatedAt = time.Now().UTC()
	if r.driver == db.DriverPostgres {
		_, err := r.db.ExecContext(ctx, `
            UPDATE bookmarks
            SET url = $1, title = $2, description = $3, thumbnail_url = $4, updated_at = $5
            WHERE id = $6
        `,
			bookmark.URL,
			bookmark.Title,
			nullOrNil(bookmark.Description),
			nullOrNil(bookmark.ThumbnailURL),
			bookmark.UpdatedAt,
			bookmark.ID,
		)
		return err
	}

	_, err := r.db.ExecContext(ctx, `
        UPDATE bookmarks
        SET url = ?, title = ?, description = ?, thumbnail_url = ?, updated_at = ?
        WHERE id = ?
    `,
		bookmark.URL,
		bookmark.Title,
		nullOrNil(bookmark.Description),
		nullOrNil(bookmark.ThumbnailURL),
		bookmark.UpdatedAt,
		bookmark.ID,
	)
	return err
}

func (r *BookmarkRepository) Delete(ctx context.Context, id int64) error {
	query := "DELETE FROM bookmarks WHERE id = " + placeholder(r.driver, 1)
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

func (r *BookmarkRepository) DeleteAll(ctx context.Context) (int64, error) {
	result, err := r.db.ExecContext(ctx, "DELETE FROM bookmarks")
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func (r *BookmarkRepository) TotalCount(ctx context.Context) (int64, error) {
	var count int64
	err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM bookmarks").Scan(&count)
	return count, err
}

func (r *BookmarkRepository) URLExists(ctx context.Context, urlValue string, exceptID int64) (bool, error) {
	query := "SELECT COUNT(*) FROM bookmarks WHERE url = " + placeholder(r.driver, 1)
	args := []any{urlValue}
	if exceptID > 0 {
		query += " AND id <> " + placeholder(r.driver, 2)
		args = append(args, exceptID)
	}
	var count int64
	err := r.db.QueryRowContext(ctx, query, args...).Scan(&count)
	return count > 0, err
}

func (r *BookmarkRepository) List(ctx context.Context, searchTerm string, page, perPage int) (model.BookmarkPage, error) {
	if page < 1 {
		page = 1
	}
	if perPage <= 0 {
		perPage = 20
	}
	offset := (page - 1) * perPage

	whereClause, args, orderBy := r.buildSearchClause(searchTerm)
	countQuery := "SELECT COUNT(*) FROM bookmarks " + whereClause

	var total int64
	if err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return model.BookmarkPage{}, err
	}

	itemsQuery := "SELECT id, short_url, url, title, description, thumbnail_url, shaarli_short_url, created_at, updated_at FROM bookmarks " + whereClause + " " + orderBy + " LIMIT " + placeholder(r.driver, len(args)+1) + " OFFSET " + placeholder(r.driver, len(args)+2)
	args = append(args, perPage, offset)
	rows, err := r.db.QueryContext(ctx, itemsQuery, args...)
	if err != nil {
		return model.BookmarkPage{}, err
	}
	defer rows.Close()

	items := make([]model.Bookmark, 0, perPage)
	for rows.Next() {
		bookmark, err := scanBookmark(rows)
		if err != nil {
			return model.BookmarkPage{}, err
		}
		items = append(items, *bookmark)
	}
	if err := rows.Err(); err != nil {
		return model.BookmarkPage{}, err
	}

	totalPages := int((total + int64(perPage) - 1) / int64(perPage))
	return model.BookmarkPage{
		Items:      items,
		Page:       page,
		PerPage:    perPage,
		Total:      total,
		TotalPages: totalPages,
		Search:     searchTerm,
	}, nil
}

func (r *BookmarkRepository) Latest(ctx context.Context, limit int) ([]model.Bookmark, error) {
	if limit <= 0 {
		limit = 50
	}
	query := "SELECT id, short_url, url, title, description, thumbnail_url, shaarli_short_url, created_at, updated_at FROM bookmarks ORDER BY created_at DESC LIMIT " + placeholder(r.driver, 1)
	rows, err := r.db.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]model.Bookmark, 0, limit)
	for rows.Next() {
		item, err := scanBookmark(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *item)
	}
	return items, rows.Err()
}

func (r *BookmarkRepository) MaxUpdatedAt(ctx context.Context) (time.Time, error) {
	var updatedAt sql.NullTime
	err := r.db.QueryRowContext(ctx, "SELECT MAX(updated_at) FROM bookmarks").Scan(&updatedAt)
	if err != nil {
		return time.Time{}, err
	}
	if !updatedAt.Valid {
		return time.Now().UTC(), nil
	}
	return updatedAt.Time, nil
}

func (r *BookmarkRepository) DashboardStats(ctx context.Context, period string) (model.BookmarkStats, error) {
	end := time.Now().UTC().Truncate(24 * time.Hour).Add(24*time.Hour - time.Nanosecond)
	start := computePeriodStart(period, end)

	total, err := r.TotalCount(ctx)
	if err != nil {
		return model.BookmarkStats{}, err
	}

	var monthCount int64
	monthStart := time.Date(end.Year(), end.Month(), 1, 0, 0, 0, 0, time.UTC)
	if err := r.countSince(ctx, monthStart, &monthCount); err != nil {
		return model.BookmarkStats{}, err
	}

	weekday := int(end.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	weekStart := time.Date(end.Year(), end.Month(), end.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, -(weekday - 1))
	var weekCount int64
	if err := r.countSince(ctx, weekStart, &weekCount); err != nil {
		return model.BookmarkStats{}, err
	}

	recent, err := r.Latest(ctx, 10)
	if err != nil {
		return model.BookmarkStats{}, err
	}

	overTime, err := r.bookmarksOverTime(ctx, start, end)
	if err != nil {
		return model.BookmarkStats{}, err
	}

	byDomain, err := r.bookmarksByDomain(ctx, start, end, 10)
	if err != nil {
		return model.BookmarkStats{}, err
	}

	return model.BookmarkStats{
		TotalBookmarks:     total,
		BookmarksThisMonth: monthCount,
		BookmarksThisWeek:  weekCount,
		RecentBookmarks:    recent,
		BookmarksOverTime:  overTime,
		BookmarksByDomain:  byDomain,
	}, nil
}

func (r *BookmarkRepository) countSince(ctx context.Context, from time.Time, destination *int64) error {
	query := "SELECT COUNT(*) FROM bookmarks WHERE created_at >= " + placeholder(r.driver, 1)
	return r.db.QueryRowContext(ctx, query, from).Scan(destination)
}

func (r *BookmarkRepository) bookmarksOverTime(ctx context.Context, start, end time.Time) ([]model.TimeBucket, error) {
	rows, err := r.db.QueryContext(ctx,
		"SELECT created_at FROM bookmarks WHERE created_at BETWEEN "+placeholder(r.driver, 1)+" AND "+placeholder(r.driver, 2),
		start,
		end,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := map[string]int64{}
	for rows.Next() {
		var createdAt time.Time
		if err := rows.Scan(&createdAt); err != nil {
			return nil, err
		}
		key := createdAt.UTC().Format("2006-01-02")
		counts[key]++
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	format := "Jan 02"
	if start.Year() != end.Year() {
		format = "Jan 02, 2006"
	}

	items := make([]model.TimeBucket, 0)
	for day := start.UTC(); !day.After(end.UTC()); day = day.AddDate(0, 0, 1) {
		key := day.Format("2006-01-02")
		items = append(items, model.TimeBucket{
			Date:  day.Format(format),
			Count: counts[key],
		})
	}

	return items, nil
}

func (r *BookmarkRepository) bookmarksByDomain(ctx context.Context, start, end time.Time, limit int) ([]model.DomainCount, error) {
	if limit <= 0 {
		limit = 10
	}
	rows, err := r.db.QueryContext(ctx,
		"SELECT url FROM bookmarks WHERE created_at BETWEEN "+placeholder(r.driver, 1)+" AND "+placeholder(r.driver, 2),
		start,
		end,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := map[string]int64{}
	for rows.Next() {
		var rawURL string
		if err := rows.Scan(&rawURL); err != nil {
			return nil, err
		}
		parsed, err := url.Parse(rawURL)
		if err != nil || parsed.Host == "" {
			continue
		}
		host := strings.ToLower(strings.TrimPrefix(parsed.Hostname(), "www."))
		counts[host]++
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	items := make([]model.DomainCount, 0, len(counts))
	for domain, count := range counts {
		items = append(items, model.DomainCount{Domain: domain, Count: count})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Count > items[j].Count })
	if len(items) > limit {
		items = items[:limit]
	}
	return items, nil
}

func (r *BookmarkRepository) buildSearchClause(searchTerm string) (string, []any, string) {
	searchTerm = strings.TrimSpace(searchTerm)
	if searchTerm == "" {
		return "", nil, "ORDER BY created_at DESC"
	}

	if r.driver == db.DriverPostgres {
		tsQuery := buildTsQuery(searchTerm)
		if tsQuery == "" {
			like := "%" + searchTerm + "%"
			return "WHERE title ILIKE " + placeholder(r.driver, 1) + " OR description ILIKE " + placeholder(r.driver, 2) + " OR url ILIKE " + placeholder(r.driver, 3), []any{like, like, like}, "ORDER BY created_at DESC"
		}
		where := "WHERE search_vector @@ to_tsquery('english', " + placeholder(r.driver, 1) + ")"
		order := "ORDER BY ts_rank(search_vector, to_tsquery('english', " + placeholder(r.driver, 2) + ")) DESC, created_at DESC"
		return where, []any{tsQuery, tsQuery}, order
	}

	if r.sqliteFTSExists() {
		fts := buildFtsQuery(searchTerm)
		where := "WHERE id IN (SELECT rowid FROM bookmarks_fts WHERE bookmarks_fts MATCH " + placeholder(r.driver, 1) + ")"
		order := "ORDER BY (SELECT rank FROM bookmarks_fts WHERE bookmarks_fts.rowid = bookmarks.id AND bookmarks_fts MATCH " + placeholder(r.driver, 2) + ") ASC, created_at DESC"
		return where, []any{fts, fts}, order
	}

	like := "%" + searchTerm + "%"
	where := "WHERE title LIKE " + placeholder(r.driver, 1) + " OR description LIKE " + placeholder(r.driver, 2) + " OR url LIKE " + placeholder(r.driver, 3)
	return where, []any{like, like, like}, "ORDER BY created_at DESC"
}

func (r *BookmarkRepository) sqliteFTSExists() bool {
	if r.driver != db.DriverSQLite {
		return false
	}
	var name string
	err := r.db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='bookmarks_fts'").Scan(&name)
	return err == nil && name == "bookmarks_fts"
}

var sanitizeTSRegex = regexp.MustCompile(`[^a-zA-Z0-9]`)

func buildTsQuery(searchTerm string) string {
	parts := strings.Fields(searchTerm)
	clean := make([]string, 0, len(parts))
	for _, word := range parts {
		word = sanitizeTSRegex.ReplaceAllString(word, "")
		if word != "" {
			clean = append(clean, word+":*")
		}
	}
	return strings.Join(clean, " & ")
}

func buildFtsQuery(searchTerm string) string {
	parts := strings.Fields(searchTerm)
	if len(parts) == 0 {
		return `""`
	}
	result := make([]string, 0, len(parts))
	for _, word := range parts {
		clean := sanitizeTSRegex.ReplaceAllString(strings.ReplaceAll(word, `"`, `""`), "")
		if clean != "" {
			result = append(result, `"`+clean+`"*`)
		}
	}
	if len(result) == 0 {
		return `""`
	}
	return strings.Join(result, " AND ")
}

func computePeriodStart(period string, end time.Time) time.Time {
	dayEnd := time.Date(end.Year(), end.Month(), end.Day(), 23, 59, 59, 0, time.UTC)
	switch period {
	case "7d":
		return dayEnd.AddDate(0, 0, -7)
	case "30d":
		return dayEnd.AddDate(0, 0, -30)
	case "90d":
		return dayEnd.AddDate(0, 0, -90)
	case "1y":
		return dayEnd.AddDate(-1, 0, 0)
	default:
		return dayEnd.AddDate(0, 0, -30)
	}
}

func nullOrNil(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func scanBookmark(row scanner) (*model.Bookmark, error) {
	var item model.Bookmark
	var description sql.NullString
	var thumbnail sql.NullString
	var shaarli sql.NullString
	if err := row.Scan(
		&item.ID,
		&item.ShortURL,
		&item.URL,
		&item.Title,
		&description,
		&thumbnail,
		&shaarli,
		&item.CreatedAt,
		&item.UpdatedAt,
	); err != nil {
		return nil, err
	}
	item.Description = nullString(description)
	item.ThumbnailURL = nullString(thumbnail)
	item.ShaarliShortURL = nullString(shaarli)
	return &item, nil
}

func (r *BookmarkRepository) BulkImport(ctx context.Context, bookmarks []model.Bookmark) (int, int, []string, error) {
	imported := 0
	skipped := 0
	errorsList := make([]string, 0)

	seen := map[string]bool{}
	for _, item := range bookmarks {
		if strings.TrimSpace(item.URL) == "" {
			errorsList = append(errorsList, fmt.Sprintf("bookmark missing URL: %s", item.Title))
			continue
		}
		if seen[item.URL] {
			skipped++
			continue
		}
		seen[item.URL] = true

		existing, err := r.FindByURL(ctx, item.URL)
		if err != nil {
			return imported, skipped, errorsList, err
		}
		if existing != nil {
			skipped++
			continue
		}

		if item.ShortURL == "" {
			item.ShortURL = GenerateShortURL()
		}

		if item.Title == "" {
			item.Title = item.URL
		}

		if item.CreatedAt.IsZero() {
			item.CreatedAt = time.Now().UTC()
		}
		if item.UpdatedAt.IsZero() {
			item.UpdatedAt = item.CreatedAt
		}

		if _, err := r.Create(ctx, item); err != nil {
			skipped++
			errorsList = append(errorsList, err.Error())
			continue
		}
		imported++
	}

	return imported, skipped, errorsList, nil
}
