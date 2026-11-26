import { igniteCity } from '../systems/wildfire';
import { governorOf } from '../systems/office';
import { fixJosa } from '../josa';
import { reliefFood } from '../systems/epidemic';
import type { TacticKind } from '../battle/tactics';
// 명령: 플레이어와 AI가 똑같이 사용한다 (CLAUDE.md 규칙 6).
import { BALANCE } from '../config';
import { resolveBattle, type BattleInput, type BattleOutcome } from '../battle/battle';
import { addToCity, compFromFormation, compOf, compText, hasHorses, normComp, organizeCost, UNIT_KINDS, type Comp, type FormationKind } from '../battle/formation';
import { beginSiege } from '../systems/siege';
import { chance, rand } from '../rng/rng';
import { estimateRatio } from '../battle/estimate';
import { killGeneral } from '../systems/lifecycle';
import { decideCaptiveMut, decideFates } from '../systems/captives';
import { followsAdvice } from '../battle/council';
import { discord, rumor, scout, withinTwo } from '../systems/intrigue';
import { generalsIn, isConnectedToCapital, lastStandBonus, minGarrison, minMarch, neighbors, roadBetween, supplyRatio } from '../query';
import type { City, EventKind, GameState, General, LogKind, Road } from '../state/types';
import { refuseChance, remember } from '../systems/persona';
import { canAttack, pairKey, statusOf, tryProposal, type Proposal } from '../diplomacy/diplomacy';

export type DevelopField = 'agriculture' | 'commerce' | 'wall';

export type Command =
  | { type: 'develop'; generalId: string; field: DevelopField }
  | { type: 'conscript'; generalId: string; amount: number }
  | { type: 'train'; generalId: string }
  | { type: 'march'; generalId: string; toCityId: string; troops: number; tactic?: TacticKind; formation?: FormationKind; advisorId?: string }
  | { type: 'transfer'; generalId: string; toCityId: string; troops: number }
  | { type: 'recruit'; generalId: string; targetId: string }
  | { type: 'reward'; generalId: string; targetId: string }
  | { type: 'diplomacy'; generalId: string; targetFactionId: string; proposal: Proposal; gold: number; horses?: number }
  | { type: 'breakTreaty'; generalId: string; targetFactionId: string }
  | { type: 'scout'; generalId: string; cityId: string }
  | { type: 'rumor'; generalId: string; cityId: string }
  | { type: 'discord'; generalId: string; targetId: string }
  | { type: 'trade'; generalId: string; action: 'buyFood' | 'sellFood' | 'buyHorses' | 'sellHorses'; amount: number }
  | { type: 'disband'; generalId: string; amount: number }
  | { type: 'buildShips'; generalId: string }
  | { type: 'relief'; generalId: string }
  | { type: 'appoint'; generalId: string; targetId: string }
  | { type: 'extinguish'; generalId: string }
  | { type: 'study'; generalId: string; stat: StudyStat }
  | { type: 'organize'; generalId: string; comp: Comp }
  | { type: 'breedHorses'; generalId: string }
  | { type: 'captive'; generalId: string; targetId: string; action: 'recruit' | 'release' | 'execute' };

