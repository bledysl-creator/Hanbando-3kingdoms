// 관전 모드 일괄 시뮬레이션: 밸런스를 통계로 확인한다 (Game.md 5-7).
// 사용: npx tsx tools/simulate.ts [판수=100] [최대턴=120] [all|-] [시나리오=197_sabun] [city|region]
import { BALANCE, createGame, DATA, SCENARIOS } from '../src/core';

// v4.3 TACTICAL_ALL=1: 모든 전투를 5단계 전술 전투(양쪽 AI 지휘)로 — 5단계 전투가 판 전체 밸런스를 흔드는지 확인
if (process.env.TACTICAL_ALL === '1') (BALANCE.tactical as { autoAll: boolean }).autoAll = true;
import { endTurnMut } from '../src/core/systems/turn';

const runs = Number(process.argv[2] ?? 100);
const maxTurns = Number(process.argv[3] ?? 120);
const scId = process.argv[5] ?? '197_sabun';
const scale = (process.argv[6] ?? 'city') as 'city' | 'region';
const wins: Record<string, number> = {};
const survive: Record<string, number> = {};
const defects: number[] = [];
const rebels: number[] = [];
let rebelWins = 0, rebelAlive = 0;
let unfinished = 0;
let turnSum = 0;

for (let i = 0; i < runs; i++) {
  const s = createGame(DATA, SCENARIOS[scId], { seed: 1000 + i, playerFactionId: null, allGenerals: process.argv[4] === 'all', scale });
  while (s.outcome === 'playing' && s.turn <= maxTurns) endTurnMut(s);
  if (s.winner) { wins[s.winner] = (wins[s.winner] ?? 0) + 1; turnSum += s.turn; } else unfinished++;
  for (const f of Object.values(s.factions)) if (f.alive) survive[f.id] = (survive[f.id] ?? 0) + 1;
  rebels.push(Object.keys(s.factions).filter((f) => f.startsWith('reb')).length);
  if (s.winner?.startsWith('reb')) rebelWins++;
  rebelAlive += Object.values(s.factions).filter((f) => f.id.startsWith('reb') && f.alive).length;
  defects.push(s.log.filter((l) => l.text.includes('재야로 들어갔습니다')).length);
}
console.log(`관전 시뮬레이션 ${runs}판 (최대 ${maxTurns}턴, ${scId}, ${scale})${BALANCE.tactical.autoAll ? ' — 모든 전투 5단계 전술 전투' : ''}`);
for (const f of Object.keys(SCENARIOS[scId].factions)) {
  console.log(`  ${f.padEnd(4)} 통일 ${String(wins[f] ?? 0).padStart(3)}판  생존 ${String(survive[f] ?? 0).padStart(3)}판`);
}
console.log(`  미통일 ${unfinished}판, 통일까지 평균 ${(turnSum / Math.max(1, runs - unfinished)).toFixed(1)}턴, 장수 이탈 평균 ${(defects.reduce((a, b) => a + b, 0) / runs).toFixed(1)}명`);
console.log(`  반란·독립 평균 ${(rebels.reduce((a, b) => a + b, 0) / runs).toFixed(2)}회/판, 독립 세력 통일 ${rebelWins}판, 160턴에 살아 있는 독립 세력 평균 ${(rebelAlive / runs).toFixed(2)}`);
