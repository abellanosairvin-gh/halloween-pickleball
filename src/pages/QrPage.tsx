import { QrCode } from '../components/QrCode';
import { TeamCrest } from '../components/TeamCrest';
import { TEAM_IDS } from '../domain/teams';
import { EVENT_NAME } from '../lib/event';
import { partyUrl, partyUrlIsLocal } from '../lib/partyUrl';

/**
 * The party page's QR code on its own page, opened in a new tab from the organizer's header so it
 * can be put on a big screen for guests to scan. Needs no sign-in: it only shows the public link.
 */
export function QrPage() {
  const url = partyUrl();

  return (
    <main className="qr-page">
      <h1 className="qr-page__title">{EVENT_NAME}</h1>
      <div className="qr-sheet__crests" aria-hidden="true">
        {TEAM_IDS.map((t) => (
          <span key={t} className={`qr-sheet__crest team-${t}`}>
            <TeamCrest team={t} size={34} />
          </span>
        ))}
      </div>
      <div className="qr-sheet__frame">
        <QrCode value={url} label="QR code for the party page" className="qr--page" />
      </div>
      <p className="qr-sheet__lede">Scan to check in and find out your team</p>
      <p className="qr-sheet__sub">Then follow the teams and the tournament live. No sign-in needed.</p>
      {partyUrlIsLocal() && (
        <p className="qr-sheet__warning" role="alert">
          This code points to this computer, so guests’ phones can’t open it. Open the deployed site to show it to
          guests.
        </p>
      )}
    </main>
  );
}
