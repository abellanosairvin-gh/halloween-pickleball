import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { TEAM_IDS } from '../src/domain/teams';
import { bucketSpreads, seededRandom, shuffled } from './fixtures';

// Every migration, applied in file-name order, the same way Supabase applies them.
const migrations = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8'));
const seed = readFileSync('supabase/seed.sql', 'utf8');

type PlayerRow = { id: string; name: string; gender: string; skill: string; team_id: string | null };

let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  // Roles and default grants that exist in every Supabase project; the migrations' revokes and
  // row-level security are what actually restrict them.
  await db.exec(`
    create role anon; create role authenticated;
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
  `);
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
    await expect(checkIn('00000000-0000-0000-0000-000000000000')).rejects.toThrow('Player not found');
  });

  it('refuses a team without a check-in', async () => {
    const [p] = await players();
    await expect(db.query(`update players set team_id = 'bat' where id = $1`, [p.id])).rejects.toThrow();
  });
});

describe('player_stats', () => {
  it('reports wins, losses and win rate', async () => {
    const [p] = await players();
    await db.query(`insert into results (player_id, outcome) values ($1,'W'),($1,'W'),($1,'L')`, [p.id]);
    const { rows } = await db.query<{ wins: number; losses: number; win_rate: string }>(
      'select wins::int, losses::int, win_rate::text from player_stats where player_id = $1',
      [p.id],
    );
    expect(rows[0]).toEqual({ wins: 2, losses: 1, win_rate: '0.6667' });
  });
});

