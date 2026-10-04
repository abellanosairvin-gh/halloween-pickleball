import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog } from '../components/Dialog';
import { TeamCrest } from '../components/TeamCrest';
import { useToast } from '../components/Toast';
import { useEventData } from '../data/EventData';
import {
  compareByStanding,
  formatRate,
  formatRecord,
  qualifiers,
  rankTeams,
  recordOf,
  teamMembers,
  teamRecord,
} from '../domain/standings';
import { GENDER_LABEL, TEAMS, teamName } from '../domain/teams';
import type { Gender, Outcome, Player, TeamId } from '../domain/types';

/** Most recent results rendered in the history strip; narrow screens clip the oldest of these. */
const HISTORY_SHOWN = 30;

export function TeamsPage() {
  const { data, records } = useEventData();
  const players = data!.players;
  const standings = rankTeams(players, records);
  const anyGames = standings.some((s) => s.record.games > 0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ player: Player; outcome: Outcome } | null>(null);

  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Teams</h1>
        {!anyGames && (
          <p className="page-meta">Win rates appear once results are recorded. Add a win or loss next to a player after each game.</p>
        )}
      </header>

      <ol className="race" aria-label="Team standings by win rate">
        {standings.map((s, i) => (
          <li key={s.teamId} className={`race__row ${i === 0 && anyGames ? 'is-leader' : ''}`}>
            <span className="race__rank">{i + 1}</span>
            <a className={`race__team team-${s.teamId}`} href={`#team-${s.teamId}`}>
              <TeamCrest team={s.teamId} size={18} />
              {teamName(s.teamId)}
            </a>
            <span className="race__bar" aria-hidden="true">
              <span className={`race__fill team-${s.teamId}`} style={{ inlineSize: `${(s.record.rate ?? 0) * 100}%` }} />
            </span>
            <span className="race__rate">{formatRate(s.record.rate)}</span>
            <span className="race__record">{formatRecord(s.record)}</span>
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

      <RecordSheet player={players.find((p) => p.id === editingId) ?? null} onClose={() => setEditingId(null)} />
      <ConfirmResult pending={pending} onClose={() => setPending(null)} />
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
  const history = useMemo(() => {
    const byPlayer = new Map<string, Outcome[]>();
    for (const r of data!.results) byPlayer.set(r.playerId, [...(byPlayer.get(r.playerId) ?? []), r.outcome]);
    return byPlayer;
  }, [data]);
  const members = useMemo(() => teamMembers(players, teamId).sort(compareByStanding(records)), [players, teamId, records]);
  const record = teamRecord(players, records, teamId);
  const pairIds = new Set([...qualifiers(players, records, teamId, 'F'), ...qualifiers(players, records, teamId, 'M')].map((p) => p.id));
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
          No one on {teamName(teamId)} yet. Players join a team when they <Link to="/players">check in</Link>.
        </p>
      ) : (
        (['F', 'M'] as Gender[]).map((gender) => {
          const group = members.filter((p) => p.gender === gender);
          if (group.length === 0) return null;
          return (
            <div key={gender} className="team__group">
              <h3 className="team__group-title">{GENDER_LABEL[gender]}</h3>
              <ol className="team__list">
                {group.map((p) => {
                  const r = recordOf(records, p.id);
                  return (
                    <li key={p.id} className="member">
                      <span className="member__who">
                        <span className="member__line">
                          <span className="member__name">{p.name}</span>
                          <ResultHistory outcomes={history.get(p.id) ?? []} />
                        </span>
                        {pairIds.has(p.id) && (
                          <span className="member__tags">
                            <span className="member__pair" title={`In ${teamName(teamId)}’s ${GENDER_LABEL[gender].toLowerCase()}’s pair`}>
                              Pair
                            </span>
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        className="member__record"
                        onClick={() => onEditRecord(p.id)}
                        aria-label={`${p.name}: ${r.wins} wins, ${r.losses} losses. Correct results`}
                      >
                        <span className="member__rate">{formatRate(r.rate)}</span>
                        <span className="member__wl">{formatRecord(r)}</span>
                      </button>
                      <span className="member__add">
                        <button type="button" className="tally tally--w" onClick={() => onAdd(p, 'W')} aria-label={`Add a win for ${p.name}`}>
                          +W
                        </button>
                        <button type="button" className="tally tally--l" onClick={() => onAdd(p, 'L')} aria-label={`Add a loss for ${p.name}`}>
                          +L
                        </button>
                      </span>
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

/** Asks before recording a result, so a stray tap on +W or +L doesn't count. */
function ConfirmResult({ pending, onClose }: { pending: { player: Player; outcome: Outcome } | null; onClose: () => void }) {
  const { records, run, addResultOptimistic } = useEventData();
  const toast = useToast();
  if (!pending) return <Dialog open={false} onClose={onClose} title="" children={null} />;

  const { player, outcome } = pending;
  const won = outcome === 'W';
  const r = recordOf(records, player.id);
  const after = won ? `${r.wins + 1}–${r.losses}` : `${r.wins}–${r.losses + 1}`;

  const confirm = async () => {
    onClose();
    addResultOptimistic({ id: `pending-${crypto.randomUUID()}`, playerId: player.id, outcome, createdAt: new Date().toISOString() });
    const saved = await run(['results'], (repo) => repo.addResult(player.id, outcome));
    if (saved) {
      toast.show(`${player.name} ${won ? 'won' : 'lost'}: now ${after}`, {
        action: { label: 'Undo', onClick: () => void run(['results'], (repo) => repo.deleteResult(saved.id)) },
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

function RecordSheet({ player, onClose }: { player: Player | null; onClose: () => void }) {
  const { data, records, run } = useEventData();
  if (!player) return <Dialog open={false} onClose={onClose} title="" children={null} />;
  const r = recordOf(records, player.id);

  const removeLatest = (outcome: Outcome) => {
    const latest = data!.results
      .filter((x) => x.playerId === player.id && x.outcome === outcome && !x.id.startsWith('pending-'))
      .at(-1);
    if (latest) void run(['results'], (repo) => repo.deleteResult(latest.id));
  };

  return (
    <Dialog open onClose={onClose} title={`${player.name}’s results`}>
      <p className="dialog__text">
        {r.wins} {r.wins === 1 ? 'win' : 'wins'} and {r.losses} {r.losses === 1 ? 'loss' : 'losses'}
        {r.rate !== null && ` for a ${formatRate(r.rate)} win rate`}. Remove a result entered by mistake.
      </p>
      <div className="dialog__actions dialog__actions--stack">
        <button type="button" className="btn" disabled={r.wins === 0} onClick={() => removeLatest('W')}>
          Remove a win
        </button>
        <button type="button" className="btn" disabled={r.losses === 0} onClick={() => removeLatest('L')}>
          Remove a loss
        </button>
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          Done
        </button>
      </div>
    </Dialog>
  );
}
