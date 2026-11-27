// v4.4.1 길별·방향별 전투 지형 · 고유 기술 · 특기 설명
import { describe, expect, it } from 'vitest';
import { createGame, DATA, SCENARIOS, BALANCE, type General } from '../src/core';
import { createTacBattle, evalPhase, playPhase, techOptions, cleanOrders, aiOrders, type SideOrders, type TacBattle, type TacOrder } from '../src/core/battle/phased';
import { SKILLS, UNIQUE_SKILLS, GENERIC_SKILLS, skillEffectLines, skillRuleLines, techChance, techLines } from '../src/core/battle/skills';
import { groundOf, routeAttackMul, routeProfile, routeText } from '../src/core/battle/ground';
import { battleBase, type BattleInput } from '../src/core/battle/battle';
import type { UnitKind } from '../src/core/battle/formation';
import { roadBetween } from '../src/core/query';
import roadTerrain from '../data/geo/road_terrain.json';

const base = createGame(DATA, SCENARIOS['197_sabun'], { seed: 7, playerFactionId: null });
const G = (id: string) => structuredClone(base.generals[id]) as General;
const plain = (v: number, id = `plain_${v}`): General => ({ ...G('cao_hong'), id, name: `보통${v}`, stats: { leadership: v, war: v, intellect: v, politics: v, charm: v } });

function input(fromId: string, toId: string, opts: { atk?: General; def?: General[]; atkTroops?: number; defTroops?: number; weather?: BattleInput['weather'] } = {}): BattleInput {
  const s = structuredClone(base);
  const city = s.cities[toId];
  city.troops = opts.defTroops ?? 10000; city.wall = 30; city.morale = 75;
  city.comp = { infantry: 0.4, spear: 0.2, archer: 0.25, cavalry: 0.15 };
  const road = roadBetween(s, fromId, toId)!;
  return { attackerTroops: opts.atkTroops ?? 20000, attackerGeneral: opts.atk ?? plain(70), defenderCity: city, defenderGenerals: opts.def ?? [plain(70, 'plain_def')], road, season: 1, weather: opts.weather ?? 'clear', attackerMorale: 75, attackerTraining: 60, attackerComp: { infantry: 0.4, spear: 0.15, archer: 0.2, cavalry: 0.25 }, defenderComp: city.comp };
}
const battle = (b: BattleInput, side: 'atk' | 'def' = 'atk', seed = 1) => createTacBattle({ rng: seed }, b, { id: 't', turn: 1, playerSide: side, attackerFaction: 'wei', defenderFaction: b.defenderCity.owner, fromCity: 'x' });
const all = (tb: TacBattle, side: 'atk' | 'def', pick: Partial<Record<UnitKind, TacOrder>> = {}, tech?: string): SideOrders => ({
  ...Object.fromEntries(Object.entries(tb[side].units).filter(([, n]) => (n ?? 0) > 0).map(([k, n]) => [k, { troops: n!, tactic: pick[k as UnitKind] ?? 'assault' }])),
  ...(tech ? { tech } : {}),
});

describe('길별·방향별 전투 지형 (v4.4.1)', () => {
  const R = roadTerrain as Record<string, { plain: number; hill: number; mountain: number; valley: number; river: number; label: string }>;
  it('모든 길이 두 방향 다 지형값을 가지고, 평지+구릉+산악+계곡은 1이다', () => {
    for (const r of [...DATA.roads]) {
      for (const k of [`${r.from}>${r.to}`, `${r.to}>${r.from}`]) {
        const p = R[k];
        expect(p, k).toBeTruthy();
        expect(Math.abs(p.plain + p.hill + p.mountain + p.valley - 1), k).toBeLessThanOrEqual(0.02);
        expect(p.river).toBeGreaterThanOrEqual(0);
      }
    }
    expect(Object.keys(R).length).toBeGreaterThan(1500); // 군현 지도 길까지
  });

  it('같은 길도 방향에 따라 다르다: 수원→서울은 한강 들판(평지·강), 서울→수원은 구릉·산', () => {
    const a = routeProfile('suwon', 'hanyang')!, b = routeProfile('hanyang', 'suwon')!;
    expect(a.plain).toBeGreaterThan(b.plain);
    expect(a.river).toBeGreaterThan(b.river);
    expect(b.mountain + b.hill).toBeGreaterThan(a.mountain + a.hill);
    // 서울→춘천은 골짜기·강을 거슬러 오르고, 춘천→서울은 내려오며 트인다
    const up = routeProfile('hanyang', 'chuncheon')!, down = routeProfile('chuncheon', 'hanyang')!;
    expect(up.valley).toBeGreaterThan(down.valley);
    expect(down.plain).toBeGreaterThan(up.plain);
    expect(routeText(a)).toContain('평지');
  });

  it('평지로 내려오는 공격은 공격 배율이 높고, 골짜기를 오르는 공격은 낮다', () => {
    const s = structuredClone(base);
    const open = groundOf(roadBetween(s, 'suwon', 'hanyang')!, s.cities.hanyang);
    const valley = groundOf(roadBetween(s, 'hamhung', 'ganggye')!, s.cities.ganggye);
    expect(open.route?.label).toBe('river');
    expect(valley.valley).toBe(true);
    expect(valley.rough).toBe(true);
    expect(routeAttackMul(open).mul).toBeGreaterThan(routeAttackMul(valley).mul);
    expect(routeAttackMul(valley).mul).toBeGreaterThanOrEqual(BALANCE.ground.min);
    // 전투 원인 설명에 싸울 땅이 나온다
    const B = battleBase(input('suwon', 'hanyang'));
    expect(B.reasons.some((r) => r.includes('싸울 땅'))).toBe(true);
  });

  it('5단계 전투 지형 판정도 길 방향을 따른다 (반도격은 강을 낀 길에서)', () => {
    const tb = battle(input('suwon', 'hanyang'), 'def');
    expect(tb.terrain.route).toBeTruthy();
    expect(tb.terrain.river).toBe(true);
    const back = battle(input('hanyang', 'suwon'), 'def');
    expect(back.terrain.river).toBe(false);
    // 끄면 옛 판정
    (BALANCE.ground as { enabled: boolean }).enabled = false;
    try {
      expect(battle(input('suwon', 'hanyang'), 'def').terrain.route).toBeUndefined();
    } finally { (BALANCE.ground as { enabled: boolean }).enabled = true; }
  });
});

