import { createApiAuth, createApiRepo } from '../data/apiRepo';
import { createLocalAuth, createLocalRepo } from '../data/localRepo';
import type { AuthClient, Repo } from '../data/repo';

/**
 * True when the site was built without a database (no DATABASE_URL): data stays in this browser
 * only. Set by vite.config.ts at build time.
 */
export const isDemo = !__HAS_DATABASE__;

const apiAuth = isDemo ? null : createApiAuth();
export const auth: AuthClient = apiAuth ?? createLocalAuth();
// When the organizer's session lapses, reads quietly turn into a guest's (no costume votes), so sign them out.
export const repo: Repo = apiAuth ? createApiRepo(apiAuth.sessionEnded) : createLocalRepo();
