// v3.9 병종 편성 → v4.1 군사 편제: 도시의 병력은 보병·창병·궁병·기병·전차병으로 나뉜다.
// 근거: 한~삼국시대 군은 검·방패 보병, 장창병, 쇠뇌·활 부대, 기병, (초기엔) 전차로 이루어졌다.
// 장창은 기병·전차 돌격을 막고, 쇠뇌는 성벽 위에서 돌진하는 말을 쏘아 넘어뜨렸다. 기병은 평지 돌격과 추격,
// 전차는 넓은 평지에서 가장 강하지만 산길·강·성벽·진흙에서는 쓸모가 크게 줄었다 (docs/history/battle-v3.9.md, v4.1.md).
// 기병·전차병은 말이 있어야 꾸린다 — 말은 말 산지와 도시 마창(대·중·소)에서 기른다.
import { BALANCE } from '../config';
import type { City, GameState, General, Road, WeatherKind } from '../state/types';

export type UnitKind = 'infantry' | 'spear' | 'archer' | 'cavalry' | 'chariot';
/** 옛 편성 이름 (v3.9): balanced = 처음 편제 그대로 */
export type FormationKind = 'balanced' | UnitKind;
export type Comp = Partial<Record<UnitKind, number>>;

export const UNIT_KINDS: UnitKind[] = ['infantry', 'spear', 'archer', 'cavalry', 'chariot'];
export const FORMATIONS: { id: FormationKind; name: string; icon: string; desc: string }[] = [
  { id: 'balanced', name: '혼성', icon: '⚖️', desc: '여러 병종을 섞은 군' },
  { id: 'infantry', name: '보병', icon: '🛡️', desc: '검·방패 보병. 성벽과 산길에 강하다. 징병하면 누구나 보병이 된다.' },
  { id: 'spear', name: '창병', icon: '🔱', desc: '장창병. 기병·전차 돌격을 막는다. 궁병에 약하다. 철이 든다.' },
  { id: 'archer', name: '궁병', icon: '🏹', desc: '쇠뇌·활. 강 건너기를 엄호하고 아군 피해를 줄이며, 성벽 위에서 기병을 쏜다. 비·눈에 약하다. 목재가 든다.' },
  { id: 'cavalry', name: '기병', icon: '🐎', desc: '평지 돌격과 추격에 강하다. 창병·산길·강·성벽에 약하다. 한 명에 말 1필.' },
  { id: 'chariot', name: '전차병', icon: '🛞', desc: '넓은 평지에서 공격력이 가장 높다. 산길·강·성벽·진흙에 매우 약하다. 철이 많이 들고 큰 도시에서만 꾸린다.' },
];
export const unitName = (k: FormationKind) => FORMATIONS.find((x) => x.id === k)!;

const WET: WeatherKind[] = ['rain', 'storm', 'typhoon', 'snow', 'blizzard'];

/** 기병에 필요한 군마 (옛 계산: 10명당 1필, 외교 예물 판단용) */
export const horsesNeeded = (troops: number) => Math.ceil(troops * BALANCE.horsePerTroop);
export function hasHorses(s: GameState, fid: string, troops = 1000): boolean {
  return (s.factions[fid]?.horses ?? 0) >= horsesNeeded(troops);
}

/** 지형 산악도 (데이터가 없으면 옛 지형 구분으로 추정) */
export const reliefOf = (c: City) => c.relief ?? (c.terrain === 'mountain' ? 60 : c.terrain === 'coast' ? 15 : 20);

/** 편제 비율 (합 1) */
export function normComp(c: Comp | undefined): Comp {
  const src = c && Object.values(c).some((v) => (v ?? 0) > 0) ? c : (BALANCE.startComp as Comp);
  const t = UNIT_KINDS.reduce((a, k) => a + Math.max(0, src[k] ?? 0), 0) || 1;
  const out: Comp = {};
  for (const k of UNIT_KINDS) if ((src[k] ?? 0) > 0) out[k] = (src[k] as number) / t;
  return out;
}
export const compOf = (c: City): Comp => normComp(c.comp);
/** 옛 편성 하나를 편제로 */
export const compFromFormation = (f?: FormationKind): Comp | undefined => (!f ? undefined : f === 'balanced' ? normComp(undefined) : { [f]: 1 });

