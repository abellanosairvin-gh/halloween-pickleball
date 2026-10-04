import { useState } from 'react';
import { Bracket } from '../components/Bracket';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { TeamCrest } from '../components/TeamCrest';
import { SkillMark } from '../components/SkillMark';
import { useEventData } from '../data/EventData';
import { buildBracket, canRedraw, drawPairs, type PairDraft } from '../domain/bracket';
import { compareByStanding, formatRate, isPairEligible, MIN_PAIR_GAMES, qualifiers, recordOf } from '../domain/standings';
import { GENDER_LABEL, TEAMS, teamName } from '../domain/teams';
import type { Gender, Player, TeamId } from '../domain/types';

export function TournamentPage() {
  const [shown, setShown] = useState<Gender>('F');
  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Tournament</h1>
        <p className="page-meta">
          Doubles for women and for men. Each team sends its top 2 by win rate as a fixed pair, counting only players
          with at least {MIN_PAIR_GAMES} games. The semifinals are drawn at random.
        </p>
      </header>

      <div className="segmented" role="group" aria-label="Show bracket">
        {(['F', 'M'] as Gender[]).map((g) => (
          <button key={g} type="button" aria-pressed={shown === g} onClick={() => setShown(g)}>
            {GENDER_LABEL[g]}
          </button>
        ))}
      </div>

      <div className="brackets">
        {(['F', 'M'] as Gender[]).map((g) => (
          <GenderBracket key={g} gender={g} hiddenOnMobile={shown !== g} />
        ))}
      </div>
    </>
  );
}

