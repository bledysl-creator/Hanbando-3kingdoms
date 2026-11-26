import { TACTICS, tacticChance, type TacticKind } from '../battle/tactics';
import { bestFormation, hasHorses } from '../battle/formation';
// 규칙 기반 + Utility AI (Game.md 5-5). 플레이어와 같은 명령만 사용한다.
import { BALANCE } from '../config';
import { executeCommand, foodPrice, type Command } from '../commands/commands';
import { allGenerals, freeGeneralsIn, generalsIn, minGarrison, minMarch, neighbors } from '../query';
import type { City, GameState, General, Road } from '../state/types';
import { aiWantsTruce, canAttack, statusOf, tryProposal } from '../diplomacy/diplomacy';
import { chance } from '../rng/rng';
import { estimateRatio } from '../battle/estimate';
import { reliefFood } from '../systems/epidemic';
import { governorOf } from '../systems/office';
import { log } from '../commands/commands';

interface Option { score: number; cmd: Command; why: string }

/** 적대 세력(중립 제외) 인접 병력 합 */
function threatOf(s: GameState, fid: string, cityId: string): number {
  return neighbors(s, cityId).reduce((a, n) => a + (n.city.owner && n.city.owner !== fid && statusOf(s, fid, n.city.owner) === 'war' ? n.city.troops : 0), 0);
}
function isFrontierCity(s: GameState, fid: string, cityId: string): boolean {
  return neighbors(s, cityId).some((n) => n.city.owner !== fid);
}

/** 아군 도시마다 '공격 가능한 적 도시'까지의 거리 (v1.8 후방 병력 전진용) */
let frontCache: { s: GameState; turn: number; fid: string; d: Record<string, number> } | null = null;
/** 한 세력의 AI 차례 동안은 전선 거리를 한 번만 계산한다 (v3.1 성능) */
function frontDistanceCached(s: GameState, fid: string) {
  if (!frontCache || frontCache.s !== s || frontCache.turn !== s.turn || frontCache.fid !== fid) frontCache = { s, turn: s.turn, fid, d: frontDistance(s, fid) };
  return frontCache.d;
}

export function frontDistance(s: GameState, fid: string): Record<string, number> {
  const dist: Record<string, number> = {};
  const q: string[] = [];
  for (const c of Object.values(s.cities)) {
    if (c.owner !== fid) continue;
    if (neighbors(s, c.id).some((n) => n.city.owner !== fid && canAttack(s, fid, n.city.owner))) { dist[c.id] = 0; q.push(c.id); }
  }
  while (q.length) {
    const id = q.shift()!;
    for (const n of neighbors(s, id)) {
      if (n.city.owner !== fid || dist[n.city.id] !== undefined) continue;
      dist[n.city.id] = dist[id] + 1; q.push(n.city.id);
    }
  }
  return dist;
}

/** 살아 있는 다른 세력 중 가장 강한 세력의 aiWeakShare 배보다 국력이 작으면 약소 세력 */
// v3.7 성능: 세력 단위 집계는 명령이 실제로 실행되기 전까지 바뀌지 않으므로 한 번만 계산한다
// (runFactionAI가 명령 실행마다 비움 → 결과는 캐시 없을 때와 같다)
const memo = new Map<string, unknown>();
let memoState: GameState | null = null;
function cached<T>(s: GameState, key: string, fn: () => T): T {
  if (memoState !== s) { memo.clear(); memoState = s; }
  if (!memo.has(key)) memo.set(key, fn());
  return memo.get(key) as T;
}
const clearMemo = () => memo.clear();

