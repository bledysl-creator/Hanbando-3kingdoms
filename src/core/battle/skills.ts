// v4.4 장수 특기: 『삼국지연의』 일화에서 가져온 명장 고유 특기(한 단어) + 손자병법에서 가져온 능력치별 일반 특기.
// 특기는 5단계 전투에서 단계마다 능력치에 비례한 확률로 발동하고, 발동하면 맞는 전술의 공격·성공률을 올리거나
// 받는 피해·사기 붕괴를 줄인다. 자동 전투(AI끼리)에는 기대값만큼 작게 반영한다 (autoSkillMul).
// 데이터: data/skills.json, 출처: docs/history/skills-v4.4.md
import skillsJson from '../../../data/skills.json';
import { BALANCE } from '../config';
import type { General, Stats } from '../state/types';
import type { UnitKind } from './formation';

/** 특기가 가리키는 전술 이름 (phased.ts의 TacOrder와 같다 — 순환 import를 피하려고 문자열로 둔다) */
export type SkillOrder = 'assault' | 'charge' | 'hold' | 'volley' | 'fire' | 'ambush' | 'feint' | 'flank' | 'night' | 'decoy' | 'rest' | 'flood' | 'raid' | 'encircle' | 'provoke' | 'halfcross';
/**
 * 발동 조건: early 1~2단계, late 4~5단계, outnumbered 내 병력이 적의 80% 미만, walled 성벽 위에서 지킴,
 * water 강·바다 길, atk/def 공격·수비 쪽, fog 안개, rough 산길·골짜기, losing 지난 단계까지 형세가 불리
 */
export type SkillCond = 'early' | 'late' | 'outnumbered' | 'walled' | 'water' | 'atk' | 'def' | 'fog' | 'rough' | 'losing';
export interface SkillEffect {
  /** 이 전술을 쓰는 병과에만 (없으면 모든 병과). 'ambush'는 매복했다가 기습하는 병과도 포함 */
  orders?: SkillOrder[];
  kinds?: UnitKind[];
  /** 공격 배율 */
  strike?: number;
  /** 받는 피해 배율 */
  expose?: number;
  /** 확률 전술 성공률 +p (orders에 든 전술만, orders가 없으면 모든 확률 전술) */
  chance?: number;
  /** 적의 확률 전술 성공률 −p (foeOrders가 있으면 그 전술만) */
  foeChance?: number;
  foeOrders?: SkillOrder[];
  /** 발동하면 적 전체 공격 배율 */
  foeStrike?: number;
  /** 발동하면 적 사기 − */
  morale?: number;
  /** 발동하면 무너지는 사기 기준 − (덜 무너짐) */
  rally?: number;
  /** 능력치 조건과 상관없이 쓸 수 있는 전술 */
  unlock?: SkillOrder[];
  when?: SkillCond[];
  /** 적 화공에 더 크게 탄다 (등갑) */
  fireWeak?: number;
}
export interface SkillDef {
  id: string; name: string; hanja: string; stat: keyof Stats; desc: string; effect: SkillEffect;
  /** 일반 특기 */
  min?: number; tier?: number; sun?: string;
  /** 고유 특기 */
  general?: string; story?: string; source?: string; passive?: boolean;
}

const RAW = skillsJson as unknown as { generic: SkillDef[]; unique: SkillDef[] };
export const GENERIC_SKILLS: SkillDef[] = RAW.generic;
export const UNIQUE_SKILLS: SkillDef[] = RAW.unique;
export const SKILLS: Record<string, SkillDef> = Object.fromEntries([...RAW.generic, ...RAW.unique].map((s) => [s.id, s]));
const UNIQUE_BY_GENERAL: Record<string, SkillDef> = Object.fromEntries(RAW.unique.map((s) => [s.general!, s]));

export const STAT_LABEL: Record<keyof Stats, string> = { leadership: '통솔', war: '무력', intellect: '지력', politics: '정치', charm: '매력' };

