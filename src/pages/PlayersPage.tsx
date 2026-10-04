import { useCallback, useMemo, useState } from 'react';
import { useAccess } from '../auth/Access';
import { CheckInReveal, type Reveal } from '../components/CheckInReveal';
import { Dialog } from '../components/Dialog';
import { EditIcon } from '../components/EditIcon';
import { PlayerForm } from '../components/PlayerForm';
import { TeamCrest } from '../components/TeamCrest';
import { SkillMark } from '../components/SkillMark';
import { useEventData } from '../data/EventData';
import { lockedPairMessage, lockedPairPlayerIds } from '../domain/roster';
import { compareForRoster, recordOf } from '../domain/standings';
import { GENDER_LABEL, TEAMS, teamName } from '../domain/teams';
import type { Gender, Player, TeamId } from '../domain/types';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export function PlayersPage() {
  const { data, run } = useEventData();
  const { canEdit, setMe, meId } = useAccess();
  const players = data!.players;
  const [query, setQuery] = useState('');
  const [onlyWaiting, setOnlyWaiting] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formTarget, setFormTarget] = useState<Player | 'new' | null>(null);
  /** Party page only: the name a guest tapped, waiting for "Check me in". */
  const [confirmSelf, setConfirmSelf] = useState<Player | null>(null);

  const checkedIn = players.filter((p) => p.checkedInAt).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players
      .filter((p) => (!q || p.name.toLowerCase().includes(q)) && (!onlyWaiting || !p.checkedInAt))
      .sort(compareForRoster);
  }, [players, query, onlyWaiting]);

  const checkIn = async (p: Player) => {
    setBusyId(p.id);
    setReveal({ playerName: p.name, team: null });
    const team = await run(['players'], (r) => r.checkIn(p.id));
    setBusyId(null);
    setReveal(team ? { playerName: p.name, team } : null);
    if (team && !canEdit) setMe(p.id);
  };

  const closeReveal = useCallback(() => setReveal(null), []);
  const selected = players.find((p) => p.id === selectedId) ?? null;

  return (
    <>
      <header className="page-head">
        <h1 className="page-title">{canEdit ? 'Players' : 'Check in'}</h1>
        <p className="page-meta">
          <strong>{checkedIn}</strong> of {players.length} checked in.{' '}
          {canEdit
            ? 'Check players in as they arrive. Use Edit to change a player’s team, details or check-in.'
            : 'Find your name and tap Check in. You’ll be put on a team right away.'}
        </p>
        <ArrivalRoll players={players} />
      </header>

      <div className="toolbar">
        <label className="search">
          <span className="visually-hidden">{canEdit ? 'Find a player' : 'Find your name'}</span>
          <input
            className="input"
            type="search"
            placeholder={canEdit ? 'Find a player' : 'Find your name'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="toggle">
          <input type="checkbox" checked={onlyWaiting} onChange={(e) => setOnlyWaiting(e.target.checked)} />
          <span>Not checked in</span>
        </label>
        {canEdit && (
          <div className="toolbar__actions">
            <button type="button" className="btn btn--small" onClick={() => setFormTarget('new')}>
              Add player
            </button>
          </div>
        )}
      </div>

      <div className="roster-columns">
        {(['F', 'M'] as Gender[]).map((gender) => {
          const group = visible.filter((p) => p.gender === gender);
          const all = players.filter((p) => p.gender === gender);
          return (
            <section key={gender} className="roster" aria-labelledby={`roster-${gender}`}>
              <h2 id={`roster-${gender}`} className="roster__title">
                {GENDER_LABEL[gender]}
                <span className="section-count">
                  {all.filter((p) => p.checkedInAt).length} of {all.length}
                </span>
              </h2>
              {group.length === 0 ? (
                <p className="roster__empty">
                  {all.length === 0
                    ? `No ${GENDER_LABEL[gender].toLowerCase()} on the list yet.${canEdit ? ' Use Add player to add some.' : ''}`
                    : onlyWaiting && !query
                      ? `All ${GENDER_LABEL[gender].toLowerCase()} are checked in.`
                      : 'No names match.'}
                </p>
              ) : (
                <ul className="roster__list">
                  {group.map((p) => {
                    const isIn = Boolean(p.checkedInAt && p.teamId);
                    return (
                      <li key={p.id}>
                        <div
                          className={`roster__row ${canEdit ? '' : 'roster__row--plain'} ${isIn ? `is-in team-${p.teamId}` : ''} ${
                            p.id === meId ? 'is-me' : ''
                          }`}
                        >
                          {canEdit && <SkillMark skill={p.skill} />}
                          <span className="roster__name">
                            {p.name}
                            {p.id === meId && <span className="visually-hidden"> (you)</span>}
                          </span>
                          <span className="roster__actions">
                            {isIn ? (
                              <span className={`roster__team team-${p.teamId}`}>
                                <TeamCrest team={p.teamId!} size={26} />
                                <span className="roster__team-name">{teamName(p.teamId!)}</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="roster__btn"
                                disabled={busyId !== null}
                                onClick={() => (canEdit ? void checkIn(p) : setConfirmSelf(p))}
                                aria-label={`Check in ${p.name}`}
                              >
                                <span className="roster__checkin" aria-hidden="true">
                                  <span className="roster__checkin-label">Check in</span>
                                </span>
                              </button>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                className="roster__btn"
                                onClick={() => (isIn ? setSelectedId(p.id) : setFormTarget(p))}
                                aria-label={
                                  isIn ? `Edit ${p.name}: change team, undo check-in or edit details` : `Edit ${p.name}`
                                }
                              >
                                <span className="roster__edit" aria-hidden="true">
                                  <EditIcon />
                                  <span className="roster__edit-label">Edit</span>
                                </span>
                              </button>
                            )}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <CheckInReveal reveal={reveal} onDone={closeReveal} />
      <Dialog open={confirmSelf !== null} onClose={() => setConfirmSelf(null)} title={`Check in as ${confirmSelf?.name ?? ''}?`}>
        <p className="dialog__text">
          You’ll be put on a team right away. If this isn’t you, tap Cancel and find your own name.
        </p>
        <div className="dialog__actions">
          <button type="button" className="btn btn--quiet" onClick={() => setConfirmSelf(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              const p = confirmSelf;
              setConfirmSelf(null);
              if (p) void checkIn(p);
            }}
          >
            Check me in
          </button>
        </div>
      </Dialog>
      <PlayerSheet
        player={selected}
        onClose={() => setSelectedId(null)}
        onEdit={(p) => {
          setSelectedId(null);
          setFormTarget(p);
        }}
      />
      <PlayerForm target={formTarget} onClose={() => setFormTarget(null)} />
    </>
  );
}

/** One cell per player, filled in team colour in arrival order: the night's check-in progress at a glance. */
function ArrivalRoll({ players }: { players: Player[] }) {
  const arrived = players
    .filter((p) => p.checkedInAt)
    .sort((a, b) => a.checkedInAt!.localeCompare(b.checkedInAt!));
  const waiting = players.length - arrived.length;
  return (
    <ol className="roll" aria-label="Check-in order">
      {arrived.map((p) => (
        <li key={p.id} className={`roll__cell team-${p.teamId}`} title={`${p.name}, ${teamName(p.teamId!)}`}>
          <span className="visually-hidden">
            {p.name}, {teamName(p.teamId!)}
          </span>
        </li>
      ))}
      {Array.from({ length: waiting }, (_, i) => (
        <li key={`waiting-${i}`} className="roll__cell roll__cell--empty" aria-hidden="true" />
      ))}
    </ol>
  );
}

function PlayerSheet({
  player,
  onClose,
  onEdit,
}: {
  player: Player | null;
  onClose: () => void;
  onEdit: (player: Player) => void;
}) {
  const { data, run, records } = useEventData();
  const [confirmUndo, setConfirmUndo] = useState(false);
  /** A team tapped in "Move to another team", waiting for confirmation. */
  const [moveTo, setMoveTo] = useState<TeamId | null>(null);

  const close = () => {
    setConfirmUndo(false);
    setMoveTo(null);
    onClose();
  };

  if (!player?.checkedInAt || !player.teamId) return <Dialog open={false} onClose={close} title="" children={null} />;
  const games = recordOf(records, player.id).games;
  const locked = lockedPairPlayerIds(data!.pairs).has(player.id);

  return (
    <Dialog open onClose={close} title={player.name}>
      <p className="dialog__text">
        Checked in at {timeFormat.format(new Date(player.checkedInAt))} and playing for {teamName(player.teamId)}.
      </p>

      {moveTo ? (
        <>
          <p className="dialog__text">
            Move {player.name} from {teamName(player.teamId)} to {teamName(moveTo)}?
            {games > 0 &&
              ` Their ${games} recorded ${games === 1 ? 'game moves' : 'games move'} with them, which changes both teams’ win rates.`}
          </p>
          <div className="dialog__actions">
            <button type="button" className="btn btn--quiet" onClick={() => setMoveTo(null)}>
              Keep on {teamName(player.teamId)}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                void run(['players'], (r) => r.moveToTeam(player.id, moveTo));
                close();
              }}
            >
              Move to {teamName(moveTo)}
            </button>
          </div>
        </>
      ) : confirmUndo ? (
        <>
          <p className="dialog__text">
            Undo {player.name}’s check-in? They’ll leave {teamName(player.teamId)} and go back to the not-checked-in list.
            {games > 0 && ` Their ${games} recorded ${games === 1 ? 'game stays' : 'games stay'} on record.`}
          </p>
          <div className="dialog__actions">
            <button type="button" className="btn btn--quiet" onClick={() => setConfirmUndo(false)}>
              Keep check-in
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                void run(['players'], (r) => r.undoCheckIn(player.id));
                close();
              }}
            >
              Undo check-in
            </button>
          </div>
        </>
      ) : (
        <>
          <h3 className="dialog__subtitle">Move to another team</h3>
          {locked && <p className="dialog__text">{lockedPairMessage(player.name)}</p>}
          <div className="team-picker">
            {TEAMS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`team-picker__btn team-${t.id}`}
                aria-pressed={player.teamId === t.id}
                disabled={locked || player.teamId === t.id}
                onClick={() => setMoveTo(t.id)}
              >
                <TeamCrest team={t.id} size={22} />
                {t.name}
              </button>
            ))}
          </div>
          <div className="dialog__actions">
            <button type="button" className="btn btn--danger-quiet" disabled={locked} onClick={() => setConfirmUndo(true)}>
              Undo check-in
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => onEdit(player)}>
              Edit details
            </button>
            <button type="button" className="btn btn--quiet" onClick={close}>
              Done
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
