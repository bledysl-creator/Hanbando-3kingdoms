// 장수 인격 (v0.9): 명령 수행·거부, 장수 의견, 기억 (Game.md 5-1, ChatGPT 기획 "명령을 거부할 수도 있다")
import { BALANCE } from '../config';
import { relationBetween } from '../query';
import type { GameState, General, MemoryKind } from '../state/types';

/** 명령 복종도 0~100 */
export function obedience(s: GameState, g: General): number {
  if (!g.faction) return 0;
  const ruler = s.factions[g.faction].rulerId;
  if (g.id === ruler) return 100;
  const rel = relationBetween(s, g.id, ruler);
  if (rel?.type === 'sworn') return 100;
  let o = g.loyalty * 0.6 + g.persona.righteousness * 0.35 - g.persona.pride * 0.15 + 10;
  if (rel?.type === 'trust') o += 15;
  if (rel?.type === 'enmity') o -= 25;
  for (const m of g.memories ?? []) {
    if (m.with !== ruler) continue;
    if (m.kind === 'rewarded') o += 3;
    if (m.kind === 'ignored') o -= 4;
  }
  return Math.max(0, Math.min(100, Math.round(o)));
}

/** 출진 명령을 거부할 확률. ratio = 예상 승산 */
export function refuseChance(s: GameState, g: General, ratio: number): number {
  const ob = obedience(s, g);
  if (ob >= 100) return 0;
  let p = (BALANCE.refuseBaseObedience - ob) / 100;
  // 승산이 낮은데 신중한 장수는 꺼린다, 승산이 높으면 무모한 장수는 앞장선다
  if (ratio < 0.8) p += (100 - g.persona.risk) / 400;
  if (ratio > 1.4) p -= g.persona.risk / 400;
  return Math.max(0, Math.min(BALANCE.refuseMax, p));
}

export type Opinion = { generalId: string; stance: 'for' | 'against' | 'caution'; text: string };

/** 출진 전 장수들의 의견 (같은 도시의 아군 장수 최대 3명) */
export function marchOpinions(s: GameState, cityId: string, ratio: number, supplyLow: boolean, targetIsTruce: boolean): Opinion[] {
  const f = s.cities[cityId].owner;
  const gens = Object.values(s.generals)
    .filter((g) => g.alive && g.faction === f && g.city === cityId && s.factions[f!].rulerId !== g.id)
    .sort((a, b) => b.stats.intellect + b.stats.war - (a.stats.intellect + a.stats.war))
    .slice(0, 3);
  return gens.map((g) => {
    if (targetIsTruce && g.persona.righteousness >= 80) return { generalId: g.id, stance: 'against', text: '맹약을 어기는 것은 신의가 아닙니다.' };
    if (supplyLow && g.stats.intellect >= 70) return { generalId: g.id, stance: 'caution', text: '군량이 넉넉하지 않습니다. 보급부터 챙기셔야 합니다.' };
    if (ratio < 0.9 && g.stats.intellect >= 85) return { generalId: g.id, stance: 'against', text: `승산이 낮습니다(약 ${ratio.toFixed(1)}배). 외교나 계책으로 풀어 보시지요.` };
    if (g.persona.risk >= 75) return { generalId: g.id, stance: 'for', text: ratio >= 1 ? '단숨에 쓸어버립시다!' : '적이 많아도 두렵지 않습니다. 나가 싸웁시다!' };
    if (ratio >= 1.3) return { generalId: g.id, stance: 'for', text: '지금이 기회입니다.' };
    if (ratio < 1) return { generalId: g.id, stance: 'caution', text: '병력을 더 모은 뒤에 치는 것이 좋겠습니다.' };
    return { generalId: g.id, stance: 'caution', text: '해볼 만하지만 손실을 각오해야 합니다.' };
  });
}

export function remember(g: General, turn: number, kind: MemoryKind, withId: string) {
  g.memories = [...(g.memories ?? []), { turn, kind, with: withId }].slice(-BALANCE.memoryLimit);
}

export const MEMORY_LABEL: Record<MemoryKind, string> = {
  rewarded: '포상을 받음',
  ignored: '진언이 무시됨',
  defeatedBy: '전투에서 패함',
  defeated: '전투에서 이김',
  recruitedBy: '등용됨',
  refusedOrder: '명령을 거부함',
};
