<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Add triggers to keep SQLite FTS5 external content table in sync.
     * This follows the recommended pattern from SQLite FTS5 documentation.
     */
    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'sqlite') {
            return;
        }

        // Trigger for INSERT - add new row to FTS index
        DB::statement('
            CREATE TRIGGER IF NOT EXISTS bookmarks_fts_after_insert AFTER INSERT ON bookmarks BEGIN
                INSERT INTO bookmarks_fts(rowid, title, description, url)
                VALUES (new.id, new.title, new.description, new.url);
            END
        ');

        // Trigger for DELETE - remove row from FTS index
        // FTS5 requires special delete syntax with the table name as first column
        DB::statement("
            CREATE TRIGGER IF NOT EXISTS bookmarks_fts_after_delete AFTER DELETE ON bookmarks BEGIN
                INSERT INTO bookmarks_fts(bookmarks_fts, rowid, title, description, url)
                VALUES ('delete', old.id, old.title, old.description, old.url);
            END
        ");

        // Trigger for UPDATE - remove old entry and add new entry
        DB::statement("
            CREATE TRIGGER IF NOT EXISTS bookmarks_fts_after_update AFTER UPDATE ON bookmarks BEGIN
                INSERT INTO bookmarks_fts(bookmarks_fts, rowid, title, description, url)
                VALUES ('delete', old.id, old.title, old.description, old.url);
                INSERT INTO bookmarks_fts(rowid, title, description, url)
                VALUES (new.id, new.title, new.description, new.url);
            END
        ");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'sqlite') {
            return;
        }

        DB::statement('DROP TRIGGER IF EXISTS bookmarks_fts_after_insert');
        DB::statement('DROP TRIGGER IF EXISTS bookmarks_fts_after_delete');
        DB::statement('DROP TRIGGER IF EXISTS bookmarks_fts_after_update');
    }
};
