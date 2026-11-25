// 장수 편제 (v3.4): 한 장수는 한 지역을 맡는 태수(도지사)다. 시작할 때 한 도시에 장수가 몰리지 않게 고르게 나눈다.
import { allGenerals } from '../query';
import type { GameState } from './types';

/** 세력별 도시당 장수 상한 = 올림(장수 수 ÷ 도시 수). 군주가 있는 도시는 +1 */
export function generalCap(s: GameState, fid: string): number {
  const cities = Object.values(s.cities).filter((c) => c.owner === fid).length;
  const gens = allGenerals(s).filter((g) => g.alive && g.faction === fid).length;
  return Math.max(1, Math.ceil(gens / Math.max(1, cities)));
}

export function spreadGenerals(s: GameState) {
  for (const f of Object.values(s.factions)) {
    if (!f.alive) continue;
    const owned = Object.values(s.cities).filter((c) => c.owner === f.id)
      .sort((a, b) => Number(!!b.seat) - Number(!!a.seat) || b.population - a.population || (a.id < b.id ? -1 : 1));
    if (owned.length < 2) continue;
    const members = Object.values(s.generals).filter((g) => g.alive && g.faction === f.id)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    const cap = Math.max(1, Math.ceil(members.length / owned.length));
    const rulerCity = s.generals[f.rulerId]?.city;
    const at: Record<string, string[]> = {};
    for (const c of owned) at[c.id] = [];
    for (const g of members) (at[g.city] ??= []).push(g.id);
    const limit = (cid: string) => cap + (cid === rulerCity ? 1 : 0);
    // 상한을 넘는 도시에서, 의형제·군주가 아닌 장수부터 장수가 가장 적은 도시로 보낸다
    for (const c of owned) {
      const here = at[c.id];
      while (here.length > limit(c.id)) {
        const movable = here.filter((id) => id !== f.rulerId);
        if (!movable.length) break;
        // 군주 곁(조정)에는 지력·정치가 높은 참모가 남고, 무장부터 각 지역으로 나간다
        const civ = (id: string) => s.generals[id].stats.intellect + s.generals[id].stats.politics;
        movable.sort((a, b) => civ(a) - civ(b) || (a < b ? -1 : 1));
        const target = owned.filter((o) => o.id !== c.id).sort((a, b) => at[a.id].length - at[b.id].length)[0];
        if (!target || at[target.id].length >= at[c.id].length - 1) break;
        const id = movable[0];
        here.splice(here.indexOf(id), 1);
        at[target.id].push(id);
        s.generals[id].city = target.id;
      }
    }
  }
}
