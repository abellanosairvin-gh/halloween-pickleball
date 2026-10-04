import { TEAM_IDS } from '../domain/teams';
import { EVENT_NAME } from '../lib/event';
import { partyUrl, partyUrlIsLocal } from '../lib/partyUrl';
import { Dialog } from './Dialog';
import { QrCode } from './QrCode';
import { TeamCrest } from './TeamCrest';

/** The party page's QR code, styled for showing on the organizer's screen for guests to scan. */
export function QrDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const url = partyUrl();

  return (
    <Dialog open={open} onClose={onClose} title={EVENT_NAME} className="dialog--qr">
      <div className="qr-sheet__crests" aria-hidden="true">
        {TEAM_IDS.map((t) => (
          <span key={t} className={`qr-sheet__crest team-${t}`}>
            <TeamCrest team={t} size={26} />
          </span>
        ))}
      </div>
      <div className="qr-sheet__frame">
        <QrCode value={url} label="QR code for the party page" className="qr--dialog" />
      </div>
      <p className="qr-sheet__lede">Scan to check in and find out your team</p>
      <p className="qr-sheet__sub">Then follow the teams and the tournament live. No sign-in needed.</p>
      {partyUrlIsLocal() && (
        <p className="qr-sheet__warning" role="alert">
          This code points to this computer, so guests’ phones can’t open it. Open the deployed site to show it to
          guests.
        </p>
      )}
      <div className="dialog__actions">
        <button type="button" className="btn btn--block qr-sheet__close" onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  );
}
