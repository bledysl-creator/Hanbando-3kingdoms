// v3.6 포위와 대응: AI가 플레이어 도시를 치면 바로 싸우지 않고 한 계절 포위한다.
// 플레이어는 그 사이 농성·협공·출성 요격·청야 철수·화친 요청 중 하나를 고르고,
// 다음 "턴 진행" 때 고른 대응으로 결판이 난다 (고르지 않으면 농성).
import { BALANCE } from '../config';
import { resolveBattle, type BattleInput, type BattleOutcome } from '../battle/battle';
import { finishAttack, log, traitSum } from '../commands/commands';
import { acceptanceChance, canAttack, setTreaty } from '../diplomacy/diplomacy';
import { generalsIn, isConnectedToCapital, lastStandBonus, minGarrison, neighbors, roadBetween, supplyRatio } from '../query';
import { chance } from '../rng/rng';
import type { City, GameState, General, Siege, SiegeResponse } from '../state/types';
import type { TacticKind } from '../battle/tactics';
import type { FormationKind } from '../battle/formation';

export type SiegeKind = SiegeResponse['kind'];

export const SIEGE_LABEL: Record<SiegeKind, { icon: string; name: string; desc: string }> = {
  hold: { icon: '🏯', name: '농성', desc: '성문을 닫고 성벽에 기대어 지킵니다. 수비 +15%, 성 밖 농경지가 조금 짓밟힙니다.' },
  pincer: { icon: '🔀', name: '협공', desc: '이웃 아군 성에서 원군을 보내 적의 배후를 칩니다. 원군이 수비에 합류하고 적 공격력 −10%.' },
  sortie: { icon: '🐎', name: '출성 요격', desc: '성 밖으로 나가 들판에서 맞섭니다. 성벽 도움은 없지만 장수 무력이 높으면 기세가 오르고, 이기면 적을 크게 무찌릅니다.' },
  evacuate: { icon: '🔥', name: '청야 철수', desc: '병력·장수와 백성 절반을 이웃 아군 성으로 옮기고 들판과 창고를 비웁니다. 성은 내주지만 병력을 보전하고 적은 노획을 못 합니다.' },
  parley: { icon: '🕊️', name: '화친 요청', desc: '사신과 예물을 보내 철군과 휴전을 청합니다. 실패하면 예물 절반을 잃고 사기가 꺾인 채 농성합니다.' },
};

export const siegesOf = (s: GameState, factionId: string) => (s.sieges ?? []).filter((x) => s.cities[x.toCity]?.owner === factionId);

/** AI의 출진이 플레이어 도시를 노릴 때: 병력을 성 밖에 세우고 포위만 한다 */
export function beginSiege(s: GameState, factionId: string, g: General, from: City, to: City, troops: number, tactic?: TacticKind, formation?: FormationKind) {
  s.sieges ??= [];
  const sp = supplyRatio(s, factionId);
  const siege: Siege = {
    id: `sg${s.turn}_${s.sieges.length}_${g.id}`, turn: s.turn, attackerFaction: factionId, generalId: g.id, fromCity: from.id, toCity: to.id, troops, tactic, formation,
    morale: from.morale, training: from.training, ships: from.ships ?? 0,
    supply: sp < BALANCE.lowSupplyThreshold ? sp : undefined, isolated: !isConnectedToCapital(s, factionId, from.id),
  };
  s.sieges.push(siege); // 병력·군량은 출진 명령에서 이미 빠졌다
  log(s, `${s.factions[factionId].name}군 ${g.name}이(가) 병력 ${troops.toLocaleString()}명으로 ${to.name}을(를) 포위했습니다! 대응을 정하세요.`, 'danger', to.owner);
}

/** 플레이어가 대응을 고른다 (장수 행동 소모 없음) */
export function setSiegeResponseMut(s: GameState, factionId: string, siegeId: string, response: SiegeResponse): { ok: true; message: string } | { ok: false; error: string } {
  const sg = (s.sieges ?? []).find((x) => x.id === siegeId);
  if (!sg || s.cities[sg.toCity].owner !== factionId) return { ok: false, error: '포위를 찾을 수 없습니다.' };
  const why = unavailable(s, sg, response);
  if (why) return { ok: false, error: why };
  sg.response = response;
  return { ok: true, message: `${s.cities[sg.toCity].name}: 「${SIEGE_LABEL[response.kind].name}」으로 대응합니다. 턴을 넘기면 결판이 납니다.` };
}

