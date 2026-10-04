import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { resetDemoData } from '../data/localRepo';
import { auth, isDemo } from '../lib/backend';
import { useEventData } from '../data/EventData';
import { ConfirmDialog } from './Dialog';

const TABS = [
  { to: '/players', label: 'Players', icon: 'M8 7a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM4 20c0-3.9 3.1-7 7-7s7 3.1 7 7z' },
  { to: '/teams', label: 'Teams', icon: 'M3 5h8v6H3zM13 5h8v6h-8zM3 13h8v6H3zM13 13h8v6h-8z' },
  {
    to: '/tournament',
    label: 'Tournament',
    icon: 'M7 3h10v3h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 15.9V18h3v3H8v-3h3v-2.1A5 5 0 0 1 8.3 13H8a4 4 0 0 1-4-4V6h3zm-1 5v1a2 2 0 0 0 1 1.7V8zm11 0v2.7A2 2 0 0 0 18 9V8z',
  },
];

export function AppShell() {
  const { data, loadError, reload } = useEventData();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__inner">
          <span className="wordmark">Irvin’s Halloween Pickleball Party</span>
          <button type="button" className="btn btn--quiet btn--small" onClick={() => void auth.signOut()}>
            Log out
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="Sections">
        <div className="tabs__inner">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className="tabs__link">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                <path d={t.icon} />
              </svg>
              <span>{t.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="page">
        {isDemo && (
          <p className="demo-note">
            Demo mode: changes are saved in this browser only.{' '}
            <button type="button" className="link-btn" onClick={() => setConfirmReset(true)}>
              Reset demo data
            </button>
          </p>
        )}
        {loadError ? (
          <div className="empty">
            <p>The player list didn’t load: {loadError}</p>
            <button type="button" className="btn" onClick={reload}>
              Try again
            </button>
          </div>
        ) : data ? (
          <Outlet />
        ) : (
          <div className="boot" aria-busy="true" aria-label="Loading" />
        )}
      </main>

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
    </div>
  );
}
