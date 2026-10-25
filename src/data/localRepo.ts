import { pickTeam } from '../domain/assign';
import {
  applyWinner,
  buildBracket,
  FIRST_ROUND,
  firstRoundWinners,
  isMixedDrawn,
  MIXED,
  validWinners,
} from '../domain/bracket';
import { lockedPairMessage, lockedPairPlayerIds, nameProblem, normalizeName } from '../domain/roster';
import { entrantGender, lineUp } from '../domain/costume';
import { isPairEligible, MIN_PAIR_GAMES, playerRecords } from '../domain/standings';
import type { BracketId, BracketMatch, BracketPair, Gender, Player, Snapshot, TableName } from '../domain/types';
import { clearBallot } from '../lib/ballotStore';
import type { AuthClient, Repo } from './repo';
import { SEED_PLAYERS } from './seedPlayers';

/**
 * Demo-mode storage: everything lives in this browser's localStorage, and a BroadcastChannel
 * stands in for realtime so other tabs stay in sync. Used when the site is built without a database.
 */

const STORE_KEY = 'hpp-demo-store-v1';

/** The stored snapshot plus each ballot's token, which only the phone that cast it gets back. */
type Store = Snapshot & { ballotTokens: Record<string, string> };
const SESSION_KEY = 'hpp-demo-session-v1';
export const DEMO_PASSWORD = 'boo';

function seedSnapshot(): Store {
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
    entrants: [],
    votes: [],
    picks: [],
    voting: { open: false, closed: false },
    ballots: [],
    ballotTokens: {},
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

const guestNames = (s: Store) => s.entrants.flatMap((e) => (e.guestName === null ? [] : [e.guestName]));

function openChannel(name: string): BroadcastChannel | null {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name);
}

/** Mirrors the ballot's cascading delete when its voter goes. */
function removeBallots(s: Store, voterIds: Set<string>) {
  s.ballots = s.ballots.filter((id) => !voterIds.has(id));
  for (const id of voterIds) delete s.ballotTokens[id];
}

/**
 * Mirrors the costume tables' cascading deletes: votes for these entrants and picks of them go, as do a
 * guest's own ballot and votes. Ballots of people who voted for them stay, so those voters can fill in the award.
 */
function removeEntrants(s: Store, ids: Set<string>) {
  s.entrants = s.entrants.filter((e) => !ids.has(e.id));
  s.votes = s.votes.filter((v) => !ids.has(v.voterId) && !ids.has(v.entrantId));
  s.picks = s.picks.filter((p) => !ids.has(p.entrantId));
  removeBallots(s, ids);
}

/** Mirrors the players_guard_locked_pair trigger and the bracket_pairs foreign keys. */
function guardLocked(s: Store, player: Player) {
  if (lockedPairPlayerIds(s.pairs).has(player.id)) throw new Error(lockedPairMessage(player.name));
}