export function setSiegeResponse(state: GameState, factionId: string, siegeId: string, response: SiegeResponse) {
  const draft = structuredClone(state);
  const r = setSiegeResponseMut(draft, factionId, siegeId, response);
  return { state: r.ok ? draft : state, result: r };
}

export const parleyGold = (sg: Siege) => Math.max(BALANCE.siegeParleyMinGold, Math.round(sg.troops * BALANCE.siegeParleyGoldPerTroop));

/** 협공에 보낼 수 있는 이웃 아군 성과 최대 병력 */
export function pincerSources(s: GameState, sg: Siege) {
  const to = s.cities[sg.toCity];
  return neighbors(s, to.id).filter((n) => n.city.owner === to.owner && n.city.troops - minGarrison(s) > 0)
    .map((n) => ({ cityId: n.city.id, max: n.city.troops - minGarrison(s), leader: bestCommander(generalsIn(s, n.city.id).filter((x) => x.faction === to.owner)) }));
}
export function evacuateTargets(s: GameState, sg: Siege) {
  const to = s.cities[sg.toCity];
  return neighbors(s, to.id).filter((n) => n.city.owner === to.owner && !(s.sieges ?? []).some((x) => x.toCity === n.city.id)).map((n) => n.city.id);
}
const bestCommander = (gs: General[]) => gs.reduce<General | null>((a, x) => (!a || x.stats.leadership + x.stats.war > a.stats.leadership + a.stats.war ? x : a), null);
const envoyOf = (s: GameState, sg: Siege) => {
  const pf = s.cities[sg.toCity].owner!;
  const here = generalsIn(s, sg.toCity).filter((x) => x.faction === pf);
  return here.reduce<General>((a, x) => (x.stats.intellect + x.stats.charm > a.stats.intellect + a.stats.charm ? x : a), s.generals[s.factions[pf].rulerId]);
};

function unavailable(s: GameState, sg: Siege, r: SiegeResponse): string | null {
  const pf = s.cities[sg.toCity].owner!;
  if (r.kind === 'pincer') {
    const src = pincerSources(s, sg).find((x) => x.cityId === r.fromCity);
    if (!src) return '원군을 보낼 수 있는 이웃 아군 성이 아닙니다.';
    if (!src.leader) return `${s.cities[r.fromCity].name}에 원군을 이끌 장수가 없습니다.`;
    if (r.troops < 100) return '원군 병력을 정하세요.';
  }
  if (r.kind === 'evacuate' && !evacuateTargets(s, sg).includes(r.toCity)) return '옮겨 갈 이웃 아군 성이 아닙니다 (포위된 성으로는 못 감).';
  if (r.kind === 'parley' && (s.parleyUntil?.[sg.attackerFaction] ?? -1) > s.turn) return `${s.factions[sg.attackerFaction].name}은(는) 얼마 전 예물을 받고 물러난 적이 있어 다시는 화친에 응하지 않습니다 (${s.parleyUntil![sg.attackerFaction] - s.turn}계절 뒤 가능).`;
  if (r.kind === 'parley' && s.factions[pf].gold < parleyGold(sg)) return `예물 금 ${parleyGold(sg).toLocaleString()}이(가) 부족합니다.`;
  return null;
}

