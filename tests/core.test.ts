import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, DATA, endTurn, SCENARIOS, missionProgress, citiesOf, minGarrison, neighbors, disbandPreview, siegesOf, siegeForecast, setSiegeResponse, pincerSources, evacuateTargets } from '../src/core';
import { rand } from '../src/core/rng/rng';
import { endTurnMut } from '../src/core/systems/turn';
import { resolveSieges } from '../src/core/systems/siege';
import { processRegionMuster } from '../src/core/systems/muster';

const sc = SCENARIOS['197_sabun'];
const neighborsOf = (s: ReturnType<typeof createGame>, id: string) => neighbors(s, id).map((n) => n.city.id);
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
    for (const f of DATA.factions.filter((x) => sc.factions[x.id])) expect(sc.generals[f.rulerId]?.faction).toBe(f.id);
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
    expect(m.saveVersion).toBe(10);
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

import { fireChance, processWildfires, igniteCity } from '../src/core';
describe('산불 (v2.8)', () => {
  it('비 오는 날엔 산불이 나지 않고, 가을 산악 도시가 겨울 평지보다 잘 난다', () => {
    const s = newGame();
    s.weather.ganggye = 'rain'; expect(fireChance(s, 'ganggye')).toBe(0);
    s.season = 2; s.weather.ganggye = 'drought'; const a = fireChance(s, 'ganggye');
    s.season = 3; s.weather.anju = 'clear'; const b = fireChance(s, 'anju');
    expect(a).toBeGreaterThan(b);
  });
  it('산불은 인구를 줄이고 비가 오면 꺼지며, 진화 명령으로도 끈다', () => {
    const s = newGame(2, 'shu');
    igniteCity(s, 'hanyang'); s.weather.hanyang = 'clear';
    const pop = s.cities.hanyang.population;
    processWildfires(s);
    expect(s.cities.hanyang.population).toBeLessThan(pop);
    s.cities.hanyang.fire = 2; s.weather.hanyang = 'rain';
    processWildfires(s);
    expect(s.cities.hanyang.fire).toBe(0);
    igniteCity(s, 'hanyang');
    const gid = Object.values(s.generals).find((g) => g.faction === 'shu' && g.city === 'hanyang')!.id;
    const r = applyCommand(s, 'shu', { type: 'extinguish', generalId: gid });
    expect(r.result.ok && r.state.cities.hanyang.fire).toBe(0);
  });
});

describe('개발자 모드 (v3.0)', () => {
  it('턴을 진행하면 AI 세력 장수마다 판단 근거가 남는다', () => {
    const s = newGame(3, 'shu');
    endTurnMut(s);
    const t = s.aiTrace ?? [];
    expect(t.length).toBeGreaterThan(5);
    expect(t.every((x) => x.faction !== 'shu')).toBe(true);
    expect(t.some((x) => x.chosen >= 0 && x.options[x.chosen].why.length > 0)).toBe(true);
  });
});

describe('모든 장수 (v3.1)', () => {
  it('장수가 150명 이상이고, 시나리오가 참조하는 장수·도시가 모두 있다', () => {
    expect(DATA.generals.length).toBeGreaterThanOrEqual(150);
    const sc = SCENARIOS['197_sabun'];
    const ids = new Set(DATA.generals.map((g) => g.id));
    const cities = new Set(DATA.cities.map((c) => c.id));
    for (const [id, v] of Object.entries(sc.generals)) { expect(ids.has(id)).toBe(true); expect(cities.has(v.city)).toBe(true); }
    for (const [id, v] of Object.entries(sc.debuts ?? {})) { expect(ids.has(id)).toBe(true); expect(cities.has(v.city)).toBe(true); }
    expect(new Set(DATA.generals.map((g) => g.id)).size).toBe(DATA.generals.length);
  });
  it('"모든 장수 등장"이면 등장 예정 장수도 처음부터 살아 있고 성인이다', () => {
    const s = createGame(DATA, SCENARIOS['197_sabun'], { seed: 1, playerFactionId: 'shu', allGenerals: true });
    const all = Object.values(s.generals);
    const sc197 = SCENARIOS['197_sabun'];
    expect(all.length).toBe(Object.keys(sc197.generals).length + Object.keys(sc197.debuts ?? {}).length);
    expect(all.every((g) => g.alive)).toBe(true);
    const debutIds = Object.keys(SCENARIOS['197_sabun'].debuts ?? {});
    expect(debutIds.every((id) => s.year - s.generals[id].birth >= 18)).toBe(true);
    expect(s.generals.jiang_wei.alive).toBe(true);
    const normal = createGame(DATA, SCENARIOS['197_sabun'], { seed: 1, playerFactionId: 'shu' });
    expect(normal.generals.jiang_wei.alive).toBe(false);
  });
});

