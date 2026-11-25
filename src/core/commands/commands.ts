import { igniteCity } from '../systems/wildfire';
import { fixJosa } from '../josa';
import { reliefFood } from '../systems/epidemic';
import type { TacticKind } from '../battle/tactics';
// 명령: 플레이어와 AI가 똑같이 사용한다 (CLAUDE.md 규칙 6).
import { BALANCE } from '../config';
import { resolveBattle } from '../battle/battle';
import { chance, pick } from '../rng/rng';
import { estimateRatio } from '../battle/estimate';
import { killGeneral } from '../systems/lifecycle';
import { discord, rumor, scout, withinTwo } from '../systems/intrigue';
import { generalsIn, isConnectedToCapital, lastStandBonus, minGarrison, minMarch, neighbors, roadBetween, supplyRatio } from '../query';
import type { EventKind, GameState, LogKind } from '../state/types';
import { refuseChance, remember } from '../systems/persona';
import { canAttack, pairKey, statusOf, tryProposal, type Proposal } from '../diplomacy/diplomacy';

export type DevelopField = 'agriculture' | 'commerce' | 'wall';

export type Command =
  | { type: 'develop'; generalId: string; field: DevelopField }
  | { type: 'conscript'; generalId: string; amount: number }
  | { type: 'train'; generalId: string }
  | { type: 'march'; generalId: string; toCityId: string; troops: number; tactic?: TacticKind }
  | { type: 'transfer'; generalId: string; toCityId: string; troops: number }
  | { type: 'recruit'; generalId: string; targetId: string }
  | { type: 'reward'; generalId: string; targetId: string }
  | { type: 'diplomacy'; generalId: string; targetFactionId: string; proposal: Proposal; gold: number }
  | { type: 'breakTreaty'; generalId: string; targetFactionId: string }
  | { type: 'scout'; generalId: string; cityId: string }
  | { type: 'rumor'; generalId: string; cityId: string }
  | { type: 'discord'; generalId: string; targetId: string }
  | { type: 'trade'; generalId: string; action: 'buyFood' | 'sellFood'; amount: number }
  | { type: 'disband'; generalId: string; amount: number }
  | { type: 'buildShips'; generalId: string }
  | { type: 'relief'; generalId: string }
  | { type: 'appoint'; generalId: string; targetId: string }
  | { type: 'extinguish'; generalId: string };

export type CommandResult = { ok: true; message: string } | { ok: false; error: string };

export function log(s: GameState, rawText: string, kind: LogKind = 'info', factionId: string | null = null, ev?: { event: EventKind; other?: string | null }) {
  const text = fixJosa(rawText);
  s.log.push({ turn: s.turn, year: s.year, season: s.season, text, kind, factionId, ...(ev ? { event: ev.event, other: ev.other ?? null } : {}) });
  if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
  // 큰 사건은 역사서에 남긴다
  if ((kind === 'danger' || kind === 'good') && s.chronicle) {
    s.chronicle.push({ year: s.year, season: s.season, text });
    if (s.chronicle.length > 1500) s.chronicle.splice(0, s.chronicle.length - 1500);
  }
}