/** 전투 입력 만들기 — 상태를 바꾸지 않는다 (예상 결과와 실제 결판이 같은 식을 쓴다) */
function siegeBattle(s: GameState, sg: Siege, r: SiegeResponse, parleyFailed = false): { input: BattleInput; city: City; pincer?: { cityId: string; troops: number; leader: General } } {
  const to = s.cities[sg.toCity];
  const g = s.generals[sg.generalId];
  const af = s.factions[sg.attackerFaction];
  const road = roadBetween(s, sg.fromCity, sg.toCity)!;
  let city: City = { ...to };
  let defenders = generalsIn(s, to.id).filter((x) => x.faction === to.owner);
  const extra: Partial<BattleInput> = {};
  let pincer: { cityId: string; troops: number; leader: General } | undefined;
  if (r.kind === 'hold' || r.kind === 'parley') {
    extra.defenseMul = BALANCE.siegeHoldDefense;
    extra.defenseReason = `농성: 성문을 닫고 굳게 지킴 +${Math.round((BALANCE.siegeHoldDefense - 1) * 100)}%`;
    if (parleyFailed) {
      city = { ...city, morale: Math.max(0, city.morale - BALANCE.siegeParleyFailMorale) };
      extra.defenseReason += ' (화친이 거절되어 사기 저하)';
    }
  } else if (r.kind === 'pincer') {
    const src = pincerSources(s, sg).find((x) => x.cityId === r.fromCity)!;
    const troops = Math.min(r.troops, src.max);
    pincer = { cityId: r.fromCity, troops, leader: src.leader! };
    city = { ...city, troops: city.troops + troops };
    defenders = [...defenders, src.leader!];
    extra.attackMul = BALANCE.siegePincerAttackMul;
    extra.attackReason = `협공: ${s.cities[r.fromCity].name}에서 온 ${src.leader!.name}의 원군 ${troops.toLocaleString()}명이 배후를 침 −${Math.round((1 - BALANCE.siegePincerAttackMul) * 100)}%`;
  } else if (r.kind === 'sortie') {
    const best = bestCommander(defenders);
    const war = best?.stats.war ?? BALANCE.neutralWar;
    const m = Math.max(0.9, Math.min(1.2, 1 + (war - 50) * BALANCE.siegeSortiePerWar));
    extra.ignoreWalls = true;
    extra.defenseMul = m;
    extra.defenseReason = `출성 요격: ${best?.name ?? '수비군'}(무력 ${war})의 기세 ${m >= 1 ? '+' : '−'}${Math.round(Math.abs(m - 1) * 100)}%`;
  }
  const input: BattleInput = {
    attackerTroops: sg.troops, attackerGeneral: g, defenderCity: city, defenderGenerals: defenders, road, season: s.season, weather: s.weather[to.id], tactic: sg.tactic, formation: sg.formation, cavalryTrait: af.traits.includes('최강무력'),
    traitAttack: traitSum(af.traits, 'attack'), attackerShips: sg.ships, navalTrait: af.traits.includes('수군'),
    attackerMorale: sg.morale, attackerTraining: sg.training, supply: sg.supply, isolated: sg.isolated, lastStand: lastStandBonus(s, to.owner), ...extra,
  };
  return { input, city, pincer };
}

export interface SiegeForecast {
  kind: SiegeKind;
  /** 성을 지킬 확률 (청야는 0) */
  holdChance: number;
  /** 화친 성공 확률 */
  parleyChance?: number;
  attackerLoss: number;
  defenderLoss: number;
  /** 줄 글로 된 예상 */
  notes: string[];
  unavailable?: string;
}

