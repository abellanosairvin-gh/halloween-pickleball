import { describe, expect, it } from 'vitest';
import {
  compareByStanding,
  compareForRoster,
  eligiblePlayers,
  isPairEligible,
  MIN_PAIR_GAMES,
  formatRate,
  playerRecords,
  qualifiers,
  rankTeams,
  pairPicture,
  teamRecord,
} from '../src/domain/standings';
import type { GameResult, Outcome, Player } from '../src/domain/types';

let nextId = 0;
const result = (playerId: string, outcome: Outcome): GameResult => ({
  id: `r${(nextId += 1)}`,
  playerId,
  outcome,
  createdAt: '',
  simulated: false,
});
const games = (playerId: string, wins: number, losses: number) => [
  ...Array.from({ length: wins }, () => result(playerId, 'W')),
  ...Array.from({ length: losses }, () => result(playerId, 'L')),
];
const player = (id: string, over: Partial<Player> = {}): Player => ({
  id,
  name: id,
  gender: 'F',
  skill: 'A',
  checkedInAt: 'now',
  teamId: 'witch',
  ...over,
});

describe('player and team records', () => {
  it('computes win rate per player, with no rate before the first game', () => {
    const records = playerRecords([...games('a', 3, 1), ...games('b', 0, 2)]);
    expect(records.get('a')).toEqual({ wins: 3, losses: 1, games: 4, rate: 0.75 });
    expect(records.get('b')?.rate).toBe(0);
    expect(records.get('c')).toBeUndefined();
    expect(formatRate(null)).toBe('—');
    expect(formatRate(2 / 3)).toBe('67%');
  });

  it('team rate is total team wins over total team games, not an average of player rates', () => {
    const players = [player('a'), player('b'), player('c', { teamId: 'bat' })];
    const records = playerRecords([...games('a', 1, 0), ...games('b', 1, 3), ...games('c', 5, 0)]);
    expect(teamRecord(players, records, 'witch')).toEqual({ wins: 2, losses: 3, games: 5, rate: 0.4 });
  });

  it('ranks teams by win rate, and teams with no games last', () => {
    const players = [player('a', { teamId: 'pumpkin' }), player('b', { teamId: 'skull' }), player('c', { teamId: 'bat' })];
    const records = playerRecords([...games('a', 1, 1), ...games('b', 3, 1), ...games('c', 0, 1)]);
    expect(rankTeams(players, records).map((t) => t.teamId)).toEqual(['skull', 'pumpkin', 'bat', 'witch']);
  });
});

describe('standing order', () => {
  const order = (players: Player[], results: GameResult[]) =>
    [...players].sort(compareByStanding(playerRecords(results))).map((p) => p.id);

  it('sorts by win rate, then wins, then games played', () => {
    const players = [player('rate50', { name: 'Zed' }), player('rate100', { name: 'Amy' }), player('rate50more', { name: 'Bea' })];
    expect(order(players, [...games('rate50', 1, 1), ...games('rate100', 1, 0), ...games('rate50more', 3, 3)])).toEqual([
      'rate100',
      'rate50more',
      'rate50',
    ]);
  });

  it('puts players with no games below players with a 0% record', () => {
    const players = [player('none', { name: 'Ann' }), player('zero', { name: 'Zoe' }), player('one', { name: 'Mo' })];
    expect(order(players, [...games('zero', 0, 2), ...games('one', 1, 0)])).toEqual(['one', 'zero', 'none']);
  });

  it('breaks a full tie with A over B, then name', () => {
    const players = [player('b', { name: 'Ann', skill: 'B' }), player('a2', { name: 'Zoe' }), player('a1', { name: 'Kim' })];
    expect(order(players, [])).toEqual(['a1', 'a2', 'b']);
  });
});

describe('qualifiers', () => {
  it(`picks the top two of a gender and team who have played at least ${MIN_PAIR_GAMES} games`, () => {
    const players = [
      player('best', { name: 'Amy' }),
      player('second', { name: 'Bea' }),
      player('third', { name: 'Cat' }),
      player('man', { gender: 'M' }),
      player('otherTeam', { teamId: 'bat' }),
    ];
    const records = playerRecords([
      ...games('best', 4, 0),
      ...games('second', 3, 1),
      ...games('third', 2, 2),
      ...games('man', 9, 0),
      ...games('otherTeam', 9, 0),
    ]);
    expect(qualifiers(players, records, 'witch', 'F').map((p) => p.id)).toEqual(['best', 'second']);
  });

  it(`skips players with fewer than ${MIN_PAIR_GAMES} games, however high their win rate`, () => {
    const players = [player('unbeaten', { name: 'Amy' }), player('steady', { name: 'Bea' }), player('busy', { name: 'Cat' })];
    const records = playerRecords([...games('unbeaten', 3, 0), ...games('steady', 3, 1), ...games('busy', 1, 4)]);
    expect(isPairEligible(records, 'unbeaten')).toBe(false);
    expect(isPairEligible(records, 'steady')).toBe(true);
    expect(qualifiers(players, records, 'witch', 'F').map((p) => p.id)).toEqual(['steady', 'busy']);
  });

  it('returns fewer than two when not enough players qualify', () => {
    const players = [player('a'), player('b')];
    const records = playerRecords([...games('a', 2, 2), ...games('b', 3, 0)]);
    expect(qualifiers(players, records, 'witch', 'F').map((p) => p.id)).toEqual(['a']);
    expect(eligiblePlayers(players, new Map(), 'witch', 'F')).toEqual([]);
  });
});

