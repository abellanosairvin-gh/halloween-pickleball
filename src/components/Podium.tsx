import type { CSSProperties, ReactNode } from 'react';
import type { TeamId } from '../domain/types';
import { TeamCrest } from './TeamCrest';

export interface PodiumPlace {
  /** One team, or a mixed pair's two teams (the step is split between their colours). */
  teams: TeamId[];
  /** Shown above the step: a team name or a pair's names. */
  title: ReactNode;
  detail?: ReactNode;
  href?: string;
}

const ORDINAL = ['1st', '2nd', '3rd', '4th'];

/** Class and style that colour something in one team's colour, or split between two teams' colours. */
export function teamColours(teams: readonly TeamId[]): { className: string; style?: CSSProperties } {
  const [a, b] = [...new Set(teams)];
  if (!b) return { className: `team-${a}` };
  return { className: 'is-two-teams', style: { '--team-a': `var(--${a})`, '--team-b': `var(--${b})` } as CSSProperties };
}

/**
 * Four steps for 1st to 4th, arranged 2nd, 1st, 3rd, 4th so the winner stands tallest in the middle.
 * The list itself stays in finishing order for screen readers. A null place is still to be decided.
 */
export function Podium({ places, label }: { places: (PodiumPlace | null)[]; label: string }) {
  return (
    <ol className="podium" aria-label={label}>
      {places.slice(0, 4).map((place, i) => {
        const rank = i + 1;
        if (!place) {
          return (
            <li key={i} className={`podium__place podium__place--${i + 1} is-open`} data-rank={rank}>
              <span className="podium__who">
                <span className="podium__title">To be decided</span>
              </span>
              <span className="podium__step">{ORDINAL[i]}</span>
            </li>
          );
        }
        const teams = [...new Set(place.teams)];
        const colours = teamColours(teams);
        const who = (
          <>
            <span className="podium__crests">
              {teams.map((t) => (
                <TeamCrest key={t} team={t} size={i === 0 ? 60 : 46} className="podium__crest" />
              ))}
            </span>
            <span className="podium__title">{place.title}</span>
            {place.detail && <span className="podium__detail">{place.detail}</span>}
          </>
        );
        return (
          <li
            key={i}
            className={`podium__place podium__place--${i + 1} ${colours.className}`}
            style={colours.style}
            data-rank={rank}
          >
            {place.href ? (
              <a className="podium__who" href={place.href}>
                {who}
              </a>
            ) : (
              <span className="podium__who">{who}</span>
            )}
            <span className="podium__step">{ORDINAL[rank - 1]}</span>
          </li>
        );
      })}
    </ol>
  );
}
