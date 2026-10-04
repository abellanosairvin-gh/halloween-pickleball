import { useEffect, useRef } from 'react';
import { teamName } from '../domain/teams';
import type { TeamId } from '../domain/types';
import { TeamCrest } from './TeamCrest';

export interface Reveal {
  playerName: string;
  /** null while the server is still choosing the team. */
  team: TeamId | null;
}

/** Long enough for the spins (2.4s) and a couple of seconds to read the team. */
const SHOW_FOR_MS = 4600;

/**
 * The one big moment: a card spins three times from the player's name and lands on their new team.
 * Tap anywhere or press Escape to close early. Reused by the future QR check-in page.
 */
export function CheckInReveal({ reveal, onDone }: { reveal: Reveal | null; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reveal && !el.open) el.showModal();
    if (!reveal && el.open) el.close();
  }, [reveal]);

  useEffect(() => {
    if (!reveal?.team) return;
    const t = window.setTimeout(onDone, SHOW_FOR_MS);
    return () => window.clearTimeout(t);
  }, [reveal, onDone]);

  return (
    <dialog
      ref={ref}
      className="reveal"
      // The close event arrives a tick late; ignore it if a new reveal has already reopened the dialog.
      onClose={() => !ref.current?.open && onDone()}
      onClick={onDone}
      aria-label="Team assignment"
    >
      {reveal && (
        <div className={`reveal__card ${reveal.team ? 'is-flipped' : ''}`}>
          <div className="reveal__face reveal__face--back" aria-hidden={Boolean(reveal.team)}>
            <span className="reveal__name">{reveal.playerName}</span>
            <span className="reveal__hint">Choosing a team…</span>
          </div>
          {reveal.team && (
            <div className={`reveal__face reveal__face--front team-${reveal.team}`} role="status">
              <TeamCrest team={reveal.team} size={120} className="reveal__crest" />
              <span className="reveal__joins">{reveal.playerName} joins</span>
              <span className="reveal__team">{teamName(reveal.team)}</span>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
