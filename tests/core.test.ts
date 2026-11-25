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

import { respondOffer } from '../src/core';
import { setTreaty, statusOf, acceptanceChance } from '../src/core/diplomacy/diplomacy';

describe('외교 (v0.4)', () => {
  it('휴전 중인 세력은 공격할 수 없다', () => {
    const s = newGame();
    setTreaty(s, 'shu', 'wei', 'truce', 8);
    const r = applyCommand(s, 'shu', { type: 'march', generalId: 'guan_yu', toCityId: 'kaesong', troops: 10000 });
    expect(r.result.ok).toBe(false);
  });
  it('제안은 사신의 행동과 예물을 소모하고, 결과는 시드로 재현된다', () => {
    const run = () => applyCommand(newGame(5), 'shu', { type: 'diplomacy', generalId: 'zhuge_liang', targetFactionId: 'wu', proposal: 'truce', gold: 1000 });
    const a = run(), b = run();
    expect(a.result).toEqual(b.result);
    expect(a.state.generals.zhuge_liang.acted).toBe(true);
    expect(a.state.factions.shu.gold).toBe(newGame(5).factions.shu.gold - 1000);
  });
  it('예물이 많을수록 수락률이 오른다', () => {
    const s = newGame();
    expect(acceptanceChance(s, 'shu', 'wu', 'truce', 'zhuge_liang', 2000).p).toBeGreaterThan(acceptanceChance(s, 'shu', 'wu', 'truce', 'zhuge_liang', 0).p);
  });
  it('맹약 파기 후에는 다시 공격할 수 있다', () => {
    let s = newGame();
    setTreaty(s, 'shu', 'wei', 'alliance', null);
    s = applyCommand(s, 'shu', { type: 'breakTreaty', generalId: 'jian_yong', targetFactionId: 'wei' }).state;
    expect(statusOf(s, 'shu', 'wei')).toBe('war');
  });
  it('AI 제안을 받아들이면 휴전이 성립한다', () => {
    const s = newGame();
    s.offers.push({ from: 'wu', to: 'shu', proposal: 'truce', gold: 500, turn: s.turn });
    const r = respondOffer(s, 'shu', 0, true);
    expect(statusOf(r.state, 'shu', 'wu')).toBe('truce');
    expect(r.state.factions.shu.gold).toBe(s.factions.shu.gold + 500);
  });
  it('휴전은 기한이 지나면 끝난다', () => {
    const s = newGame(1, null);
    setTreaty(s, 'wei', 'lu', 'truce', 2);
    endTurnMut(s); endTurnMut(s); endTurnMut(s);
    expect(statusOf(s, 'wei', 'lu')).toBe('war');
  });
});

import regions from '../data/geo/regions.json';
describe('전국 시·군 (v0.5)', () => {
  it('330곳 이상이고 모두 존재하는 도시 관할이다', () => {
    const ids = new Set(DATA.cities.map((c) => c.id));
    expect(regions.length).toBeGreaterThanOrEqual(330);
    for (const r of regions as { parent: string; name: string }[]) expect(ids.has(r.parent), r.name).toBe(true);
  });
  it('주요 시·군이 들어 있다', () => {
    const names = new Set((regions as { name: string }[]).map((r) => r.name));
    for (const n of ['서울특별시', '부산광역시', '수원시', '안동시', '울릉군', '서귀포시', '평양', '신의주시', '함흥시', '개성시']) expect(names.has(n), n).toBe(true);
  });
});

describe('지형 고도 (v0.6)', () => {
  it('모든 시·군에 추정 고도가 있고 개마고원이 평야보다 높다', () => {
    const rs = regions as { name: string; elev: number }[];
    for (const r of rs) expect(typeof r.elev).toBe('number');
    const get = (n: string) => rs.find((r) => r.name === n)!.elev;
    expect(get('삼지연')).toBeGreaterThan(get('김제시'));
  });
});

