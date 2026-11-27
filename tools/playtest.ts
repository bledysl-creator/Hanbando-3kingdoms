// v4.2.1 플레이 편의 측정: 플레이어 자리에 "맡기기 + 직접 판단(AI)"을 앉혀 N판을 돌리고,
// 한 턴에 플레이어가 눌러야 하는 장수 명령 수·뜨는 창 수를 센다.
// 사용: npx tsx tools/playtest.ts [판수=500] [최대턴=160]
import { createGame, DATA, SCENARIOS, delegateMut, siegesOf } from '../src/core';
import { endTurnMut } from '../src/core/systems/turn';
import { runFactionAI } from '../src/core/ai/ai';
import { aiWantsTruce } from '../src/core/diplomacy/diplomacy';
import { respondOfferMut } from '../src/core/commands/commands';
import { pickEvents } from '../src/ui/components/EventCard';

const runs = Number(process.argv[2] ?? 500);
const maxTurns = Number(process.argv[3] ?? 160);
const factions = Object.keys(SCENARIOS['197_sabun'].factions);
const sum = { turns: 0, idle: 0, delegated: 0, manual: 0, events: 0, offers: 0, sieges: 0, popups: 0, stacked: 0, maxIdle: 0 };
const res: Record<string, { won: number; lost: number; other: number; turns: number }> = {};

for (let i = 0; i < runs; i++) {
  const pf = factions[i % factions.length];
  const s = createGame(DATA, SCENARIOS['197_sabun'], { seed: 5000 + i, playerFactionId: pf });
  let prevTurn = s.turn;
  while (s.outcome === 'playing' && s.turn <= maxTurns) {
    if (s.factions[pf].alive) {
      const ev = pickEvents({ turn: prevTurn } as never, s).length;
      const offers = s.offers.filter((o) => o.to === pf).length;
      const sieges = siegesOf(s, pf).length;
      const idle = Object.values(s.generals).filter((g) => g.alive && g.faction === pf && !g.acted && s.cities[g.city].owner === pf).length;
      // 사신 응답: AI 기준으로 받거나 거절
      for (let k = s.offers.length - 1; k >= 0; k--) if (s.offers[k].to === pf) respondOfferMut(s, pf, k, aiWantsTruce(s, pf, s.offers[k].from));
      const d = delegateMut(s, pf);
      const before = Object.values(s.generals).filter((g) => g.alive && g.faction === pf && !g.acted).length;
      runFactionAI(s, pf);
      const after = Object.values(s.generals).filter((g) => g.alive && g.faction === pf && !g.acted).length;
      const popups = (ev > 0 ? 1 : 0) + (offers > 0 ? 1 : 0) + (sieges > 0 ? 1 : 0);
      sum.turns++; sum.idle += idle; sum.delegated += d.acted; sum.manual += before - after;
      sum.events += ev; sum.offers += offers; sum.sieges += sieges; sum.popups += popups; if (popups >= 2) sum.stacked++;
      sum.maxIdle = Math.max(sum.maxIdle, idle);
    }
    prevTurn = s.turn;
    endTurnMut(s);
  }
  const r = (res[pf] ??= { won: 0, lost: 0, other: 0, turns: 0 });
  if (s.outcome === 'won') { r.won++; r.turns += s.turn; } else if (s.outcome === 'lost') r.lost++; else r.other++;
}
const per = (v: number) => (v / Math.max(1, sum.turns)).toFixed(2);
console.log(`플레이 편의 측정 ${runs}판 (197 사분천하, 최대 ${maxTurns}턴, 플레이어 세력을 돌아가며)`);
console.log(`  플레이어 턴 ${sum.turns}회`);
console.log(`  턴당 대기 장수(=맡기기 없으면 눌러야 할 명령) ${per(sum.idle)}명, 최대 ${sum.maxIdle}명`);
console.log(`  └ 맡기기가 처리 ${per(sum.delegated)}명 (${Math.round((sum.delegated / Math.max(1, sum.idle)) * 100)}%), 직접 판단(출진·이동·징병 등) ${per(sum.manual)}명`);
console.log(`  턴당 사건 카드 ${per(sum.events)}장, 사신 ${per(sum.offers)}건, 포위 ${per(sum.sieges)}곳`);
console.log(`  턴당 뜨는 창 ${per(sum.popups)}개, 창이 2개 이상 겹치는 턴 ${sum.stacked}회 (${((sum.stacked / Math.max(1, sum.turns)) * 100).toFixed(1)}%)`);
for (const [f, r] of Object.entries(res)) console.log(`  ${f.padEnd(4)} 플레이 ${r.won + r.lost + r.other}판: 통일 ${r.won} · 멸망 ${r.lost} · 미결 ${r.other}${r.won ? ` · 통일 평균 ${(r.turns / r.won).toFixed(0)}턴` : ''}`);
