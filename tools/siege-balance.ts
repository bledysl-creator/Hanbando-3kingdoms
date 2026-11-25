// v3.6.1 포위 대응 밸런스 점검: 플레이어 세력을 4곳 돌아가며 AI로 대신 두고, 포위당하면 대응을 고른다.
// 사용: npx tsx tools/siege-balance.ts [판 수] [best|hold|pincer|sortie|parley|evacuate]
import { createGame, DATA, SCENARIOS } from '../src/core';
import { endTurnMut } from '../src/core/systems/turn';
import { runFactionAI } from '../src/core/ai/ai';
import { setSiegeResponseMut, evacuateTargets, pincerSources, siegeForecast } from '../src/core/systems/siege';
import type { SiegeResponse } from '../src/core';
const N = +(process.argv[2] ?? 100), MODE = process.argv[3] ?? 'best', TURNS = 160;
const facs = ['wei', 'lu', 'shu', 'wu'];
const stat: any = { sieges: 0, held: 0, lost: 0, pick: {}, pickHeld: {}, predSum: 0, playerWin: {}, playerAlive: {}, winners: {}, turns: 0, unified: 0, luAlive: 0 };
for (let i = 0; i < N; i++) {
  const pf = facs[i % 4];
  const s = createGame(DATA, SCENARIOS['197_sabun'], { seed: 1000 + i, playerFactionId: pf });
  const picks: Record<string, string> = {}, preds: Record<string, number> = {};
  for (let t = 0; t < TURNS && s.outcome === 'playing'; t++) {
    if (s.factions[pf].alive) runFactionAI(s, pf);
    for (const sg of s.sieges ?? []) {
      const opts: SiegeResponse[] = [{ kind: 'hold' }, { kind: 'sortie' }, { kind: 'parley' }];
      const src = pincerSources(s, sg).filter((p) => p.leader).sort((a, b) => b.max - a.max)[0];
      if (src) opts.push({ kind: 'pincer', fromCity: src.cityId, troops: Math.floor(src.max * 0.7) });
      const ev = evacuateTargets(s, sg)[0];
      let choice: SiegeResponse = { kind: 'hold' };
      if (MODE === 'best') {
        let best = -1;
        for (const o of opts) { const f = siegeForecast(s, sg.id, o); if (f.unavailable) continue; const sc = f.holdChance + (f.attackerLoss - f.defenderLoss) / 1e6; if (sc > best) { best = sc; choice = o; preds[sg.id] = f.holdChance; } }
        if (best < 0.15 && ev) { choice = { kind: 'evacuate', toCity: ev }; preds[sg.id] = 0; }
      } else if (MODE !== 'hold') {
        choice = MODE === 'pincer' ? (src ? opts[3] : { kind: 'hold' }) : MODE === 'evacuate' ? (ev ? { kind: 'evacuate', toCity: ev } : { kind: 'hold' }) : { kind: MODE as any };
        preds[sg.id] = siegeForecast(s, sg.id, choice).holdChance;
      } else preds[sg.id] = siegeForecast(s, sg.id, choice).holdChance;
      if (!setSiegeResponseMut(s, pf, sg.id, choice).ok) choice = { kind: 'hold' };
      picks[sg.id] = choice.kind;
    }
    const before = (s.sieges ?? []).map((x) => [x.id, x.toCity] as const);
    endTurnMut(s);
    for (const [id, c] of before) {
      const k = picks[id]; stat.sieges++; stat.pick[k] = (stat.pick[k] ?? 0) + 1; stat.predSum += preds[id] ?? 0;
      if (s.cities[c].owner === pf) { stat.held++; stat.pickHeld[k] = (stat.pickHeld[k] ?? 0) + 1; } else stat.lost++;
    }
  }
  if (s.winner) { stat.unified++; stat.winners[s.winner] = (stat.winners[s.winner] ?? 0) + 1; stat.turns += s.turn; }
  if (s.winner === pf) stat.playerWin[pf] = (stat.playerWin[pf] ?? 0) + 1;
  if (s.factions[pf].alive) stat.playerAlive[pf] = (stat.playerAlive[pf] ?? 0) + 1;
  if (s.factions.lu.alive) stat.luAlive++;
}
const pct = (a: number, b: number) => `${Math.round((a / Math.max(1, b)) * 100)}%`;
console.log(`[${MODE}] ${N}판 · 포위 ${stat.sieges}회 · 지킴 ${pct(stat.held, stat.sieges)} (예측 평균 ${pct(stat.predSum, stat.sieges)})`);
for (const k of Object.keys(stat.pick)) console.log(`  ${k}: ${stat.pick[k]}회 선택 · 지킴 ${pct(stat.pickHeld[k] ?? 0, stat.pick[k])}`);
console.log('  통일', stat.unified, '판', JSON.stringify(stat.winners), '평균', Math.round(stat.turns / Math.max(1, stat.unified)), '턴 · 여포 생존', pct(stat.luAlive, N));
console.log('  플레이어 통일', JSON.stringify(stat.playerWin), '플레이어 생존', JSON.stringify(stat.playerAlive), '(세력당', N / 4, '판)');