import { canFound, REGION_GRAPH } from '../src/core';

describe('군현 지도·신군주·190년 (v3.2)', () => {
  it('군현 지도: 시·군 345곳이 모두 도시이고 길로 모두 이어진다', () => {
    const s = createGame(DATA, SCENARIOS['197_sabun'], { seed: 1, playerFactionId: 'shu', scale: 'region' });
    const ids = Object.keys(s.cities);
    expect(ids.length).toBe(345);
    expect(s.mapScale).toBe('region');
    for (const r of s.roads) { expect(s.cities[r.from]).toBeTruthy(); expect(s.cities[r.to]).toBeTruthy(); }
    const adj: Record<string, string[]> = {};
    for (const r of s.roads) { (adj[r.from] ??= []).push(r.to); (adj[r.to] ??= []).push(r.from); }
    const seen = new Set([ids[0]]); const q = [ids[0]];
    while (q.length) for (const n of adj[q.pop()!] ?? []) if (!seen.has(n)) { seen.add(n); q.push(n); }
    expect(seen.size).toBe(345);
    // 소유는 옛 관할 도시를 따르고, 군주는 치소에 있다
    for (const c of Object.values(s.cities)) expect(c.owner).toBe(SCENARIOS['197_sabun'].cities[c.parent!]?.owner ?? null);
    expect(s.cities[s.generals.liu_bei.city].seat).toBe(true);
    expect(new Set(REGION_GRAPH.cities.map((c) => c.name)).size).toBe(345);
  });
  it('군현 지도에서도 턴이 진행되고 결정론적이다', () => {
    const run = () => { let s = createGame(DATA, SCENARIOS['197_sabun'], { seed: 9, playerFactionId: null, scale: 'region' }); for (let i = 0; i < 8; i++) s = endTurn(s); return s; };
    const a = run(), b = run();
    expect(a.turn).toBe(9);
    expect(JSON.stringify(a.cities)).toBe(JSON.stringify(b.cities));
  });
  it('군현 지도에서 산성·항구 거점이 시·군에 붙는다', () => {
    const s = createGame(DATA, SCENARIOS['197_sabun'], { seed: 1, scale: 'region' });
    const n = Object.keys(s.cities).reduce((a, id) => a + landmarksOfCity(id).length, 0);
    expect(n).toBe(LANDMARKS.filter((l) => l.city).length);
  });
  it('신군주: 아무 시·군에서 아무 장수로 거병할 수 있다', () => {
    const s = createGame(DATA, SCENARIOS['197_sabun'], { seed: 1, scale: 'region', newRuler: { cityId: 'r250', generalId: 'xu_shu' } });
    expect(s.playerFactionId).toBe('neo');
    expect(s.cities.r250.owner).toBe('neo');
    expect(s.factions.neo.rulerId).toBe('xu_shu');
    expect(s.generals.xu_shu.faction).toBe('neo');
    expect(s.missions.some((m) => m.factionId === 'lu')).toBe(true); // 땅을 빼앗긴 여포가 숙적
    // 소속 장수도 독립할 수 있다 (조운이 제주에서)
    const t = createGame(DATA, SCENARIOS['197_sabun'], { seed: 1, newRuler: { cityId: 'jeju', generalId: 'zhao_yun' } });
    expect(t.generals.zhao_yun.faction).toBe('neo');
    expect(t.factions.neo.name).toBe('조');
    // 군주가 있는 도시와 이미 군주인 장수는 안 된다
    const p = createGame(DATA, SCENARIOS['197_sabun'], { seed: 1 });
    expect(canFound(p, p.generals.cao_cao.city, 'xu_shu')).not.toBeNull();
    expect(canFound(p, 'jeju', 'liu_bei')).not.toBeNull();
    expect(() => createGame(DATA, SCENARIOS['197_sabun'], { newRuler: { cityId: 'jeju', generalId: 'liu_bei' } })).toThrow();
  });
  it('190년 군웅할거: 12세력, 군주는 자기 도시에, 장수는 16세 이상', () => {
    const sc = SCENARIOS['190_gunung'];
    const s = createGame(DATA, sc, { seed: 1, playerFactionId: 'wei' });
    const fs = Object.values(s.factions);
    expect(fs.length).toBe(12);
    for (const f of fs) expect(s.cities[s.generals[f.rulerId].city].owner).toBe(f.id);
    expect(s.factions.wei.name).toBe('조');
    for (const g of Object.values(s.generals)) if (g.alive) expect(s.year - g.birth).toBeGreaterThanOrEqual(16);
    expect(Object.values(s.cities).every((c) => c.owner)).toBe(true);
    let t = s; for (let i = 0; i < 6; i++) t = endTurn(t);
    expect(t.turn).toBe(7);
    const r = createGame(DATA, sc, { seed: 1, scale: 'region' });
    expect(Object.values(r.factions).filter((f) => f.alive).length).toBe(12);
  });
});