export function createLocalRepo(): Repo {
  let memory: Store | null = null;
  const listeners = new Set<(t: TableName) => void>();
  const channel = openChannel('hpp-demo-data');

  channel?.addEventListener('message', (e: MessageEvent<TableName>) => {
    memory = null;
    listeners.forEach((l) => l(e.data));
  });

  function read(): Store {
    if (memory) return memory;
    const raw = safeGet(STORE_KEY);
    memory = raw ? (JSON.parse(raw) as Store) : seedSnapshot();
    // Stores saved before Best in Costume voting have no costume tables.
    memory.entrants = (memory.entrants ?? []).map((e) => ({ ...e, photoUrl: e.photoUrl ?? null }));
    memory.votes ??= [];
    memory.picks ??= [];
    const voting = memory.voting as Partial<Snapshot['voting']> | undefined;
    memory.voting = { open: voting?.open ?? false, closed: voting?.closed ?? false };
    memory.ballots ??= [...new Set(memory.votes.map((v) => v.voterId))];
    memory.ballotTokens ??= {};
    // Stores saved before mixed doubles named each bracket by gender and played a final in it.
    type Saved<T> = T & { gender?: Gender };
    const named = <T extends { bracket: BracketId }>({ gender, ...rest }: Saved<T>) =>
      ({ ...rest, bracket: rest.bracket ?? gender }) as T;
    memory.pairs = memory.pairs.map((p) => named<BracketPair>(p));
    memory.matches = memory.matches
      .map((m) => named<BracketMatch>(m))
      .filter((m) => m.bracket === MIXED || FIRST_ROUND.includes(m.match));
    return memory;
  }

  function write(next: Store, changed: TableName[]) {
    memory = next;
    safeSet(STORE_KEY, JSON.stringify(next));
    for (const t of changed) {
      channel?.postMessage(t);
      listeners.forEach((l) => l(t));
    }
  }

  const clone = (): Store => structuredClone(read());
  const tick = () => new Promise((r) => setTimeout(r, 0));

  return {
    async fetchAll() {
      const { ballotTokens: _tokens, ...snapshot } = clone();
      return snapshot;
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
      const problem = nameProblem(draft.name, s.players, undefined, guestNames(s));
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
      const problem = nameProblem(draft.name, s.players, playerId, guestNames(s));
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
      s.votes = s.votes.filter((v) => v.voterId !== playerId);
      removeBallots(s, new Set([playerId]));
      removeEntrants(s, new Set(s.entrants.filter((e) => e.playerId === playerId).map((e) => e.id)));
      write(s, ['players', 'results', 'entrants', 'votes', 'picks', 'ballots']);
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

    async setBracketPairs(bracket, pairs) {
      const s = clone();
      if (s.matches.some((m) => m.bracket === bracket)) {
        throw new Error('Results are already recorded in this bracket. Reset it to change the pairs.');
      }
      if (pairs.length !== 4) throw new Error('A bracket needs exactly 4 pairs.');
      if (bracket === MIXED) {
        if (s.matches.filter((m) => m.bracket !== MIXED).length !== 4) {
          throw new Error('Finish the women’s and men’s first round before drawing mixed doubles.');
        }
        const sameSet = (picked: string[], winners: string[]) =>
          picked.length === winners.length && new Set(picked).size === picked.length && picked.every((id) => winners.includes(id));
        if (
          !sameSet(pairs.map((p) => p.player1Id), firstRoundWinners('F', s.pairs, s.matches)) ||
          !sameSet(pairs.map((p) => p.player2Id), firstRoundWinners('M', s.pairs, s.matches))
        ) {
          throw new Error('Every mixed pair must be a woman and a man who won their first-round match.');
        }
      } else {
        const valid = pairs.every((pair) =>
          [pair.player1Id, pair.player2Id].every((id) => {
            const p = s.players.find((x) => x.id === id);
            return p && p.teamId === pair.teamId && p.gender === bracket;
          }),
        );
        if (!valid) throw new Error('Every pair must be two checked-in players from the same team.');
        const records = playerRecords(s.results);
        if (!pairs.every((pair) => isPairEligible(records, pair.player1Id) && isPairEligible(records, pair.player2Id))) {
          throw new Error(`Every player in a pair needs at least ${MIN_PAIR_GAMES} recorded games.`);
        }
      }
      s.pairs = [...s.pairs.filter((p) => p.bracket !== bracket), ...pairs];
      write(s, ['pairs']);
    },

    async setMatchWinner(bracket, match, winnerSlot) {
      const s = clone();
      const view = buildBracket(bracket, s.pairs, s.matches);
      if (!view.locked) throw new Error('Lock the pairs before recording results.');
      if (bracket !== MIXED) {
        if (!FIRST_ROUND.includes(match)) {
          throw new Error('The women’s and men’s brackets play one round. The final is in mixed doubles.');
        }
        if (isMixedDrawn(s.pairs)) {
          throw new Error('Mixed doubles is already drawn from these results. Reset mixed doubles to change them.');
        }
      }
      if (winnerSlot !== null && !validWinners(view, match).includes(winnerSlot)) {
        throw new Error('That pair is not in this match.');
      }
      s.matches = [...s.matches.filter((m) => m.bracket !== bracket), ...applyWinner(bracket, s.matches, match, winnerSlot)];
      write(s, ['matches']);
    },

    async resetBracket(bracket) {
      const s = clone();
      if (bracket !== MIXED && isMixedDrawn(s.pairs)) {
        throw new Error('Reset mixed doubles first. Its pairs come from this bracket.');
      }
      s.pairs = s.pairs.filter((p) => p.bracket !== bracket);
      s.matches = s.matches.filter((m) => m.bracket !== bracket);
      write(s, ['pairs', 'matches']);
    },

    async castVotes(voterId, femaleId, maleId, token) {
      await tick();
      const s = clone();
      if (!s.voting.open) throw new Error('Voting isn’t open right now. Check back when the organizer opens it.');
      const voter =
        s.players.find((p) => p.id === voterId)?.name ??
        s.entrants.find((e) => e.id === voterId && e.guestName !== null)?.guestName;
      if (!voter) throw new Error('Your name isn’t on the list any more. Refresh and try again.');
      const picks = (
        [
          ['F', femaleId],
          ['M', maleId],
        ] as const
      ).filter((pick): pick is readonly [Gender, string] => pick[1] !== null);
      if (picks.length === 0) throw new Error('Pick who gets your vote.');
      const existing = s.ballotTokens[voterId];
      if (s.ballots.includes(voterId)) {
        if (!existing || token !== existing) throw new Error(`${voter} has already voted.`);
        if (s.votes.some((v) => v.voterId === voterId && picks.some(([g]) => g === v.gender))) {
          throw new Error('You’ve already voted for that award.');
        }
      }
      for (const [gender, entrantId] of picks) {
        const entrant = s.entrants.find((e) => e.id === entrantId);
        if (!entrant) throw new Error('Someone you picked isn’t in the costume line-up any more. Refresh and pick again.');
        if (entrantGender(entrant, s.players) !== gender) {
          throw new Error('Pick a woman for the women’s award and a man for the men’s.');
        }
        if (entrant.id === voterId || entrant.playerId === voterId) throw new Error('You can’t vote for yourself.');
      }
      const ballot = existing ?? crypto.randomUUID();
      if (!s.ballots.includes(voterId)) {
        s.ballots.push(voterId);
        s.ballotTokens[voterId] = ballot;
      }
      s.votes.push(...picks.map(([gender, entrantId]) => ({ voterId, gender, entrantId })));
      write(s, ['votes', 'ballots']);
      return ballot;
    },

    async ballotStatus(token) {
      const s = clone();
      const voterId = Object.keys(s.ballotTokens).find((id) => s.ballotTokens[id] === token);
      if (!voterId) return null;
      return { voterId, genders: s.votes.filter((v) => v.voterId === voterId).map((v) => v.gender).sort() };
    },

    async addCostumePlayer(playerId) {
      const s = clone();
      if (!s.players.some((p) => p.id === playerId)) throw new Error('That player isn’t on the list any more. Refresh and try again.');
      if (s.entrants.some((e) => e.playerId === playerId)) throw new Error('They’re already in the costume line-up.');
      const entrant = { id: crypto.randomUUID(), playerId, guestName: null, guestGender: null, photoUrl: null };
      s.entrants.push(entrant);
      write(s, ['entrants']);
      return entrant;
    },

    async addCostumeGuest(name, gender) {
      const s = clone();
      const clean = normalizeName(name);
      if (!clean) throw new Error('Enter a name.');
      if (clean.length > 40) throw new Error('Keep the name under 40 characters.');
      if (s.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
        throw new Error(`${clean} is on the player list. Add them from there.`);
      }
      if (guestNames(s).some((g) => g.toLowerCase() === clean.toLowerCase())) {
        throw new Error('They’re already in the costume line-up.');
      }
      const entrant = { id: crypto.randomUUID(), playerId: null, guestName: clean, guestGender: gender, photoUrl: null };
      s.entrants.push(entrant);
      write(s, ['entrants']);
      return entrant;
    },

    async setCostumePhoto(entrantId, image) {
      const s = clone();
      const entrant = s.entrants.find((e) => e.id === entrantId);
      if (!entrant) throw new Error('That person isn’t in the costume line-up any more. Refresh and try again.');
      entrant.photoUrl = image === null ? null : `data:image/jpeg;base64,${image}`;
      // Photos are big for localStorage, so say so rather than keep one that's gone after a refresh.
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(s));
      } catch {
        throw new Error('This browser has no room for more demo photos. Remove one, or reset the demo data.');
      }
      write(s, ['entrants']);
    },

    async removeCostumeEntrant(entrantId) {
      const s = clone();
      removeEntrants(s, new Set([entrantId]));
      write(s, ['entrants', 'votes', 'picks', 'ballots']);
    },

    async clearCostumeVotes(voterId) {
      const s = clone();
      s.votes = s.votes.filter((v) => v.voterId !== voterId);
      removeBallots(s, new Set([voterId]));
      write(s, ['votes', 'ballots']);
    },

    async setCostumeVoting(open) {
      const s = clone();
      if (open && (['F', 'M'] as const).some((g) => lineUp(g, s.entrants, s.players).length === 0)) {
        throw new Error('Add at least one woman and one man to the costume line-up before opening voting.');
      }
      const wasOpened = s.voting.open || s.voting.closed;
      s.voting = { open, closed: !open && wasOpened };
      write(s, ['voting']);
    },

    async setCostumePick(gender, entrantId) {
      const s = clone();
      if (entrantId && !s.entrants.some((e) => e.id === entrantId)) {
        throw new Error('That person isn’t in the costume line-up any more. Refresh and try again.');
      }
      s.picks = s.picks.filter((p) => p.gender !== gender);
      if (entrantId) s.picks.push({ gender, entrantId });
      write(s, ['picks']);
    },
  };
}

/** Clears demo data back to the spreadsheet roster. */
export function resetDemoData() {
  safeSet(STORE_KEY, null);
  clearBallot();
}

export function createLocalAuth(): AuthClient {
  const listeners = new Set<(signedIn: boolean) => void>();
  const current = () => Boolean(safeGet(SESSION_KEY));
  const emit = () => listeners.forEach((l) => l(current()));
  return {
    async isSignedIn() {
      return current();
    },
    async signIn(password) {
      if (password !== DEMO_PASSWORD) throw new Error(`In demo mode the password is “${DEMO_PASSWORD}”.`);
      safeSet(SESSION_KEY, '1');
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