import { rollWeather } from '../src/core/systems/weather';
import { resolveBattle } from '../src/core/battle/battle';
describe('날씨 (v0.7)', () => {
  it('모든 도시에 날씨가 있고, 겨울 북부엔 눈·한파가 잦다', () => {
    const s = newGame(9);
    expect(Object.keys(s.weather).length).toBe(DATA.cities.length);
    s.season = 3;
    let cold = 0;
    for (let i = 0; i < 50; i++) { rollWeather(s); if (['snow', 'blizzard', 'cold'].includes(s.weather.hyesan)) cold++; }
    expect(cold).toBeGreaterThan(30);
  });
  it('폭설 속 공격은 맑은 날보다 약하다', () => {
    const s = newGame();
    const base = { attackerTroops: 20000, attackerGeneral: s.generals.guan_yu, defenderCity: s.cities.kaesong, defenderGenerals: [], road: { from: 'hanyang', to: 'kaesong', type: 'land' as const }, season: 0 };
    const a = resolveBattle({ rng: 1 }, { ...base, weather: 'clear' });
    const b = resolveBattle({ rng: 1 }, { ...base, weather: 'blizzard' });
    expect(b.attackerPower).toBeLessThan(a.attackerPower);
    expect(b.reasons.join()).toContain('폭설');
  });
});

import { isConnectedToCapital } from '../src/core';
describe('사기·훈련·보급 (v0.8)', () => {
  it('훈련은 훈련도를 올리고 곡식을 쓴다', () => {
    const s = newGame();
    const { state, result } = applyCommand(s, 'shu', { type: 'train', generalId: 'guan_yu' });
    expect(result.ok).toBe(true);
    expect(state.cities.hanyang.training).toBeGreaterThan(s.cities.hanyang.training);
    expect(state.factions.shu.food).toBeLessThan(s.factions.shu.food);
  });
  it('징병하면 신병이 섞여 훈련도가 내려간다', () => {
    const s = newGame();
    const { state } = applyCommand(s, 'shu', { type: 'conscript', generalId: 'guan_yu', amount: 9000 });
    expect(state.cities.hanyang.training).toBeLessThan(s.cities.hanyang.training);
  });
  it('본거지와 끊긴 도시는 고립으로 판정된다', () => {
    const s = newGame();
    expect(isConnectedToCapital(s, 'shu', 'naju')).toBe(true);
    s.cities.gwangju.owner = 'wu'; s.cities.jeonju.owner = 'wu';
    expect(isConnectedToCapital(s, 'shu', 'naju')).toBe(false);
  });
  it('사기가 낮으면 같은 병력이라도 약하다', () => {
    const s = newGame();
    const base = { attackerTroops: 20000, attackerGeneral: s.generals.guan_yu, defenderCity: s.cities.kaesong, defenderGenerals: [], road: { from: 'hanyang', to: 'kaesong', type: 'land' as const }, season: 0, weather: 'clear' as const };
    expect(resolveBattle({ rng: 1 }, { ...base, attackerMorale: 30, attackerTraining: 20 }).attackerPower)
      .toBeLessThan(resolveBattle({ rng: 1 }, { ...base, attackerMorale: 90, attackerTraining: 90 }).attackerPower);
  });
});

import { obedience, refuseChance } from '../src/core/systems/persona';
describe('장수 인격 (v0.9)', () => {
  it('의형제와 군주는 항상 복종한다', () => {
    const s = newGame();
    expect(obedience(s, s.generals.guan_yu)).toBe(100);
    expect(refuseChance(s, s.generals.zhang_fei, 0.3)).toBe(0);
  });
  it('충성 낮고 자존심 높은 장수는 승산 낮은 출진을 거부할 수 있다', () => {
    const s = newGame(1, 'lu');
    const g = s.generals.wei_xu;
    g.loyalty = 30;
    expect(refuseChance(s, g, 0.5)).toBeGreaterThan(0.2);
    expect(refuseChance(s, g, 0.5)).toBeGreaterThan(refuseChance(s, g, 2));
  });
  it('포상은 기억으로 남는다', () => {
    const { state } = applyCommand(newGame(), 'shu', { type: 'reward', generalId: 'zhuge_liang', targetId: 'jian_yong' });
    expect(state.generals.jian_yong.memories?.at(-1)?.kind).toBe('rewarded');
  });
});

