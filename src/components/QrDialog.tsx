import { partyUrl, partyUrlIsLocal } from '../lib/partyUrl';
import { Dialog } from './Dialog';
import { QrCode } from './QrCode';
import { useToast } from './Toast';

/** Shows the party page's QR code so the organizer can put it on screen, copy the link or print a poster. */
export function QrDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const url = partyUrl();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.show('Link copied');
    } catch {
      toast.show('Copying isn’t allowed here. Select the link and copy it instead.', { tone: 'error' });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Party page QR code" className="dialog--qr">
      <p className="dialog__text">
        Guests scan this to check themselves in and follow the teams and tournament. No sign-in needed.
      </p>
      <QrCode value={url} label={`QR code for ${url}`} className="qr--dialog" />
      <p className="qr-link">{url}</p>
      {partyUrlIsLocal() && (
        <p className="form-error">
          This link points to this computer, so guests’ phones can’t open it. Deploy the site, or set VITE_PUBLIC_URL to
          its address, before printing.
        </p>
      )}
      <div className="dialog__actions">
        <button type="button" className="btn btn--quiet" onClick={() => void copy()}>
          Copy link
        </button>
        <a className="btn btn--quiet" href={url} target="_blank" rel="noreferrer">
          Open party page
        </a>
        <a className="btn btn--primary" href="/qr" target="_blank" rel="noreferrer">
          Print poster
        </a>
      </div>
    </Dialog>
  );
}
