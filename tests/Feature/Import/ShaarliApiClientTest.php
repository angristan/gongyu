<?php

declare(strict_types=1);

namespace Tests\Feature\Import;

use App\Actions\Import\ShaarliApiClient;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ShaarliApiClientTest extends TestCase
{
    public function test_fetches_bookmarks_from_api(): void
    {
        Http::fake([
            'https://links.example.com/api/v1/links*' => Http::response([
                [
                    'id' => 1,
                    'url' => 'https://example.com/1',
                    'shorturl' => 'abc123',
                    'title' => 'Example 1',
                    'description' => 'Description 1',
                    'tags' => ['tag1', 'tag2'],
                    'private' => false,
                    'created' => '2023-12-23T15:00:00+00:00',
                    'updated' => '2023-12-23T16:00:00+00:00',
                ],
                [
                    'id' => 2,
                    'url' => 'https://example.com/2',
                    'shorturl' => 'def456',
                    'title' => 'Example 2',
                    'description' => '',
                    'tags' => [],
                    'private' => false,
                    'created' => '2023-12-23T17:00:00+00:00',
                    'updated' => '',
                ],
            ], 200),
        ]);

        $result = ShaarliApiClient::run('https://links.example.com', 'test-api-secret-key');

        $this->assertCount(2, $result);

        $this->assertEquals('https://example.com/1', $result[0]['url']);
        $this->assertEquals('Example 1', $result[0]['title']);
        $this->assertEquals('Description 1', $result[0]['description']);
        $this->assertEquals('abc123', $result[0]['shaarli_short_url']);
        $this->assertEquals('2023-12-23T15:00:00+00:00', $result[0]['created_at']);

        $this->assertEquals('https://example.com/2', $result[1]['url']);
        $this->assertEquals('def456', $result[1]['shaarli_short_url']);
    }

    public function test_sends_jwt_authorization_header(): void
    {
        Http::fake([
            'https://links.example.com/api/v1/links*' => Http::response([], 200),
        ]);

        ShaarliApiClient::run('https://links.example.com', 'test-api-secret-key');

        Http::assertSent(function ($request) {
            $authHeader = $request->header('Authorization')[0] ?? '';

            // Should be Bearer JWT token
            $this->assertStringStartsWith('Bearer ', $authHeader);

            // JWT should have 3 parts
            $token = substr($authHeader, 7);
            $parts = explode('.', $token);
            $this->assertCount(3, $parts);

            // Decode and verify header
            $header = json_decode(base64_decode(strtr($parts[0], '-_', '+/')), true);
            $this->assertEquals('JWT', $header['typ']);
            $this->assertEquals('HS512', $header['alg']);

            // Decode and verify payload
            $payload = json_decode(base64_decode(strtr($parts[1], '-_', '+/')), true);
            $this->assertArrayHasKey('iat', $payload);
            $this->assertIsInt($payload['iat']);

            return true;
        });
    }

    public function test_throws_on_authentication_failure(): void
    {
        Http::fake([
            'https://links.example.com/api/v1/links*' => Http::response(['error' => 'Unauthorized'], 401),
        ]);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Authentication failed');

        ShaarliApiClient::run('https://links.example.com', 'wrong-secret');
    }

    public function test_throws_on_api_error(): void
    {
        Http::fake([
            'https://links.example.com/api/v1/links*' => Http::response(['error' => 'Server Error'], 500),
        ]);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('API request failed with status 500');

        ShaarliApiClient::run('https://links.example.com', 'test-api-secret-key');
    }

    public function test_normalizes_base_url_with_trailing_slash(): void
    {
        Http::fake([
            'https://links.example.com/api/v1/links*' => Http::response([], 200),
        ]);

        ShaarliApiClient::run('https://links.example.com/', 'test-api-secret-key');

        Http::assertSent(function ($request) {
            return str_contains($request->url(), 'links.example.com/api/v1/links');
        });
    }

    public function test_requests_all_bookmarks(): void
    {
        Http::fake([
            'https://links.example.com/api/v1/links*' => Http::response([], 200),
        ]);

        ShaarliApiClient::run('https://links.example.com', 'test-api-secret-key');

        Http::assertSent(function ($request) {
            return str_contains($request->url(), 'limit=all');
        });
    }

    public function test_skips_bookmarks_without_url(): void
    {
        Http::fake([
            'https://links.example.com/api/v1/links*' => Http::response([
                ['url' => 'https://example.com/valid', 'title' => 'Valid', 'shorturl' => 'abc'],
                ['url' => '', 'title' => 'Empty URL', 'shorturl' => 'def'],
                ['url' => null, 'title' => 'Null URL', 'shorturl' => 'ghi'],
                ['title' => 'Missing URL', 'shorturl' => 'jkl'],
            ], 200),
        ]);

        $result = ShaarliApiClient::run('https://links.example.com', 'test-api-secret-key');

        $this->assertCount(1, $result);
        $this->assertEquals('https://example.com/valid', $result[0]['url']);
    }
}