/** 상태를 직접 수정한다(드래프트). UI는 applyCommand로 복사본에 적용할 것. */
export function executeCommand(s: GameState, factionId: string, cmd: Command): CommandResult {
  const g = s.generals[cmd.generalId];
  if (!g || !g.alive) return { ok: false, error: '장수를 찾을 수 없습니다.' };
  if (g.faction !== factionId) return { ok: false, error: '우리 세력 장수가 아닙니다.' };
  if (g.acted) return { ok: false, error: `${g.name}은(는) 이번 턴에 이미 행동했습니다.` };
  const city = s.cities[g.city];
  if (city.owner !== factionId) return { ok: false, error: '우리 도시에 있는 장수만 명령할 수 있습니다.' };
  const f = s.factions[factionId];

  switch (cmd.type) {
    case 'develop': {
      const isWall = cmd.field === 'wall';
      const gold = isWall ? BALANCE.wallGold : BALANCE.developGold;
      if (f.gold < gold) return { ok: false, error: '금이 부족합니다.' };
      if (isWall && f.wood < BALANCE.wallWood) return { ok: false, error: '목재가 부족합니다.' };
      if (city[cmd.field] >= 100) return { ok: false, error: '이미 최대치입니다.' };
      const gain = Math.max(1, Math.round(2 + g.stats.politics / 15));
      f.gold -= gold;
      if (isWall) f.wood -= BALANCE.wallWood;
      city[cmd.field] = Math.min(100, city[cmd.field] + gain);
      g.acted = true;
      const label = { agriculture: '농업', commerce: '상업', wall: '성벽' }[cmd.field];
      return { ok: true, message: `${g.name}이(가) ${city.name}의 ${label}을(를) ${gain} 올렸습니다.` };
    }
    case 'conscript': {
      const max = Math.floor(city.population * BALANCE.conscriptMaxPopRatio);
      const amount = Math.min(Math.floor(cmd.amount), max);
      if (amount < 100) return { ok: false, error: '징병 가능한 인구가 부족합니다.' };
      const gold = Math.ceil(amount * BALANCE.conscriptGoldPerTroop * (1 - traitSum(f.traits, 'conscriptCost')));
      const iron = Math.ceil(amount * BALANCE.conscriptIronPerTroop);
      if (f.gold < gold) return { ok: false, error: '금이 부족합니다.' };
      if (f.iron < iron) return { ok: false, error: '철이 부족합니다.' };
      f.gold -= gold;
      f.iron -= iron;
      city.population -= amount; // 병사도 결국 백성이다 — 노동력이 줄어든다
      const total = city.troops + amount;
      city.training = Math.round((city.training * city.troops + BALANCE.newRecruitTraining * amount) / total);
      city.morale = Math.round((city.morale * city.troops + BALANCE.newRecruitMorale * amount) / total);
      city.troops = total;
      city.order = Math.max(0, city.order - (amount / 1000) * BALANCE.conscriptOrderLossPer1000);
      g.acted = true;
      return { ok: true, message: `${g.name}이(가) ${city.name}에서 ${amount.toLocaleString()}명을 징병했습니다.` };
    }
    case 'train': {
      if (city.training >= 100) return { ok: false, error: '이미 최고 수준으로 훈련되었습니다.' };
      const food = Math.ceil(city.troops * BALANCE.trainFood);
      if (f.food < food) return { ok: false, error: '군량이 부족합니다.' };
      f.food -= food;
      const gain = Math.max(3, Math.round(4 + g.stats.leadership / 10));
      city.training = Math.min(100, city.training + gain);
      city.morale = Math.min(100, city.morale + 3);
      g.acted = true;
      return { ok: true, message: `${g.name}이(가) ${city.name}의 병사를 훈련했습니다. (훈련 +${gain}, 사기 +3)` };
    }
    case 'transfer': {
      const to = s.cities[cmd.toCityId];
      if (!to || to.owner !== factionId) return { ok: false, error: '우리 도시로만 이동할 수 있습니다.' };
      if (!roadBetween(s, city.id, to.id)) return { ok: false, error: '인접한 도시가 아닙니다.' };
      const troops = Math.max(0, Math.min(Math.floor(cmd.troops), city.troops - minGarrison(s)));
      city.troops -= troops;
      if (to.troops + troops > 0) {
        to.training = Math.round((to.training * to.troops + city.training * troops) / (to.troops + troops));
        to.morale = Math.round((to.morale * to.troops + city.morale * troops) / (to.troops + troops));
      }
      to.troops += troops;
      g.city = to.id;
      g.acted = true;
      return { ok: true, message: `${g.name}이(가) 병력 ${troops.toLocaleString()}명과 함께 ${to.name}(으)로 이동했습니다.` };
    }
    case 'march': {
      const to = s.cities[cmd.toCityId];
      const road = roadBetween(s, city.id, cmd.toCityId);
      if (!to || !road) return { ok: false, error: '인접한 도시가 아닙니다.' };
      if (to.owner === factionId) return { ok: false, error: '우리 도시는 공격할 수 없습니다.' };
      if (!canAttack(s, factionId, to.owner)) return { ok: false, error: `${s.factions[to.owner!].name}과(와)는 ${statusOf(s, factionId, to.owner) === 'truce' ? '휴전' : '동맹'} 중이라 공격할 수 없습니다. 먼저 맹약을 파기하세요.` };
      const troops = Math.min(Math.floor(cmd.troops), city.troops - minGarrison(s));
      if (troops < minMarch(s)) return { ok: false, error: `출진 병력은 ${minMarch(s).toLocaleString()}명 이상이어야 합니다 (도시에 ${minGarrison(s)}명은 남겨야 함).` };
      const foodNeed = Math.ceil(troops * BALANCE.foodPerTroop);
      if (f.food < foodNeed) return { ok: false, error: '군량이 부족합니다.' };
      // 장수가 명령을 거부할 수도 있다 (복종도·성향·승산)
      const pRefuse = refuseChance(s, g, estimateRatio(s, g, city, to, troops));
      if (pRefuse > 0 && chance(s, pRefuse)) {
        g.acted = true;
        g.loyalty = Math.max(0, g.loyalty - 2);
        remember(g, s.turn, 'refusedOrder', f.rulerId);
        log(s, `${g.name}이(가) ${to.name} 출진 명령을 거부했습니다.`, 'warn', factionId);
        return { ok: true, message: `${g.name}: "이 싸움은 따를 수 없습니다." — 명령 거부 (거부 확률 ${Math.round(pRefuse * 100)}%)` };
      }
      f.food -= foodNeed;
      city.troops -= troops;
      g.acted = true;

      const defenderFaction = to.owner;
      const defenders = generalsIn(s, to.id).filter((x) => x.faction === defenderFaction);
      const out = resolveBattle(s, {
        attackerTroops: troops, attackerGeneral: g, defenderCity: to, defenderGenerals: defenders, road, season: s.season, weather: s.weather[to.id], tactic: cmd.tactic, traitAttack: traitSum(f.traits, 'attack'), attackerShips: city.ships ?? 0, navalTrait: f.traits.includes('수군'),
        attackerMorale: city.morale, attackerTraining: city.training, supply: supplyRatio(s, factionId) < BALANCE.lowSupplyThreshold ? supplyRatio(s, factionId) : undefined,
        isolated: !isConnectedToCapital(s, factionId, city.id),
        lastStand: lastStandBonus(s, defenderFaction),
      });
      s.lastBattles.push({
        turn: s.turn, attackerFaction: factionId, defenderFaction, fromCity: city.id, toCity: to.id, generalId: g.id,
        attackerTroops: troops, defenderTroops: to.troops, ...out,
      });
      if (s.lastBattles.length > 30) s.lastBattles.splice(0, s.lastBattles.length - 30);

      const survivors = troops - out.attackerLoss;
      const defName = defenderFaction ? s.factions[defenderFaction].name : '중립';
      if (out.tactic?.kind === 'fire' && out.tactic.success) { igniteCity(s, to.id, 1); out.reasons.push(`화공의 불길이 ${to.name} 일대로 번졌습니다`); }
      if (out.won) {
        to.troops = survivors;
        to.morale = Math.min(100, city.morale + BALANCE.victoryMorale);
        to.training = city.training;
        if (to.port) {
          // 항구 함락: 남은 전선 절반을 노획하고, 바다로 왔다면 함대 절반이 따라 들어간다
          const moved = road.type === 'sea' ? Math.floor((city.ships ?? 0) / 2) : 0;
          city.ships = (city.ships ?? 0) - moved;
          to.ships = Math.min(BALANCE.maxShipsPerCity, Math.floor((to.ships ?? 0) / 2) + moved);
        }
        if (defenderFaction) {
          const dPop = Object.values(s.cities).filter((c) => c.owner === defenderFaction).reduce((a, c) => a + c.population, 0);
          const df = s.factions[defenderFaction];
          const loot = Math.round(df.food * (to.population / Math.max(1, dPop)) * BALANCE.plunderRatio);
          if (loot > 0) { df.food -= loot; f.food += loot; out.reasons.push(`${to.name}의 창고에서 곡식 ${loot.toLocaleString()}석 노획`); }
        }
        to.owner = factionId;
        to.order = Math.max(10, to.order - 20);
        to.population = Math.round(to.population * 0.95);
        g.city = to.id;
        // 패배한 수비 장수: 인접 아군 도시로 퇴각, 없으면 재야
        remember(g, s.turn, 'defeated', defenders[0]?.id ?? g.id);
        for (const d of defenders) {
          remember(d, s.turn, 'defeatedBy', g.id);
          const retreat = defenderFaction
            ? pick(s, neighbors(s, to.id).filter((n) => n.city.owner === defenderFaction).map((n) => n.city.id))
            : undefined;
          if (retreat) d.city = retreat;
          else if (d.faction && s.factions[d.faction]?.rulerId !== d.id) d.faction = null;
          else if (d.faction) d.faction = null; // 군주도 도망칠 곳이 없으면 재야로
        }
        log(s, `${s.factions[factionId].name}군 ${g.name}이(가) ${defName}의 ${to.name}을(를) 함락했습니다!`, 'danger', factionId, { event: 'capture', other: defenderFaction });
        if (to.seat && defenderFaction) submitCounties(s, to.id, factionId, defenderFaction);
        checkFactionDestroyed(s, defenderFaction);
        return { ok: true, message: `${to.name} 함락! (아군 손실 ${out.attackerLoss.toLocaleString()})` };
      } else {
        to.troops = Math.max(1, to.troops - out.defenderLoss);
        to.morale = Math.min(100, to.morale + 5);
        city.troops += survivors;
        city.morale = Math.max(0, city.morale - BALANCE.defeatMorale);
        if (road.type === 'sea' && (city.ships ?? 0) > 0) city.ships = Math.floor((city.ships ?? 0) * (1 - BALANCE.shipLossOnFail));
        if (chance(s, BALANCE.battleDeathChance * (g.persona.risk / 60))) {
          killGeneral(s, g, `${g.name}이(가) ${to.name} 공격 중 전사했습니다!`);
        }
        log(s, `${g.name}의 ${to.name} 공격이 실패했습니다.`, 'warn', factionId);
        return { ok: true, message: `${to.name} 공격 실패 (아군 손실 ${out.attackerLoss.toLocaleString()})` };
      }
    }
    case 'recruit': {
      const t = s.generals[cmd.targetId];
      if (!t || !t.alive || t.faction !== null) return { ok: false, error: '등용할 수 있는 재야 장수가 아닙니다.' };
      if (t.city !== g.city) return { ok: false, error: '같은 도시에 있어야 등용할 수 있습니다.' };
      const ruler = s.generals[f.rulerId];
      // 이 세력 장수에게 패한 기억이 있으면 마음을 열지 않는다
      const grudge = (t.memories ?? []).some((m) => m.kind === 'defeatedBy' && s.generals[m.with]?.faction === factionId) ? BALANCE.grudgeRecruitPenalty : 0;
      const p = Math.min(0.9, Math.max(0.1,
        (g.stats.charm - 30 + ((ruler?.stats.charm ?? 50) - 50) / 2 - (t.persona.pride - 50) / 3) / 100 - grudge + traitSum(f.traits, 'recruit')));
      g.acted = true;
      if (chance(s, p)) {
        t.faction = factionId;
        t.loyalty = Math.round(60 + g.stats.charm / 5);
        remember(t, s.turn, 'recruitedBy', g.id);
        s.recruits[factionId] = (s.recruits[factionId] ?? 0) + 1;
        log(s, `${t.name}이(가) ${f.name}군에 합류했습니다.`, 'good', factionId);
        return { ok: true, message: `${t.name} 등용 성공!` };
      }
      return { ok: true, message: `${t.name}이(가) 등용을 거절했습니다. (성공률 ${Math.round(p * 100)}%)` };
    }
    case 'extinguish': {
      if (!(city.fire ?? 0)) return { ok: false, error: '이 도시에는 산불이 없습니다.' };
      if (f.gold < BALANCE.extinguishGold) return { ok: false, error: `금 ${BALANCE.extinguishGold}이 필요합니다.` };
      f.gold -= BALANCE.extinguishGold;
      city.fire = 0;
      city.order = Math.min(100, city.order + 2);
      g.acted = true;
      log(s, `${g.name}이(가) 백성을 이끌고 ${city.name}의 산불을 껐습니다.`, 'good', factionId);
      return { ok: true, message: `${city.name}의 산불을 진화했습니다. (민심 +2)` };
    }
    case 'appoint': {
      const t = s.generals[cmd.targetId];
      if (!t || !t.alive || t.faction !== factionId || t.city !== city.id) return { ok: false, error: '이 도시에 있는 우리 장수만 태수로 임명할 수 있습니다.' };
      if (city.governor === t.id) return { ok: false, error: '이미 태수입니다.' };
      const prev = city.governor;
      city.governor = t.id;
      if (prev !== t.id) t.loyalty = Math.min(100, t.loyalty + BALANCE.governorLoyalty);
      g.acted = true;
      return { ok: true, message: `${t.name}을(를) ${city.name} 태수로 임명했습니다. (충성 +${BALANCE.governorLoyalty})` };
    }
    case 'relief': {
      const food = reliefFood(s, city.id);
      if (f.food < food) return { ok: false, error: `곡식 ${food.toLocaleString()}석이 필요합니다.` };
      if (!city.epidemic && city.order >= 95) return { ok: false, error: '구휼할 필요가 없습니다.' };
      f.food -= food;
      const cured = (city.epidemic ?? 0) > 0;
      city.epidemic = 0;
      city.order = Math.min(100, city.order + BALANCE.reliefOrder);
      g.acted = true;
      if (cured) log(s, `${g.name}이(가) ${city.name}을(를) 구휼해 역병을 잡았습니다.`, 'good', factionId);
      return { ok: true, message: `${city.name} 백성에게 곡식 ${food.toLocaleString()}석을 풀었습니다. (민심 +${BALANCE.reliefOrder}${cured ? ', 역병 진정' : ''})` };
    }
    case 'buildShips': {
      if (!city.port) return { ok: false, error: '항구가 있는 도시에서만 전선을 만들 수 있습니다.' };
      const have = city.ships ?? 0;
      const n = Math.min(BALANCE.shipsPerBuild, BALANCE.maxShipsPerCity - have);
      if (n <= 0) return { ok: false, error: `이 항구에는 더 이상 전선을 둘 수 없습니다 (최대 ${BALANCE.maxShipsPerCity}척).` };
      const naval = f.traits.includes('수군') ? 0.7 : 1;
      const wood = Math.round(n * BALANCE.shipWood * naval), gold = Math.round(n * BALANCE.shipGold * naval);
      if (f.wood < wood || f.gold < gold) return { ok: false, error: `목재 ${wood.toLocaleString()} · 금 ${gold.toLocaleString()}이 필요합니다.` };
      f.wood -= wood; f.gold -= gold;
      city.ships = have + n;
      g.acted = true;
      return { ok: true, message: `${city.name}에서 전선 ${n}척을 건조했습니다. (보유 ${city.ships}척)` };
    }
    case 'trade': {
      const amount = Math.min(BALANCE.tradeMax, Math.max(0, Math.floor(cmd.amount / 1000) * 1000));
      if (amount < 1000) return { ok: false, error: '1,000석 단위로 거래합니다.' };
      const tm = traitSum(f.traits, 'market');
      const price = Math.round(foodPrice(s, city.id, cmd.action) * (cmd.action === 'buyFood' ? 1 - tm : 1 + tm));
      const gold = Math.round((amount / 1000) * price);
      if (cmd.action === 'buyFood') {
        if (f.gold < gold) return { ok: false, error: '금이 부족합니다.' };
        f.gold -= gold; f.food += amount;
      } else {
        if (f.food < amount) return { ok: false, error: '곡식이 부족합니다.' };
        f.food -= amount; f.gold += gold;
      }
      g.acted = true;
      return { ok: true, message: `${city.name} 시장에서 곡식 ${amount.toLocaleString()}석을 ${cmd.action === 'buyFood' ? '사들였' : '팔았'}습니다. (금 ${gold.toLocaleString()})` };
    }
    case 'disband': {
      const pv = disbandPreview(s, city.id, cmd.amount);
      if (pv.amount < 100) return { ok: false, error: `돌려보낼 병사가 없습니다 (${minGarrison(s).toLocaleString()}명은 남겨야 함).` };
      city.troops -= pv.amount;
      city.population += pv.amount;
      city.order = pv.orderAfter;
      g.acted = true;
      return { ok: true, message: `병사 ${pv.amount.toLocaleString()}명이 고향으로 돌아가 농사를 짓습니다. (인구 +${pv.amount.toLocaleString()}, 민심 +${pv.orderGain}, 군량 계절마다 ${pv.foodSaved.toLocaleString()} 절약, 가을 수확 +${pv.harvestGain.toLocaleString()})` };
    }
    case 'reward': {
      const t = s.generals[cmd.targetId];
      if (!t || t.faction !== factionId) return { ok: false, error: '우리 장수가 아닙니다.' };
      if (f.gold < BALANCE.rewardGold) return { ok: false, error: '금이 부족합니다.' };
      f.gold -= BALANCE.rewardGold;
      t.loyalty = Math.min(100, t.loyalty + BALANCE.rewardLoyalty + traitSum(f.traits, 'rewardLoyalty'));
      remember(t, s.turn, 'rewarded', f.rulerId);
      g.acted = true;
      return { ok: true, message: `${t.name}에게 포상했습니다. (충성 ${t.loyalty})` };
    }
    case 'diplomacy': {
      const t = s.factions[cmd.targetFactionId];
      if (!t || !t.alive || t.id === factionId) return { ok: false, error: '외교 상대가 아닙니다.' };
      const cur = statusOf(s, factionId, t.id);
      if (cur === cmd.proposal) return { ok: false, error: '이미 맺은 맹약입니다.' };
      if (cur === 'alliance') return { ok: false, error: '이미 동맹 중입니다.' };
      const gold = Math.max(0, Math.floor(cmd.gold));
      if (f.gold < gold) return { ok: false, error: '금이 부족합니다.' };
      f.gold -= gold;
      g.acted = true;
      const r = tryProposal(s, factionId, t.id, cmd.proposal, g.id, gold);
      const what = cmd.proposal === 'truce' ? '휴전' : '동맹';
      if (r.accepted) {
        if (gold > 0) t.gold += gold;
        log(s, `${f.name}과(와) ${t.name}이(가) ${what}을 맺었습니다.`, 'good', factionId);
        return { ok: true, message: `${t.name}이(가) ${what}을 받아들였습니다! (수락률 ${Math.round(r.p * 100)}%)` };
      }
      log(s, `${t.name}이(가) ${f.name}의 ${what} 제안을 거절했습니다.`, 'warn', factionId);
      return { ok: true, message: `${t.name}이(가) 거절했습니다. 예물은 돌려받지 못했습니다. (수락률 ${Math.round(r.p * 100)}%)` };
    }
    case 'scout':
    case 'rumor': {
      const t = s.cities[cmd.cityId];
      if (!t || t.owner === factionId) return { ok: false, error: '적 또는 중립 도시를 골라야 합니다.' };
      const cost = cmd.type === 'scout' ? BALANCE.scoutGold : BALANCE.rumorGold;
      if (f.gold < cost) return { ok: false, error: '금이 부족합니다.' };
      if (cmd.type === 'scout' ? !withinTwo(s, city.id, t.id) : !roadBetween(s, city.id, t.id)) return { ok: false, error: cmd.type === 'scout' ? '두 칸 이내 도시만 정찰할 수 있습니다.' : '인접 도시에만 유언비어를 퍼뜨릴 수 있습니다.' };
      f.gold -= cost;
      g.acted = true;
      const r = cmd.type === 'scout' ? scout(s, g, t.id) : rumor(s, g, t.id);
      if (cmd.type === 'rumor' && r.ok && t.owner) log(s, `${t.name}에 ${f.name}이(가) 퍼뜨린 유언비어가 돌고 있습니다.`, 'warn', t.owner);
      return { ok: true, message: r.message };
    }
    case 'discord': {
      const t = s.generals[cmd.targetId];
      if (!t || !t.alive || !t.faction || t.faction === factionId) return { ok: false, error: '적 장수를 골라야 합니다.' };
      if (t.city !== city.id && !roadBetween(s, city.id, t.city)) return { ok: false, error: '인접 도시의 장수만 이간할 수 있습니다.' };
      if (f.gold < BALANCE.discordGold) return { ok: false, error: '금이 부족합니다.' };
      f.gold -= BALANCE.discordGold;
      g.acted = true;
      return { ok: true, message: discord(s, g, t).message };
    }
    case 'breakTreaty': {
      const t = s.factions[cmd.targetFactionId];
      if (!t || statusOf(s, factionId, t.id) === 'war') return { ok: false, error: '맺은 맹약이 없습니다.' };
      delete s.diplomacy[pairKey(factionId, t.id)];
      g.acted = true;
      // 신의를 저버리면 의리 높은 장수들이 실망한다
      for (const x of Object.values(s.generals)) {
        if (x.faction === factionId && x.id !== f.rulerId && x.persona.righteousness >= 80) x.loyalty = Math.max(0, x.loyalty - BALANCE.breakTreatyLoyaltyLoss);
      }
      log(s, `${f.name}이(가) ${t.name}과(와)의 맹약을 깨고 선전포고했습니다!`, 'danger', factionId);
      return { ok: true, message: `${t.name}에 선전포고했습니다. 의리를 중시하는 장수들이 실망했습니다.` };
    }
  }
}

