import type { GameState, Mission } from '../state/types';

export function missionProgress(s: GameState, m: Mission): { current: number; target: number; done: boolean } {
  const pf = s.playerFactionId;
  let current = 0;
  if (pf) {
    if (m.kind === 'own_all_cities') current = Object.values(s.cities).every((c) => c.owner === pf) ? 1 : 0;
    else if (m.kind === 'destroy_faction') current = m.factionId && !s.factions[m.factionId]?.alive ? 1 : 0;
    else if (m.kind === 'recruit') current = Math.min(m.target, s.recruits[pf] ?? 0);
  }
  return { current, target: m.target, done: current >= m.target };
}
