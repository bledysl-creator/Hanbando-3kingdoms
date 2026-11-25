// 계략·첩보 (v1.1): 전장의 안개, 첩보(오보 가능), 유언비어, 이간 (Game.md 5-4)
import { BALANCE } from '../config';
import { chance, randRange } from '../rng/rng';
import { generalsIn, neighbors, relationBetween } from '../query';
import type { GameState, General } from '../state/types';

/** 우리 도시 또는 인접 도시면 정확히 보인다 */
export function isVisible(s: GameState, fid: string, cityId: string): boolean {
  const c = s.cities[cityId];
  if (c.owner === fid) return true;
  return neighbors(s, cityId).some((n) => n.city.owner === fid);
}

export type TroopView = { value: number | null; exact: boolean; age?: number; note?: string };

/** 플레이어가 보는 적 병력 (안개) */
export function visibleTroops(s: GameState, fid: string | null, cityId: string): TroopView {
  if (!fid) return { value: s.cities[cityId].troops, exact: true };
  if (isVisible(s, fid, cityId)) return { value: s.cities[cityId].troops, exact: true };
  const i = s.intel[fid]?.[cityId];
  if (i && s.turn - i.turn <= BALANCE.intelValidTurns) return { value: i.troops, exact: false, age: s.turn - i.turn, note: '첩보' };
  return { value: null, exact: false };
}

/** 2칸 이내 도시인가 (첩보 사거리) */
export function withinTwo(s: GameState, from: string, to: string): boolean {
  if (from === to) return true;
  return neighbors(s, from).some((n) => n.city.id === to || neighbors(s, n.city.id).some((m) => m.city.id === to));
}

function bestIntellect(s: GameState, cityId: string, owner: string | null): number {
  return generalsIn(s, cityId).filter((g) => g.faction === owner).reduce((a, g) => Math.max(a, g.stats.intellect), 40);
}

export function scoutChance(s: GameState, g: General, cityId: string) {
  return Math.max(0.2, Math.min(0.95, 0.45 + (g.stats.intellect - bestIntellect(s, cityId, s.cities[cityId].owner) * 0.6) / 100));
}

export function scout(s: GameState, g: General, cityId: string): { ok: boolean; message: string } {
  const c = s.cities[cityId];
  const p = scoutChance(s, g, cityId);
  const success = chance(s, p);
  // 실패하면 적이 흘린 가짜 정보를 받는다 (플레이어는 모른다)
  const value = success ? c.troops : Math.round(c.troops * randRange(s, 0.55, 1.5));
  s.intel[g.faction!] = { ...(s.intel[g.faction!] ?? {}), [cityId]: { turn: s.turn, troops: value, false: !success } };
  return { ok: true, message: `${g.name}의 첩자가 ${c.name}의 병력을 약 ${value.toLocaleString()}명으로 보고했습니다.` };
}

export function rumorChance(s: GameState, g: General, cityId: string) {
  return Math.max(0.1, Math.min(0.9, 0.3 + (g.stats.intellect - bestIntellect(s, cityId, s.cities[cityId].owner) * 0.5) / 100));
}

export function rumor(s: GameState, g: General, cityId: string): { ok: boolean; message: string } {
  const c = s.cities[cityId];
  const p = rumorChance(s, g, cityId);
  if (!chance(s, p)) return { ok: false, message: `${c.name}에 퍼뜨린 유언비어가 먹히지 않았습니다. (확률 ${Math.round(p * 100)}%)` };
  c.order = Math.max(0, c.order - BALANCE.rumorOrder);
  c.morale = Math.max(0, c.morale - BALANCE.rumorMorale);
  return { ok: true, message: `${c.name}에 유언비어가 돌아 민심 −${BALANCE.rumorOrder}, 사기 −${BALANCE.rumorMorale}` };
}

export function discordChance(s: GameState, g: General, target: General) {
  if (!target.faction) return 0;
  const ruler = s.factions[target.faction].rulerId;
  if (target.id === ruler) return 0;
  const rel = relationBetween(s, target.id, ruler);
  if (rel?.type === 'sworn') return 0;
  return Math.max(0.05, Math.min(0.8, 0.25 + (g.stats.intellect - target.stats.intellect) / 120 + (target.persona.ambition - target.persona.righteousness) / 200 - (rel?.type === 'trust' ? 0.2 : 0)));
}

export function discord(s: GameState, g: General, target: General): { ok: boolean; message: string } {
  const p = discordChance(s, g, target);
  if (p <= 0) return { ok: false, message: `${target.name}은(는) 군주와의 정이 깊어 이간할 수 없습니다.` };
  if (!chance(s, p)) return { ok: false, message: `${target.name} 이간 실패. (확률 ${Math.round(p * 100)}%)` };
  const loss = Math.round(randRange(s, 10, 20));
  target.loyalty = Math.max(0, target.loyalty - loss);
  return { ok: true, message: `${target.name}의 충성이 ${loss} 떨어졌습니다. (현재 ${target.loyalty})` };
}