/** 군현 지도(v3.2): 치소가 함락되면 장수 없는 같은 관할의 속현이 확률적으로 귀부한다 */
export function submitCounties(s: GameState, seatId: string, to: string, from: string) {
  const seat = s.cities[seatId];
  const names: string[] = [];
  for (const c of Object.values(s.cities)) {
    if (c.id === seatId || c.parent !== seat.parent || c.owner !== from) continue;
    if (c.troops > BALANCE.regionSubmitMaxTroops || Object.values(s.generals).some((x) => x.alive && x.city === c.id && x.faction === from)) continue;
    if (!chance(s, BALANCE.regionSubmitChance)) continue;
    c.owner = to;
    c.troops = Math.round(c.troops * BALANCE.regionSubmitTroopKeep);
    c.order = Math.max(10, c.order - 10);
    c.governor = undefined;
    names.push(c.name);
  }
  if (names.length) log(s, `${seat.name} 함락 소식에 ${names.join('·')}이(가) ${s.factions[to].name}에 귀부했습니다.`, 'warn', to);
}

export function checkFactionDestroyed(s: GameState, factionId: string | null) {
  if (!factionId) return;
  const f = s.factions[factionId];
  if (!f || !f.alive) return;
  if (Object.values(s.cities).some((c) => c.owner === factionId)) return;
  f.alive = false;
  for (const g of Object.values(s.generals)) if (g.faction === factionId) g.faction = null;
  log(s, `${f.name}(${f.hanja}) 세력이 멸망했습니다.`, 'danger', factionId, { event: 'destroyed' });
}

