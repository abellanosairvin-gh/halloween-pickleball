import type { BracketPair, Gender, Player, Skill } from './types';

export interface PlayerDraft {
  name: string;
  gender: Gender;
  skill: Skill;
}

export const MAX_NAME_LENGTH = 40;

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Returns a message explaining what's wrong with the name, or null if it can be saved. `guests` are the
 * costume guests who aren't playing: one person can't be both, or they'd vote twice.
 */
export function nameProblem(
  name: string,
  players: readonly Player[],
  exceptId?: string,
  guests: readonly string[] = [],
): string | null {
  const clean = normalizeName(name);
  if (!clean) return 'Enter a name.';
  if (clean.length > MAX_NAME_LENGTH) return `Keep the name under ${MAX_NAME_LENGTH} characters.`;
  const taken = players.find((p) => p.id !== exceptId && p.name.toLowerCase() === clean.toLowerCase());
  if (taken) return `There’s already a player named ${taken.name}. Add an initial to tell them apart.`;
  const guest = guests.find((g) => g.toLowerCase() === clean.toLowerCase());
  return guest ? `${guest} is in the costume line-up as a guest who isn’t playing. Remove them there first.` : null;
}

/** Players in a locked bracket pair. Their gender and team are fixed and they can't be deleted until it's reset. */
export function lockedPairPlayerIds(pairs: readonly BracketPair[]): Set<string> {
  return new Set(pairs.flatMap((p) => [p.player1Id, p.player2Id]));
}

export function lockedPairMessage(name: string): string {
  return `${name} is in a locked tournament pair. Reset that bracket on the Tournament tab first.`;
}
