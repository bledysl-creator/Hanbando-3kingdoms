// 산불 (v2.8): 봄·가을 건조기와 가뭄에 산이 많은 도시에서 산불이 나고, 육로 이웃으로 번진다.
// 비·폭우·눈은 불을 끈다. 화공이 성공하면 공격받은 도시에 불이 붙는다.
import { BALANCE } from '../config';
import { chance } from '../rng/rng';
import { neighbors } from '../query';
import { log } from '../commands/commands';
import type { GameState } from '../state/types';

const WET = new Set(['rain', 'storm', 'typhoon', 'snow', 'blizzard']);

export function fireChance(s: GameState, cityId: string): number {
  const c = s.cities[cityId];
  if ((c.fire ?? 0) > 0) return 0;
  const w = s.weather[cityId];
  if (w && WET.has(w)) return 0;
  const dry = s.season === 0 || s.season === 2 ? BALANCE.fireDrySeason : BALANCE.fireOtherSeason;
  const forest = (c.terrain === 'mountain' ? BALANCE.fireMountain : 0) + c.wood * BALANCE.fireWoodLevel + Math.min(0.02, (c.elev ?? 0) / 50000);
  // 군현 지도는 도시가 약 14배 많으므로 발생 확률을 낮춰 전국 빈도를 맞춘다 (v3.2)
  return (dry + forest + (w === 'drought' ? BALANCE.fireDrought : 0)) * (s.mapScale === 'region' ? BALANCE.regionEventScale : 1);
}

export function igniteCity(s: GameState, cityId: string, turns: number = BALANCE.fireTurns) {
  const c = s.cities[cityId];
  if ((c.fire ?? 0) >= turns) return;
  c.fire = turns;
}

export function processWildfires(s: GameState) {
  const spread: string[] = [];
  for (const c of Object.values(s.cities)) {
    const w = s.weather[c.id];
    if ((c.fire ?? 0) > 0) {
      if (w && WET.has(w)) { c.fire = 0; log(s, `${WEATHER_LABEL_KO[w] ?? '비'}이(가) ${c.name}의 산불을 껐습니다.`, 'info', c.owner); continue; }
      c.population = Math.round(c.population * (1 - BALANCE.firePopLoss));
      c.order = Math.max(0, c.order - BALANCE.fireOrderLoss);
      c.agriculture = Math.max(5, c.agriculture - BALANCE.fireAgriLoss);
      for (const n of neighbors(s, c.id)) {
        if (n.road.type === 'sea' || (n.city.fire ?? 0) > 0) continue;
        const nw = s.weather[n.city.id];
        if (nw && WET.has(nw)) continue;
        if (chance(s, BALANCE.fireSpread * (n.city.terrain === 'mountain' ? 1.5 : 1))) spread.push(n.city.id);
      }
      c.fire = (c.fire ?? 0) - 1;
      if (c.fire === 0) log(s, `${c.name}의 산불이 잦아들었습니다.`, 'info', c.owner);
    } else if (chance(s, fireChance(s, c.id))) {
      c.fire = BALANCE.fireTurns;
      log(s, `${c.name} 일대 산에서 큰 산불이 났습니다! 인구·농지가 타고 목재 생산이 줄어듭니다.`, 'danger', c.owner, { event: 'fire' });
    }
  }
  for (const id of spread) {
    const c = s.cities[id];
    if ((c.fire ?? 0) > 0) continue;
    c.fire = BALANCE.fireTurns - 1;
    log(s, `산불이 ${c.name}(으)로 번졌습니다.`, 'warn', c.owner);
  }
}

const WEATHER_LABEL_KO: Record<string, string> = { rain: '비', storm: '폭우', typhoon: '태풍', snow: '눈', blizzard: '폭설' };
