import { neonQuery } from './db.js';
import type { Deps } from './handlers.js';

/** The real database and environment, as used on Vercel. */
export const deps: Deps = { query: neonQuery, env: process.env };