/** 세력별 집계를 도시·장수 한 바퀴로 구한다 (factionPower·expectedHarvest·generalCap·lastStandBonus와 같은 식, 같은 합산 순서) */
interface OwnerStat { cities: number; troops: number; econ: number; harvest: number; talent: number; gens: number }
function ownerStats(s: GameState): Record<string, OwnerStat> {
  return cached(s, 'stats', () => {
    const out: Record<string, OwnerStat> = {};
    const get = (id: string) => (out[id] ??= { cities: 0, troops: 0, econ: 0, harvest: 0, talent: 0, gens: 0 });
    for (const c of Object.values(s.cities)) {
      if (!c.owner) continue;
      const o = get(c.owner);
      o.cities++;
      o.troops += c.troops;
      o.econ += (c.agriculture + c.commerce) * (c.population / 10000);
      o.harvest += c.agriculture * (c.population / 1000) * BALANCE.harvestPerAgriculture * (0.5 + c.order / 200);
      if (c.port) o.harvest += (c.population / 1000) * BALANCE.fishPerPort1000 * 3.5 * (0.5 + c.order / 200);
    }
    for (const g of allGenerals(s)) {
      if (!g.alive || !g.faction) continue;
      const o = get(g.faction);
      o.gens++;
      o.talent += (g.stats.leadership + g.stats.war + g.stats.intellect) / 3;
    }
    return out;
  });
}
const EMPTY: OwnerStat = { cities: 0, troops: 0, econ: 0, harvest: 0, talent: 0, gens: 0 };
const statOf = (s: GameState, fid: string) => ownerStats(s)[fid] ?? EMPTY;
const powerOf = (s: GameState, fid: string) => { const o = statOf(s, fid); return Math.round(o.troops / 10 + o.econ + o.talent * 5); };
const capOf = (s: GameState, fid: string) => { const o = statOf(s, fid); return Math.max(1, Math.ceil(o.gens / Math.max(1, o.cities))); };
const lastStandOf = (s: GameState, fid: string | null) => {
  if (!fid) return 1;
  const mine = statOf(s, fid).cities;
  return mine > 0 && mine / Object.keys(s.cities).length <= BALANCE.lastStandCityShare ? 1 + BALANCE.lastStandDefense : 1;
};

function isWeak(s: GameState, fid: string) {
  const mine = powerOf(s, fid);
  const top = Math.max(0, ...Object.values(s.factions).filter((f) => f.alive && f.id !== fid).map((f) => powerOf(s, f.id)));
  return mine < top * BALANCE.aiWeakShare;
}