/** 불변 버전: 상태를 복사해 명령을 적용한다. */
export function applyCommand(state: GameState, factionId: string, cmd: Command): { state: GameState; result: CommandResult } {
  const draft = structuredClone(state);
  const raw = executeCommand(draft, factionId, cmd);
  const result: CommandResult = raw.ok ? { ok: true, message: fixJosa(raw.message) } : { ok: false, error: fixJosa(raw.error) };
  return { state: result.ok ? draft : state, result };
}

/** AI가 플레이어에게 보낸 제안에 답한다 (장수 행동 소모 없음) */
export function respondOfferMut(s: GameState, factionId: string, index: number, accept: boolean): CommandResult {
  const o = s.offers[index];
  if (!o || o.to !== factionId) return { ok: false, error: '제안을 찾을 수 없습니다.' };
  s.offers.splice(index, 1);
  const from = s.factions[o.from];
  const what = o.proposal === 'truce' ? '휴전' : '동맹';
  if (!accept) {
    log(s, `${s.factions[factionId].name}이(가) ${from.name}의 ${what} 제안을 거절했습니다.`, 'warn', factionId);
    return { ok: true, message: `${from.name}의 제안을 거절했습니다.` };
  }
  s.diplomacy[pairKey(o.from, o.to)] = { status: o.proposal, until: o.proposal === 'truce' ? s.turn + BALANCE.truceTurns : null };
  s.factions[factionId].gold += o.gold;
  log(s, `${s.factions[factionId].name}과(와) ${from.name}이(가) ${what}을 맺었습니다.`, 'good', factionId);
  return { ok: true, message: `${from.name}과(와) ${what}을 맺었습니다.${o.gold ? ` 예물 금 ${o.gold.toLocaleString()}을 받았습니다.` : ''}` };
}

