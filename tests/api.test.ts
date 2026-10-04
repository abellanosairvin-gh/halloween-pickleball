import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Deps } from '../api/_lib/handlers';
import {
  deleteSession,
  getSession,
  getState,
  getVersions,
  postCheckIn,
  postOrganizer,
  postSession,
} from '../api/_lib/handlers';
import { COOKIE_NAME, createSessionToken } from '../api/_lib/session';
import type { Player, Snapshot } from '../src/domain/types';

const migrations = readdirSync('db/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(`db/migrations/${f}`, 'utf8'));
const seed = readFileSync('db/seed.sql', 'utf8');

const env = { ORGANIZER_PASSWORD: 'correct horse', SESSION_SECRET: 'test-secret-that-is-long-enough' };
const SITE = 'https://party.test';

let db: PGlite;
let deps: Deps;

beforeEach(async () => {
  db = new PGlite();
  for (const sql of migrations) await db.exec(sql);
  await db.exec(seed);
  deps = { query: () => async (text, params) => (await db.query(text, params)).rows as Record<string, unknown>[], env };
});

function request(path: string, init: { method?: string; body?: unknown; cookie?: string; origin?: string } = {}) {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.cookie) headers.cookie = init.cookie;
  if (init.origin) headers.origin = init.origin;
  return new Request(`${SITE}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

const organizerCookie = () => `${COOKIE_NAME}=${encodeURIComponent(createSessionToken(env))}`;

async function state(): Promise<Snapshot> {
  return ((await (await getState(request('/api/state'), deps)).json()) as { data: Snapshot }).data;
}

const organizer = (action: string, args: Record<string, unknown> = {}, cookie = organizerCookie()) =>
  postOrganizer(request('/api/organizer', { method: 'POST', body: { action, args }, cookie }), deps);

const firstPlayer = async (): Promise<Player> => (await state()).players[0];

describe('guests (party page)', () => {
  it('can read the event data and the change counters', async () => {
    const data = await state();
    expect(data.players).toHaveLength(40);
    expect(data.results).toEqual([]);
    const versions = await (await getVersions(request('/api/versions'), deps)).json();
    expect(Object.keys(versions).sort()).toEqual(['matches', 'pairs', 'players', 'results']);
  });

  it('can read only some tables', async () => {
    const response = await getState(request('/api/state?tables=players'), deps);
    const { data } = (await response.json()) as { data: Partial<Snapshot> };
    expect(Object.keys(data)).toEqual(['players']);
    expect((await getState(request('/api/state?tables=secrets'), deps)).status).toBe(400);
  });

  it('can check themselves in, and the counter for players moves', async () => {
    const before = await (await getVersions(request('/api/versions'), deps)).json();
    const player = await firstPlayer();
    const response = await postCheckIn(request('/api/check-in', { method: 'POST', body: { playerId: player.id } }), deps);
    expect(response.status).toBe(200);
    const { teamId } = await response.json();
    expect(['pumpkin', 'witch', 'skull', 'bat']).toContain(teamId);
    expect((await state()).players.find((p) => p.id === player.id)?.teamId).toBe(teamId);
    const after = await (await getVersions(request('/api/versions'), deps)).json();
    expect(after.players).toBe(before.players + 1);
  });

  it('get a clear message for an unknown player', async () => {
    const response = await postCheckIn(
      request('/api/check-in', { method: 'POST', body: { playerId: '00000000-0000-0000-0000-000000000000' } }),
      deps,
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch('isn’t on the list');
  });

  it('cannot make organizer changes', async () => {
    const player = await firstPlayer();
    const attempts: [string, Record<string, unknown>][] = [
      ['addResult', { playerId: player.id, outcome: 'W' }],
      ['deletePlayer', { playerId: player.id }],
      ['addPlayer', { name: 'Intruder', gender: 'M', skill: 'A' }],
      ['clearSimulatedResults', {}],
      ['resetBracket', { gender: 'F' }],
    ];
    for (const [action, args] of attempts) {
      const response = await postOrganizer(request('/api/organizer', { method: 'POST', body: { action, args } }), deps);
      expect(response.status, action).toBe(401);
    }
    const forged = `${COOKIE_NAME}=${encodeURIComponent(`${Date.now() + 1e9}.forged`)}`;
    expect((await organizer('addResult', { playerId: player.id, outcome: 'W' }, forged)).status).toBe(401);
    const expired = `${COOKIE_NAME}=${encodeURIComponent(createSessionToken(env, Date.now() - 1e10))}`;
    expect((await organizer('addResult', { playerId: player.id, outcome: 'W' }, expired)).status).toBe(401);

    const data = await state();
    expect(data.players).toHaveLength(40);
    expect(data.results).toEqual([]);
  });

  it('cannot post from another site or without JSON', async () => {
    const player = await firstPlayer();
    const crossSite = await postOrganizer(
      request('/api/organizer', {
        method: 'POST',
        body: { action: 'addResult', args: { playerId: player.id, outcome: 'W' } },
        cookie: organizerCookie(),
        origin: 'https://evil.test',
      }),
      deps,
    );
    expect(crossSite.status).toBe(403);
    const form = new Request(`${SITE}/api/check-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `playerId=${player.id}`,
    });
    expect((await postCheckIn(form, deps)).status).toBe(415);
  });
});

