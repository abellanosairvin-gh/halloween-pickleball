import type { PlayerDraft } from '../domain/roster';
import type { BracketId, BracketPair, GameResult, MatchKey, Outcome, Player, Snapshot, TableName, TeamId } from '../domain/types';

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
}

/** The organizer's sign-in. There's one shared organizer password, so there are no user accounts. */
export interface AuthClient {
  isSignedIn(): Promise<boolean>;
  signIn(password: string): Promise<void>;
  signOut(): Promise<void>;
  onChange(cb: (signedIn: boolean) => void): () => void;
}
