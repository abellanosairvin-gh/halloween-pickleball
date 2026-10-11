import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { TEAM_IDS } from '../src/domain/teams';
import { bucketSpreads, seededRandom, shuffled } from './fixtures';

// Every migration, applied in file-name order, the same way scripts/db-setup.mjs applies them.
const migrations = readdirSync('db/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(`db/migrations/${f}`, 'utf8'));
const seed = readFileSync('db/seed.sql', 'utf8');

type PlayerRow = { id: string; name: string; gender: string; skill: string; team_id: string | null };

let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  for (const sql of migrations) await db.exec(sql);
  await db.exec(seed);
});

const players = async () => (await db.query<PlayerRow>('select id, name, gender, skill, team_id from players')).rows;
const checkIn = async (id: string) =>
  (await db.query<{ team: string }>('select check_in_player($1) as team', [id])).rows[0].team;

async function recordGames(playerId: string, count: number) {
  for (let i = 0; i < count; i += 1) {
    await db.query(`insert into results (player_id, outcome) values ($1, $2)`, [playerId, i % 2 ? 'L' : 'W']);
  }
}

/** First two players of each team for a gender, each given `games` recorded results. */
async function lockedPairs(gender: string, games = 4) {
  const all = await players();
  const pairs = TEAM_IDS.map((team, slot) => {
    const [a, b] = all.filter((p) => p.team_id === team && p.gender === gender);
    return { slot, team_id: team, player1_id: a.id, player2_id: b.id };
  });
  for (const p of pairs) {
    await recordGames(p.player1_id, games);
    await recordGames(p.player2_id, games);
  }
  return pairs;
}

describe('check_in_player', () => {
  it('seeds all 40 players from the spreadsheet', async () => {
    expect(await players()).toHaveLength(40);
  });

  it('balances every gender × skill group across teams for any arrival order', async () => {
    for (const s of [1, 2, 3]) {
      if (s > 1) await db.exec('update players set team_id = null, checked_in_at = null');
      for (const p of shuffled(await players(), seededRandom(s))) await checkIn(p.id);
      const rows = await players();
      expect(rows.every((p) => p.team_id)).toBe(true);
      const spreads = bucketSpreads(
        rows.map((p) => ({ gender: p.gender, skill: p.skill, teamId: p.team_id })),
        TEAM_IDS,
      );
      expect(Math.max(...Object.values(spreads))).toBeLessThanOrEqual(1);
    }
  });

  it('returns the existing team when a player checks in twice', async () => {
    const [p] = await players();
    const first = await checkIn(p.id);
    expect(await checkIn(p.id)).toBe(first);
  });

  it('rejects an unknown player', async () => {
    await expect(checkIn('00000000-0000-0000-0000-000000000000')).rejects.toThrow('isn’t on the list');
  });

  it('refuses a team without a check-in', async () => {
    const [p] = await players();
    await expect(db.query(`update players set team_id = 'bat' where id = $1`, [p.id])).rejects.toThrow();
  });
});

describe('change counters', () => {
  const versions = async () =>
    Object.fromEntries(
      (await db.query<{ name: string; version: number }>('select name, version::int from table_versions')).rows.map((r) => [
        r.name,
        r.version,
      ]),
    );

  it('move only for the table that changed, once per statement', async () => {
    const before = await versions();
    const [p] = await players();
    await checkIn(p.id);
    await db.query(`insert into results (player_id, outcome) values ($1, 'W'), ($1, 'L')`, [p.id]);
    const after = await versions();
    expect(after.players).toBe(before.players + 1);
    expect(after.results).toBe(before.results + 1);
    expect(after.pairs).toBe(before.pairs);
    expect(after.matches).toBe(before.matches);
  });
});

