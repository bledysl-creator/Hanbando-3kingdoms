// 전투 결과 예측 (난수 없이). AI 판단과 장수 의견·거부 판단에 쓴다.
import { BALANCE } from '../config';
import { generalsIn, neighbors } from '../query';
import type { City, GameState, General } from '../state/types';
import { weatherAttackModifier } from '../systems/weather';
import { qualityFactor } from './battle';

export function estimateRatio(s: GameState, g: General, from: City, to: City, troops: number): number {
  const road = neighbors(s, from.id).find((n) => n.city.id === to.id)?.road;
  const roadMod = road ? BALANCE.roadAttackModifier[road.type] ?? 1 : 1;
  const wm = weatherAttackModifier(s.weather[to.id], road?.type ?? 'land').mul;
  const atk = troops * (0.5 + g.stats.leadership / 100) * (0.7 + g.stats.war / 333) * roadMod * wm * qualityFactor(from.morale, from.training);
  const defs = generalsIn(s, to.id).filter((x) => x.faction === to.owner);
  const best = defs.reduce<number>((a, x) => Math.max(a, x.stats.leadership), BALANCE.neutralLeadership);
  const wallMul = 1 + (to.wall / 200) * (to.fortress ? BALANCE.fortressWallMultiplier : 1);
  const def = to.troops * (0.5 + best / 100) * qualityFactor(to.morale, to.training) * wallMul * (to.terrain === 'mountain' ? BALANCE.mountainDefenseBonus : 1);
  return atk / Math.max(1, def);
}
