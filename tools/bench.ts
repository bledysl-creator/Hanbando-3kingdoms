// 성능 측정 (v3.0): 관전 N판의 1판·1턴 평균 시간과 상태 크기. 사용: npx tsx tools/bench.ts [판수=20] [턴=160]
import { createGame, DATA, SCENARIOS } from '../src/core';
import { endTurnMut } from '../src/core/systems/turn';

const runs = Number(process.argv[2] ?? 20);
const maxTurns = Number(process.argv[3] ?? 160);
const scenarioId = process.argv[4] ?? '197_sabun';
const scale = (process.argv[5] ?? 'city') as 'city' | 'region';
let turns = 0, worstTurn = 0, bytes = 0;
const t0 = performance.now();
for (let i = 0; i < runs; i++) {
  const s = createGame(DATA, SCENARIOS[scenarioId], { seed: 7000 + i, playerFactionId: null, scale });
  while (s.outcome === 'playing' && s.turn <= maxTurns) {
    const a = performance.now();
    endTurnMut(s);
    worstTurn = Math.max(worstTurn, performance.now() - a);
    turns++;
  }
  bytes += JSON.stringify(s).length;
}
const ms = performance.now() - t0;
console.log(`성능 (${scenarioId}·${scale}, ${runs}판, 최대 ${maxTurns}턴)`);
console.log(`  1판 평균 ${(ms / runs).toFixed(0)}ms · 1턴 평균 ${(ms / turns).toFixed(2)}ms · 최악 1턴 ${worstTurn.toFixed(1)}ms`);
console.log(`  끝난 상태 평균 크기 ${(bytes / runs / 1024).toFixed(0)}KB (세이브 크기)`);