function optionsFor(s: GameState, fid: string, g: General): Option[] {
  const f = s.factions[fid];
  const city = s.cities[g.city];
  const ns = neighbors(s, city.id);
  const enemyNs = ns.filter((n) => n.city.owner !== fid);
  const threat = threatOf(s, fid, city.id);
  const isFrontier = enemyNs.length > 0;
  const opts: Option[] = [];
  // v3.2 군현 지도: 도시 하나의 병력·인구가 작으므로 병력 기준을 줄인다
  const K = s.mapScale === 'region' ? BALANCE.regionAiTroopScale : 1;

  // 공격
  if (isFrontier && s.season !== 3) {
    // v3.7 약소 세력은 성을 비우지 않는다: 가장 강한 세력의 일정 비율보다 약하면 접경 위협의 더 큰 몫을 남긴다
    const weak = isWeak(s, fid);
    const keepShare = weak ? BALANCE.aiWeakThreatKeep : 0.25;
    const needRatio = BALANCE.aiAttackRatio * (weak ? BALANCE.aiWeakAttackMul : 1);
    const troops = city.troops - Math.max(minGarrison(s), Math.round(threat * keepShare));
    for (const n of enemyNs) {
      if (troops < minMarch(s)) break;
      if (!canAttack(s, fid, n.city.owner)) continue;
      let ratio = estimateRatio(s, g, city, n.city, troops, lastStandOf(s, n.city.owner));
      // v3.6.1 플레이어 성은 한 계절 포위 뒤 농성·협공 등으로 맞서므로 더 넉넉한 승산을 요구한다
      if (BALANCE.siegeChoice && n.city.owner !== null && n.city.owner === s.playerFactionId) ratio /= BALANCE.siegeAiCaution;
      if (ratio > needRatio) {
        const value = (n.city.population / 10000 + n.city.agriculture / 20 + n.city.commerce / 20) * (n.city.owner === null ? 0.8 : 1);
        opts.push({ score: 50 + ratio * 10 + value, cmd: { type: 'march', generalId: g.id, toCityId: n.city.id, troops, tactic: bestTactic(s, g, n.city, n.road), formation: bestFormation(s, fid, n.road, n.city, cached(s, `horses:${fid}`, () => hasHorses(s, fid))) }, why: `승산 ${ratio.toFixed(2)}` });
      }
    }
  }
  // 징병: 위협 대비 병력이 부족할 때
  const totalT = statOf(s, fid).troops;
  // v1.7: 늘어난 병력을 3계절 먹일 곡식이 없으면 징병하지 않는다 (여포 군량 붕괴 방지)
  // v3.3: 한 해(4계절) 군량 = 지금 곡식 + 올해 예상 수확. 이것으로 못 먹이면 징병하지 않는다 (여포 군량 붕괴 원인)
  const yearFood = f.food + statOf(s, fid).harvest * BALANCE.aiHarvestTrust;
  const canFeed = (amount: number) =>
    f.food > (totalT + amount) * BALANCE.foodPerTroop * BALANCE.aiConscriptFoodSeasons && yearFood > (totalT + amount) * BALANCE.foodPerTroop * 4;
  if (isFrontier && city.troops < threat * 0.9 && f.gold > 800 && f.iron > 3000) {
    const amount = Math.min(Math.floor(city.population * 0.08), Math.floor(f.iron / BALANCE.conscriptIronPerTroop), 10000);
    if (amount >= 1000 * K && canFeed(amount)) opts.push({ score: 40 + (threat / Math.max(1, city.troops)) * 10, cmd: { type: 'conscript', generalId: g.id, amount }, why: '전선 방어 보강' });
  }
  // 공세 준비: 여유 자원이 많으면 전선에서 병력을 키운다
  if (isFrontier && f.gold > 2500 && f.iron > 5000 && f.food > totalT * 1.2) {
    const amount = Math.min(Math.floor(city.population * 0.08), Math.floor(f.iron / BALANCE.conscriptIronPerTroop), 10000);
    if (amount >= 1000 * K && canFeed(amount)) opts.push({ score: 30 + f.gold / 1000, cmd: { type: 'conscript', generalId: g.id, amount }, why: '공세 준비' });
  }
  // 병력 재배치: 여유 병력을 가장 위협받는 인접 아군 도시로
  const surplus = city.troops - Math.max(3000 * K, threat * 0.8);
  if (surplus > 3000 * K) {
    let best: { id: string; need: number } | null = null;
    for (const n of ns) {
      if (n.city.owner !== fid) continue;
      const need = Math.max(threatOf(s, fid, n.city.id) * 0.9, isFrontierCity(s, fid, n.city.id) && threat === 0 ? n.city.troops + 4000 * K : 0) - n.city.troops;
      if (need > 2000 * K && (!best || need > best.need)) best = { id: n.city.id, need };
    }
    if (best) opts.push({ score: 42 + best.need / 1000, cmd: { type: 'transfer', generalId: g.id, toCityId: best.id, troops: Math.min(surplus, best.need + 2000 * K) }, why: '병력 재배치' });
  }
  // v1.8 공세 집결: 이웃 아군 전선 도시가 노리는 적 도시를 넘을 만큼 병력을 모아 준다
  const spareHere = city.troops - Math.max(BALANCE.aiRearGarrison * K, threat * 0.8);
  if (spareHere > 2000 * K) {
    let best: { id: string; need: number } | null = null;
    for (const n of ns) {
      if (n.city.owner !== fid) continue;
      for (const t of neighbors(s, n.city.id)) {
        if (t.city.owner === fid || t.city.owner === null || !canAttack(s, fid, t.city.owner)) continue;
        const need = t.city.troops * BALANCE.aiMassFactor - n.city.troops;
        if (need > 0 && need <= spareHere + 2000 * K && (!best || need < best.need)) best = { id: n.city.id, need };
      }
    }
    if (best) opts.push({ score: 44, cmd: { type: 'transfer', generalId: g.id, toCityId: best.id, troops: Math.min(spareHere, Math.ceil(best.need)) }, why: '공세 집결' });
  }
  // v1.8 후방 병력 전진: 공격할 적이 없는 후방 도시는 여유 병력을 전선 쪽 이웃으로 보낸다 (장기전 해소)
  if (!isFrontier || !enemyNs.some((n) => canAttack(s, fid, n.city.owner))) {
    const dist = frontDistanceCached(s, fid);
    const here = dist[city.id];
    const spare = city.troops - BALANCE.aiRearGarrison * K;
    if (here !== undefined && here > 0 && spare > 2000 * K) {
      const next = ns.filter((n) => n.city.owner === fid && dist[n.city.id] !== undefined && dist[n.city.id] < here).sort((a, b) => a.city.troops - b.city.troops)[0];
      if (next) opts.push({ score: 41, cmd: { type: 'transfer', generalId: g.id, toCityId: next.city.id, troops: spare }, why: '후방 병력 전진' });
    }
  }
  // v3.2 군현 지도: 병력이 빠진 후방의 장수는 전선 쪽으로 걸어간다 (병력은 남은 만큼만)
  if (s.mapScale === 'region' && (!isFrontier || !enemyNs.some((n) => canAttack(s, fid, n.city.owner)))) {
    const dist = frontDistanceCached(s, fid);
    const here = dist[city.id];
    if (here !== undefined && here > 0) {
      const next = ns.filter((n) => n.city.owner === fid && dist[n.city.id] !== undefined && dist[n.city.id] < here).sort((a, b) => b.city.troops - a.city.troops)[0];
      // v3.8 태수는 맡은 고을을 떠나 떠돌지 않는다
      if (next && city.governor !== g.id) opts.push({ score: 16, cmd: { type: 'transfer', generalId: g.id, toCityId: next.city.id, troops: Math.max(0, city.troops - minGarrison(s) * 2) }, why: '장수 전선 이동' });
    }
  }
  // v3.4 태수 파견: 장수가 몰린 도시에서 장수가 없는 이웃 아군 도시로 한 명을 보낸다 (병력은 데려가지 않음)
  const here = generalsIn(s, city.id, fid);
  const cap = capOf(s, fid);
  if (here.length > cap && g.id !== f.rulerId && city.governor !== g.id) {
    const empty = ns.find((n) => n.city.owner === fid && generalsIn(s, n.city.id, fid).length === 0);
    if (empty) opts.push({ score: BALANCE.aiDispatchScore, cmd: { type: 'transfer', generalId: g.id, toCityId: empty.city.id, troops: 0 }, why: '태수 파견' });
    // 이웃에 빈 도시가 없어도 너무 몰렸으면 장수가 가장 적은 이웃 아군 도시로 나눈다
    else if (here.length > cap + BALANCE.aiCrowdSlack) {
      const lean = ns.filter((n) => n.city.owner === fid).map((n) => ({ id: n.city.id, k: generalsIn(s, n.city.id, fid).length })).sort((a, b) => a.k - b.k)[0];
      if (lean && lean.k < here.length - 2) opts.push({ score: BALANCE.aiDispatchScore - 3, cmd: { type: 'transfer', generalId: g.id, toCityId: lean.id, troops: 0 }, why: '장수 분산' });
    }
  }
  // v2.4 태수: 태수가 없으면 이 도시에서 정치가 가장 높은 장수(군주 제외)를 임명
  if (!governorOf(s, city.id)) {
    const cand = generalsIn(s, city.id, fid).filter((x) => x.id !== f.rulerId).sort((a, b) => b.stats.politics - a.stats.politics)[0];
    if (cand) opts.push({ score: 36, cmd: { type: 'appoint', generalId: g.id, targetId: cand.id }, why: '태수 임명' });
  }
  // v2.8 산불 진화
  if ((city.fire ?? 0) > 0 && f.gold > BALANCE.extinguishGold + 1000) opts.push({ score: 51, cmd: { type: 'extinguish', generalId: g.id }, why: '산불 진화' });
  // v2.3 구휼: 역병이 돌거나 민심이 바닥이면 곡식을 푼다
  if (((city.epidemic ?? 0) > 0 || city.order < 35) && f.food > reliefFood(s, city.id) + totalT * BALANCE.foodPerTroop * 2) {
    opts.push({ score: (city.epidemic ?? 0) > 0 ? 52 : 33, cmd: { type: 'relief', generalId: g.id }, why: '구휼' });
  }
  // v2.0 수군: 바닷길로 적과 닿은 항구는 전선을 만든다
  if (city.port && (city.ships ?? 0) < BALANCE.aiShipTarget && f.wood > 8000 && f.gold > 1500 && ns.some((n) => n.road.type === 'sea' && n.city.owner !== fid)) {
    opts.push({ score: 24 + (f.traits.includes('수군') ? 10 : 0), cmd: { type: 'buildShips', generalId: g.id }, why: '전선 건조' });
  }
  // 계략: 지력 높은 장수는 공격 대상에 유언비어·이간
  if (isFrontier && g.stats.intellect >= 80 && f.gold > 1500) {
    const tgt = enemyNs.filter((n) => n.city.owner && canAttack(s, fid, n.city.owner)).sort((a, b) => a.city.troops - b.city.troops)[0];
    if (tgt) {
      opts.push({ score: 25 + g.stats.intellect / 20, cmd: { type: 'rumor', generalId: g.id, cityId: tgt.city.id }, why: '유언비어' });
      const victim = allGenerals(s).find((x) => x.alive && x.city === tgt.city.id && x.faction === tgt.city.owner && x.loyalty < 75 && x.id !== s.factions[x.faction!].rulerId);
      if (victim) opts.push({ score: 30, cmd: { type: 'discord', generalId: g.id, targetId: victim.id }, why: '이간' });
    }
  }
  // 훈련: 전선 도시의 훈련도가 낮으면
  if (isFrontier && city.training < 65 && f.food > city.troops) {
    opts.push({ score: 26 + (65 - city.training) / 3, cmd: { type: 'train', generalId: g.id }, why: '훈련' });
  }
  // 군량: 부족하면 시장에서 사고, 그래도 모자라면 후방 병사를 귀농시킨다
  if (f.food < totalT * BALANCE.aiBuyFoodBelow) {
    const need = Math.min(BALANCE.tradeMax, Math.ceil((totalT * BALANCE.aiBuyFoodBelow - f.food) / 1000) * 1000);
    const price = foodPrice(s, city.id, 'buyFood');
    const afford = Math.floor((f.gold - 500) / price) * 1000;
    if (Math.min(need, afford) >= 1000) opts.push({ score: 55, cmd: { type: 'trade', generalId: g.id, action: 'buyFood', amount: Math.min(need, afford) }, why: '군량 매입' });
    else if (!isFrontier && city.troops > 4000 * K && (f.food < totalT * 0.3 || yearFood < totalT * BALANCE.foodPerTroop * 4 * 0.8)) opts.push({ score: 50, cmd: { type: 'disband', generalId: g.id, amount: Math.floor(city.troops * 0.4) }, why: '귀농' });
  }
  // v3.3 군량 적자 해소: 한 해 군량이 크게 모자라면 전선이라도 위협보다 많은 병력은 귀농시킨다
  const yearNeed = totalT * BALANCE.foodPerTroop * 4;
  if (yearFood < yearNeed * BALANCE.aiFoodDeficitDisband) {
    const extra = Math.floor(city.troops - Math.max(threat * 1.1, 4000 * K));
    const cut = Math.min(extra, Math.ceil((yearNeed - yearFood) / (BALANCE.foodPerTroop * 4)));
    if (cut >= 500 * K) opts.push({ score: 53, cmd: { type: 'disband', generalId: g.id, amount: cut }, why: '군량 적자 — 병력 감축' });
  }
  // 등용
  const free = freeGeneralsIn(s, city.id);
  if (free.length > 0) opts.push({ score: 45, cmd: { type: 'recruit', generalId: g.id, targetId: free[0].id }, why: '재야 인재 등용' });
  // 포상: 충성 낮은 장수
  const unhappy = generalsIn(s, city.id, fid).find((x) => x.loyalty < 55 && x.id !== f.rulerId);
  if (unhappy && f.gold > 1500) opts.push({ score: 38, cmd: { type: 'reward', generalId: g.id, targetId: unhappy.id }, why: '충성 관리' });
  // 내정
  if (f.gold > BALANCE.developGold + 200) {
    const foodRatio = f.food / Math.max(1, Object.values(s.cities).filter((c) => c.owner === fid).reduce((a, c) => a + c.troops, 0));
    const field = foodRatio < 1 ? 'agriculture' : city.commerce <= city.agriculture ? 'commerce' : 'agriculture';
    if (city[field] < 100) opts.push({ score: 20 + g.stats.politics / 10 + (foodRatio < 1 ? 10 : 0), cmd: { type: 'develop', generalId: g.id, field }, why: '내정' });
    if (isFrontier && city.wall < 90 && f.wood > 3000) opts.push({ score: 18 + g.stats.politics / 12, cmd: { type: 'develop', generalId: g.id, field: 'wall' }, why: '성벽 보수' });
  }
  return opts;
}

