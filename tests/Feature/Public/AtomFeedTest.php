<?php

declare(strict_types=1);

namespace Tests\Feature\Public;

use App\Models\Bookmark;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AtomFeedTest extends TestCase
{
    use RefreshDatabase;

    public function test_atom_feed_is_accessible(): void
    {
        $response = $this->get('/feed');

        $response->assertStatus(200);
        $response->assertHeader('Content-Type', 'application/atom+xml; charset=UTF-8');
    }

    public function test_atom_feed_contains_bookmarks(): void
    {
        $bookmark = Bookmark::factory()->create([
            'title' => 'Test Bookmark Title',
            'url' => 'https://example.com/test',
        ]);

        $response = $this->get('/feed');

        $response->assertStatus(200);
        $response->assertSee('Test Bookmark Title');
        $response->assertSee('https://example.com/test');
    }

    public function test_atom_feed_is_valid_xml(): void
    {
        Bookmark::factory()->count(5)->create();

        $response = $this->get('/feed');

        $xml = simplexml_load_string($response->content());
        $this->assertNotFalse($xml);
        $this->assertEquals('feed', $xml->getName());
    }
}
