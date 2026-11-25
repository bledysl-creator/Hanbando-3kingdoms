// 자가학습 (v3.4): AI끼리 N판을 두며 AI·밸런스 수치를 조금씩 바꿔 보고, TEST_PLAN 목표에 더 가까워지면 채택한다.
// (1+1) 진화 전략: 라운드마다 수치 하나를 ±로 흔들어 같은 시드 묶음으로 비교한다 (공통 난수로 운의 영향을 줄임).
// 사용: npx tsx tools/selftrain.ts [라운드=10] [라운드당 판수=10] [최대턴=160]
import { BALANCE, createGame, DATA, SCENARIOS } from '../src/core';
import { endTurnMut } from '../src/core/systems/turn';

const rounds = Number(process.argv[2] ?? 10);
const perRound = Number(process.argv[3] ?? 10);
const maxTurns = Number(process.argv[4] ?? 160);
const B = BALANCE as unknown as Record<string, number>;
// 학습 대상과 허용 범위
const PARAMS: Record<string, [number, number, number]> = {
  aiAttackRatio: [0.8, 1.2, 0.05],
  aiMassFactor: [1.2, 2.2, 0.1],
  lastStandDefense: [0.2, 0.7, 0.05],
  hegemonShare: [0.25, 0.5, 0.03],
  coalitionAccept: [0.05, 0.4, 0.05],
  rebelBase: [0.0, 0.1, 0.01],
};
const FIRST_SEED = 50000;

function evaluate(seed0: number, n: number) {
  const sc = SCENARIOS['197_sabun'];
  const wins: Record<string, number> = {}, surv: Record<string, number> = {};
  let turns = 0, unif = 0;
  for (let i = 0; i < n; i++) {
    const s = createGame(DATA, sc, { seed: seed0 + i, playerFactionId: null });
    while (s.outcome === 'playing' && s.turn <= maxTurns) endTurnMut(s);
    if (s.winner) { unif++; turns += s.turn; wins[s.winner] = (wins[s.winner] ?? 0) + 1; }
    for (const f of Object.keys(sc.factions)) if (s.factions[f].alive) surv[f] = (surv[f] ?? 0) + 1;
  }
  const u = unif / n;
  const maxShare = unif ? Math.max(...Object.values(wins)) / unif : 0;
  const minSurv = Math.min(...Object.keys(sc.factions).map((f) => (surv[f] ?? 0) / n));
  const avgT = unif ? turns / unif : maxTurns;
  // TEST_PLAN 목표: 통일 40~70% (중심 55%), 한 세력 점유 ≤ 60% (여유 45%), 최약 생존 ≥ 10%, 평균 60~110턴
  const loss = Math.abs(u - 0.55) + Math.max(0, maxShare - 0.45) + Math.max(0, 0.1 - minSurv) * 2 + Math.abs(avgT - 90) / 300;
  return { loss, u, maxShare, minSurv, avgT, wins };
}

const log: string[] = [];
let seed = FIRST_SEED;
const cur: Record<string, number> = Object.fromEntries(Object.keys(PARAMS).map((k) => [k, B[k]]));
let best = evaluate(seed, perRound);
log.push(`| 0 | (현재 값) | — | ${best.loss.toFixed(3)} | ${(best.u * 100).toFixed(0)}% | ${(best.maxShare * 100).toFixed(0)}% | ${(best.minSurv * 100).toFixed(0)}% | 채택 |`);
let rng = 12345;
const rnd = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
for (let r = 1; r < rounds; r++) {
  const keys = Object.keys(PARAMS);
  const k = keys[Math.floor(rnd() * keys.length)];
  const [lo, hi, step] = PARAMS[k];
  const dir = rnd() < 0.5 ? -1 : 1;
  const v = Math.round(Math.min(hi, Math.max(lo, cur[k] + dir * step * (1 + Math.floor(rnd() * 2)))) * 1000) / 1000;
  B[k] = v;
  // 같은 시드 묶음으로 현재 값과 새 값을 비교 (공통 난수)
  seed += perRound;
  const base = (() => { B[k] = cur[k]; const e = evaluate(seed, perRound); B[k] = v; return e; })();
  const trial = evaluate(seed, perRound);
  const ok = trial.loss < base.loss;
  const old = cur[k];
  if (ok) { cur[k] = v; best = trial; } else B[k] = cur[k];
  log.push(`| ${r} | ${k} | ${old} → ${v} | ${trial.loss.toFixed(3)} (기존 ${base.loss.toFixed(3)}) | ${(trial.u * 100).toFixed(0)}% | ${(trial.maxShare * 100).toFixed(0)}% | ${(trial.minSurv * 100).toFixed(0)}% | ${ok ? '채택' : '버림'} |`);
  console.error(log[log.length - 1]);
}
console.log('| 라운드 | 바꾼 수치 | 값 | 손실 | 통일 | 최대 점유 | 최약 생존 | 결과 |\n|---|---|---|---|---|---|---|---|\n' + log.join('\n'));
console.log('\n학습된 값: ' + JSON.stringify(cur));
