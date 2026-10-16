import type { CostumeEntrant, CostumePick, CostumeVote, Gender, Player } from './types';

/** Someone who can vote: any player, or a guest in the costume line-up who isn't playing. */
export interface Voter {
  id: string;
  name: string;
  /** The voter's own entry in the line-up, if they're in costume, so they can't vote for themselves. */
  entrantId: string | null;
}

export function entrantName(entrant: CostumeEntrant, players: readonly Player[]): string {
  if (entrant.guestName !== null) return entrant.guestName;
  return players.find((p) => p.id === entrant.playerId)?.name ?? '';
}

export function entrantGender(entrant: CostumeEntrant, players: readonly Player[]): Gender | null {
  if (entrant.guestGender !== null) return entrant.guestGender;
  return players.find((p) => p.id === entrant.playerId)?.gender ?? null;
}

/** The line-up for one award, in the order it was entered. */
export function lineUp(gender: Gender, entrants: readonly CostumeEntrant[], players: readonly Player[]) {
  return entrants.filter((e) => entrantGender(e, players) === gender);
}

export function eligibleVoters(players: readonly Player[], entrants: readonly CostumeEntrant[]): Voter[] {
  const byPlayer = new Map(entrants.filter((e) => e.playerId).map((e) => [e.playerId!, e.id]));
  return [
    ...players.map((p) => ({ id: p.id, name: p.name, entrantId: byPlayer.get(p.id) ?? null })),
    ...entrants.filter((e) => e.guestName !== null).map((e) => ({ id: e.id, name: e.guestName!, entrantId: e.id })),
  ].sort((a, b) => a.name.localeCompare(b.name));
}

export const votedIds = (votes: readonly CostumeVote[]) => new Set(votes.map((v) => v.voterId));

/** Votes per entrant. Votes with no entrant (a guest's redacted view) are not counted. */
export function tally(votes: readonly CostumeVote[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of votes) if (v.entrantId) counts.set(v.entrantId, (counts.get(v.entrantId) ?? 0) + 1);
  return counts;
}

export interface Standing {
  /** The line-up with vote counts, most votes first. */
  ranked: { entrant: CostumeEntrant; votes: number }[];
  /** Everyone with the most votes; empty until someone has a vote. */
  leaders: CostumeEntrant[];
  /** The leader, or the organizer's pick among tied leaders. null while nobody has votes or a tie is unpicked. */
  winner: CostumeEntrant | null;
}

export function standing(
  gender: Gender,
  entrants: readonly CostumeEntrant[],
  players: readonly Player[],
  votes: readonly CostumeVote[],
  picks: readonly CostumePick[],
): Standing {
  const counts = tally(votes);
  const ranked = lineUp(gender, entrants, players)
    .map((entrant) => ({ entrant, votes: counts.get(entrant.id) ?? 0 }))
    .sort((a, b) => b.votes - a.votes);
  const top = ranked[0]?.votes ?? 0;
  const leaders = top > 0 ? ranked.filter((r) => r.votes === top).map((r) => r.entrant) : [];
  // A pick only counts while its person is still one of the tied leaders; a later vote can break the tie.
  const pickId = picks.find((p) => p.gender === gender)?.entrantId;
  const winner = leaders.length === 1 ? leaders[0] : (leaders.find((e) => e.id === pickId) ?? null);
  return { ranked, leaders, winner };
}
