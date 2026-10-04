import { QrCode } from '../components/QrCode';
import { EVENT_NAME } from '../lib/event';
import { partyUrl, partyUrlIsLocal } from '../lib/partyUrl';

/** Candlelit parchment instead of stark white, so the code sits in the artwork's glow and still scans. */
const QR_PARCHMENT = '#e9dcbc';

/**
 * The party page's QR code on its own page, opened in a new tab from the organizer's header so it
 * can be put on a big screen for guests to scan. Needs no sign-in: it only shows the public link.
 */
export function QrPage() {
  const url = partyUrl();

  return (
    <main className="qr-page">
      <h1 className="visually-hidden">{EVENT_NAME}</h1>
      <div className="qr-page__stage">
        <div className="qr-page__poster">
          <img
            className="qr-page__art"
            src="/images/qr-cursed-manor.webp"
            width="1024"
            height="1536"
            alt=""
            fetchPriority="high"
          />
          {/* Tints the artwork's white panel to parchment while letting Dracula's fingertips show through. */}
          <span className="qr-page__panel" aria-hidden="true" />
          {/* The opaque link covers the entire sample code, even while the real SVG is loading. */}
          <a className="qr-page__door" href={url} aria-label="Open party check-in">
            <QrCode value={url} label="QR code for the party page" className="qr--page" light={QR_PARCHMENT} />
          </a>
          <p className="visually-hidden">Scan me to check in. Find your team. Join the fun. No sign-in needed.</p>
        </div>
      </div>
      {partyUrlIsLocal() && (
        <p className="qr-sheet__warning" role="alert">
          This code points to this computer, so guests’ phones can’t open it. Open the deployed site to show it to
          guests.
        </p>
      )}
    </main>
  );
}