describe('군현 지도 AI (v3.2)', () => {
  it('AI가 시·군을 실제로 빼앗는다 (후방 장수 전선 이동·병력 기준 축소)', () => {
    const s = createGame(DATA, SCENARIOS['197_sabun'], { seed: 5, playerFactionId: null, scale: 'region' });
    const before = Object.fromEntries(Object.values(s.cities).map((c) => [c.id, c.owner]));
    let t = s; for (let i = 0; i < 40; i++) t = endTurn(t);
    const changed = Object.values(t.cities).filter((c) => c.owner !== before[c.id]).length;
    expect(changed).toBeGreaterThan(20);
  });
});

import { submitCounties } from '../src/core/commands/commands';
it('치소 함락 시 장수 없는 약한 속현이 귀부한다', () => {
  const s = createGame(DATA, SCENARIOS['197_sabun'], { seed: 2, playerFactionId: null, scale: 'region' });
  const seat = Object.values(s.cities).find((c) => c.seat && c.parent === 'jeonju')!;
  for (const c of Object.values(s.cities)) if (c.parent === 'jeonju') c.troops = 500;
  for (const g of Object.values(s.generals)) if (s.cities[g.city]?.parent === 'jeonju') g.city = s.generals.liu_bei.city;
  seat.owner = 'wu';
  submitCounties(s, seat.id, 'wu', 'shu');
  const n = Object.values(s.cities).filter((c) => c.parent === 'jeonju' && c.owner === 'wu').length;
  expect(n).toBeGreaterThan(1);
});

