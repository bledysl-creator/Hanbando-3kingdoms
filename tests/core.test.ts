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
import { setTreaty, statusOf, acceptanceChance, expireTreaties } from '../src/core/diplomacy/diplomacy';

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
    s.turn += 3;
    expireTreaties(s, () => {});
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

import { writeChronicle } from '../src/core';
describe('역사서 (v1.2)', () => {
  it('관전 20턴 후 역사서에 연도별 장과 큰 사건이 들어 있다', () => {
    const s = newGame(11, null);
    for (let i = 0; i < 20 && s.outcome === 'playing'; i++) endTurnMut(s);
    const md = writeChronicle(s);
    expect(md).toContain('## 197년');
    expect(md).toContain('## 201년');
    expect(s.annals.length).toBeGreaterThanOrEqual(5);
    expect(md.split('\n').some((l) => l.startsWith('- '))).toBe(true);
  });
});

import { LANDMARKS, landmarksOnRoad, landmarksOfCity } from '../src/core';
describe('지형 거점 (v1.3)', () => {
  it('고개·나루의 road는 실제 도로이고 산성·항구의 city는 실제 도시다', () => {
    for (const l of LANDMARKS) {
      if (l.road) expect(DATA.roads.some((r) => (r.from === l.road![0] && r.to === l.road![1]) || (r.from === l.road![1] && r.to === l.road![0]))).toBe(true);
      if (l.city) expect(DATA.cities.some((c) => c.id === l.city)).toBe(true);
    }
    expect(landmarksOnRoad('cheongju', 'daegu').map((l) => l.name)).toContain('조령');
  });
  it('산성이 딸린 도시는 수비력이 오르고 원인에 산성 이름이 나온다', () => {
    const s = newGame();
    expect(landmarksOfCity('hanyang', 'fortress').length).toBeGreaterThan(0);
    const base = { attackerTroops: 20000, attackerGeneral: s.generals.guan_yu, defenderGenerals: [], road: { from: 'kaesong', to: 'hanyang', type: 'river' as const }, season: 0, weather: 'clear' as const };
    const r = resolveBattle({ rng: 1 }, { ...base, defenderCity: s.cities.hanyang });
    expect(r.reasons.join()).toContain('북한산성');
    expect(r.reasons.join()).toContain('임진나루');
  });
});

import { armyReport } from '../src/core';
describe('부대 현황 (v1.5)', () => {
  it('아군 도시만 나오고 전선 도시가 먼저, 접경 적이 있으면 전선이다', () => {
    const s = newGame(3, 'shu');
    const rows = armyReport(s, 'shu');
    expect(rows.length).toBe(citiesOf(s, 'shu').length);
    expect(rows.every((r) => s.cities[r.cityId].owner === 'shu')).toBe(true);
    const firstRear = rows.findIndex((r) => r.role === 'rear');
    if (firstRear >= 0) expect(rows.slice(firstRear).every((r) => r.role === 'rear')).toBe(true);
    expect(rows.some((r) => r.role === 'front')).toBe(true);
  });
});

import { tacticChance } from '../src/core';
describe('계책 (v1.6)', () => {
  it('비 오는 날엔 화공을 못 쓰고, 매복은 고개·산악에서만 된다', () => {
    const s = newGame();
    const zhuge = Object.values(s.generals).sort((a, b) => b.stats.intellect - a.stats.intellect)[0];
    const land = { from: 'hanyang', to: 'kaesong', type: 'land' as const };
    expect(tacticChance('fire', { general: zhuge, defenders: [], weather: 'rain', road: land, target: s.cities.kaesong })).toBe(0);
    expect(tacticChance('fire', { general: zhuge, defenders: [], weather: 'clear', road: land, target: s.cities.kaesong })).toBeGreaterThan(0.5);
    expect(tacticChance('ambush', { general: zhuge, defenders: [], road: land, target: { ...s.cities.kaesong, terrain: 'plain' } })).toBe(0);
    expect(tacticChance('ambush', { general: zhuge, defenders: [], road: { ...land, type: 'pass' }, target: s.cities.kaesong })).toBeGreaterThan(0);
  });
  it('계책 결과가 전투 원인에 남는다', () => {
    const s = newGame();
    const r = resolveBattle({ rng: 5 }, { attackerTroops: 20000, attackerGeneral: s.generals.guan_yu, defenderCity: s.cities.kaesong, defenderGenerals: [], road: { from: 'hanyang', to: 'kaesong', type: 'land' }, season: 0, weather: 'clear', tactic: 'night' });
    expect(r.tactic?.kind).toBe('night');
    expect(r.reasons.join()).toContain('야습');
  });
});

