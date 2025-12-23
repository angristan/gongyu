<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $driver = DB::connection()->getDriverName();

        if ($driver === 'pgsql') {
            // Add tsvector column for PostgreSQL full-text search
            DB::statement('ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS search_vector tsvector');
            DB::statement('CREATE INDEX IF NOT EXISTS bookmarks_search_vector_idx ON bookmarks USING GIN(search_vector)');

            // Create trigger function to auto-update search_vector
            DB::statement("
                CREATE OR REPLACE FUNCTION bookmarks_search_vector_update() RETURNS trigger AS $$
                BEGIN
                    NEW.search_vector := to_tsvector('english', coalesce(NEW.title, '') || ' ' || coalesce(NEW.description, '') || ' ' || coalesce(NEW.url, ''));
                    RETURN NEW;
                END
                $$ LANGUAGE plpgsql;
            ");

            // Create trigger
            DB::statement('DROP TRIGGER IF EXISTS bookmarks_search_vector_trigger ON bookmarks');
            DB::statement('
                CREATE TRIGGER bookmarks_search_vector_trigger
                BEFORE INSERT OR UPDATE ON bookmarks
                FOR EACH ROW EXECUTE FUNCTION bookmarks_search_vector_update()
            ');

            // Update existing rows
            DB::statement("
                UPDATE bookmarks
                SET search_vector = to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(url, ''))
            ");
        }

        if ($driver === 'sqlite') {
            // Create FTS5 virtual table for SQLite full-text search
            DB::statement('CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(title, description, url, content=bookmarks, content_rowid=id)');

            // Populate the FTS table with existing data
            DB::statement('INSERT INTO bookmarks_fts(rowid, title, description, url) SELECT id, title, description, url FROM bookmarks');
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $driver = DB::connection()->getDriverName();

        if ($driver === 'pgsql') {
            DB::statement('DROP TRIGGER IF EXISTS bookmarks_search_vector_trigger ON bookmarks');
            DB::statement('DROP FUNCTION IF EXISTS bookmarks_search_vector_update()');
            DB::statement('DROP INDEX IF EXISTS bookmarks_search_vector_idx');
            DB::statement('ALTER TABLE bookmarks DROP COLUMN IF EXISTS search_vector');
        }

        if ($driver === 'sqlite') {
            DB::statement('DROP TABLE IF EXISTS bookmarks_fts');
        }
    }
};
