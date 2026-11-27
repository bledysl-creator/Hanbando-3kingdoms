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
/**
 * v4.4.1 고유 기술 조건: dry 비·눈이 아님, wet 강을 낀 길·바다·비·눈, atk/def 공격·수비 쪽, walled 성벽 위에서 지킴,
 * rough 험한 길, losing 형세가 불리, notLast 마지막 단계가 아님, midLate 3단계부터
 */
export type TechNeed = 'dry' | 'wet' | 'atk' | 'def' | 'walled' | 'rough' | 'losing' | 'notLast' | 'midLate';
/**
 * v4.4.1 고유 기술: 고유 특기를 가진 장수만 전투당 한 번 쓰는 필살기. 성공하면 이번 단계에 크게 작용한다.
 * 성공률 = base + (특기 능력치 − 80)/100 (계략형 wits는 적 지력이 더 높으면 깎임), 실패하면 아군 사기 −failMorale.
 */
export interface TechDef {
  name: string; hanja: string; desc: string;
  base: number;
  /** 성공하면 적 병력을 곧바로 이 비율만큼 없앤다 (대화공·수엄 등). 강·바다 싸움이면 ×waterMul */
  kill?: number; waterMul?: number;
  /** 이번 단계 아군 공격 배율 (kinds가 있으면 그 병과만) / 아군이 받는 피해 배율 */
  strike?: number; kinds?: UnitKind[]; expose?: number;
  /** 이번 단계 적 공격 배율 / 적이 받는 피해 배율 */
  foeStrike?: number; foeExpose?: number;
  /** 적 사기 − / 아군 사기 + / 무너지는 기준 − */
  morale?: number; heal?: number; rally?: number;
  /** 대복병: 전 병과가 들키지 않고 숨고 다음 단계 기습 ×springMul 더 */
  hideAll?: boolean; springMul?: number;
  /** 적을 끌어들임(다음 단계 대열 흐트러짐) / 적 군량을 태움 / 적이 지침 / 적 특기·계략을 모두 막음 */
  lure?: boolean; starve?: boolean; tire?: boolean; nullify?: boolean;
  /** 계략형: 적 장수 지력이 높으면 성공률이 깎인다 */
  wits?: boolean;
  need?: TechNeed[];
  failMorale?: number;
}
export interface SkillDef {
  id: string; name: string; hanja: string; stat: keyof Stats; desc: string; effect: SkillEffect;
  /** v4.4.1 고유 기술 (고유 특기만) */
  tech?: TechDef;
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
export interface ActiveSkill {
  id: string; ownerId: string; owner: string; p: number;
  /** v4.4.1 특기 능력치 값과 부장 여부 (고유 기술 성공률) */
  v?: number; deputy?: boolean;
}
export function sideSkills(gens: { g: General; deputy: boolean }[]): ActiveSkill[] {
  const out: ActiveSkill[] = [];
  for (const { g, deputy } of gens) for (const s of skillsOf(g)) out.push({ id: s.id, ownerId: g.id, owner: g.name, p: skillChance(s, g, deputy), v: g.stats[s.stat], deputy });
  return out;
}

/** v4.4.1 고유 기술 성공률: base + (능력치 − 80)/100, 계략형은 적 지력이 더 높으면 (차이)/techWitsDiv만큼 깎임, 부장 ×techDeputyMul */
export function techChance(t: TechDef, v: number, deputy: boolean, foeInt = 0): number {
  const C = BALANCE.skills;
  let p = t.base + (v - C.uniqueRef) / C.div;
  if (t.wits) p -= Math.max(0, foeInt - v) / C.techWitsDiv;
  if (deputy) p *= C.techDeputyMul;
  return Math.max(C.techMin, Math.min(C.techMax, p));
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
export function autoSkillMul(gens: { g: General; deputy: boolean }[], ctx: { atk: boolean; walled: boolean; outnumbered: boolean; water: boolean; fog: boolean; rough: boolean; wet?: boolean }): { mul: number; names: string[] } {
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
  let mul = Math.min(C.autoCap, 1 + v * C.autoWeight);
  // v4.4.1 고유 기술: 한 번 쓰는 필살기의 기대값을 작게 (조건이 안 맞으면 빼고)
  if (C.tech) {
    let tv = 0;
    for (const a of sideSkills(gens)) {
      const t = SKILLS[a.id]?.tech;
      if (!t) continue;
      const bad = (t.need ?? []).some((n) => (n === 'atk' && !ctx.atk) || (n === 'def' && ctx.atk) || (n === 'walled' && !(ctx.walled && !ctx.atk)) || (n === 'rough' && !ctx.rough) || (n === 'wet' && !ctx.water && !ctx.wet) || (n === 'dry' && !!ctx.wet));
      if (bad) continue;
      const gain = techGain(t, !!(ctx.water && t.waterMul));
      if (gain <= 0) continue;
      tv += techChance(t, a.v ?? C.uniqueRef, !!a.deputy) * gain;
      names.push(`${a.owner}「${t.name}」`);
    }
    mul *= Math.min(C.techAutoCap, 1 + tv * C.techAutoWeight);
  }
  return { mul, names };
}

/** 고유 기술이 한 판 전체에 주는 대략의 이득 (자동 전투 기대값용) */
export function techGain(t: TechDef, water = false): number {
  let g = 0;
  if (t.kill) g += t.kill * (water && t.waterMul ? t.waterMul : 1) * 1.5;
  if (t.strike) g += ((t.strike - 1) * (t.kinds ? 0.35 : 1)) / 3;
  if (t.expose && t.expose < 1) g += (1 - t.expose) / 4;
  if (t.foeStrike) g += (1 - t.foeStrike) / 3;
  if (t.foeExpose) g += (t.foeExpose - 1) / 4;
  g += ((t.morale ?? 0) + (t.heal ?? 0) + (t.rally ?? 0)) / 200;
  if (t.hideAll) g += 0.25;
  if (t.lure || t.starve || t.nullify) g += 0.1;
  if (t.tire) g += 0.05;
  return g;
}

// ---------------------------------------------------------------- v4.4.1 화면 설명 (마우스를 올리면 뜨는 상자)

const ORDER_NAME: Record<SkillOrder, string> = {
  assault: '정면 공격', charge: '돌격', hold: '방진', volley: '일제 사격', fire: '화공', ambush: '매복·기습', feint: '거짓 퇴각', flank: '협공', night: '야습',
  decoy: '의병', rest: '이일대로', flood: '수공', raid: '습량', encircle: '포위', provoke: '도발', halfcross: '반도격',
};
const KIND_NAME: Record<UnitKind, string> = { infantry: '보병', spear: '창병', archer: '궁병', cavalry: '기병', chariot: '전차병' };
const COND_NAME: Record<SkillCond, string> = {
  early: '1~2단계', late: '4~5단계', outnumbered: '병력이 적의 80% 미만일 때', walled: '성벽 위에서 지킬 때', water: '강·바다 싸움', atk: '공격할 때', def: '지킬 때', fog: '안개 낀 날', rough: '험한 길(산악·계곡)', losing: '형세가 불리할 때',
};
const NEED_NAME: Record<TechNeed, string> = {
  dry: '비·눈이 오지 않을 때', wet: '강을 낀 길·바다이거나 비·눈', atk: '공격할 때', def: '지킬 때', walled: '성벽 위에서 지킬 때', rough: '험한 길', losing: '형세가 불리할 때', notLast: '마지막 단계 전', midLate: '3단계부터',
};
const pc = (m: number) => `${m >= 1 ? '+' : '−'}${Math.round(Math.abs(m - 1) * 100)}%`;

/** 특기 발동 조건·확률 설명 */
export function skillRuleLines(s: SkillDef): string[] {
  const C = BALANCE.skills;
  const st = STAT_LABEL[s.stat];
  if (s.passive) return ['늘 적용 (발동 확률 없음)'];
  if (s.general) return [
    `조건: 이 장수만 가진 고유 특기`,
    `발동: 단계마다 ${Math.round(C.uniqueBase * 100)}% + (${st} − ${C.uniqueRef})%, ${Math.round(C.uniqueMin * 100)}~${Math.round(C.uniqueMax * 100)}% · 부장이면 ×${C.deputyMul}`,
  ];
  return [
    `조건: ${st} ${s.min} 이상 (능력치가 높은 순으로 ${C.countMax}개까지, 고유 특기가 있으면 ${C.countWithUnique}개)`,
    `발동: 단계마다 ${Math.round(C.genericBase * 100)}% + (${st} − ${s.min})%, ${Math.round(C.genericMin * 100)}~${Math.round(C.genericMax * 100)}% · 부장이면 ×${C.deputyMul}`,
  ];
}

/** 특기 효과를 줄마다 (공격 +x%, 성공률 +p%p …) */
export function skillEffectLines(s: SkillDef): string[] {
  const e = s.effect;
  const out: string[] = [];
  const who = [e.kinds?.map((k) => KIND_NAME[k]).join('·'), e.orders?.map((o) => ORDER_NAME[o]).join('·')].filter(Boolean).join(' ');
  const target = who ? `${who} ` : '전 병과 ';
  if (e.when?.length) out.push(`때: ${e.when.map((c) => COND_NAME[c]).join(', ')}`);
  if (e.strike) out.push(`${target}공격 ${pc(e.strike)}`);
  if (e.expose) out.push(`${target}받는 피해 ${pc(e.expose)}`);
  if (e.chance) out.push(`${e.orders ? e.orders.map((o) => ORDER_NAME[o]).join('·') : '모든 계략'} 성공률 +${Math.round(e.chance * 100)}%p`);
  if (e.foeChance) out.push(`적의 ${e.foeOrders ? e.foeOrders.map((o) => ORDER_NAME[o]).join('·') : '계략'} 성공률 −${Math.round(e.foeChance * 100)}%p`);
  if (e.foeStrike) out.push(`적 전체 공격 ${pc(e.foeStrike)}`);
  if (e.morale) out.push(`적 사기 −${e.morale}`);
  if (e.rally) out.push(`무너지는 사기 기준 −${e.rally} (덜 무너짐)`);
  if (e.unlock?.length) out.push(`능력치가 모자라도 ${e.unlock.map((o) => ORDER_NAME[o]).join('·')} 사용 가능`);
  if (e.fireWeak) out.push(`적 화공에 ×${e.fireWeak} 더 크게 탐`);
  return out;
}

/** 고유 기술 효과·조건·성공률 설명 */
export function techLines(t: TechDef, stat: keyof Stats): string[] {
  const C = BALANCE.skills;
  const out: string[] = [];
  if (t.kill) out.push(`성공하면 적 병력 ${Math.round(t.kill * 100)}%를 곧바로 없앰${t.waterMul ? ` (강·바다 싸움이면 ${Math.round(t.kill * t.waterMul * 100)}%)` : ''}`);
  if (t.strike) out.push(`이번 단계 ${t.kinds ? t.kinds.map((k) => KIND_NAME[k]).join('·') : '아군 전 병과'} 공격 ${t.strike >= 2 ? `×${t.strike}` : pc(t.strike)}`);
  if (t.expose) out.push(`이번 단계 아군 받는 피해 ${pc(t.expose)}`);
  if (t.foeStrike) out.push(`이번 단계 적 공격 ${pc(t.foeStrike)}`);
  if (t.foeExpose) out.push(`이번 단계 적이 받는 피해 ${pc(t.foeExpose)}`);
  if (t.hideAll) out.push(`전 병과가 들키지 않고 숨음 → 다음 단계 기습 (일반 매복 기습보다 ${pc(t.springMul ?? 1)})`);
  if (t.lure) out.push('적을 끌어들여 다음 단계 적 대열이 흐트러짐');
  if (t.starve) out.push('적 군량이 불타 남은 싸움 내내 굶주림');
  if (t.tire) out.push('적이 다음 단계 지침');
  if (t.nullify) out.push('이번 단계 적 특기가 모두 막히고 적 계략이 모두 실패');
  if (t.morale) out.push(`적 사기 −${t.morale}`);
  if (t.heal) out.push(`아군 사기 +${t.heal}`);
  if (t.rally) out.push(`무너지는 사기 기준 −${t.rally}`);
  if (t.need?.length) out.push(`조건: ${t.need.map((n) => NEED_NAME[n]).join(', ')}`);
  out.push(`성공률: ${Math.round(t.base * 100)}% + (${STAT_LABEL[stat]} − ${C.uniqueRef})%${t.wits ? `, 적 장수 지력이 더 높으면 (차이 ÷ ${C.techWitsDiv / 100})%만큼 깎임` : ''} · 부장이면 ×${C.techDeputyMul} · 전투당 한 번, 실패하면 아군 사기 −${t.failMorale ?? C.techFailMorale}`);
  return out;
}