import { foodPrice } from '../src/core';
describe('시장·귀농·노획 (v1.7)', () => {
  it('곡식을 사면 금이 줄고 곡식이 늘며, 가을이 봄보다 싸다', () => {
    const s = newGame(2, 'shu');
    const gid = Object.values(s.generals).find((g) => g.faction === 'shu' && g.city === 'hanyang')!.id;
    const r = applyCommand(s, 'shu', { type: 'trade', generalId: gid, action: 'buyFood', amount: 5000 });
    expect(r.result.ok).toBe(true);
    expect(r.state.factions.shu.food).toBe(s.factions.shu.food + 5000);
    expect(r.state.factions.shu.gold).toBeLessThan(s.factions.shu.gold);
    const spring = foodPrice({ ...s, season: 0 }, 'hanyang', 'buyFood');
    const autumn = foodPrice({ ...s, season: 2 }, 'hanyang', 'buyFood');
    expect(autumn).toBeLessThan(spring);
  });
  it('귀농하면 병력이 인구로 돌아간다', () => {
    const s = newGame(2, 'shu');
    const gid = Object.values(s.generals).find((g) => g.faction === 'shu' && g.city === 'hanyang')!.id;
    const r = applyCommand(s, 'shu', { type: 'disband', generalId: gid, amount: 4000 });
    expect(r.state.cities.hanyang.troops).toBe(s.cities.hanyang.troops - 4000);
    expect(r.state.cities.hanyang.population).toBe(s.cities.hanyang.population + 4000);
  });
  it('197년 시작 시 위·여는 1년 휴전 중이다', () => {
    const s = newGame(2, 'shu');
    expect(statusOf(s, 'wei', 'lu')).toBe('truce');
  });
});

import { frontDistance } from '../src/core/ai/ai';
describe('AI 병력 운용 (v1.8)', () => {
  it('전선 도시는 거리 0, 후방 도시는 1 이상이다', () => {
    const s = newGame(2, null);
    const d = frontDistance(s, 'shu');
    expect(d.hanyang).toBe(0);
    expect(Math.max(...Object.values(d))).toBeGreaterThanOrEqual(1);
  });
});

import { migrate } from '../src/save/saveRepository';
describe('실측 고도 (v1.9)', () => {
  it('혜산은 해발 900m 이상, 한양은 200m 미만이며 고지대 수비 보너스가 원인에 나온다', () => {
    const s = newGame();
    expect(s.cities.hyesan.elev!).toBeGreaterThan(900);
    expect(s.cities.hanyang.elev!).toBeLessThan(200);
    const r = resolveBattle({ rng: 1 }, { attackerTroops: 20000, attackerGeneral: s.generals.guan_yu, defenderCity: s.cities.hyesan, defenderGenerals: [], road: { from: 'hamhung', to: 'hyesan', type: 'pass' }, season: 0, weather: 'clear' });
    expect(r.reasons.join()).toContain('고지대');
  });
  it('v7 세이브를 불러오면 도시 고도가 채워진다', () => {
    const s = JSON.parse(JSON.stringify(newGame()));
    s.saveVersion = 7;
    for (const c of Object.values(s.cities) as { elev?: number }[]) delete c.elev;
    const m = migrate(s);
    expect(m.saveVersion).toBe(9);
    expect(m.cities.hyesan.elev).toBeGreaterThan(900);
  });
});

describe('수군 (v2.0)', () => {
  it('오의 항구는 전선 30척으로 시작하고, 항구 아닌 도시는 전선을 못 만든다', () => {
    const s = newGame(2, 'wu');
    expect(s.cities.busan.ships).toBe(30);
    const inland = Object.values(s.generals).find((g) => g.faction === 'wu' && !s.cities[g.city].port)!;
    expect(applyCommand(s, 'wu', { type: 'buildShips', generalId: inland.id }).result.ok).toBe(false);
  });
  it('전선이 많을수록 상륙 공격력이 높다', () => {
    const s = newGame();
    const base = { attackerTroops: 20000, attackerGeneral: s.generals.guan_yu, defenderCity: { ...s.cities.jeju, ships: 0 }, defenderGenerals: [], road: { from: 'naju', to: 'jeju', type: 'sea' as const }, season: 0, weather: 'clear' as const };
    const none = resolveBattle({ rng: 1 }, { ...base, attackerShips: 0 });
    const fleet = resolveBattle({ rng: 1 }, { ...base, attackerShips: 30 });
    expect(fleet.attackerPower).toBeGreaterThan(none.attackerPower);
    expect(fleet.reasons.join()).toContain('전선 30척');
  });
});