import { lastStandBonus, hegemonOf, expectedHarvest } from '../src/core';
import { aiWantsTruce } from '../src/core/diplomacy/diplomacy';
import { processEconomy } from '../src/core/systems/turn';
describe('밸런스 장치 (v3.3)', () => {
  it('배수진: 땅이 얼마 남지 않은 세력은 수비 보너스를 받는다', () => {
    const s = createGame(DATA, SCENARIOS['197_sabun'], { seed: 1 });
    expect(lastStandBonus(s, 'shu')).toBe(1);
    for (const c of Object.values(s.cities)) if (c.owner === 'lu' && c.id !== 'hamhung') c.owner = 'wei';
    expect(lastStandBonus(s, 'lu')).toBeGreaterThan(1);
  });
  it('합종: 패자가 있으면 나머지 세력은 서로 휴전을 원한다', () => {
    const s = createGame(DATA, SCENARIOS['197_sabun'], { seed: 1 });
    s.diplomacy = {};
    for (const id of ['daegu', 'gyeongju', 'jinju', 'chuncheon', 'kaesong', 'haeju']) s.cities[id].owner = 'shu';
    expect(hegemonOf(s)).toBe('shu');
    expect(aiWantsTruce(s, 'wei', 'lu')).toBe(true);
    expect(aiWantsTruce(s, 'wei', 'shu')).toBe(false);
  });
  it('어업: 항구 도시는 계절마다 곡식을 더 얻고, AI 군량 계획에 수확이 반영된다', () => {
    const s = createGame(DATA, SCENARIOS['197_sabun'], { seed: 1 });
    s.season = 0;
    const port = Object.values(s.cities).filter((c) => c.owner === 'lu');
    const before = s.factions.lu.food;
    for (const c of port) c.troops = 0;
    processEconomy(s);
    expect(s.factions.lu.food).toBeGreaterThan(before);
    expect(expectedHarvest(s, 'lu')).toBeGreaterThan(0);
  });
});

import { generalCap } from '../src/core/state/spread';
import { rebellionChance, processRebellions } from '../src/core';
describe('v3.4 장수 편제·연의 장수·반란', () => {
  it('연의 원문 분석으로 장수가 300명 이상이고, 새 장수도 한국어 이름·능력치 범위를 지킨다', () => {
    expect(DATA.generals.length).toBeGreaterThanOrEqual(300);
    for (const id of ['cao_zhang', 'yang_xiu', 'wang_yun', 'du_yu', 'yang_hu']) {
      const g = DATA.generals.find((x) => x.id === id)!;
      expect(g).toBeTruthy();
      expect(/^[가-힣]+$/.test(g.name)).toBe(true);
      for (const v of Object.values(g.stats)) { expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(100); }
    }
    expect(DATA.generals.find((x) => x.id === 'cao_zhang')!.stats.war).toBeGreaterThanOrEqual(85); // 황수아
  });
  it('시작할 때 한 도시에 장수가 몰리지 않는다 (상한 = 올림(장수 ÷ 도시), 군주 도시 +1)', () => {
    for (const scale of ['city', 'region'] as const) {
      const s = createGame(DATA, SCENARIOS['197_sabun'], { seed: 1, scale });
      for (const f of Object.values(s.factions)) {
        const cap = generalCap(s, f.id);
        const per: Record<string, number> = {};
        for (const g of Object.values(s.generals)) if (g.alive && g.faction === f.id) per[g.city] = (per[g.city] ?? 0) + 1;
        for (const [cid, n] of Object.entries(per)) expect(n, `${f.id} ${cid}`).toBeLessThanOrEqual(cap + 1);
      }
    }
  });
  it('충성 낮고 야심 큰 장수는 군주와 떨어진 도시에서 독립할 수 있다 (의형제·군주 곁은 불가)', () => {
    const s = createGame(DATA, SCENARIOS['197_sabun'], { seed: 1, playerFactionId: null });
    const g = Object.values(s.generals).find((x) => x.alive && x.faction === 'wei' && x.city !== s.generals.cao_cao.city && x.id !== 'cao_cao')!;
    g.loyalty = 10; g.persona.ambition = 95;
    expect(rebellionChance(s, g)).toBeGreaterThan(0);
    g.city = s.generals.cao_cao.city;
    expect(rebellionChance(s, g)).toBe(0);
    expect(rebellionChance(s, s.generals.guan_yu)).toBe(0);
    // 확률을 1로 만들어 실제로 독립시킨다
    const h = Object.values(s.generals).find((x) => x.alive && x.faction === 'wei' && x.city !== s.generals.cao_cao.city && x.id !== 'cao_cao')!;
    h.loyalty = 0; h.persona.ambition = 100;
    for (const x of Object.values(s.generals)) if (x.faction === 'wei' && x.id !== h.id) x.loyalty = 100;
    s.season = 0;
    let n = 0;
    for (let i = 0; i < 30 && h.faction === 'wei'; i++) { processRebellions(s); n++; }
    expect(h.faction?.startsWith('reb')).toBe(true);
    expect(s.cities[h.city].owner).toBe(h.faction);
    expect(s.log.some((l) => l.event === 'rebel')).toBe(true);
  });
  it('성을 함락하면 그림 안내용 사건(capture)이 상대 세력과 함께 기록된다', () => {
    let s = createGame(DATA, SCENARIOS['197_sabun'], { seed: 3, playerFactionId: null });
    for (let i = 0; i < 20 && !s.log.some((l) => l.event === 'capture'); i++) s = endTurn(s);
    const e = s.log.find((l) => l.event === 'capture')!;
    expect(e).toBeTruthy();
    expect(e.factionId).not.toBe(e.other);
  });
});

