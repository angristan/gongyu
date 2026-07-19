import { index, type RouteConfig, route } from '@react-router/dev/routes';

export default [
    index('routes/home.tsx'),
    route('search', 'routes/search.tsx'),
    route('b/:shortUrl', 'routes/bookmark-detail.tsx'),
    route('shaare/:hash', 'routes/shaarli-redirect.ts'),
    route('health', 'routes/health.ts'),
    route('theme', 'routes/theme.ts'),
    route('setup', 'routes/setup.tsx'),
    route('login', 'routes/login.tsx'),
    route('logout', 'routes/logout.ts'),
    route('passkey', 'routes/passkey.tsx'),
    route('storage', 'routes/storage.tsx'),
    route('admin/bookmarks', 'routes/admin-bookmarks.tsx'),
    route('admin/bookmarks/new', 'routes/admin-bookmark-new.tsx'),
    route('admin/bookmarks/:shortUrl/edit', 'routes/admin-bookmark-edit.tsx'),
    route('admin/security', 'routes/admin-security.tsx'),
    route(
        'api/passkey/registration/options',
        'routes/passkey-registration-options.ts',
    ),
    route(
        'api/passkey/registration/verify',
        'routes/passkey-registration-verify.ts',
    ),
    route(
        'api/passkey/authentication/options',
        'routes/passkey-authentication-options.ts',
    ),
    route(
        'api/passkey/authentication/verify',
        'routes/passkey-authentication-verify.ts',
    ),
    route('api/auth/recovery', 'routes/auth-recovery.ts'),
    route('api/phase0/uploads', 'routes/phase0-upload.ts'),
    route('api/phase0/workflows', 'routes/phase0-workflow.ts'),
] satisfies RouteConfig;
