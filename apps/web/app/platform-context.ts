import { createContext } from 'react-router';

export interface CloudflareRequestContext {
    readonly env: Env;
    readonly executionContext: ExecutionContext;
    readonly requestId: string;
}

export const cloudflareRequestContext =
    createContext<CloudflareRequestContext>();
