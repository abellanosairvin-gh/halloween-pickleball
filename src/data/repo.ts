import type { PlayerDraft } from '../domain/roster';
import type { ShrunkPhoto } from '../lib/photo';
import type {
  BallotStatus,
  BracketId,
  BracketPair,
  CostumeEntrant,
  GameResult,
  Gender,
  MatchKey,
  Outcome,
  Player,
  Snapshot,
  TableName,
  TeamId,
} from '../domain/types';

/** Everything the screens read and write. Implemented by the API (Neon) and by the local demo store. */
export interface Repo {
  fetchAll(): Promise<Snapshot>;
  fetchTable<T extends TableName>(table: T): Promise<Snapshot[T]>;
  /** Calls back with the table that changed, from this tab or anywhere else. Returns an unsubscribe. */
  subscribe(onChange: (table: TableName) => void): () => void;

  addPlayer(draft: PlayerDraft): Promise<Player>;
  updatePlayer(playerId: string, draft: PlayerDraft): Promise<void>;
  /** Also deletes the player's recorded results. */
  deletePlayer(playerId: string): Promise<void>;

  checkIn(playerId: string): Promise<TeamId>;
  undoCheckIn(playerId: string): Promise<void>;
  moveToTeam(playerId: string, teamId: TeamId): Promise<void>;

  addResult(playerId: string, outcome: Outcome): Promise<GameResult>;
  deleteResult(resultId: string): Promise<void>;

  setBracketPairs(bracket: BracketId, pairs: BracketPair[]): Promise<void>;
  setMatchWinner(bracket: BracketId, match: MatchKey, winnerSlot: number | null): Promise<void>;
  resetBracket(bracket: BracketId): Promise<void>;

  /**
   * Best in Costume. A voter is a player id, or the entrant id of a guest who isn't playing. Open to guests.
   * Pass the ballot's token to fill in an award the ballot lost. Resolves to the ballot's token.
   */
  castVotes(voterId: string, femaleId: string | null, maleId: string | null, token: string | null): Promise<string>;
  /** The ballot a phone cast, by its token; null once the organizer has cleared it. */
  ballotStatus(token: string): Promise<BallotStatus | null>;
  addCostumePlayer(playerId: string): Promise<CostumeEntrant>;
  addCostumeGuest(name: string, gender: Gender): Promise<CostumeEntrant>;
  /** Adds or replaces the photo of someone in the line-up, or removes it when photo is null. */
  setCostumePhoto(entrantId: string, photo: ShrunkPhoto | null): Promise<void>;
  /** Also deletes the votes they received, and the votes they cast if they're a guest. */
  removeCostumeEntrant(entrantId: string): Promise<void>;
  /** Clears a voter's ballot and votes so they can vote again. */
  clearCostumeVotes(voterId: string): Promise<void>;
  /** Opens or closes voting. Opening needs at least one woman and one man in the line-up. */
  setCostumeVoting(open: boolean): Promise<void>;
  /** The organizer's winner among tied leaders, or null to clear it. */
  setCostumePick(gender: Gender, entrantId: string | null): Promise<void>;
}

/** The organizer's sign-in. There's one shared organizer password, so there are no user accounts. */
export interface AuthClient {
  isSignedIn(): Promise<boolean>;
  signIn(password: string): Promise<void>;
  signOut(): Promise<void>;
  onChange(cb: (signedIn: boolean) => void): () => void;
}
