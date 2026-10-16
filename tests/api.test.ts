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
  postBallot,
  postVote,
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
    expect(Object.keys(versions).sort()).toEqual([
      'ballots',
      'entrants',
      'matches',
      'pairs',
      'picks',
      'players',
      'results',
      'votes',
      'voting',
    ]);
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
      ['resetBracket', { bracket: 'F' }],
      ['addCostumePlayer', { playerId: player.id }],
      ['addCostumeGuest', { name: 'Intruder', gender: 'M' }],
      ['clearCostumeVotes', { voterId: player.id }],
      ['setCostumePick', { gender: 'F', entrantId: null }],
      ['setCostumeVoting', { open: true }],
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
    expect(result).toMatchObject({ playerId: player.id, outcome: 'W' });
    expect(typeof result.createdAt).toBe('string');
    await organizer('deleteResult', { resultId: result.id });
    expect((await state()).results).toEqual([]);
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

  it('runs the first rounds, then mixed doubles through the battle for 3rd', async () => {
    for (const p of (await state()).players) {
      await postCheckIn(request('/api/check-in', { method: 'POST', body: { playerId: p.id } }), deps);
    }
    const players = (await state()).players;
    const teamPairs = (gender: 'F' | 'M') =>
      (['pumpkin', 'witch', 'skull', 'bat'] as const).map((teamId, slot) => {
        const [x, y] = players.filter((p) => p.teamId === teamId && p.gender === gender);
        return { bracket: gender, slot, teamId, player1Id: x.id, player2Id: y.id };
      });
    const women = teamPairs('F');
    const men = teamPairs('M');
    const tooFewGames = await organizer('setBracketPairs', { bracket: 'F', pairs: women });
    expect(tooFewGames.status).toBe(400);
    expect((await tooFewGames.json()).error).toMatch('at least 4 recorded games');

    for (const p of [...women, ...men]) {
      for (const id of [p.player1Id, p.player2Id]) {
        for (let i = 0; i < 4; i += 1) await organizer('addResult', { playerId: id, outcome: 'W' });
      }
    }
    expect((await organizer('setBracketPairs', { bracket: 'F', pairs: women })).status).toBe(200);
    expect((await organizer('setBracketPairs', { bracket: 'M', pairs: men })).status).toBe(200);

    // A player in a locked pair can't be deleted.
    const locked = await organizer('deletePlayer', { playerId: women[0].player1Id });
    expect(locked.status).toBe(409);

    for (const bracket of ['F', 'M']) {
      expect((await organizer('setMatchWinner', { bracket, match: 'semi1', winnerSlot: 0 })).status).toBe(200);
      expect((await organizer('setMatchWinner', { bracket, match: 'semi2', winnerSlot: 3 })).status).toBe(200);
    }
    const noFinal = await organizer('setMatchWinner', { bracket: 'F', match: 'final', winnerSlot: 0 });
    expect(noFinal.status).toBe(400);
    expect((await noFinal.json()).error).toMatch('play one round');

    // Winners: slot 0 and slot 3 of each gender. Each woman partners a man.
    const through = (pairs: typeof women) => [pairs[0], pairs[3]].flatMap((p) => [p.player1Id, p.player2Id]);
    const mixed = through(women).map((w, slot) => ({ bracket: 'X', slot, teamId: null, player1Id: w, player2Id: through(men)[slot] }));
    expect((await organizer('setBracketPairs', { bracket: 'X', pairs: mixed })).status).toBe(200);
    const drawn = await state();
    expect(drawn.pairs.filter((p) => p.bracket === 'X').map((p) => p.teamId)).toEqual([null, null, null, null]);

    const frozen = await organizer('setMatchWinner', { bracket: 'M', match: 'semi1', winnerSlot: 1 });
    expect(frozen.status).toBe(400);
    expect((await frozen.json()).error).toMatch('Reset mixed doubles');

    for (const [match, winnerSlot] of [
      ['semi1', 0],
      ['semi2', 3],
      ['final', 3],
      ['third', 1],
    ] as const) {
      expect((await organizer('setMatchWinner', { bracket: 'X', match, winnerSlot })).status, match).toBe(200);
    }
    expect((await state()).matches.filter((m) => m.bracket === 'X')).toHaveLength(4);
    expect((await organizer('setMatchWinner', { bracket: 'X', match: 'third', winnerSlot: 3 })).status).toBe(400);

    expect((await organizer('resetBracket', { bracket: 'F' })).status).toBe(400);
    await organizer('resetBracket', { bracket: 'X' });
    await organizer('resetBracket', { bracket: 'F' });
    await organizer('resetBracket', { bracket: 'M' });
    const after = await state();
    expect(after.pairs).toEqual([]);
    expect(after.matches).toEqual([]);
  });

  it('refuses unknown actions', async () => {
    expect((await organizer('dropTables')).status).toBe(400);
    expect((await organizer('toString')).status).toBe(400);
  });
});

