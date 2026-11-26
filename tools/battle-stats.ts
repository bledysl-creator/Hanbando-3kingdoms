// v3.9 전투 통계: 관전 N판의 모든 전투를 모아 승산별 승률·손실률·역전·전투 원인을 본다.
// 사용: npx tsx tools/battle-stats.ts [판 수] [턴] [출력 JSON 경로]
import { writeFileSync } from 'node:fs';
import { createGame, DATA, SCENARIOS, type BattleReport } from '../src/core';
import { endTurnMut } from '../src/core/systems/turn';
const N = +(process.argv[2] ?? 100), T = +(process.argv[3] ?? 160), OUT = process.argv[4];
const all: (BattleReport & { game: number })[] = [];
const games: { winner: string | null; turn: number; lu: boolean }[] = [];
for (let i = 0; i < N; i++) {
  const s = createGame(DATA, SCENARIOS['197_sabun'], { seed: 20000 + i, playerFactionId: null });
  for (let t = 0; t < T && s.outcome === 'playing'; t++) {
    const before = new Set(s.lastBattles);
    endTurnMut(s);
    for (const b of s.lastBattles) if (!before.has(b)) all.push({ ...b, game: i });
  }
  games.push({ winner: s.winner, turn: s.turn, lu: s.factions.lu.alive });
}
const pct = (a: number, b: number) => `${((a / Math.max(1, b)) * 100).toFixed(1)}%`;
console.log(`관전 ${N}판 · 전투 ${all.length}회 (판당 ${(all.length / N).toFixed(1)})`);
const uni = games.filter((g) => g.winner);
const w: Record<string, number> = {}; for (const g of uni) w[g.winner!] = (w[g.winner!] ?? 0) + 1;
console.log(`통일 ${pct(uni.length, N)} ${JSON.stringify(w)} 평균 ${Math.round(uni.reduce((a, g) => a + g.turn, 0) / Math.max(1, uni.length))}턴 · 여포 생존 ${pct(games.filter((g) => g.lu).length, N)}`);
console.log(`공격 성공 ${pct(all.filter((b) => b.won).length, all.length)}`);
// 병력비(공격/수비)별 승률·손실
const bins = [0, 0.5, 0.8, 1, 1.25, 1.5, 2, 3, 99];
console.log('병력비 구간 | 전투 | 공격 성공 | 공격측 손실률 | 수비측 손실률');
for (let k = 0; k < bins.length - 1; k++) {
  const xs = all.filter((b) => { const r = b.attackerTroops / Math.max(1, b.defenderTroops); return r >= bins[k] && r < bins[k + 1]; });
  if (!xs.length) continue;
  const al = xs.reduce((a, b) => a + b.attackerLoss / Math.max(1, b.attackerTroops), 0) / xs.length;
  const dl = xs.reduce((a, b) => a + b.defenderLoss / Math.max(1, b.defenderTroops), 0) / xs.length;
  console.log(`${bins[k]}~${bins[k + 1]} | ${xs.length} | ${pct(xs.filter((b) => b.won).length, xs.length)} | ${(al * 100).toFixed(0)}% | ${(dl * 100).toFixed(0)}%`);
}
// 전력비(계산된 공격력/수비력)가 1 근처인 접전
const close = all.filter((b) => { const r = b.attackerPower / Math.max(1, b.defenderPower); return r > 0.9 && r < 1.1; });
console.log(`접전(전력비 0.9~1.1) ${pct(close.length, all.length)}`);
// 역전: 병력이 1.5배 이상 많은데 진 경우 / 병력이 적은데 이긴 경우
console.log(`병력 1.5배 이상인데 패배 ${pct(all.filter((b) => b.attackerTroops > b.defenderTroops * 1.5 && !b.won).length, all.length)} · 병력 열세인데 승리 ${pct(all.filter((b) => b.attackerTroops < b.defenderTroops && b.won).length, all.length)}`);
// 원인 문구 빈도 (숫자 지움)
const reason: Record<string, number> = {};
for (const b of all) for (const r of b.reasons.slice(1)) { const k = r.replace(/[0-9,.×+−%-]+/g, '#').slice(0, 26); reason[k] = (reason[k] ?? 0) + 1; }
console.log('전투 원인 상위:'); for (const [k, v] of Object.entries(reason).sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(`  ${pct(v, all.length)} ${k}`);
const tac: Record<string, [number, number]> = {}; for (const b of all) if (b.tactic) { const t = (tac[b.tactic.kind] ??= [0, 0]); t[0]++; if (b.tactic.success) t[1]++; }
console.log('계책:', JSON.stringify(Object.fromEntries(Object.entries(tac).map(([k, [n, s]]) => [k, `${n}회 성공 ${pct(s, n)}`]))));
// v3.9 이긴 쪽·진 쪽 손실률, 편성, 일기토
const wl = all.map((b) => (b.won ? b.attackerLoss / Math.max(1, b.attackerTroops) : b.defenderLoss / Math.max(1, b.defenderTroops)));
const ll = all.map((b) => (b.won ? b.defenderLoss / Math.max(1, b.defenderTroops) : b.attackerLoss / Math.max(1, b.attackerTroops)));
const avg = (xs: number[]) => `${((xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length)) * 100).toFixed(1)}%`;
console.log(`이긴 쪽 평균 손실 ${avg(wl)} · 진 쪽 평균 손실 ${avg(ll)}`);
const fm: Record<string, [number, number]> = {}; for (const b of all) { const t = (fm[b.formation ?? 'balanced'] ??= [0, 0]); t[0]++; if (b.won) t[1]++; }
console.log('편성:', JSON.stringify(Object.fromEntries(Object.entries(fm).map(([k, [n, w]]) => [k, `${n}회 승 ${pct(w, n)}`]))));
const duels = all.filter((b) => b.duel);
console.log(`일기토 ${duels.length}회 (판당 ${(duels.length / N).toFixed(1)}) · 장수 전사 ${duels.filter((b) => b.duel!.slain).length} · 일기토 이긴 쪽 전투 승 ${pct(duels.filter((b) => (b.duel!.winnerId === b.duel!.attackerId) === b.won).length, duels.length)}`);
const dn: Record<string, number> = {}; for (const b of duels) dn[b.duel!.winnerId] = (dn[b.duel!.winnerId] ?? 0) + 1;
console.log('일기토 승리 상위:', Object.entries(dn).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${DATA.generals.find((g) => g.id === k)?.name ?? k} ${v}`).join(', '));
if (OUT) writeFileSync(OUT, JSON.stringify({ games, battles: all.map(({ reasons, ...b }) => ({ ...b, reasons: reasons.length })) }));
