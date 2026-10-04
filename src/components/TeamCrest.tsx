import { teamName } from '../domain/teams';
import type { TeamId } from '../domain/types';

/**
 * One painted shape of a crest. `edge` layers are drawn first as a sticker outline: the silhouette
 * filled and stroked in one colour so the crest stays visible on its own team colour.
 */
interface Layer {
  d: string;
  fill: string;
  edge?: 'light' | 'dark';
}

const INK = '#1b1724';
const EDGE = { light: { color: '#ffffff', width: 2.2 }, dark: { color: INK, width: 1.6 } };

const pumpkinBody =
  'M12 6.4c-1-.7-2.4-.9-3.6-.5C5 4.6 2 7.6 2 13.1 2 18.3 5 21.5 8.6 21.5c1.3 0 2.4-.4 3.4-1 1 .6 2.1 1 3.4 1 3.6 0 6.6-3.2 6.6-8.4 0-5.5-3-8.5-6.4-7.2-1.2-.4-2.6-.2-3.6.5z';
const pumpkinStem = 'M11.2 6.2c-.1-1.6.3-3 1.4-4.1l1.3 1c-.8.8-1.1 1.9-1 3.1z';
const hatBrim = 'M2.5 18.6c2.4-1.4 5.9-2.2 9.5-2.2s7.1.8 9.5 2.2c-1.6 1.4-5.3 2.4-9.5 2.4s-7.9-1-9.5-2.4z';
const hatCone =
  'M7.4 17.1 10.6 5.4c.4-1.5 1.9-2.4 3.4-2l4.4 1.2-3.1 1.3c-.7.3-1.1 1-.9 1.7l2.2 9.5c-1.5-.4-3-.6-4.6-.6-1.7 0-3.2.2-4.6.6z';
const skull =
  'M12 2.5c-4.7 0-8 3.3-8 7.6 0 2.6 1.2 4.5 3 5.6V19c0 .8.7 1.5 1.5 1.5h.8v-2h1.4v2h2.6v-2h1.4v2h.8c.8 0 1.5-.7 1.5-1.5v-3.3c1.8-1.1 3-3 3-5.6 0-4.3-3.3-7.6-8-7.6z';
const lips =
  'M1.8 10.6c2.6-2.9 5.6-4.1 7.7-3.5.9.3 1.6.8 2.5.8s1.6-.5 2.5-.8c2.1-.6 5.1.6 7.7 3.5-2.4 4.9-6 7.4-10.2 7.4S4.2 15.5 1.8 10.6z';
const drip = 'M12 16.9c.8 1.4 1.4 2.4 1.4 3.2a1.4 1.4 0 0 1-2.8 0c0-.8.6-1.8 1.4-3.2z';

const LAYERS: Record<TeamId, Layer[]> = {
  // Toothy jack-o'-lantern with a red-hot glow.
  pumpkin: [
    { d: pumpkinStem + pumpkinBody, fill: '#ffffff', edge: 'light' },
    { d: pumpkinBody, fill: '#f28a2e' },
    { d: pumpkinStem, fill: '#4f8a2b' },
    {
      d:
        'M7 11a1.6 1.6 0 1 1 3.2 0a1.6 1.6 0 1 1-3.2 0zM13.8 11a1.6 1.6 0 1 1 3.2 0a1.6 1.6 0 1 1-3.2 0z' +
        'M12 12.4l1.1 1.6h-2.2zM6 14.8Q12 20.8 18 14.8Q12 17.2 6 14.8z',
      fill: '#c8102e',
    },
    { d: 'M9.4 15.8 10.8 16l-.5 1-.6-.1z M13.2 17.62l1.4-.42-.4-.9-.6.1z', fill: '#f28a2e' },
  ],
  // Violet hat with a black brim, a gold crescent moon and a star.
  witch: [
    { d: hatBrim + hatCone, fill: '#ffffff', edge: 'light' },
    { d: hatBrim, fill: INK },
    { d: hatCone, fill: '#8a5cc4' },
    { d: 'M9.2 12.4a2.4 2.4 0 1 1 4.8 0a2.4 2.4 0 1 1-4.8 0z', fill: '#f5c542' },
    { d: 'M10.75 11.7a2.05 2.05 0 1 1 4.1 0a2.05 2.05 0 1 1-4.1 0z', fill: '#8a5cc4' },
    {
      d: 'M13.3 6.15L13.62 6.96L14.49 7.01L13.82 7.57L14.03 8.41L13.3 7.95L12.57 8.41L12.78 7.57L12.11 7.01L12.98 6.96z',
      fill: '#f5c542',
    },
  ],
  // Bone-white skull with dark sockets.
  skull: [
    { d: skull, fill: INK, edge: 'dark' },
    { d: skull, fill: '#f3efe4' },
    { d: 'M8.8 9.4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M15.2 9.4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M12 13.8l-1.1 2h2.2z', fill: INK },
  ],
  // Dracula (the team's id stays 'bat'): red lips, white fangs and a drip of blood.
  bat: [
    { d: lips + drip, fill: '#ffffff', edge: 'light' },
    { d: lips, fill: '#d1223a' },
    { d: 'M4.6 11c2.4.7 4.8 1 7.4 1s5-.3 7.4-1c-2 2.8-4.6 4.2-7.4 4.2S6.6 13.8 4.6 11z', fill: '#7a1020' },
    { d: 'M7.3 11.5l2.3.35-1.2 3.4z M16.7 11.5l-2.3.35 1.2 3.4z', fill: '#ffffff' },
    { d: drip, fill: '#d1223a' },
  ],
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
      // The sticker edge is stroked just outside the 24×24 box.
      overflow="visible"
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? teamName(team) : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
    >
      {LAYERS[team].map((layer, i) => (
        <path
          key={i}
          d={layer.d}
          fill={layer.fill}
          fillRule="evenodd"
          stroke={layer.edge ? EDGE[layer.edge].color : undefined}
          strokeWidth={layer.edge ? EDGE[layer.edge].width : undefined}
          strokeLinejoin={layer.edge ? 'round' : undefined}
        />
      ))}
    </svg>
  );
}
