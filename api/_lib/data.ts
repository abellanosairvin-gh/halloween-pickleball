import type {
  BracketId,
  BracketMatch,
  BracketPair,
  CostumeEntrant,
  CostumePick,
  CostumeVote,
  CostumeVoting,
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

export const TABLES: readonly TableName[] = [
  'players',
  'results',
  'pairs',
  'matches',
  'entrants',
  'votes',
  'picks',
  'voting',
];
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
});

const toPair = (r: Row): BracketPair => ({
  bracket: r.bracket as BracketId,
  slot: Number(r.slot),
  teamId: (r.team_id as TeamId | null) ?? null,
  player1Id: String(r.player1_id),
  player2Id: String(r.player2_id),
});

const toMatch = (r: Row): BracketMatch => ({
  bracket: r.bracket as BracketId,
  match: r.match as MatchKey,
  winnerSlot: Number(r.winner_slot),
});

const toEntrant = (r: Row): CostumeEntrant => ({
  id: String(r.id),
  playerId: r.player_id === null ? null : String(r.player_id),
  guestName: r.guest === null ? null : String(r.guest),
  guestGender: (r.guest_gender as Gender | null) ?? null,
});

const toVote =
  (organizer: boolean) =>
  (r: Row): CostumeVote => ({
    voterId: String(r.voter_id),
    gender: r.gender as Gender,
    entrantId: organizer ? String(r.entrant_id) : null,
  });

const toPick = (r: Row): CostumePick => ({ gender: r.gender as Gender, entrantId: String(r.entrant_id) });

const PLAYER_COLUMNS = 'id, name, gender, skill, checked_in_at, team_id';
const RESULT_COLUMNS = 'id, player_id, outcome, created_at';
const ENTRANT_COLUMNS = 'id, player_id, guest, guest_gender';

/** `organizer` is true for the organizer's session: only they see who each costume vote went to. */
const READ: { [T in TableName]: (q: Query, organizer: boolean) => Promise<Snapshot[T]> } = {
  players: async (q) => (await q(`select ${PLAYER_COLUMNS} from players order by name`)).map(toPlayer),
  results: async (q) => (await q(`select ${RESULT_COLUMNS} from results order by created_at, id`)).map(toResult),
  pairs: async (q) => (await q('select bracket, slot, team_id, player1_id, player2_id from bracket_pairs')).map(toPair),
  matches: async (q) => (await q('select bracket, match, winner_slot from bracket_matches')).map(toMatch),
  entrants: async (q) =>
    (await q(`select ${ENTRANT_COLUMNS} from costume_entrants order by created_at, id`)).map(toEntrant),
  votes: async (q, organizer) =>
    (
      await q(
        'select coalesce(voter_player_id, voter_entrant_id) as voter_id, gender, entrant_id from costume_votes order by created_at',
      )
    ).map(toVote(organizer)),
  picks: async (q) => (await q('select gender, entrant_id from costume_picks')).map(toPick),
  voting: async (q): Promise<CostumeVoting> => {
    const rows = await q('select opened_at from costume_voting');
    return { open: rows[0]?.opened_at != null };
  },
};

export async function readVersions(q: Query): Promise<Versions> {
  const rows = await q('select name, version from table_versions');
  return Object.fromEntries(rows.map((r) => [r.name, Number(r.version)])) as Versions;
}

/**
 * The requested tables plus the change counters read just before them, so a client that polls
 * the counters afterwards never misses a change (at worst it refetches once more than needed).
 */
export async function readState(q: Query, tables: readonly TableName[], organizer = false) {
  const versions = await readVersions(q);
  const data: Partial<Snapshot> = {};
  await Promise.all(
    tables.map(async (t) => {
      (data as Record<TableName, unknown>)[t] = await READ[t](q, organizer);
    }),
  );
  return { versions, data };
}

export async function checkIn(q: Query, playerId: unknown): Promise<TeamId> {
  const rows = await q('select check_in_player($1) as team', [text(playerId, 'playerId')]);
  return rows[0].team as TeamId;
}

