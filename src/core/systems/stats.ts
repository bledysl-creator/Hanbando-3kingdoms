// v4.2 능력치 체계: 다섯 능력치가 전투·내정·국가 전체에서 맡는 역할을 한곳에 모은다 (docs/design/stats-v4.2.md).
import { BALANCE } from '../config';
import type { GameState, General, Stats } from '../state/types';

export type StatKey = keyof Stats;
export const STAT_KEYS: StatKey[] = ['leadership', 'war', 'intellect', 'politics', 'charm'];
export const STAT_NAME: Record<StatKey, string> = { leadership: '통솔', war: '무력', intellect: '지력', politics: '정치', charm: '매력' };

/** 등급: S 90+ · A 80+ · B 70+ · C 50+ · D */
export function statGrade(v: number): 'S' | 'A' | 'B' | 'C' | 'D' {
  return v >= 90 ? 'S' : v >= 80 ? 'A' : v >= 70 ? 'B' : v >= 50 ? 'C' : 'D';
}

/** 통솔 지휘 한도: 주장 통솔 × commandPerLead + 돕는 장수(부장·다른 수비 장수) 통솔 × deputyCommandPer */
export function commandCap(lead: number, helpers: number[] = []): number {
  const extra = [...helpers].sort((a, b) => b - a).slice(0, BALANCE.defenseHelpers).reduce((a, l) => a + l * BALANCE.deputyCommandPer, 0);
  return lead * BALANCE.commandPerLead + extra;
}

/** 지휘 한도를 넘는 병력은 overCommandEff 효율로만 싸운다 */
export function effectiveTroops(troops: number, cap: number): number {
  return troops <= cap ? troops : cap + (troops - cap) * BALANCE.overCommandEff;
}

/** 수비 지휘 한도: 그 성 장수 가운데 최고 통솔 + 나머지 (최대 defenseHelpers명). 장수가 없으면 한도 없음 */
export function defenseCap(defenders: General[]): number {
  if (!defenders.length) return Infinity;
  const ls = defenders.map((d) => d.stats.leadership).sort((a, b) => b - a);
  return commandCap(ls[0], ls.slice(1));
}

/** 재상: 세력의 최고 정치 장수 (군주 포함). 정치 chancellorFrom 이상이면 세력 수입 배율 */
export function chancellorOf(s: GameState, fid: string): { general: General | null; mul: number } {
  let best: General | null = null;
  for (const g of Object.values(s.generals)) if (g.alive && g.faction === fid && (!best || g.stats.politics > best.stats.politics)) best = g;
  if (!best || best.stats.politics < BALANCE.chancellorFrom) return { general: best, mul: 1 };
  return { general: best, mul: 1 + (best.stats.politics - BALANCE.chancellorFrom) / BALANCE.chancellorDiv };
}

/** 병참: 출진 도시의 최고 정치 장수가 군량 소모를 줄인다 (정치 60 = 1.0) */
export function supplyMul(s: GameState, cityId: string, fid: string): number {
  let p = 30;
  for (const g of Object.values(s.generals)) if (g.alive && g.faction === fid && g.city === cityId) p = Math.max(p, g.stats.politics);
  return BALANCE.supplyPolBase - p / BALANCE.supplyPolDiv;
}

/** 군주 매력이 충성 변화에 더하는 값 (계절마다) */
export function rulerCharmDrift(ruler: General | undefined): number {
  return ruler ? (ruler.stats.charm - BALANCE.rulerCharmRef) / BALANCE.rulerCharmDiv : 0;
}

/** 부장과 주장을 합친 "부대의 능력": 통솔은 주장, 무력·지력은 둘 중 높은 쪽 */
export function unitStats(main: General, deputy?: General | null): Stats {
  if (!deputy) return main.stats;
  return { ...main.stats, war: Math.max(main.stats.war, deputy.stats.war), intellect: Math.max(main.stats.intellect, deputy.stats.intellect) };
}

/** v4.2 성장(공적): 쓰는 능력이 경험으로 자란다. 난수 없이 확정 — 같은 일을 하면 같은 만큼 자란다 */
export function expNeed(cur: number): number {
  return cur >= 90 ? BALANCE.growNeedS : cur >= 70 ? BALANCE.growNeedB : BALANCE.growNeed;
}
/** 나이 배율: 젊을수록 빨리 배우고 늙으면 더디다 */
export function ageGrowMul(s: GameState, g: General): number {
  const age = s.year - g.birth;
  return age < BALANCE.growYoungAge ? BALANCE.growYoungMul : age >= BALANCE.growOldAge ? BALANCE.growOldMul : 1;
}
/** 경험을 더하고 오른 능력치 수를 돌려준다. 등급(70·80·90)을 넘거나 100이 되면 천하 동향에 남긴다 */
export function gainExp(s: GameState, g: General, key: StatKey, amount: number, onGrade?: (text: string) => void): number {
  if (!g.alive || amount <= 0) return 0;
  const exp = (g.exp ??= {});
  exp[key] = (exp[key] ?? 0) + amount * ageGrowMul(s, g);
  let up = 0;
  while (g.stats[key] < 100 && (exp[key] ?? 0) >= expNeed(g.stats[key])) {
    exp[key]! -= expNeed(g.stats[key]);
    g.stats[key] += 1;
    up++;
    const v = g.stats[key];
    if (onGrade && (v === 70 || v === 80 || v === 90 || v === 100)) onGrade(`📈 ${g.name}의 ${STAT_NAME[key]}이(가) ${v}에 이르렀습니다 (${statGrade(v)}급)`);
  }
  if (g.stats[key] >= 100) exp[key] = 0;
  g.grown = (g.grown ?? 0) + up;
  return up;
}

/** 명령 미리보기와 실제 계산이 같은 식을 쓴다 */
export const developGain = (g: General, wall: boolean) => Math.max(1, Math.round(wall ? 2 + (g.stats.politics + g.stats.intellect) / 30 : 2 + g.stats.politics / 15));
export const trainGain = (g: General) => Math.max(3, Math.round(3 + g.stats.leadership / 12 + g.stats.war / 30));

/** 능력치마다 맡는 일 (화면 안내용, docs/design/stats-v4.2.md 역할표) */
export const STAT_ROLE: Record<StatKey, string> = {
  leadership: '통솔 — 부대 전투력(공·방)의 바탕, 지휘 한도(통솔×500명), 질서 있는 후퇴, 훈련',
  war: '무력 — 접전·추격 피해, 일기토, 야습, 훈련 보조, 태수 치안(75+)',
  intellect: '지력 — 계책 성공·간파, 책사 조언, 전장의 변수 간파, 첩보·이간, 성벽 설계',
  politics: '정치 — 개발·태수, 병참(군량 절약), 재상(세력 최고 정치 70+ → 나라 수입 +)',
  charm: '매력 — 등용·외교, 징병(민심·신병 사기), 군주 매력 → 모든 장수 충성, 패배 후 사기',
};
