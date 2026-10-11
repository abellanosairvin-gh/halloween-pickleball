import { useState } from 'react';
import { useAccess } from '../auth/Access';
import { Bracket } from '../components/Bracket';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { TeamCrest } from '../components/TeamCrest';
import { SkillMark } from '../components/SkillMark';
import { useEventData } from '../data/EventData';
import {
  buildBracket,
  canRedraw,
  drawMixedPairs,
  drawPairs,
  FIRST_ROUND,
  firstRoundWinners,
  isMixedDrawn,
  MIXED,
  type PairDraft,
} from '../domain/bracket';
import {
  compareByStanding,
  formatRate,
  isPairEligible,
  MIN_PAIR_GAMES,
  pairPicture,
  qualifiers,
  recordOf,
} from '../domain/standings';
import { GENDER_LABEL, TEAMS, teamName } from '../domain/teams';
import type { BracketId, Gender, Player, TeamId } from '../domain/types';

const SHOWN_LABEL: Record<BracketId, string> = { F: GENDER_LABEL.F, M: GENDER_LABEL.M, X: 'Mixed' };

export function TournamentPage() {
  const { data } = useEventData();
  const [shown, setShown] = useState<BracketId>(() => (isMixedDrawn(data!.pairs) ? MIXED : 'F'));
  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Tournament</h1>
        <p className="page-meta">
          Each team sends its top 2 women and top 2 men by win rate as fixed pairs, counting only players with at least{' '}
          {MIN_PAIR_GAMES} games. Women and men play one round of doubles, drawn at random. The 4 women and 4 men who
          win are then paired at random for mixed doubles: semifinals, a final and a battle for 3rd.
        </p>
      </header>

      <div className="segmented" role="group" aria-label="Show bracket">
        {(['F', 'M', MIXED] as BracketId[]).map((b) => (
          <button key={b} type="button" aria-pressed={shown === b} onClick={() => setShown(b)}>
            {SHOWN_LABEL[b]}
          </button>
        ))}
      </div>

      <div className="brackets">
        {(['F', 'M'] as Gender[]).map((g) => (
          <GenderBracket key={g} gender={g} hiddenOnMobile={shown !== g} />
        ))}
        <MixedBracket hiddenOnMobile={shown !== MIXED} />
      </div>
    </>
  );
}

