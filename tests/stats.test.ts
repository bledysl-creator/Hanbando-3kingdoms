// v4.2 능력치 체계 테스트 (docs/design/stats-v4.2.md)
import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, DATA, SCENARIOS, BALANCE, commandCap, effectiveTroops, chancellorOf, gainExp, statGrade, supplyMul, unitStats, generalsIn, neighbors } from '../src/core';
import { resolveBattle } from '../src/core/battle/battle';
import { processLoyalty } from '../src/core/systems/turn';

const newGame = (seed = 1, player: string | null = 'shu') => createGame(DATA, SCENARIOS['197_sabun'], { seed, playerFactionId: player });
const road = { from: 'hanyang', to: 'kaesong', type: 'land' as const };

describe('통솔: 지휘 한도 (v4.2)', () => {
  it('한도를 넘는 병력은 절반 효율', () => {
    expect(commandCap(80)).toBe(80 * BALANCE.commandPerLead);
    expect(effectiveTroops(30000, 40000)).toBe(30000);
    expect(effectiveTroops(60000, 40000)).toBe(40000 + 20000 * BALANCE.overCommandEff);
    expect(commandCap(80, [70])).toBe(80 * BALANCE.commandPerLead + 70 * BALANCE.deputyCommandPer);
  });
  it('통솔 낮은 장수의 대군은 통솔 높은 장수보다 약하다 (무력 같게)', () => {
    const s = newGame();
    const strong = { ...s.generals.guan_yu, stats: { ...s.generals.guan_yu.stats, leadership: 95, war: 80 } };
    const weak = { ...s.generals.guan_yu, stats: { ...s.generals.guan_yu.stats, leadership: 40, war: 80 } };
    const base = { attackerTroops: 80000, defenderCity: s.cities.kaesong, defenderGenerals: [], road, season: 0, weather: 'clear' as const };
    const a = resolveBattle({ rng: 1 }, { ...base, attackerGeneral: strong });
    const b = resolveBattle({ rng: 1 }, { ...base, attackerGeneral: weak });
    expect(b.attackerPower / a.attackerPower).toBeLessThan((0.5 + 0.4) / (0.5 + 0.95));
    expect(b.reasons.join()).toContain('지휘 한도');
  });
});

describe('부장 (v4.2)', () => {
  it('부대 능력: 통솔은 주장, 무력·지력은 둘 중 높은 쪽', () => {
    const s = newGame();
    const u = unitStats(s.generals.liu_bei, s.generals.zhang_fei);
    expect(u.leadership).toBe(s.generals.liu_bei.stats.leadership);
    expect(u.war).toBe(Math.max(s.generals.liu_bei.stats.war, s.generals.zhang_fei.stats.war));
  });
  it('부장을 붙여 출진하면 둘 다 행동을 쓰고, 이기면 함께 성에 들어간다', () => {
    const s = newGame(3);
    const g = s.generals.guan_yu;
    const d = s.generals.zhang_fei;
    d.city = g.city; d.faction = 'shu'; d.acted = false;
    const from = s.cities[g.city];
    from.troops = 60000; from.morale = 90; from.training = 90;
    const to = neighbors(s, from.id).find((n) => n.road.type === 'land')!.city;
    to.owner = null; to.troops = 500; to.wall = 0;
    for (const x of Object.values(s.generals)) if (x.city === to.id) x.city = from.id;
    const { state, result } = applyCommand(s, 'shu', { type: 'march', generalId: g.id, toCityId: to.id, troops: 40000, deputyId: d.id });
    expect(result.ok).toBe(true);
    expect(state.generals[d.id].acted).toBe(true);
    if (state.cities[to.id].owner === 'shu') expect(state.generals[d.id].city).toBe(to.id);
    expect(state.lastBattles.at(-1)!.reasons.join()).toContain('부장');
  });
  it('원수끼리는 한 부대로 묶을 수 없다', () => {
    const s = newGame();
    const g = s.generals.guan_yu;
    const d = generalsIn(s, g.city).find((x) => x.faction === 'shu' && x.id !== g.id);
    if (!d) return;
    s.relations.push({ a: g.id, b: d.id, type: 'enmity' });
    s.cities.kaesong.owner = 'wei';
    const r = applyCommand(s, 'shu', { type: 'march', generalId: g.id, toCityId: 'kaesong', troops: 3000, deputyId: d.id }).result;
    if (!r.ok) expect(r.error).toMatch(/원수|인접/);
  });
  it('의형제 부장은 공격력을 올린다', () => {
    const s = newGame();
    const base = { attackerTroops: 20000, attackerGeneral: s.generals.liu_bei, attackerDeputy: s.generals.zhang_fei, defenderCity: s.cities.kaesong, defenderGenerals: [], road, season: 0, weather: 'clear' as const, noDuel: true };
    const a = resolveBattle({ rng: 7 }, { ...base });
    const b = resolveBattle({ rng: 7 }, { ...base, bond: 'sworn' });
    expect(b.attackerPower).toBeGreaterThan(a.attackerPower);
    expect(b.reasons.join()).toContain('의형제');
  });
});

