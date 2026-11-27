// v4.4 "적은 병력으로 대군을 막을 수 있나" 검증: 수비 쪽 작전(대본)마다 같은 전투를 N번 돌려 지켜 낸 비율을 비교한다.
// 공격군은 AI 전술로 싸운다. 수비 장수·병력·길(평지/산길/강)을 바꿔 가며 본다.
// 사용: npx tsx tools/few-vs-many.ts [반복=300] [수비 병력=8000] [공격 병력=20000]
import { BALANCE, createGame, DATA, SCENARIOS, type General } from '../src/core';
import { aiOrders, createTacBattle, playPhase, tacOutcome, type SideOrders, type TacBattle, type TacOrder } from '../src/core/battle/phased';
import { roadBetween } from '../src/core/query';
import type { BattleInput } from '../src/core/battle/battle';
import type { UnitKind } from '../src/core/battle/formation';
import { skillsOf } from '../src/core/battle/skills';

if (process.env.NOSKILL) (BALANCE.skills as { enabled: boolean }).enabled = false;
const N = Number(process.argv[2] ?? 300), DEF = Number(process.argv[3] ?? 8000), ATK = Number(process.argv[4] ?? 20000);
const base = createGame(DATA, SCENARIOS['197_sabun'], { seed: 7, playerFactionId: null });
const G = (id: string) => structuredClone(base.generals[id]) as General;
const plainGeneral = (id: string, v: number): General => ({ ...G(id), id: `plain_${v}`, name: `보통 장수(${v})`, stats: { leadership: v, war: v, intellect: v, politics: v, charm: v } });

/** 수비 작전: 단계(0~4)와 지금 전투를 보고 병과별 전술을 고른다 */
type Script = (ph: number, tb: TacBattle) => Partial<Record<UnitKind, TacOrder>>;
const SCRIPTS: Record<string, Script> = {
  '정면 공격만': () => ({}),
  'AI 지휘': () => ({}),
  '방진만': () => ({ infantry: 'hold', spear: 'hold', archer: 'hold', cavalry: 'assault' }),
  '방진+사격': () => ({ infantry: 'hold', spear: 'hold', archer: 'volley', cavalry: 'assault' }),
  '의병→방진+사격': (ph) => (ph === 0 ? { infantry: 'decoy', spear: 'hold', archer: 'volley', cavalry: 'decoy' } : { infantry: 'hold', spear: 'hold', archer: 'volley', cavalry: 'flank' }),
  '이일대로→반격': (ph) => (ph === 0 ? { infantry: 'rest', spear: 'rest', archer: 'rest', cavalry: 'rest' } : { infantry: 'assault', spear: 'hold', archer: 'volley', cavalry: 'charge' }),
  '거짓 퇴각+매복→기습': (ph, tb) => (ph === 0 ? { cavalry: 'feint', infantry: 'ambush', archer: 'ambush', spear: 'hold' } : tb.atk.lured ? { cavalry: 'flank', infantry: 'flank', archer: 'volley', spear: 'flank' } : { infantry: 'hold', spear: 'hold', archer: 'volley', cavalry: 'flank' }),
  '반도격→방진': (ph) => (ph < 2 ? { infantry: 'halfcross', archer: 'halfcross', cavalry: 'halfcross', spear: 'hold' } : { infantry: 'hold', spear: 'hold', archer: 'volley', cavalry: 'flank' }),
  '도발→매복': (ph, tb) => (ph === 0 ? { infantry: 'provoke', archer: 'ambush', spear: 'hold', cavalry: 'ambush' } : tb.atk.provoked ? { infantry: 'hold', spear: 'hold', archer: 'volley', cavalry: 'flank' } : { infantry: 'hold', spear: 'hold', archer: 'volley', cavalry: 'flank' }),
};

function run(label: string, defenders: General[], roadType: 'land' | 'pass' | 'river', wall: number, scripts = Object.keys(SCRIPTS)) {
  const s = structuredClone(base);
  const city = Object.values(s.cities).find((c) => c.id === 'chuncheon') ?? Object.values(s.cities)[0];
  city.troops = DEF; city.wall = wall; city.morale = 75; city.comp = { infantry: 0.4, spear: 0.2, archer: 0.25, cavalry: 0.15 };
  const from = Object.values(s.cities).find((c) => c.id !== city.id && roadBetween(s, c.id, city.id))!;
  const road = { ...roadBetween(s, from.id, city.id)!, type: roadType };
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
        else {
          const pick = SCRIPTS[name](tb.phase, tb);
          d = Object.fromEntries(Object.entries(tb.def.units).filter(([, n]) => (n ?? 0) > 0).map(([k, n]) => [k, { troops: n!, tactic: pick[k as UnitKind] ?? 'assault' }]));
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
  console.log(`\n■ ${label} — 수비 ${DEF.toLocaleString()} 대 공격 ${ATK.toLocaleString()}, 길 ${roadType}, 성벽 ${wall} · ${sk}`);
  console.log('  ' + line.join('\n  '));
}

const avg = [plainGeneral('cao_hong', 70)];
const heroes = [G('zhang_fei'), G('zhao_yun')];
const sages = [G('zhuge_liang'), G('zhao_yun')];
run('보통 장수, 평지', avg, 'land', 30);
run('장비·조운, 평지', heroes, 'land', 30);
run('보통 장수, 산길', avg, 'pass', 30);
run('장비·조운, 산길', heroes, 'pass', 30);
run('제갈량·조운, 산길', sages, 'pass', 30);
run('보통 장수, 강', avg, 'river', 30);
run('장비·조운, 강', heroes, 'river', 30);
run('장비·조운, 산길·성벽 70', heroes, 'pass', 70);
