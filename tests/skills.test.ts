// v4.4 손자병법 전술 · 장수 특기
import { describe, expect, it } from 'vitest';
import { createGame, DATA, SCENARIOS, BALANCE, type General } from '../src/core';
import { aiOrders, createTacBattle, evalPhase, orderBlocked, orderChance, playPhase, tacOutcome, TAC_ORDERS, type SideOrders, type TacBattle, type TacOrder } from '../src/core/battle/phased';
import { autoSkillMul, GENERIC_SKILLS, SKILLS, skillChance, skillsOf, UNIQUE_SKILLS } from '../src/core/battle/skills';
import type { BattleInput } from '../src/core/battle/battle';
import type { UnitKind } from '../src/core/battle/formation';
import { roadBetween } from '../src/core/query';
import generalsJson from '../data/generals.json';

const base = createGame(DATA, SCENARIOS['197_sabun'], { seed: 7, playerFactionId: null });
const G = (id: string) => structuredClone(base.generals[id]) as General;
const plain = (v: number, id = `plain_${v}`): General => ({ ...G('cao_hong'), id, name: `보통${v}`, stats: { leadership: v, war: v, intellect: v, politics: v, charm: v } });

function input(opts: { atk?: General; def?: General[]; atkTroops?: number; defTroops?: number; road?: 'land' | 'pass' | 'river'; weather?: BattleInput['weather']; wall?: number } = {}): BattleInput {
  const s = structuredClone(base);
  const city = s.cities.chuncheon; // 춘천 분지 (산악도 39)
  city.troops = opts.defTroops ?? 10000; city.wall = opts.wall ?? 30; city.morale = 75;
  city.comp = { infantry: 0.4, spear: 0.2, archer: 0.25, cavalry: 0.15 };
  const from = Object.values(s.cities).find((c) => c.id !== city.id && roadBetween(s, c.id, city.id))!;
  const road = { ...roadBetween(s, from.id, city.id)!, type: opts.road ?? 'land' };
  return { attackerTroops: opts.atkTroops ?? 20000, attackerGeneral: opts.atk ?? plain(70), defenderCity: city, defenderGenerals: opts.def ?? [plain(70, 'plain_def')], road, season: 1, weather: opts.weather ?? 'clear', attackerMorale: 75, attackerTraining: 60, attackerComp: { infantry: 0.4, spear: 0.15, archer: 0.2, cavalry: 0.25 }, defenderComp: city.comp };
}
const battle = (b: BattleInput, seed = 1) => createTacBattle({ rng: seed }, b, { id: 't', turn: 1, playerSide: 'def', attackerFaction: 'wei', defenderFaction: b.defenderCity.owner, fromCity: 'x' });
const all = (tb: TacBattle, side: 'atk' | 'def', pick: Partial<Record<UnitKind, TacOrder>> = {}): SideOrders => Object.fromEntries(Object.entries(tb[side].units).filter(([, n]) => (n ?? 0) > 0).map(([k, n]) => [k, { troops: n!, tactic: pick[k as UnitKind] ?? 'assault' }]));

describe('특기 데이터 (v4.4)', () => {
  it('고유 특기 주인은 모두 실제 장수이고, 효과의 전술·능력치 이름이 올바르다', () => {
    const ids = new Set((generalsJson as { id: string }[]).map((g) => g.id));
    const orders = new Set(Object.keys(TAC_ORDERS));
    for (const s of UNIQUE_SKILLS) {
      expect(ids.has(s.general!), s.id).toBe(true);
      expect(s.source, s.id).toBeTruthy();
      expect(s.story, s.id).toBeTruthy();
    }
    for (const s of [...UNIQUE_SKILLS, ...GENERIC_SKILLS]) {
      expect(['leadership', 'war', 'intellect', 'politics', 'charm']).toContain(s.stat);
      for (const o of [...(s.effect.orders ?? []), ...(s.effect.unlock ?? []), ...(s.effect.foeOrders ?? [])]) expect(orders.has(o), `${s.id} ${o}`).toBe(true);
    }
    expect(UNIQUE_SKILLS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(UNIQUE_SKILLS.map((s) => s.general)).size).toBe(UNIQUE_SKILLS.length);
  });

  it('명장은 고유 특기 + 일반 특기 1개, 보통 장수는 능력치 70부터 일반 특기 최대 2개', () => {
    const zy = skillsOf(G('zhao_yun'));
    expect(zy[0].id).toBe('tanqi');
    expect(zy.length).toBe(2);
    expect(skillsOf(plain(60))).toEqual([]);
    const p70 = skillsOf(plain(72));
    expect(p70.length).toBe(2);
    expect(p70.every((s) => (s.min ?? 0) <= 72)).toBe(true);
    // 지력 90+ 장수는 허실, 80대는 궤도
    expect(skillsOf({ id: 'x', stats: { leadership: 50, war: 50, intellect: 93, politics: 50, charm: 50 } }).map((s) => s.id)).toContain('voidfull');
    expect(skillsOf({ id: 'x', stats: { leadership: 50, war: 50, intellect: 83, politics: 50, charm: 50 } }).map((s) => s.id)).toContain('deceit');
  });

  it('발동 확률은 능력치가 높을수록 오르고, 부장은 조금 낮다', () => {
    const sk = SKILLS.gale;
    expect(skillChance(sk, { stats: { ...plain(99).stats } })).toBeGreaterThan(skillChance(sk, { stats: { ...plain(90).stats } }));
    expect(skillChance(sk, plain(95), true)).toBeLessThan(skillChance(sk, plain(95)));
    expect(skillChance(SKILLS.tengjia, G('wu_tugu'))).toBe(1); // 등갑은 늘 입고 있다
  });
});