/** 두 병력을 섞는다 (도시에 병력이 들어올 때) */
export function mixComp(a: Comp, na: number, b: Comp, nb: number): Comp {
  if (nb <= 0) return normComp(a);
  if (na <= 0) return normComp(b);
  const out: Comp = {};
  for (const k of UNIT_KINDS) out[k] = ((a[k] ?? 0) * na + (b[k] ?? 0) * nb) / (na + nb);
  return normComp(out);
}
/** 새 병력(징병은 보병)을 도시에 더한다: 병력 수는 부르는 쪽이 바꾸고, 여기서는 비율만 */
export function addToCity(c: City, n: number, comp: Comp = { infantry: 1 }) {
  c.comp = mixComp(compOf(c), Math.max(0, c.troops), comp, n);
}

/** 편제의 주력 병종 */
export function mainUnit(comp: Comp): UnitKind {
  return UNIT_KINDS.reduce((a, k) => ((comp[k] ?? 0) > (comp[a] ?? 0) ? k : a), 'infantry' as UnitKind);
}
/** 옛 이름: 수비 측 주력 */
export const defFormOf = (_s: GameState, c: City): FormationKind => mainUnit(compOf(c));

export function compText(comp: Comp): string {
  return UNIT_KINDS.filter((k) => (comp[k] ?? 0) >= 0.01).sort((a, b) => (comp[b] ?? 0) - (comp[a] ?? 0)).map((k) => `${unitName(k).icon}${unitName(k).name} ${Math.round((comp[k] ?? 0) * 100)}%`).join(' · ');
}

export interface FormationEffect { attack: number; ownLoss: number; pursuit: number; reasons: string[] }

/** 한 병종의 지형·날씨·성벽 효과 */
export function formationEffect(f: FormationKind | undefined, road: Road, target: City, weather?: WeatherKind): FormationEffect {
  const F = BALANCE.formation;
  const e: FormationEffect = { attack: 1, ownLoss: 1, pursuit: 1, reasons: [] };
  const walled = target.wall >= F.wallHigh || target.fortress;
  const rel = reliefOf(target);
  const open = rel < BALANCE.reliefCavalryFrom && road.type === 'land';
  const rough = road.type === 'pass' || rel >= 45;
  const add = (m: number, why: string) => { e.attack *= m; e.reasons.push(`${why} ${m >= 1 ? '+' : '−'}${Math.round(Math.abs(m - 1) * 100)}%`); };
  if (!f || f === 'balanced') return e;
  if (f === 'infantry') {
    if (walled) add(F.infantryWall, '보병이 사다리로 성벽에 붙음');
    if (rough) add(F.infantryRough, '보병은 험한 산길에도 대오를 유지');
    e.pursuit = F.infantryPursuit;
  } else if (f === 'spear') {
    if (rough) add(F.spearRough, '창병은 좁은 길목을 막기 좋음');
    e.pursuit = F.spearPursuit;
  } else if (f === 'archer') {
    if (road.type === 'river' || road.type === 'sea') add(F.archerRiver, '쇠뇌 사격이 도하를 엄호');
    if (weather && WET.includes(weather)) add(F.archerWet, '비·눈에 활시위가 눅어 사격이 약함');
    if (walled) add(F.archerWall, '성벽 뒤 적에게는 화살이 잘 닿지 않음');
    e.ownLoss = F.archerOwnLoss;
    e.pursuit = F.archerPursuit;
  } else if (f === 'cavalry') {
    if (open) add(F.cavalryOpen, '평지에서 기병 돌격');
    if (road.type === 'pass') add(F.cavalryRough, '기병이 고갯길에서 힘을 못 씀');
    else if (rel > BALANCE.reliefCavalryFrom) add(Math.max(0.6, 1 - (rel - BALANCE.reliefCavalryFrom) * BALANCE.reliefCavalryPer), `산악도 ${rel}의 험한 땅이라 말이 달리지 못함`);
    if (road.type === 'river' || road.type === 'sea') add(F.cavalryRiver, '말을 끌고 물을 건너기 어려움');
    if (walled) add(F.cavalryWall, '기병은 성벽을 넘지 못함');
    if (weather === 'snow' || weather === 'blizzard') add(F.cavalrySnow, '눈길에 말이 미끄러짐');
    e.pursuit = F.cavalryPursuit;
  } else if (f === 'chariot') {
    if (open) add(F.chariotOpen, '넓은 평지에서 전차가 돌진');
    if (rough) add(F.chariotRough, '전차는 산길을 오르지 못함');
    else if (rel > BALANCE.reliefCavalryFrom) add(Math.max(0.55, 1 - (rel - BALANCE.reliefCavalryFrom) * BALANCE.reliefCavalryPer * 1.5), `산악도 ${rel} — 전차 바퀴가 걸림`);
    if (road.type === 'river' || road.type === 'sea') add(F.chariotRiver, '전차를 싣고 물을 건너기 어려움');
    if (walled) add(F.chariotWall, '전차는 성벽 앞에서 쓸모가 없음');
    if (weather && WET.includes(weather)) add(F.chariotMud, '진흙·눈에 바퀴가 빠짐');
    e.pursuit = F.chariotPursuit;
  }
  return e;
}