export type StudyStat = 'leadership' | 'war' | 'intellect' | 'politics' | 'charm';
export const STUDY_LABEL: Record<StudyStat, string> = { leadership: '통솔 (병법 훈련)', war: '무력 (무예 수련)', intellect: '지력 (병서 공부)', politics: '정치 (경세 공부)', charm: '매력 (예법·인망)' };

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
  const free = cmd.type === 'captive'; // v4.0 행동을 쓰지 않는 명령
  if (g.acted && !free) return { ok: false, error: `${g.name}은(는) 이번 턴에 이미 행동했습니다.` };
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
      addToCity(city, amount); // v4.1 신병은 보병
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
      addToCity(to, troops, compOf(city));
      to.troops += troops;
      if (city.governor === g.id) city.governor = undefined;
      g.city = to.id;
      g.acted = true;
      // v3.8 태수가 없는 고을에 들어가면 그 장수가 태수를 맡는다 (군주 제외, 따로 임명 명령이 필요 없음)
      const autoGov = !governorOf(s, to.id) && f.rulerId !== g.id;
      if (autoGov) to.governor = g.id;
      return { ok: true, message: `${g.name}이(가) 병력 ${troops.toLocaleString()}명과 함께 ${to.name}(으)로 이동했습니다.${autoGov ? ` (${to.name} 태수를 맡음)` : ''}` };
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
      // v4.0 책사의 계획을 그대로 따르면 그 책사의 충성이 조금 오른다
      let advised = '';
      if (cmd.advisorId && followsAdvice(s, factionId, g, to.id, troops, cmd.advisorId, cmd.formation, cmd.tactic)) {
        const a = s.generals[cmd.advisorId];
        a.loyalty = Math.min(100, a.loyalty + BALANCE.adviceLoyalty);
        advised = ` · ${a.name}: "제 말을 들어 주시니 몸 바쳐 보답하겠습니다." (충성 +${BALANCE.adviceLoyalty})`;
      }
      f.food -= foodNeed;
      city.troops -= troops;
      g.acted = true;

      // v3.6 플레이어 도시를 노리면 바로 싸우지 않고 한 계절 포위한다 → 플레이어가 대응을 고른다
      if (s.playerFactionId && to.owner === s.playerFactionId && factionId !== s.playerFactionId && BALANCE.siegeChoice) {
        beginSiege(s, factionId, g, city, to, troops, cmd.tactic, cmd.formation);
        return { ok: true, message: `${to.name}을(를) 포위했습니다.` };
      }
      const res = finishAttack(s, factionId, g, city, to, troops, road, cmd.tactic, { battle: { formation: cmd.formation } });
      return res.ok && advised ? { ok: true, message: res.message + advised } : res;
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
    case 'study': {
      // v4.0 수련·학문: 금을 써서 능력치가 1~5 오른다 (이미 높으면 덜 오름, 같은 성에 그 능력 90+ 스승이 있으면 +1)
      const t = g;
      const cur = t.stats[cmd.stat];
      if (cur >= 100) return { ok: false, error: '이미 최고 경지입니다.' };
      if (f.gold < BALANCE.studyGold) return { ok: false, error: `금이 부족합니다 (${BALANCE.studyGold} 필요).` };
      f.gold -= BALANCE.studyGold;
      let gain = BALANCE.studyMin + Math.floor(rand(s) * (BALANCE.studyMax - BALANCE.studyMin + 1));
      if (cur >= BALANCE.studyHighFrom) gain = Math.max(1, Math.floor(gain / 2));
      const mentor = generalsIn(s, city.id, factionId).filter((x) => x.id !== t.id && x.stats[cmd.stat] >= 90).sort((a, b) => b.stats[cmd.stat] - a.stats[cmd.stat])[0];
      if (mentor) gain += 1;
      gain = Math.min(gain, 100 - cur);
      t.stats[cmd.stat] = cur + gain;
      g.acted = true;
      return { ok: true, message: `${t.name}의 ${STUDY_LABEL[cmd.stat].split(' ')[0]} ${cur} → ${t.stats[cmd.stat]} (+${gain})${mentor ? ` — 스승 ${mentor.name}의 가르침 +1` : ''}` };
    }
    case 'organize': {
      // v4.1 군사 편제: 병종 비율을 바꾼다. 늘어나는 병종만 자원(말·철·목재)이 들고 훈련도가 조금 떨어진다
      if (city.troops < 100) return { ok: false, error: '편제할 병력이 없습니다.' };
      const next = normComp(cmd.comp);
      const cost = organizeCost(s, city, next);
      if (cost.error) return { ok: false, error: cost.error };
      if (cost.changed < 1 && cost.horses >= 0) return { ok: false, error: '바뀐 것이 없습니다.' };
      f.horses = (f.horses ?? 0) - cost.horses;
      f.iron -= cost.iron;
      f.wood -= cost.wood;
      city.comp = next;
      city.training = Math.max(0, city.training - cost.trainDrop);
      g.acted = true;
      return { ok: true, message: `${city.name} 편제: ${compText(next)} (말 ${cost.horses >= 0 ? '−' : '+'}${Math.abs(cost.horses).toLocaleString()} · 철 −${cost.iron.toLocaleString()} · 목재 −${cost.wood.toLocaleString()} · 훈련 −${cost.trainDrop})` };
    }
    case 'breedHorses': {
      // v4.1 말 기르기: 마창 규모만큼 품(금·곡식)을 들여 말을 늘린다
      const lv = city.ranch ?? 0;
      if (lv <= 0) return { ok: false, error: `${city.name}에는 마창이 없습니다.` };
      const food = BALANCE.breedFoodPerLevel * lv;
      if (f.gold < BALANCE.breedGold) return { ok: false, error: `금이 부족합니다 (${BALANCE.breedGold}).` };
      if (f.food < food) return { ok: false, error: `곡식이 부족합니다 (${food.toLocaleString()}).` };
      f.gold -= BALANCE.breedGold;
      f.food -= food;
      const n = breedYield(s, city, g);
      f.horses = (f.horses ?? 0) + n;
      g.acted = true;
      return { ok: true, message: `${city.name} 마창(${RANCH_LABEL[lv]})에서 말 ${n.toLocaleString()}필을 길렀습니다. (보유 ${f.horses.toLocaleString()}필)` };
    }
    case 'captive': {
      return decideCaptiveMut(s, factionId, cmd.targetId, cmd.action);
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
      if (cmd.action === 'buyHorses' || cmd.action === 'sellHorses') {
        // v4.0 군마 거래: 말 1필 = 곡식 horseFoodRatio석 값, 10필 단위
        const n = Math.max(0, Math.floor(cmd.amount / 10) * 10);
        if (n < 10) return { ok: false, error: '10필 단위로 거래합니다.' };
        const price = horsePrice(s, city.id, cmd.action);
        const gold = Math.round(n * price);
        if (cmd.action === 'buyHorses') {
          if (f.gold < gold) return { ok: false, error: '금이 부족합니다.' };
          f.gold -= gold; f.horses = (f.horses ?? 0) + n;
        } else {
          if ((f.horses ?? 0) < n) return { ok: false, error: '군마가 부족합니다.' };
          f.horses = (f.horses ?? 0) - n; f.gold += gold;
        }
        g.acted = true;
        return { ok: true, message: `${city.name} 시장에서 군마 ${n.toLocaleString()}필을 ${cmd.action === 'buyHorses' ? '사들였' : '팔았'}습니다. (금 ${gold.toLocaleString()}, 1필 ${price.toFixed(1)})` };
      }
      const amount = Math.min(BALANCE.tradeMax, Math.max(0, Math.floor(cmd.amount / 1000) * 1000));
      if (amount < 1000) return { ok: false, error: '1,000석 단위로 거래합니다.' };
      const tm = traitSum(f.traits, 'market');
      const price = Math.round(foodPrice(s, city.id, cmd.action as 'buyFood' | 'sellFood') * (cmd.action === 'buyFood' ? 1 - tm : 1 + tm));
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
      const horses = Math.max(0, Math.floor(cmd.horses ?? 0));
      if (f.gold < gold) return { ok: false, error: '금이 부족합니다.' };
      if ((f.horses ?? 0) < horses) return { ok: false, error: '군마가 부족합니다.' };
      f.gold -= gold;
      f.horses = (f.horses ?? 0) - horses;
      g.acted = true;
      // v4.0 말은 금으로 치면 시세만큼의 예물이다 (말 산지가 없는 나라일수록 더 반긴다)
      const horseValue = Math.round(horses * horsePrice(s, city.id, 'sellHorses') * (hasHorses(s, t.id, 5000) ? 1 : 1.5));
      const r = tryProposal(s, factionId, t.id, cmd.proposal, g.id, gold + horseValue);
      if (r.accepted && horses > 0) t.horses = (t.horses ?? 0) + horses;
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

export const RANCH_LABEL = ['없음', '소', '중', '대'];
/** v4.1 말 기르기 한 번에 느는 말: 마창 규모 × breedPer × (0.8 + 정치/250) */
export function breedYield(_s: GameState, city: City, g: General): number {
  return Math.round((city.ranch ?? 0) * BALANCE.breedPer * (0.8 + g.stats.politics / 250));
}

/** v4.0 말 1필 값 (금): 곡식 시세 × horseFoodRatio / 1000 */
export function horsePrice(s: GameState, cityId: string, action: 'buyHorses' | 'sellHorses'): number {
  return (foodPrice(s, cityId, action === 'buyHorses' ? 'buyFood' : 'sellFood') * BALANCE.horseFoodRatio) / 1000 * (action === 'buyHorses' ? 1.2 : 0.8);
}

/** 세력 특성 효과 합계 (v2.7) */
export interface AttackOptions {
  /** 이미 정해진 전투 결과 (청야로 빈 성을 넘겨받을 때) */
  outcome?: BattleOutcome;
  /** 포위 대응에서 덧붙이는 전투 입력 */
  battle?: Partial<BattleInput>;
  /** 전투 직후 손실 보정 등 (출성 요격 대승) */
  after?: (out: BattleOutcome) => void;
  noPlunder?: boolean;
  /** 패한 공격군이 돌아갈 곳 (기본: 출발 도시) */
  returnTroops?: (n: number) => void;
}

/** 출진 전투 입력 (finishAttack·책사 조언 공용, v4.0) */
export function marchInput(s: GameState, factionId: string, g: General, city: City, to: City, troops: number, road: Road, tactic?: TacticKind, formation?: FormationKind): BattleInput {
  const f = s.factions[factionId];
  const defenders = generalsIn(s, to.id).filter((x) => x.faction === to.owner);
  const sr = supplyRatio(s, factionId);
  return {
    attackerTroops: troops, attackerGeneral: g, defenderCity: to, defenderGenerals: defenders, road, season: s.season, weather: s.weather[to.id], tactic, formation, traitAttack: traitSum(f.traits, 'attack'), attackerShips: city.ships ?? 0, navalTrait: f.traits.includes('수군'),
    attackerMorale: city.morale, attackerTraining: city.training, supply: sr < BALANCE.lowSupplyThreshold ? sr : undefined,
    isolated: !isConnectedToCapital(s, factionId, city.id),
    lastStand: lastStandBonus(s, to.owner),
    cavalryTrait: f.traits.includes('최강무력'),
    attackerComp: formation ? compFromFormation(formation) : compOf(city),
    defenderComp: compOf(to),
  };
}

/** 전투를 치르고 함락·퇴각을 처리한다 (출진·포위 공용, v3.6에서 분리) */
export function finishAttack(s: GameState, factionId: string, g: General, city: City, to: City, troops: number, road: Road, tactic?: TacticKind, opt: AttackOptions = {}): CommandResult {
  const f = s.factions[factionId];
  const defenderFaction = to.owner;
  const defenders = generalsIn(s, to.id).filter((x) => x.faction === defenderFaction);
  const out = opt.outcome ?? resolveBattle(s, { ...marchInput(s, factionId, g, city, to, troops, road, tactic), ...opt.battle });
  opt.after?.(out);
  const report = {
    turn: s.turn, attackerFaction: factionId, defenderFaction, fromCity: city.id, toCity: to.id, generalId: g.id,
    attackerTroops: troops, defenderTroops: to.troops, ...out,
  };
  s.lastBattles.push(report);
  if (s.lastBattles.length > 30) s.lastBattles.splice(0, s.lastBattles.length - 30);

  const survivors = troops - out.attackerLoss;
  const defTroopsBefore = to.troops;
  const aComp = out.comp ?? compOf(city);
  // v3.9 일기토에서 베인 장수
  if (out.duel?.slain) {
    const loser = s.generals[out.duel.winnerId === out.duel.attackerId ? out.duel.defenderId : out.duel.attackerId];
    if (loser?.alive) killGeneral(s, loser, `⚔️ ${s.generals[out.duel.winnerId].name}이(가) ${to.name} 앞 일기토에서 ${loser.name}을(를) 베었습니다!`);
  } else if (out.duel) {
    log(s, `⚔️ ${to.name} 앞 일기토: ${s.generals[out.duel.winnerId].name}이(가) ${s.generals[out.duel.winnerId === out.duel.attackerId ? out.duel.defenderId : out.duel.attackerId].name}을(를) 꺾었습니다.`, 'info', factionId, { event: 'duel', other: to.owner });
  }
  const defName = defenderFaction ? s.factions[defenderFaction].name : '중립';
  if (out.tactic?.kind === 'fire' && out.tactic.success) { igniteCity(s, to.id, 1); out.reasons.push(`화공의 불길이 ${to.name} 일대로 번졌습니다`); }
  if (out.won) {
    // v3.9 패잔병 + v4.0 장수의 운명: 탈출한 장수가 패잔병을 이끌고 이웃 아군 성으로 간다
    const left = Math.max(0, defTroopsBefore - out.defenderLoss);
    const haven = defenderFaction ? neighbors(s, to.id).filter((n) => n.city.owner === defenderFaction).map((n) => n.city).sort((a, b) => b.troops - a.troops)[0] : undefined;
    const fates = defenderFaction || defenders.length ? decideFates(s, defenders, to.id, factionId, haven?.id, (aComp.cavalry ?? 0) + (aComp.chariot ?? 0) >= 0.3) : [];
    out.fates = fates;
    report.fates = fates;
    const leader = fates.filter((x) => x.fate === 'escaped').map((x) => s.generals[x.generalId]).sort((a, b) => b.stats.leadership - a.stats.leadership)[0];
    const trap = (to.basin ?? 0) >= BALANCE.basinFrom ? 1 - BALANCE.basinTrap * (to.basin ?? 0) : 1;
    const share = BALANCE.routRetreatShare * trap * (leader ? 0.6 + leader.stats.leadership / 250 : BALANCE.fateLeaderless);
    const fled = haven ? Math.min(left, Math.floor(left * share)) : 0;
    const joined = Math.floor((left - fled) * BALANCE.routSurrenderShare);
    if (haven && fled > 0) out.reasons.push(`패잔병 ${fled.toLocaleString()}명이 ${leader ? `${leader.name}을(를) 따라 ` : ''}${haven.name}(으)로 달아남${trap < 1 ? ' (분지에 갇혀 빠져나가기 어려움)' : ''}`);
    if (haven && fled > 0) { addToCity(haven, fled, out.defComp ?? compOf(to)); haven.troops += fled; const lf = fates.find((x) => x.generalId === leader?.id); if (lf) lf.troops = fled; }
    if (joined >= 100) out.reasons.push(`흩어진 수비병 ${joined.toLocaleString()}명이 투항해 편입됨`);
    const FATE: Record<string, string> = { escaped: '탈출', captured: '사로잡힘', slain: '전사', fled: '홀로 달아나 몸을 숨김' };
    for (const x of fates) {
      const d = s.generals[x.generalId];
      if (x.fate !== 'slain') log(s, `${to.name} 함락 — ${d.name}: ${FATE[x.fate]}${x.to ? ` (${s.cities[x.to].name})` : ''}`, x.fate === 'escaped' ? 'warn' : 'danger', defenderFaction, { event: 'fate', other: factionId });
    }
    // 군마 노획
    if (defenderFaction && (s.factions[defenderFaction].horses ?? 0) > 0 && !opt.noPlunder) {
      const df = s.factions[defenderFaction];
      const cnt = Object.values(s.cities).filter((c) => c.owner === defenderFaction).length;
      const h = Math.floor((df.horses ?? 0) / Math.max(1, cnt) * BALANCE.plunderRatio);
      if (h > 0) { df.horses = (df.horses ?? 0) - h; f.horses = (f.horses ?? 0) + h; out.reasons.push(`군마 ${h.toLocaleString()}필 노획`); }
    }
    to.comp = joined > 0 ? normComp(Object.fromEntries(UNIT_KINDS.map((k) => [k, (aComp[k] ?? 0) * survivors + (k === 'infantry' ? joined : 0)]))) : normComp(aComp);
    to.troops = survivors + joined;
    to.morale = Math.min(100, city.morale + BALANCE.victoryMorale);
    to.training = city.training;
    if (to.port) {
      // 항구 함락: 남은 전선 절반을 노획하고, 바다로 왔다면 함대 절반이 따라 들어간다
      const moved = road.type === 'sea' ? Math.floor((city.ships ?? 0) / 2) : 0;
      city.ships = (city.ships ?? 0) - moved;
      to.ships = Math.min(BALANCE.maxShipsPerCity, Math.floor((to.ships ?? 0) / 2) + moved);
    }
    if (defenderFaction && !opt.noPlunder) {
      const dPop = Object.values(s.cities).filter((c) => c.owner === defenderFaction).reduce((a, c) => a + c.population, 0);
      const df = s.factions[defenderFaction];
      const loot = Math.round(df.food * (to.population / Math.max(1, dPop)) * BALANCE.plunderRatio);
      if (loot > 0) { df.food -= loot; f.food += loot; out.reasons.push(`${to.name}의 창고에서 곡식 ${loot.toLocaleString()}석 노획`); }
    }
    to.owner = factionId;
    to.order = Math.max(10, to.order - 20);
    to.population = Math.round(to.population * 0.95);
    g.city = to.id;
    remember(g, s.turn, 'defeated', defenders[0]?.id ?? g.id);
    for (const d of defenders) if (d.alive) remember(d, s.turn, 'defeatedBy', g.id);
    log(s, `${s.factions[factionId].name}군 ${g.name}이(가) ${defName}의 ${to.name}을(를) 함락했습니다!`, 'danger', factionId, { event: 'capture', other: defenderFaction });
    if (to.seat && defenderFaction) submitCounties(s, to.id, factionId, defenderFaction);
    checkFactionDestroyed(s, defenderFaction);
    return { ok: true, message: `${to.name} 함락! (아군 손실 ${out.attackerLoss.toLocaleString()})` };
  } else {
    to.troops = Math.max(1, to.troops - out.defenderLoss);
    to.morale = Math.min(100, to.morale + 5);
    if (opt.returnTroops) opt.returnTroops(survivors); else { addToCity(city, survivors, aComp); city.troops += survivors; }
    city.morale = Math.max(0, city.morale - BALANCE.defeatMorale);
    if (road.type === 'sea' && (city.ships ?? 0) > 0) city.ships = Math.floor((city.ships ?? 0) * (1 - BALANCE.shipLossOnFail));
    if (chance(s, BALANCE.battleDeathChance * (g.persona.risk / 60))) {
      killGeneral(s, g, `${g.name}이(가) ${to.name} 공격 중 전사했습니다!`);
    }
    log(s, `${g.name}의 ${to.name} 공격이 실패했습니다.`, 'warn', factionId);
    return { ok: true, message: `${to.name} 공격 실패 (아군 손실 ${out.attackerLoss.toLocaleString()})` };
  }
}

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
