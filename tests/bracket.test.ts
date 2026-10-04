import { describe, expect, it } from 'vitest';
import { applyWinner, buildBracket, canRedraw, drawPairs, type PairDraft, validWinners } from '../src/domain/bracket';
import type { BracketMatch } from '../src/domain/types';
import { seededRandom } from './fixtures';

const drafts: PairDraft[] = [
  { teamId: 'pumpkin', player1Id: 'a', player2Id: 'b' },
  { teamId: 'witch', player1Id: 'c', player2Id: 'd' },
  { teamId: 'skull', player1Id: 'e', player2Id: 'f' },
  { teamId: 'bat', player1Id: 'g', player2Id: 'h' },
];

describe('random draw', () => {
  it('puts all four pairs into slots 0–3, forming two semifinals', () => {
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
    const matches: BracketMatch[] = [{ gender: 'M', match: 'semi1', winnerSlot: 0 }];
    expect(canRedraw(matches, 'F')).toBe(true);
    expect(canRedraw(matches, 'M')).toBe(false);
  });

  it('refuses anything other than four pairs', () => {
    expect(() => drawPairs('F', drafts.slice(0, 3))).toThrow();
  });
});

describe('advancing the bracket', () => {
  const pairs = drawPairs('F', drafts, seededRandom(3));

  it('sends semi winners to the final and crowns the final winner', () => {
    let matches: BracketMatch[] = [];
    matches = applyWinner('F', matches, 'semi1', 1);
    expect(validWinners(buildBracket('F', pairs, matches), 'final')).toEqual([]);
    matches = applyWinner('F', matches, 'semi2', 2);
    const view = buildBracket('F', pairs, matches);
    expect(view.final.sides).toEqual([1, 2]);
    expect(validWinners(view, 'final')).toEqual([1, 2]);
    matches = applyWinner('F', matches, 'final', 2);
    expect(buildBracket('F', pairs, matches).placings).toEqual([2, 1, null, null]);
  });

  it('sends semi losers to the battle for 3rd and fills the podium', () => {
    let matches: BracketMatch[] = [];
    matches = applyWinner('F', matches, 'semi1', 1);
    expect(validWinners(buildBracket('F', pairs, matches), 'third')).toEqual([]);
    matches = applyWinner('F', matches, 'semi2', 2);
    const view = buildBracket('F', pairs, matches);
    expect(view.third.sides).toEqual([0, 3]);
    expect(validWinners(view, 'third')).toEqual([0, 3]);
    matches = applyWinner('F', matches, 'third', 3);
    expect(buildBracket('F', pairs, matches).placings).toEqual([null, null, 3, 0]);
    matches = applyWinner('F', matches, 'final', 1);
    expect(buildBracket('F', pairs, matches).placings).toEqual([1, 2, 3, 0]);
  });

  it('drops a battle for 3rd whose winner no longer lost a semifinal', () => {
    let matches: BracketMatch[] = [];
    matches = applyWinner('F', matches, 'semi1', 0);
    matches = applyWinner('F', matches, 'semi2', 3);
    matches = applyWinner('F', matches, 'third', 2);
    expect(applyWinner('F', matches, 'semi1', 1).find((m) => m.match === 'third')?.winnerSlot).toBe(2);
    expect(applyWinner('F', matches, 'semi2', 2).some((m) => m.match === 'third')).toBe(false);
    expect(applyWinner('F', matches, 'semi1', null).some((m) => m.match === 'third')).toBe(false);
  });

  it('drops the final when a semifinal result changes or is cleared', () => {
    let matches: BracketMatch[] = [];
    matches = applyWinner('F', matches, 'semi1', 0);
    matches = applyWinner('F', matches, 'semi2', 3);
    matches = applyWinner('F', matches, 'final', 0);
    expect(applyWinner('F', matches, 'semi1', 1).some((m) => m.match === 'final')).toBe(false);
    expect(applyWinner('F', matches, 'semi2', 3).find((m) => m.match === 'final')?.winnerSlot).toBe(0);
    expect(applyWinner('F', matches, 'semi2', null).some((m) => m.match === 'final')).toBe(false);
  });

  it('keeps the other gender’s bracket untouched', () => {
    const matches: BracketMatch[] = [{ gender: 'M', match: 'semi1', winnerSlot: 1 }];
    expect(applyWinner('F', matches, 'semi1', 0)).toEqual([{ gender: 'F', match: 'semi1', winnerSlot: 0 }]);
  });
});
