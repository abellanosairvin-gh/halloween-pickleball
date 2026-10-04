import { useAccess } from '../auth/Access';
import { useEventData } from '../data/EventData';
import { type BracketView, type MatchView, validWinners } from '../domain/bracket';
import { teamName } from '../domain/teams';
import type { Gender } from '../domain/types';
import { Podium } from './Podium';
import { TeamCrest } from './TeamCrest';

const MATCH_LABEL = { semi1: 'Semifinal 1', semi2: 'Semifinal 2', final: 'Final', third: 'Battle for 3rd' } as const;

export function Bracket({ gender, view }: { gender: Gender; view: BracketView }) {
  const { data, run } = useEventData();
  const { canEdit } = useAccess();
  const nameOf = (id: string) => data!.players.find((p) => p.id === id)?.name ?? 'Unknown';

  const renderSide = (match: MatchView, side: 0 | 1) => {
    const slot = match.sides[side];
    const pair = slot === null ? undefined : view.pairsBySlot.get(slot);
    if (!pair || slot === null) {
      return (
        <div className="side side--tbd">
          {match.key === 'third' ? 'Loser' : 'Winner'} of semifinal {side + 1}
        </div>
      );
    }
    const decided = match.winnerSlot !== null;
    const won = match.winnerSlot === slot;
    const allowed = validWinners(view, match.key).includes(slot);
    const className = `side team-${pair.teamId} ${won ? 'is-winner' : ''} ${decided && !won ? 'is-out' : ''}`;
    const names = (
      <>
        <TeamCrest team={pair.teamId} size={18} className="side__crest" />
        <span className="side__names">
          <span>{nameOf(pair.player1Id)}</span>
          <span>{nameOf(pair.player2Id)}</span>
        </span>
        {won && (
          <span className="side__won" aria-hidden="true">
            ✓
          </span>
        )}
      </>
    );
    if (!canEdit) {
      return (
        <div className={`${className} side--static`}>
          {names}
          {won && <span className="visually-hidden">Winner</span>}
        </div>
      );
    }
    return (
      <button
        type="button"
        className={className}
        aria-pressed={won}
        disabled={!allowed}
        onClick={() => void run(['matches'], (r) => r.setMatchWinner(gender, match.key, won ? null : slot))}
        aria-label={`${teamName(pair.teamId)}: ${nameOf(pair.player1Id)} and ${nameOf(pair.player2Id)}. ${
          won ? 'Winner. Tap to clear.' : 'Tap to mark as winner.'
        }`}
      >
        {names}
      </button>
    );
  };

  const renderMatch = (match: MatchView) => (
    <div className="match" role="group" aria-label={MATCH_LABEL[match.key]}>
      <span className="match__label" aria-hidden="true">
        {MATCH_LABEL[match.key]}
      </span>
      {renderSide(match, 0)}
      <span className="match__vs" aria-hidden="true">
        v
      </span>
      {renderSide(match, 1)}
    </div>
  );

  const decided = view.final.winnerSlot !== null || view.third.winnerSlot !== null;

  return (
    <>
      <div className="court">
        <div className="court__semis">
          {renderMatch(view.semis[0])}
          {renderMatch(view.semis[1])}
        </div>
        <div className="court__join" aria-hidden="true" />
        <div className="court__final">
          {renderMatch(view.final)}
        </div>
        <div className="court__third">
          {renderMatch(view.third)}
        </div>
      </div>
      {canEdit && <p className="bracket-note">Tap the pair that won each match. Tap again to clear a result.</p>}
      {decided && (
        <div role="status">
          <Podium
            label={`${gender === 'F' ? 'Women’s' : 'Men’s'} doubles final standings`}
            places={view.placings.map((slot) => {
              const pair = slot === null ? undefined : view.pairsBySlot.get(slot);
              return pair
                ? {
                    teamId: pair.teamId,
                    title: (
                      <span className="podium__names">
                        <span>{nameOf(pair.player1Id)}</span>
                        <span>{nameOf(pair.player2Id)}</span>
                      </span>
                    ),
                    detail: teamName(pair.teamId),
                  }
                : null;
            })}
          />
        </div>
      )}
    </>
  );
}
