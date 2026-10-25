import { normalizeName } from '../domain/roster';
import { type BallotStatus, type Snapshot, TABLE_NAMES, type TableName, type TeamId } from '../domain/types';
import type { AuthClient, Repo } from './repo';

const TABLES = TABLE_NAMES;
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

/** `onNotOrganizer` runs whenever the server answers a read as a guest: the organizer's session may have ended. */
export function createApiRepo(onNotOrganizer: () => void = () => {}): Repo {
  /** Change counters as of the data this page holds. */
  const known: Partial<Versions> = {};
  const remember = (versions: Partial<Versions>) => {
    for (const t of TABLES) {
      const v = versions[t];
      if (v !== undefined) known[t] = Math.max(known[t] ?? 0, v);
    }
  };

  async function fetchTables(tables: TableName[]): Promise<Partial<Snapshot>> {
    const { versions, data, organizer } = await call<{ versions: Versions; data: Partial<Snapshot>; organizer: boolean }>(
      `/api/state?tables=${tables.join(',')}`,
    );
    if (!organizer) onNotOrganizer();
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

    setBracketPairs: (bracket, pairs) => act('setBracketPairs', { bracket, pairs }),
    setMatchWinner: (bracket, match, winnerSlot) => act('setMatchWinner', { bracket, match, winnerSlot }),
    resetBracket: (bracket) => act('resetBracket', { bracket }),

    async castVotes(voterId, femaleId, maleId, token) {
      return (await call<{ token: string }>('/api/vote', { method: 'POST', body: { voterId, femaleId, maleId, token } }))
        .token;
    },
    async ballotStatus(token) {
      return (await call<{ ballot: BallotStatus | null }>('/api/ballot', { method: 'POST', body: { token } })).ballot;
    },
    addCostumePlayer: (playerId) => act('addCostumePlayer', { playerId }),
    addCostumeGuest: (name, gender) => act('addCostumeGuest', { name: normalizeName(name), gender }),
    async setCostumePhoto(entrantId, image) {
      await act('setCostumePhoto', { entrantId, image });
    },
    removeCostumeEntrant: (entrantId) => act('removeCostumeEntrant', { entrantId }),
    clearCostumeVotes: (voterId) => act('clearCostumeVotes', { voterId }),
    setCostumeVoting: (open) => act('setCostumeVoting', { open }),
    setCostumePick: (gender, entrantId) => act('setCostumePick', { gender, entrantId }),
  };
}

export function createApiAuth(): AuthClient & { sessionEnded: () => void } {
  const listeners = new Set<(signedIn: boolean) => void>();
  let signedIn = false;
  const emit = (value: boolean) => {
    signedIn = value;
    listeners.forEach((l) => l(value));
  };
  return {
    async isSignedIn() {
      signedIn = (await call<{ signedIn: boolean }>('/api/session')).signedIn;
      return signedIn;
    },
    /** A read came back as a guest's while signed in: the session expired or was signed out in another tab. */
    sessionEnded() {
      if (signedIn) emit(false);
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