export function respondOffer(state: GameState, factionId: string, index: number, accept: boolean) {
  const draft = structuredClone(state);
  const result = respondOfferMut(draft, factionId, index, accept);
  return { state: result.ok ? draft : state, result };
}

/** 곡식 1000석 시세(금). 계절·도시 상업·항구에 따라 달라진다 */
export function foodPrice(s: GameState, cityId: string, action: 'buyFood' | 'sellFood'): number {
  const c = s.cities[cityId];
  const base = action === 'buyFood' ? BALANCE.foodBuyPer1000 : BALANCE.foodSellPer1000;
  const season = BALANCE.seasonFoodPrice[s.season] ?? 1;
  const market = (c.commerce / 100) * BALANCE.marketCommerceDiscount + (c.port ? 0.05 : 0);
  return Math.round(action === 'buyFood' ? base * season * (1 - market) : base * season * (1 + market));
}

/** 세력 특성 효과 합계 (v2.7) */
/** 귀농 미리보기 (v3.5): 몇 명을 돌려보내면 민심·곡식이 얼마나 느는지. 명령과 화면이 같은 계산을 쓴다. */
export function disbandPreview(s: GameState, cityId: string, want: number) {
  const city = s.cities[cityId];
  const amount = Math.max(0, Math.min(Math.floor(want), city.troops - minGarrison(s)));
  const orderAfter = Math.min(100, city.order + Math.round((amount / 1000) * BALANCE.disbandOrderPer1000));
  const orderGain = orderAfter - city.order;
  /** 병사였을 때 먹던 군량: 계절마다 */
  const foodSaved = Math.round(amount * BALANCE.foodPerTroop);
  // 가을 수확: 농업 × 인구(천명) × 계수 × 민심 배율 — 늘어난 인구와 오른 민심을 반영한 차이
  const f = city.owner ? s.factions[city.owner] : null;
  const mul = BALANCE.harvestPerAgriculture * Math.max(0, 1 - (city.droughtTurns ?? 0) * BALANCE.droughtHarvestLoss) * (1 + (f ? traitSum(f.traits, 'harvest') : 0));
  const harvest = (pop: number, order: number) => city.agriculture * (pop / 1000) * (0.5 + order / 200) * mul;
  const harvestGain = Math.round(harvest(city.population + amount, orderAfter) - harvest(city.population, city.order));
  return { amount, orderAfter, orderGain, foodSaved, harvestGain, yearFood: foodSaved * 4 + harvestGain };
}

export function traitSum(traits: string[], key: 'attack' | 'recruit' | 'conscriptCost' | 'rewardLoyalty' | 'harvest' | 'market'): number {
  return traits.reduce((a, t) => a + (BALANCE.traitEffects[t]?.[key] ?? 0), 0);
}
