import type { SupabaseClient } from '@supabase/supabase-js';
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
} from '../domain/types';
import { normalizeName } from '../domain/roster';
import type { AuthClient, Repo } from './repo';

const DB_TABLE: Record<TableName, string> = {
  players: 'players',
  results: 'results',
  pairs: 'bracket_pairs',
  matches: 'bracket_matches',
};

type Row = Record<string, unknown>;

const toPlayer = (r: Row): Player => ({
  id: r.id as string,
  name: r.name as string,
  gender: r.gender as Player['gender'],
  skill: r.skill as Player['skill'],
  checkedInAt: (r.checked_in_at as string | null) ?? null,
  teamId: (r.team_id as TeamId | null) ?? null,
});

const toResult = (r: Row): GameResult => ({
  id: r.id as string,
  playerId: r.player_id as string,
  outcome: r.outcome as Outcome,
  createdAt: r.created_at as string,
  simulated: Boolean(r.simulated),
});

const toPair = (r: Row): BracketPair => ({
  gender: r.gender as Gender,
  slot: r.slot as number,
  teamId: r.team_id as TeamId,
  player1Id: r.player1_id as string,
  player2Id: r.player2_id as string,
});

const toMatch = (r: Row): BracketMatch => ({
  gender: r.gender as Gender,
  match: r.match as MatchKey,
  winnerSlot: r.winner_slot as number,
});

type DbError = { message: string; code?: string; details?: string };

/** Turns database errors into messages the organizer can act on. */
function friendly(error: DbError): Error {
  if (error.code === '23505' && /name/.test(`${error.message} ${error.details ?? ''}`)) {
    return new Error('There’s already a player with that name. Add an initial to tell them apart.');
  }
  if (error.code === '23503' && /bracket_pairs/.test(error.message)) {
    return new Error('That player is in a locked tournament pair. Reset that bracket on the Tournament tab first.');
  }
  return new Error(error.message);
}

function unwrap<T>({ data, error }: { data: T | null; error: DbError | null }): T {
  if (error) throw friendly(error);
  return data as T;
}

export function createSupabaseRepo(db: SupabaseClient): Repo {
  async function fetchTable<T extends TableName>(table: T): Promise<Snapshot[T]> {
    switch (table) {
      case 'players':
        return unwrap(await db.from('players').select('id, name, gender, skill, checked_in_at, team_id').order('name')).map(
          toPlayer,
        ) as Snapshot[T];
      case 'results':
        return unwrap(await db.from('results').select('id, player_id, outcome, created_at, simulated').order('created_at')).map(
          toResult,
        ) as Snapshot[T];
      case 'pairs':
        return unwrap(await db.from('bracket_pairs').select('*')).map(toPair) as Snapshot[T];
      case 'matches':
        return unwrap(await db.from('bracket_matches').select('*')).map(toMatch) as Snapshot[T];
    }
    throw new Error(`Unknown table ${String(table)}`);
  }

  return {
    fetchTable,

    async addPlayer(draft) {
      const row = unwrap(
        await db
          .from('players')
          .insert({ name: normalizeName(draft.name), gender: draft.gender, skill: draft.skill })
          .select('id, name, gender, skill, checked_in_at, team_id')
          .single(),
      );
      return toPlayer(row as unknown as Row);
    },

    async updatePlayer(playerId, draft) {
      unwrap(
        await db
          .from('players')
          .update({ name: normalizeName(draft.name), gender: draft.gender, skill: draft.skill })
          .eq('id', playerId),
      );
    },

    async deletePlayer(playerId) {
      unwrap(await db.from('players').delete().eq('id', playerId));
    },

    async fetchAll() {
      const [players, results, pairs, matches] = await Promise.all([
        fetchTable('players'),
        fetchTable('results'),
        fetchTable('pairs'),
        fetchTable('matches'),
      ]);
      return { players, results, pairs, matches };
    },

    subscribe(onChange) {
      const channel = db.channel('event-data');
      for (const [table, dbTable] of Object.entries(DB_TABLE) as [TableName, string][]) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table: dbTable }, () => onChange(table));
      }
      channel.subscribe();
      return () => {
        void db.removeChannel(channel);
      };
    },

    async checkIn(playerId) {
      return unwrap(await db.rpc('check_in_player', { p_player_id: playerId })) as TeamId;
    },

    async undoCheckIn(playerId) {
      unwrap(await db.from('players').update({ checked_in_at: null, team_id: null }).eq('id', playerId));
    },

    async moveToTeam(playerId, teamId) {
      unwrap(await db.from('players').update({ team_id: teamId }).eq('id', playerId).not('checked_in_at', 'is', null));
    },

    async addResult(playerId, outcome) {
      const row = unwrap(
        await db.from('results').insert({ player_id: playerId, outcome }).select('id, player_id, outcome, created_at, simulated').single(),
      );
      return toResult(row as unknown as Row);
    },

    async deleteResult(resultId) {
      unwrap(await db.from('results').delete().eq('id', resultId));
    },

    async addSimulatedResults(entries) {
      if (entries.length === 0) return 0;
      unwrap(
        await db
          .from('results')
          .insert(entries.map((e) => ({ player_id: e.playerId, outcome: e.outcome, simulated: true }))),
      );
      return entries.length;
    },

    async clearSimulatedResults() {
      const rows = unwrap(await db.from('results').delete().eq('simulated', true).select('id'));
      return (rows as unknown[]).length;
    },

    async setBracketPairs(gender, pairs) {
      unwrap(
        await db.rpc('set_bracket_pairs', {
          p_gender: gender,
          p_pairs: pairs.map((p) => ({ slot: p.slot, team_id: p.teamId, player1_id: p.player1Id, player2_id: p.player2Id })),
        }),
      );
    },

    async setMatchWinner(gender, match, winnerSlot) {
      unwrap(await db.rpc('set_match_winner', { p_gender: gender, p_match: match, p_winner_slot: winnerSlot }));
    },

    async resetBracket(gender) {
      unwrap(await db.rpc('reset_bracket', { p_gender: gender }));
    },
  };
}

export function createSupabaseAuth(db: SupabaseClient): AuthClient {
  return {
    async getSession() {
      const { data } = await db.auth.getSession();
      return data.session ? { email: data.session.user.email ?? '' } : null;
    },
    async signIn(email, password) {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error(
          error.message === 'Invalid login credentials' ? 'That email and password don’t match an organizer account.' : error.message,
        );
      }
    },
    async signOut() {
      const { error } = await db.auth.signOut();
      if (error) throw new Error(error.message);
    },
    onChange(cb) {
      const { data } = db.auth.onAuthStateChange((_event, session) =>
        cb(session ? { email: session.user.email ?? '' } : null),
      );
      return () => data.subscription.unsubscribe();
    },
  };
}
