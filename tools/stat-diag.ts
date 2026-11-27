// v4.2 능력치 진단: 관전 N판에서 지휘 한도·부장·간파·재상·충성이 얼마나 작동하는지 본다.
// 사용: npx tsx tools/stat-diag.ts [판 수=20] [턴=160]
import { createGame, DATA, SCENARIOS, type BattleReport } from '../src/core';
import { endTurnMut } from '../src/core/systems/turn';
import { chancellorOf } from '../src/core/systems/stats';
const N = +(process.argv[2] ?? 20), T = +(process.argv[3] ?? 160), SEED = +(process.argv[4] ?? 20000);
const all: BattleReport[] = [];
const top: { name: string; grown: number; game: number; detail: string }[] = [];
let statSum = 0, statN = 0;
let loySum = 0, loyN = 0, grow = 0;
const chan: Record<string, number> = {};
const wins: Record<string, number> = {};
let turnSum = 0, uni = 0, luAlive = 0, rebels = 0;
for (let i = 0; i < N; i++) {
  const s = createGame(DATA, SCENARIOS['197_sabun'], { seed: SEED + i, playerFactionId: null });
  const start = Object.fromEntries(Object.values(s.generals).map((g) => [g.id, { ...g.stats }]));
  for (const f of Object.keys(s.factions)) chan[f] = (chan[f] ?? 0) + chancellorOf(s, f).mul;
  for (let t = 0; t < T && s.outcome === 'playing'; t++) {
    const before = new Set(s.lastBattles);
    endTurnMut(s);
    for (const b of s.lastBattles) if (!before.has(b)) all.push(b);
    if (t % 20 === 0) for (const g of Object.values(s.generals)) if (g.alive && g.faction) { loySum += g.loyalty; loyN++; }
  }
  { const al = Object.values(s.generals).filter((g) => g.alive && g.faction); grow += al.reduce((a, g) => a + (g.grown ?? 0), 0) / Math.max(1, al.length); }
  for (const g of Object.values(s.generals)) if ((g.grown ?? 0) > 0) { const base = start[g.id]; top.push({ name: g.name, grown: g.grown ?? 0, game: i, detail: base ? Object.keys(g.stats).map((k) => `${(g.stats as any)[k] - (base as any)[k]}`).join('/') : '' }); }
  for (const g of Object.values(s.generals)) if (g.alive && g.faction) { statSum += g.stats.leadership + g.stats.war + g.stats.intellect + g.stats.politics + g.stats.charm; statN++; }
  if (s.winner) { uni++; turnSum += s.turn; wins[s.winner] = (wins[s.winner] ?? 0) + 1; }
  if (s.factions.lu?.alive) luAlive++;
  rebels += Object.keys(s.factions).filter((f) => f.startsWith('reb')).length;
}
const pct = (a: number, b: number) => `${((a / Math.max(1, b)) * 100).toFixed(1)}%`;
const has = (k: string) => all.filter((b) => b.reasons.some((r) => r.includes(k))).length;
console.log(`관전 ${N}판 · 전투 ${all.length} · 통일 ${pct(uni, N)} ${JSON.stringify(wins)} 평균 ${Math.round(turnSum / Math.max(1, uni))}턴 · 여포 생존 ${pct(luAlive, N)} · 반란 ${(rebels / N).toFixed(2)}/판`);
console.log(`공격 지휘 한도 초과 ${pct(has('넘는 대군'), all.length)} · 수비 한도 초과 ${pct(has('수비 장수의 지휘 한도'), all.length)} · 부장 동행 ${pct(has('부장 '), all.length)} · 변수 간파 ${pct(has('꿰뚫어'), all.length)}`);
const dep = all.filter((b) => b.reasons.some((r) => r.startsWith('부장 ')));
console.log(`부장 동행 공격 승률 ${pct(dep.filter((b) => b.won).length, dep.length)} · 전체 공격 승률 ${pct(all.filter((b) => b.won).length, all.length)}`);
console.log(`시작 재상 배율 평균: ${Object.entries(chan).map(([f, v]) => `${f} ${(v / N).toFixed(3)}`).join(' · ')}`);
console.log(`장수 평균 충성 ${(loySum / Math.max(1, loyN)).toFixed(1)} · 살아 있는 장수 평균 성장 +${(grow / N).toFixed(1)}`);
console.log(`판 끝 장수 능력치 총합 평균 ${(statSum / Math.max(1, statN)).toFixed(0)} · 성장 상위: ${top.sort((a, b) => b.grown - a.grown).slice(0, 8).map((x) => `${x.name} +${x.grown}(${x.detail})`).join(', ')}`);
