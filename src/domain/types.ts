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
}

/**
 * 'F' and 'M' are the women's and men's first round of doubles. 'X' is mixed doubles, which the
 * women and men who win that round are drawn into.
 */
export type BracketId = Gender | 'X';

/** One of the four pairs in a bracket. `slot` comes from the random draw. */
export interface BracketPair {
  bracket: BracketId;
  slot: number;
  /** The team of a women's or men's pair. null for a mixed pair, whose players can be on different teams. */
  teamId: TeamId | null;
  /** In a mixed pair, player1 is the woman and player2 the man. */
  player1Id: string;
  player2Id: string;
}

/**
 * semi1 is slot 0 vs slot 1, semi2 is slot 2 vs slot 3, final is the two semi winners and
 * third (the battle for 3rd) is the two semi losers. The women's and men's brackets only play
 * semi1 and semi2, their single round.
 */
export type MatchKey = 'semi1' | 'semi2' | 'final' | 'third';

export interface BracketMatch {
  bracket: BracketId;
  match: MatchKey;
  winnerSlot: number;
}

/** Someone in the Best in Costume line-up: a player, or a guest who isn't playing. */
export interface CostumeEntrant {
  id: string;
  /** Set for a player; their name and gender come from the player list. */
  playerId: string | null;
  /** Set for a guest who isn't playing. */
  guestName: string | null;
  guestGender: Gender | null;
}

/** One vote for one award. A voter is a player id, or the entrant id of a guest who isn't playing. */
/** One vote for one award. Only the organizer's session receives these; guests get an empty list. */
export interface CostumeVote {
  voterId: string;
  gender: Gender;
  entrantId: string;
}

/** The organizer's pick when the most votes for an award are tied. Organizer only, like votes. */
export interface CostumePick {
  gender: Gender;
  entrantId: string;
}

/** Voting stays closed until the organizer opens it, once the line-up is complete. */
export interface CostumeVoting {
  open: boolean;
  /** True once voting has been opened and then closed again (as opposed to not opened yet). */
  closed: boolean;
}

/** What the phone that cast a ballot can learn about it with its token: who voted, and in which awards. */
export interface BallotStatus {
  voterId: string;
  genders: Gender[];
}

export interface Snapshot {
  players: Player[];
  results: GameResult[];
  pairs: BracketPair[];
  matches: BracketMatch[];
  entrants: CostumeEntrant[];
  votes: CostumeVote[];
  picks: CostumePick[];
  voting: CostumeVoting;
  /** Everyone who has voted: a player id, or the entrant id of a guest who isn't playing. Public. */
  ballots: string[];
}

export type TableName = keyof Snapshot;

/** Every table, for loading and refreshing everything. The Record makes leaving one out a type error. */
const TABLE_SET: Record<TableName, true> = {
  players: true,
  results: true,
  pairs: true,
  matches: true,
  entrants: true,
  votes: true,
  picks: true,
  voting: true,
  ballots: true,
};
export const TABLE_NAMES = Object.keys(TABLE_SET) as TableName[];
