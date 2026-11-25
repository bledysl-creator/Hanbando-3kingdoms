// 상태 조회용 순수 함수 모음.
import { BALANCE, SEASONS } from './config';
import type { City, CityId, FactionId, General, GameState, Road } from './state/types';

export function neighbors(s: GameState, cityId: CityId): { city: City; road: Road }[] {
  const out: { city: City; road: Road }[] = [];
  for (const r of s.roads) {
    if (r.from === cityId) out.push({ city: s.cities[r.to], road: r });
    else if (r.to === cityId) out.push({ city: s.cities[r.from], road: r });
  }
  return out;
}

export function roadBetween(s: GameState, a: CityId, b: CityId): Road | undefined {
  return s.roads.find((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a));
}

export function citiesOf(s: GameState, f: FactionId): City[] {
  return Object.values(s.cities).filter((c) => c.owner === f);
}

/** 장수 목록 캐시 (v3.1 성능): s.generals 객체가 같으면 값 배열을 재사용한다. 키 추가·삭제는 createGame에서만 일어난다. */
const generalListCache = new WeakMap<object, General[]>();
export function allGenerals(s: GameState): General[] {
  let list = generalListCache.get(s.generals);
  if (!list) { list = Object.values(s.generals); generalListCache.set(s.generals, list); }
  return list;
}

export function generalsIn(s: GameState, cityId: CityId, faction?: FactionId | null): General[] {
  const out: General[] = [];
  for (const g of allGenerals(s)) if (g.alive && g.city === cityId && (faction === undefined || g.faction === faction)) out.push(g);
  return out;
}

export function generalsOf(s: GameState, f: FactionId): General[] {
  return allGenerals(s).filter((g) => g.alive && g.faction === f);
}

export function freeGeneralsIn(s: GameState, cityId: CityId): General[] {
  return generalsIn(s, cityId, null);
}

export function totalTroops(s: GameState, f: FactionId): number {
  return citiesOf(s, f).reduce((a, c) => a + c.troops, 0);
}

/** 세력력: 화면 좌상단 군주 카드에 표시하는 종합 지표 */
export function factionPower(s: GameState, f: FactionId): number {
  const cities = citiesOf(s, f);
  const gens = generalsOf(s, f);
  const troops = cities.reduce((a, c) => a + c.troops, 0);
  const econ = cities.reduce((a, c) => a + (c.agriculture + c.commerce) * (c.population / 10000), 0);
  const talent = gens.reduce((a, g) => a + (g.stats.leadership + g.stats.war + g.stats.intellect) / 3, 0);
  return Math.round(troops / 10 + econ + talent * 5);
}

export function seasonLabel(s: Pick<GameState, 'year' | 'season' | 'era' | 'eraStartYear'>): string {
  return `${s.year}년 ${SEASONS[s.season]} (${s.era} ${s.year - s.eraStartYear + 1}년)`;
}

export function isAdjacent(s: GameState, a: CityId, b: CityId): boolean {
  return !!roadBetween(s, a, b);
}

export function relationBetween(s: GameState, a: string, b: string) {
  return s.relations.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
}

/** 군주가 있는 도시와 우리 영토로 이어져 있는가 (보급선) */
export function isConnectedToCapital(s: GameState, f: FactionId, cityId: CityId): boolean {
  const ruler = s.generals[s.factions[f]?.rulerId];
  if (!ruler || s.cities[ruler.city]?.owner !== f) return true; // 본거지가 없으면 판단 안 함
  const seen = new Set([ruler.city]);
  const q = [ruler.city];
  while (q.length) {
    const c = q.pop()!;
    if (c === cityId) return true;
    for (const n of neighbors(s, c)) if (n.city.owner === f && !seen.has(n.city.id)) { seen.add(n.city.id); q.push(n.city.id); }
  }
  return false;
}

/** 보급 충족률 0~1: 군량이 한 계절 소비량 대비 얼마나 있는가 */
export function supplyRatio(s: GameState, f: FactionId): number {
  const eat = totalTroops(s, f) * 0.25;
  return eat <= 0 ? 1 : Math.min(1, s.factions[f].food / eat);
}

/** 도시에 남겨야 하는 최소 병력과 최소 출진 병력 (군현 지도는 도시가 작아 기준이 낮다, v3.2) */
export const minGarrison = (s: GameState) => (s.mapScale === 'region' ? 100 : 500);
export const minMarch = (s: GameState) => (s.mapScale === 'region' ? 300 : 1000);

/** v3.3 배수진: 남은 도시가 적은 세력은 마지막 땅을 결사적으로 지킨다 (수비 배율). 도시 비율로 판단해 군현 지도에도 맞춘다 */
export function lastStandBonus(s: GameState, fid: string | null): number {
  if (!fid) return 1;
  const all = Object.keys(s.cities).length;
  const mine = Object.values(s.cities).filter((c) => c.owner === fid).length;
  return mine > 0 && mine / all <= BALANCE.lastStandCityShare ? 1 + BALANCE.lastStandDefense : 1;
}
/** v3.3 패권 세력: 도시의 일정 비율 이상을 가진 세력 (없으면 null) */
export function hegemonOf(s: GameState): string | null {
  const all = Object.keys(s.cities).length;
  const cnt: Record<string, number> = {};
  for (const c of Object.values(s.cities)) if (c.owner) cnt[c.owner] = (cnt[c.owner] ?? 0) + 1;
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] / all >= BALANCE.hegemonShare ? top[0] : null;
}

/** v3.3 한 해 예상 수확 + 어업 (가뭄·세력 특성 제외의 대략값) — AI 군량 계획용 */
export function expectedHarvest(s: GameState, fid: string): number {
  let h = 0;
  for (const c of Object.values(s.cities)) {
    if (c.owner !== fid) continue;
    h += c.agriculture * (c.population / 1000) * BALANCE.harvestPerAgriculture * (0.5 + c.order / 200);
    if (c.port) h += (c.population / 1000) * BALANCE.fishPerPort1000 * 3.5 * (0.5 + c.order / 200); // 어업 4계절(겨울 절반)
  }
  return h;
}
