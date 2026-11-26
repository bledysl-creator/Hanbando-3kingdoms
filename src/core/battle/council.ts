// v4.0 책사 회의: 지력 70 이상 책사들이 같은 싸움을 두고 서로 다른 계획과 승률을 내놓는다.
// 실제 승률은 같은 전투를 여러 번 굴려 본 값이고, 책사는 지력이 낮을수록 그 값을 크게 잘못 본다.
// 성향도 판단에 끼어든다: 위험을 즐기는 책사는 계책을, 자존심 센 책사는 낙관을 앞세운다.
// 책사의 계획을 그대로 따르면 "내 말을 들어 주었다"며 충성이 조금 오른다 (포상보다는 적게).
import { BALANCE } from '../config';
import { marchInput } from '../commands/commands';
import { generalsIn, neighbors } from '../query';
import type { GameState, General } from '../state/types';
import { resolveBattle } from './battle';
import { FORMATIONS, type FormationKind } from './formation';
import { TACTICS, tacticChance, type TacticKind } from './tactics';

export interface Plan { formation?: FormationKind; tactic?: TacticKind }
export interface Advice { advisorId: string; plan: Plan | null; believed: number; text: string; accuracy: number }

const key = (p: Plan) => `${p.formation ?? ''}|${p.tactic ?? ''}`;

/** 문자열 → 0~1 고정 난수 (상태를 건드리지 않는다) */
function hash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
/** 고정 정규분포 근사 (평균 0, 표준편차 1) */
const gauss = (str: string) => (hash01(str + 'a') + hash01(str + 'b') + hash01(str + 'c') + hash01(str + 'd') - 2) * Math.sqrt(3);

/** 가능한 계획들과 실제 승률 (같은 전투를 councilSims번 굴린다. 게임 난수는 쓰지 않음) */
export function planOdds(s: GameState, fid: string, g: General, toId: string, troops: number): { plan: Plan; win: number }[] {
  const from = s.cities[g.city], to = s.cities[toId];
  const road = neighbors(s, from.id).find((n) => n.city.id === toId)?.road;
  if (!road) return [];
  const defenders = generalsIn(s, toId).filter((x) => x.faction === to.owner);
  const tactics: (TacticKind | undefined)[] = [undefined, ...TACTICS.filter((t) => tacticChance(t.id, { general: g, defenders, weather: s.weather[toId], road, target: to }) > 0).map((t) => t.id)];
  // v4.1 편제는 도시의 군사 편제를 따른다 — 책사는 계책(과 정공법)을 두고 다툰다
  const forms: (FormationKind | undefined)[] = [undefined];
  const out: { plan: Plan; win: number }[] = [];
  for (const formation of forms) for (const tactic of tactics) {
    const input = marchInput(s, fid, g, from, to, troops, road, tactic, formation);
    let win = 0;
    for (let i = 0; i < BALANCE.councilSims; i++) {
      const rng = { rng: Math.floor(hash01(`${s.year}|${s.turn}|${toId}|${i}`) * 4294967296) };
      if (resolveBattle(rng, input).won) win++;
    }
    out.push({ plan: { formation, tactic }, win: win / BALANCE.councilSims });
  }
  return out;
}

/** 책사 후보: 우리 세력에서 지력 70 이상, 지력 높은 순 */
export function advisorsOf(s: GameState, fid: string): General[] {
  return Object.values(s.generals).filter((x) => x.alive && x.faction === fid && x.stats.intellect >= BALANCE.councilMinInt)
    .sort((a, b) => b.stats.intellect - a.stats.intellect).slice(0, BALANCE.councilMax);
}

function planName(p: Plan): string {
  const f = p.formation ? FORMATIONS.find((x) => x.id === p.formation)! : null;
  const t = p.tactic ? TACTICS.find((x) => x.id === p.tactic)! : null;
  return `${f ? `${f.icon}${f.name} ` : ''}${t ? `${t.icon}${t.name}` : '정공법'}`;
}

/** 한 책사의 의견 */
export function adviceOf(s: GameState, a: General, odds: { plan: Plan; win: number }[], toId: string, troops: number): Advice {
  const noise = ((100 - a.stats.intellect) / 100) * BALANCE.councilNoise;
  const optimism = (a.persona.pride - 50) / 500; // 자존심 → 낙관
  const daring = (a.persona.risk - 50) / 400; // 모험심 → 계책 선호
  const bucket = Math.round(troops / 1000);
  let best: { plan: Plan; believed: number } | null = null;
  for (const o of odds) {
    const believed = Math.max(0, Math.min(1, o.win + gauss(`${a.id}|${s.turn}|${toId}|${bucket}|${key(o.plan)}`) * noise + optimism + (o.plan.tactic ? daring : 0)));
    if (!best || believed > best.believed) best = { plan: o.plan, believed };
  }
  const accuracy = 1 - noise;
  if (!best) return { advisorId: a.id, plan: null, believed: 0, text: '길이 없습니다.', accuracy };
  const pct = Math.round(best.believed * 100);
  const text = best.believed < 0.35
    ? `지금 치면 이길 확률이 ${pct}%에 불과합니다. 병력을 더 모으시거나 때를 기다리십시오.`
    : best.believed >= 0.8
      ? `${planName(best.plan)}(으)로 치면 ${pct}% 이깁니다. 망설일 까닭이 없습니다.`
      : `${planName(best.plan)}(이)가 상책입니다. 제가 보기에 이길 확률은 ${pct}%입니다.`;
  return { advisorId: a.id, plan: best.believed < 0.35 ? null : best.plan, believed: best.believed, text, accuracy };
}

/** 책사 회의 전체 (출진 화면) */
export function council(s: GameState, fid: string, g: General, toId: string, troops: number): { advice: Advice[]; odds: { plan: Plan; win: number }[] } {
  const advisors = advisorsOf(s, fid);
  if (!advisors.length) return { advice: [], odds: [] };
  const odds = planOdds(s, fid, g, toId, troops);
  return { advice: advisors.map((a) => adviceOf(s, a, odds, toId, troops)), odds };
}

/** 출진 명령이 그 책사의 계획을 그대로 따랐는가 */
export function followsAdvice(s: GameState, fid: string, g: General, toId: string, troops: number, advisorId: string, formation?: FormationKind, tactic?: TacticKind): boolean {
  const a = s.generals[advisorId];
  if (!a || a.faction !== fid || a.stats.intellect < BALANCE.councilMinInt) return false;
  const adv = adviceOf(s, a, planOdds(s, fid, g, toId, troops), toId, troops);
  return !!adv.plan && adv.plan.formation === formation && adv.plan.tactic === tactic;
}
