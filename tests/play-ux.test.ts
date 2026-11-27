// v4.2.1 플레이 편의: 맡기기(위임)·조사 교정 확장
import { describe, expect, it } from 'vitest';
import { createGame, DATA, SCENARIOS, delegate, delegateMut, DELEGATE_TYPES, fixJosa, generalsIn } from '../src/core';

const newGame = (seed = 1) => createGame(DATA, SCENARIOS['197_sabun'], { seed, playerFactionId: 'shu' });

describe('맡기기 (v4.2.1)', () => {
  it('도시 하나만 맡기면 다른 도시 장수는 그대로 대기', () => {
    const s = newGame();
    const city = s.generals[s.factions.shu.rulerId].city;
    const others = Object.values(s.generals).filter((g) => g.faction === 'shu' && !g.acted && g.city !== city).map((g) => g.id);
    const mine = Object.values(s.generals).filter((g) => g.faction === 'shu' && !g.acted && g.city === city).map((g) => g.id);
    const { state, result } = delegate(s, 'shu', city);
    expect(result.acted).toBeGreaterThan(0);
    for (const id of others) expect(state.generals[id].acted).toBe(false);
    expect(mine.filter((id) => !state.generals[id].acted).length).toBe(result.idle);
  });
  it('출진·이동·징병·귀농·계략은 하지 않는다 (병력·장수 위치 불변)', () => {
    for (const seed of [1, 2, 3]) {
      const s = newGame(seed);
      const troops = Object.fromEntries(Object.values(s.cities).map((c) => [c.id, c.troops]));
      const where = Object.fromEntries(Object.values(s.generals).filter((g) => g.faction === 'shu').map((g) => [g.id, g.city]));
      const { state } = delegate(s, 'shu');
      for (const c of Object.values(state.cities)) expect(c.troops).toBe(troops[c.id]);
      for (const [id, city] of Object.entries(where)) expect(state.generals[id].city).toBe(city);
      expect(state.lastBattles.length).toBe(s.lastBattles.length);
    }
    for (const t of ['march', 'transfer', 'conscript', 'disband', 'organize', 'rumor', 'discord', 'scout'] as const) expect(DELEGATE_TYPES.has(t)).toBe(false);
  });
  it('원래 상태는 바꾸지 않고, 같은 시드면 같은 결과 (결정론)', () => {
    const s = newGame(7);
    const snap = JSON.stringify(s);
    const a = delegate(s, 'shu');
    expect(JSON.stringify(s)).toBe(snap);
    const b = delegateMut(structuredClone(s), 'shu');
    expect(b.acted).toBe(a.result.acted);
  });
  it('남은 장수가 없으면 아무것도 하지 않는다', () => {
    const s = newGame();
    for (const g of Object.values(s.generals)) if (g.faction === 'shu') g.acted = true;
    const { state, result } = delegate(s, 'shu');
    expect(result.acted).toBe(0);
    expect(state).toBe(s);
    expect(generalsIn(s, s.generals[s.factions.shu.rulerId].city, 'shu').length).toBeGreaterThan(0);
  });
});

describe('조사 교정 확장 (v4.2.1)', () => {
  it('괄호 한자 뒤와 숫자 뒤', () => {
    expect(fixJosa('촉(蜀)이(가) 통일')).toBe('촉(蜀)이 통일');
    expect(fixJosa('위(魏)이(가) 통일')).toBe('위(魏)가 통일');
    expect(fixJosa('곡식 190,268을(를) 거둠')).toBe('곡식 190,268을 거둠');
    expect(fixJosa('금 1,005을(를)')).toBe('금 1,005를');
    expect(fixJosa('병력 3,000(으)로')).toBe('병력 3,000으로');
    expect(fixJosa('청야 철수(으)로')).toBe('청야 철수로');
  });
});

describe('맡기기 비상금 (v4.2.1)', () => {
  it('금 드는 명령으로 비상금 아래까지 쓰지 않는다', async () => {
    const { BALANCE } = await import('../src/core');
    const s = newGame(3);
    s.factions.shu.gold = BALANCE.delegateGoldKeep + 400;
    const { state } = delegate(s, 'shu');
    expect(state.factions.shu.gold).toBeGreaterThanOrEqual(BALANCE.delegateGoldKeep - 600);
  });
});
