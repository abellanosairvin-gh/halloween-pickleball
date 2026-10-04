import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

export interface Paths {
  players: string;
  teams: string;
  tournament: string;
}

interface AccessValue {
  /** Organizer screens can change data. The public party page only reads, plus self check-in. */
  canEdit: boolean;
  paths: Paths;
  /** On the party page: the player this phone checked in, so we can greet them and highlight their row. */
  meId: string | null;
  setMe: (playerId: string | null) => void;
}

export const ORGANIZER_PATHS: Paths = { players: '/players', teams: '/teams', tournament: '/tournament' };
export const PARTY_PATHS: Paths = { players: '/party/checkin', teams: '/party/teams', tournament: '/party/tournament' };

const ME_KEY = 'hpp-party-me-v1';

function readMe(): string | null {
  try {
    return localStorage.getItem(ME_KEY);
  } catch {
    return null;
  }
}

function writeMe(id: string | null) {
  try {
    if (id) localStorage.setItem(ME_KEY, id);
    else localStorage.removeItem(ME_KEY);
  } catch {
    // Storage unavailable: the greeting just won't survive a reload.
  }
}

const AccessContext = createContext<AccessValue>({
  canEdit: true,
  paths: ORGANIZER_PATHS,
  meId: null,
  setMe: () => {},
});

export function OrganizerAccess({ children }: { children: ReactNode }) {
  const value = useMemo(() => ({ canEdit: true, paths: ORGANIZER_PATHS, meId: null, setMe: () => {} }), []);
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function PartyAccess({ children }: { children: ReactNode }) {
  const [meId, setMeId] = useState<string | null>(readMe);
  const setMe = useCallback((id: string | null) => {
    writeMe(id);
    setMeId(id);
  }, []);
  const value = useMemo(() => ({ canEdit: false, paths: PARTY_PATHS, meId, setMe }), [meId, setMe]);
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export const useAccess = () => useContext(AccessContext);
