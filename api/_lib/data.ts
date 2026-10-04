import type {
  BracketMatch,
  BracketPair,
  GameResult,
  Gender,
  MatchKey,
  Outcome,
  Player,
  Snapshot,
  TableName,
  TeamId,
} from '../../src/domain/types';
import type { Query, Row } from './db.js';

/** A request the organizer's screens should never send; answered with 400. */
export class BadRequest extends Error {}

export const TABLES: readonly TableName[] = ['players', 'results', 'pairs', 'matches'];
export type Versions = Record<TableName, number>;

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v === null || v === undefined ? null : String(v));

const toPlayer = (r: Row): Player => ({
  id: String(r.id),
  name: String(r.name),
  gender: r.gender as Gender,
  skill: r.skill as Player['skill'],
  checkedInAt: iso(r.checked_in_at),
  teamId: (r.team_id as TeamId | null) ?? null,
});

const toResult = (r: Row): GameResult => ({
  id: String(r.id),
  playerId: String(r.player_id),
  outcome: r.outcome as Outcome,
  createdAt: iso(r.created_at) ?? '',
  simulated: Boolean(r.simulated),
});

const toPair = (r: Row): BracketPair => ({
  gender: r.gender as Gender,
  slot: Number(r.slot),
  teamId: r.team_id as TeamId,
  player1Id: String(r.player1_id),
  player2Id: String(r.player2_id),
});

const toMatch = (r: Row): BracketMatch => ({
  gender: r.gender as Gender,
  match: r.match as MatchKey,
  winnerSlot: Number(r.winner_slot),
});

const PLAYER_COLUMNS = 'id, name, gender, skill, checked_in_at, team_id';
const RESULT_COLUMNS = 'id, player_id, outcome, created_at, simulated';

const READ: { [T in TableName]: (q: Query) => Promise<Snapshot[T]> } = {
  players: async (q) => (await q(`select ${PLAYER_COLUMNS} from players order by name`)).map(toPlayer),
  results: async (q) => (await q(`select ${RESULT_COLUMNS} from results order by created_at, id`)).map(toResult),
  pairs: async (q) => (await q('select gender, slot, team_id, player1_id, player2_id from bracket_pairs')).map(toPair),
  matches: async (q) => (await q('select gender, match, winner_slot from bracket_matches')).map(toMatch),
};

export async function readVersions(q: Query): Promise<Versions> {
  const rows = await q('select name, version from table_versions');
  return Object.fromEntries(rows.map((r) => [r.name, Number(r.version)])) as Versions;
}

/**
 * The requested tables plus the change counters read just before them, so a client that polls
 * the counters afterwards never misses a change (at worst it refetches once more than needed).
 */
export async function readState(q: Query, tables: readonly TableName[]) {
  const versions = await readVersions(q);
  const data: Partial<Snapshot> = {};
  await Promise.all(
    tables.map(async (t) => {
      (data as Record<TableName, unknown>)[t] = await READ[t](q);
    }),
  );
  return { versions, data };
}

export async function checkIn(q: Query, playerId: unknown): Promise<TeamId> {
  const rows = await q('select check_in_player($1) as team', [text(playerId, 'playerId')]);
  return rows[0].team as TeamId;
}

// Argument checks: the database constraints are the real guard, these just give clear errors.
function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new BadRequest(`Missing ${field}.`);
  return value;
}

function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) throw new BadRequest(`Unknown ${field}.`);
  return value as T;
}

const GENDERS = ['F', 'M'] as const;
const SKILLS = ['A', 'B'] as const;
const OUTCOMES = ['W', 'L'] as const;
const MATCHES = ['semi1', 'semi2', 'final', 'third'] as const;

const cleanName = (value: unknown) => text(value, 'name').trim().replace(/\s+/g, ' ');

const notFound = () => new BadRequest('That player isn’t on the list any more. Refresh and try again.');

type Args = Record<string, unknown>;