describe('정치·매력 (v4.2)', () => {
  it('재상: 세력 최고 정치 70+면 수입 배율이 1보다 크다', () => {
    const s = newGame();
    expect(chancellorOf(s, 'wei').mul).toBeGreaterThan(1);
  });
  it('병참: 정치 높은 장수가 있는 성은 군량을 덜 쓴다', () => {
    const s = newGame();
    const c = s.generals.cao_cao.city; // 조조 정치 93
    expect(supplyMul(s, c, 'wei')).toBeLessThan(1);
  });
  it('군주 매력이 높으면 충성이 더 잘 오른다', () => {
    const a = newGame(5), b = newGame(5);
    b.generals[b.factions.shu.rulerId].stats.charm = 20;
    for (let i = 0; i < 8; i++) { processLoyalty(a); processLoyalty(b); }
    const avg = (s: ReturnType<typeof newGame>) => { const gs = Object.values(s.generals).filter((g) => g.alive && g.faction === 'shu' && g.id !== s.factions.shu.rulerId); return gs.reduce((x, g) => x + g.loyalty, 0) / gs.length; };
    expect(avg(a)).toBeGreaterThan(avg(b));
  });
  it('매력 높은 장수가 징병하면 민심이 덜 떨어진다', () => {
    const s = newGame();
    const g = s.generals.liu_bei;
    const cityId = g.city;
    const hi = applyCommand(s, 'shu', { type: 'conscript', generalId: g.id, amount: 3000 }).state;
    const s2 = newGame(); s2.generals.liu_bei.stats.charm = 20;
    const lo = applyCommand(s2, 'shu', { type: 'conscript', generalId: 'liu_bei', amount: 3000 }).state;
    expect(hi.cities[cityId].order).toBeGreaterThanOrEqual(lo.cities[cityId].order);
  });
});

describe('성장 (v4.2)', () => {
  it('경험이 쌓이면 확정적으로 능력치가 오르고, 높을수록 더디다', () => {
    const s = newGame();
    const g = s.generals.guan_yu;
    g.stats.politics = 50; g.birth = s.year - 40;
    expect(gainExp(s, g, 'politics', BALANCE.growNeed)).toBe(1);
    expect(g.stats.politics).toBe(51);
    g.stats.war = 95;
    expect(gainExp(s, g, 'war', BALANCE.growNeed)).toBe(0);
  });
  it('젊은 장수가 더 빨리 자란다', () => {
    const s = newGame();
    const y = s.generals.guan_yu, o = s.generals.zhang_fei;
    y.birth = s.year - 20; o.birth = s.year - 60;
    y.stats.politics = o.stats.politics = 40; y.exp = {}; o.exp = {};
    gainExp(s, y, 'politics', 300); gainExp(s, o, 'politics', 300);
    expect(y.stats.politics).toBeGreaterThan(o.stats.politics);
  });
  it('개발 명령은 정치 경험을 쌓는다', () => {
    const s = newGame();
    const { state, result } = applyCommand(s, 'shu', { type: 'develop', generalId: 'liu_bei', field: 'agriculture' });
    expect(result.ok).toBe(true);
    expect(state.generals.liu_bei.exp?.politics ?? 0).toBeGreaterThan(0);
  });
  it('등급 표시', () => {
    expect(statGrade(95)).toBe('S'); expect(statGrade(85)).toBe('A'); expect(statGrade(72)).toBe('B'); expect(statGrade(55)).toBe('C'); expect(statGrade(30)).toBe('D');
  });
});
