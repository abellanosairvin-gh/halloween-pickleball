import { Dialog } from './Dialog';

/** A camera, for "add a photo" where there isn't one yet. */
export function CameraIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M9 3h6l1.8 2.5H20a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2h3.2zm3 5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm0 2a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z" />
    </svg>
  );
}

/** Someone's costume photo, as big as the screen allows. */
export function PhotoViewer({ photo, onClose }: { photo: { url: string; name: string } | null; onClose: () => void }) {
  return (
    <Dialog open={photo !== null} onClose={onClose} title={photo?.name ?? ''} className="photo-viewer">
      {photo && <img className="photo-viewer__img" src={photo.url} alt={`${photo.name}’s costume`} />}
      <div className="dialog__actions">
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  );
}
