import type { RandomSource } from './assign';
import type { BracketId, BracketMatch, BracketPair, Gender, MatchKey, TeamId } from './types';

export interface PairDraft {
  teamId: TeamId;
  player1Id: string;
  player2Id: string;
}

/** The mixed doubles bracket, which the first-round winners of both genders are drawn into. */
export const MIXED: BracketId = 'X';

/** The matches a women's or men's bracket plays: one round, whose winners go on to mixed doubles. */
export const FIRST_ROUND: readonly MatchKey[] = ['semi1', 'semi2'];

/** Cryptographically random float in [0, 1), so the draw can't be predicted. */
export function cryptoRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
  const order = [...items];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Randomly assigns a gender's four team pairs to slots 0–3. Slot 0 v 1 and slot 2 v 3 are its two matches. */
export function drawPairs(gender: Gender, drafts: readonly PairDraft[], random: RandomSource = cryptoRandom): BracketPair[] {
  if (drafts.length !== 4) throw new Error('A bracket needs exactly 4 pairs.');
  return shuffle(drafts, random).map((d, slot) => ({ bracket: gender, slot, ...d }));
}

/**
 * Randomly pairs each of the four women with one of the four men, and the pairs with slots 0–3.
 * Mirrors the checks in public.set_bracket_pairs.
 */
export function drawMixedPairs(
  womenIds: readonly string[],
  menIds: readonly string[],
  random: RandomSource = cryptoRandom,
): BracketPair[] {
  if (womenIds.length !== 4 || menIds.length !== 4) throw new Error('Mixed doubles needs 4 women and 4 men.');
  const women = shuffle(womenIds, random);
  const men = shuffle(menIds, random);
  return women.map((w, slot) => ({ bracket: MIXED, slot, teamId: null, player1Id: w, player2Id: men[slot] }));
}

/** The players whose pair has won a first-round match so far, in match order. */
export function firstRoundWinners(gender: Gender, pairs: readonly BracketPair[], matches: readonly BracketMatch[]): string[] {
  return FIRST_ROUND.flatMap((key) => {
    const won = matches.find((m) => m.bracket === gender && m.match === key);
    const pair = won && pairs.find((p) => p.bracket === gender && p.slot === won.winnerSlot);
    return pair ? [pair.player1Id, pair.player2Id] : [];
  });
}

export function canRedraw(matches: readonly BracketMatch[], bracket: BracketId): boolean {
  return !matches.some((m) => m.bracket === bracket);
}

/** Once mixed doubles is drawn, the first-round results it came from stay as they are until it's reset. */
export function isMixedDrawn(pairs: readonly BracketPair[]): boolean {
  return pairs.some((p) => p.bracket === MIXED);
}

export interface MatchView {
  key: MatchKey;
  /** Slot numbers of the two sides; null while the side is still to be decided. */
  sides: [number | null, number | null];
  winnerSlot: number | null;
}

export interface BracketView {
  bracket: BracketId;
  locked: boolean;
  pairsBySlot: Map<number, BracketPair>;
  semis: [MatchView, MatchView];
  /** Mixed doubles only. */
  final: MatchView;
  /** The battle for 3rd, between the two semifinal losers. Mixed doubles only. */
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

export function buildBracket(bracket: BracketId, pairs: readonly BracketPair[], matches: readonly BracketMatch[]): BracketView {
  const own = pairs.filter((p) => p.bracket === bracket);
  const pairsBySlot = new Map(own.map((p) => [p.slot, p]));
  const winner = (key: MatchKey) => matches.find((m) => m.bracket === bracket && m.match === key)?.winnerSlot ?? null;
  const semi1 = winner('semi1');
  const semi2 = winner('semi2');
  const sides = placementSides(semi1, semi2);
  const final: MatchView = { key: 'final', sides: sides.final, winnerSlot: winner('final') };
  const third: MatchView = { key: 'third', sides: sides.third, winnerSlot: winner('third') };
  return {
    bracket,
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
  if (view.bracket !== MIXED) return [];
  const [a, b] = view[key].sides;
  return a === null || b === null ? [] : [a, b];
}

/**
 * Applies a winner (or clears one with null) and returns the new match list for this bracket.
 * Changing or clearing a semifinal drops a final or battle for 3rd whose winner is no longer in it.
 */
export function applyWinner(
  bracket: BracketId,
  matches: readonly BracketMatch[],
  key: MatchKey,
  winnerSlot: number | null,
): BracketMatch[] {
  let own = matches.filter((m) => m.bracket === bracket && m.match !== key);
  if (winnerSlot !== null) own.push({ bracket, match: key, winnerSlot });
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
