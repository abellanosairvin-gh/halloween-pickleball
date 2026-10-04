export type Gender = 'F' | 'M';
export type Skill = 'A' | 'B';
export type TeamId = 'pumpkin' | 'witch' | 'skull' | 'bat';
export type Outcome = 'W' | 'L';

export interface Player {
  id: string;
  name: string;
  gender: Gender;
  skill: Skill;
  checkedInAt: string | null;
  teamId: TeamId | null;
}

export interface GameResult {
  id: string;
  playerId: string;
  outcome: Outcome;
  createdAt: string;
  /** Created by "Simulate 5 games" rather than entered by hand. */
  simulated: boolean;
}

/** One of the four fixed doubles pairs in a gender's bracket. `slot` comes from the random draw. */
export interface BracketPair {
  gender: Gender;
  slot: number;
  teamId: TeamId;
  player1Id: string;
  player2Id: string;
}

/** semi1 is slot 0 vs slot 1, semi2 is slot 2 vs slot 3, final is the two semi winners. */
export type MatchKey = 'semi1' | 'semi2' | 'final';

export interface BracketMatch {
  gender: Gender;
  match: MatchKey;
  winnerSlot: number;
}

export interface Snapshot {
  players: Player[];
  results: GameResult[];
  pairs: BracketPair[];
  matches: BracketMatch[];
}

export type TableName = keyof Snapshot;