describe('brackets', () => {
  beforeEach(async () => {
    for (const p of await players()) await checkIn(p.id);
  });

  const lock = async (bracket: string, pairs: unknown) =>
    db.query('select set_bracket_pairs($1, $2)', [bracket, JSON.stringify(pairs)]);
  const win = async (bracket: string, match: string, slot: number | null) =>
    db.query('select set_match_winner($1, $2, $3::smallint)', [bracket, match, slot]);
  const results = async (bracket: string) =>
    (
      await db.query<{ match: string; winner_slot: number }>(
        'select match, winner_slot from bracket_matches where bracket = $1 order by match',
        [bracket],
      )
    ).rows;

  /** Locks and plays both first rounds (slots 0 and 3 win), returning the women and men who went through. */
  async function playFirstRounds() {
    for (const g of ['F', 'M']) {
      await lock(g, await lockedPairs(g));
      await win(g, 'semi1', 0);
      await win(g, 'semi2', 3);
    }
    const through = async (g: string) =>
      (await db.query<{ player_id: string }>('select player_id from first_round_winners where gender = $1', [g])).rows.map(
        (r) => r.player_id,
      );
    return { women: await through('F'), men: await through('M') };
  }

  const mixedPairs = (women: string[], men: string[]) =>
    women.map((w, slot) => ({ slot, player1_id: w, player2_id: men[slot] }));

  it('plays one round in the women’s and men’s brackets, with no final', async () => {
    await lock('F', await lockedPairs('F'));
    await win('F', 'semi1', 1);
    await win('F', 'semi2', 2);
    await expect(win('F', 'final', 1)).rejects.toThrow('play one round');
    await expect(win('F', 'third', 0)).rejects.toThrow('play one round');
    expect(await results('F')).toEqual([
      { match: 'semi1', winner_slot: 1 },
      { match: 'semi2', winner_slot: 2 },
    ]);
  });

  it('draws mixed doubles from the first-round winners and plays through the final and the battle for 3rd', async () => {
    const { women, men } = await playFirstRounds();
    expect(women).toHaveLength(4);
    expect(men).toHaveLength(4);
    await lock('X', mixedPairs(women, men));
    const { rows } = await db.query<{ team_id: string | null }>(`select team_id from bracket_pairs where bracket = 'X'`);
    expect(rows.map((r) => r.team_id)).toEqual([null, null, null, null]);

    await win('X', 'semi1', 1);
    await win('X', 'semi2', 2);
    await win('X', 'final', 2);
    await win('X', 'third', 0);
    expect(await results('X')).toEqual([
      { match: 'final', winner_slot: 2 },
      { match: 'semi1', winner_slot: 1 },
      { match: 'semi2', winner_slot: 2 },
      { match: 'third', winner_slot: 0 },
    ]);
  });

  it('only draws mixed doubles from the women and men who won their first-round match', async () => {
    await lock('F', await lockedPairs('F'));
    await win('F', 'semi1', 0);
    const strangers = () => Array.from({ length: 4 }, () => crypto.randomUUID());
    await expect(lock('X', mixedPairs(strangers(), strangers()))).rejects.toThrow('Finish the women’s and men’s first round');
    await db.query(`select reset_bracket('F')`);

    const { women, men } = await playFirstRounds();
    await expect(lock('X', mixedPairs(women, men).slice(0, 3))).rejects.toThrow('exactly 4 pairs');
    // Woman and man the wrong way round.
    await expect(lock('X', mixedPairs(men, women))).rejects.toThrow('a woman and a man who won');
    // The same woman twice.
    await expect(lock('X', mixedPairs([women[0], ...women.slice(0, 3)], men))).rejects.toThrow('a woman and a man who won');
    // A woman whose pair lost.
    const loser = (await db.query<{ player1_id: string }>(`select player1_id from bracket_pairs where bracket = 'F' and slot = 1`))
      .rows[0].player1_id;
    await expect(lock('X', mixedPairs([loser, ...women.slice(1)], men))).rejects.toThrow('a woman and a man who won');
    await lock('X', mixedPairs(women, men));
  });

  it('fixes the first round once mixed doubles is drawn, until mixed doubles is reset', async () => {
    const { women, men } = await playFirstRounds();
    await lock('X', mixedPairs(women, men));
    await expect(win('F', 'semi1', 1)).rejects.toThrow('already drawn');
    await expect(win('M', 'semi2', null)).rejects.toThrow('already drawn');
    await expect(db.query(`select reset_bracket('M')`)).rejects.toThrow('Reset mixed doubles first');

    await win('X', 'semi1', 0);
    await db.query(`select reset_bracket('X')`);
    expect(await results('X')).toEqual([]);
    await win('F', 'semi1', 1);
    await db.query(`select reset_bracket('M')`);
  });

  it('only lets the semifinal losers play for 3rd, and drops a stale result when a semi changes', async () => {
    const { women, men } = await playFirstRounds();
    await lock('X', mixedPairs(women, men));
    await win('X', 'semi1', 0);
    await expect(win('X', 'third', 1)).rejects.toThrow('Finish both');
    await win('X', 'semi2', 3);
    await expect(win('X', 'third', 0)).rejects.toThrow('battle for 3rd');
    await win('X', 'third', 2);
    await win('X', 'semi1', 0);
    expect((await results('X')).some((r) => r.match === 'third')).toBe(true);
    await win('X', 'semi2', 2);
    expect((await results('X')).some((r) => r.match === 'third')).toBe(false);
  });

  it('validates winners and drops a stale final when a semifinal changes', async () => {
    const { women, men } = await playFirstRounds();
    await lock('X', mixedPairs(women, men));
    await expect(win('X', 'semi1', 2)).rejects.toThrow('not in this match');
    await win('X', 'semi1', 0);
    await expect(win('X', 'final', 0)).rejects.toThrow('Finish both');
    await win('X', 'semi2', 3);
    await win('X', 'final', 0);
    await win('X', 'semi1', 1);
    expect((await results('X')).some((r) => r.match === 'final')).toBe(false);
  });

  it('rejects pairs that mix teams or genders', async () => {
    const pairs = await lockedPairs('F');
    const man = (await players()).find((p) => p.gender === 'M' && p.team_id === pairs[0].team_id)!;
    pairs[0].player2_id = man.id;
    await expect(lock('F', pairs)).rejects.toThrow('checked-in women');
  });

  it('rejects a pair with a player under 4 recorded games', async () => {
    const pairs = await lockedPairs('F', 3);
    await expect(lock('F', pairs)).rejects.toThrow('at least 4 recorded games');
    await recordGames(pairs[0].player1_id, 1);
    await expect(lock('F', pairs)).rejects.toThrow('at least 4 recorded games');
    for (const p of pairs) {
      await recordGames(p.player1_id, 1);
      await recordGames(p.player2_id, 1);
    }
    await lock('F', pairs);
  });

  it('refuses a redraw once a result is in, and allows it after a reset', async () => {
    const pairs = await lockedPairs('M');
    await lock('M', pairs);
    await win('M', 'semi1', 0);
    await expect(lock('M', pairs)).rejects.toThrow('Reset it');
    await db.query(`select reset_bracket('M')`);
    await lock('M', pairs);
  });
});

