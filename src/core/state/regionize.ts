// 군현 지도 (v3.2): 24개 도시 시나리오를 전국 시·군 345곳이 각각 도시인 판으로 바꾼다.
// 시·군의 소유는 원래 관할 도시를 따르고, 병력은 치소(중심 시·군)에 40%, 나머지는 인구 비율로 나눈다.
import { REGION_GRAPH, type GameData, type ScenarioDef } from '../data';
import { BALANCE } from '../config';

export function regionize(data: GameData, sc: ScenarioDef): { data: GameData; scenario: ScenarioDef } {
  const rc = REGION_GRAPH.cities;
  const seatOf: Record<string, string> = {};
  const popRest: Record<string, number> = {};
  for (const c of rc) {
    if (c.seat) seatOf[c.parent!] = c.id;
    else popRest[c.parent!] = (popRest[c.parent!] ?? 0) + c.population;
  }
  const cities: ScenarioDef['cities'] = {};
  for (const c of rc) {
    const p = sc.cities[c.parent!];
    const total = p?.troops ?? 2000;
    const troops = c.seat ? total * BALANCE.regionSeatTroopShare : (total * (1 - BALANCE.regionSeatTroopShare) * c.population) / Math.max(1, popRest[c.parent!] ?? 1);
    cities[c.id] = { owner: p?.owner ?? null, troops: Math.max(BALANCE.regionMinTroops, Math.round(troops / 100) * 100) };
  }
  const to = (cityId: string) => seatOf[cityId] ?? cityId;
  const generals = Object.fromEntries(Object.entries(sc.generals).map(([id, g]) => [id, { ...g, city: to(g.city) }]));
  const debuts = sc.debuts ? Object.fromEntries(Object.entries(sc.debuts).map(([id, d]) => [id, { ...d, city: to(d.city) }])) : undefined;
  return {
    data: { ...data, cities: rc, roads: REGION_GRAPH.roads },
    scenario: { ...sc, cities, generals, debuts },
  };
}
