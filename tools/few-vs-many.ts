// v4.4 "적은 병력으로 대군을 막을 수 있나" 검증: 수비 쪽 작전(대본)마다 같은 전투를 N번 돌려 지켜 낸 비율을 비교한다.
// 공격군은 AI 전술로 싸운다. 수비 장수·병력·길을 바꿔 가며 본다.
// v4.4.1: 길은 실제 길과 방향(공주→수원 평지, 개성→춘천 산길, 수원→서울 강을 낀 길)의 실측 지형값을 쓴다.
// 사용: npx tsx tools/few-vs-many.ts [반복=300] [수비 병력=8000] [공격 병력=20000]
//   NOSKILL=1 특기 끄고 · NOTECH=1 고유 기술 끄고
import { BALANCE, createGame, DATA, SCENARIOS, type General } from '../src/core';
import { aiOrders, createTacBattle, playPhase, tacOutcome, techOptions, type SideOrders, type TacBattle, type TacOrder } from '../src/core/battle/phased';
import { routeProfile, routeText } from '../src/core/battle/ground';
import { roadBetween } from '../src/core/query';
import type { BattleInput } from '../src/core/battle/battle';
import type { UnitKind } from '../src/core/battle/formation';
import { skillsOf } from '../src/core/battle/skills';

if (process.env.NOSKILL) (BALANCE.skills as { enabled: boolean }).enabled = false;
if (process.env.NOTECH) (BALANCE.skills as { tech: boolean }).tech = false;
const N = Number(process.argv[2] ?? 300), DEF = Number(process.argv[3] ?? 8000), ATK = Number(process.argv[4] ?? 20000);
const base = createGame(DATA, SCENARIOS['197_sabun'], { seed: 7, playerFactionId: null });
const G = (id: string) => structuredClone(base.generals[id]) as General;
const plainGeneral = (id: string, v: number): General => ({ ...G(id), id: `plain_${v}`, name: `보통 장수(${v})`, stats: { leadership: v, war: v, intellect: v, politics: v, charm: v } });

/** 수비 작전: 단계(0~4)와 지금 전투를 보고 병과별 전술을 고른다 */
type Script = (ph: number, tb: TacBattle) => Partial<Record<UnitKind, TacOrder>>;
const SCRIPTS: Record<string, Script> = {
  '정면 공격만': () => ({}),
  'AI 지휘': () => ({}),
  'AI 지휘(기술 없이)': () => ({}),
  '방진만': () => ({ infantry: 'hold', spear: 'hold', archer: 'hold', cavalry: 'assault' }),
  '방진+사격': () => ({ infantry: 'hold', spear: 'hold', archer: 'volley', cavalry: 'assault' }),
  '의병→방진+사격': (ph) => (ph === 0 ? { infantry: 'decoy', spear: 'hold', archer: 'volley', cavalry: 'decoy' } : { infantry: 'hold', spear: 'hold', archer: 'volley', cavalry: 'flank' }),
  '이일대로→반격': (ph) => (ph === 0 ? { infantry: 'rest', spear: 'rest', archer: 'rest', cavalry: 'rest' } : { infantry: 'assault', spear: 'hold', archer: 'volley', cavalry: 'charge' }),
  '거짓 퇴각+매복→기습': (ph, tb) => (ph === 0 ? { cavalry: 'feint', infantry: 'ambush', archer: 'ambush', spear: 'hold' } : tb.atk.lured ? { cavalry: 'flank', infantry: 'flank', archer: 'volley', spear: 'flank' } : { infantry: 'hold', spear: 'hold', archer: 'volley', cavalry: 'flank' }),
  '반도격→방진': (ph) => (ph < 2 ? { infantry: 'halfcross', archer: 'halfcross', cavalry: 'halfcross', spear: 'hold' } : { infantry: 'hold', spear: 'hold', archer: 'volley', cavalry: 'flank' }),
  '고유 기술 먼저→공격': (ph) => (ph === 0 ? { infantry: 'hold', spear: 'hold', archer: 'volley', cavalry: 'flank' } : { infantry: 'assault', spear: 'hold', archer: 'volley', cavalry: 'flank' }),
  '도발→매복': (ph, tb) => (ph === 0 ? { infantry: 'provoke', archer: 'ambush', spear: 'hold', cavalry: 'ambush' } : tb.atk.provoked ? { infantry: 'hold', spear: 'hold', archer: 'volley', cavalry: 'flank' } : { infantry: 'hold', spear: 'hold', archer: 'volley', cavalry: 'flank' }),
};

