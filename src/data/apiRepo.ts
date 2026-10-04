import { normalizeName } from '../domain/roster';
import type { Snapshot, TableName, TeamId } from '../domain/types';
import type { AuthClient, Repo } from './repo';

const TABLES: TableName[] = ['players', 'results', 'pairs', 'matches'];
type Versions = Record<TableName, number>;

/** How often an open page checks for changes made elsewhere. Paused while the page is hidden. */
const POLL_MS = 3000;

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init?.method ?? 'GET',
      headers: init?.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new Error('Couldn’t reach the server. Check the connection and try again.');
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? `The server answered ${response.status}. Try again.`);
  return data as T;
}

export function createApiRepo(): Repo {
  /** Change counters as of the data this page holds. */
  const known: Partial<Versions> = {};
  const remember = (versions: Partial<Versions>) => {
    for (const t of TABLES) {
      const v = versions[t];
      if (v !== undefined) known[t] = Math.max(known[t] ?? 0, v);
    }
  };

  async function fetchTables(tables: TableName[]): Promise<Partial<Snapshot>> {
    const { versions, data } = await call<{ versions: Versions; data: Partial<Snapshot> }>(
      `/api/state?tables=${tables.join(',')}`,
    );
    remember(Object.fromEntries(tables.map((t) => [t, versions[t]])));
    return data;
  }

  const act = async <T>(action: string, args: Record<string, unknown> = {}) =>
    (await call<{ result: T }>('/api/organizer', { method: 'POST', body: { action, args } })).result;

  return {
    async fetchAll() {
      return (await fetchTables(TABLES)) as Snapshot;
    },

    async fetchTable(table) {
      return (await fetchTables([table]))[table]!;
    },

    subscribe(onChange) {
      let timer: number | undefined;
      let stopped = false;

      const poll = async () => {
        window.clearTimeout(timer);
        if (stopped || document.visibilityState !== 'visible') return;
        try {
          const latest = await call<Versions>('/api/versions');
          for (const t of TABLES) {
            if (known[t] !== undefined && latest[t] > known[t]!) onChange(t);
          }
        } catch {
          // Offline for a moment; the next poll catches up.
        }
        if (!stopped) timer = window.setTimeout(poll, POLL_MS);
      };
      const onVisible = () => void poll();

      document.addEventListener('visibilitychange', onVisible);
      timer = window.setTimeout(poll, POLL_MS);
      return () => {
        stopped = true;
        window.clearTimeout(timer);
        document.removeEventListener('visibilitychange', onVisible);
      };
    },

    addPlayer: (draft) => act('addPlayer', { ...draft, name: normalizeName(draft.name) }),
    updatePlayer: (playerId, draft) => act('updatePlayer', { playerId, ...draft, name: normalizeName(draft.name) }),
    deletePlayer: (playerId) => act('deletePlayer', { playerId }),

    async checkIn(playerId) {
      return (await call<{ teamId: TeamId }>('/api/check-in', { method: 'POST', body: { playerId } })).teamId;
    },
    undoCheckIn: (playerId) => act('undoCheckIn', { playerId }),
    moveToTeam: (playerId, teamId) => act('moveToTeam', { playerId, teamId }),

    addResult: (playerId, outcome) => act('addResult', { playerId, outcome }),
    deleteResult: (resultId) => act('deleteResult', { resultId }),
    addSimulatedResults: (entries) => act('addSimulatedResults', { entries }),
    clearSimulatedResults: () => act('clearSimulatedResults'),

    setBracketPairs: (gender, pairs) => act('setBracketPairs', { gender, pairs }),
    setMatchWinner: (gender, match, winnerSlot) => act('setMatchWinner', { gender, match, winnerSlot }),
    resetBracket: (gender) => act('resetBracket', { gender }),
  };
}

export function createApiAuth(): AuthClient {
  const listeners = new Set<(signedIn: boolean) => void>();
  const emit = (signedIn: boolean) => listeners.forEach((l) => l(signedIn));
  return {
    async isSignedIn() {
      return (await call<{ signedIn: boolean }>('/api/session')).signedIn;
    },
    async signIn(password) {
      await call('/api/session', { method: 'POST', body: { password } });
      emit(true);
    },
    async signOut() {
      await call('/api/session', { method: 'DELETE' });
      emit(false);
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
