import { useState } from 'react';
import { ORGANIZER_PATHS } from '../auth/Access';
import { resetDemoData } from '../data/localRepo';
import { auth, isDemo } from '../lib/backend';
import { ConfirmDialog } from './Dialog';
import { QrDialog } from './QrDialog';
import { Shell, TAB_ICONS } from './Shell';

const TABS = [
  { to: ORGANIZER_PATHS.players, label: 'Players', icon: TAB_ICONS.players },
  { to: ORGANIZER_PATHS.teams, label: 'Teams', icon: TAB_ICONS.teams },
  { to: ORGANIZER_PATHS.tournament, label: 'Tournament', icon: TAB_ICONS.tournament },
];

export function AppShell() {
  const [confirmReset, setConfirmReset] = useState(false);
  const [showQr, setShowQr] = useState(false);

  return (
    <>
      <Shell
        tabs={TABS}
        actions={
          <>
            <button type="button" className="btn btn--small" onClick={() => setShowQr(true)} aria-label="QR code">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                <path d="M3 3h8v8H3zm2 2v4h4V5zm8-2h8v8h-8zm2 2v4h4V5zM3 13h8v8H3zm2 2v4h4v-4zm8-2h3v3h-3zm5 0h3v3h-3zm-5 5h3v3h-3zm5 0h3v3h-3zm-2.5-2.5h3v3h-3z" />
              </svg>
              <span className="topbar__qr-label">QR code</span>
            </button>
            <button type="button" className="btn btn--quiet btn--small" onClick={() => void auth.signOut()}>
              Log out
            </button>
          </>
        }
        notice={
          isDemo && (
            <p className="demo-note">
              Demo mode: changes are saved in this browser only.{' '}
              <button type="button" className="link-btn" onClick={() => setConfirmReset(true)}>
                Reset demo data
              </button>
            </p>
          )
        }
      />

      <QrDialog open={showQr} onClose={() => setShowQr(false)} />

      <ConfirmDialog
        open={confirmReset}
        title="Reset demo data?"
        message="This clears every check-in, result and bracket in this browser and reloads the spreadsheet roster."
        confirmLabel="Reset demo data"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          resetDemoData();
          window.location.reload();
        }}
      />
    </>
  );
}