describe('병력 이동 양', () => {
  it('정한 만큼만 옮기고, 넘치게 보내도 최소 수비병은 남는다', () => {
    const s = newGame(3);
    const g = Object.values(s.generals).find((x) => x.alive && x.faction === 'shu' && x.id !== s.factions.shu.rulerId
      && neighborsOf(s, x.city).some((c) => s.cities[c].owner === 'shu'))!;
    const from = g.city;
    const to = neighborsOf(s, from).find((c) => s.cities[c].owner === 'shu')!;
    s.cities[from].troops = 17500;
    const before = s.cities[to].troops;
    const r = applyCommand(s, 'shu', { type: 'transfer', generalId: g.id, toCityId: to, troops: 3000 });
    expect(r.result.ok).toBe(true);
    expect(r.state.cities[from].troops).toBe(14500);
    expect(r.state.cities[to].troops).toBe(before + 3000);
    const g2 = Object.values(r.state.generals).find((x) => x.alive && x.faction === 'shu' && x.city === from && !x.acted && x.id !== g.id)!;
    const r2 = applyCommand(r.state, 'shu', { type: 'transfer', generalId: g2.id, toCityId: to, troops: 999999 });
    expect(r2.state.cities[from].troops).toBe(minGarrison(r2.state));
  });
});

describe('귀농 미리보기·지역 특성 (v3.5)', () => {
  it('미리보기 값과 실제 귀농 결과가 같다', () => {
    const s = newGame(5);
    const g = Object.values(s.generals).find((x) => x.alive && x.faction === 'shu')!;
    const c = s.cities[g.city];
    c.troops = 20000; c.order = 60;
    const pv = disbandPreview(s, c.id, 5000);
    expect(pv.amount).toBe(5000);
    expect(pv.orderGain).toBeGreaterThan(0);
    expect(pv.foodSaved).toBe(Math.round(5000 * 0.25));
    expect(pv.harvestGain).toBeGreaterThan(0);
    const r = applyCommand(s, 'shu', { type: 'disband', generalId: g.id, amount: 5000 });
    expect(r.result.ok).toBe(true);
    expect(r.state.cities[c.id].order).toBe(pv.orderAfter);
    expect(r.state.cities[c.id].troops).toBe(15000);
    expect(disbandPreview(s, c.id, 999999).amount).toBe(20000 - minGarrison(s));
  });
  it('서울 개명·호남 농업·경상 상업·수원 성벽·북방 성벽', () => {
    const C = Object.fromEntries(DATA.cities.map((c) => [c.id, c]));
    expect(C.hanyang.name).toBe('서울');
    expect(Math.max(...DATA.cities.map((c) => c.wall))).toBe(C.suwon.wall);
    for (const id of ['jeonju', 'gwangju', 'naju']) expect(C[id].agriculture).toBeGreaterThan(C[id].commerce);
    for (const id of ['daegu', 'gyeongju', 'busan']) expect(C[id].commerce).toBeGreaterThan(C[id].agriculture);
    for (const id of ['uiju', 'ganggye', 'hyesan']) expect(C[id].wall).toBeGreaterThanOrEqual(80);
    expect(C.hanyang.population).toBe(Math.max(...DATA.cities.map((c) => c.population)));
  });
});

