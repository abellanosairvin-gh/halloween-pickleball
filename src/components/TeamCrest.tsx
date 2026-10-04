import { teamName } from '../domain/teams';
import type { TeamId } from '../domain/types';

const PATHS: Record<TeamId, string> = {
  pumpkin:
    'M11.2 6.2c-.1-1.6.3-3 1.4-4.1l1.3 1c-.8.8-1.1 1.9-1 3.1z' +
    'M12 6.4c-1-.7-2.4-.9-3.6-.5C5 4.6 2 7.6 2 13.1 2 18.3 5 21.5 8.6 21.5c1.3 0 2.4-.4 3.4-1 1 .6 2.1 1 3.4 1 3.6 0 6.6-3.2 6.6-8.4 0-5.5-3-8.5-6.4-7.2-1.2-.4-2.6-.2-3.6.5z' +
    'M6.9 11.9l2-2.8 2 2.8z M13.1 11.9l2-2.8 2 2.8z' +
    'M6.6 14.3c1.4 2 3.3 3 5.4 3s4-1 5.4-3l-1.9.5-.8 1.1-1-1-1.7 1-1.7-1-1 1-.8-1.1z',
  witch:
    'M2.5 18.6c2.4-1.4 5.9-2.2 9.5-2.2s7.1.8 9.5 2.2c-1.6 1.4-5.3 2.4-9.5 2.4s-7.9-1-9.5-2.4z' +
    'M7.4 17.1 10.6 5.4c.4-1.5 1.9-2.4 3.4-2l4.4 1.2-3.1 1.3c-.7.3-1.1 1-.9 1.7l2.2 9.5c-1.5-.4-3-.6-4.6-.6-1.7 0-3.2.2-4.6.6z' +
    'M8.9 13.1c1-.2 2-.3 3.1-.3s2.3.1 3.4.3l.4 1.7c-1.2-.2-2.5-.3-3.8-.3s-2.4.1-3.5.3z',
  skull:
    'M12 2.5c-4.7 0-8 3.3-8 7.6 0 2.6 1.2 4.5 3 5.6V19c0 .8.7 1.5 1.5 1.5h.8v-2h1.4v2h2.6v-2h1.4v2h.8c.8 0 1.5-.7 1.5-1.5v-3.3c1.8-1.1 3-3 3-5.6 0-4.3-3.3-7.6-8-7.6z' +
    'M8.8 9.4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M15.2 9.4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M12 13.8l-1.1 2h2.2z',
  bat:
    'M12 9.4c.5 0 .9-.9 1.1-2 .5.6.7 1.4.6 2.2 1.6-.6 2.8-2.2 3.4-4 .8 2 2.9 3.4 5.4 3.4-1.1 1.2-1.5 3-1.1 4.9-1.5-.9-3.4-.8-4.6.3-.4-1.1-1.4-1.8-2.6-1.8-.3 1.1-1.2 2.2-2.2 2.2s-1.9-1.1-2.2-2.2c-1.2 0-2.2.7-2.6 1.8-1.2-1.1-3.1-1.2-4.6-.3.4-1.9 0-3.7-1.1-4.9 2.5 0 4.6-1.4 5.4-3.4.6 1.8 1.8 3.4 3.4 4-.1-.8.1-1.6.6-2.2.2 1.1.6 2 1.1 2z',
};

interface Props {
  team: TeamId;
  size?: number;
  /** Set when the crest is the only thing naming the team. */
  labelled?: boolean;
  className?: string;
}

export function TeamCrest({ team, size = 20, labelled = false, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule="evenodd"
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? teamName(team) : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
    >
      <path d={PATHS[team]} />
    </svg>
  );
}