describe('고유 기술 (v4.4.1)', () => {
  it('고유 특기 35개 모두 고유 기술을 가지고, 설명·성공률이 있다', () => {
    expect(UNIQUE_SKILLS.length).toBe(35);
    for (const s of UNIQUE_SKILLS) {
      expect(s.tech, s.id).toBeTruthy();
      expect(s.tech!.name && s.tech!.hanja && s.tech!.desc, s.id).toBeTruthy();
      expect(techLines(s.tech!, s.stat).length).toBeGreaterThan(1);
      const p = techChance(s.tech!, 90, false);
      expect(p).toBeGreaterThanOrEqual(BALANCE.skills.techMin);
      expect(p).toBeLessThanOrEqual(BALANCE.skills.techMax);
    }
  });

  it('주유 대화공: 성공하면 적 병력의 큰 몫이 한꺼번에 타 죽는다 (비가 오면 못 씀)', () => {
    const tb = battle(input('suwon', 'hanyang', { atk: G('zhou_yu') }));
    const opt = techOptions(tb, 'atk').find((t) => t.id === 'chibi')!;
    expect(opt.blocked).toBeNull();
    const before = Object.values(tb.def.units).reduce((a, n) => a + (n ?? 0), 0);
    let seed = 1;
    let ev = evalPhase(tb, all(tb, 'atk', {}, 'chibi'), all(tb, 'def'), { rng: seed });
    while (!ev.techs?.[0]?.ok && seed < 50) ev = evalPhase(tb, all(tb, 'atk', {}, 'chibi'), all(tb, 'def'), { rng: ++seed });
    expect(ev.techs?.[0]?.ok).toBe(true);
    const plainEv = evalPhase(tb, all(tb, 'atk'), all(tb, 'def'), { rng: seed });
    const killed = Object.values(ev.loss.def).reduce((a, n) => a + (n ?? 0), 0) - Object.values(plainEv.loss.def).reduce((a, n) => a + (n ?? 0), 0);
    expect(killed).toBeGreaterThan(before * 0.2);
    expect(ev.events.some((e) => e.includes('대화공'))).toBe(true);
    // 비
    const wet = battle(input('suwon', 'hanyang', { atk: G('zhou_yu'), weather: 'rain' }));
    expect(techOptions(wet, 'atk').find((t) => t.id === 'chibi')!.blocked).toBeTruthy();
    expect(cleanOrders(wet, 'atk', all(wet, 'atk', {}, 'chibi')).tech).toBeUndefined();
  });

  it('고유 기술은 전투당 한 번만 쓴다', () => {
    const tb = battle(input('suwon', 'hanyang', { atk: G('zhou_yu') }));
    playPhase(tb, { rng: 3 }, all(tb, 'atk', {}, 'chibi'), all(tb, 'def'));
    expect(tb.atk.techUsed).toContain('chibi');
    expect(techOptions(tb, 'atk').find((t) => t.id === 'chibi')!.blocked).toContain('이미');
    expect(tb.phases[0].orders.atk.tech).toBe('chibi');
  });

  it('장합 대복병: 전 병과가 숨고, 다음 단계 기습이 일반 매복보다 세다', () => {
    const b = input('hanyang', 'chuncheon', { def: [G('zhang_he')], atkTroops: 20000, defTroops: 8000 });
    // 기술 대복병 (성공할 때까지 시드를 바꿔 본다)
    let t1: TacBattle | null = null;
    for (let seed = 1; seed < 40 && !t1; seed++) {
      const tb = battle(b, 'def', seed);
      playPhase(tb, { rng: seed }, all(tb, 'atk'), all(tb, 'def', {}, 'fubing'));
      if (tb.phases[0].techs?.[0]?.ok) t1 = tb;
    }
    expect(t1).toBeTruthy();
    expect(t1!.def.hidden.length).toBe(Object.values(t1!.def.units).filter((n) => (n ?? 0) > 0).length);
    expect(t1!.def.springMul).toBeGreaterThan(1);
    // 같은 상태에서 일반 매복으로 숨은 것과 비교 (기습 배율만 다름)
    const t2 = structuredClone(t1!);
    t2.def.springMul = 1;
    const spring1 = evalPhase(t1!, all(t1!, 'atk'), all(t1!, 'def')).power.def;
    const spring2 = evalPhase(t2, all(t2, 'atk'), all(t2, 'def')).power.def;
    expect(spring1).toBeGreaterThan(spring2 * 1.4);
  });

  it('강유 계중계: 적 특기와 계략을 막는다', () => {
    const tb = battle(input('suwon', 'hanyang', { atk: G('zhou_yu'), def: [G('jiang_wei')] }), 'def');
    // 수비 강유가 계중계, 공격 주유는 화공: 계중계가 성공하면 화공 성공률 0
    let seed = 1, ev = evalPhase(tb, all(tb, 'atk', { archer: 'fire' }), all(tb, 'def', {}, 'danlve'), { rng: seed });
    while (!ev.techs?.find((t) => t.side === 'def')?.ok && seed < 60) ev = evalPhase(tb, all(tb, 'atk', { archer: 'fire' }), all(tb, 'def', {}, 'danlve'), { rng: ++seed });
    expect(ev.techs?.find((t) => t.side === 'def')?.ok).toBe(true);
    expect(ev.rolls.find((r) => r.side === 'atk' && r.tactic === 'fire')?.chance).toBe(0);
    expect(ev.skills.filter((x) => x.side === 'atk' && x.a > 0).length).toBe(0);
  });

  it('고유 기술은 일반 특기보다 확실히 세다: 같은 전투 기대값으로 비교', () => {
    // 기대값(난수 없음) 한 단계: 고유 기술을 쓰면 아군 전력/적 손실이 일반 특기 장수보다 크게 낫다
    const pairs: [string, string, 'atk' | 'def'][] = [['zhou_yu', 'chibi', 'atk'], ['lu_bu', 'feijiang', 'atk'], ['zhang_fei', 'yihe', 'def'], ['zhuge_liang', 'bazhen', 'def'], ['ma_chao', 'tieji', 'atk']];
    for (const [gid, tid, side] of pairs) {
      const g = G(gid);
      const b = side === 'atk' ? input('suwon', 'hanyang', { atk: g }) : input('suwon', 'hanyang', { def: [g] });
      const tb = battle(b, side);
      const mine = (o: SideOrders) => (side === 'atk' ? evalPhase(tb, o, all(tb, 'def')) : evalPhase(tb, all(tb, 'atk'), o));
      const plainEv = mine(all(tb, side));
      const techEv = mine(all(tb, side, {}, tid));
      const score = (e: ReturnType<typeof evalPhase>) => side === 'atk' ? e.ratio : 1 / e.ratio;
      const foeLoss = (e: ReturnType<typeof evalPhase>) => Object.values(e.loss[side === 'atk' ? 'def' : 'atk']).reduce((a, n) => a + (n ?? 0), 0);
      const better = score(techEv) / score(plainEv) > 1.15 || foeLoss(techEv) > foeLoss(plainEv) * 1.3;
      expect(better, `${gid} ${tid}`).toBe(true);
    }
  });

  it('AI도 고유 기술을 쓴다', () => {
    let used = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const tb = battle(input('suwon', 'hanyang', { atk: G('lu_bu') }), 'atk', seed);
      const rng = { rng: seed * 7 };
      while (!tb.done) playPhase(tb, rng, aiOrders(tb, 'atk', rng), aiOrders(tb, 'def', rng));
      if (tb.atk.techUsed?.includes('feijiang')) used++;
    }
    expect(used).toBeGreaterThan(10);
  });
});

describe('특기 설명 상자 (v4.4.1)', () => {
  it('일반 특기는 능력치 조건·발동 확률·효과 수치를, 고유 특기는 일화·출처와 기술까지 설명한다', () => {
    for (const s of GENERIC_SKILLS) {
      const rules = skillRuleLines(s).join(' ');
      expect(rules).toContain(`${s.min} 이상`);
      expect(rules).toContain('발동');
      expect(skillEffectLines(s).length).toBeGreaterThan(0);
      expect(s.sun).toBeTruthy();
    }
    const chibi = SKILLS.chibi;
    expect(skillEffectLines(chibi).join(' ')).toContain('화공');
    expect(techLines(chibi.tech!, chibi.stat).join(' ')).toContain('25%');
    expect(chibi.story).toContain('적벽');
  });
});
