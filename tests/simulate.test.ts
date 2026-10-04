import { describe, expect, it } from 'vitest';
import { SIMULATED_GAMES, simulatedResults } from '../src/domain/simulate';
import { rosterPlayers, seededRandom } from './fixtures';

describe('simulatedResults', () => {
  const players = rosterPlayers().map((p, i) => ({ ...p, teamId: i % 4 === 0 ? null : ('witch' as const) }));
  const checkedIn = players.filter((p) => p.teamId);

  it(`gives every checked-in player exactly ${SIMULATED_GAMES} games and skips everyone else`, () => {
    const entries = simulatedResults(players, SIMULATED_GAMES, seededRandom(1));
    expect(entries).toHaveLength(checkedIn.length * SIMULATED_GAMES);
    for (const p of checkedIn) expect(entries.filter((e) => e.playerId === p.id)).toHaveLength(SIMULATED_GAMES);
    const skipped = new Set(players.filter((p) => !p.teamId).map((p) => p.id));
    expect(entries.some((e) => skipped.has(e.playerId))).toBe(false);
  });

  it('mixes wins and losses at random', () => {
    const entries = simulatedResults(players, SIMULATED_GAMES, seededRandom(2));
    const wins = entries.filter((e) => e.outcome === 'W').length;
    expect(wins).toBeGreaterThan(entries.length * 0.3);
    expect(wins).toBeLessThan(entries.length * 0.7);
  });

  it('returns nothing when no one is checked in', () => {
    expect(simulatedResults(rosterPlayers())).toEqual([]);
  });
});
