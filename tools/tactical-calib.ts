// v4.3 5단계 전술 전투 밸런스 확인: 관전 N판의 모든 전투를 자동 전투와 5단계 자동 전투(양쪽 AI 전술)로 나란히 계산해 비교한다.
// 사용: npx tsx tools/tactical-calib.ts [판수=20] [최대턴=160]
import { BALANCE, createGame, DATA, SCENARIOS } from '../src/core';
import { endTurnMut } from '../src/core/systems/turn';
import { TAC_CALIB as C } from '../src/core/battle/phased';

(BALANCE.tactical as { compare: boolean }).compare = true;
if (process.env.NOGROUND) (BALANCE.ground as { enabled: boolean }).enabled = false; // v4.4.1 길 지형 끄고 비교
if (process.env.TECHMORALE) (BALANCE.skills as { techMoraleMul: number }).techMoraleMul = Number(process.env.TECHMORALE);
if (process.env.NOTECH) (BALANCE.skills as { tech: boolean }).tech = false; // v4.4.1 고유 기술 끄고 비교
if (process.argv[4]) C.assaultOnly = process.argv[4] as typeof C.assaultOnly; // both | atk | def: 그쪽은 정면 공격만
if (process.argv[5]) C.ban = process.argv[5].split(',');
const runs = Number(process.argv[2] ?? 20), maxTurns = Number(process.argv[3] ?? 160);
for (let i = 0; i < runs; i++) {
  const s = createGame(DATA, SCENARIOS['197_sabun'], { seed: 1000 + i, playerFactionId: null });
  while (s.outcome === 'playing' && s.turn <= maxTurns) endTurnMut(s);
}
const pct = (x: number) => `${((x / C.n) * 100).toFixed(1)}%`;
console.log(`전투 ${C.n}번 (관전 ${runs}판)`);
console.log(`  공격 성공  자동 ${pct(C.autoWin)}  5단계 ${pct(C.tacWin)}  같은 결과 ${pct(C.agree)}`);
console.log(`  공격군 손실 자동 ${pct(C.autoAL)}  5단계 ${pct(C.tacAL)}`);
console.log(`  수비군 손실 자동 ${pct(C.autoDL)}  5단계 ${pct(C.tacDL)}`);
console.log(`  중간 붕괴 ${pct(C.routs)}  평균 ${(C.phases / C.n).toFixed(2)}단계 (공격군 붕괴 ${pct(C.routA)}, 수비군 붕괴 ${pct(C.routD)})`);
const tot = Object.values(C.uses).reduce((a, b) => a + b, 0);
console.log('  전술 사용: ' + Object.entries(C.uses).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${((v / tot) * 100).toFixed(2)}%`).join(' · '));
