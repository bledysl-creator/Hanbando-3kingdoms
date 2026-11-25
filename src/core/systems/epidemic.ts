// 역병과 구휼 (v2.3): 여름·큰비 뒤 인구 밀집 도시에 역병이 돌고 이웃으로 번진다.
import { BALANCE } from '../config';
import { chance } from '../rng/rng';
import { neighbors } from '../query';
import { log } from '../commands/commands';
import type { GameState } from '../state/types';

export function outbreakChance(s: GameState, cityId: string): number {
  const c = s.cities[cityId];
  if ((c.epidemic ?? 0) > 0) return 0;
  const w = s.weather[cityId];
  const seasonal = s.season === 1 ? BALANCE.epidemicSummer : BALANCE.epidemicOther;
  return seasonal + (c.population / 100000) * BALANCE.epidemicDensity + (w === 'storm' || w === 'typhoon' ? BALANCE.epidemicFlood : 0) - (c.order / 100) * BALANCE.epidemicOrderGuard;
}

export function processEpidemics(s: GameState) {
  const spreading: string[] = [];
  for (const c of Object.values(s.cities)) {
    if ((c.epidemic ?? 0) > 0) {
      c.population = Math.round(c.population * (1 - BALANCE.epidemicPopLoss));
      c.troops = Math.round(c.troops * (1 - BALANCE.epidemicTroopLoss));
      c.order = Math.max(0, c.order - BALANCE.epidemicOrderLoss);
      for (const n of neighbors(s, c.id)) if (n.road.type !== 'sea' && !(n.city.epidemic ?? 0) && chance(s, BALANCE.epidemicSpread)) spreading.push(n.city.id);
      c.epidemic = (c.epidemic ?? 0) - 1;
      if (c.epidemic === 0) log(s, `${c.name}의 역병이 가라앉았습니다.`, 'info', c.owner);
    } else if (chance(s, Math.max(0, outbreakChance(s, c.id)))) {
      c.epidemic = BALANCE.epidemicTurns;
      log(s, `${c.name}에 역병이 돌기 시작했습니다! 구휼로 막을 수 있습니다.`, 'danger', c.owner);
    }
  }
  for (const id of spreading) {
    const c = s.cities[id];
    if ((c.epidemic ?? 0) > 0) continue;
    c.epidemic = BALANCE.epidemicTurns - 1;
    log(s, `역병이 ${c.name}(으)로 번졌습니다.`, 'warn', c.owner);
  }
}

/** 구휼에 드는 곡식 */
export const reliefFood = (s: GameState, cityId: string) => Math.ceil((s.cities[cityId].population / 1000) * BALANCE.reliefFoodPer1000);