import { surrenderCandidate, processSurrenders } from '../src/core';
describe('귀순 (v2.1)', () => {
  it('대세가 기운 약소 AI 세력은 강국에 귀순할 수 있고, 플레이어 세력은 귀순하지 않는다', () => {
    const s = newGame(7, 'wei');
    // 여포에게 혜산 하나만 남기고 나머지를 위에 넘긴다
    for (const c of Object.values(s.cities)) if (c.owner !== 'lu' || c.id !== 'hyesan') c.owner = c.owner === 'lu' || c.owner === 'shu' || c.owner === 'wu' ? 'wei' : c.owner;
    s.cities.hyesan.troops = 1000;
    expect(surrenderCandidate(s, 'lu')?.to).toBe('wei');
    expect(surrenderCandidate(s, 'wei')).toBeNull();
    s.season = 0;
    for (let i = 0; i < 40 && s.factions.lu.alive; i++) processSurrenders(s);
    expect(s.factions.lu.alive).toBe(false);
    expect(s.cities.hyesan.owner).toBe('wei');
    expect(s.generals.lu_bu.faction).toBe('wei');
  });
});

import { outbreakChance, processEpidemics } from '../src/core';
describe('역병·구휼 (v2.3)', () => {
  it('여름 인구 많은 도시가 겨울 작은 도시보다 역병 확률이 높다', () => {
    const s = newGame();
    s.season = 1; const summer = outbreakChance(s, 'hanyang');
    s.season = 3; const winter = outbreakChance(s, 'hyesan');
    expect(summer).toBeGreaterThan(winter);
  });
  it('역병은 인구를 줄이고, 구휼하면 멈춘다', () => {
    const s = newGame(2, 'shu');
    s.cities.hanyang.epidemic = 3;
    const pop = s.cities.hanyang.population;
    processEpidemics(s);
    expect(s.cities.hanyang.population).toBeLessThan(pop);
    const gid = Object.values(s.generals).find((g) => g.faction === 'shu' && g.city === 'hanyang')!.id;
    const r = applyCommand(s, 'shu', { type: 'relief', generalId: gid });
    expect(r.result.ok).toBe(true);
    expect(r.state.cities.hanyang.epidemic).toBe(0);
  });
});

import { governorOf, processGovernors } from '../src/core';
describe('관직·태수 (v2.4)', () => {
  it('태수를 임명하면 충성이 오르고, 계절이 지나면 도시가 발전한다', () => {
    const s = newGame(4, 'shu');
    const here = Object.values(s.generals).filter((g) => g.faction === 'shu' && g.city === 'hanyang' && g.id !== s.factions.shu.rulerId);
    const t = here.sort((a, b) => b.stats.politics - a.stats.politics)[0];
    const actor = Object.values(s.generals).find((g) => g.faction === 'shu' && g.city === 'hanyang')!;
    const r = applyCommand(s, 'shu', { type: 'appoint', generalId: actor.id, targetId: t.id });
    expect(r.result.ok).toBe(true);
    expect(governorOf(r.state, 'hanyang')?.id).toBe(t.id);
    const before = r.state.cities.hanyang.agriculture + r.state.cities.hanyang.commerce;
    for (let i = 0; i < 20; i++) processGovernors(r.state);
    expect(r.state.cities.hanyang.agriculture + r.state.cities.hanyang.commerce).toBeGreaterThan(before);
  });
});

import { fixJosa } from '../src/core';
describe('조사 교정 (v2.6)', () => {
  it('받침에 따라 조사를 고른다', () => {
    expect(fixJosa('조조이(가) 한양을(를) 함락')).toBe('조조가 한양을 함락');
    expect(fixJosa('위과(와) 촉이(가) 휴전')).toBe('위와 촉이 휴전');
    expect(fixJosa('관우이(가) 서울(으)로, 춘천(으)로, 수원(으)로')).toBe('관우가 서울로, 춘천으로, 수원으로');
    expect(fixJosa('魏이(가)')).toBe('魏이(가)');
  });
});

describe('세력 특성 (v2.7)', () => {
  it('위(대군)는 같은 병력 징병에 금이 덜 든다', () => {
    const s = newGame(2, null);
    const wei = Object.values(s.generals).find((g) => g.faction === 'wei' && g.city === 'pyongyang')!;
    const shu = Object.values(s.generals).find((g) => g.faction === 'shu' && g.city === 'hanyang')!;
    const a = applyCommand(s, 'wei', { type: 'conscript', generalId: wei.id, amount: 3000 });
    const b = applyCommand(s, 'shu', { type: 'conscript', generalId: shu.id, amount: 3000 });
    expect(s.factions.wei.gold - a.state.factions.wei.gold).toBeLessThan(s.factions.shu.gold - b.state.factions.shu.gold);
  });
  it('여포(최강무력)의 공격은 원인에 특성 보너스가 나온다', () => {
    const s = newGame();
    const r = resolveBattle({ rng: 1 }, { attackerTroops: 20000, attackerGeneral: s.generals.lu_bu, defenderCity: s.cities.kaesong, defenderGenerals: [], road: { from: 'hanyang', to: 'kaesong', type: 'land' }, season: 0, weather: 'clear', traitAttack: 0.1 });
    expect(r.reasons.join()).toContain('세력 특성');
  });
});
