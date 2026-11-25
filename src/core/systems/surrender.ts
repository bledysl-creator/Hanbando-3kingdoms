// 귀순 (v2.1): 천하 대세가 기운 약소 세력은 이웃 강국에 나라를 바치고 귀순한다.
// 도시를 주고받는 핑퐁 장기전을 끝내는 장치. 플레이어 세력은 스스로 귀순하지 않는다.
import { BALANCE } from '../config';
import { chance } from '../rng/rng';
import { neighbors } from '../query';
import { log } from '../commands/commands';
import type { GameState } from '../state/types';

function strength(s: GameState, fid: string) {
  let cities = 0, troops = 0;
  for (const c of Object.values(s.cities)) if (c.owner === fid) { cities++; troops += c.troops; }
  return { cities, troops };
}

/** 귀순할 확률과 받아 줄 세력. 조건이 안 맞으면 null */
export function surrenderCandidate(s: GameState, fid: string): { to: string; p: number } | null {
  const f = s.factions[fid];
  if (!f?.alive || fid === s.playerFactionId) return null;
  const me = strength(s, fid);
  if (me.cities > BALANCE.surrenderMaxCities) return null;
  const total = Object.values(s.cities).length;
  // 이웃 세력 중 가장 강한 곳
  const ns = new Set<string>();
  for (const c of Object.values(s.cities)) if (c.owner === fid) for (const n of neighbors(s, c.id)) if (n.city.owner && n.city.owner !== fid) ns.add(n.city.owner);
  let best: { id: string; cities: number; troops: number } | null = null;
  for (const id of ns) { const st = strength(s, id); if (!best || st.troops > best.troops) best = { id, ...st }; }
  if (!best) return null;
  if (best.cities / total < BALANCE.surrenderDominance || me.troops > best.troops * BALANCE.surrenderTroopRatio) return null;
  const ruler = s.generals[f.rulerId];
  // 야망이 큰 군주는 버틴다
  const pride = ruler ? (ruler.persona?.ambition ?? 50) / 100 : 0.5;
  return { to: best.id, p: Math.max(0.05, BALANCE.surrenderChance * (1.3 - pride)) };
}

export function processSurrenders(s: GameState) {
  if (s.season !== 0 || s.outcome !== 'playing') return;
  for (const f of Object.values(s.factions)) {
    const c = surrenderCandidate(s, f.id);
    if (!c || !chance(s, c.p)) continue;
    const to = s.factions[c.to];
    for (const city of Object.values(s.cities)) if (city.owner === f.id) { city.owner = to.id; city.order = Math.max(30, city.order - 10); }
    for (const g of Object.values(s.generals)) {
      if (g.faction !== f.id || !g.alive) continue;
      g.faction = to.id;
      g.loyalty = g.id === f.rulerId ? 55 : Math.max(50, g.loyalty - 15);
    }
    to.gold += f.gold; to.food += f.food; to.wood += f.wood; to.iron += f.iron;
    f.alive = false;
    log(s, `${f.name}의 ${s.generals[f.rulerId]?.name ?? '군주'}이(가) 천하 대세를 받아들여 ${to.name}에 나라를 바치고 귀순했습니다.`, 'danger', f.id, { event: 'surrender', other: to.id });
  }
}