import { attemptUprising, canRise } from '../src/core';
import { processLifecycle, killGeneral } from '../src/core/systems/lifecycle';
describe('생애 (v1.0)', () => {
  it('때가 되면 새 인물이 등장한다', () => {
    const s = newGame();
    expect(s.generals.lu_meng.alive).toBe(false);
    s.year = 198; s.season = 0;
    processLifecycle(s);
    expect(s.generals.lu_meng.alive).toBe(true);
    expect(s.generals.lu_meng.faction).toBe('wu');
  });
  it('군주가 죽으면 후계자가 잇는다 (조조 → 조비 우선, 없으면 능력·관계)', () => {
    const s = newGame();
    killGeneral(s, s.generals.liu_bei, 'test');
    expect(s.factions.shu.alive).toBe(true);
    expect(s.factions.shu.rulerId).not.toBe('liu_bei');
    expect(['guan_yu', 'zhang_fei']).toContain(s.factions.shu.rulerId); // 의형제 우선
  });
  it('멸망해도 군주가 살아 있으면 재기할 수 있다', () => {
    const s = newGame(2);
    for (const c of Object.values(s.cities)) if (c.owner === 'shu') c.owner = 'wu';
    s.factions.shu.alive = false;
    for (const g of Object.values(s.generals)) if (g.faction === 'shu') g.faction = null;
    expect(canRise(s, 'shu')).toBe(true);
    s.cities.naju.troops = 3000; s.generals.liu_bei.city = 'naju';
    let ok = false;
    for (let i = 0; i < 10 && !ok; i++) { attemptUprising(s, 'shu'); ok = s.factions.shu.alive; }
    expect(ok).toBe(true);
    expect(s.cities.naju.owner).toBe('shu');
    expect(s.generals.guan_yu.faction).toBe('shu'); // 의형제가 돌아온다
  });
});

import { visibleTroops } from '../src/core';
describe('계략·첩보 (v1.1)', () => {
  it('먼 적 도시 병력은 보이지 않고, 첩보 후에는 보인다', () => {
    let s = newGame(4);
    expect(visibleTroops(s, 'shu', 'hamhung').value).toBeNull();
    expect(visibleTroops(s, 'shu', 'kaesong').exact).toBe(true); // 인접
    s = applyCommand(s, 'shu', { type: 'scout', generalId: 'guan_yu', cityId: 'pyongyang' }).state; // 한양→개성→평양? 2칸 이내 확인
    // 평양은 한양에서 3칸이므로 거부되어야 한다
    expect(visibleTroops(s, 'shu', 'pyongyang').value).toBeNull();
    s = applyCommand(s, 'shu', { type: 'scout', generalId: 'zhuge_liang', cityId: 'haeju' }).state;
    expect(visibleTroops(s, 'shu', 'haeju').value).not.toBeNull();
  });
  it('유언비어는 인접 도시에만, 성공하면 민심이 떨어진다', () => {
    const s = newGame(4);
    const r = applyCommand(s, 'shu', { type: 'rumor', generalId: 'zhuge_liang', cityId: 'kaesong' });
    expect(r.result.ok).toBe(true);
    expect(r.state.cities.kaesong.order).toBeLessThanOrEqual(s.cities.kaesong.order);
  });
  it('의형제는 이간할 수 없다', () => {
    const s = newGame(4, 'wei');
    const r = applyCommand(s, 'wei', { type: 'discord', generalId: 'xiahou_dun', targetId: 'guan_yu' });
    expect(r.result.ok && r.state.generals.guan_yu.loyalty).toBe(100);
  });
});