describe('손자병법 전술 (v4.4)', () => {
  it('반도격은 강을 건너오는 적을 지킬 때 1~2단계에만', () => {
    const tb = battle(input({ road: 'river' }));
    expect(orderBlocked(tb, 'def', 'archer', 'halfcross')).toBeNull();
    expect(orderBlocked(tb, 'atk', 'archer', 'halfcross')).not.toBeNull();
    expect(orderBlocked(battle(input({ road: 'land' })), 'def', 'archer', 'halfcross')).not.toBeNull();
    playPhase(tb, { rng: 3 }, all(tb, 'atk'), all(tb, 'def'));
    playPhase(tb, { rng: 4 }, all(tb, 'atk'), all(tb, 'def'));
    if (!tb.done) expect(orderBlocked(tb, 'def', 'archer', 'halfcross')).not.toBeNull();
    // 반도격은 정면 공격보다 강하다
    const t2 = battle(input({ road: 'river' }));
    const plainEv = evalPhase(t2, all(t2, 'atk'), all(t2, 'def'));
    const hc = evalPhase(t2, all(t2, 'atk'), all(t2, 'def', { infantry: 'halfcross', archer: 'halfcross', cavalry: 'halfcross' }));
    expect(hc.ratio).toBeLessThan(plainEv.ratio);
  });

  it('수공은 강 길·비·눈일 때 지력 75 이상만, 관우는 특기 「수엄」으로 지력과 상관없이 쓴다', () => {
    const dry = battle(input({ atk: plain(90) }));
    expect(orderBlocked(dry, 'atk', 'infantry', 'flood')).not.toBeNull();
    const river = battle(input({ atk: plain(90), road: 'river' }));
    expect(orderBlocked(river, 'atk', 'infantry', 'flood')).toBeNull();
    expect(orderBlocked(battle(input({ atk: plain(70), road: 'river' })), 'atk', 'infantry', 'flood')).not.toBeNull();
    const gy = battle(input({ atk: G('guan_yu'), weather: 'rain' }));
    expect(gy.atk.int).toBeLessThan(75);
    expect(orderBlocked(gy, 'atk', 'infantry', 'flood')).toBeNull();
    expect(orderBlocked(battle(input({ atk: plain(90), road: 'river', weather: 'drought' })), 'atk', 'infantry', 'flood')).not.toBeNull();
  });

  it('포위는 병력이 두 배 이상일 때만', () => {
    expect(orderBlocked(battle(input({ atkTroops: 20000, defTroops: 9000 })), 'atk', 'infantry', 'encircle')).toBeNull();
    expect(orderBlocked(battle(input({ atkTroops: 20000, defTroops: 12000 })), 'atk', 'infantry', 'encircle')).not.toBeNull();
  });

  it('장비는 「일갈」로 지력 31인데도 의병을 쓰고, 성공률이 보통 장수보다 높다', () => {
    const zf = battle(input({ def: [G('zhang_fei')], defTroops: 6000 }));
    expect(orderBlocked(zf, 'def', 'infantry', 'decoy')).toBeNull();
    const low = battle(input({ def: [plain(40, 'low')], defTroops: 6000 }));
    expect(orderBlocked(low, 'def', 'infantry', 'decoy')).not.toBeNull();
    const avg = battle(input({ def: [plain(70, 'avg')], defTroops: 6000 }));
    expect(orderChance(zf, 'def', 'infantry', 'decoy')!).toBeGreaterThan(orderChance(avg, 'def', 'infantry', 'decoy')!);
    // 의병이 통하면 적 공격이 준다
    const ev0 = evalPhase(zf, all(zf, 'atk'), all(zf, 'def', { infantry: 'hold' }));
    const ev1 = evalPhase(zf, all(zf, 'atk'), all(zf, 'def', { infantry: 'decoy' }));
    expect(ev1.power.atk).toBeLessThan(ev0.power.atk);
  });

  it('이일대로: 쉰 병과는 다음 단계 공격이 세고, 쉬는 적에게 쳐들어간 쪽은 지친다', () => {
    const a = battle(input(), 5), b = battle(input(), 5);
    playPhase(a, { rng: 9 }, all(a, 'atk'), all(a, 'def', { infantry: 'rest', spear: 'rest', archer: 'rest', cavalry: 'rest' }));
    playPhase(b, { rng: 9 }, all(b, 'atk'), all(b, 'def', { infantry: 'hold', spear: 'hold', archer: 'hold', cavalry: 'hold' }));
    expect(a.def.rested?.length).toBeGreaterThan(0);
    expect(a.atk.tired).toBe(true);
    expect(b.atk.tired).toBe(false);
    const ea = evalPhase(a, all(a, 'atk'), all(a, 'def'));
    const eb = evalPhase(b, all(b, 'atk'), all(b, 'def'));
    expect(ea.power.def / Math.max(1, ea.power.atk)).toBeGreaterThan(eb.power.def / Math.max(1, eb.power.atk));
  });

  it('도발에 걸린 장수는 다음 단계 방진·매복·쉬기를 못 하고, 습량을 당하면 굶주린다', () => {
    let provoked = false, starved = false;
    for (let i = 0; i < 40 && !(provoked && starved); i++) {
      const tb = battle(input({ atk: { ...plain(80, 'smart'), stats: { leadership: 80, war: 85, intellect: 90, politics: 60, charm: 60 } } }), i + 1);
      tb.def.pride = 95;
      playPhase(tb, { rng: 100 + i }, all(tb, 'atk', { infantry: 'provoke', cavalry: 'raid' }), all(tb, 'def'));
      if (tb.def.provoked) {
        provoked = true;
        expect(orderBlocked(tb, 'def', 'spear', 'hold')).not.toBeNull();
        expect(orderBlocked(tb, 'def', 'infantry', 'ambush')).not.toBeNull();
      }
      if (tb.def.starved) starved = true;
      expect(orderBlocked(tb, 'atk', 'cavalry', 'raid')).not.toBeNull(); // 한 번만
    }
    expect(provoked).toBe(true);
    expect(starved).toBe(true);
  });

  it('지혜로운 적장(지력 85+)에게는 거짓 퇴각·도발이 잘 통하지 않는다 (佯北勿從)', () => {
    const vsWise = battle(input({ atk: plain(90), def: [{ ...plain(70, 'w'), stats: { leadership: 70, war: 60, intellect: 95, politics: 60, charm: 60 } }] }));
    expect(orderChance(vsWise, 'atk', 'cavalry', 'feint')!).toBeLessThanOrEqual(BALANCE.tactical.wiseCap.cap + 1e-9);
  });

  it('등갑군은 칼·화살에 강하지만 화공에 크게 탄다', () => {
    const tg = battle(input({ atk: plain(90), def: [G('wu_tugu')] }));
    const pl = battle(input({ atk: plain(90), def: [plain(74, 'p74')] }));
    const fire = { archer: 'fire' as TacOrder };
    const tgFire = evalPhase(tg, all(tg, 'atk', fire), all(tg, 'def')).loss.def;
    const plFire = evalPhase(pl, all(pl, 'atk', fire), all(pl, 'def')).loss.def;
    const tgPlain = evalPhase(tg, all(tg, 'atk'), all(tg, 'def')).loss.def;
    const plPlain = evalPhase(pl, all(pl, 'atk'), all(pl, 'def')).loss.def;
    const sum = (t: Record<string, number | undefined>) => Object.values(t).reduce<number>((a, b) => a + (b ?? 0), 0);
    expect(sum(tgPlain)).toBeLessThan(sum(plPlain));
    expect(sum(tgFire) / sum(tgPlain)).toBeGreaterThan(sum(plFire) / sum(plPlain));
  });

  it('사지에 몰린 쪽은 사기 붕괴 기준이 낮아진다', () => {
    const tb = battle(input({ atkTroops: 30000, defTroops: 8000 }));
    const ev = evalPhase(tb, all(tb, 'atk'), all(tb, 'def'));
    expect(ev.rally.def).toBeGreaterThanOrEqual(ev.rally.atk + BALANCE.tactical.deathGround.rally - 1e-9);
    const even = battle(input({ atkTroops: 12000, defTroops: 10000 }));
    expect(evalPhase(even, all(even, 'atk'), all(even, 'def')).rally.def).toBeLessThan(BALANCE.tactical.deathGround.rally);
  });
});

