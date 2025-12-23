<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('bookmarks', function (Blueprint $table) {
            $table->id();
            $table->string('short_url', 8)->unique();
            $table->string('url', 2048)->unique();
            $table->string('title', 500);
            $table->text('description')->nullable();
            $table->string('thumbnail_url', 2048)->nullable();
            $table->string('shaarli_short_url', 10)->nullable()->index();
            $table->timestamps();

            $table->index('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bookmarks');
    }
};