function run(label: string, defenders: General[], fromId: string, toId: string, wall: number, scripts = Object.keys(SCRIPTS)) {
  const s = structuredClone(base);
  const city = s.cities[toId];
  city.troops = DEF; city.wall = wall; city.morale = 75; city.comp = { infantry: 0.4, spear: 0.2, archer: 0.25, cavalry: 0.15 };
  const from = s.cities[fromId];
  const road = roadBetween(s, from.id, city.id)!;
  const atkG = plainGeneral('cao_hong', 75);
  const input: BattleInput = { attackerTroops: ATK, attackerGeneral: atkG, defenderCity: city, defenderGenerals: defenders, road, season: 1, weather: 'clear', attackerMorale: 75, attackerTraining: 60, attackerComp: { infantry: 0.4, spear: 0.15, archer: 0.2, cavalry: 0.25 }, defenderComp: city.comp };
  const line: string[] = [];
  for (const name of scripts) {
    let held = 0, aL = 0, dL = 0;
    for (let i = 0; i < N; i++) {
      const rng = { rng: 12345 + i * 7919 };
      const tb = createTacBattle(rng, input, { id: 't', turn: 1, playerSide: 'def', attackerFaction: 'wei', defenderFaction: city.owner, fromCity: from.id });
      while (!tb.done) {
        let d: SideOrders;
        if (name === 'AI 지휘') d = aiOrders(tb, 'def', rng);
        else if (name === 'AI 지휘(기술 없이)') { d = aiOrders(tb, 'def', rng); delete d.tech; }
        else {
          const pick = SCRIPTS[name](tb.phase, tb);
          d = Object.fromEntries(Object.entries(tb.def.units).filter(([, n]) => (n ?? 0) > 0).map(([k, n]) => [k, { troops: n!, tactic: pick[k as UnitKind] ?? 'assault' }]));
          // 고유 기술 먼저: 쓸 수 있는 기술 중 성공률이 가장 높은 것을 바로 쓴다
          if (name === '고유 기술 먼저→공격') { const t = techOptions(tb, 'def').filter((x) => !x.blocked).sort((a, b) => b.p - a.p)[0]; if (t) d.tech = t.id; }
        }
        playPhase(tb, rng, aiOrders(tb, 'atk', rng), d, input);
      }
      const out = tacOutcome(tb, input);
      if (!out.won) held++;
      aL += out.attackerLoss / ATK; dL += out.defenderLoss / DEF;
    }
    line.push(`${name} ${((held / N) * 100).toFixed(0)}% (적 손실 ${((aL / N) * 100).toFixed(0)}%)`);
  }
  const sk = defenders.map((g) => `${g.name}[${skillsOf(g).map((x) => x.name).join('·')}]`).join(' ');
  const rp = routeProfile(from.id, city.id);
  const tech = techOptions(createTacBattle({ rng: 1 }, input, { id: 't', turn: 1, playerSide: 'def', attackerFaction: 'wei', defenderFaction: city.owner, fromCity: from.id }), 'def').map((t) => `⭐${t.tech.name} ${Math.round(t.p * 100)}%`).join(' ');
  console.log(`\n■ ${label} — 수비 ${DEF.toLocaleString()} 대 공격 ${ATK.toLocaleString()}, ${from.name}→${city.name} (${road.type}${rp ? ` · ${routeText(rp)}` : ''}), 성벽 ${wall} · ${sk}${tech ? ` · ${tech}` : ''}`);
  console.log('  ' + line.join('\n  '));
}

const avg = [plainGeneral('cao_hong', 70)];
const heroes = [G('zhang_fei'), G('zhao_yun')];
const sages = [G('zhuge_liang'), G('zhao_yun')];
const ambushers = [G('zhang_he'), G('xu_huang')];
const PLAIN: [string, string] = ['gongju', 'suwon'], PASS: [string, string] = ['kaesong', 'chuncheon'], RIVER: [string, string] = ['suwon', 'hanyang'];
run('보통 장수, 평지', avg, ...PLAIN, 30);
run('장비·조운, 평지', heroes, ...PLAIN, 30);
run('보통 장수, 산길', avg, ...PASS, 30);
run('장비·조운, 산길', heroes, ...PASS, 30);
run('장합·서황, 산길', ambushers, ...PASS, 30);
run('제갈량·조운, 산길', sages, ...PASS, 30);
run('보통 장수, 강을 낀 길', avg, ...RIVER, 30);
run('장비·조운, 강을 낀 길', heroes, ...RIVER, 30);
run('장비·조운, 산길·성벽 70', heroes, ...PASS, 70);