/** 장수의 특기: 고유 특기(있으면) + 능력치별 일반 특기 (고유 특기가 있으면 1개, 없으면 2개까지, 높은 능력치부터) */
export function skillsOf(g: Pick<General, 'id' | 'stats'>): SkillDef[] {
  const out: SkillDef[] = [];
  const u = UNIQUE_BY_GENERAL[g.id];
  if (u) out.push(u);
  const n = u ? BALANCE.skills.countWithUnique : BALANCE.skills.countMax;
  const cats = (Object.keys(STAT_LABEL) as (keyof Stats)[])
    .map((k) => ({ k, v: g.stats[k], s: GENERIC_SKILLS.filter((x) => x.stat === k && g.stats[k] >= (x.min ?? 999)).sort((a, b) => (b.min ?? 0) - (a.min ?? 0))[0] }))
    .filter((x) => x.s)
    .sort((a, b) => b.v - a.v);
  for (const c of cats.slice(0, n)) out.push(c.s!);
  return out;
}

/** 단계마다 발동할 확률: 고유 특기는 기준이 높고, 일반 특기는 단계(tier)가 낮을수록 기준이 낮다. 부장은 ×deputyMul */
export function skillChance(s: SkillDef, g: Pick<General, 'stats'>, deputy = false): number {
  const C = BALANCE.skills;
  if (s.passive) return 1;
  const v = g.stats[s.stat];
  let p: number;
  if (s.general) p = Math.max(C.uniqueMin, Math.min(C.uniqueMax, C.uniqueBase + (v - C.uniqueRef) / C.div));
  else p = Math.max(C.genericMin, Math.min(C.genericMax, C.genericBase + (v - (s.min ?? 70)) / C.div));
  return deputy ? p * C.deputyMul : p;
}

/** 전투에 붙는 특기 (상태에 저장, JSON 가능) */
export interface ActiveSkill { id: string; ownerId: string; owner: string; p: number }
export function sideSkills(gens: { g: General; deputy: boolean }[]): ActiveSkill[] {
  const out: ActiveSkill[] = [];
  for (const { g, deputy } of gens) for (const s of skillsOf(g)) out.push({ id: s.id, ownerId: g.id, owner: g.name, p: skillChance(s, g, deputy) });
  return out;
}

/** 이 특기가 주어진 전술을 쓸 수 있게 해 주나 */
export const unlocks = (skills: ActiveSkill[] | undefined, order: SkillOrder) => (skills ?? []).some((a) => SKILLS[a.id]?.effect.unlock?.includes(order));

/** 특기 효과를 한 줄로 (화면용) */
export function skillLabel(s: SkillDef): string {
  return `${s.name}(${s.hanja})`;
}

/**
 * 자동 전투(AI끼리·한 번에 결판)용 특기 배율: 정면 싸움에 늘 쓰이는 효과만 발동 확률만큼 작게 반영한다.
 * 계략 전용 특기(화공·수공·매복 등)는 5단계 전투에서만 힘을 쓴다.
 */
export function autoSkillMul(gens: { g: General; deputy: boolean }[], ctx: { atk: boolean; walled: boolean; outnumbered: boolean; water: boolean; fog: boolean; rough: boolean }): { mul: number; names: string[] } {
  const C = BALANCE.skills;
  let v = 0;
  const names: string[] = [];
  const PLAIN: SkillOrder[] = ['assault', 'charge', 'hold', 'volley', 'flank'];
  for (const a of sideSkills(gens)) {
    const s = SKILLS[a.id];
    const e = s.effect;
    if (e.orders && !e.orders.some((o) => PLAIN.includes(o))) continue;
    let w = 1;
    for (const c of e.when ?? []) {
      if (c === 'early' || c === 'late' || c === 'losing') w *= 0.4;
      else if ((c === 'atk' && !ctx.atk) || (c === 'def' && ctx.atk) || (c === 'walled' && !(ctx.walled && !ctx.atk)) || (c === 'outnumbered' && !ctx.outnumbered) || (c === 'water' && !ctx.water) || (c === 'fog' && !ctx.fog) || (c === 'rough' && !ctx.rough)) w = 0;
    }
    if (!w) continue;
    const share = e.kinds ? 0.35 : e.orders ? 0.6 : 1;
    let gain = 0;
    if (e.strike && e.strike > 1) gain += (e.strike - 1) * share;
    if (e.expose && e.expose < 1) gain += (1 - e.expose) * share * 0.5;
    if (e.foeStrike && e.foeStrike < 1) gain += (1 - e.foeStrike) * 0.3;
    if (e.rally) gain += e.rally / 200;
    if (gain > 0) { v += a.p * w * gain; if (s.general) names.push(`${a.owner}「${s.name}」`); }
  }
  return { mul: Math.min(C.autoCap, 1 + v * C.autoWeight), names };
}
