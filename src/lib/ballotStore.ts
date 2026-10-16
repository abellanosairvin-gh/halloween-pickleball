/**
 * The costume ballot this phone cast: who it voted as, and the token that lets it fill in an award it
 * lost. One phone, one ballot, even if the organizer later clears it.
 */
export interface StoredBallot {
  voterId: string;
  /** null for a ballot cast before tokens existed: the phone stays locked but can't fill anything in. */
  token: string | null;
}

const KEY = 'hpp-party-ballot-v1';
/** Before ballot tokens, the phone stored only the voter id here. */
const LEGACY_KEY = 'hpp-party-voted-v1';

export function readBallot(): StoredBallot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as StoredBallot;
    const legacy = localStorage.getItem(LEGACY_KEY);
    return legacy ? { voterId: legacy, token: null } : null;
  } catch {
    return null;
  }
}

export function writeBallot(ballot: StoredBallot) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ballot));
  } catch {
    // Storage unavailable: the server still refuses a second ballot under the same name.
  }
}

/** Demo reset only: a real phone keeps its ballot for the night. */
export function clearBallot() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Nothing stored.
  }
}
