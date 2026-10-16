import { describe, expect, it } from 'vitest';
import { eligibleVoters, standing, tally } from '../src/domain/costume';
import type { CostumeEntrant, CostumeVote, Player } from '../src/domain/types';

const player = (id: string, name: string, gender: 'F' | 'M'): Player => ({
  id,
  name,
  gender,
  skill: 'A',
  checkedInAt: null,
  teamId: null,
});

const players = [player('p1', 'Wanda', 'F'), player('p2', 'Elvira', 'F'), player('p3', 'Victor', 'M')];
const entrants: CostumeEntrant[] = [
  { id: 'e1', playerId: 'p1', guestName: null, guestGender: null },
  { id: 'e2', playerId: 'p2', guestName: null, guestGender: null },
  { id: 'e3', playerId: null, guestName: 'Morticia', guestGender: 'F' },
  { id: 'e4', playerId: null, guestName: 'Gomez', guestGender: 'M' },
];
const forF = (voterId: string, entrantId: string): CostumeVote => ({ voterId, gender: 'F', entrantId });

describe('best in costume', () => {
  it('counts votes per person in one award', () => {
    const counts = tally([forF('p3', 'e1'), forF('e4', 'e1'), forF('p2', 'e3'), { voterId: 'p1', gender: 'M', entrantId: 'e4' }], 'F');
    expect(Object.fromEntries(counts)).toEqual({ e1: 2, e3: 1 });
  });

  it('keeps votes in the award they were cast in when a person moves to the other one', () => {
    const votes = [forF('p3', 'e1'), forF('e4', 'e1'), forF('e3', 'e2')];
    const moved = players.map((p) => (p.id === 'p1' ? { ...p, gender: 'M' as const } : p));
    const women = standing('F', entrants, moved, votes, []);
    expect(women.ranked.map((r) => r.entrant.id)).not.toContain('e1');
    expect(women.winner?.id).toBe('e2');
    const men = standing('M', entrants, moved, votes, []);
    expect(men.ranked.find((r) => r.entrant.id === 'e1')?.votes).toBe(0);
  });

  it('lets every player and every guest not playing vote, knowing their own entry', () => {
    const voters = eligibleVoters(players, entrants);
    expect(voters.map((v) => v.name)).toEqual(['Elvira', 'Gomez', 'Morticia', 'Victor', 'Wanda']);
    expect(voters.find((v) => v.name === 'Wanda')?.entrantId).toBe('e1');
    expect(voters.find((v) => v.name === 'Victor')?.entrantId).toBeNull();
    expect(voters.find((v) => v.name === 'Gomez')).toMatchObject({ id: 'e4', entrantId: 'e4' });
  });

  it('names a clear leader the winner', () => {
    const s = standing('F', entrants, players, [forF('p3', 'e2'), forF('e4', 'e2'), forF('p1', 'e3')], []);
    expect(s.ranked.map((r) => [r.entrant.id, r.votes])).toEqual([
      ['e2', 2],
      ['e3', 1],
      ['e1', 0],
    ]);
    expect(s.winner?.id).toBe('e2');
  });

  it('has no winner before any votes, or on a tie until the organizer picks', () => {
    expect(standing('F', entrants, players, [], [])).toMatchObject({ leaders: [], winner: null });
    const tied = [forF('p3', 'e1'), forF('e4', 'e2')];
    const s = standing('F', entrants, players, tied, []);
    expect(s.leaders.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
    expect(s.winner).toBeNull();
    expect(standing('F', entrants, players, tied, [{ gender: 'F', entrantId: 'e2' }]).winner?.id).toBe('e2');
  });

  it('ignores a pick once a later vote breaks the tie', () => {
    const votes = [forF('p3', 'e1'), forF('e4', 'e2'), forF('e3', 'e1')];
    expect(standing('F', entrants, players, votes, [{ gender: 'F', entrantId: 'e2' }]).winner?.id).toBe('e1');
  });
});
