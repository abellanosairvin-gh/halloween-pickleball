import { useAccess } from '../auth/Access';
import { useEventData } from '../data/EventData';
import { type BracketView, type MatchView, MIXED, validWinners } from '../domain/bracket';
import { teamName } from '../domain/teams';
import type { BracketPair, MatchKey, TeamId } from '../domain/types';
import { Podium, teamColours } from './Podium';
import { TeamCrest } from './TeamCrest';

const MATCH_LABEL: Record<MatchKey, string> = {
  semi1: 'Semifinal 1',
  semi2: 'Semifinal 2',
  final: 'Final',
  third: 'Battle for 3rd',
};

/** The women's and men's brackets play a single round of two matches. */
const FIRST_ROUND_LABEL: Partial<Record<MatchKey, string>> = { semi1: 'Match 1', semi2: 'Match 2' };

/**
 * A locked bracket. The women's and men's brackets show their one round; mixed doubles shows the
 * semifinals, the final, the battle for 3rd and the podium. `frozen` stops results being changed
 * (the first round, once mixed doubles is drawn from it).
 */
export function Bracket({ view, frozen = false }: { view: BracketView; frozen?: boolean }) {
  const { data, run } = useEventData();
  const { canEdit } = useAccess();
  const mixed = view.bracket === MIXED;
  const player = (id: string) => data!.players.find((p) => p.id === id);
  const nameOf = (id: string) => player(id)?.name ?? 'Unknown';
  const labelOf = (key: MatchKey) => (mixed ? MATCH_LABEL[key] : (FIRST_ROUND_LABEL[key] ?? MATCH_LABEL[key]));

  /** A team pair's team, or each player's team in a mixed pair. */
  const teamsOf = (pair: BracketPair): TeamId[] =>
    pair.teamId ? [pair.teamId] : [pair.player1Id, pair.player2Id].flatMap((id) => player(id)?.teamId ?? []);

  const describe = (pair: BracketPair) =>
    pair.teamId
      ? `${teamName(pair.teamId)}: ${nameOf(pair.player1Id)} and ${nameOf(pair.player2Id)}`
      : [pair.player1Id, pair.player2Id]
          .map((id) => {
            const team = player(id)?.teamId;
            return team ? `${nameOf(id)} (${teamName(team)})` : nameOf(id);
          })
          .join(' and ');

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
    const allowed = !frozen && validWinners(view, match.key).includes(slot);
    const colours = teamColours(teamsOf(pair));
    const className = `side ${colours.className} ${won ? 'is-winner' : ''} ${decided && !won ? 'is-out' : ''}`;
    const names = (
      <>
        {pair.teamId ? (
          <>
            <TeamCrest team={pair.teamId} size={26} className="side__crest" />
            <span className="side__names">
              <span>{nameOf(pair.player1Id)}</span>
              <span>{nameOf(pair.player2Id)}</span>
            </span>
          </>
        ) : (
          // A mixed pair: each player with their own team's crest.
          <span className="side__names">
            {[pair.player1Id, pair.player2Id].map((id) => {
              const team = player(id)?.teamId;
              return (
                <span key={id} className="side__player">
                  {team && <TeamCrest team={team} size={20} className="side__crest" />}
                  {nameOf(id)}
                </span>
              );
            })}
          </span>
        )}
        {won && (
          <span className="side__won" aria-hidden="true">
            ✓
          </span>
        )}
      </>
    );
    if (!canEdit) {
      return (
        <div className={`${className} side--static`} style={colours.style}>
          {names}
          {won && <span className="visually-hidden">Winner</span>}
        </div>
      );
    }
    return (
      <button
        type="button"
        className={className}
        style={colours.style}
        aria-pressed={won}
        disabled={!allowed}
        onClick={() => void run(['matches'], (r) => r.setMatchWinner(view.bracket, match.key, won ? null : slot))}
        aria-label={`${describe(pair)}. ${won ? 'Winner.' : ''} ${
          frozen ? '' : won ? 'Tap to clear.' : 'Tap to mark as winner.'
        }`}
      >
        {names}
      </button>
    );
  };

  const renderMatch = (match: MatchView) => (
    <div className="match" role="group" aria-label={labelOf(match.key)}>
      <span className="match__label" aria-hidden="true">
        {labelOf(match.key)}
      </span>
      {renderSide(match, 0)}
      <span className="match__vs" aria-hidden="true">
        v
      </span>
      {renderSide(match, 1)}
    </div>
  );

  if (!mixed) {
    return (
      <>
        <div className="court court--round">
          {renderMatch(view.semis[0])}
          {renderMatch(view.semis[1])}
        </div>
        {canEdit && !frozen && (
          <p className="bracket-note">Tap the pair that won each match. Tap again to clear a result.</p>
        )}
      </>
    );
  }

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
            label="Mixed doubles final standings"
            places={view.placings.map((slot) => {
              const pair = slot === null ? undefined : view.pairsBySlot.get(slot);
              if (!pair) return null;
              const teams = teamsOf(pair);
              return {
                teams,
                title: (
                  <span className="podium__names">
                    <span>{nameOf(pair.player1Id)}</span>
                    <span>{nameOf(pair.player2Id)}</span>
                  </span>
                ),
                detail: [...new Set(teams)].map(teamName).join(' & '),
              };
            })}
          />
        </div>
      )}
    </>
  );
}