function GenderBracket({ gender, hiddenOnMobile }: { gender: Gender; hiddenOnMobile: boolean }) {
  const { data, records, run } = useEventData();
  const { canEdit } = useAccess();
  const { players, pairs, matches } = data!;
  const view = buildBracket(gender, pairs, matches);
  const mixedDrawn = isMixedDrawn(pairs);
  const [overrides, setOverrides] = useState<Partial<Record<TeamId, [string, string]>>>({});
  const [picking, setPicking] = useState<TeamId | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const label = gender === 'F' ? 'Women’s first round' : 'Men’s first round';

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
    // A women's or men's pair always has a team.
    const current = [...view.pairsBySlot.values()].map(({ teamId, player1Id, player2Id }) => ({ teamId: teamId!, player1Id, player2Id }));
    void run(['pairs'], (r) => r.setBracketPairs(gender, drawPairs(gender, current)));
  };

  return (
    <section className={`bracket-section ${hiddenOnMobile ? 'is-hidden-mobile' : ''}`} aria-labelledby={`bracket-${gender}`}>
      <h2 id={`bracket-${gender}`} className="section-title">
        {label}
      </h2>

      {view.locked ? (
        <>
          <Bracket view={view} frozen={mixedDrawn} />
          {canEdit &&
            (mixedDrawn ? (
              <p className="bracket-note">
                Mixed doubles is drawn from these results. To change them, reset mixed doubles first.
              </p>
            ) : (
              <div className="bracket-actions">
                {canRedraw(matches, gender) && (
                  <button type="button" className="btn" onClick={redraw}>
                    Redraw matches
                  </button>
                )}
                <button type="button" className="btn btn--danger-quiet" onClick={() => setConfirmReset(true)}>
                  Reset bracket
                </button>
              </div>
            ))}
        </>
      ) : (
        <>
          <p className="bracket-intro">
            {canEdit
              ? 'These pairs follow the current standings and update as results come in. Lock them when team play ends.'
              : 'If team play ended now, these would be the pairs. They update as results come in, and the bracket appears here once the organizer locks them.'}
          </p>
          <ul className="pair-list">
            {TEAMS.map((t) => {
              const pair = pairFor(t.id);
              const custom = Boolean(overrides[t.id]) && pair.length === 2;
              // Players level on win rate for a spot, until the organizer picks the pair themselves.
              const tied =
                canEdit && !custom
                  ? players.filter((p) => pairPicture(players, records, t.id, gender).tied.has(p.id)).sort(compareByStanding(records))
                  : [];
              return (
                <li key={t.id} className={`pair-card team-${t.id}`}>
                  <span className={`pair-card__team team-${t.id}`}>
                    <TeamCrest team={t.id} size={40} />
                    Team {t.name}
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
                  {tied.length > 0 && (
                    <p className="pair-card__tie">
                      <span className="member__tie">Tie</span> {listNames(tied.map((p) => p.name))} are level on{' '}
                      {formatRate(recordOf(records, tied[0].id).rate)}. Choose who plays.
                    </p>
                  )}
                  {canEdit && (
                    <button type="button" className="btn btn--small btn--quiet" onClick={() => setPicking(t.id)}>
                      {custom ? 'Edited' : tied.length > 0 ? 'Choose' : 'Change'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {canEdit && (
            <button type="button" className="btn btn--primary btn--block" disabled={!ready} onClick={lock}>
              Lock pairs and draw matches
            </button>
          )}
          {canEdit && !ready && (
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
        title={`Reset the ${label.toLowerCase()}?`}
        message="This removes the locked pairs and every bracket result so you can lock new pairs. Team play results are not affected."
        confirmLabel="Reset bracket"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => void run(['pairs', 'matches'], (r) => r.resetBracket(gender))}
      />
    </section>
  );
}

function MixedBracket({ hiddenOnMobile }: { hiddenOnMobile: boolean }) {
  const { data, run } = useEventData();
  const { canEdit } = useAccess();
  const { players, pairs, matches } = data!;
  const view = buildBracket(MIXED, pairs, matches);
  const [confirmReset, setConfirmReset] = useState(false);
  const women = firstRoundWinners('F', pairs, matches);
  const men = firstRoundWinners('M', pairs, matches);
  const ready = women.length === 4 && men.length === 4;
  const draw = () => void run(['pairs'], (r) => r.setBracketPairs(MIXED, drawMixedPairs(women, men)));

  return (
    <section
      className={`bracket-section bracket-section--wide ${hiddenOnMobile ? 'is-hidden-mobile' : ''}`}
      aria-labelledby="bracket-X"
    >
      <h2 id="bracket-X" className="section-title">
        Mixed doubles
      </h2>

      {view.locked ? (
        <>
          <Bracket view={view} />
          {canEdit && (
            <div className="bracket-actions">
              {canRedraw(matches, MIXED) && (
                <button type="button" className="btn" onClick={draw}>
                  Redraw mixed pairs
                </button>
              )}
              <button type="button" className="btn btn--danger-quiet" onClick={() => setConfirmReset(true)}>
                Reset mixed doubles
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="bracket-intro">
            {canEdit
              ? 'The 4 women and 4 men who win their first-round match go through. Each woman is paired with a man at random, and the pairs are drawn into the semifinals.'
              : 'The 4 women and 4 men who win their first-round match go through and are paired at random. The bracket appears here once the organizer draws the pairs.'}
          </p>
          <div className="through">
            {(['F', 'M'] as Gender[]).map((g) => (
              <div key={g} className="through__group">
                <h3 className="through__title">{GENDER_LABEL[g]} through</h3>
                <ul className="through__list">
                  {FIRST_ROUND.map((key, i) => {
                    const won = buildBracket(g, pairs, matches).semis[i].winnerSlot;
                    const pair = pairs.find((p) => p.bracket === g && p.slot === won);
                    if (!pair) {
                      return (
                        <li key={key} className="through__player is-open">
                          Winners of {g === 'F' ? 'women’s' : 'men’s'} match {i + 1}
                        </li>
                      );
                    }
                    return [pair.player1Id, pair.player2Id].map((id) => {
                      const p = players.find((x) => x.id === id);
                      return (
                        <li key={id} className={`through__player team-${p?.teamId}`}>
                          {p?.teamId && <TeamCrest team={p.teamId} size={22} />}
                          {p?.name ?? 'Unknown'}
                        </li>
                      );
                    });
                  })}
                </ul>
              </div>
            ))}
          </div>
          {canEdit && (
            <button type="button" className="btn btn--primary btn--block" disabled={!ready} onClick={draw}>
              Draw mixed pairs
            </button>
          )}
          {canEdit && !ready && (
            <p className="bracket-note">The draw opens once all four first-round matches have a winner.</p>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmReset}
        title="Reset mixed doubles?"
        message="This removes the mixed pairs and every mixed doubles result so you can draw again. First-round results are kept."
        confirmLabel="Reset mixed doubles"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => void run(['pairs', 'matches'], (r) => r.resetBracket(MIXED))}
      />
    </section>
  );
}

/** "A, B and C" */
function listNames(names: string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
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
  const picture = pairPicture(data!.players, records, teamId, gender);
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
            {picture.tied.size > 0 && ' Players marked Tie are level on win rate for the last spot.'}
            {eligibleCount < 2 &&
              ` Only ${eligibleCount} ${eligibleCount === 1 ? 'has' : 'have'} played enough so far. Record more games on the Teams tab.`}
          </p>
          <ul className="pick-list">
            {candidates.map((p) => {
              const r = recordOf(records, p.id);
              const eligible = isPairEligible(records, p.id);
              return (
                <li key={p.id}>
                  <label
                    className={`pick-list__row ${eligible ? '' : 'is-ineligible'} ${picture.top.has(p.id) ? 'is-top' : ''} ${
                      picture.tied.has(p.id) ? 'is-tied' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={eligible && selection.includes(p.id)}
                      disabled={!eligible}
                      onChange={() => toggle(p.id)}
                    />
                    <span className="pick-list__who">
                      <span className="pick-list__name">
                        {p.name}
                        {picture.tied.has(p.id) && <span className="member__tie">Tie</span>}
                      </span>
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
