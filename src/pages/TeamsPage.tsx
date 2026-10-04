import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccess } from '../auth/Access';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { EditIcon } from '../components/EditIcon';
import { TeamCrest } from '../components/TeamCrest';
import { useToast } from '../components/Toast';
import { useEventData } from '../data/EventData';
import {
  compareByStanding,
  formatRate,
  formatRecord,
  MIN_PAIR_GAMES,
  pairPicture,
  rankTeams,
  recordOf,
  teamMembers,
  teamRecord,
} from '../domain/standings';
import { SIMULATED_GAMES, simulatedResults } from '../domain/simulate';
import { GENDER_LABEL, TEAMS, teamName } from '../domain/teams';
import type { Gender, Outcome, Player, TeamId } from '../domain/types';

const ORDINAL = ['1st', '2nd', '3rd', '4th'];

/** Most recent results rendered in the history strip; narrow screens clip the oldest of these. */
const HISTORY_SHOWN = 30;

export function TeamsPage() {
  const { data, records, run } = useEventData();
  const { canEdit } = useAccess();
  const players = data!.players;
  const standings = rankTeams(players, records, data!.results);
  const anyGames = standings.some((s) => s.record.games > 0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ player: Player; outcome: Outcome } | null>(null);
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [confirmSimulate, setConfirmSimulate] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const toast = useToast();

  const checkedIn = players.filter((p) => p.teamId).length;
  const simulatedCount = data!.results.filter((r) => r.simulated).length;

  const simulate = async () => {
    const added = await run(['results'], (r) => r.addSimulatedResults(simulatedResults(players)));
    if (added) toast.show(`Added ${added} simulated results`);
  };
  const clearSimulated = async () => {
    const removed = await run(['results'], (r) => r.clearSimulatedResults());
    if (removed !== undefined) toast.show(`Cleared ${removed} simulated results`);
  };

  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Teams</h1>
        {!anyGames && (
          <p className="page-meta">
            {canEdit
              ? 'Win rates appear once results are recorded. Add a win or loss next to a player after each game.'
              : 'Win rates appear here as games are played. The team with the best win rate wins the prize.'}
          </p>
        )}
        {canEdit && anyGames && (
          <p className="page-meta pair-legend">
            <span className="pair-legend__swatch pair-legend__swatch--top" aria-hidden="true" /> Each team’s top 2 women
            and men with {MIN_PAIR_GAMES}+ games, who’d make the tournament pairs.{' '}
            <span className="pair-legend__swatch pair-legend__swatch--tied" aria-hidden="true" /> <strong>Tie</strong>:
            level on win rate for the last spot. Choose who moves on with Change on the Tournament tab.
          </p>
        )}
        {canEdit && simulatedCount > 0 && (
          <p className="page-meta">
            Includes {simulatedCount} simulated {simulatedCount === 1 ? 'result' : 'results'}. Clear them before the
            real games start.
          </p>
        )}
        {canEdit && (
        <div className="page-actions">
          <button type="button" className="btn btn--small" disabled={checkedIn === 0} onClick={() => setConfirmSimulate(true)}>
            Simulate {SIMULATED_GAMES} games
          </button>
          {simulatedCount > 0 && (
            <button type="button" className="btn btn--small btn--danger-quiet" onClick={() => setConfirmClear(true)}>
              Clear simulated results
            </button>
          )}
        </div>
        )}
      </header>

      <ol className="standings" aria-label="Team standings by win rate">
        {standings.map((s, i) => (
          <li key={s.teamId} className={`standings__row team-${s.teamId} ${i === 0 && anyGames ? 'is-leader' : ''}`}>
            <a className="standings__link" href={`#team-${s.teamId}`}>
              <span className="standings__rank">{anyGames ? ORDINAL[i] : '–'}</span>
              <TeamCrest team={s.teamId} size={40} className="standings__crest" />
              <span className="standings__name">{teamName(s.teamId)}</span>
              <span className="standings__bar" aria-hidden="true">
                <span className="standings__fill" style={{ inlineSize: `${(s.record.rate ?? 0) * 100}%` }} />
              </span>
              <span className="standings__score">
                <span className="standings__rate">{formatRate(s.record.rate)}</span>
                <span className="standings__record">{formatRecord(s.record)}</span>
              </span>
            </a>
          </li>
        ))}
      </ol>

      <nav className="jump" aria-label="Jump to team">
        {TEAMS.map((t) => (
          <a key={t.id} className={`jump__link team-${t.id}`} href={`#team-${t.id}`}>
            <TeamCrest team={t.id} size={20} labelled />
          </a>
        ))}
      </nav>

      <div className="team-grid">
        {TEAMS.map((t) => (
          <TeamPanel
            key={t.id}
            teamId={t.id}
            players={players}
            onEditRecord={setEditingId}
            onAdd={(player, outcome) => setPending({ player, outcome })}
          />
        ))}
      </div>

      <RecordSheet
        player={players.find((p) => p.id === editingId) ?? null}
        onClose={() => setEditingId(null)}
        onRemove={(r) => {
          setEditingId(null);
          setRemoval(r);
        }}
      />
      <ConfirmResult pending={pending} onClose={() => setPending(null)} onUndo={setRemoval} />
      <ConfirmRemoval removal={removal} onClose={() => setRemoval(null)} />
      <ConfirmDialog
        open={confirmSimulate}
        title={`Simulate ${SIMULATED_GAMES} games each?`}
        message={`This adds ${SIMULATED_GAMES} random wins or losses for each of the ${checkedIn} checked-in players, ${
          checkedIn * SIMULATED_GAMES
        } results in all. They’re marked as simulated, so you can clear them later without touching real results.`}
        confirmLabel="Simulate games"
        tone="primary"
        onCancel={() => setConfirmSimulate(false)}
        onConfirm={() => void simulate()}
      />
      <ConfirmDialog
        open={confirmClear}
        title="Clear simulated results?"
        message={`This removes all ${simulatedCount} simulated results. Results you entered with +W and +L stay.`}
        confirmLabel="Clear simulated results"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => void clearSimulated()}
      />
    </>
  );
}

