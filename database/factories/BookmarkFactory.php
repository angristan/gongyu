<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Bookmark;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Bookmark>
 */
class BookmarkFactory extends Factory
{
    protected $model = Bookmark::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'short_url' => Str::random(8),
            'url' => fake()->unique()->url(),
            'title' => fake()->sentence(4),
            'description' => fake()->optional()->paragraph(),
            'thumbnail_url' => fake()->optional()->imageUrl(),
            'shaarli_short_url' => null,
        ];
    }

    /**
     * Indicate that the bookmark was imported from Shaarli.
     */
    public function fromShaarli(?string $hash = null): static
    {
        return $this->state(fn (array $attributes) => [
            'shaarli_short_url' => $hash ?? Str::random(6),
        ]);
    }

    /**
     * Indicate that the bookmark has a thumbnail.
     */
    public function withThumbnail(): static
    {
        return $this->state(fn (array $attributes) => [
            'thumbnail_url' => fake()->imageUrl(),
        ]);
    }
}
