import type { ReactNode } from 'react';
import { useEventData } from '../data/EventData';
import { entrantName } from '../domain/costume';
import { Dialog } from './Dialog';

/** A camera, for "add a photo" where there isn't one yet. */
export function CameraIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M9 3h6l1.8 2.5H20a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2h3.2zm3 5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm0 2a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z" />
    </svg>
  );
}

/**
 * Someone's costume photo, as big as the screen allows. Follows the live line-up, so a photo replaced or removed
 * while it's open updates here, and the dialog closes if they leave the line-up.
 */
export function PhotoViewer({
  entrantId,
  onClose,
  empty = 'There’s no photo of their costume any more.',
  actions,
}: {
  entrantId: string | null;
  onClose: () => void;
  /** Shown when they have no photo. */
  empty?: ReactNode;
  /** Replaces the Close button. */
  actions?: ReactNode;
}) {
  const { data } = useEventData();
  const entrant = data?.entrants.find((e) => e.id === entrantId) ?? null;
  const name = entrant && data ? entrantName(entrant, data.players) : '';

  return (
    <Dialog open={entrant !== null} onClose={onClose} title={name} className="photo-viewer">
      {entrant?.photoUrl ? (
        <img className="photo-viewer__img" src={entrant.photoUrl} alt={`${name}’s costume`} />
      ) : (
        <p className="dialog__text">{empty}</p>
      )}
      <div className="dialog__actions">
        {actions ?? (
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </Dialog>
  );
}
