import type { RandomSource } from './assign';
import type { Outcome, Player } from './types';

export const SIMULATED_GAMES = 5;

export interface ResultEntry {
  playerId: string;
  outcome: Outcome;
}

/** A coin-flip win or loss for each game, for every checked-in player. Used to try out standings before the event. */
export function simulatedResults(
  players: readonly Player[],
  gamesEach: number = SIMULATED_GAMES,
  random: RandomSource = Math.random,
): ResultEntry[] {
  return players
    .filter((p) => p.teamId)
    .flatMap((p) =>
      Array.from({ length: gamesEach }, (): ResultEntry => ({ playerId: p.id, outcome: random() < 0.5 ? 'W' : 'L' })),
    );
}
