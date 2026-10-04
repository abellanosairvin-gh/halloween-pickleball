import { PARTY_PATHS, useAccess } from '../auth/Access';
import { useEventData } from '../data/EventData';
import { teamName } from '../domain/teams';
import { isDemo } from '../lib/backend';
import { Shell, TAB_ICONS } from './Shell';
import { TeamCrest } from './TeamCrest';

const TABS = [
  { to: PARTY_PATHS.players, label: 'Check in', icon: TAB_ICONS.players },
  { to: PARTY_PATHS.teams, label: 'Teams', icon: TAB_ICONS.teams },
  { to: PARTY_PATHS.tournament, label: 'Tournament', icon: TAB_ICONS.tournament },
];

/** The public page guests reach from the QR code: no sign-in, read-only apart from checking themselves in. */
export function PartyShell() {
  return <Shell tabs={TABS} notice={<PartyNotice />} />;
}

function PartyNotice() {
  const { data } = useEventData();
  const { meId, setMe } = useAccess();
  const me = data?.players.find((p) => p.id === meId);

  return (
    <>
      {isDemo && <p className="demo-note">Demo mode: check-ins here stay on this device.</p>}
      {me?.teamId && (
        <div className={`me-banner team-${me.teamId}`} role="status">
          <TeamCrest team={me.teamId} size={28} />
          <span className="me-banner__text">
            {me.name}, you’re on <strong>{teamName(me.teamId)}</strong>
          </span>
          <button type="button" className="me-banner__clear" onClick={() => setMe(null)}>
            Not you?
          </button>
        </div>
      )}
    </>
  );
}
