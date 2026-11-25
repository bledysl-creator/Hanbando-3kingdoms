import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, DATA, endTurn, SCENARIOS, missionProgress, citiesOf } from '../src/core';
import { rand } from '../src/core/rng/rng';
import { endTurnMut } from '../src/core/systems/turn';

const sc = SCENARIOS['197_sabun'];
const newGame = (seed = 1, player: string | null = 'shu') => createGame(DATA, sc, { seed, playerFactionId: player });

describe('데이터 무결성', () => {
  it('도로는 존재하는 도시만 잇는다', () => {
    const ids = new Set(DATA.cities.map((c) => c.id));
    for (const r of DATA.roads) {
      expect(ids.has(r.from), r.from).toBe(true);
      expect(ids.has(r.to), r.to).toBe(true);
    }
  });
  it('시나리오의 장수·도시·군주가 모두 존재한다', () => {
    const gIds = new Set(DATA.generals.map((g) => g.id));
    const cIds = new Set(DATA.cities.map((c) => c.id));
    for (const [id, g] of Object.entries(sc.generals)) {
      expect(gIds.has(id), id).toBe(true);
      expect(cIds.has(g.city), g.city).toBe(true);
    }
    for (const f of DATA.factions) expect(sc.generals[f.rulerId]?.faction).toBe(f.id);
  });
  it('모든 도시가 도로로 연결되어 있다', () => {
    const seen = new Set<string>(['hanyang']);
    const q = ['hanyang'];
    while (q.length) {
      const c = q.pop()!;
      for (const r of DATA.roads) {
        const n = r.from === c ? r.to : r.to === c ? r.from : null;
        if (n && !seen.has(n)) { seen.add(n); q.push(n); }
      }
    }
    expect(seen.size).toBe(DATA.cities.length);
  });
});

describe('난수', () => {
  it('같은 시드 → 같은 수열', () => {
    const a = { rng: 42 }, b = { rng: 42 };
    for (let i = 0; i < 10; i++) expect(rand(a)).toBe(rand(b));
  });
});

describe('명령', () => {
  it('내정: 금을 쓰고 농업이 오른다', () => {
    const s = newGame();
    const before = s.cities.hanyang.agriculture;
    const { state, result } = applyCommand(s, 'shu', { type: 'develop', generalId: 'zhuge_liang', field: 'agriculture' });
    expect(result.ok).toBe(true);
    expect(state.cities.hanyang.agriculture).toBeGreaterThan(before);
    expect(state.factions.shu.gold).toBe(s.factions.shu.gold - 300);
    expect(s.cities.hanyang.agriculture).toBe(before); // 원본 불변
  });
  it('한 장수는 한 턴에 한 번만 행동한다', () => {
    let s = newGame();
    s = applyCommand(s, 'shu', { type: 'develop', generalId: 'zhuge_liang', field: 'commerce' }).state;
    const r = applyCommand(s, 'shu', { type: 'develop', generalId: 'zhuge_liang', field: 'commerce' });
    expect(r.result.ok).toBe(false);
  });
  it('징병은 인구를 병력으로 바꾼다', () => {
    const s = newGame();
    const { state } = applyCommand(s, 'shu', { type: 'conscript', generalId: 'guan_yu', amount: 5000 });
    expect(state.cities.hanyang.troops).toBe(s.cities.hanyang.troops + 5000);
    expect(state.cities.hanyang.population).toBe(s.cities.hanyang.population - 5000);
  });
  it('남의 장수에게는 명령할 수 없다', () => {
    const s = newGame();
    expect(applyCommand(s, 'shu', { type: 'develop', generalId: 'cao_cao', field: 'commerce' }).result.ok).toBe(false);
  });
  it('출진: 압도적 병력이면 중립 도시를 함락한다', () => {
    const s = newGame();
    s.cities.naju.troops = 60000;
    s.generals.sun_qian.city = 'naju';
    const { state, result } = applyCommand(s, 'shu', { type: 'march', generalId: 'sun_qian', toCityId: 'jeju', troops: 50000 });
    expect(result.ok).toBe(true);
    expect(state.cities.jeju.owner).toBe('shu');
    expect(state.lastBattles.at(-1)?.reasons.length).toBeGreaterThan(0);
  });
  it('인접하지 않은 도시는 공격할 수 없다', () => {
    const s = newGame();
    expect(applyCommand(s, 'shu', { type: 'march', generalId: 'guan_yu', toCityId: 'busan', troops: 5000 }).result.ok).toBe(false);
  });
});

describe('턴 진행', () => {
  it('계절이 넘어가고 행동이 초기화된다', () => {
    let s = newGame();
    s = applyCommand(s, 'shu', { type: 'develop', generalId: 'zhuge_liang', field: 'commerce' }).state;
    s = endTurn(s);
    expect(s.season).toBe(1);
    expect(s.turn).toBe(2);
    expect(s.generals.zhuge_liang.acted).toBe(false);
  });
  it('결정론: 같은 시드의 관전 모드 40턴은 결과가 같다', () => {
    const run = () => {
      const s = newGame(7, null);
      for (let i = 0; i < 40 && s.outcome === 'playing'; i++) endTurnMut(s);
      return JSON.stringify(Object.values(s.cities).map((c) => [c.id, c.owner, c.troops]));
    };
    expect(run()).toBe(run());
  });
  it('관전 모드에서 AI끼리 영토가 바뀐다', () => {
    const s = newGame(3, null);
    const start = JSON.stringify(Object.values(s.cities).map((c) => c.owner));
    for (let i = 0; i < 40 && s.outcome === 'playing'; i++) endTurnMut(s);
    expect(JSON.stringify(Object.values(s.cities).map((c) => c.owner))).not.toBe(start);
  });
  it('상태는 JSON으로 저장/복원해도 같다', () => {
    const s = newGame();
    endTurnMut(s);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('임무', () => {
  it('시작 시 임무는 미완료', () => {
    const s = newGame();
    for (const m of s.missions) expect(missionProgress(s, m).done).toBe(false);
    expect(citiesOf(s, 'shu').length).toBe(7);
  });
});

describe('세력 선택 (v0.3)', () => {
  it('어느 세력으로든 시작할 수 있고 숙적 임무가 맞춰진다', () => {
    for (const [fid, rival] of Object.entries({ wei: 'shu', lu: 'wei', shu: 'wei', wu: 'shu' })) {
      const s = createGame(DATA, sc, { seed: 1, playerFactionId: fid });
      expect(s.playerFactionId).toBe(fid);
      const m = s.missions.find((x) => x.kind === 'destroy_faction');
      expect(m?.factionId).toBe(rival);
      expect(m?.label).not.toContain('{rival}');
    }
  });
  it('여포로 시작해도 명령이 동작한다', () => {
    const s = createGame(DATA, sc, { seed: 1, playerFactionId: 'lu' });
    expect(applyCommand(s, 'lu', { type: 'develop', generalId: 'chen_gong', field: 'agriculture' }).result.ok).toBe(true);
  });
});
