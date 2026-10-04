import { TEAM_IDS } from './teams';
import type { Player, TeamId } from './types';

export type RandomSource = () => number;

/**
 * Picks the team for a player who is checking in.
 *
 * Compares teams by, in order: checked-in players with the same gender and skill,
 * then the same gender, then total size, then a random tie-break. This keeps every
 * gender × skill group within one player across teams regardless of arrival order.
 *
 * Mirrors check_in_player in db/migrations/0001_schema.sql — keep them in sync.
 */
export function pickTeam(players: readonly Player[], newcomer: Player, random: RandomSource = Math.random): TeamId {
  const scored = TEAM_IDS.map((teamId) => {
    const members = players.filter((p) => p.teamId === teamId && p.id !== newcomer.id);
    return {
      teamId,
      bucket: members.filter((p) => p.gender === newcomer.gender && p.skill === newcomer.skill).length,
      gender: members.filter((p) => p.gender === newcomer.gender).length,
      total: members.length,
      tieBreak: random(),
    };
  });
  scored.sort(
    (a, b) => a.bucket - b.bucket || a.gender - b.gender || a.total - b.total || a.tieBreak - b.tieBreak,
  );
  return scored[0].teamId;
}