/** 공격 병종 × 수비 병종 상성 (성벽 위 궁병은 돌진하는 말에게 특히 매섭다) */
export function counterMul(atk: FormationKind | undefined, def: FormationKind, walled: boolean): { mul: number; reason?: string } {
  const a = !atk || atk === 'balanced' ? null : atk;
  const d = def === 'balanced' ? null : def;
  if (!a || !d) return { mul: 1 };
  let mul = BALANCE.counter[a]?.[d] ?? 1;
  if ((a === 'cavalry' || a === 'chariot') && d === 'archer' && walled) mul *= BALANCE.wallArcherVsCavalry;
  if (mul === 1) return { mul };
  return { mul, reason: `${unitName(a).name} 대 ${unitName(d).name} ${mul >= 1 ? '+' : '−'}${Math.round(Math.abs(mul - 1) * 100)}%` };
}

/** v4.1 편제 효과: 병종별 지형 효과 × 상대 편제와의 상성을 병력 비율로 가중 평균 */
export function compEffect(att: Comp, def: Comp, road: Road, target: City, weather: WeatherKind | undefined, walled: boolean, cavalryTrait = false): FormationEffect & { parts: { kind: UnitKind; share: number; mul: number }[] } {
  let attack = 0, ownLoss = 0, pursuit = 0;
  const parts: { kind: UnitKind; share: number; mul: number }[] = [];
  const reasons: string[] = [];
  for (const k of UNIT_KINDS) {
    const w = att[k] ?? 0;
    if (w <= 0) continue;
    const e = formationEffect(k, road, target, weather);
    let cm = 0;
    for (const d of UNIT_KINDS) cm += (def[d] ?? 0) * counterMul(k, d, walled).mul;
    let mul = e.attack * (cm || 1);
    if (k === 'cavalry' && cavalryTrait && e.attack > 1) mul *= 1 + BALANCE.formation.cavalryTraitBonus;
    attack += w * mul; ownLoss += w * e.ownLoss; pursuit += w * e.pursuit;
    parts.push({ kind: k, share: w, mul });
    if (w >= 0.15 && Math.abs(mul - 1) >= 0.05) reasons.push(`${unitName(k).name} ${Math.round(w * 100)}%: ${[...e.reasons, Math.abs(cm - 1) >= 0.03 ? `상대 편제와 상성 ${cm >= 1 ? '+' : '−'}${Math.round(Math.abs(cm - 1) * 100)}%` : ''].filter(Boolean).join(', ') || '이점 없음'}`);
  }
  return { attack: attack || 1, ownLoss: ownLoss || 1, pursuit: pursuit || 1, reasons, parts };
}

