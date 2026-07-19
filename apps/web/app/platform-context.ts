import { createContext } from 'react-router';
import type { RequestEffectRunner } from './effect/runtime';

export interface CloudflareRequestContext {
    readonly effect: RequestEffectRunner;
    readonly env: Env;
    readonly executionContext: ExecutionContext;
    readonly requestId: string;
}

export const cloudflareRequestContext =
    createContext<CloudflareRequestContext>();
