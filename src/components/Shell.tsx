import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useEventData } from '../data/EventData';
import { EVENT_NAME, EVENT_SUBTITLE } from '../lib/event';

export const TAB_ICONS = {
  players: 'M8 7a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM4 20c0-3.9 3.1-7 7-7s7 3.1 7 7z',
  teams: 'M3 5h8v6H3zM13 5h8v6h-8zM3 13h8v6H3zM13 13h8v6h-8z',
  tournament:
    'M7 3h10v3h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 15.9V18h3v3H8v-3h3v-2.1A5 5 0 0 1 8.3 13H8a4 4 0 0 1-4-4V6h3zm-1 5v1a2 2 0 0 0 1 1.7V8zm11 0v2.7A2 2 0 0 0 18 9V8z',
  // A masquerade mask; the eyes wind the other way so they show as holes.
  costume:
    'M2 8c0-1.1.9-2 2-2h16a2 2 0 0 1 2 2v2.5c0 3.6-2.5 6.5-5.5 6.5-1.9 0-3.3-1-4.5-2.6C10.8 16 9.4 17 7.5 17 4.5 17 2 14.1 2 10.5zm4 1a1.5 1.5 0 0 0 0 3h2.5a1.5 1.5 0 0 0 0-3zm9.5 0a1.5 1.5 0 0 0 0 3H18a1.5 1.5 0 0 0 0-3z',
};

export interface Tab {
  to: string;
  label: string;
  icon: string;
}

/** Header, tab bar and page frame shared by the organizer screens and the public party page. */
export function Shell({ tabs, actions, notice }: { tabs: Tab[]; actions?: ReactNode; notice?: ReactNode }) {
  const { data, loadError, reload } = useEventData();

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__inner">
          <div className="brand">
            <span className="wordmark">{EVENT_NAME}</span>
            <span className="brand__subtitle">{EVENT_SUBTITLE}</span>
          </div>
          {actions && <div className="topbar__actions">{actions}</div>}
        </div>
      </header>

      <nav className="tabs" aria-label="Sections">
        <div className="tabs__inner">
          {tabs.map((t) => (
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
        {notice}
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
    </div>
  );
}
