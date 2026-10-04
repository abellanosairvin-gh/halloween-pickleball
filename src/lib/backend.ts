import { createApiAuth, createApiRepo } from '../data/apiRepo';
import { createLocalAuth, createLocalRepo } from '../data/localRepo';
import type { AuthClient, Repo } from '../data/repo';

/**
 * True when the site was built without a database (no DATABASE_URL): data stays in this browser
 * only. Set by vite.config.ts at build time.
 */
export const isDemo = !__HAS_DATABASE__;

export const repo: Repo = isDemo ? createLocalRepo() : createApiRepo();
export const auth: AuthClient = isDemo ? createLocalAuth() : createApiAuth();
