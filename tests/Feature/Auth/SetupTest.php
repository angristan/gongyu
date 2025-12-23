<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SetupTest extends TestCase
{
    use RefreshDatabase;

    public function test_setup_page_is_accessible_when_no_user_exists(): void
    {
        $response = $this->get('/setup');

        $response->assertStatus(200);
    }

    public function test_setup_page_redirects_when_user_exists(): void
    {
        User::factory()->create();

        $response = $this->get('/setup');

        $response->assertRedirect('/');
    }

    public function test_admin_can_be_created_via_setup(): void
    {
        $response = $this->post('/setup', [
            'name' => 'Admin User',
            'email' => 'admin@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response->assertRedirect(route('admin.dashboard'));
        $this->assertDatabaseHas('users', [
            'email' => 'admin@example.com',
        ]);
        $this->assertAuthenticated();
    }

    public function test_setup_fails_with_invalid_data(): void
    {
        $response = $this->post('/setup', [
            'name' => '',
            'email' => 'invalid-email',
            'password' => 'short',
            'password_confirmation' => 'mismatch',
        ]);

        $response->assertSessionHasErrors(['name', 'email', 'password']);
    }

    public function test_setup_fails_when_user_already_exists(): void
    {
        User::factory()->create();

        $response = $this->post('/setup', [
            'name' => 'Admin User',
            'email' => 'admin@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response->assertRedirect('/');
    }
}
