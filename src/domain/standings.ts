import { TEAM_IDS } from './teams';
import type { GameResult, Gender, Player, TeamId } from './types';

export interface Record {
  wins: number;
  losses: number;
  games: number;
  /** null until the first game is recorded. */
  rate: number | null;
}

export const EMPTY_RECORD: Record = { wins: 0, losses: 0, games: 0, rate: null };

function toRecord(wins: number, losses: number): Record {
  const games = wins + losses;
  return { wins, losses, games, rate: games === 0 ? null : wins / games };
}

export function playerRecords(results: readonly GameResult[]): Map<string, Record> {
  const tally = new Map<string, { w: number; l: number }>();
  for (const r of results) {
    const t = tally.get(r.playerId) ?? { w: 0, l: 0 };
    if (r.outcome === 'W') t.w += 1;
    else t.l += 1;
    tally.set(r.playerId, t);
  }
  const out = new Map<string, Record>();
  for (const [id, t] of tally) out.set(id, toRecord(t.w, t.l));
  return out;
}

export function recordOf(records: Map<string, Record>, playerId: string): Record {
  return records.get(playerId) ?? EMPTY_RECORD;
}

/**
 * Ranking order inside a team: win rate, then most wins, then most games,
 * then A before B, then name. Players with no games sit below everyone who has played.
 */
export function compareByStanding(records: Map<string, Record>) {
  return (a: Player, b: Player): number => {
    const ra = recordOf(records, a.id);
    const rb = recordOf(records, b.id);
    const rateA = ra.rate ?? -1;
    const rateB = rb.rate ?? -1;
    return (
      rateB - rateA ||
      rb.wins - ra.wins ||
      rb.games - ra.games ||
      a.skill.localeCompare(b.skill) ||
      a.name.localeCompare(b.name)
    );
  };
}

export function teamMembers(players: readonly Player[], teamId: TeamId): Player[] {
  return players.filter((p) => p.teamId === teamId);
}

export function teamRecord(players: readonly Player[], records: Map<string, Record>, teamId: TeamId): Record {
  let wins = 0;
  let losses = 0;
  for (const p of teamMembers(players, teamId)) {
    const r = recordOf(records, p.id);
    wins += r.wins;
    losses += r.losses;
  }
  return toRecord(wins, losses);
}

export interface TeamStanding {
  teamId: TeamId;
  record: Record;
}

/**
 * Teams in podium order, every team in its own place:
 * 1. best win rate;
 * 2. on the same rate, more games played (10/20 beats 5/10);
 * 3. on the very same record, whoever got there first (their latest result is older);
 * 4. the fixed team order, only while neither team has played.
 * Teams with no games go last.
 */
export function rankTeams(
  players: readonly Player[],
  records: Map<string, Record>,
  results: readonly GameResult[] = [],
): TeamStanding[] {
  const teamOf = new Map(players.map((p) => [p.id, p.teamId]));
  const latest = new Map<TeamId, string>();
  for (const r of results) {
    const team = teamOf.get(r.playerId);
    if (team && r.createdAt > (latest.get(team) ?? '')) latest.set(team, r.createdAt);
  }
  return TEAM_IDS.map((teamId) => ({ teamId, record: teamRecord(players, records, teamId) })).sort(
    (a, b) =>
      (b.record.rate ?? -1) - (a.record.rate ?? -1) ||
      b.record.games - a.record.games ||
      (latest.get(a.teamId) ?? '').localeCompare(latest.get(b.teamId) ?? '') ||
      TEAM_IDS.indexOf(a.teamId) - TEAM_IDS.indexOf(b.teamId),
  );
}

/** Games a player must have recorded to be in a tournament pair. Mirrors public.set_bracket_pairs. */
export const MIN_PAIR_GAMES = 4;

export function isPairEligible(records: Map<string, Record>, playerId: string): boolean {
  return recordOf(records, playerId).games >= MIN_PAIR_GAMES;
}

/** A team's players of one gender who have played enough games for the tournament, best first. */
export function eligiblePlayers(
  players: readonly Player[],
  records: Map<string, Record>,
  teamId: TeamId,
  gender: Gender,
): Player[] {
  return players
    .filter((p) => p.teamId === teamId && p.gender === gender && isPairEligible(records, p.id))
    .sort(compareByStanding(records));
}

/** A team's current top two eligible players of one gender: its tournament pair. */
export function qualifiers(
  players: readonly Player[],
  records: Map<string, Record>,
  teamId: TeamId,
  gender: Gender,
): Player[] {
  return eligiblePlayers(players, records, teamId, gender).slice(0, 2);
}

export interface PairPicture {
  /** Clearly in the team's tournament pair right now. */
  top: Set<string>;
  /** Level on win rate for the last spot, so the organizer has to choose who moves on. */
  tied: Set<string>;
}

/**
 * Who would make a team's pair for one gender right now, for the organizer's Teams tab.
 * Only players with enough games count. If the 2nd and 3rd best share a win rate, everyone on that
 * rate is "tied" (for example three players on 60% for the last spot, or for both spots).
 */
export function pairPicture(
  players: readonly Player[],
  records: Map<string, Record>,
  teamId: TeamId,
  gender: Gender,
): PairPicture {
  const eligible = eligiblePlayers(players, records, teamId, gender);
  const rate = (p: Player) => recordOf(records, p.id).rate;
  const top = new Set(eligible.slice(0, 2).map((p) => p.id));
  const tied = new Set<string>();
  if (eligible.length > 2 && rate(eligible[1]) === rate(eligible[2])) {
    for (const p of eligible) {
      if (rate(p) === rate(eligible[1])) {
        tied.add(p.id);
        top.delete(p.id);
      }
    }
  }
  return { top, tied };
}

/** Players tab order: women then men, A before B, then name. */
export function compareForRoster(a: Player, b: Player): number {
  return a.gender.localeCompare(b.gender) || a.skill.localeCompare(b.skill) || a.name.localeCompare(b.name);
}

export function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

export function formatRecord(r: Record): string {
  return `${r.wins}–${r.losses}`;
}
