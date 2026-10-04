import type { ReactNode } from 'react';
import type { TeamId } from '../domain/types';
import { TeamCrest } from './TeamCrest';

export interface PodiumPlace {
  teamId: TeamId;
  /** Shown above the step: a team name or a pair's names. */
  title: ReactNode;
  detail?: ReactNode;
  href?: string;
}

const ORDINAL = ['1st', '2nd', '3rd', '4th'];

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
        const who = (
          <>
            <TeamCrest team={place.teamId} size={i === 0 ? 60 : 46} className="podium__crest" />
            <span className="podium__title">{place.title}</span>
            {place.detail && <span className="podium__detail">{place.detail}</span>}
          </>
        );
        return (
          <li key={i} className={`podium__place podium__place--${i + 1} team-${place.teamId}`} data-rank={rank}>
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
