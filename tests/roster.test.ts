import { describe, expect, it } from 'vitest';
import { lockedPairPlayerIds, nameProblem, normalizeName } from '../src/domain/roster';
import { rosterPlayers } from './fixtures';

describe('player names', () => {
  const players = rosterPlayers();

  it('tidies spacing', () => {
    expect(normalizeName('  Cherry   Anne ')).toBe('Cherry Anne');
  });

  it('accepts a new name', () => {
    expect(nameProblem('Morticia', players)).toBeNull();
  });

  it('rejects blank, too long, and duplicate names ignoring case and spacing', () => {
    expect(nameProblem('   ', players)).toMatch('Enter a name');
    expect(nameProblem('x'.repeat(41), players)).toMatch('under 40');
    expect(nameProblem(' cherry  anne', players)).toMatch('already a player named');
  });

  it('lets a player keep their own name when editing', () => {
    const irene = players.find((p) => p.name === 'Irene')!;
    expect(nameProblem('irene', players, irene.id)).toBeNull();
  });
});

describe('locked pair players', () => {
  it('collects both players of every locked pair', () => {
    const ids = lockedPairPlayerIds([
      { gender: 'F', slot: 0, teamId: 'witch', player1Id: 'a', player2Id: 'b' },
      { gender: 'M', slot: 0, teamId: 'bat', player1Id: 'c', player2Id: 'd' },
    ]);
    expect([...ids].sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});
