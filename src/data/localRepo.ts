import { pickTeam } from '../domain/assign';
import { applyWinner, validWinners, buildBracket } from '../domain/bracket';
import { lockedPairMessage, lockedPairPlayerIds, nameProblem, normalizeName } from '../domain/roster';
import { isPairEligible, MIN_PAIR_GAMES, playerRecords } from '../domain/standings';
import type { Player, Snapshot, TableName } from '../domain/types';
import type { AuthClient, Repo, Session } from './repo';
import { SEED_PLAYERS } from './seedPlayers';

/**
 * Demo-mode storage: everything lives in this browser's localStorage, and a BroadcastChannel
 * stands in for realtime so other tabs stay in sync. Used when no Supabase project is configured.
 */

const STORE_KEY = 'hpp-demo-store-v1';
const SESSION_KEY = 'hpp-demo-session-v1';
export const DEMO_PASSWORD = 'boo';

function seedSnapshot(): Snapshot {
  return {
    players: SEED_PLAYERS.map((p, i) => ({
      id: `p${String(i + 1).padStart(2, '0')}`,
      ...p,
      checkedInAt: null,
      teamId: null,
    })),
    results: [],
    pairs: [],
    matches: [],
  };
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode): keep working in memory for this tab.
  }
}

function openChannel(name: string): BroadcastChannel | null {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name);
}

/** Mirrors the players_guard_locked_pair trigger and the bracket_pairs foreign keys. */
function guardLocked(s: Snapshot, player: Player) {
  if (lockedPairPlayerIds(s.pairs).has(player.id)) throw new Error(lockedPairMessage(player.name));
}

export function createLocalRepo(): Repo {
  let memory: Snapshot | null = null;
  const listeners = new Set<(t: TableName) => void>();
  const channel = openChannel('hpp-demo-data');

  channel?.addEventListener('message', (e: MessageEvent<TableName>) => {
    memory = null;
    listeners.forEach((l) => l(e.data));
  });

  function read(): Snapshot {
    if (memory) return memory;
    const raw = safeGet(STORE_KEY);
    memory = raw ? (JSON.parse(raw) as Snapshot) : seedSnapshot();
    return memory;
  }

  function write(next: Snapshot, changed: TableName[]) {
    memory = next;
    safeSet(STORE_KEY, JSON.stringify(next));
    for (const t of changed) {
      channel?.postMessage(t);
      listeners.forEach((l) => l(t));
    }
  }

  const clone = (): Snapshot => structuredClone(read());
  const tick = () => new Promise((r) => setTimeout(r, 0));

  return {
    async fetchAll() {
      return clone();
    },
    async fetchTable(table) {
      return clone()[table];
    },
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },

    async addPlayer(draft) {
      const s = clone();
      const problem = nameProblem(draft.name, s.players);
      if (problem) throw new Error(problem);
      const player = { id: crypto.randomUUID(), ...draft, name: normalizeName(draft.name), checkedInAt: null, teamId: null };
      s.players.push(player);
      write(s, ['players']);
      return player;
    },

    async updatePlayer(playerId, draft) {
      const s = clone();
      const player = s.players.find((p) => p.id === playerId);
      if (!player) throw new Error('Player not found');
      const problem = nameProblem(draft.name, s.players, playerId);
      if (problem) throw new Error(problem);
      if (draft.gender !== player.gender) guardLocked(s, player);
      Object.assign(player, { ...draft, name: normalizeName(draft.name) });
      write(s, ['players']);
    },

    async deletePlayer(playerId) {
      const s = clone();
      const player = s.players.find((p) => p.id === playerId);
      if (!player) return;
      guardLocked(s, player);
      s.players = s.players.filter((p) => p.id !== playerId);
      s.results = s.results.filter((r) => r.playerId !== playerId);
      write(s, ['players', 'results']);
    },

    async checkIn(playerId) {
      await tick();
      const s = clone();
      const player = s.players.find((p) => p.id === playerId);
      if (!player) throw new Error('Player not found');
      if (player.teamId) return player.teamId;
      player.teamId = pickTeam(s.players, player);
      player.checkedInAt = new Date().toISOString();
      write(s, ['players']);
      return player.teamId;
    },

    async undoCheckIn(playerId) {
      const s = clone();
      const player = s.players.find((p) => p.id === playerId);
      if (player) {
        guardLocked(s, player);
        player.teamId = null;
        player.checkedInAt = null;
      }
      write(s, ['players']);
    },

    async moveToTeam(playerId, teamId) {
      const s = clone();
      const player = s.players.find((p) => p.id === playerId);
      if (player?.checkedInAt && player.teamId !== teamId) {
        guardLocked(s, player);
        player.teamId = teamId;
      }
      write(s, ['players']);
    },

    async addResult(playerId, outcome) {
      const s = clone();
      const result = { id: crypto.randomUUID(), playerId, outcome, createdAt: new Date().toISOString() };
      s.results.push(result);
      write(s, ['results']);
      return result;
    },

    async deleteResult(resultId) {
      const s = clone();
      s.results = s.results.filter((r) => r.id !== resultId);
      write(s, ['results']);
    },

    async setBracketPairs(gender, pairs) {
      const s = clone();
      if (s.matches.some((m) => m.gender === gender)) {
        throw new Error('Results are already recorded in this bracket. Reset it to change the pairs.');
      }
      if (pairs.length !== 4) throw new Error('A bracket needs exactly 4 pairs.');
      const valid = pairs.every((pair) =>
        [pair.player1Id, pair.player2Id].every((id) => {
          const p = s.players.find((x) => x.id === id);
          return p && p.teamId === pair.teamId && p.gender === gender;
        }),
      );
      if (!valid) throw new Error('Every pair must be two checked-in players from the same team.');
      const records = playerRecords(s.results);
      if (!pairs.every((pair) => isPairEligible(records, pair.player1Id) && isPairEligible(records, pair.player2Id))) {
        throw new Error(`Every player in a pair needs at least ${MIN_PAIR_GAMES} recorded games.`);
      }
      s.pairs = [...s.pairs.filter((p) => p.gender !== gender), ...pairs];
      write(s, ['pairs']);
    },

    async setMatchWinner(gender, match, winnerSlot) {
      const s = clone();
      const view = buildBracket(gender, s.pairs, s.matches);
      if (!view.locked) throw new Error('Lock the pairs before recording results.');
      if (winnerSlot !== null && !validWinners(view, match).includes(winnerSlot)) {
        throw new Error('That pair is not in this match.');
      }
      s.matches = [...s.matches.filter((m) => m.gender !== gender), ...applyWinner(gender, s.matches, match, winnerSlot)];
      write(s, ['matches']);
    },

    async resetBracket(gender) {
      const s = clone();
      s.pairs = s.pairs.filter((p) => p.gender !== gender);
      s.matches = s.matches.filter((m) => m.gender !== gender);
      write(s, ['pairs', 'matches']);
    },
  };
}

/** Clears demo data back to the spreadsheet roster. */
export function resetDemoData() {
  safeSet(STORE_KEY, null);
}

export function createLocalAuth(): AuthClient {
  const listeners = new Set<(s: Session | null) => void>();
  const current = (): Session | null => {
    const raw = safeGet(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  };
  const emit = () => listeners.forEach((l) => l(current()));
  return {
    async getSession() {
      return current();
    },
    async signIn(email, password) {
      if (password !== DEMO_PASSWORD) throw new Error(`In demo mode the password is “${DEMO_PASSWORD}”.`);
      safeSet(SESSION_KEY, JSON.stringify({ email }));
      emit();
    },
    async signOut() {
      safeSet(SESSION_KEY, null);
      emit();
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
