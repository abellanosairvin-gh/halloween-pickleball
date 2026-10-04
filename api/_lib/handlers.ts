import type { TableName } from '../../src/domain/types';
import { BadRequest, checkIn, organizerActions, readState, readVersions, TABLES } from './data.js';
import type { Query } from './db.js';
import { checkPassword, createSessionToken, isOrganizer, type ServerEnv, sessionCookie } from './session.js';

export interface Deps {
  query: () => Query;
  env: ServerEnv;
}

export type Handler = (request: Request, deps: Deps) => Promise<Response>;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });

const fail = (status: number, message: string) => json({ error: message }, status);

type DbError = { code?: string; message?: string; detail?: string; constraint?: string };

/** Turns errors into a status and a message the organizer or guest can act on. */
export function errorResponse(error: unknown): Response {
  if (error instanceof BadRequest) return fail(400, error.message);
  const e = (error ?? {}) as DbError;
  const about = `${e.message ?? ''} ${e.detail ?? ''} ${e.constraint ?? ''}`;
  if (e.code === '23505' && /name/.test(about)) {
    return fail(409, 'There’s already a player with that name. Add an initial to tell them apart.');
  }
  if (e.code === '23503' && /bracket_pairs/.test(about)) {
    return fail(409, 'That player is in a locked tournament pair. Reset that bracket on the Tournament tab first.');
  }
  if (e.code === '23514' && /name_not_blank/.test(about)) return fail(400, 'Names need 1 to 40 characters.');
  if (e.code === '22P02') return fail(400, 'That item isn’t on the list any more. Refresh and try again.');
  // Messages raised by the database functions are written for people.
  if (e.code === 'P0001' && e.message) return fail(400, e.message);
  console.error(error);
  return fail(500, 'The server couldn’t complete that. Try again in a moment.');
}

/** Rejects writes from other sites: they can't send JSON without a CORS preflight, and their Origin differs. */
function crossSite(request: Request): Response | null {
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) {
    return fail(415, 'Send JSON.');
  }
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return fail(403, 'Cross-site request refused.');
  return null;
}

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    throw new BadRequest('Send a JSON body.');
  }
}

const wrap =
  (handler: Handler): Handler =>
  async (request, deps) => {
    try {
      return await handler(request, deps);
    } catch (error) {
      return errorResponse(error);
    }
  };

export const getState = wrap(async (request, { query }) => {
  const requested = new URL(request.url).searchParams.get('tables');
  const tables = requested ? (requested.split(',') as TableName[]) : [...TABLES];
  if (tables.some((t) => !TABLES.includes(t))) throw new BadRequest('Unknown table.');
  return json(await readState(query(), tables));
});

export const getVersions = wrap(async (_request, { query }) => json(await readVersions(query())));

export const postCheckIn = wrap(async (request, { query }) => {
  const refused = crossSite(request);
  if (refused) return refused;
  const { playerId } = await body(request);
  return json({ teamId: await checkIn(query(), playerId) });
});

export const getSession = wrap(async (request, { env }) => json({ signedIn: isOrganizer(request, env) }));

export const postSession = wrap(async (request, { env }) => {
  const refused = crossSite(request);
  if (refused) return refused;
  const { password } = await body(request);
  if (typeof password !== 'string' || !checkPassword(env, password)) {
    // A short pause makes guessing the shared password slow.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return fail(401, 'That password isn’t right.');
  }
  return json({ signedIn: true }, 200, { 'set-cookie': sessionCookie(request, createSessionToken(env)) });
});

export const deleteSession = wrap(async (request) =>
  json({ signedIn: false }, 200, { 'set-cookie': sessionCookie(request, null) }),
);

export const postOrganizer = wrap(async (request, { query, env }) => {
  const refused = crossSite(request);
  if (refused) return refused;
  if (!isOrganizer(request, env)) return fail(401, 'Your organizer sign-in has ended. Sign in again to make changes.');
  const { action, args } = await body(request);
  const run = typeof action === 'string' && Object.hasOwn(organizerActions, action) ? organizerActions[action] : null;
  if (!run) throw new BadRequest('Unknown action.');
  const result = await run(query(), (args ?? {}) as Record<string, unknown>);
  return json({ result });
});
