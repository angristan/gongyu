import { redirect } from 'react-router';
import { serializeThemeMode, type ThemeMode } from '../theme.server';
import type { Route } from './+types/theme';

function parseThemeMode(value: FormDataEntryValue | null): ThemeMode {
    if (value === 'light' || value === 'dark') {
        return value;
    }

    throw new Response('Invalid theme mode', { status: 400 });
}

function parseReturnTo(value: FormDataEntryValue | null): string {
    return typeof value === 'string' && value.startsWith('/') ? value : '/';
}

export async function action({ request }: Route.ActionArgs) {
    const formData = await request.formData();
    const mode = parseThemeMode(formData.get('mode'));

    return redirect(parseReturnTo(formData.get('returnTo')), {
        headers: {
            'Set-Cookie': await serializeThemeMode(mode),
        },
    });
}
