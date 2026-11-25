// 관전 모드 일괄 시뮬레이션: 밸런스를 통계로 확인한다 (Game.md 5-7).
// 사용: npx tsx tools/simulate.ts [판수=100] [최대턴=120]
import { createGame, DATA, SCENARIOS } from '../src/core';
import { endTurnMut } from '../src/core/systems/turn';

const runs = Number(process.argv[2] ?? 100);
const maxTurns = Number(process.argv[3] ?? 120);
const wins: Record<string, number> = {};
const survive: Record<string, number> = {};
const defects: number[] = [];
let unfinished = 0;
let turnSum = 0;

for (let i = 0; i < runs; i++) {
  const s = createGame(DATA, SCENARIOS['197_sabun'], { seed: 1000 + i, playerFactionId: null, allGenerals: process.argv[4] === 'all' });
  while (s.outcome === 'playing' && s.turn <= maxTurns) endTurnMut(s);
  if (s.winner) { wins[s.winner] = (wins[s.winner] ?? 0) + 1; turnSum += s.turn; } else unfinished++;
  for (const f of Object.values(s.factions)) if (f.alive) survive[f.id] = (survive[f.id] ?? 0) + 1;
  defects.push(s.log.filter((l) => l.text.includes('재야로 들어갔습니다')).length);
}
console.log(`관전 시뮬레이션 ${runs}판 (최대 ${maxTurns}턴)`);
for (const f of Object.keys(SCENARIOS['197_sabun'].factions)) {
  console.log(`  ${f.padEnd(4)} 통일 ${String(wins[f] ?? 0).padStart(3)}판  생존 ${String(survive[f] ?? 0).padStart(3)}판`);
}
console.log(`  미통일 ${unfinished}판, 통일까지 평균 ${(turnSum / Math.max(1, runs - unfinished)).toFixed(1)}턴, 장수 이탈 평균 ${(defects.reduce((a, b) => a + b, 0) / runs).toFixed(1)}명`);