describe('best in costume', () => {
  const vote = async (body: Record<string, unknown>) => {
    const response = await postVote(request('/api/vote', { method: 'POST', body }), deps);
    return { status: response.status, ...((await response.json()) as { token?: string; error?: string }) };
  };
  const ballot = async (token: string) =>
    ((await (await postBallot(request('/api/ballot', { method: 'POST', body: { token } }), deps)).json()) as {
      ballot: { voterId: string; genders: string[] } | null;
    }).ballot;
  const read = async (cookie?: string) =>
    (await (await getState(request('/api/state', { cookie }), deps)).json()) as { data: Snapshot; organizer: boolean };
  const organizerState = async () => (await read(organizerCookie())).data;

  /** Two women and a man from the roster in costume, plus a guest man who isn't playing, with voting open. */
  async function lineUp() {
    const players = (await state()).players;
    const [w1, w2] = players.filter((p) => p.gender === 'F');
    const [m1, voter] = players.filter((p) => p.gender === 'M');
    const add = async (playerId: string) => (await (await organizer('addCostumePlayer', { playerId })).json()).result;
    const guest = (await (await organizer('addCostumeGuest', { name: 'Count  Dracula', gender: 'M' })).json()).result;
    const entered = { w1: await add(w1.id), w2: await add(w2.id), m1: await add(m1.id), guest };
    expect((await organizer('setCostumeVoting', { open: true })).status).toBe(200);
    return { ...entered, w1Player: w1, m1Player: m1, voter };
  }

  it('keeps voting closed until the organizer opens it with someone in each line-up', async () => {
    const players = (await state()).players;
    const woman = players.find((p) => p.gender === 'F')!;
    const voter = players.find((p) => p.gender === 'M')!;
    expect((await state()).voting).toEqual({ open: false, closed: false });
    const entrant = (await (await organizer('addCostumePlayer', { playerId: woman.id })).json()).result;

    const early = await vote({ voterId: voter.id, femaleId: entrant.id, maleId: null });
    expect(early.status).toBe(400);
    expect(early.error).toMatch('isn’t open');

    const noMen = await organizer('setCostumeVoting', { open: true });
    expect(noMen.status).toBe(400);
    expect((await noMen.json()).error).toMatch('one woman and one man');

    await organizer('addCostumeGuest', { name: 'Gomez', gender: 'M' });
    expect((await organizer('setCostumeVoting', { open: true })).status).toBe(200);
    expect((await state()).voting).toEqual({ open: true, closed: false });
    expect((await vote({ voterId: voter.id, femaleId: entrant.id, maleId: null })).status).toBe(200);

    // Closing is remembered, so guests are told voting closed rather than not opened yet.
    await organizer('setCostumeVoting', { open: false });
    expect((await state()).voting).toEqual({ open: false, closed: true });
    const late = await vote({ voterId: woman.id, femaleId: null, maleId: (await state()).entrants[1].id });
    expect(late.status).toBe(400);
    expect((await state()).ballots).toEqual([voter.id]);
    await organizer('setCostumeVoting', { open: true });
    expect((await state()).voting).toEqual({ open: true, closed: false });
  });

  it('builds the line-up from players and guests who are not playing', async () => {
    const { guest, w1Player } = await lineUp();
    expect(guest).toMatchObject({ playerId: null, guestName: 'Count Dracula', guestGender: 'M' });
    expect((await state()).entrants).toHaveLength(4);
    const again = await organizer('addCostumePlayer', { playerId: w1Player.id });
    expect(again.status).toBe(409);
    expect((await again.json()).error).toMatch('already in the costume line-up');
    const player = await organizer('addCostumeGuest', { name: w1Player.name.toUpperCase(), gender: 'F' });
    expect(player.status).toBe(400);
    expect((await player.json()).error).toMatch('on the player list');
    expect((await organizer('addCostumeGuest', { name: 'count dracula', gender: 'M' })).status).toBe(409);
    expect((await organizer('addCostumeGuest', { name: '   ', gender: 'M' })).status).toBe(400);
    // A guest must have a name, even written straight to the database.
    await expect(db.query("insert into costume_entrants (guest_gender) values ('F')")).rejects.toThrow();
  });

  it('won’t let one person be both a player and a costume guest', async () => {
    const { w1Player } = await lineUp();
    const added = await organizer('addPlayer', { name: 'count dracula', gender: 'M', skill: 'A' });
    expect(added.status).toBe(400);
    expect((await added.json()).error).toMatch('costume line-up as a guest');
    const renamed = await organizer('updatePlayer', { playerId: w1Player.id, name: 'Count Dracula', gender: 'F', skill: 'A' });
    expect(renamed.status).toBe(400);
    expect((await renamed.json()).error).toMatch('costume line-up as a guest');
    const missing = '00000000-0000-0000-0000-000000000000';
    expect((await organizer('updatePlayer', { playerId: missing, name: 'Nobody', gender: 'F', skill: 'A' })).status).toBe(400);
  });

  it('takes one ballot per person, and shows guests only who has voted', async () => {
    const { w1, guest, voter } = await lineUp();
    const before = await (await getVersions(request('/api/versions'), deps)).json();
    const cast = await vote({ voterId: voter.id, femaleId: w1.id, maleId: guest.id });
    expect(cast.status).toBe(200);
    expect(cast.token).toMatch(/^[0-9a-f-]{36}$/);
    const after = await (await getVersions(request('/api/versions'), deps)).json();
    expect(after.votes).toBe(before.votes + 1);
    expect(after.ballots).toBe(before.ballots + 1);

    const asGuest = await read();
    expect(asGuest.organizer).toBe(false);
    expect(asGuest.data.ballots).toEqual([voter.id]);
    expect(asGuest.data.votes).toEqual([]);
    const asOrganizer = await read(organizerCookie());
    expect(asOrganizer.organizer).toBe(true);
    expect(asOrganizer.data.votes.map((v) => v.entrantId).sort()).toEqual([w1.id, guest.id].sort());

    const second = await vote({ voterId: voter.id, femaleId: w1.id, maleId: guest.id });
    expect(second.status).toBe(400);
    expect(second.error).toMatch('already voted');
    expect((await ballot(cast.token!))).toEqual({ voterId: voter.id, genders: ['F', 'M'] });
  });

  it('refuses self-votes, wrong-award picks and unknown voters', async () => {
    const { w1, w2, m1, guest, w1Player } = await lineUp();
    const self = await vote({ voterId: w1Player.id, femaleId: w1.id, maleId: m1.id });
    expect(self.error).toMatch('vote for yourself');
    const guestSelf = await vote({ voterId: guest.id, femaleId: w2.id, maleId: guest.id });
    expect(guestSelf.error).toMatch('vote for yourself');
    const wrong = await vote({ voterId: w1Player.id, femaleId: m1.id, maleId: guest.id });
    expect(wrong.error).toMatch('a woman for the women');
    const nobody = await vote({ voterId: '00000000-0000-0000-0000-000000000000', femaleId: w1.id, maleId: m1.id });
    expect(nobody.error).toMatch('isn’t on the list');
    const empty = await vote({ voterId: w1Player.id, femaleId: null, maleId: null });
    expect(empty.error).toMatch('Pick who');
    expect((await vote({ voterId: w1Player.id, femaleId: w2.id, maleId: m1.id, token: 'not-a-token' })).status).toBe(400);
    expect((await organizerState()).votes).toEqual([]);
    expect((await state()).ballots).toEqual([]);

    // A guest who isn't playing can vote too.
    expect((await vote({ voterId: guest.id, femaleId: w2.id, maleId: m1.id })).status).toBe(200);
  });

  it('lets the phone that voted fill in an award it lost, and nobody else', async () => {
    const { w1, w2, m1, guest, voter } = await lineUp();
    const { token } = await vote({ voterId: voter.id, femaleId: w1.id, maleId: m1.id });

    // Removing the woman they picked takes that vote but keeps their ballot, so guests see no change.
    const ballotsBefore = (await state()).ballots;
    await organizer('removeCostumeEntrant', { entrantId: w1.id });
    expect((await state()).ballots).toEqual(ballotsBefore);
    expect(await ballot(token!)).toEqual({ voterId: voter.id, genders: ['M'] });

    expect((await vote({ voterId: voter.id, femaleId: w2.id, maleId: null })).error).toMatch('already voted');
    const forged = '11111111-1111-1111-1111-111111111111';
    expect((await vote({ voterId: voter.id, femaleId: w2.id, maleId: null, token: forged })).error).toMatch('already voted');
    expect((await vote({ voterId: voter.id, femaleId: null, maleId: guest.id, token })).error).toMatch('already voted for that award');
    const refill = await vote({ voterId: voter.id, femaleId: w2.id, maleId: null, token });
    expect(refill).toMatchObject({ status: 200, token });
    expect(await ballot(token!)).toEqual({ voterId: voter.id, genders: ['F', 'M'] });
  });

  it('lets the organizer clear a vote, pick a tie-break and remove people', async () => {
    const { w1, w2, m1, guest, voter, m1Player } = await lineUp();
    const first = await vote({ voterId: voter.id, femaleId: w1.id, maleId: guest.id });
    await vote({ voterId: m1Player.id, femaleId: w2.id, maleId: guest.id });
    const guestBallot = await vote({ voterId: guest.id, femaleId: w2.id, maleId: m1.id });

    expect((await organizer('clearCostumeVotes', { voterId: voter.id })).status).toBe(200);
    expect((await state()).ballots.sort()).toEqual([m1Player.id, guest.id].sort());
    expect(await ballot(first.token!)).toBeNull();
    expect((await vote({ voterId: voter.id, femaleId: w1.id, maleId: m1.id })).status).toBe(200);

    expect((await organizer('setCostumePick', { gender: 'F', entrantId: w2.id })).status).toBe(200);
    expect((await organizer('setCostumePick', { gender: 'F', entrantId: w1.id })).status).toBe(200);
    expect((await organizerState()).picks).toEqual([{ gender: 'F', entrantId: w1.id }]);
    // The tie-break would give away the winner, so guests don't get it.
    expect((await state()).picks).toEqual([]);

    // Removing someone takes the votes they got; removing a guest also takes their own ballot and votes.
    await organizer('removeCostumeEntrant', { entrantId: w1.id });
    await organizer('removeCostumeEntrant', { entrantId: guest.id });
    const data = await organizerState();
    expect(data.picks).toEqual([]);
    expect(data.entrants.map((e) => e.id).sort()).toEqual([w2.id, m1.id].sort());
    expect(data.votes.map((v) => `${v.voterId}:${v.entrantId}`).sort()).toEqual(
      [`${m1Player.id}:${w2.id}`, `${voter.id}:${m1.id}`].sort(),
    );
    expect(data.ballots.sort()).toEqual([voter.id, m1Player.id].sort());
    expect(await ballot(guestBallot.token!)).toBeNull();

    // A pick or line-up add for someone who's gone gets a clear message, not a server error.
    const gone = await organizer('setCostumePick', { gender: 'F', entrantId: w1.id });
    expect(gone.status).toBe(409);
    expect((await gone.json()).error).toMatch('isn’t in the costume line-up');

    // Deleting a player removes their place in the line-up and their own ballot.
    await organizer('deletePlayer', { playerId: m1Player.id });
    const afterDelete = await organizerState();
    expect(afterDelete.entrants.map((e) => e.id)).toEqual([w2.id]);
    expect(afterDelete.ballots).toEqual([voter.id]);
    const deleted = await organizer('addCostumePlayer', { playerId: m1Player.id });
    expect(deleted.status).toBe(409);
    expect((await deleted.json()).error).toMatch('isn’t on the list');
  });
});
