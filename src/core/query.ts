// 상태 조회용 순수 함수 모음.
import { SEASONS } from './config';
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

export function generalsIn(s: GameState, cityId: CityId, faction?: FactionId | null): General[] {
  return Object.values(s.generals).filter(
    (g) => g.alive && g.city === cityId && (faction === undefined || g.faction === faction),
  );
}

export function generalsOf(s: GameState, f: FactionId): General[] {
  return Object.values(s.generals).filter((g) => g.alive && g.faction === f);
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
