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

    public function test_preserves_colons_in_title(): void
    {
        $this->assertEquals(
            'Kubernetes v1.35: New level of efficiency with in-place Pod restart',
            CleanTitle::run('Kubernetes v1.35: New level of efficiency with in-place Pod restart | Kubernetes')
        );
    }

    public function test_preserves_hyphenated_words(): void
    {
        $this->assertEquals(
            'Working with in-place updates',
            CleanTitle::run('Working with in-place updates | Blog')
        );
    }

    public function test_preserves_multiple_hyphenated_words(): void
    {
        $this->assertEquals(
            'A real-time, high-performance solution',
            CleanTitle::run('A real-time, high-performance solution - TechSite')
        );
    }

    public function test_removes_spaced_hyphen_separator(): void
    {
        $this->assertEquals(
            'Article Title',
            CleanTitle::run('Article Title - Site Name')
        );
    }

    public function test_does_not_remove_hyphen_without_spaces(): void
    {
        // "word-word" should not be treated as a separator
        $this->assertEquals(
            'Self-hosted application',
            CleanTitle::run('Self-hosted application')
        );
    }
}
