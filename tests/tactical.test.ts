// v4.3 5단계 전술 전투
import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, DATA, endTurn, SCENARIOS, neighbors, previewTactical, orderTactical, autoTacticalRest, retreatTactical, closeTactical, startSiegeTactical, orderBlocked, orderChance, BALANCE, type GameState, type SideOrders } from '../src/core';
import { aiOrders, createTacBattle, evalPhase, playPhase, tacOutcome, sumT, type TacBattle } from '../src/core/battle/phased';
import { marchInput } from '../src/core/commands/commands';
import { roadBetween } from '../src/core/query';

const sc = SCENARIOS['197_sabun'];

/** 촉 장수가 이웃한 적 도시를 노리는 판 */
function setup(seed = 3) {
  const s = createGame(DATA, sc, { seed, playerFactionId: 'shu' });
  s.diplomacy = {};
  for (const g of Object.values(s.generals)) {
    if (!g.alive || g.faction !== 'shu' || s.factions.shu.rulerId === g.id || g.acted) continue;
    const t = neighbors(s, g.city).find((n) => n.city.owner && n.city.owner !== 'shu' && n.road.type === 'land');
    if (!t) continue;
    s.cities[g.city].troops = 60000;
    s.cities[g.city].comp = { infantry: 0.4, spear: 0.1, archer: 0.25, cavalry: 0.25 };
    s.factions.shu.food = 999999;
    g.loyalty = 100;
    g.persona.righteousness = 100;
    return { s, g, from: g.city, to: t.city.id };
  }
  throw new Error('출진할 장수 없음');
}
const startBattle = (x: ReturnType<typeof setup>, troops = 40000) => applyCommand(x.s, 'shu', { type: 'march', generalId: x.g.id, toCityId: x.to, troops, tactical: true });
const allAssault = (tb: TacBattle, side: 'atk' | 'def'): SideOrders => Object.fromEntries(Object.entries(tb[side].units).filter(([, n]) => (n ?? 0) > 0).map(([k, n]) => [k, { troops: n!, tactic: 'assault' }]));