/** 한 세력의 이번 턴 행동을 모두 수행한다. */
export function runFactionAI(s: GameState, fid: string) {
  const f = s.factions[fid];
  if (!f?.alive) return;
  runFactionDiplomacy(s, fid);
  // 무력·통솔 높은 장수부터 (공격 기회를 먼저 잡도록)
  clearMemo();
  const gens = Object.values(s.generals)
    .filter((g) => g.alive && g.faction === fid && !g.acted)
    .sort((a, b) => b.stats.leadership + b.stats.war - (a.stats.leadership + a.stats.war));
  for (const g of gens) {
    if (g.acted || g.faction !== fid || s.cities[g.city].owner !== fid) continue;
    const opts = optionsFor(s, fid, g).sort((a, b) => b.score - a.score);
    let chosen = -1, result = '할 일 없음';
    for (let i = 0; i < opts.length; i++) {
      const r = executeCommand(s, fid, opts[i].cmd);
      clearMemo(); // 명령(거부 포함)이 상태를 바꿀 수 있으므로 집계를 다시 한다
      if (r.ok) { chosen = i; result = r.message; break; }
      result = r.error;
    }
    // v3.0 개발자 모드: 판단 근거 기록 (후보 상위 5개 + 실행 결과)
    (s.aiTrace ??= []).push({
      turn: s.turn, faction: fid, general: g.id, city: g.city, chosen, result,
      options: opts.slice(0, Math.max(5, chosen + 1)).map((o) => ({ why: o.why, score: Math.round(o.score * 10) / 10, cmd: o.cmd.type })),
    });
  }
}

