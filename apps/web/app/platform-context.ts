import { createContext } from 'react-router';
import type { AuthenticationState } from './auth/session.server';
import type { RequestEffectRunner } from './effect/runtime';

export interface CloudflareRequestContext {
    readonly authentication: AuthenticationState;
    readonly effect: RequestEffectRunner;
    readonly env: Env;
    readonly executionContext: ExecutionContext;
    readonly requestId: string;
}

export const cloudflareRequestContext =
    createContext<CloudflareRequestContext>();
