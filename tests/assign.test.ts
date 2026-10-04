import { describe, expect, it } from 'vitest';
import { pickTeam } from '../src/domain/assign';
import { TEAM_IDS } from '../src/domain/teams';
import { bucketSpreads, rosterPlayers, seededRandom, shuffled } from './fixtures';

function checkInEveryone(seed: number) {
  const random = seededRandom(seed);
  const players = rosterPlayers();
  for (const p of shuffled(players, random)) {
    p.teamId = pickTeam(players, p, random);
    p.checkedInAt = 'now';
  }
  return players;
}

describe('pickTeam', () => {
  it('keeps every gender × skill group within one player across teams, for any arrival order', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const spreads = bucketSpreads(checkInEveryone(seed), TEAM_IDS);
      expect(Object.values(spreads).every((s) => s <= 1), `seed ${seed}: ${JSON.stringify(spreads)}`).toBe(true);
    }
  });

  it('stays balanced at every step of check-in, not just at the end', () => {
    const random = seededRandom(7);
    const players = rosterPlayers();
    for (const p of shuffled(players, random)) {
      p.teamId = pickTeam(players, p, random);
      const spreads = bucketSpreads(players, TEAM_IDS);
      expect(Math.max(...Object.values(spreads))).toBeLessThanOrEqual(1);
    }
  });

  it('gives every team at least two advanced women and four advanced men once all 40 are in', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const players = checkInEveryone(seed);
      for (const team of TEAM_IDS) {
        const members = players.filter((p) => p.teamId === team);
        expect(members.filter((p) => p.gender === 'F' && p.skill === 'A').length).toBeGreaterThanOrEqual(2);
        expect(members.filter((p) => p.gender === 'M' && p.skill === 'A').length).toBeGreaterThanOrEqual(4);
        expect(members.length).toBeGreaterThanOrEqual(9);
        expect(members.length).toBeLessThanOrEqual(11);
      }
    }
  });

  it('ignores the newcomer’s own current team when counting', () => {
    const players = rosterPlayers();
    const irene = players.find((p) => p.name === 'Irene')!;
    irene.teamId = 'pumpkin';
    expect(pickTeam(players, irene, () => 0)).toBe('pumpkin');
  });
});