describe('roster order', () => {
  it('lists women before men, A before B, then by name', () => {
    const players = [
      player('1', { name: 'Al', gender: 'M', skill: 'B' }),
      player('2', { name: 'Bo', gender: 'M', skill: 'A' }),
      player('3', { name: 'Cy', gender: 'F', skill: 'B' }),
      player('4', { name: 'Di', gender: 'F', skill: 'A' }),
      player('5', { name: 'Ab', gender: 'F', skill: 'A' }),
    ];
    expect([...players].sort(compareForRoster).map((p) => p.name)).toEqual(['Ab', 'Di', 'Cy', 'Bo', 'Al']);
  });
});

describe('podium places', () => {
  const team = (id: string, teamId: Player['teamId']) => player(id, { teamId, checkedInAt: 't' });
  const at = (playerId: string, outcome: Outcome, createdAt: string): GameResult => ({
    id: `${playerId}-${createdAt}`,
    playerId,
    outcome,
    createdAt,
    simulated: false,
  });

  it('breaks a win-rate tie by games played, so no two teams share a place', () => {
    // Pumpkin 10/20 and Witch 5/10 are both 50%; Skull 3/10 is next; Dracula has no games yet.
    const players = [team('p', 'pumpkin'), team('w', 'witch'), team('s', 'skull'), team('b', 'bat')];
    const results = [...games('w', 5, 5), ...games('p', 10, 10), ...games('s', 3, 7)];
    const order = rankTeams(players, playerRecords(results), results).map((s) => s.teamId);
    expect(order).toEqual(['pumpkin', 'witch', 'skull', 'bat']);
  });

  it('puts the team that reached an identical record first ahead', () => {
    const players = [team('p', 'pumpkin'), team('w', 'witch')];
    const results = [
      at('w', 'W', '2026-10-31T19:00:00Z'),
      at('w', 'L', '2026-10-31T19:10:00Z'),
      at('p', 'W', '2026-10-31T19:05:00Z'),
      at('p', 'L', '2026-10-31T19:20:00Z'),
    ];
    const order = rankTeams(players, playerRecords(results), results).map((s) => s.teamId);
    expect(order.slice(0, 2)).toEqual(['witch', 'pumpkin']);
  });
});

describe('pair picture (organizer highlights)', () => {
  const woman = (id: string) => player(id, { teamId: 'witch', gender: 'F', checkedInAt: 't' });
  const picture = (players: Player[], results: GameResult[]) => {
    const p = pairPicture(players, playerRecords(results), 'witch', 'F');
    return { top: [...p.top].sort(), tied: [...p.tied].sort() };
  };

  it('marks a clear top two', () => {
    const players = ['a', 'b', 'c'].map(woman);
    expect(picture(players, [...games('a', 4, 1), ...games('b', 3, 2), ...games('c', 2, 3)])).toEqual({
      top: ['a', 'b'],
      tied: [],
    });
  });

  it('marks everyone level on win rate for the last spot as tied', () => {
    // a is 80%; b, c and d are all 60% for the one remaining spot.
    const players = ['a', 'b', 'c', 'd'].map(woman);
    const results = [...games('a', 4, 1), ...games('b', 3, 2), ...games('c', 6, 4), ...games('d', 3, 2)];
    expect(picture(players, results)).toEqual({ top: ['a'], tied: ['b', 'c', 'd'] });
  });

  it('marks three players on the same rate as tied for both spots', () => {
    const players = ['a', 'b', 'c'].map(woman);
    const results = [...games('a', 3, 2), ...games('b', 3, 2), ...games('c', 3, 2)];
    expect(picture(players, results)).toEqual({ top: [], tied: ['a', 'b', 'c'] });
  });

  it('ignores players without enough games', () => {
    // c is also 50% but has only 2 games, so a and b are clear.
    const players = ['a', 'b', 'c'].map(woman);
    const results = [...games('a', 3, 2), ...games('b', 2, 2), ...games('c', 1, 1)];
    expect(picture(players, results)).toEqual({ top: ['a', 'b'], tied: [] });
  });
});