/** AI 외교: 양면 전쟁이면 가장 강한 적에게 휴전을 제안한다 */
function runFactionDiplomacy(s: GameState, fid: string) {
  const f = s.factions[fid];
  if (!chance(s, BALANCE.aiProposalChance)) return;
  const target = Object.keys(s.factions).find((o) => o !== fid && s.factions[o].alive && statusOf(s, fid, o) === 'war' && aiWantsTruce(s, fid, o));
  if (!target) return;
  const envoy = Object.values(s.generals)
    .filter((g) => g.alive && g.faction === fid && !g.acted && s.cities[g.city].owner === fid && g.id !== f.rulerId)
    .sort((a, b) => b.stats.charm + b.stats.intellect - (a.stats.charm + a.stats.intellect))[0];
  if (!envoy) return;
  const gold = Math.min(Math.floor(f.gold * 0.2), 1500);
  if (target === s.playerFactionId) {
    if (s.offers.some((o) => o.from === fid)) return;
    envoy.acted = true;
    f.gold -= gold;
    s.offers.push({ from: fid, to: target, proposal: 'truce', gold, turn: s.turn });
    log(s, `${f.name}의 사신 ${envoy.name}이(가) 휴전을 청해 왔습니다.`, 'warn', target);
    return;
  }
  envoy.acted = true;
  f.gold -= gold;
  const r = tryProposal(s, fid, target, 'truce', envoy.id, gold);
  if (r.accepted) { s.factions[target].gold += gold; log(s, `${f.name}과(와) ${s.factions[target].name}이(가) 휴전을 맺었습니다.`, 'info', fid, { event: 'treaty', other: target }); }
}

/** AI도 플레이어와 같은 계책을 고른다: 성공률이 가장 높은 것, 기준 미만이면 정공법 */
function bestTactic(s: GameState, g: General, to: City, road: Road): TacticKind | undefined {
  const defenders = generalsIn(s, to.id).filter((x) => x.faction === to.owner);
  let best: { t: TacticKind; p: number } | undefined;
  for (const t of TACTICS) {
    const p = tacticChance(t.id, { general: g, defenders, weather: s.weather[to.id], road, target: to });
    if (p >= BALANCE.aiTacticMinChance && (!best || p > best.p)) best = { t: t.id, p };
  }
  return best?.t;
}