describe('장수 특기 효과 (v4.4)', () => {
  it('조운 「단기」: 병력이 적을 때 기병 공격이 세진다 (같은 능력치의 특기 없는 장수와 비교)', () => {
    const zy = G('zhao_yun');
    const clone = { ...zy, id: 'zy_clone' };
    const a = battle(input({ def: [zy], defTroops: 8000 }));
    const b = battle(input({ def: [clone], defTroops: 8000 }));
    const pick = { cavalry: 'charge' as TacOrder };
    expect(evalPhase(a, all(a, 'atk'), all(a, 'def', pick)).power.def).toBeGreaterThan(evalPhase(b, all(b, 'atk'), all(b, 'def', pick)).power.def);
  });

  it('특기가 발동하면 전투 기록에 남고, 상태는 JSON으로 저장된다', () => {
    let fired = false;
    for (let i = 0; i < 20 && !fired; i++) {
      const b = input({ def: [G('zhang_fei'), G('zhao_yun')], defTroops: 7000 });
      const tb = battle(b, i + 1);
      const rng = { rng: 50 + i };
      while (!tb.done) playPhase(tb, rng, aiOrders(tb, 'atk', rng), aiOrders(tb, 'def', rng), b);
      if (tb.phases.some((p) => (p.skills ?? []).length > 0)) {
        fired = true;
        expect(tb.phases.some((p) => p.events.some((e) => e.includes('특기')))).toBe(true);
        const back = JSON.parse(JSON.stringify(tb)) as TacBattle;
        expect(back.def.skills?.length).toBeGreaterThan(0);
        expect(tacOutcome(back, b).reasons.join('\n')).toContain('특기');
      }
    }
    expect(fired).toBe(true);
  });

  it('같은 시드면 특기 발동까지 같은 결과 (결정론)', () => {
    const run = () => {
      const b = input({ atk: G('lu_bu'), def: [G('zhuge_liang'), G('zhao_yun')] });
      const tb = battle(b, 77);
      const rng = { rng: 4242 };
      while (!tb.done) playPhase(tb, rng, aiOrders(tb, 'atk', rng), aiOrders(tb, 'def', rng), b);
      return JSON.stringify(tb.phases);
    };
    expect(run()).toBe(run());
  });

  it('자동 전투에는 정면 싸움 특기만 작게 반영된다 (특기 최대 autoCap × 고유 기술 최대 techAutoCap)', () => {
    const ctx = { atk: false, walled: false, outnumbered: true, water: false, fog: false, rough: false };
    const zy = autoSkillMul([{ g: G('zhao_yun'), deputy: false }], ctx);
    expect(zy.mul).toBeGreaterThan(1);
    expect(zy.mul).toBeLessThanOrEqual(BALANCE.skills.autoCap * BALANCE.skills.techAutoCap + 1e-9);
    expect(autoSkillMul([{ g: plain(60), deputy: false }], ctx).mul).toBe(1);
    // 계략 전용 특기(주유 적벽)는 자동 전투에 들어가지 않는다 (고유 기술 대화공의 기대값만 들어간다)
    const S = BALANCE.skills as unknown as { tech: boolean };
    S.tech = false;
    expect(autoSkillMul([{ g: { ...G('zhou_yu'), stats: { leadership: 60, war: 60, intellect: 60, politics: 60, charm: 60 } }, deputy: false }], ctx).mul).toBe(1);
    S.tech = true;
    expect(autoSkillMul([{ g: G('zhou_yu'), deputy: false }], ctx).mul).toBeGreaterThan(1);
    // 비가 오면 대화공은 빠진다
    expect(autoSkillMul([{ g: { ...G('zhou_yu'), stats: { leadership: 60, war: 60, intellect: 96, politics: 60, charm: 60 } }, deputy: false }], { ...ctx, wet: true }).mul).toBe(1);
  });

  it('적은 병력도 좁은 길에서 전술을 쓰면 정면 공격만 할 때보다 훨씬 잘 버틴다', () => {
    const b = input({ road: 'pass', atkTroops: 20000, defTroops: 8000 });
    const holdRate = (script: (ph: number, tb: TacBattle) => Partial<Record<UnitKind, TacOrder>>) => {
      let held = 0;
      for (let i = 0; i < 120; i++) {
        const tb = battle(b, 1000 + i);
        const rng = { rng: 9000 + i * 31 };
        while (!tb.done) playPhase(tb, rng, aiOrders(tb, 'atk', rng), all(tb, 'def', script(tb.phase, tb)), b);
        if (!tacOutcome(tb, b).won) held++;
      }
      return held / 120;
    };
    const assaultOnly = holdRate(() => ({}));
    const tactics = holdRate((ph, tb) => (ph === 0 ? { cavalry: 'feint', infantry: 'ambush', archer: 'ambush', spear: 'hold' } : tb.atk.lured ? { cavalry: 'flank', infantry: 'flank', archer: 'volley', spear: 'flank' } : { infantry: 'hold', spear: 'hold', archer: 'volley', cavalry: 'flank' }));
    expect(tactics).toBeGreaterThan(assaultOnly + 0.15);
  });
});