describe('organizer sign-in', () => {
  it('rejects a wrong password and signs in with the right one', async () => {
    const wrong = await postSession(request('/api/session', { method: 'POST', body: { password: 'boo' } }), deps);
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('set-cookie')).toBeNull();

    const right = await postSession(request('/api/session', { method: 'POST', body: { password: 'correct horse' } }), deps);
    expect(right.status).toBe(200);
    const cookie = right.headers.get('set-cookie')!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Secure/);

    const session = await getSession(request('/api/session', { cookie: cookie.split(';')[0] }), deps);
    expect(await session.json()).toEqual({ signedIn: true });
    const out = await deleteSession(request('/api/session', { method: 'DELETE' }), deps);
    expect(out.headers.get('set-cookie')).toMatch(/Max-Age=0/);
  });

  it('reports a missing password setting as a server problem, not a wrong password', async () => {
    const broken = { ...deps, env: { SESSION_SECRET: 'x' } };
    const response = await postSession(request('/api/session', { method: 'POST', body: { password: 'x' } }), broken);
    expect(response.status).toBe(500);
  });
});

describe('organizer actions', () => {
  it('record and remove results', async () => {
    const player = await firstPlayer();
    const added = await organizer('addResult', { playerId: player.id, outcome: 'W' });
    expect(added.status).toBe(200);
    const { result } = await added.json();
    expect(result).toMatchObject({ playerId: player.id, outcome: 'W', simulated: false });
    expect(typeof result.createdAt).toBe('string');
    await organizer('deleteResult', { resultId: result.id });
    expect((await state()).results).toEqual([]);
  });

  it('add and clear simulated results in one go', async () => {
    const [a, b] = (await state()).players;
    const entries = [
      { playerId: a.id, outcome: 'W' },
      { playerId: a.id, outcome: 'L' },
      { playerId: b.id, outcome: 'W' },
    ];
    expect((await (await organizer('addSimulatedResults', { entries })).json()).result).toBe(3);
    await organizer('addResult', { playerId: a.id, outcome: 'L' });
    expect((await (await organizer('clearSimulatedResults')).json()).result).toBe(3);
    expect((await state()).results).toHaveLength(1);
  });

  it('add, edit and delete players, with clear messages for duplicates', async () => {
    const added = await (await organizer('addPlayer', { name: '  Morticia   A ', gender: 'F', skill: 'A' })).json();
    expect(added.result.name).toBe('Morticia A');
    const duplicate = await organizer('addPlayer', { name: 'irene', gender: 'F', skill: 'A' });
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error).toMatch('already a player');
    await organizer('updatePlayer', { playerId: added.result.id, name: 'Morticia', gender: 'F', skill: 'B' });
    expect((await state()).players.find((p) => p.id === added.result.id)).toMatchObject({ name: 'Morticia', skill: 'B' });
    await organizer('deletePlayer', { playerId: added.result.id });
    expect((await state()).players).toHaveLength(40);
  });

  it('runs the brackets, including the battle for 3rd', async () => {
    for (const p of (await state()).players) {
      await postCheckIn(request('/api/check-in', { method: 'POST', body: { playerId: p.id } }), deps);
    }
    const players = (await state()).players;
    const pairs = (['pumpkin', 'witch', 'skull', 'bat'] as const).map((teamId, slot) => {
      const [x, y] = players.filter((p) => p.teamId === teamId && p.gender === 'F');
      return { gender: 'F', slot, teamId, player1Id: x.id, player2Id: y.id };
    });
    const tooFewGames = await organizer('setBracketPairs', { gender: 'F', pairs });
    expect(tooFewGames.status).toBe(400);
    expect((await tooFewGames.json()).error).toMatch('at least 4 recorded games');

    const entries = pairs.flatMap((p) =>
      [p.player1Id, p.player2Id].flatMap((id) => Array.from({ length: 4 }, () => ({ playerId: id, outcome: 'W' }))),
    );
    await organizer('addSimulatedResults', { entries });
    expect((await organizer('setBracketPairs', { gender: 'F', pairs })).status).toBe(200);

    // A player in a locked pair can't be deleted.
    const locked = await organizer('deletePlayer', { playerId: pairs[0].player1Id });
    expect(locked.status).toBe(409);

    for (const [match, winnerSlot] of [
      ['semi1', 0],
      ['semi2', 3],
      ['final', 3],
      ['third', 1],
    ] as const) {
      expect((await organizer('setMatchWinner', { gender: 'F', match, winnerSlot })).status, match).toBe(200);
    }
    expect((await state()).matches).toHaveLength(4);
    expect((await organizer('setMatchWinner', { gender: 'F', match: 'third', winnerSlot: 3 })).status).toBe(400);
    await organizer('resetBracket', { gender: 'F' });
    const after = await state();
    expect(after.pairs).toEqual([]);
    expect(after.matches).toEqual([]);
  });

  it('refuses unknown actions', async () => {
    expect((await organizer('dropTables')).status).toBe(400);
    expect((await organizer('toString')).status).toBe(400);
  });
});
