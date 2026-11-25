// 관직 (v2.4): 도시마다 태수를 임명하면 태수의 정치력으로 도시가 스스로 발전한다.
import { BALANCE } from '../config';
import { chance } from '../rng/rng';
import type { GameState } from '../state/types';

/** 태수가 유효한지: 살아 있고, 같은 세력이며, 그 도시에 있어야 한다 */
export function governorOf(s: GameState, cityId: string) {
  const c = s.cities[cityId];
  const g = c.governor ? s.generals[c.governor] : undefined;
  return g && g.alive && g.faction === c.owner && g.city === cityId ? g : undefined;
}

export function processGovernors(s: GameState) {
  for (const c of Object.values(s.cities)) {
    if (!c.governor) continue;
    const g = governorOf(s, c.id);
    if (!g) { c.governor = undefined; continue; }
    const p = g.stats.politics / BALANCE.governorDevDivisor;
    if (c.agriculture < 100 && chance(s, p)) c.agriculture += 1;
    if (c.commerce < 100 && chance(s, p)) c.commerce += 1;
    if (g.stats.politics >= 70 || g.stats.charm >= 80) c.order = Math.min(100, c.order + BALANCE.governorOrder);
  }
}
