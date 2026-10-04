import { QrCode } from '../components/QrCode';
import { TeamCrest } from '../components/TeamCrest';
import { TEAM_IDS } from '../domain/teams';
import { partyUrl, partyUrlIsLocal } from '../lib/partyUrl';

/** A printable sign for the venue: scan to check in. */
export function QrPosterPage() {
  const url = partyUrl();
  return (
    <main className="poster">
      <div className="poster__toolbar">
        {partyUrlIsLocal() && (
          <p className="form-error">
            This QR points to this computer, so guests’ phones can’t open it. Deploy the site or set VITE_PUBLIC_URL first.
          </p>
        )}
        <button type="button" className="btn btn--primary" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <div className="poster__sheet">
        <h1 className="poster__title">Irvin’s Halloween Pickleball Party</h1>
        <div className="poster__crests" aria-hidden="true">
          {TEAM_IDS.map((t) => (
            <span key={t} className={`poster__crest team-${t}`}>
              <TeamCrest team={t} size={34} />
            </span>
          ))}
        </div>
        <QrCode value={url} label={`QR code for ${url}`} className="qr--poster" />
        <p className="poster__lede">Scan to check in and find out your team</p>
        <p className="poster__sub">Then follow the team standings and the tournament bracket live.</p>
        <p className="poster__url">{url}</p>
      </div>
    </main>
  );
}
