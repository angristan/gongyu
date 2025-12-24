<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ConditionalSsr
{
    /**
     * Disable SSR for authenticated users.
     *
     * This allows public pages to benefit from SSR (SEO, faster initial load)
     * while authenticated users get client-side rendering (faster navigation).
     */
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()) {
            config(['inertia.ssr.enabled' => false]);
        }

        return $next($request);
    }
}