describe('포위와 대응 (v3.6)', () => {
  const setup = (seed = 7) => {
    const s = newGame(seed);
    s.diplomacy = {};
    s.offers = [];
    // 촉 도시와 맞닿은 위·오·여 도시에서 공격
    for (const g of Object.values(s.generals)) {
      if (!g.alive || !g.faction || g.faction === 'shu' || s.factions[g.faction].rulerId === g.id) continue;
      const target = neighbors(s, g.city).find((n) => n.city.owner === 'shu' && n.road.type !== 'sea');
      if (!target || s.cities[g.city].owner !== g.faction) continue;
      s.cities[g.city].troops = 30000;
      s.factions[g.faction].food = 999999;
      return { s, g, from: g.city, to: target.city.id, fid: g.faction };
    }
    throw new Error('공격할 장수 없음');
  };
  const march = (x: ReturnType<typeof setup>, troops = 20000) => {
    // 명령 거부를 피하려고 복종을 높인다
    x.s.generals[x.g.id].loyalty = 100;
    x.s.generals[x.g.id].persona.righteousness = 100;
    return applyCommand(x.s, x.fid, { type: 'march', generalId: x.g.id, toCityId: x.to, troops }).state;
  };
  it('AI가 플레이어 성을 치면 바로 싸우지 않고 포위하고, 출발 성에서 병력이 빠진다', () => {
    const x = setup();
    const s = march(x);
    expect(s.sieges?.length).toBe(1);
    expect(s.cities[x.to].owner).toBe('shu');
    expect(s.cities[x.from].troops).toBe(10000);
    expect(siegesOf(s, 'shu').length).toBe(1);
  });
  it('관전 모드(플레이어 없음)는 예전처럼 바로 싸운다', () => {
    const x = setup();
    x.s.playerFactionId = null;
    const s = march(x);
    expect(s.sieges ?? []).toHaveLength(0);
    expect(s.lastBattles.length).toBeGreaterThan(x.s.lastBattles.length);
  });
  it('예상 결과는 상태를 바꾸지 않고, 협공은 농성보다 지킬 확률이 높다', () => {
    const x = setup();
    const s = march(x);
    const sg = s.sieges![0];
    const rng = s.rng;
    const hold = siegeForecast(s, sg.id, { kind: 'hold' });
    expect(s.rng).toBe(rng);
    const src = pincerSources(s, sg).find((p) => p.leader);
    if (src) {
      const pin = siegeForecast(s, sg.id, { kind: 'pincer', fromCity: src.cityId, troops: src.max });
      expect(pin.holdChance).toBeGreaterThanOrEqual(hold.holdChance);
    }
    expect(siegeForecast(s, sg.id, { kind: 'sortie' }).unavailable).toBeUndefined();
  });
  it('청야 철수: 병력·장수·백성 절반이 옮겨 가고, 적은 빈 성을 얻되 노획이 없다', () => {
    const x = setup();
    let s = march(x);
    const sg = s.sieges![0];
    const dest = evacuateTargets(s, sg)[0];
    if (!dest) return; // 옮길 곳이 없는 배치면 건너뜀
    const r = setSiegeResponse(s, 'shu', sg.id, { kind: 'evacuate', toCity: dest });
    expect(r.result.ok).toBe(true);
    s = structuredClone(r.state);
    const before = { troops: s.cities[x.to].troops, destTroops: s.cities[dest].troops, pop: s.cities[x.to].population, food: s.factions[x.fid].food };
    const gens = Object.values(s.generals).filter((g) => g.alive && g.faction === 'shu' && g.city === x.to).map((g) => g.id);
    resolveSieges(s);
    expect(s.cities[x.to].owner).toBe(x.fid);
    expect(s.cities[dest].troops).toBe(before.destTroops + before.troops);
    expect(s.cities[x.to].population).toBeLessThan(before.pop * 0.6);
    expect(s.factions[x.fid].food).toBe(before.food);
    for (const id of gens) expect(s.generals[id].city).toBe(dest);
  });
  it('화친 예물이 모자라면 고를 수 없고, 고르지 않으면 농성으로 결판난다', () => {
    const x = setup();
    const s = structuredClone(march(x));
    s.factions.shu.gold = 0;
    const sg = s.sieges![0];
    expect(setSiegeResponse(s, 'shu', sg.id, { kind: 'parley' }).result.ok).toBe(false);
    s.factions.shu.gold = 999999;
    expect(setSiegeResponse(s, 'shu', sg.id, { kind: 'parley' }).result.ok).toBe(true);
    s.parleyUntil = { [x.fid]: s.turn + 3 }; // 얼마 전 화친을 받아 준 세력은 다시 응하지 않는다
    expect(setSiegeResponse(s, 'shu', sg.id, { kind: 'parley' }).result.ok).toBe(false);
    const n = s.lastBattles.length;
    resolveSieges(s);
    expect(s.lastBattles.length).toBe(n + 1);
    expect(s.lastBattles[n].reasons.some((r) => r.includes('농성'))).toBe(true);
    expect(s.sieges).toHaveLength(0);
  });
});

