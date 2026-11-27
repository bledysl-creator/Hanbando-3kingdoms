// 관직 (v2.4): 도시마다 태수를 임명하면 태수의 정치력으로 도시가 스스로 발전한다.
import { BALANCE } from '../config';
import { chance } from '../rng/rng';
import type { GameState } from '../state/types';
import { gainExp } from './stats';

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
    gainExp(s, g, 'politics', BALANCE.growExp.governor.politics ?? 0); // v4.2 다스리며 배운다
    const p = g.stats.politics / BALANCE.governorDevDivisor;
    if (c.agriculture < 100 && chance(s, p)) c.agriculture += 1;
    if (c.commerce < 100 && chance(s, p)) c.commerce += 1;
    // v4.2 치안: 정치(다스림)·매력(인망)·무력(위엄) 중 하나라도 뛰어나면 민심을 지킨다
    if (g.stats.politics >= 70 || g.stats.charm >= 80 || g.stats.war >= BALANCE.governorWarOrder) c.order = Math.min(100, c.order + BALANCE.governorOrder);
  }
}
