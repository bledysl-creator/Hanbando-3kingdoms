// 명령: 플레이어와 AI가 똑같이 사용한다 (CLAUDE.md 규칙 6).
import { BALANCE } from '../config';
import { resolveBattle } from '../battle/battle';
import { chance, pick } from '../rng/rng';
import { generalsIn, isConnectedToCapital, neighbors, roadBetween, supplyRatio } from '../query';
import type { GameState, LogKind } from '../state/types';
import { canAttack, pairKey, statusOf, tryProposal, type Proposal } from '../diplomacy/diplomacy';

export type DevelopField = 'agriculture' | 'commerce' | 'wall';

export type Command =
  | { type: 'develop'; generalId: string; field: DevelopField }
  | { type: 'conscript'; generalId: string; amount: number }
  | { type: 'train'; generalId: string }
  | { type: 'march'; generalId: string; toCityId: string; troops: number }
  | { type: 'transfer'; generalId: string; toCityId: string; troops: number }
  | { type: 'recruit'; generalId: string; targetId: string }
  | { type: 'reward'; generalId: string; targetId: string }
  | { type: 'diplomacy'; generalId: string; targetFactionId: string; proposal: Proposal; gold: number }
  | { type: 'breakTreaty'; generalId: string; targetFactionId: string };

export type CommandResult = { ok: true; message: string } | { ok: false; error: string };

export function log(s: GameState, text: string, kind: LogKind = 'info', factionId: string | null = null) {
  s.log.push({ turn: s.turn, year: s.year, season: s.season, text, kind, factionId });
  if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
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
      const gold = Math.ceil(amount * BALANCE.conscriptGoldPerTroop);
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
      const troops = Math.max(0, Math.min(Math.floor(cmd.troops), city.troops - 500));
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
      const troops = Math.min(Math.floor(cmd.troops), city.troops - 500);
      if (troops < 1000) return { ok: false, error: '출진 병력은 1,000명 이상이어야 합니다 (도시에 500명은 남겨야 함).' };
      const foodNeed = Math.ceil(troops * BALANCE.foodPerTroop);
      if (f.food < foodNeed) return { ok: false, error: '군량이 부족합니다.' };
      f.food -= foodNeed;
      city.troops -= troops;
      g.acted = true;

      const defenderFaction = to.owner;
      const defenders = generalsIn(s, to.id).filter((x) => x.faction === defenderFaction);
      const out = resolveBattle(s, {
        attackerTroops: troops, attackerGeneral: g, defenderCity: to, defenderGenerals: defenders, road, season: s.season, weather: s.weather[to.id],
        attackerMorale: city.morale, attackerTraining: city.training, supply: supplyRatio(s, factionId) < BALANCE.lowSupplyThreshold ? supplyRatio(s, factionId) : undefined,
        isolated: !isConnectedToCapital(s, factionId, city.id),
      });
      s.lastBattles.push({
        turn: s.turn, attackerFaction: factionId, defenderFaction, fromCity: city.id, toCity: to.id, generalId: g.id,
        attackerTroops: troops, defenderTroops: to.troops, ...out,
      });
      if (s.lastBattles.length > 30) s.lastBattles.splice(0, s.lastBattles.length - 30);

      const survivors = troops - out.attackerLoss;
      const defName = defenderFaction ? s.factions[defenderFaction].name : '중립';
      if (out.won) {
        to.troops = survivors;
        to.morale = Math.min(100, city.morale + BALANCE.victoryMorale);
        to.training = city.training;
        to.owner = factionId;
        to.order = Math.max(10, to.order - 20);
        to.population = Math.round(to.population * 0.95);
        g.city = to.id;
        // 패배한 수비 장수: 인접 아군 도시로 퇴각, 없으면 재야
        for (const d of defenders) {
          const retreat = defenderFaction
            ? pick(s, neighbors(s, to.id).filter((n) => n.city.owner === defenderFaction).map((n) => n.city.id))
            : undefined;
          if (retreat) d.city = retreat;
          else if (d.faction && s.factions[d.faction]?.rulerId !== d.id) d.faction = null;
          else if (d.faction) d.faction = null; // 군주도 도망칠 곳이 없으면 재야로
        }
        log(s, `${s.factions[factionId].name}군 ${g.name}이(가) ${defName}의 ${to.name}을(를) 함락했습니다!`, 'danger', factionId);
        checkFactionDestroyed(s, defenderFaction);
        return { ok: true, message: `${to.name} 함락! (아군 손실 ${out.attackerLoss.toLocaleString()})` };
      } else {
        to.troops = Math.max(1, to.troops - out.defenderLoss);
        to.morale = Math.min(100, to.morale + 5);
        city.troops += survivors;
        city.morale = Math.max(0, city.morale - BALANCE.defeatMorale);
        log(s, `${g.name}의 ${to.name} 공격이 실패했습니다.`, 'warn', factionId);
        return { ok: true, message: `${to.name} 공격 실패 (아군 손실 ${out.attackerLoss.toLocaleString()})` };
      }
    }
    case 'recruit': {
      const t = s.generals[cmd.targetId];
      if (!t || !t.alive || t.faction !== null) return { ok: false, error: '등용할 수 있는 재야 장수가 아닙니다.' };
      if (t.city !== g.city) return { ok: false, error: '같은 도시에 있어야 등용할 수 있습니다.' };
      const ruler = s.generals[f.rulerId];
      const p = Math.min(0.9, Math.max(0.1,
        (g.stats.charm - 30 + ((ruler?.stats.charm ?? 50) - 50) / 2 - (t.persona.pride - 50) / 3) / 100));
      g.acted = true;
      if (chance(s, p)) {
        t.faction = factionId;
        t.loyalty = Math.round(60 + g.stats.charm / 5);
        s.recruits[factionId] = (s.recruits[factionId] ?? 0) + 1;
        log(s, `${t.name}이(가) ${f.name}군에 합류했습니다.`, 'good', factionId);
        return { ok: true, message: `${t.name} 등용 성공!` };
      }
      return { ok: true, message: `${t.name}이(가) 등용을 거절했습니다. (성공률 ${Math.round(p * 100)}%)` };
    }
    case 'reward': {
      const t = s.generals[cmd.targetId];
      if (!t || t.faction !== factionId) return { ok: false, error: '우리 장수가 아닙니다.' };
      if (f.gold < BALANCE.rewardGold) return { ok: false, error: '금이 부족합니다.' };
      f.gold -= BALANCE.rewardGold;
      t.loyalty = Math.min(100, t.loyalty + BALANCE.rewardLoyalty);
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

export function checkFactionDestroyed(s: GameState, factionId: string | null) {
  if (!factionId) return;
  const f = s.factions[factionId];
  if (!f || !f.alive) return;
  if (Object.values(s.cities).some((c) => c.owner === factionId)) return;
  f.alive = false;
  for (const g of Object.values(s.generals)) if (g.faction === factionId) g.faction = null;
  log(s, `${f.name}(${f.hanja}) 세력이 멸망했습니다.`, 'danger', factionId);
}

/** 불변 버전: 상태를 복사해 명령을 적용한다. */
export function applyCommand(state: GameState, factionId: string, cmd: Command): { state: GameState; result: CommandResult } {
  const draft = structuredClone(state);
  const result = executeCommand(draft, factionId, cmd);
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
