// 전투 결과 예측 (난수 없이). AI 판단과 장수 의견·거부 판단에 쓴다.
import { BALANCE } from '../config';
import { generalsIn, lastStandBonus, neighbors } from '../query';
import type { City, GameState, General } from '../state/types';
import { weatherAttackModifier } from '../systems/weather';
import { qualityFactor } from './battle';
import { landmarksOfCity, landmarksOnRoad } from '../data';

/** lastStand: 수비 세력 배수진 배율을 미리 구해 두었으면 넘긴다 (AI 성능, v3.7) */
export function estimateRatio(s: GameState, g: General, from: City, to: City, troops: number, lastStand?: number): number {
  const road = neighbors(s, from.id).find((n) => n.city.id === to.id)?.road;
  const roadMod = road ? BALANCE.roadAttackModifier[road.type] ?? 1 : 1;
  const wm = weatherAttackModifier(s.weather[to.id], road?.type ?? 'land').mul;
  let terrainMod = 1;
  if (road) {
    for (const lm of landmarksOnRoad(road.from, road.to)) terrainMod *= lm.type === 'pass' ? BALANCE.namedPassPenalty : lm.type === 'ford' ? BALANCE.fordEase : 1;
    if (road.type === 'sea') {
      const f = from.owner ? s.factions[from.owner] : null;
      terrainMod *= 1 + Math.min(BALANCE.shipAttackCap, (from.ships ?? 0) * BALANCE.shipAttackPer) + (f?.traits.includes('수군') ? BALANCE.navalTraitBonus : 0);
      terrainMod /= 1 + Math.min(BALANCE.shipDefenseCap, (to.ships ?? 0) * BALANCE.shipDefensePer);
    }
  }
  const ownTraits = from.owner ? s.factions[from.owner]?.traits ?? [] : [];
  terrainMod *= 1 + ownTraits.reduce((a, t) => a + (BALANCE.traitEffects[t]?.attack ?? 0), 0);
  const atk = terrainMod * troops * (0.5 + g.stats.leadership / 100) * (0.7 + g.stats.war / 333) * roadMod * wm * qualityFactor(from.morale, from.training);
  const defs = generalsIn(s, to.id).filter((x) => x.faction === to.owner);
  const best = defs.reduce<number>((a, x) => Math.max(a, x.stats.leadership), BALANCE.neutralLeadership);
  const wallMul = 1 + (to.wall / 200) * (to.fortress ? BALANCE.fortressWallMultiplier : 1);
  const def = to.troops * (0.5 + best / 100) * qualityFactor(to.morale, to.training) * wallMul * (to.terrain === 'mountain' ? BALANCE.mountainDefenseBonus : 1);
  const forts = 1 + BALANCE.landmarkFortressBonus * landmarksOfCity(to.id, 'fortress').length;
  const elev = 1 + Math.min(BALANCE.elevDefenseCap, ((to.elev ?? 0) / 1000) * BALANCE.elevDefensePer1000m);
  return atk / Math.max(1, def * forts * elev * (lastStand ?? lastStandBonus(s, to.owner)));
}
