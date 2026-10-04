import { neon } from '@neondatabase/serverless';

export type Row = Record<string, unknown>;

/** Runs one SQL statement with $1-style parameters and resolves to its rows. */
export type Query = (text: string, params?: unknown[]) => Promise<Row[]>;

let cached: Query | null = null;

/** Queries Neon over HTTP, which suits short-lived serverless functions. */
export function neonQuery(): Query {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  const sql = neon(url);
  cached = (text, params = []) => sql.query(text, params) as Promise<Row[]>;
  return cached;
}