describe('editing the roster', () => {
  it('adds, renames and deletes a player, removing their results with them', async () => {
    const { rows } = await db.query<{ id: string }>(`insert into players (name, gender, skill) values ('Morticia', 'F', 'A') returning id`);
    const id = rows[0].id;
    await recordGames(id, 2);
    await db.query(`update players set name = 'Morticia A', skill = 'B' where id = $1`, [id]);
    await db.query('delete from players where id = $1', [id]);
    expect((await db.query('select 1 from results where player_id = $1', [id])).rows).toHaveLength(0);
    expect(await players()).toHaveLength(40);
  });

  it('rejects a name that differs only by case, or a blank name', async () => {
    await expect(db.query(`insert into players (name, gender, skill) values ('irene', 'F', 'A')`)).rejects.toThrow(
      'players_name_lower_idx',
    );
    await expect(db.query(`insert into players (name, gender, skill) values ('   ', 'F', 'A')`)).rejects.toThrow(
      'name_not_blank',
    );
  });

  it('protects players in a locked pair until the bracket is reset', async () => {
    for (const p of await players()) await checkIn(p.id);
    const pairs = await lockedPairs('F');
    await db.query('select set_bracket_pairs($1, $2)', ['F', JSON.stringify(pairs)]);
    const locked = pairs[0].player1_id;
    const otherTeam = TEAM_IDS.find((t) => t !== pairs[0].team_id)!;

    await expect(db.query(`update players set gender = 'M' where id = $1`, [locked])).rejects.toThrow('locked tournament pair');
    await expect(db.query('update players set team_id = $2 where id = $1', [locked, otherTeam])).rejects.toThrow(
      'locked tournament pair',
    );
    await expect(db.query('update players set team_id = null, checked_in_at = null where id = $1', [locked])).rejects.toThrow(
      'locked tournament pair',
    );
    await expect(db.query('delete from players where id = $1', [locked])).rejects.toThrow('bracket_pairs');
    await db.query(`update players set name = 'Renamed', skill = 'B' where id = $1`, [locked]);

    await db.query(`select reset_bracket('F')`);
    await db.query('update players set team_id = $2 where id = $1', [locked, otherTeam]);
    await db.query('delete from players where id = $1', [locked]);
  });
});