/** 큰 도시인가 (전차병을 꾸릴 수 있음) */
export function isBigCity(s: GameState, c: City): boolean {
  return c.population >= BALANCE.chariotCityPop / (s.mapScale === 'region' ? BALANCE.regionPopDiv : 1);
}

/** 편제를 바꾸는 비용: 늘어나는 병종만 자원이 들고, 기병·전차병을 줄이면 말 일부를 돌려받는다 */
export function organizeCost(s: GameState, c: City, target: Comp): { horses: number; iron: number; wood: number; trainDrop: number; changed: number; error?: string } {
  const cur = compOf(c), next = normComp(target), n = c.troops;
  let horses = 0, iron = 0, wood = 0, changed = 0;
  for (const k of UNIT_KINDS) {
    const diff = ((next[k] ?? 0) - (cur[k] ?? 0)) * n;
    const uc = BALANCE.unitCost[k] ?? {};
    if (diff > 0) { horses += diff * (uc.horses ?? 0); iron += diff * (uc.iron ?? 0); wood += diff * (uc.wood ?? 0); changed += diff; }
    else horses += diff * (uc.horses ?? 0) * BALANCE.horseRefund;
  }
  const f = c.owner ? s.factions[c.owner] : undefined;
  const trainDrop = Math.round((changed / Math.max(1, n)) * BALANCE.organizeTrainDrop);
  let error: string | undefined;
  if ((next.chariot ?? 0) > (cur.chariot ?? 0) + 1e-6 && !isBigCity(s, c)) error = '전차병은 큰 도시(인구가 많은 곳)에서만 꾸릴 수 있습니다.';
  else if (f && horses > (f.horses ?? 0)) error = `군마가 모자랍니다 (${Math.ceil(horses).toLocaleString()}필 필요, 보유 ${(f.horses ?? 0).toLocaleString()}필). 마창에서 말을 기르세요.`;
  else if (f && iron > f.iron) error = `철이 모자랍니다 (${Math.ceil(iron).toLocaleString()} 필요).`;
  else if (f && wood > f.wood) error = `목재가 모자랍니다 (${Math.ceil(wood).toLocaleString()} 필요).`;
  return { horses: Math.ceil(horses), iron: Math.ceil(iron), wood: Math.ceil(wood), trainDrop, changed: Math.round(changed), error };
}

/** AI 편제 목표: 성벽이 높으면 궁병, 평지 전선은 말이 되는 만큼 기병, 큰 도시는 전차병 조금, 기병 위협엔 창병 */
export function aiTargetComp(s: GameState, fid: string, c: City, enemyCav: number): Comp {
  const f = s.factions[fid];
  const t: Comp = { infantry: 0.35, spear: 0.15 + enemyCav * 0.5, archer: 0.3 + (c.wall >= 70 ? 0.1 : 0) };
  const rel = reliefOf(c);
  const curCav = (compOf(c).cavalry ?? 0) * c.troops;
  const spare = Math.max(0, (f.horses ?? 0) * 0.6 + curCav);
  if (rel < 40) t.cavalry = Math.min(0.35, spare / Math.max(1, c.troops));
  if (isBigCity(s, c) && rel < 30 && f.iron > 15000) t.chariot = 0.1;
  return normComp(t);
}

/** 일기토 미리보기 */
export function duelPreview(s: GameState, g: General, targetId: string): { champ: General; win: number } | null {
  const to = s.cities[targetId];
  let champ: General | null = null;
  for (const x of Object.values(s.generals)) if (x.alive && x.city === targetId && x.faction === to.owner && (!champ || x.stats.war > champ.stats.war)) champ = x;
  if (!champ || g.stats.war < BALANCE.duelMinWar || champ.stats.war < BALANCE.duelMinWar) return null;
  return { champ, win: 1 / (1 + Math.exp(-(g.stats.war - champ.stats.war) / BALANCE.duelSpread)) };
}
