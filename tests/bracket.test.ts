import { describe, expect, it } from 'vitest';
import {
  applyWinner,
  buildBracket,
  canRedraw,
  drawMixedPairs,
  drawPairs,
  firstRoundWinners,
  isMixedDrawn,
  MIXED,
  type PairDraft,
  validWinners,
} from '../src/domain/bracket';
import type { BracketMatch } from '../src/domain/types';
import { seededRandom } from './fixtures';

const drafts: PairDraft[] = [
  { teamId: 'pumpkin', player1Id: 'a', player2Id: 'b' },
  { teamId: 'witch', player1Id: 'c', player2Id: 'd' },
  { teamId: 'skull', player1Id: 'e', player2Id: 'f' },
  { teamId: 'bat', player1Id: 'g', player2Id: 'h' },
];

const women = ['w1', 'w2', 'w3', 'w4'];
const men = ['m1', 'm2', 'm3', 'm4'];

describe('random draw', () => {
  it('puts all four pairs into slots 0–3, forming two matches', () => {
    const pairs = drawPairs('F', drafts, seededRandom(1));
    expect(pairs.map((p) => p.slot)).toEqual([0, 1, 2, 3]);
    expect(new Set(pairs.map((p) => p.teamId)).size).toBe(4);
    const view = buildBracket('F', pairs, []);
    expect(view.locked).toBe(true);
    expect(view.semis.map((s) => s.sides)).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('is repeatable with the same random source and varies across draws', () => {
    const order = (seed: number) => drawPairs('M', drafts, seededRandom(seed)).map((p) => p.teamId).join();
    expect(order(42)).toBe(order(42));
    const seen = new Set(Array.from({ length: 200 }, (_, i) => order(i)));
    expect(seen.size).toBe(24);
  });

  it('works with the default crypto random source', () => {
    expect(drawPairs('F', drafts)).toHaveLength(4);
  });

  it('only allows redraw before any result in that bracket', () => {
    const matches: BracketMatch[] = [{ bracket: 'M', match: 'semi1', winnerSlot: 0 }];
    expect(canRedraw(matches, 'F')).toBe(true);
    expect(canRedraw(matches, 'M')).toBe(false);
  });

  it('refuses anything other than four pairs', () => {
    expect(() => drawPairs('F', drafts.slice(0, 3))).toThrow();
  });
});

describe('the women’s and men’s first round', () => {
  const pairs = drawPairs('M', drafts, seededRandom(5));

  it('plays only its two matches', () => {
    let matches: BracketMatch[] = [];
    matches = applyWinner('M', matches, 'semi1', 1);
    matches = applyWinner('M', matches, 'semi2', 2);
    const view = buildBracket('M', pairs, matches);
    expect(validWinners(view, 'semi1')).toEqual([0, 1]);
    expect(validWinners(view, 'final')).toEqual([]);
    expect(validWinners(view, 'third')).toEqual([]);
  });

  it('sends both players of each winning pair through to mixed doubles', () => {
    const at = (slot: number) => pairs.find((p) => p.slot === slot)!;
    let matches: BracketMatch[] = [];
    expect(firstRoundWinners('M', pairs, matches)).toEqual([]);
    matches = applyWinner('M', matches, 'semi2', 3);
    expect(firstRoundWinners('M', pairs, matches)).toEqual([at(3).player1Id, at(3).player2Id]);
    matches = applyWinner('M', matches, 'semi1', 0);
    expect(firstRoundWinners('M', pairs, matches)).toEqual([at(0).player1Id, at(0).player2Id, at(3).player1Id, at(3).player2Id]);
    expect(firstRoundWinners('F', pairs, matches)).toEqual([]);
  });
});

describe('mixed doubles draw', () => {
  it('pairs every woman with exactly one man and fills slots 0–3', () => {
    const pairs = drawMixedPairs(women, men, seededRandom(7));
    expect(pairs.map((p) => p.slot)).toEqual([0, 1, 2, 3]);
    expect(pairs.every((p) => p.bracket === MIXED && p.teamId === null)).toBe(true);
    expect(pairs.map((p) => p.player1Id).sort()).toEqual(women);
    expect(pairs.map((p) => p.player2Id).sort()).toEqual(men);
    expect(isMixedDrawn(pairs)).toBe(true);
    expect(isMixedDrawn(drawPairs('F', drafts))).toBe(false);
  });

  it('can produce every pairing', () => {
    const pairing = (seed: number) =>
      drawMixedPairs(women, men, seededRandom(seed))
        .map((p) => `${p.player1Id}${p.player2Id}`)
        .sort()
        .join();
    expect(pairing(9)).toBe(pairing(9));
    const seen = new Set(Array.from({ length: 300 }, (_, i) => pairing(i)));
    expect(seen.size).toBe(24);
  });

  it('needs four women and four men', () => {
    expect(() => drawMixedPairs(women.slice(0, 3), men)).toThrow();
    expect(() => drawMixedPairs(women, [...men, 'm5'])).toThrow();
  });
});

describe('advancing mixed doubles', () => {
  const pairs = drawMixedPairs(women, men, seededRandom(3));

  it('sends semi winners to the final and crowns the final winner', () => {
    let matches: BracketMatch[] = [];
    matches = applyWinner(MIXED, matches, 'semi1', 1);
    expect(validWinners(buildBracket(MIXED, pairs, matches), 'final')).toEqual([]);
    matches = applyWinner(MIXED, matches, 'semi2', 2);
    const view = buildBracket(MIXED, pairs, matches);
    expect(view.final.sides).toEqual([1, 2]);
    expect(validWinners(view, 'final')).toEqual([1, 2]);
    matches = applyWinner(MIXED, matches, 'final', 2);
    expect(buildBracket(MIXED, pairs, matches).placings).toEqual([2, 1, null, null]);
  });

  it('sends semi losers to the battle for 3rd and fills the podium', () => {
    let matches: BracketMatch[] = [];
    matches = applyWinner(MIXED, matches, 'semi1', 1);
    expect(validWinners(buildBracket(MIXED, pairs, matches), 'third')).toEqual([]);
    matches = applyWinner(MIXED, matches, 'semi2', 2);
    const view = buildBracket(MIXED, pairs, matches);
    expect(view.third.sides).toEqual([0, 3]);
    expect(validWinners(view, 'third')).toEqual([0, 3]);
    matches = applyWinner(MIXED, matches, 'third', 3);
    expect(buildBracket(MIXED, pairs, matches).placings).toEqual([null, null, 3, 0]);
    matches = applyWinner(MIXED, matches, 'final', 1);
    expect(buildBracket(MIXED, pairs, matches).placings).toEqual([1, 2, 3, 0]);
  });

  it('drops a battle for 3rd whose winner no longer lost a semifinal', () => {
    let matches: BracketMatch[] = [];
    matches = applyWinner(MIXED, matches, 'semi1', 0);
    matches = applyWinner(MIXED, matches, 'semi2', 3);
    matches = applyWinner(MIXED, matches, 'third', 2);
    expect(applyWinner(MIXED, matches, 'semi1', 1).find((m) => m.match === 'third')?.winnerSlot).toBe(2);
    expect(applyWinner(MIXED, matches, 'semi2', 2).some((m) => m.match === 'third')).toBe(false);
    expect(applyWinner(MIXED, matches, 'semi1', null).some((m) => m.match === 'third')).toBe(false);
  });

  it('drops the final when a semifinal result changes or is cleared', () => {
    let matches: BracketMatch[] = [];
    matches = applyWinner(MIXED, matches, 'semi1', 0);
    matches = applyWinner(MIXED, matches, 'semi2', 3);
    matches = applyWinner(MIXED, matches, 'final', 0);
    expect(applyWinner(MIXED, matches, 'semi1', 1).some((m) => m.match === 'final')).toBe(false);
    expect(applyWinner(MIXED, matches, 'semi2', 3).find((m) => m.match === 'final')?.winnerSlot).toBe(0);
    expect(applyWinner(MIXED, matches, 'semi2', null).some((m) => m.match === 'final')).toBe(false);
  });

  it('keeps the other brackets untouched', () => {
    const matches: BracketMatch[] = [{ bracket: 'M', match: 'semi1', winnerSlot: 1 }];
    expect(applyWinner(MIXED, matches, 'semi1', 0)).toEqual([{ bracket: MIXED, match: 'semi1', winnerSlot: 0 }]);
  });
});