describe('군현 지도 진행·태수 (v3.8)', () => {
  it('태수가 없는 고을로 옮긴 장수는 자동으로 태수가 된다 (군주 제외)', () => {
    const s = newGame(11);
    const g = Object.values(s.generals).find((x) => x.alive && x.faction === 'shu' && x.id !== s.factions.shu.rulerId
      && neighbors(s, x.city).some((n) => n.city.owner === 'shu'))!;
    const to = neighbors(s, g.city).find((n) => n.city.owner === 'shu')!.city.id;
    s.cities[to].governor = undefined;
    const r = applyCommand(s, 'shu', { type: 'transfer', generalId: g.id, toCityId: to, troops: 0 });
    expect(r.result.ok).toBe(true);
    expect(r.state.cities[to].governor).toBe(g.id);
  });
  it('장수 없는 후방 현의 남는 병력은 계절마다 전선 쪽으로 모인다', () => {
    const s = createGame(DATA, sc, { seed: 3, playerFactionId: null, scale: 'region' } as never);
    const front = frontDistance(s, 'shu');
    const rear = Object.values(s.cities).find((c) => c.owner === 'shu' && (front[c.id] ?? 0) >= 2 && !Object.values(s.generals).some((g) => g.alive && g.city === c.id && g.faction === 'shu'))!;
    rear.troops = 5000;
    processRegionMuster(s);
    expect(s.cities[rear.id].troops).toBeLessThan(5000);
    expect(s.cities[rear.id].troops).toBeGreaterThanOrEqual(450);
  });
  it('군현 지도 시·군 경제 총량은 관할 도시와 같은 비율이다', () => {
    const g = REGION_GRAPH.cities as unknown as { parent: string; population: number; commerce: number }[];
    const byP: Record<string, { pop: number; com: number }> = {};
    for (const r of g) { const o = (byP[r.parent] ??= { pop: 0, com: 0 }); o.pop += r.population; o.com += r.commerce * r.population; }
    for (const c of DATA.cities) expect(Math.abs(byP[c.id].com / byP[c.id].pop - c.commerce)).toBeLessThan(1.5);
  });
});