describe('brackets', () => {
  beforeEach(async () => {
    for (const p of await players()) await checkIn(p.id);
  });

  it('locks four valid pairs and plays through to a champion', async () => {
    await db.query('select set_bracket_pairs($1, $2)', ['F', JSON.stringify(await lockedPairs('F'))]);
    await db.query(`select set_match_winner('F', 'semi1', 1::smallint)`);
    await db.query(`select set_match_winner('F', 'semi2', 2::smallint)`);
    await db.query(`select set_match_winner('F', 'final', 2::smallint)`);
    const { rows } = await db.query<{ match: string; winner_slot: number }>(
      `select match, winner_slot from bracket_matches where gender = 'F' order by match`,
    );
    expect(rows).toEqual([
      { match: 'final', winner_slot: 2 },
      { match: 'semi1', winner_slot: 1 },
      { match: 'semi2', winner_slot: 2 },
    ]);
  });

  it('rejects pairs that mix teams or genders', async () => {
    const pairs = await lockedPairs('F');
    const man = (await players()).find((p) => p.gender === 'M' && p.team_id === pairs[0].team_id)!;
    pairs[0].player2_id = man.id;
    await expect(db.query('select set_bracket_pairs($1, $2)', ['F', JSON.stringify(pairs)])).rejects.toThrow(
      'checked-in women',
    );
  });

  it('rejects a pair with a player under 4 recorded games', async () => {
    const pairs = await lockedPairs('F', 3);
    await expect(db.query('select set_bracket_pairs($1, $2)', ['F', JSON.stringify(pairs)])).rejects.toThrow(
      'at least 4 recorded games',
    );
    await recordGames(pairs[0].player1_id, 1);
    await expect(db.query('select set_bracket_pairs($1, $2)', ['F', JSON.stringify(pairs)])).rejects.toThrow(
      'at least 4 recorded games',
    );
    for (const p of pairs) {
      await recordGames(p.player1_id, 1);
      await recordGames(p.player2_id, 1);
    }
    await db.query('select set_bracket_pairs($1, $2)', ['F', JSON.stringify(pairs)]);
  });

  it('refuses a redraw once a result is in, and allows it after a reset', async () => {
    const pairs = JSON.stringify(await lockedPairs('M'));
    await db.query('select set_bracket_pairs($1, $2)', ['M', pairs]);
    await db.query(`select set_match_winner('M', 'semi1', 0::smallint)`);
    await expect(db.query('select set_bracket_pairs($1, $2)', ['M', pairs])).rejects.toThrow('Reset it');
    await db.query(`select reset_bracket('M')`);
    await db.query('select set_bracket_pairs($1, $2)', ['M', pairs]);
  });

  it('validates winners and drops a stale final when a semifinal changes', async () => {
    await db.query('select set_bracket_pairs($1, $2)', ['F', JSON.stringify(await lockedPairs('F'))]);
    await expect(db.query(`select set_match_winner('F', 'semi1', 2::smallint)`)).rejects.toThrow('not in this match');
    await db.query(`select set_match_winner('F', 'semi1', 0::smallint)`);
    await expect(db.query(`select set_match_winner('F', 'final', 0::smallint)`)).rejects.toThrow('Finish both');
    await db.query(`select set_match_winner('F', 'semi2', 3::smallint)`);
    await db.query(`select set_match_winner('F', 'final', 0::smallint)`);
    await db.query(`select set_match_winner('F', 'semi1', 1::smallint)`);
    const { rows } = await db.query(`select 1 from bracket_matches where gender = 'F' and match = 'final'`);
    expect(rows).toHaveLength(0);
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

describe('simulated results', () => {
  it('are flagged, count toward stats, and clear without touching hand-entered results', async () => {
    const [p] = await players();
    await db.query(`insert into results (player_id, outcome) values ($1, 'W')`, [p.id]);
    await db.query(`insert into results (player_id, outcome, simulated) values ($1, 'L', true), ($1, 'L', true)`, [p.id]);
    const stats = async () =>
      (await db.query<{ games: number }>('select games::int from player_stats where player_id = $1', [p.id])).rows[0].games;
    expect(await stats()).toBe(3);
    await db.query('delete from results where simulated');
    expect(await stats()).toBe(1);
  });
});

describe('anonymous visitors (party page)', () => {
  const asAnon = async <T,>(fn: () => Promise<T>) => {
    await db.exec('set role anon');
    try {
      return await fn();
    } finally {
      await db.exec('reset role');
    }
  };

  beforeEach(async () => {
    const all = await players();
    for (const p of all) await checkIn(p.id);
    await recordGames(all[0].id, 3);
  });

  it('can read everything the party page shows', async () => {
    await asAnon(async () => {
      expect((await db.query('select id, name, gender, team_id from players')).rows).toHaveLength(40);
      expect((await db.query('select player_id, outcome from results')).rows).toHaveLength(3);
      expect((await db.query('select * from teams')).rows).toHaveLength(4);
      await db.query('select * from bracket_pairs');
      await db.query('select * from bracket_matches');
      await db.query('select * from player_stats');
    });
  });

  it('can check themselves in', async () => {
    const [p] = await players();
    await db.query('update players set team_id = null, checked_in_at = null where id = $1', [p.id]);
    const team = await asAnon(() => checkIn(p.id));
    expect(TEAM_IDS).toContain(team);
  });

  it('cannot change anything else', async () => {
    const [p] = await players();
    const attempts = [
      ["insert into results (player_id, outcome) values ($1, 'W')", [p.id]],
      ['delete from results', []],
      ["update players set team_id = 'bat' where id = $1", [p.id]],
      ['update players set team_id = null, checked_in_at = null where id = $1', [p.id]],
      ["insert into players (name, gender, skill) values ('Intruder', 'M', 'A')", []],
      ['delete from players where id = $1', [p.id]],
      ["select set_bracket_pairs('F', '[]'::jsonb)", []],
      ["select set_match_winner('F', 'semi1', 0::smallint)", []],
      ["select reset_bracket('F')", []],
    ] as const;
    for (const [sql, params] of attempts) {
      await expect(asAnon(() => db.query(sql, [...params])), sql).rejects.toThrow(/permission denied/);
    }
    const after = await players();
    expect(after.find((x) => x.id === p.id)?.team_id).not.toBeNull();
    expect((await db.query('select 1 from results')).rows).toHaveLength(3);
  });
});
