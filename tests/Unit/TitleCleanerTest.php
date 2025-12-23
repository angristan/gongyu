<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Actions\Title\CleanTitle;
use PHPUnit\Framework\TestCase;

class TitleCleanerTest extends TestCase
{
    public function test_removes_pipe_separator(): void
    {
        $this->assertEquals(
            'Article Title',
            CleanTitle::run('Article Title | Website Name')
        );
    }

    public function test_removes_dash_separator(): void
    {
        $this->assertEquals(
            'Article Title',
            CleanTitle::run('Article Title - Website Name')
        );
    }

    public function test_removes_em_dash_separator(): void
    {
        $this->assertEquals(
            'Article Title',
            CleanTitle::run('Article Title — Website Name')
        );
    }

    public function test_removes_en_dash_separator(): void
    {
        $this->assertEquals(
            'Article Title',
            CleanTitle::run('Article Title – Website Name')
        );
    }

    public function test_removes_middle_dot_separator(): void
    {
        $this->assertEquals(
            'Article Title',
            CleanTitle::run('Article Title · Website Name')
        );
    }

    public function test_removes_known_suffix_youtube(): void
    {
        $this->assertEquals(
            'Video Title',
            CleanTitle::run('Video Title - YouTube')
        );
    }

    public function test_removes_known_suffix_github(): void
    {
        $this->assertEquals(
            'Repository Name',
            CleanTitle::run('Repository Name · GitHub')
        );
    }

    public function test_handles_empty_string(): void
    {
        $this->assertEquals('', CleanTitle::run(''));
    }

    public function test_handles_whitespace_only(): void
    {
        $this->assertEquals('', CleanTitle::run('   '));
    }

    public function test_returns_original_if_cleaning_would_result_in_empty(): void
    {
        $this->assertEquals('YouTube', CleanTitle::run('YouTube'));
    }

    public function test_preserves_title_without_separator(): void
    {
        $this->assertEquals(
            'Simple Article Title',
            CleanTitle::run('Simple Article Title')
        );
    }

    public function test_handles_multiple_separators(): void
    {
        // Should only remove the last segment
        $cleaned = CleanTitle::run('Part 1 - Part 2 | Website');
        $this->assertStringContainsString('Part 1', $cleaned);
    }
}
