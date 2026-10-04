import type { RandomSource } from './assign';
import type { BracketMatch, BracketPair, Gender, MatchKey, TeamId } from './types';

export interface PairDraft {
  teamId: TeamId;
  player1Id: string;
  player2Id: string;
}

/** Cryptographically random float in [0, 1), so the draw can't be predicted. */
export function cryptoRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

/** Randomly assigns the four pairs to slots 0–3. Slot 0 v 1 and slot 2 v 3 are the semifinals. */
export function drawPairs(gender: Gender, drafts: readonly PairDraft[], random: RandomSource = cryptoRandom): BracketPair[] {
  if (drafts.length !== 4) throw new Error('A bracket needs exactly 4 pairs.');
  const order = [...drafts];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.map((d, slot) => ({ gender, slot, ...d }));
}

export function canRedraw(matches: readonly BracketMatch[], gender: Gender): boolean {
  return !matches.some((m) => m.gender === gender);
}

export interface MatchView {
  key: MatchKey;
  /** Slot numbers of the two sides; null while the side is still to be decided. */
  sides: [number | null, number | null];
  winnerSlot: number | null;
}

export interface BracketView {
  locked: boolean;
  pairsBySlot: Map<number, BracketPair>;
  semis: [MatchView, MatchView];
  final: MatchView;
  championSlot: number | null;
}

export function buildBracket(gender: Gender, pairs: readonly BracketPair[], matches: readonly BracketMatch[]): BracketView {
  const own = pairs.filter((p) => p.gender === gender);
  const pairsBySlot = new Map(own.map((p) => [p.slot, p]));
  const winner = (key: MatchKey) => matches.find((m) => m.gender === gender && m.match === key)?.winnerSlot ?? null;
  const semi1 = winner('semi1');
  const semi2 = winner('semi2');
  const finalWinner = winner('final');
  return {
    locked: own.length === 4,
    pairsBySlot,
    semis: [
      { key: 'semi1', sides: [0, 1], winnerSlot: semi1 },
      { key: 'semi2', sides: [2, 3], winnerSlot: semi2 },
    ],
    final: { key: 'final', sides: [semi1, semi2], winnerSlot: finalWinner },
    championSlot: finalWinner,
  };
}

/** Which slots may win a given match, given the results so far. Mirrors public.set_match_winner. */
export function validWinners(view: BracketView, key: MatchKey): number[] {
  if (key === 'semi1') return [0, 1];
  if (key === 'semi2') return [2, 3];
  const [a, b] = view.final.sides;
  return a === null || b === null ? [] : [a, b];
}

/**
 * Applies a winner (or clears one with null) and returns the new match list for this gender.
 * Changing or clearing a semifinal drops a final that no longer involves that semi's winner.
 */
export function applyWinner(
  gender: Gender,
  matches: readonly BracketMatch[],
  key: MatchKey,
  winnerSlot: number | null,
): BracketMatch[] {
  let own = matches.filter((m) => m.gender === gender && m.match !== key);
  if (winnerSlot !== null) own.push({ gender, match: key, winnerSlot });
  if (key !== 'final') {
    const semiWinners = own.filter((m) => m.match !== 'final').map((m) => m.winnerSlot);
    own = own.filter((m) => m.match !== 'final' || semiWinners.includes(m.winnerSlot));
    if (own.filter((m) => m.match !== 'final').length < 2) own = own.filter((m) => m.match !== 'final');
  }
  return own;
}
