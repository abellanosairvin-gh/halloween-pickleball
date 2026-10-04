import { useCallback, useMemo, useState } from 'react';
import { CheckInReveal, type Reveal } from '../components/CheckInReveal';
import { Dialog } from '../components/Dialog';
import { PlayerForm } from '../components/PlayerForm';
import { TeamCrest } from '../components/TeamCrest';
import { SkillMark } from '../components/SkillMark';
import { useEventData } from '../data/EventData';
import { lockedPairMessage, lockedPairPlayerIds } from '../domain/roster';
import { compareForRoster, recordOf } from '../domain/standings';
import { GENDER_LABEL, TEAMS, teamName } from '../domain/teams';
import type { Gender, Player } from '../domain/types';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export function PlayersPage() {
  const { data, run } = useEventData();
  const players = data!.players;
  const [query, setQuery] = useState('');
  const [onlyWaiting, setOnlyWaiting] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [formTarget, setFormTarget] = useState<Player | 'new' | null>(null);

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
  };

  const closeReveal = useCallback(() => setReveal(null), []);
  const selected = players.find((p) => p.id === selectedId) ?? null;

  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Players</h1>
        <p className="page-meta">
          <strong>{checkedIn}</strong> of {players.length} checked in.{' '}
          {editMode
            ? 'Tap a player to change their details or delete them.'
            : 'Tap a name to check them in, or tap a checked-in player to change their team.'}
        </p>
        <ArrivalRoll players={players} />
      </header>

      <div className="toolbar">
        <label className="search">
          <span className="visually-hidden">Find a player</span>
          <input
            className="input"
            type="search"
            placeholder="Find a player"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="toggle">
          <input type="checkbox" checked={onlyWaiting} onChange={(e) => setOnlyWaiting(e.target.checked)} />
          <span>Not checked in</span>
        </label>
        <div className="toolbar__actions">
          {editMode && (
            <button type="button" className="btn btn--primary btn--small" onClick={() => setFormTarget('new')}>
              Add player
            </button>
          )}
          <button
            type="button"
            className="btn btn--small"
            aria-pressed={editMode}
            onClick={() => setEditMode((on) => !on)}
          >
            {editMode ? 'Done editing' : 'Edit list'}
          </button>
        </div>
      </div>

      <div className={`roster-columns ${editMode ? 'is-editing' : ''}`}>
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
                    ? `No ${GENDER_LABEL[gender].toLowerCase()} on the list yet. Use Edit list to add players.`
                    : onlyWaiting && !query
                      ? `All ${GENDER_LABEL[gender].toLowerCase()} are checked in.`
                      : 'No names match.'}
                </p>
              ) : (
                <ul className="roster__list">
                  {group.map((p) => (
                    <li key={p.id}>
                      {editMode ? (
                        <button
                          type="button"
                          className={`roster__row ${p.checkedInAt ? 'is-in' : ''}`}
                          onClick={() => setFormTarget(p)}
                          aria-label={`Edit ${p.name}`}
                        >
                          <SkillMark skill={p.skill} />
                          <span className="roster__name">{p.name}</span>
                          <span className="roster__edit" aria-hidden="true">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" focusable="false">
                              <path d="M15.2 4.2l4.6 4.6L8.6 20H4v-4.6zm2.1-2.1 1.4-1.4a1.5 1.5 0 0 1 2.1 0l2.5 2.5a1.5 1.5 0 0 1 0 2.1l-1.4 1.4z" />
                            </svg>
                            <span className="roster__edit-label">Edit</span>
                          </span>
                        </button>
                      ) : p.checkedInAt && p.teamId ? (
                        <button
                          type="button"
                          className="roster__row is-in"
                          onClick={() => setSelectedId(p.id)}
                          aria-label={`${p.name}, ${teamName(p.teamId)}. Change team or undo check-in`}
                        >
                          <SkillMark skill={p.skill} />
                          <span className="roster__name">{p.name}</span>
                          <span className={`roster__team team-${p.teamId}`}>
                            <TeamCrest team={p.teamId} size={16} />
                            <span className="roster__team-name">{teamName(p.teamId)}</span>
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="roster__row"
                          disabled={busyId !== null}
                          onClick={() => void checkIn(p)}
                          aria-label={`Check in ${p.name}`}
                        >
                          <SkillMark skill={p.skill} />
                          <span className="roster__name">{p.name}</span>
                          <span className="roster__checkin" aria-hidden="true">
                            <span className="roster__checkin-label">Check in</span>
                          </span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <CheckInReveal reveal={reveal} onDone={closeReveal} />
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

  const close = () => {
    setConfirmUndo(false);
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

      {confirmUndo ? (
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
                onClick={() => {
                  void run(['players'], (r) => r.moveToTeam(player.id, t.id));
                  close();
                }}
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