describe('5단계 전술 전투 (v4.3)', () => {
  it('플레이어 출진은 전투 창(진행 중 전투)을 열고, 끝날 때까지 다른 명령을 막는다', () => {
    const x = setup();
    const { state, result } = startBattle(x);
    expect(result.ok).toBe(true);
    expect(state.tacBattle?.phase).toBe(0);
    expect(state.tacBattle?.playerSide).toBe('atk');
    expect(state.lastBattles.length).toBe(x.s.lastBattles.length); // 아직 결판나지 않음
    const other = Object.values(state.generals).find((g) => g.alive && g.faction === 'shu' && !g.acted)!;
    expect(applyCommand(state, 'shu', { type: 'develop', generalId: other.id, field: 'agriculture' }).result.ok).toBe(false);
    // 저장 가능 (JSON 왕복)
    expect(JSON.parse(JSON.stringify(state)).tacBattle.phase).toBe(0);
  });

  it('다섯 번 명령하면 (또는 한쪽이 무너지면) 결판나고 전투 보고에 단계 기록이 남는다', () => {
    const x = setup();
    let s = startBattle(x).state;
    let n = 0;
    while (s.tacBattle && !s.tacBattle.done) {
      const r = orderTactical(s, allAssault(s.tacBattle, 'atk'));
      expect(r.ok).toBe(true);
      s = r.state;
      n++;
    }
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(5);
    const rep = s.lastBattles[s.lastBattles.length - 1];
    expect(rep.tactical?.length).toBe(n);
    expect(rep.reasons[0]).toContain('5단계 전투');
    s = closeTactical(s);
    expect(s.tacBattle).toBeUndefined();
    expect(applyCommand(s, 'shu', { type: 'develop', generalId: Object.values(s.generals).find((g) => g.alive && g.faction === 'shu' && !g.acted)!.id, field: 'agriculture' }).result.ok).toBe(true);
  });

  it('같은 시드·같은 명령이면 같은 결과 (결정론)', () => {
    const run = () => { let s = startBattle(setup(5)).state; while (s.tacBattle && !s.tacBattle.done) s = orderTactical(s, allAssault(s.tacBattle, 'atk')).state; return s.lastBattles[s.lastBattles.length - 1]; };
    expect(run()).toEqual(run());
  });

  it('예상 결과는 상태를 바꾸지 않고 병과마다 준 피해·받은 피해를 낸다', () => {
    const x = setup();
    const s = startBattle(x).state;
    const before = JSON.stringify(s);
    const p = previewTactical(s, allAssault(s.tacBattle!, 'atk'))!;
    expect(JSON.stringify(s)).toBe(before);
    expect(sumT(p.eval.loss.atk)).toBeGreaterThan(0);
    expect(sumT(p.eval.loss.def)).toBeGreaterThan(0);
    expect(Object.keys(p.eval.dealt.atk).length).toBeGreaterThan(1);
    expect(Object.keys(p.enemy).length).toBeGreaterThan(0);
  });

  it('턴을 넘기면 남은 단계는 AI가 마무리한다', () => {
    const x = setup();
    const s = startBattle(x).state;
    const n = endTurn(s);
    expect(n.tacBattle).toBeUndefined();
    expect(n.lastBattles.some((b) => b.turn === s.turn && b.tactical)).toBe(true);
  });

  it('맡기기와 퇴각', () => {
    const x = setup();
    const s = startBattle(x).state;
    const a = autoTacticalRest(s);
    expect(a.tacBattle?.done).toBe(true);
    const r = retreatTactical(orderTactical(s, allAssault(s.tacBattle!, 'atk')).state);
    if (r.tacBattle?.retreated) {
      const rep = r.lastBattles[r.lastBattles.length - 1];
      expect(rep.won).toBe(false);
      expect(rep.reasons[0]).toContain('스스로 물러남');
    }
  });

  it('화공은 비·눈에 못 쓰고, 지력 60 미만이면 못 쓴다. 매복은 마지막 단계에 못 한다', () => {
    const x = setup();
    const s = startBattle(x).state;
    const tb = structuredClone(s.tacBattle!);
    tb.terrain.wet = true;
    expect(orderBlocked(tb, 'atk', 'archer', 'fire')).toContain('비·눈');
    tb.terrain.wet = false;
    tb.atk.int = 40;
    expect(orderBlocked(tb, 'atk', 'archer', 'fire')).toContain('지력');
    tb.phase = 4;
    expect(orderBlocked(tb, 'atk', 'infantry', 'ambush')).toBeTruthy();
    expect(orderBlocked(tb, 'atk', 'archer', 'charge')).toBeTruthy();
    const p = orderChance(tb, 'atk', 'cavalry', 'feint')!;
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });

  it('숨은 매복병은 들키지 않으면 피해를 받지 않고, 다음 단계에 기습한다', () => {
    const x = setup();
    const s = startBattle(x).state;
    // 들킬 확률을 없앤다: 상대 지력 낮게, 내 지력 높게
    const tb = structuredClone(s.tacBattle!);
    tb.def.int = 10; tb.atk.int = 100;
    const o = allAssault(tb, 'atk');
    o.infantry = { troops: tb.atk.units.infantry!, tactic: 'ambush' };
    const h = { rng: 99 };
    playPhase(tb, h, o, allAssault(tb, 'def'));
    if (tb.atk.hidden.includes('infantry')) {
      expect(tb.phases[0].loss.atk.infantry ?? 0).toBe(0);
      const ev = evalPhase(tb, allAssault(tb, 'atk'), allAssault(tb, 'def'));
      expect(ev.dealt.atk.infantry).toBeGreaterThan(0);
    }
  });

  it('연계가 통한다: 기병 거짓 퇴각 + 보병 매복 → 다음 단계 기습·협공이 정면 공격만보다 적을 더 많이 쓰러뜨린다', () => {
    const x = setup();
    const s = x.s;
    const g = s.generals[x.g.id];
    g.stats.intellect = 95; // 거짓 퇴각이 잘 되도록
    const from = s.cities[x.from], to = s.cities[x.to];
    const b = marchInput(s, 'shu', g, from, to, 40000, roadBetween(s, from.id, to.id)!);
    const run = (combo: boolean) => {
      let dl = 0, al = 0;
      for (let i = 0; i < 60; i++) {
        const h = { rng: 1000 + i };
        const tb = createTacBattle(h, { ...b, noDuel: true }, { id: 't', turn: 0, playerSide: 'atk', attackerFaction: 'shu', defenderFaction: to.owner, fromCity: from.id });
        for (let p = 0; p < 2 && !tb.done; p++) {
          const o = allAssault(tb, 'atk');
          if (combo && p === 0) { o.cavalry = { troops: tb.atk.units.cavalry!, tactic: 'feint' }; o.infantry = { troops: tb.atk.units.infantry!, tactic: 'ambush' }; }
          if (combo && p === 1) { o.cavalry = { troops: tb.atk.units.cavalry!, tactic: 'flank' }; }
          playPhase(tb, h, o, allAssault(tb, 'def'));
        }
        dl += tb.def.clashLoss; al += tb.atk.clashLoss;
      }
      return { dl, al };
    };
    const plain = run(false), combo = run(true);
    // 두 단계 동안 아군 손실 대비 적 손실이 더 좋다
    expect(combo.dl / combo.al).toBeGreaterThan(plain.dl / plain.al);
  });

  it('AI 전술은 쓸 수 있는 것만 고르고, 양쪽 AI로 끝까지 싸우면 자동 전투와 같은 모양의 결과가 나온다', () => {
    const x = setup();
    const s = startBattle(x).state;
    const tb = structuredClone(s.tacBattle!);
    const h = { rng: 7 };
    const b = marchInput(x.s, 'shu', x.s.generals[x.g.id], x.s.cities[x.from], x.s.cities[x.to], 40000, roadBetween(x.s, x.from, x.to)!);
    while (!tb.done) {
      for (const side of ['atk', 'def'] as const) {
        const o = aiOrders(tb, side, h);
        for (const [k, u] of Object.entries(o)) expect(orderBlocked(tb, side, k as never, u!.tactic)).toBeNull();
      }
      playPhase(tb, h, aiOrders(tb, 'atk', h), aiOrders(tb, 'def', h), b);
    }
    const out = tacOutcome(tb, b);
    expect(out.attackerLoss).toBeGreaterThan(0);
    expect(out.attackerLoss).toBeLessThanOrEqual(40000);
    expect(typeof out.won).toBe('boolean');
  });

  it('포위당한 성을 직접 지휘하면 포위가 풀리고 수비 쪽 전투 창이 열린다', () => {
    const s = createGame(DATA, sc, { seed: 7, playerFactionId: 'shu' });
    s.diplomacy = {}; s.offers = [];
    let st: GameState | null = null;
    for (const g of Object.values(s.generals)) {
      if (!g.alive || !g.faction || g.faction === 'shu' || s.factions[g.faction].rulerId === g.id) continue;
      const t = neighbors(s, g.city).find((n) => n.city.owner === 'shu' && n.road.type !== 'sea');
      if (!t || s.cities[g.city].owner !== g.faction) continue;
      s.cities[g.city].troops = 30000; s.factions[g.faction].food = 999999; g.loyalty = 100; g.persona.righteousness = 100;
      st = applyCommand(s, g.faction, { type: 'march', generalId: g.id, toCityId: t.city.id, troops: 20000 }).state;
      break;
    }
    expect(st!.sieges?.length).toBe(1);
    const r = startSiegeTactical(st!, 'shu', st!.sieges![0].id);
    expect(r.ok).toBe(true);
    expect(r.state.sieges).toHaveLength(0);
    expect(r.state.tacBattle?.playerSide).toBe('def');
    let x = r.state;
    while (x.tacBattle && !x.tacBattle.done) x = orderTactical(x, allAssault(x.tacBattle, 'def')).state;
    expect(x.lastBattles[x.lastBattles.length - 1].tactical).toBeTruthy();
  });

  it('설정으로 끄면(또는 tactical 없이) 예전처럼 바로 결판', () => {
    const x = setup();
    const r = applyCommand(x.s, 'shu', { type: 'march', generalId: x.g.id, toCityId: x.to, troops: 40000 });
    expect(r.state.tacBattle).toBeUndefined();
    expect(r.state.lastBattles.length).toBe(x.s.lastBattles.length + 1);
    expect(BALANCE.tactical.enabled).toBe(true);
  });
});
