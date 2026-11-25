// v3.8 군현 지도: 장수가 없는 후방 현의 남는 병력은 계절마다 한 걸음씩 전선 쪽으로 모인다.
// 345곳 지도에서는 장수가 도시 수보다 적어, 장수 없는 후방 현에 병력이 묶여 전쟁이 끝나지 않던 문제를 푼다.
// 모든 세력(플레이어 포함)에 똑같이 적용되는 지도 규칙이다.
import { BALANCE } from '../config';
import { frontDistance } from '../ai/ai';
import { log } from '../commands/commands';
import { generalsIn, minMarch, neighbors } from '../query';
import type { GameState } from '../state/types';

export function processRegionMuster(s: GameState) {
  if (s.mapScale !== 'region' || !BALANCE.regionMuster) return;
  const keep = BALANCE.aiRearGarrison * BALANCE.regionAiTroopScale;
  for (const f of Object.values(s.factions)) {
    if (!f.alive) continue;
    const dist = frontDistance(s, f.id);
    const moves: { from: string; to: string; n: number }[] = [];
    for (const c of Object.values(s.cities)) {
      if (c.owner !== f.id) continue;
      const d = dist[c.id];
      if (d === undefined || d === 0) continue;
      if (generalsIn(s, c.id, f.id).length > 0) continue; // 장수가 있으면 장수가 직접 정한다
      const spare = Math.floor((c.troops - keep) * BALANCE.regionMusterShare);
      if (spare < minMarch(s)) continue;
      const next = neighbors(s, c.id).filter((n) => n.city.owner === f.id && dist[n.city.id] !== undefined && dist[n.city.id] < d)
        .sort((a, b) => a.city.troops - b.city.troops)[0];
      if (next) moves.push({ from: c.id, to: next.city.id, n: spare });
    }
    let total = 0;
    for (const m of moves) {
      const a = s.cities[m.from], b = s.cities[m.to];
      a.troops -= m.n;
      b.training = Math.round((b.training * b.troops + a.training * m.n) / (b.troops + m.n));
      b.morale = Math.round((b.morale * b.troops + a.morale * m.n) / (b.troops + m.n));
      b.troops += m.n;
      total += m.n;
    }
    if (total > 0 && f.id === s.playerFactionId) log(s, `장수 없는 후방 군현의 병력 ${total.toLocaleString()}명이 전선 쪽으로 한 걸음 모였습니다.`, 'info', f.id);
  }
}
