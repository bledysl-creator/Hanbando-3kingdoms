// data/*.json 기본 검증. 사용: npm run validate
import { DATA, SCENARIOS } from '../src/core';
let errors = 0;
const err = (m: string) => { console.error('✗', m); errors++; };
const cityIds = new Set(DATA.cities.map((c) => c.id));
for (const r of DATA.roads) if (!cityIds.has(r.from) || !cityIds.has(r.to)) err(`도로 ${r.from}-${r.to}: 없는 도시`);
for (const g of DATA.generals) for (const [k, v] of Object.entries(g.stats)) if (v < 1 || v > 100) err(`${g.id}.${k}=${v} 범위 밖`);
for (const sc of Object.values(SCENARIOS)) {
  for (const [id, g] of Object.entries(sc.generals)) {
    if (!DATA.generals.find((x) => x.id === id)) err(`${sc.id}: 장수 ${id} 없음`);
    if (!cityIds.has(g.city)) err(`${sc.id}: ${id}의 도시 ${g.city} 없음`);
  }
  for (const id of Object.keys(sc.cities)) if (!cityIds.has(id)) err(`${sc.id}: 도시 ${id} 없음`);
}
console.log(errors ? `오류 ${errors}건` : `데이터 검증 통과 (도시 ${DATA.cities.length}, 도로 ${DATA.roads.length}, 장수 ${DATA.generals.length})`);
process.exit(errors ? 1 : 0);