/** Everything the organizer can change. Each runs as a single statement, so it's all-or-nothing. */
export const organizerActions: Record<string, (q: Query, a: Args) => Promise<unknown>> = {
  async addPlayer(q, a) {
    const rows = await q(`insert into players (name, gender, skill) values ($1, $2, $3) returning ${PLAYER_COLUMNS}`, [
      cleanName(a.name),
      oneOf(a.gender, 'gender', GENDERS),
      oneOf(a.skill, 'skill', SKILLS),
    ]);
    return toPlayer(rows[0]);
  },

  async updatePlayer(q, a) {
    const rows = await q('update players set name = $2, gender = $3, skill = $4 where id = $1 returning id', [
      text(a.playerId, 'playerId'),
      cleanName(a.name),
      oneOf(a.gender, 'gender', GENDERS),
      oneOf(a.skill, 'skill', SKILLS),
    ]);
    if (rows.length === 0) throw notFound();
    return null;
  },

  async deletePlayer(q, a) {
    await q('delete from players where id = $1', [text(a.playerId, 'playerId')]);
    return null;
  },

  async undoCheckIn(q, a) {
    await q('update players set checked_in_at = null, team_id = null where id = $1', [text(a.playerId, 'playerId')]);
    return null;
  },

  async moveToTeam(q, a) {
    const rows = await q('update players set team_id = $2 where id = $1 and checked_in_at is not null returning id', [
      text(a.playerId, 'playerId'),
      text(a.teamId, 'teamId'),
    ]);
    if (rows.length === 0) throw new BadRequest('Check this player in before moving them to a team.');
    return null;
  },

  async addResult(q, a) {
    const rows = await q(`insert into results (player_id, outcome) values ($1, $2) returning ${RESULT_COLUMNS}`, [
      text(a.playerId, 'playerId'),
      oneOf(a.outcome, 'outcome', OUTCOMES),
    ]);
    return toResult(rows[0]);
  },

  async deleteResult(q, a) {
    await q('delete from results where id = $1', [text(a.resultId, 'resultId')]);
    return null;
  },

  async addSimulatedResults(q, a) {
    const entries = a.entries;
    if (!Array.isArray(entries) || entries.length > 5000) throw new BadRequest('Unexpected simulated results.');
    if (entries.length === 0) return 0;
    const ids = entries.map((e: Args) => text(e.playerId, 'playerId'));
    const outcomes = entries.map((e: Args) => oneOf(e.outcome, 'outcome', OUTCOMES));
    const rows = await q(
      `with added as (
         insert into results (player_id, outcome, simulated)
         select player_id, outcome, true from unnest($1::uuid[], $2::text[]) as x(player_id, outcome)
         returning 1
       ) select count(*)::int as n from added`,
      [ids, outcomes],
    );
    return Number(rows[0].n);
  },

  async clearSimulatedResults(q) {
    const rows = await q(
      'with removed as (delete from results where simulated returning 1) select count(*)::int as n from removed',
    );
    return Number(rows[0].n);
  },

  async setBracketPairs(q, a) {
    if (!Array.isArray(a.pairs)) throw new BadRequest('Missing pairs.');
    const pairs = a.pairs.map((p: Args) => ({
      slot: p.slot,
      team_id: p.teamId,
      player1_id: p.player1Id,
      player2_id: p.player2Id,
    }));
    await q('select set_bracket_pairs($1, $2::jsonb)', [oneOf(a.gender, 'gender', GENDERS), JSON.stringify(pairs)]);
    return null;
  },

  async setMatchWinner(q, a) {
    const slot = a.winnerSlot === null ? null : Number(a.winnerSlot);
    if (slot !== null && !Number.isInteger(slot)) throw new BadRequest('Unknown winnerSlot.');
    await q('select set_match_winner($1, $2, $3::smallint)', [
      oneOf(a.gender, 'gender', GENDERS),
      oneOf(a.match, 'match', MATCHES),
      slot,
    ]);
    return null;
  },

  async resetBracket(q, a) {
    await q('select reset_bracket($1)', [oneOf(a.gender, 'gender', GENDERS)]);
    return null;
  },
};
