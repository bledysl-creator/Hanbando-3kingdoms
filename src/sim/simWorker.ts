// 관전 모드 일괄 시뮬레이션 (Web Worker, v1.2). 화면을 멈추지 않고 N판을 돌려 통계를 낸다.
import { createGame, DATA, SCENARIOS } from '../core';
import { endTurnMut } from '../core/systems/turn';

export interface SimRequest { runs: number; maxTurns: number; seed: number }
export interface SimProgress {
  done: number;
  runs: number;
  wins: Record<string, number>;
  survive: Record<string, number>;
  cities: Record<string, number>; // 평균 보유 도시 (누적합)
  turns: number[]; // 통일까지 걸린 턴
  defections: number;
  uprisings: number;
  battles: Record<string, number>; // 도시별 함락 횟수
}

self.onmessage = (e: MessageEvent<SimRequest>) => {
  const { runs, maxTurns, seed } = e.data;
  const p: SimProgress = { done: 0, runs, wins: {}, survive: {}, cities: {}, turns: [], defections: 0, uprisings: 0, battles: {} };
  for (let i = 0; i < runs; i++) {
    const s = createGame(DATA, SCENARIOS['197_sabun'], { seed: seed + i, playerFactionId: null });
    let prev = Object.fromEntries(Object.values(s.cities).map((c) => [c.id, c.owner]));
    while (s.outcome === 'playing' && s.turn <= maxTurns) {
      endTurnMut(s);
      for (const c of Object.values(s.cities)) {
        if (c.owner !== prev[c.id]) p.battles[c.id] = (p.battles[c.id] ?? 0) + 1;
      }
      prev = Object.fromEntries(Object.values(s.cities).map((c) => [c.id, c.owner]));
    }
    if (s.winner) { p.wins[s.winner] = (p.wins[s.winner] ?? 0) + 1; p.turns.push(s.turn); }
    for (const f of Object.values(s.factions)) {
      if (f.alive) p.survive[f.id] = (p.survive[f.id] ?? 0) + 1;
      p.cities[f.id] = (p.cities[f.id] ?? 0) + Object.values(s.cities).filter((c) => c.owner === f.id).length;
    }
    p.defections += s.chronicle.filter((c) => c.text.includes('재야로')).length + s.log.filter((l) => l.text.includes('재야로 들어갔습니다')).length;
    p.uprisings += s.chronicle.filter((c) => c.text.includes('의병을 일으켜')).length;
    p.done = i + 1;
    (self as unknown as Worker).postMessage({ ...p });
  }
};