/** A Best in Costume vote. Open to everyone; the database refuses a second vote by the same voter. */
export async function castVotes(q: Query, voterId: unknown, femaleId: unknown, maleId: unknown): Promise<void> {
  const pick = (value: unknown, field: string) => (value === null || value === undefined ? null : text(value, field));
  await q('select cast_costume_votes($1, $2, $3)', [
    text(voterId, 'voterId'),
    pick(femaleId, 'femaleId'),
    pick(maleId, 'maleId'),
  ]);
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
const BRACKETS = ['F', 'M', 'X'] as const;
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

  async setBracketPairs(q, a) {
    if (!Array.isArray(a.pairs)) throw new BadRequest('Missing pairs.');
    const pairs = a.pairs.map((p: Args) => ({
      slot: p.slot,
      team_id: p.teamId,
      player1_id: p.player1Id,
      player2_id: p.player2Id,
    }));
    await q('select set_bracket_pairs($1, $2::jsonb)', [oneOf(a.bracket, 'bracket', BRACKETS), JSON.stringify(pairs)]);
    return null;
  },

  async setMatchWinner(q, a) {
    const slot = a.winnerSlot === null ? null : Number(a.winnerSlot);
    if (slot !== null && !Number.isInteger(slot)) throw new BadRequest('Unknown winnerSlot.');
    await q('select set_match_winner($1, $2, $3::smallint)', [
      oneOf(a.bracket, 'bracket', BRACKETS),
      oneOf(a.match, 'match', MATCHES),
      slot,
    ]);
    return null;
  },

  async resetBracket(q, a) {
    await q('select reset_bracket($1)', [oneOf(a.bracket, 'bracket', BRACKETS)]);
    return null;
  },

  async addCostumePlayer(q, a) {
    const rows = await q(`insert into costume_entrants (player_id) values ($1) returning ${ENTRANT_COLUMNS}`, [
      text(a.playerId, 'playerId'),
    ]);
    return toEntrant(rows[0]);
  },

  async addCostumeGuest(q, a) {
    const name = cleanName(a.name);
    if (name.length > 40) throw new BadRequest('Keep the name under 40 characters.');
    // A guest who shares a player's name is almost always that player: add them from the player list instead.
    const rows = await q(
      `insert into costume_entrants (guest, guest_gender)
       select $1, $2 where not exists (select 1 from players where lower(name) = lower($1))
       returning ${ENTRANT_COLUMNS}`,
      [name, oneOf(a.gender, 'gender', GENDERS)],
    );
    if (rows.length === 0) throw new BadRequest(`${name} is on the player list. Add them from there.`);
    return toEntrant(rows[0]);
  },

  async removeCostumeEntrant(q, a) {
    await q('delete from costume_entrants where id = $1', [text(a.entrantId, 'entrantId')]);
    return null;
  },

  /** Clears a voter's votes so they can vote again, e.g. when someone else voted in their name. */
  async clearCostumeVotes(q, a) {
    await q('delete from costume_votes where coalesce(voter_player_id, voter_entrant_id) = $1', [
      text(a.voterId, 'voterId'),
    ]);
    return null;
  },

  async setCostumeVoting(q, a) {
    if (typeof a.open !== 'boolean') throw new BadRequest('Missing open.');
    await q('select set_costume_voting($1)', [a.open]);
    return null;
  },

  async setCostumePick(q, a) {
    const gender = oneOf(a.gender, 'gender', GENDERS);
    if (a.entrantId === null || a.entrantId === undefined) {
      await q('delete from costume_picks where gender = $1', [gender]);
    } else {
      await q(
        `insert into costume_picks (gender, entrant_id) values ($1, $2)
         on conflict (gender) do update set entrant_id = excluded.entrant_id`,
        [gender, text(a.entrantId, 'entrantId')],
      );
    }
    return null;
  },
};