/** 대응별 예상 결과 — 같은 전투 식을 시드 고정 난수로 여러 번 돌려 평균을 낸다 (상태 불변) */
export function siegeForecast(s: GameState, siegeId: string, r: SiegeResponse): SiegeForecast {
  const sg = (s.sieges ?? []).find((x) => x.id === siegeId)!;
  const to = s.cities[sg.toCity];
  const why = unavailable(s, sg, r);
  const base: SiegeForecast = { kind: r.kind, holdChance: 0, attackerLoss: 0, defenderLoss: 0, notes: [] };
  if (why) return { ...base, unavailable: why };
  if (r.kind === 'evacuate') {
    const dest = s.cities[r.toCity];
    return {
      ...base,
      notes: [
        `${to.name}은(는) 싸우지 않고 적에게 넘어갑니다`,
        `병력 ${to.troops.toLocaleString()}명·장수 전원·백성 ${Math.round(to.population * BALANCE.siegeEvacPop).toLocaleString()}명이 ${dest.name}(으)로`,
        `남는 성은 농업 −${BALANCE.siegeEvacAgri}·상업 −${BALANCE.siegeEvacCommerce}, 적은 곡식을 노획하지 못함`,
      ],
    };
  }
  const sim = (resp: SiegeResponse, failed: boolean) => {
    const { input, city } = siegeBattle(s, sg, resp, failed);
    const h = { rng: (s.rng ^ 0x5bd1e995) | 0 };
    const n = BALANCE.siegeForecastSamples;
    let win = 0, al = 0, dl = 0;
    for (let i = 0; i < n; i++) {
      const o = resolveBattle(h, { ...input, defenderCity: city });
      const adj = adjustSortie(resp, o, sg.troops);
      if (!o.won) win++;
      al += adj.attackerLoss; dl += adj.defenderLoss;
    }
    return { holdChance: win / n, attackerLoss: Math.round(al / n), defenderLoss: Math.round(dl / n) };
  };
  if (r.kind === 'parley') {
    const pf = to.owner!;
    const p = Math.min(BALANCE.siegeParleyMax, acceptanceChance(s, pf, sg.attackerFaction, 'truce', envoyOf(s, sg).id, parleyGold(sg)).p);
    const fail = sim({ kind: 'hold' }, true);
    return {
      ...base, parleyChance: p, holdChance: p + (1 - p) * fail.holdChance, attackerLoss: Math.round((1 - p) * fail.attackerLoss), defenderLoss: Math.round((1 - p) * fail.defenderLoss),
      notes: [`예물 금 ${parleyGold(sg).toLocaleString()} · 사신 ${envoyOf(s, sg).name}`, `화친 성공 ${Math.round(p * 100)}% → 적 철군·휴전 ${BALANCE.siegeParleyTruceTurns / 4}년 (그 뒤 ${BALANCE.siegeParleyCooldown / 4}년은 다시 화친 불가)`, `실패하면 예물 절반을 잃고 농성 (지킬 확률 ${Math.round(fail.holdChance * 100)}%)`],
    };
  }
  const res = sim(r, false);
  const notes: string[] = [];
  if (r.kind === 'pincer') {
    const { pincer } = siegeBattle(s, sg, r);
    notes.push(`${s.cities[pincer!.cityId].name}의 ${pincer!.leader.name}이(가) ${pincer!.troops.toLocaleString()}명을 이끌고 합류`);
    notes.push(`${s.cities[pincer!.cityId].name}은(는) 그만큼 비게 됩니다`);
  }
  if (r.kind === 'sortie') notes.push('이기면 적 손실 ×1.5, 아군 손실 ×0.6 — 지면 성이 바로 떨어짐');
  if (r.kind === 'hold') notes.push(`성 밖 농경지 손실 농업 −${BALANCE.siegeHoldAgriLoss}`);
  return { ...base, ...res, notes };
}

function adjustSortie(r: SiegeResponse, o: BattleOutcome, attackerTroops: number) {
  if (r.kind !== 'sortie' || o.won) return o;
  return { ...o, attackerLoss: Math.min(attackerTroops, Math.round(o.attackerLoss * BALANCE.siegeSortieRout)), defenderLoss: Math.round(o.defenderLoss * BALANCE.siegeSortieSpare) };
}

/** 포위군이 물러날 곳: 출발 도시가 아직 자기 땅이면 그곳, 아니면 이웃한 자기 도시, 없으면 흩어진다 */
function returnArmy(s: GameState, sg: Siege, n: number) {
  const from = s.cities[sg.fromCity];
  if (from.owner === sg.attackerFaction) { from.troops += n; return; }
  const alt = neighbors(s, sg.toCity).map((x) => x.city).find((c) => c.owner === sg.attackerFaction);
  if (alt) alt.troops += n;
}

