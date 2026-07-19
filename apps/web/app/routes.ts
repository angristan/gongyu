import { index, type RouteConfig, route } from '@react-router/dev/routes';

export default [
    index('routes/home.tsx'),
    route('theme', 'routes/theme.ts'),
    route('passkey', 'routes/passkey.tsx'),
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
] satisfies RouteConfig;
