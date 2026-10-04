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
  /** The battle for 3rd, between the two semifinal losers. */
  third: MatchView;
  /** Slots finishing 1st to 4th; null until the deciding match is played. */
  placings: [number | null, number | null, number | null, number | null];
}

/** The slot that lost a semifinal, given its winner. semi1 is 0 v 1 and semi2 is 2 v 3. */
const semiLoser = (key: 'semi1' | 'semi2', winnerSlot: number | null) =>
  winnerSlot === null ? null : (key === 'semi1' ? 1 : 5) - winnerSlot;

/** Both sides of the final and the battle for 3rd, once both semifinals are decided. */
function placementSides(semi1: number | null, semi2: number | null) {
  return {
    final: [semi1, semi2] as [number | null, number | null],
    third: [semiLoser('semi1', semi1), semiLoser('semi2', semi2)] as [number | null, number | null],
  };
}

/** The other side of a decided match. */
const otherSide = (match: MatchView) =>
  match.winnerSlot === null ? null : (match.sides.find((s) => s !== match.winnerSlot) ?? null);

export function buildBracket(gender: Gender, pairs: readonly BracketPair[], matches: readonly BracketMatch[]): BracketView {
  const own = pairs.filter((p) => p.gender === gender);
  const pairsBySlot = new Map(own.map((p) => [p.slot, p]));
  const winner = (key: MatchKey) => matches.find((m) => m.gender === gender && m.match === key)?.winnerSlot ?? null;
  const semi1 = winner('semi1');
  const semi2 = winner('semi2');
  const sides = placementSides(semi1, semi2);
  const final: MatchView = { key: 'final', sides: sides.final, winnerSlot: winner('final') };
  const third: MatchView = { key: 'third', sides: sides.third, winnerSlot: winner('third') };
  return {
    locked: own.length === 4,
    pairsBySlot,
    semis: [
      { key: 'semi1', sides: [0, 1], winnerSlot: semi1 },
      { key: 'semi2', sides: [2, 3], winnerSlot: semi2 },
    ],
    final,
    third,
    placings: [final.winnerSlot, otherSide(final), third.winnerSlot, otherSide(third)],
  };
}

/** Which slots may win a given match, given the results so far. Mirrors public.set_match_winner. */
export function validWinners(view: BracketView, key: MatchKey): number[] {
  if (key === 'semi1') return [0, 1];
  if (key === 'semi2') return [2, 3];
  const [a, b] = view[key].sides;
  return a === null || b === null ? [] : [a, b];
}

/**
 * Applies a winner (or clears one with null) and returns the new match list for this gender.
 * Changing or clearing a semifinal drops a final or battle for 3rd whose winner is no longer in it.
 */
export function applyWinner(
  gender: Gender,
  matches: readonly BracketMatch[],
  key: MatchKey,
  winnerSlot: number | null,
): BracketMatch[] {
  let own = matches.filter((m) => m.gender === gender && m.match !== key);
  if (winnerSlot !== null) own.push({ gender, match: key, winnerSlot });
  if (key === 'semi1' || key === 'semi2') {
    const semi = (k: MatchKey) => own.find((m) => m.match === k)?.winnerSlot ?? null;
    const sides = placementSides(semi('semi1'), semi('semi2'));
    const stillIn = (m: BracketMatch) => {
      if (m.match !== 'final' && m.match !== 'third') return true;
      const [a, b] = sides[m.match];
      return a !== null && b !== null && (m.winnerSlot === a || m.winnerSlot === b);
    };
    own = own.filter(stillIn);
  }
  return own;
}