/** 턴을 넘길 때 (AI 행동 전) 포위를 모두 결판낸다 */
export function resolveSieges(s: GameState) {
  const list = s.sieges ?? [];
  s.sieges = [];
  for (const sg of list) {
    const to = s.cities[sg.toCity];
    const g = s.generals[sg.generalId];
    const af = s.factions[sg.attackerFaction];
    const from = s.cities[sg.fromCity];
    // 공격 측이 망했거나 장수가 떠났거나, 그새 맹약을 맺었거나, 성 주인이 바뀌었으면 포위가 풀린다
    if (!af?.alive || !g?.alive || g.faction !== sg.attackerFaction || !to.owner || to.owner === sg.attackerFaction || !canAttack(s, sg.attackerFaction, to.owner)) {
      if (to.owner === sg.attackerFaction) to.troops += sg.troops; else returnArmy(s, sg, sg.troops);
      log(s, `${to.name}의 포위가 풀렸습니다.`, 'info', to.owner);
      continue;
    }
    let r: SiegeResponse = sg.response ?? { kind: 'hold' };
    if (unavailable(s, sg, r)) r = { kind: 'hold' };
    const pf = to.owner;
    const road = roadBetween(s, sg.fromCity, sg.toCity)!;
    const back = { returnTroops: (n: number) => returnArmy(s, sg, n) };
    if (r.kind === 'parley') {
      const gold = parleyGold(sg);
      const p = Math.min(BALANCE.siegeParleyMax, acceptanceChance(s, pf, sg.attackerFaction, 'truce', envoyOf(s, sg).id, gold).p);
      if (chance(s, p)) {
        s.factions[pf].gold -= gold;
        s.factions[sg.attackerFaction].gold += gold;
        setTreaty(s, pf, sg.attackerFaction, 'truce', BALANCE.siegeParleyTruceTurns);
        (s.parleyUntil ??= {})[sg.attackerFaction] = s.turn + BALANCE.siegeParleyTruceTurns + BALANCE.siegeParleyCooldown;
        returnArmy(s, sg, sg.troops);
        log(s, `${af.name}이(가) 예물 금 ${gold.toLocaleString()}을(를) 받고 ${to.name}에서 군사를 물렸습니다. ${BALANCE.siegeParleyTruceTurns / 4}년 휴전.`, 'good', pf, { event: 'treaty', other: sg.attackerFaction });
        continue;
      }
      s.factions[pf].gold -= Math.round(gold / 2);
      log(s, `${af.name}이(가) 화친을 거절했습니다. 예물 절반을 잃고 농성합니다.`, 'warn', pf);
    }
    if (r.kind === 'evacuate') {
      const dest = s.cities[r.toCity];
      const movedPop = Math.round(to.population * BALANCE.siegeEvacPop);
      dest.troops += to.troops;
      dest.population += movedPop;
      for (const d of generalsIn(s, to.id).filter((x) => x.faction === pf)) d.city = dest.id;
      to.population -= movedPop;
      to.troops = 0;
      to.agriculture = Math.max(5, to.agriculture - BALANCE.siegeEvacAgri);
      to.commerce = Math.max(5, to.commerce - BALANCE.siegeEvacCommerce);
      log(s, `청야 철수: ${to.name}의 군민이 ${dest.name}(으)로 물러나고 들판과 창고를 비웠습니다.`, 'warn', pf);
      const empty: BattleOutcome = { attackerPower: 0, defenderPower: 0, attackerLoss: 0, defenderLoss: 0, won: true, reasons: ['청야 철수로 빈 성에 들어감 — 노획 없음'] };
      finishAttack(s, sg.attackerFaction, g, from, to, sg.troops, road, undefined, { outcome: empty, noPlunder: true, ...back });
      continue;
    }
    const failed = sg.response?.kind === 'parley';
    const { input, city, pincer } = siegeBattle(s, sg, r, failed);
    if (pincer) {
      s.cities[pincer.cityId].troops -= pincer.troops;
      to.troops += pincer.troops;
      pincer.leader.city = to.id;
    }
    if (failed) to.morale = city.morale;
    if (r.kind === 'hold' || failed) to.agriculture = Math.max(5, to.agriculture - BALANCE.siegeHoldAgriLoss);
    const label = SIEGE_LABEL[r.kind];
    finishAttack(s, sg.attackerFaction, g, from, to, sg.troops, road, sg.tactic, {
      battle: { ...input, defenderCity: to, defenderGenerals: generalsIn(s, to.id).filter((x) => x.faction === pf) },
      after: (o) => {
        const adj = adjustSortie(r, o, sg.troops);
        o.attackerLoss = adj.attackerLoss; o.defenderLoss = adj.defenderLoss;
        o.reasons.push(`우리의 대응: ${label.icon} ${label.name}`);
        if (!o.won) log(s, `${label.icon} ${label.name}으로 ${to.name}을(를) 지켜 냈습니다! (적 손실 ${o.attackerLoss.toLocaleString()})`, 'good', pf);
      },
      ...back,
    });
  }
}
