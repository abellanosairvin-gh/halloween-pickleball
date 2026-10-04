import { SEED_PLAYERS } from '../src/data/seedPlayers';
import type { Player } from '../src/domain/types';

export function rosterPlayers(): Player[] {
  return SEED_PLAYERS.map((p, i) => ({ id: `p${i + 1}`, ...p, checkedInAt: null, teamId: null }));
}

/** Deterministic PRNG (mulberry32) so shuffles and tie-breaks are repeatable. */
export function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type Assignment = { gender: string; skill: string; teamId: string | null };

/** For each gender × skill group, the spread (max − min) of its members across the four teams. */
export function bucketSpreads(players: readonly Assignment[], teamIds: readonly string[]): Record<string, number> {
  const spreads: Record<string, number> = {};
  for (const g of ['F', 'M']) {
    for (const s of ['A', 'B']) {
      const counts = teamIds.map((t) => players.filter((p) => p.teamId === t && p.gender === g && p.skill === s).length);
      spreads[`${g}${s}`] = Math.max(...counts) - Math.min(...counts);
    }
  }
  return spreads;
}
