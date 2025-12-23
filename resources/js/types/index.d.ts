export interface User {
    id: number;
    name: string;
    email: string;
    email_verified_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface Bookmark {
    id: number;
    short_url: string;
    url: string;
    title: string;
    description: string | null;
    thumbnail_url: string | null;
    shaarli_short_url: string | null;
    created_at: string;
    updated_at: string;
}

export interface PageProps {
    auth: {
        user: User | null;
    };
    flash: {
        success: string | null;
        error: string | null;
    };
}