function TeamPanel({
  teamId,
  players,
  onEditRecord,
  onAdd,
}: {
  teamId: TeamId;
  players: Player[];
  onEditRecord: (id: string) => void;
  onAdd: (player: Player, outcome: Outcome) => void;
}) {
  const { data, records } = useEventData();
  const { canEdit, meId, paths } = useAccess();
  const history = useMemo(() => {
    const byPlayer = new Map<string, Outcome[]>();
    for (const r of data!.results) byPlayer.set(r.playerId, [...(byPlayer.get(r.playerId) ?? []), r.outcome]);
    return byPlayer;
  }, [data]);
  const members = useMemo(() => teamMembers(players, teamId).sort(compareByStanding(records)), [players, teamId, records]);
  const record = teamRecord(players, records, teamId);
  const women = members.filter((p) => p.gender === 'F').length;

  return (
    <section id={`team-${teamId}`} className="team" aria-labelledby={`team-title-${teamId}`}>
      <header className={`team__head team-${teamId}`}>
        <TeamCrest team={teamId} size={44} className="team__crest" />
        <div className="team__heading">
          <h2 id={`team-title-${teamId}`} className="team__name">
            {teamName(teamId)}
          </h2>
          <p className="team__makeup">
            {women} {women === 1 ? 'woman' : 'women'}, {members.length - women} {members.length - women === 1 ? 'man' : 'men'}
          </p>
        </div>
        <p className="team__score">
          <span className="team__rate">{formatRate(record.rate)}</span>
          <span className="team__record">{formatRecord(record)}</span>
        </p>
      </header>

      {members.length === 0 ? (
        <p className="team__empty">
          No one on {teamName(teamId)} yet. Players join a team when they <Link to={paths.players}>check in</Link>.
        </p>
      ) : (
        (['F', 'M'] as Gender[]).map((gender) => {
          const group = members.filter((p) => p.gender === gender);
          if (group.length === 0) return null;
          const pair = canEdit ? pairPicture(players, records, teamId, gender) : null;
          return (
            <div key={gender} className="team__group">
              <h3 className="team__group-title">{GENDER_LABEL[gender]}</h3>
              <ol className="team__list">
                {group.map((p) => {
                  const r = recordOf(records, p.id);
                  return (
                    <li
                      key={p.id}
                      className={`member ${canEdit ? '' : 'member--readonly'} ${
                        p.id === meId ? 'is-me' : ''
                      } ${pair?.top.has(p.id) ? 'is-top' : ''} ${pair?.tied.has(p.id) ? 'is-tied' : ''}`}
                    >
                      <span className="member__who">
                        <span className="member__line">
                          <span className="member__name">
                            {p.name}
                            {pair?.top.has(p.id) && <span className="visually-hidden"> (in the tournament pair)</span>}
                            {pair?.tied.has(p.id) && <span className="member__tie">Tie</span>}
                          </span>
                          <ResultHistory outcomes={history.get(p.id) ?? []} />
                        </span>
                      </span>
                      {canEdit ? (
                        <button
                          type="button"
                          className="member__record member__record--edit"
                          onClick={() => onEditRecord(p.id)}
                          aria-label={`${p.name}: ${r.wins} wins, ${r.losses} losses. Edit results`}
                        >
                          <span className="member__stats">
                            <span className="member__rate">{formatRate(r.rate)}</span>
                            <span className="member__wl">{formatRecord(r)}</span>
                          </span>
                          <span className="member__edit">
                            <EditIcon size={12} />
                          </span>
                        </button>
                      ) : (
                        <span className="member__record" aria-label={`${r.wins} wins, ${r.losses} losses`}>
                          <span className="member__rate">{formatRate(r.rate)}</span>
                          <span className="member__wl">{formatRecord(r)}</span>
                        </span>
                      )}
                      {canEdit && (
                      <span className="member__add">
                        <button type="button" className="tally tally--w" onClick={() => onAdd(p, 'W')} aria-label={`Add a win for ${p.name}`}>
                          +W
                        </button>
                        <button type="button" className="tally tally--l" onClick={() => onAdd(p, 'L')} aria-label={`Add a loss for ${p.name}`}>
                          +L
                        </button>
                      </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })
      )}
    </section>
  );
}

/**
 * One bar per game beside the name, oldest on the left: green for a win, red for a loss.
 * When the row is too narrow the oldest bars are clipped, so the latest games always show.
 */
function ResultHistory({ outcomes }: { outcomes: Outcome[] }) {
  if (outcomes.length === 0) return null;
  const shown = outcomes.slice(-HISTORY_SHOWN);
  return (
    <span
      className="history"
      role="img"
      aria-label={`Results in order: ${outcomes.map((o) => (o === 'W' ? 'won' : 'lost')).join(', ')}`}
    >
      {shown.map((o, i) => (
        <span key={i} className={`history__bar history__bar--${o}`} />
      ))}
    </span>
  );
}

/** A specific recorded result the organizer has asked to remove. */
interface Removal {
  player: Player;
  resultId: string;
  outcome: Outcome;
}

/** Asks before recording a result, so a stray tap on +W or +L doesn't count. */
function ConfirmResult({
  pending,
  onClose,
  onUndo,
}: {
  pending: { player: Player; outcome: Outcome } | null;
  onClose: () => void;
  onUndo: (removal: Removal) => void;
}) {
  const { records, run, addResultOptimistic } = useEventData();
  const toast = useToast();
  if (!pending) return <Dialog open={false} onClose={onClose} title="" children={null} />;

  const { player, outcome } = pending;
  const won = outcome === 'W';
  const r = recordOf(records, player.id);
  const after = won ? `${r.wins + 1}–${r.losses}` : `${r.wins}–${r.losses + 1}`;

  const confirm = async () => {
    onClose();
    addResultOptimistic({
      id: `pending-${crypto.randomUUID()}`,
      playerId: player.id,
      outcome,
      createdAt: new Date().toISOString(),
      simulated: false,
    });
    const saved = await run(['results'], (repo) => repo.addResult(player.id, outcome));
    if (saved) {
      toast.show(`${player.name} ${won ? 'won' : 'lost'}: now ${after}`, {
        action: { label: 'Undo', onClick: () => onUndo({ player, resultId: saved.id, outcome }) },
      });
    }
  };

  return (
    <Dialog open onClose={onClose} title={`Confirm ${player.name} ${won ? 'won' : 'lost'}`}>
      <p className="dialog__text">
        This adds a {won ? 'win' : 'loss'} to {player.name}’s record, taking it from {formatRecord(r)} to {after}.
      </p>
      <div className="dialog__actions">
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={`btn ${won ? 'btn--win' : 'btn--loss'}`} onClick={() => void confirm()}>
          {won ? 'Confirm win' : 'Confirm loss'}
        </button>
      </div>
    </Dialog>
  );
}

/** Asks before removing a result, whether from the results sheet or the toast's Undo. */
function ConfirmRemoval({ removal, onClose }: { removal: Removal | null; onClose: () => void }) {
  const { records, run } = useEventData();
  const toast = useToast();
  if (!removal) return <Dialog open={false} onClose={onClose} title="" children={null} />;

  const { player, resultId, outcome } = removal;
  const isWin = outcome === 'W';
  const r = recordOf(records, player.id);
  const after = isWin ? `${Math.max(r.wins - 1, 0)}–${r.losses}` : `${r.wins}–${Math.max(r.losses - 1, 0)}`;

  const confirm = async () => {
    onClose();
    const ok = await run(['results'], async (repo) => {
      await repo.deleteResult(resultId);
      return true;
    });
    if (ok) toast.show(`Removed a ${isWin ? 'win' : 'loss'} from ${player.name}: now ${after}`);
  };

  return (
    <Dialog open onClose={onClose} title={`Remove a ${isWin ? 'win' : 'loss'} from ${player.name}?`}>
      <p className="dialog__text">
        This takes {player.name}’s record from {formatRecord(r)} to {after}.
      </p>
      <div className="dialog__actions">
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn--danger" onClick={() => void confirm()}>
          {isWin ? 'Remove win' : 'Remove loss'}
        </button>
      </div>
    </Dialog>
  );
}

function RecordSheet({
  player,
  onClose,
  onRemove,
}: {
  player: Player | null;
  onClose: () => void;
  onRemove: (removal: Removal) => void;
}) {
  const { data, records } = useEventData();
  if (!player) return <Dialog open={false} onClose={onClose} title="" children={null} />;
  const r = recordOf(records, player.id);

  const removeLatest = (outcome: Outcome) => {
    const latest = data!.results
      .filter((x) => x.playerId === player.id && x.outcome === outcome && !x.id.startsWith('pending-'))
      .at(-1);
    if (latest) onRemove({ player, resultId: latest.id, outcome });
  };

  return (
    <Dialog open onClose={onClose} title={`${player.name}’s results`}>
      <p className="dialog__text">
        {r.wins} {r.wins === 1 ? 'win' : 'wins'} and {r.losses} {r.losses === 1 ? 'loss' : 'losses'}
        {r.rate !== null && ` for a ${formatRate(r.rate)} win rate`}. Remove a result entered by mistake.
      </p>
      <div className="dialog__actions dialog__actions--pair">
        <button type="button" className="btn" disabled={r.wins === 0} onClick={() => removeLatest('W')}>
          Remove a win
        </button>
        <button type="button" className="btn" disabled={r.losses === 0} onClick={() => removeLatest('L')}>
          Remove a loss
        </button>
      </div>
      <button type="button" className="btn btn--quiet btn--block" onClick={onClose}>
        Done
      </button>
    </Dialog>
  );
}