import { formationEffect, hasHorses, bestFormation, duelPreview } from '../src/core/battle/formation';
describe('냉병기 전투 (v3.9)', () => {
  const land = { from: 'hanyang', to: 'kaesong', type: 'land' as const };
  const base = (s: ReturnType<typeof newGame>) => ({ attackerTroops: 30000, attackerGeneral: s.generals.guan_yu, defenderCity: s.cities.kaesong, defenderGenerals: [], road: land, season: 0, weather: 'clear' as const, noDuel: true });
  it('기병은 평지에 강하고 산길·큰 성에 약하다, 보병은 큰 성에 강하다', () => {
    const s = newGame();
    expect(formationEffect('cavalry', land, s.cities.kaesong, 'clear').attack).toBeGreaterThan(1);
    expect(formationEffect('cavalry', { ...land, type: 'pass' }, s.cities.chuncheon, 'clear').attack).toBeLessThan(1);
    expect(formationEffect('infantry', land, s.cities.suwon, 'clear').attack).toBeGreaterThan(1);
    expect(formationEffect('archer', { ...land, type: 'river' }, s.cities.kaesong, 'rain').reasons.join()).toContain('활시위');
  });
  it('기병은 말 산지가 있어야 꾸릴 수 있다 (여포는 관북, 촉은 없음)', () => {
    const s = newGame();
    expect(hasHorses(s, 'lu')).toBe(true);
    expect(hasHorses(s, 'shu')).toBe(false);
    s.cities.hanyang.troops = 40000;
    const r = applyCommand(s, 'shu', { type: 'march', generalId: 'guan_yu', toCityId: 'kaesong', troops: 20000, formation: 'cavalry' });
    expect(r.result.ok).toBe(false);
    expect(bestFormation(s, 'shu', land, s.cities.kaesong)).not.toBe('cavalry');
  });
  it('이긴 쪽은 적게, 진 쪽은 추격으로 크게 잃고 기병은 추격이 매섭다', () => {
    const s = newGame();
    const a = resolveBattle({ rng: 3 }, base(s));
    expect(a.won).toBe(true);
    expect(a.attackerLoss / 30000).toBeLessThan(0.15);
    expect(a.defenderLoss).toBeLessThan(s.cities.kaesong.troops);
    expect(a.phases!.pursuit).toBeGreaterThan(0);
    const c = resolveBattle({ rng: 3 }, { ...base(s), formation: 'cavalry' });
    expect(c.phases!.pursuit).toBeGreaterThan(a.phases!.pursuit);
  });
  it('함락된 성의 패잔병은 이웃 아군 성으로 달아나거나 투항한다', () => {
    const s = newGame(5, null);
    s.diplomacy = {};
    s.cities.hanyang.troops = 90000;
    s.factions.shu.food = 999999;
    s.generals.guan_yu.loyalty = 100;
    const before = Object.values(s.cities).filter((c) => c.owner === 'wei' && c.id !== 'kaesong').reduce((a, c) => a + c.troops, 0);
    const { state } = applyCommand(s, 'shu', { type: 'march', generalId: 'guan_yu', toCityId: 'kaesong', troops: 85000 });
    expect(state.cities.kaesong.owner).toBe('shu');
    const after = Object.values(state.cities).filter((c) => c.owner === 'wei').reduce((a, c) => a + c.troops, 0);
    expect(after).toBeGreaterThan(before);
    expect(state.lastBattles.at(-1)!.reasons.join()).toContain('패잔병');
  });
  it('맹장끼리 만나면 일기토가 벌어지고 무력이 높은 쪽이 자주 이긴다', () => {
    const s = newGame();
    let duels = 0, luWins = 0;
    for (let i = 1; i <= 300; i++) {
      const o = resolveBattle({ rng: i }, { ...base(s), noDuel: false, attackerGeneral: s.generals.lu_bu, defenderGenerals: [s.generals.zhang_fei] });
      if (o.duel) { duels++; if (o.duel.winnerId === 'lu_bu') luWins++; }
    }
    expect(duels).toBeGreaterThan(30);
    expect(luWins / duels).toBeGreaterThan(0.5);
    s.generals.zhang_fei.city = 'kaesong'; s.generals.zhang_fei.faction = 'wei';
    expect(duelPreview(s, s.generals.lu_bu, 'kaesong')?.champ.id).toBeDefined();
  });
  it('같은 시드면 같은 전투 결과 (결정론)', () => {
    const s = newGame();
    const x = { ...base(s), noDuel: false, attackerGeneral: s.generals.lu_bu, defenderGenerals: [s.generals.zhang_fei], formation: 'infantry' as const };
    expect(resolveBattle({ rng: 42 }, x)).toEqual(resolveBattle({ rng: 42 }, x));
  });
});
