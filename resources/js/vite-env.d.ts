/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_APP_NAME: string;
    readonly VITE_UMAMI_URL: string;
    readonly VITE_UMAMI_WEBSITE_ID: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
