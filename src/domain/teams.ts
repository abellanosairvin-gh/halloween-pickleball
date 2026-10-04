import type { Gender, TeamId } from './types';

export interface Team {
  id: TeamId;
  name: string;
}

/** Display order everywhere a fixed team order is needed. */
export const TEAMS: readonly Team[] = [
  { id: 'pumpkin', name: 'Pumpkin' },
  { id: 'witch', name: 'Witch' },
  { id: 'skull', name: 'Skull' },
  { id: 'bat', name: 'Bat' },
];

export const TEAM_IDS: readonly TeamId[] = TEAMS.map((t) => t.id);

export function teamName(id: TeamId): string {
  return TEAMS.find((t) => t.id === id)?.name ?? id;
}

export const GENDER_LABEL: Record<Gender, string> = { F: 'Women', M: 'Men' };
