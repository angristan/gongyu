import { createCookie } from 'react-router';

export type ThemeMode = 'light' | 'dark';

const themeCookie = createCookie('gongyu-theme', {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    sameSite: 'lax',
    secure: import.meta.env.PROD,
});

export async function readThemeMode(request: Request): Promise<ThemeMode> {
    const value: unknown = await themeCookie.parse(
        request.headers.get('Cookie'),
    );

    return value === 'dark' ? 'dark' : 'light';
}

export function serializeThemeMode(mode: ThemeMode): Promise<string> {
    return themeCookie.serialize(mode);
}
