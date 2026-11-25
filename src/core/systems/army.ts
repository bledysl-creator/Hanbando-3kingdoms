// 부대 현황 (v1.5): 아군 도시별 병력·사기·훈련·장수와 접경 위협을 한눈에.
import { generalsIn, isConnectedToCapital, neighbors } from '../query';
import { statusOf } from '../diplomacy/diplomacy';
import { visibleTroops } from './intrigue';
import type { GameState } from '../state/types';

export interface ArmyRow {
  cityId: string; name: string; troops: number; morale: number; training: number;
  generals: string[]; isolated: boolean;
  /** 접한 적(전쟁 중) 도시와 보이는 병력 */
  threats: { cityId: string; name: string; owner: string | null; troops: number | null; exact: boolean; road: string }[];
  /** 접경 적 병력 합 / 아군 병력. 1을 넘으면 위험 */
  threatRatio: number;
  role: 'front' | 'rear';
}

export function armyReport(s: GameState, fid: string): ArmyRow[] {
  const rows: ArmyRow[] = [];
  for (const c of Object.values(s.cities)) {
    if (c.owner !== fid) continue;
    const threats = neighbors(s, c.id)
      .filter((n) => n.city.owner !== fid && (n.city.owner === null || statusOf(s, fid, n.city.owner) === 'war'))
      .map((n) => {
        const v = visibleTroops(s, fid, n.city.id);
        return { cityId: n.city.id, name: n.city.name, owner: n.city.owner, troops: v.value, exact: v.exact, road: n.road.type };
      });
    const enemy = threats.filter((t) => t.owner).reduce((a, t) => a + (t.troops ?? 0), 0);
    rows.push({
      cityId: c.id, name: c.name, troops: c.troops, morale: Math.round(c.morale ?? 70), training: Math.round(c.training ?? 55),
      generals: generalsIn(s, c.id, fid).map((g) => g.name),
      isolated: !isConnectedToCapital(s, fid, c.id),
      threats, threatRatio: enemy / Math.max(1, c.troops),
      role: threats.some((t) => t.owner) ? 'front' : 'rear',
    });
  }
  return rows.sort((a, b) => (a.role === b.role ? b.threatRatio - a.threatRatio : a.role === 'front' ? -1 : 1));
}