function GenderBracket({ gender, hiddenOnMobile }: { gender: Gender; hiddenOnMobile: boolean }) {
  const { data, records, run } = useEventData();
  const { players, pairs, matches } = data!;
  const view = buildBracket(gender, pairs, matches);
  const [overrides, setOverrides] = useState<Partial<Record<TeamId, [string, string]>>>({});
  const [picking, setPicking] = useState<TeamId | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const label = gender === 'F' ? 'Women’s doubles' : 'Men’s doubles';

  const pairFor = (teamId: TeamId): Player[] => {
    const chosen = overrides[teamId];
    if (chosen) {
      const valid = chosen
        .map((id) => players.find((p) => p.id === id))
        .filter(
          (p): p is Player => !!p && p.teamId === teamId && p.gender === gender && isPairEligible(records, p.id),
        );
      if (valid.length === 2) return valid;
    }
    return qualifiers(players, records, teamId, gender);
  };

  const drafts: (PairDraft | null)[] = TEAMS.map((t) => {
    const [a, b] = pairFor(t.id);
    return a && b ? { teamId: t.id, player1Id: a.id, player2Id: b.id } : null;
  });
  const ready = drafts.every(Boolean);

  const lock = () => void run(['pairs'], (r) => r.setBracketPairs(gender, drawPairs(gender, drafts as PairDraft[])));
  const redraw = () => {
    const current = [...view.pairsBySlot.values()].map(({ teamId, player1Id, player2Id }) => ({ teamId, player1Id, player2Id }));
    void run(['pairs'], (r) => r.setBracketPairs(gender, drawPairs(gender, current)));
  };

  return (
    <section className={`bracket-section ${hiddenOnMobile ? 'is-hidden-mobile' : ''}`} aria-labelledby={`bracket-${gender}`}>
      <h2 id={`bracket-${gender}`} className="section-title">
        {label}
      </h2>

      {view.locked ? (
        <>
          <Bracket gender={gender} view={view} />
          <div className="bracket-actions">
            {canRedraw(matches, gender) && (
              <button type="button" className="btn" onClick={redraw}>
                Redraw semifinals
              </button>
            )}
            <button type="button" className="btn btn--danger-quiet" onClick={() => setConfirmReset(true)}>
              Reset bracket
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="bracket-intro">
            These pairs follow the current standings and update as results come in. Lock them when team play ends.
          </p>
          <ul className="pair-list">
            {TEAMS.map((t) => {
              const pair = pairFor(t.id);
              const custom = Boolean(overrides[t.id]) && pair.length === 2;
              return (
                <li key={t.id} className="pair-card">
                  <span className={`pair-card__team team-${t.id}`}>
                    <TeamCrest team={t.id} size={18} />
                    {t.name}
                  </span>
                  {pair.length === 2 ? (
                    <span className="pair-card__names">
                      {pair.map((p) => (
                        <span key={p.id} className="pair-card__player">
                          {p.name} <span className="pair-card__rate">{formatRate(recordOf(records, p.id).rate)}</span>
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="pair-card__short">
                      Needs 2 {gender === 'F' ? 'women' : 'men'} with {MIN_PAIR_GAMES}+ games, has {pair.length}
                    </span>
                  )}
                  <button type="button" className="btn btn--small btn--quiet" onClick={() => setPicking(t.id)}>
                    {custom ? 'Edited' : 'Change'}
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="btn btn--primary btn--block" disabled={!ready} onClick={lock}>
            Lock pairs and draw semifinals
          </button>
          {!ready && (
            <p className="bracket-note">
              Every team needs a pair before the draw. Players qualify once they have {MIN_PAIR_GAMES} recorded games.
            </p>
          )}
        </>
      )}

      <PairPicker
        teamId={picking}
        gender={gender}
        current={picking ? pairFor(picking).map((p) => p.id) : []}
        isCustom={picking ? Boolean(overrides[picking]) : false}
        onClose={() => setPicking(null)}
        onChoose={(ids) => picking && setOverrides((o) => ({ ...o, [picking]: ids }))}
        onRestore={() => picking && setOverrides(({ [picking]: _removed, ...rest }) => rest)}
      />

      <ConfirmDialog
        open={confirmReset}
        title={`Reset the ${label.toLowerCase()} bracket?`}
        message="This removes the locked pairs and every bracket result so you can lock new pairs. Team play results are not affected."
        confirmLabel="Reset bracket"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => void run(['pairs', 'matches'], (r) => r.resetBracket(gender))}
      />
    </section>
  );
}

function PairPicker({
  teamId,
  gender,
  current,
  isCustom,
  onClose,
  onChoose,
  onRestore,
}: {
  teamId: TeamId | null;
  gender: Gender;
  current: string[];
  isCustom: boolean;
  onClose: () => void;
  onChoose: (ids: [string, string]) => void;
  onRestore: () => void;
}) {
  const { data, records } = useEventData();
  const [picked, setPicked] = useState<string[] | null>(null);
  if (!teamId) return <Dialog open={false} onClose={onClose} title="" children={null} />;

  const selection = (picked ?? current).filter((id) => isPairEligible(records, id));
  const candidates = data!.players
    .filter((p) => p.teamId === teamId && p.gender === gender)
    .sort(compareByStanding(records));
  const close = () => {
    setPicked(null);
    onClose();
  };
  const eligibleCount = candidates.filter((p) => isPairEligible(records, p.id)).length;
  const toggle = (id: string) =>
    setPicked(selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id].slice(-2));

  return (
    <Dialog open onClose={close} title={`${teamName(teamId)} ${gender === 'F' ? 'women’s' : 'men’s'} pair`}>
      {candidates.length === 0 ? (
        <p className="dialog__text">
          {teamName(teamId)} has no checked-in {gender === 'F' ? 'women' : 'men'}. Check in or move players to this team
          from the Players tab.
        </p>
      ) : (
        <>
          <p className="dialog__text">
            Choose two players with at least {MIN_PAIR_GAMES} games. They’re listed by win rate, best first.
            {eligibleCount < 2 &&
              ` Only ${eligibleCount} ${eligibleCount === 1 ? 'has' : 'have'} played enough so far. Record more games on the Teams tab.`}
          </p>
          <ul className="pick-list">
            {candidates.map((p) => {
              const r = recordOf(records, p.id);
              const eligible = isPairEligible(records, p.id);
              return (
                <li key={p.id}>
                  <label className={`pick-list__row ${eligible ? '' : 'is-ineligible'}`}>
                    <input
                      type="checkbox"
                      checked={eligible && selection.includes(p.id)}
                      disabled={!eligible}
                      onChange={() => toggle(p.id)}
                    />
                    <span className="pick-list__who">
                      <span className="pick-list__name">{p.name}</span>
                      {!eligible && (
                        <span className="pick-list__note">
                          {r.games} of {MIN_PAIR_GAMES} games
                        </span>
                      )}
                    </span>
                    <SkillMark skill={p.skill} />
                    <span className="pick-list__rate">{formatRate(r.rate)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div className="dialog__actions">
        {isCustom && (
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => {
              onRestore();
              close();
            }}
          >
            Use the top 2
          </button>
        )}
        <button
          type="button"
          className="btn btn--primary"
          disabled={selection.length !== 2}
          onClick={() => {
            onChoose(selection as [string, string]);
            close();
          }}
        >
          Use these two
        </button>
      </div>
    </Dialog>
  );
}
