// v4.3 5단계 전술 전투: 한 번의 계산으로 끝내지 않고, 전투를 다섯 단계(각 20%)로 나눠 병과마다 병력과 전술을 고른다.
// 단계마다 병과별 공격(s)·노출(e)이 전술과 상대 전술의 상성으로 바뀌고, 그 결과로 양쪽이 병력과 사기를 잃는다.
// 앞 단계의 선택이 다음 단계에 이어진다: 매복한 병과는 다음 단계에 기습하고, 거짓 퇴각에 속아 쫓아온 적은 대열이 흐트러진다.
// 기초 전력(장수·사기·훈련·보급·성벽·지형·날씨)은 자동 전투(resolveBattle)와 같은 식을 쓴다 → battleBase.
// 순수 함수: GameState를 모른다. 상태에 붙이는 일은 systems/tactical.ts가 한다.
import { BALANCE } from '../config';
import { fixJosa } from '../josa';
import { rand, randRange, type RngHolder } from '../rng/rng';
import type { General } from '../state/types';
import { battleBase, moraleFactor, resolveBattle, rollDuel, rollFortune, type BattleInput, type BattleOutcome, type DuelResult } from './battle';
import { compEffect, compText, counterMul, formationEffect, normComp, reliefOf, unitName, UNIT_KINDS, type Comp, type UnitKind } from './formation';
import { tacticChance, TACTICS, type TacticKind } from './tactics';

export type TacOrder = 'assault' | 'charge' | 'hold' | 'volley' | 'fire' | 'ambush' | 'feint' | 'flank' | 'night';
export type Side = 'atk' | 'def';
export type Troops = Partial<Record<UnitKind, number>>;
export interface UnitOrder { troops: number; tactic: TacOrder }
export type SideOrders = Partial<Record<UnitKind, UnitOrder>>;

const ALL: UnitKind[] = ['infantry', 'spear', 'archer', 'cavalry', 'chariot'];
export const TAC_ORDERS: Record<TacOrder, { name: string; icon: string; desc: string; kinds: UnitKind[] }> = {
  assault: { name: '정면 공격', icon: '⚔️', desc: '정면으로 맞붙는다. 이점도 약점도 없다.', kinds: ALL },
  charge: { name: '돌격', icon: '🐎', desc: '힘껏 들이친다. 기병·전차는 평지에서 매섭다. 창병 방진에 막히면 크게 다친다. 사격하는 궁병은 덮친다.', kinds: ['infantry', 'spear', 'cavalry', 'chariot'] },
  hold: { name: '방진', icon: '🛡️', desc: '방패와 창을 세우고 버틴다. 피해가 줄고 공격도 준다. 창병 방진은 돌격을 꺾는다. 협공에는 옆구리가 약하다.', kinds: ['infantry', 'spear', 'archer'] },
  volley: { name: '일제 사격', icon: '🏹', desc: '거리를 두고 쏜다. 받는 피해가 적고, 달려드는 말을 맞힌다. 비·눈에 약하다.', kinds: ['archer'] },
  fire: { name: '화공', icon: '🔥', desc: '불화살·불섶으로 적진을 태운다. 성공하면 큰 피해와 사기 저하. 지력 60 이상, 비·눈이면 못 쓴다. 한 전투에 한 번.', kinds: ['archer', 'infantry'] },
  ambush: { name: '매복', icon: '🌲', desc: '이번 단계에 숨어 싸우지 않는다. 다음 단계에 기습하면 공격 ×1.7 (골짜기 궁병은 더). 적 지력이 높거나 트인 평지면 들킨다.', kinds: ['infantry', 'spear', 'archer', 'cavalry'] },
  feint: { name: '거짓 퇴각', icon: '🏳️', desc: '지는 척 물러난다. 쫓아온 적(정면 공격·돌격·협공)은 다음 단계에 대열이 흐트러져 매복·협공에 크게 당한다.', kinds: ['infantry', 'cavalry'] },
  flank: { name: '협공', icon: '↪️', desc: '다른 병과가 정면을 붙잡는 동안 옆과 뒤를 친다. 방진·유인된 적에게 강하다. 혼자서는 약하다.', kinds: ['infantry', 'spear', 'cavalry', 'chariot'] },
  night: { name: '야습', icon: '🌙', desc: '첫 단계에만. 밤에 기습한다. 무력 65 이상, 안개 낀 날 더 좋다.', kinds: ALL },
};
const FRONT: TacOrder[] = ['assault', 'charge', 'hold', 'volley', 'fire', 'night'];
const PURSUERS: TacOrder[] = ['assault', 'charge', 'flank'];
const WET = ['rain', 'storm', 'typhoon', 'snow', 'blizzard'];

export interface TacSide {
  faction: string | null;
  leaderId?: string;
  deputyId?: string;
  units: Troops;
  init: Troops;
  morale: number;
  morale0: number;
  /** 병사 한 명의 기초 전력 (일기토·전장의 변수·난수 포함) */
  per: number;
  int: number; war: number; lead: number;
  /** 지난 단계에 매복해 숨은 병과 (이번 단계에 기습할 수 있다) */
  hidden: UnitKind[];
  /** 적의 거짓 퇴각에 속아 쫓아옴 → 이번 단계 대열이 흐트러짐 */
  lured: boolean;
  fireUsed: boolean;
  /** 접전에서 잃은 병력 합계 */
  clashLoss: number;
  /** 형세 계산용 손실: 성벽 공성 손실 가산·성벽 보호를 뺀 값 (성벽은 이미 수비 전력에 들어 있어 두 번 세지 않는다) */
  scoreLoss?: number;
}

export interface TacPhase {
  phase: number;
  orders: Record<Side, SideOrders>;
  loss: Record<Side, Troops>;
  ratio: number;
  morale: Record<Side, number>;
  events: string[];
}

export interface TacBattle {
  id: string;
  turn: number;
  /** 플레이어가 지휘하는 쪽 (null = 양쪽 AI) */
  playerSide: Side | null;
  attackerFaction: string;
  defenderFaction: string | null;
  generalId: string;
  deputyId?: string;
  fromCity: string;
  toCity: string;
  troops: number;
  defTroops: number;
  /** 끝난 단계 수 (0~5) */
  phase: number;
  atk: TacSide;
  def: TacSide;
  terrain: { walled: boolean; wall: number; valley: boolean; open: boolean; wet: boolean; fog: boolean; drought: boolean; road: string; relief: number; rough: boolean };
  /** 병과별 지형·날씨·성벽 배율 (공격군은 자동 전투의 병종 효과와 같다) */
  mul: Record<Side, Troops>;
  cavalryTrait: boolean;
  reasons: string[];
  phases: TacPhase[];
  duel?: DuelResult;
  fortune?: { text: string; side: Side; phase: number; mul: number };
  opening?: { kind: TacticKind; success: boolean; chance: number; mul: number };
  /** 플레이어 도시 포위에서 직접 지휘로 넘어온 전투 */
  siegeId?: string;
  routed?: Side;
  retreated?: boolean;
  done?: boolean;
}

export const other = (s: Side): Side => (s === 'atk' ? 'def' : 'atk');
export const sumT = (t: Troops) => UNIT_KINDS.reduce((a, k) => a + (t[k] ?? 0), 0);
const kindsOf = (t: Troops) => UNIT_KINDS.filter((k) => (t[k] ?? 0) > 0);
const T = () => BALANCE.tactical;
const O = (k: string) => T().orders[k];

function split(total: number, comp: Comp): Troops {
  const c = normComp(comp);
  const out: Troops = {};
  let left = total;
  const ks = UNIT_KINDS.filter((k) => (c[k] ?? 0) > 0);
  ks.forEach((k, i) => {
    const n = i === ks.length - 1 ? left : Math.round(total * (c[k] ?? 0));
    out[k] = Math.max(0, Math.min(left, n));
    left -= out[k]!;
  });
  return out;
}

/** 전투 시작: 자동 전투와 같은 기초 전력에서 출발해 일기토·난수까지 정한다 */
export function createTacBattle(rng: RngHolder, b: BattleInput, meta: { id: string; turn: number; playerSide: Side | null; attackerFaction: string; defenderFaction: string | null; fromCity: string; siegeId?: string }): TacBattle {
  const B = battleBase(b);
  const city = b.defenderCity;
  const reasons = B.reasons;
  const aComp = normComp(b.attackerComp);
  const dComp = normComp(b.defenderComp);
  const walled = !b.ignoreWalls && city.wall >= 50;
  const rel = reliefOf(city);
  const atkUnits = split(b.attackerTroops, aComp);
  const defUnits = split(Math.max(0, city.troops), dComp);
  const mul: Record<Side, Troops> = { atk: {}, def: {} };
  for (const k of UNIT_KINDS) {
    let m = formationEffect(k, b.road, city, b.weather).attack;
    if (k === 'cavalry' && b.cavalryTrait && m > 1) m *= 1 + BALANCE.formation.cavalryTraitBonus;
    mul.atk[k] = m;
    // 수비군: 성벽 위 궁병은 쏘기 좋고, 성 안 기병·전차는 펼치기 어렵다. 트인 평지의 수비 기병은 반격이 매섭다
    let d = 1;
    if (walled && k === 'archer') d *= 1.05;
    if (walled && (k === 'cavalry' || k === 'chariot')) d *= 0.9;
    if (!walled && rel < BALANCE.reliefCavalryFrom && (k === 'cavalry' || k === 'chariot')) d *= 1.05;
    if (k === 'archer' && b.weather && WET.includes(b.weather)) d *= BALANCE.formation.archerWet;
    mul.def[k] = d;
  }
  let opening: TacBattle['opening'];
  let atkMul = 1;
  if (b.tactic) {
    const p = tacticChance(b.tactic, { general: B.dep ? { ...B.g, stats: B.us } : B.g, defenders: b.defenderGenerals, weather: b.weather, road: b.road, target: city });
    const name = TACTICS.find((t) => t.id === b.tactic)!.name;
    if (p > 0) {
      const success = rand(rng) < p;
      const m = success ? BALANCE.tacticBonus[b.tactic] : BALANCE.tacticFailPenalty;
      opening = { kind: b.tactic, success, chance: p, mul: m };
      reasons.push(success ? `선제 계책 「${name}」 성공! 1~${T().openingPhases}단계 공격 +${Math.round((m - 1) * 100)}%` : `선제 계책 「${name}」이(가) 간파당함 — 1~${T().openingPhases}단계 공격 −${Math.round((1 - m) * 100)}%`);
    }
  }
  const d = rollDuel(rng, b, B, reasons);
  atkMul *= d.atkMul;
  let defMul = d.defMul;
  atkMul *= randRange(rng, 0.88, 1.12);
  defMul *= randRange(rng, 0.88, 1.12);
  const dBest = b.defenderGenerals.reduce<General | null>((a, x) => (!a || x.stats.leadership > a.stats.leadership ? x : a), null);
  const dInt = Math.max(BALANCE.neutralLeadership, ...b.defenderGenerals.map((x) => x.stats.intellect));
  const side = (faction: string | null, units: Troops, morale: number, per: number, int: number, war: number, lead: number, leaderId?: string, deputyId?: string): TacSide => ({
    faction, leaderId, deputyId, units: { ...units }, init: { ...units }, morale, morale0: morale, per, int, war, lead, hidden: [], lured: false, fireUsed: false, clashLoss: 0,
  });
  return {
    id: meta.id, turn: meta.turn, playerSide: meta.playerSide, attackerFaction: meta.attackerFaction, defenderFaction: meta.defenderFaction,
    generalId: B.g.id, deputyId: B.dep?.id, fromCity: meta.fromCity, toCity: city.id, troops: b.attackerTroops, defTroops: Math.max(0, city.troops),
    phase: 0,
    atk: side(meta.attackerFaction, atkUnits, b.attackerMorale ?? 70, (B.atk / Math.max(1, b.attackerTroops)) * atkMul, B.us.intellect, B.us.war, B.g.stats.leadership, B.g.id, B.dep?.id),
    def: side(meta.defenderFaction, defUnits, city.morale ?? 70, (B.def / Math.max(1, city.troops)) * defMul, dInt, B.dWar, B.dLead, dBest?.id),
    terrain: {
      walled, wall: b.ignoreWalls ? 0 : city.wall, valley: rel >= 45 || b.road.type === 'pass', open: rel < BALANCE.reliefCavalryFrom && b.road.type === 'land',
      wet: !!b.weather && WET.includes(b.weather), fog: b.weather === 'fog', drought: b.weather === 'drought', road: b.road.type, relief: rel, rough: b.road.type === 'pass' || rel >= 45,
    },
    mul, cavalryTrait: !!b.cavalryTrait, reasons, phases: [], duel: d.duel, opening, siegeId: meta.siegeId,
  };
}

// ---------------------------------------------------------------- 전술 가능 여부·확률

/** 이 병과가 이번 단계에 이 전술을 쓸 수 있나 (안 되면 이유) */
export function orderBlocked(tb: TacBattle, side: Side, k: UnitKind, t: TacOrder): string | null {
  const o = TAC_ORDERS[t];
  if (!o.kinds.includes(k)) return `${unitName(k).name}은(는) 쓸 수 없음`;
  const me = tb[side];
  if (t === 'fire') {
    if (me.fireUsed) return '이번 전투에 이미 씀';
    if (tb.terrain.wet) return '비·눈에는 불이 붙지 않음';
    if (me.int < 60) return '지력 60 이상 장수가 필요';
  }
  if (t === 'night') {
    if (tb.phase !== 0) return '첫 단계에만';
    if (me.war < 65) return '무력 65 이상 장수가 필요';
  }
  if (t === 'ambush' && tb.phase >= T().phases - 1) return '마지막 단계에는 숨을 틈이 없음';
  return null;
}

/** 확률이 걸린 전술의 성공률 (매복은 '들키지 않을' 확률) */
export function orderChance(tb: TacBattle, side: Side, k: UnitKind, t: TacOrder): number | null {
  const me = tb[side], foe = tb[other(side)];
  const C = T();
  if (t === 'fire') {
    if (orderBlocked(tb, side, k, t)) return 0;
    const counter = Math.max(0, foe.int - 60) / 200;
    return Math.max(0.05, Math.min(0.9, (me.int - 50) / 60 + (tb.terrain.drought ? 0.2 : 0) + (tb.terrain.road === 'river' ? -0.1 : 0) - counter));
  }
  if (t === 'night') {
    if (orderBlocked(tb, side, k, t)) return 0;
    return Math.max(0.05, Math.min(0.9, (me.war - 40) / 90 + (tb.terrain.fog ? 0.2 : 0) - Math.max(0, foe.int - 60) / 200));
  }
  if (t === 'feint') {
    const f = C.feintChance;
    return Math.max(f.min, Math.min(f.max, f.base + (me.int - foe.int) / f.div));
  }
  if (t === 'ambush') {
    const a = C.ambushFound;
    const found = Math.max(a.min, Math.min(a.max, a.base + (foe.int - me.int) / a.div - (tb.terrain.valley ? a.valley : 0) + (tb.terrain.open ? a.open : 0) + (k === 'cavalry' ? 0.08 : 0)));
    return 1 - found;
  }
  return null;
}

/** 주문을 정리: 병력 범위 안으로, 못 쓰는 전술은 정면 공격으로 */
export function cleanOrders(tb: TacBattle, side: Side, o: SideOrders | undefined): SideOrders {
  const me = tb[side];
  const out: SideOrders = {};
  for (const k of kindsOf(me.units)) {
    const raw = o?.[k];
    const n = Math.max(0, Math.min(me.units[k]!, Math.round(raw?.troops ?? me.units[k]!)));
    let t: TacOrder = raw?.tactic ?? 'assault';
    if (orderBlocked(tb, side, k, t)) t = 'assault';
    out[k] = { troops: n, tactic: t };
  }
  return out;
}

// ---------------------------------------------------------------- 한 단계 계산

interface UnitEval { kind: UnitKind; troops: number; reserve: number; tactic: TacOrder; s: number; e: number; strike: number; expo: number; hidden: boolean; springs: boolean }
export interface PhaseEval {
  ratio: number;
  loss: Record<Side, Troops>;
  /** 병과별로 상대에게 준 피해 (예상) */
  dealt: Record<Side, Troops>;
  morale: Record<Side, number>;
  events: string[];
  /** 다음 단계 상태 */
  next: Record<Side, { hidden: UnitKind[]; lured: boolean; fireUsed: boolean }>;
  /** 확률 전술 결과 (예상 모드에서는 확률만) */
  rolls: { side: Side; kind: UnitKind; tactic: TacOrder; chance: number; ok?: boolean }[];
  power: Record<Side, number>;
  /** 성벽 배율을 뺀 손실 (형세 계산용) */
  plainLoss: Record<Side, number>;
}

type Roll = (p: number) => number; // 성공이면 1, 실패면 0 (예상 모드는 p를 돌려 기대값을 섞는다)

/** 한 단계를 계산한다. roll이 없으면 기대값(예상)으로, 있으면 실제로 굴린다. 상태는 바꾸지 않는다 */
export function evalPhase(tb: TacBattle, oA: SideOrders, oD: SideOrders, rng?: RngHolder): PhaseEval {
  const C = T();
  const orders: Record<Side, SideOrders> = { atk: cleanOrders(tb, 'atk', oA), def: cleanOrders(tb, 'def', oD) };
  const roll: Roll = rng ? (p) => (rand(rng) < p ? 1 : 0) : (p) => p;
  const rolls: PhaseEval['rolls'] = [];
  const events: string[] = [];
  const name = (side: Side) => (side === 'atk' ? '공격군' : '수비군');
  const next: PhaseEval['next'] = { atk: { hidden: [], lured: false, fireUsed: tb.atk.fireUsed }, def: { hidden: [], lured: false, fireUsed: tb.def.fireUsed } };
  const moraleD: Record<Side, number> = { atk: 0, def: 0 };
  const ev: Record<Side, UnitEval[]> = { atk: [], def: [] };
  const blend = (p: number, a: { s: number; e: number }, b: { s: number; e: number }) => ({ s: p * a.s + (1 - p) * b.s, e: p * a.e + (1 - p) * b.e });

  // 1) 병과마다 전술의 기본 배율
  for (const side of ['atk', 'def'] as Side[]) {
    const me = tb[side], foe = tb[other(side)];
    for (const k of kindsOf(me.units)) {
      const o = orders[side][k]!;
      let { s, e } = O('assault');
      const t = o.tactic;
      let hidden = false;
      const springs = me.hidden.includes(k) && t !== 'ambush';
      if (t === 'charge') ({ s, e } = O(k === 'cavalry' ? 'chargeHorse' : k === 'chariot' ? 'chargeChariot' : 'charge'));
      else if (t === 'hold') ({ s, e } = O('hold'));
      else if (t === 'volley') { ({ s, e } = O('volley')); if (tb.terrain.wet) s *= C.volleyWet; }
      else if (t === 'fire' || t === 'night') {
        const p = orderChance(tb, side, k, t)!;
        const ok = roll(p);
        rolls.push({ side, kind: k, tactic: t, chance: p, ok: rng ? ok === 1 : undefined });
        ({ s, e } = blend(ok, O(t === 'fire' ? 'fireOk' : 'nightOk'), O(t === 'fire' ? 'fireFail' : 'nightFail')));
        moraleD[other(side)] -= ok * C.moraleHit[t];
        if (t === 'fire') next[side].fireUsed = true;
        if (rng) events.push(ok ? `${TAC_ORDERS[t].icon} ${name(side)} ${unitName(k).name}의 ${TAC_ORDERS[t].name} 성공! (성공률 ${Math.round(p * 100)}%)` : `${TAC_ORDERS[t].icon} ${name(side)} ${unitName(k).name}의 ${TAC_ORDERS[t].name}이(가) 실패 (성공률 ${Math.round(p * 100)}%)`);
      } else if (t === 'ambush') {
        const p = orderChance(tb, side, k, t)!; // 들키지 않을 확률
        const safe = roll(p);
        rolls.push({ side, kind: k, tactic: t, chance: p, ok: rng ? safe === 1 : undefined });
        // 숨은 병력은 싸우지 않는다. 들키면 숨은 채로 몰려 맞는다
        s = (1 - safe) * O('found').s; e = (1 - safe) * O('found').e;
        hidden = safe === 1 || !rng;
        if (rng && safe) next[side].hidden.push(k);
        if (rng && !safe) { events.push(`👁️ ${name(side)} ${unitName(k).name}의 매복이 ${name(other(side))}에게 들킴! (지력 ${foe.int} 대 ${me.int})`); moraleD[side] -= 4; }
      } else if (t === 'feint') {
        const p = orderChance(tb, side, k, t)!;
        const ok = roll(p);
        rolls.push({ side, kind: k, tactic: t, chance: p, ok: rng ? ok === 1 : undefined });
        ({ s, e } = blend(ok, O('feint'), O('feintFail')));
        moraleD[side] -= (1 - ok) * C.moraleHit.feintFail;
      } else if (t === 'flank') {
        const anchor = kindsOf(me.units).some((j) => j !== k && FRONT.includes(orders[side][j]!.tactic) && orders[side][j]!.troops > 0);
        ({ s, e } = O(anchor ? 'flank' : 'flankAlone'));
        if (foe.lured) s *= C.lureBonus;
      }
      if (springs) {
        s *= C.ambushSpring * (k === 'archer' && tb.terrain.valley ? C.valleyArcher : 1) * (foe.lured ? C.lureBonus : 1);
        moraleD[other(side)] -= C.moraleHit.ambush;
        if (rng) events.push(`🌲 매복해 있던 ${name(side)} ${unitName(k).name}이(가) 뛰쳐나와 기습!${k === 'archer' && tb.terrain.valley ? ' (골짜기 양쪽에서 화살비)' : ''}${foe.lured ? ' — 쫓아온 적이 한가운데 갇힘' : ''}`);
      }
      if (me.lured && PURSUERS.includes(t)) e *= C.lureExpose;
      if (k === 'archer' && t !== 'ambush') e *= BALANCE.formation.archerOwnLoss;
      ev[side].push({ kind: k, troops: o.troops, reserve: me.units[k]! - o.troops, tactic: t, s, e, strike: 0, expo: 0, hidden, springs });
    }
  }

  // 2) 상대 전술과의 상성 + 병종 상성(공격군만, 자동 전투와 같음)
  const P = C.pair;
  const visible = (side: Side) => ev[side].filter((u) => !(u.tactic === 'ambush' && u.hidden));
  const power: Record<Side, number> = { atk: 0, def: 0 };
  const expoSum: Record<Side, number> = { atk: 0, def: 0 };
  const visSum: Record<Side, number> = { atk: 0, def: 0 };
  for (const side of ['atk', 'def'] as Side[]) {
    const me = tb[side];
    const foeVis = visible(other(side));
    const foeEng = foeVis.filter((u) => u.troops > 0);
    const engTot = foeEng.reduce((a, u) => a + u.troops, 0);
    const visTot = foeVis.reduce((a, u) => a + u.troops + u.reserve, 0);
    const morale = moraleFactor(me.morale) / Math.max(0.01, moraleFactor(me.morale0));
    const open = tb.opening && side === 'atk' && tb.phase < C.openingPhases ? tb.opening.mul : 1;
    const fort = tb.fortune && tb.fortune.side === side && tb.phase + 1 >= tb.fortune.phase ? tb.fortune.mul : 1;
    for (const u of ev[side]) {
      let sm = 1, em = 1;
      if (engTot > 0) {
        sm = 0; em = 0;
        for (const f of foeEng) {
          const w = f.troops / engTot;
          let ps = 1, pe = 1;
          const horse = u.kind === 'cavalry' || u.kind === 'chariot';
          if (u.tactic === 'charge' && f.tactic === 'hold' && f.kind === 'spear') { ps *= P.chargeIntoPikes; pe *= P.pikesImpale; }
          else if (u.tactic === 'charge' && f.tactic === 'hold' && horse) ps *= P.chargeIntoHold;
          if (u.tactic === 'charge' && f.kind === 'archer' && f.tactic === 'volley') ps *= P.chargeOnArchers;
          if (u.kind === 'archer' && u.tactic === 'volley' && f.tactic === 'charge') { pe *= P.archersCaught; if (f.kind === 'cavalry' || f.kind === 'chariot') ps *= P.volleyOnCharge; }
          if (u.tactic === 'flank' && f.tactic === 'hold') ps *= P.flankHold;
          if (f.tactic === 'feint') ps *= P.vsFeint;
          sm += w * ps; em += w * pe;
        }
      }
      let cm = 1;
      if (side === 'atk' && visTot > 0) {
        cm = 0;
        for (const f of foeVis) cm += ((f.troops + f.reserve) / visTot) * counterMul(u.kind, f.kind, tb.terrain.walled).mul;
      }
      const base = tb.mul[side][u.kind] ?? 1;
      u.strike = (u.troops * u.s * sm + u.reserve * O('reserve').s) * cm * base * me.per * morale * open * fort;
      const vis = !(u.tactic === 'ambush' && u.hidden);
      u.expo = (u.troops * u.e * em + u.reserve * O('reserve').e);
      power[side] += u.strike;
      expoSum[side] += u.expo;
      if (vis || !rng) visSum[side] += u.troops + u.reserve;
    }
  }
  const floor = (side: Side) => Math.max(1, sumT(tb[side].units) * tb[side].per * 0.05);
  const pA = Math.max(power.atk, floor('atk')), pD = Math.max(power.def, floor('def'));
  const eA = Math.max(0.05, expoSum.atk / Math.max(1, visSum.atk)), eD = Math.max(0.05, expoSum.def / Math.max(1, visSum.def));
  const ratio = (pA * eD) / (pD * eA);

  // 3) 손실: 진 쪽은 √전력비만큼, 이긴 쪽은 1/전력비만큼 (자동 전투 접전 식을 단계 수로 나눔)
  const q = Math.max(ratio, 1 / ratio);
  const atkWins = ratio >= 1;
  const base = (BALANCE.clashLoss / C.phases) * C.lossScale;
  const winWar = atkWins ? tb.atk.war : tb.def.war, loseLead = atkWins ? tb.def.lead : tb.atk.lead;
  const blade = (BALANCE.clashWarBase + winWar / BALANCE.clashWarDiv) * (BALANCE.clashLeadBase - loseLead / BALANCE.clashLeadDiv);
  const loserRate = Math.min(C.loserCap, base * Math.sqrt(q) * blade);
  const winnerRate = Math.max(BALANCE.clashWinnerMin / C.phases, base / q);
  const wall = tb.terrain.wall;
  const rate: Record<Side, number> = {
    atk: (atkWins ? winnerRate * (1 + wall / BALANCE.assaultWallDiv) : loserRate * (1 + wall / BALANCE.assaultWallDiv / 2)),
    def: atkWins ? loserRate : winnerRate * (tb.terrain.walled ? BALANCE.wallClashShield : 1),
  };
  const plainLoss: Record<Side, number> = { atk: (atkWins ? winnerRate : loserRate) * expoSum.atk, def: (atkWins ? loserRate : winnerRate) * expoSum.def };
  const loss: Record<Side, Troops> = { atk: {}, def: {} };
  const dealt: Record<Side, Troops> = { atk: {}, def: {} };
  for (const side of ['atk', 'def'] as Side[]) {
    const me = tb[side];
    const total = Math.round(rate[side] * expoSum[side]);
    const ex = expoSum[side] || 1;
    let left = Math.min(total, sumT(me.units));
    const us = ev[side].filter((u) => u.expo > 0);
    us.forEach((u, i) => {
      const n = i === us.length - 1 ? left : Math.round((total * u.expo) / ex);
      loss[side][u.kind] = Math.max(0, Math.min(me.units[u.kind]!, n, left));
      left -= loss[side][u.kind]!;
    });
  }
  // 준 피해: 상대 손실을 내 병과의 공격력 몫으로 나눈다 (화면 예상용)
  for (const side of ['atk', 'def'] as Side[]) {
    const tot = sumT(loss[other(side)]);
    const pw = power[side] || 1;
    for (const u of ev[side]) dealt[side][u.kind] = Math.round((tot * u.strike) / pw);
  }
  // 4) 유인: 거짓 퇴각에 성공했는데 상대가 (정면 공격·돌격·협공으로) 쫓아왔으면 다음 단계 상대 대열이 흐트러진다
  for (const side of ['atk', 'def'] as Side[]) {
    const foeSide = other(side);
    const feints = ev[side].filter((u) => u.tactic === 'feint' && u.troops > 0);
    if (!feints.length) continue;
    const chasers = ev[foeSide].filter((u) => PURSUERS.includes(u.tactic) && u.troops > 0);
    if (!chasers.length) continue;
    const r = rolls.find((x) => x.side === side && x.tactic === 'feint');
    const ok = rng ? !!r?.ok : false;
    if (ok) {
      next[foeSide].lured = true;
      moraleD[foeSide] -= C.lureMorale;
      events.push(`🏳️ ${name(side)}의 거짓 퇴각에 ${name(foeSide)} ${chasers.map((c) => unitName(c.kind).name).join('·')}이(가) 걸려들어 깊이 쫓아옴 — 다음 단계 대열이 흐트러짐`);
    } else if (rng) events.push(`🏳️ ${name(side)}의 거짓 퇴각을 ${name(foeSide)}이(가) 꿰뚫어 봄 (지력 ${tb[foeSide].int} 대 ${tb[side].int})`);
  }
  // 5) 사기
  const morale: Record<Side, number> = { atk: tb.atk.morale, def: tb.def.morale };
  for (const side of ['atk', 'def'] as Side[]) {
    const n = sumT(tb[side].units) || 1;
    morale[side] = Math.max(0, Math.min(100, morale[side] - (Math.min(sumT(loss[side]), plainLoss[side]) / n) * C.moraleLoss + moraleD[side] + ((side === 'atk') === atkWins ? C.winMorale : 0)));
  }
  return { ratio, loss, dealt, morale, events, next, rolls, power: { atk: pA, def: pD }, plainLoss };
}

// ---------------------------------------------------------------- 단계 진행·끝

/** 한 단계를 실제로 치른다 (tb를 바꾼다). 끝나면 true */
export function playPhase(tb: TacBattle, rng: RngHolder, oA: SideOrders, oD: SideOrders, input?: BattleInput): boolean {
  if (tb.done) return true;
  // 전장의 변수는 2~4단계 가운데 한 번 (자동 전투와 같은 확률·지력 간파)
  if (tb.phase === 1 && input && !tb.fortune) {
    const rs: string[] = [];
    const f = rollFortune(rng, input, tb.atk.int, rs);
    if (f.fortune && f.side) tb.fortune = { text: f.fortune, side: f.side, phase: 2 + Math.floor(rand(rng) * 3), mul: f.side === 'atk' ? f.atkMul : f.defMul };
    else if (rs.length) tb.reasons.push(...rs);
  }
  const ev = evalPhase(tb, oA, oD, rng);
  const ph = tb.phase + 1;
  if (tb.fortune && tb.fortune.phase === ph) ev.events.unshift(`🎲 전장의 변수: ${tb.fortune.text} (${tb.fortune.side === 'atk' ? '공격군' : '수비군'} +${Math.round((tb.fortune.mul - 1) * 100)}%)`);
  for (const side of ['atk', 'def'] as Side[]) {
    const me = tb[side];
    for (const k of UNIT_KINDS) if (ev.loss[side][k]) me.units[k] = Math.max(0, (me.units[k] ?? 0) - ev.loss[side][k]!);
    me.clashLoss += sumT(ev.loss[side]);
    me.scoreLoss = (me.scoreLoss ?? 0) + Math.min(ev.plainLoss[side], sumT(ev.loss[side]) * 3);
    me.morale = ev.morale[side];
    me.hidden = ev.next[side].hidden;
    me.lured = ev.next[side].lured;
    me.fireUsed = ev.next[side].fireUsed;
  }
  tb.phases.push({ phase: ph, orders: { atk: cleanOrders(tb, 'atk', oA), def: cleanOrders(tb, 'def', oD) }, loss: ev.loss, ratio: ev.ratio, morale: { atk: Math.round(tb.atk.morale), def: Math.round(tb.def.morale) }, events: ev.events.map(fixJosa) });
  tb.phase = ph;
  const C = T();
  const broken = (s: Side) => tb[s].morale < Math.min(C.routMorale, tb[s].morale0 - C.routDrop) || sumT(tb[s].units) < sumT(tb[s].init) * C.routRemain;
  const bA = broken('atk'), bD = broken('def');
  if (bA || bD) {
    tb.routed = bA && bD ? (tb.atk.morale <= tb.def.morale ? 'atk' : 'def') : bA ? 'atk' : 'def';
    tb.done = true;
  }
  if (tb.phase >= C.phases) tb.done = true;
  return !!tb.done;
}

/** 지금 형세: 남은 병력 × 전력 × 사기 (1보다 크면 공격군 우세) */
export function balanceOf(tb: TacBattle, roadAndCity?: { road: BattleInput['road']; city: BattleInput['defenderCity']; weather?: BattleInput['weather'] }): number {
  const pw = (s: Side) => Math.max(0, sumT(tb[s].init) - (tb[s].scoreLoss ?? tb[s].clashLoss)) * tb[s].per * moraleFactor(tb[s].morale) / Math.max(0.01, moraleFactor(tb[s].morale0));
  let ce = 1;
  if (roadAndCity && sumT(tb.atk.units) > 0 && sumT(tb.def.units) > 0) ce = compEffect(normComp(tb.atk.units), normComp(tb.def.units), roadAndCity.road, roadAndCity.city, roadAndCity.weather, tb.terrain.walled, tb.cavalryTrait).attack;
  const fort = (s: Side) => (tb.fortune && tb.fortune.side === s && tb.phase >= tb.fortune.phase ? tb.fortune.mul : 1);
  const open = tb.opening?.mul ?? 1;
  return (pw('atk') * ce * open * fort('atk')) / Math.max(1, pw('def') * fort('def'));
}

/** 전투를 끝내고 자동 전투와 같은 모양의 결과를 만든다 */
export function tacOutcome(tb: TacBattle, b: BattleInput): BattleOutcome {
  const C = T();
  const score = balanceOf(tb, { road: b.road, city: b.defenderCity, weather: b.weather });
  const won = tb.retreated ? false : tb.routed ? tb.routed === 'def' : score > 1;
  const q = Math.max(score, 1 / Math.max(0.01, score));
  const rough = tb.terrain.rough ? BALANCE.pursuitRoughMul : 1;
  const winWar = won ? tb.atk.war : tb.def.war;
  let pursuitRate = BALANCE.pursuitLoss * rough * Math.min(BALANCE.pursuitRatioCap, Math.sqrt(q)) * (BALANCE.pursuitWarBase + winWar / BALANCE.pursuitWarDiv);
  if (tb.routed) pursuitRate *= C.routPursuit;
  if (tb.retreated) pursuitRate *= C.retreatPursuit;
  const aLeft = sumT(tb.atk.units), dLeft = sumT(tb.def.units);
  const reasons = [...tb.reasons];
  let pursuit: number;
  let attackerLoss: number, defenderLoss: number;
  if (won) {
    const ac = normComp(tb.atk.units);
    const pm = UNIT_KINDS.reduce((a, k) => a + (ac[k] ?? 0) * formationEffect(k, b.road, b.defenderCity, b.weather).pursuit, 0) || 1;
    pursuit = Math.round(dLeft * Math.min(0.9, pursuitRate * pm));
    attackerLoss = Math.min(tb.troops, tb.atk.clashLoss);
    defenderLoss = Math.min(tb.defTroops, tb.def.clashLoss + pursuit);
  } else {
    const dc = normComp(tb.def.units);
    pursuit = Math.round(aLeft * Math.min(0.9, pursuitRate * (1 + ((dc.cavalry ?? 0) + (dc.chariot ?? 0) * 0.5))));
    attackerLoss = Math.min(tb.troops, tb.atk.clashLoss + pursuit);
    defenderLoss = Math.min(Math.max(0, tb.defTroops - 1), tb.def.clashLoss);
  }
  const g = b.attackerGeneral;
  reasons.unshift(`[5단계 전투] ${tb.phase}/${C.phases}단계${tb.routed ? ` — ${tb.routed === 'atk' ? '공격군' : '수비군'}이 무너져 달아남` : tb.retreated ? ' — 공격군이 스스로 물러남' : ''} · 형세 ${score.toFixed(2)} — ${g.name}의 공격 ${won ? '성공' : '실패'}`);
  for (const p of tb.phases) {
    const la = sumT(p.loss.atk), ld = sumT(p.loss.def);
    reasons.push(`${p.phase}/${C.phases}단계: 공격 ${ordersText(p.orders.atk)} · 수비 ${ordersText(p.orders.def)} → 손실 ${la.toLocaleString()} 대 ${ld.toLocaleString()}`);
    for (const e of p.events) reasons.push(`  · ${e}`);
  }
  if (pursuit > 0) reasons.push(won ? `무너진 수비군을 추격해 ${pursuit.toLocaleString()}명을 더 쓰러뜨림` : `물러나는 공격군을 수비군이 뒤쫓아 ${pursuit.toLocaleString()}명을 더 쓰러뜨림`);
  const fireOk = tb.phases.some((p) => p.events.some((e) => e.includes('화공 성공')) && Object.values(p.orders.atk).some((o) => o?.tactic === 'fire'));
  const tactic = tb.opening ? { kind: tb.opening.kind, success: tb.opening.success, chance: tb.opening.chance } : fireOk ? { kind: 'fire' as TacticKind, success: true, chance: 1 } : undefined;
  return {
    attackerPower: Math.round(sumT(tb.atk.init) * tb.atk.per), defenderPower: Math.round(sumT(tb.def.init) * tb.def.per),
    attackerLoss, defenderLoss: Math.max(0, defenderLoss), won, reasons: reasons.map(fixJosa), tactic,
    defenderSurvivors: won ? tb.defTroops - defenderLoss : undefined,
    phases: { clashAttacker: tb.atk.clashLoss, clashDefender: tb.def.clashLoss, pursuit, pursuer: won ? 'attacker' : 'defender' },
    duel: tb.duel, comp: aLeft > 0 ? normComp(tb.atk.units) : normComp(b.attackerComp), defComp: normComp(b.defenderComp), fortune: tb.fortune?.text,
    tactical: tb.phases.map((p) => ({ phase: p.phase, atk: ordersText(p.orders.atk), def: ordersText(p.orders.def), atkLoss: sumT(p.loss.atk), defLoss: sumT(p.loss.def), events: p.events })),
  };
}

export function ordersText(o: SideOrders): string {
  const parts = UNIT_KINDS.filter((k) => o[k] && o[k]!.troops > 0).map((k) => `${unitName(k).icon}${TAC_ORDERS[o[k]!.tactic].name}`);
  return parts.join(' ') || '대기';
}

// ---------------------------------------------------------------- AI 지휘

/**
 * AI의 전술 선택. rng가 없으면 무작위 갈래 없이 가장 그럴듯한 선택 (플레이어 화면의 '척후 보고'용).
 * 지력이 높으면 기병 거짓 퇴각 + 보병·궁병 매복의 연계를 노리고, 화공이 잘 될 때 쓰고, 적 기병이 많으면 창병 방진을 세운다.
 */
export function aiOrders(tb: TacBattle, side: Side, rng?: RngHolder): SideOrders {
  const me = tb[side], foe = tb[other(side)];
  const r = () => (rng ? rand(rng) : 1);
  const ph = tb.phase + 1;
  const has = (k: UnitKind) => (me.units[k] ?? 0) > 0;
  const foeTot = sumT(foe.units) || 1;
  const foeHorse = ((foe.units.cavalry ?? 0) + (foe.units.chariot ?? 0)) / foeTot;
  const foeSpear = (foe.units.spear ?? 0) / foeTot;
  const lastFoe = tb.phases[tb.phases.length - 1]?.orders[other(side)];
  const foeHeldPikes = lastFoe?.spear?.tactic === 'hold';
  const last = ph >= T().phases;
  const canHide = !last && me.hidden.length === 0 && !foe.lured;
  const combo = canHide && ph <= 3 && me.int >= 68 && has('cavalry') && (has('infantry') || has('archer')) && r() < 0.2 + (me.int - 68) / 80;
  const valleyAmbush = canHide && !combo && tb.terrain.valley && ph <= 3 && me.int >= 62 && has('archer') && r() < 0.3;
  const o: SideOrders = {};
  for (const k of kindsOf(me.units)) {
    let t: TacOrder = 'assault';
    const horse = k === 'cavalry' || k === 'chariot';
    if (me.hidden.includes(k)) t = k === 'archer' ? 'volley' : horse ? 'charge' : 'assault';
    else if (foe.lured && (k === 'cavalry' || k === 'infantry' || k === 'spear' || k === 'chariot')) t = 'flank';
    else if (k === 'archer') {
      const pf = orderChance(tb, side, k, 'fire') ?? 0;
      if (!me.fireUsed && pf >= 0.5 && ph <= 3 && !orderBlocked(tb, side, k, 'fire')) t = 'fire';
      else if (combo || valleyAmbush) t = 'ambush';
      else t = 'volley';
    } else if (k === 'cavalry') {
      if (combo) t = 'feint';
      else if (foeHeldPikes || foeSpear > 0.3) t = 'flank';
      else t = tb.terrain.open ? 'charge' : 'assault';
    } else if (k === 'chariot') t = tb.terrain.open && !foeHeldPikes ? 'charge' : 'flank';
    else if (k === 'spear') t = foeHorse > 0.2 ? 'hold' : 'assault';
    else if (k === 'infantry') {
      if (combo) t = 'ambush';
      else if (ph === 1 && me.war >= 80 && r() < 0.15 && !orderBlocked(tb, side, k, 'night')) t = 'night';
      else if (side === 'def' && tb.terrain.walled && foeHorse > 0.3) t = 'hold';
      else t = 'assault';
    }
    if (orderBlocked(tb, side, k, t) || TAC_CALIB.ban.includes(t)) t = 'assault';
    o[k] = { troops: me.units[k]!, tactic: t };
  }
  // 협공은 정면을 붙잡는 병과가 있어야 한다
  const ks = kindsOf(me.units);
  if (!ks.some((k) => FRONT.includes(o[k]!.tactic))) {
    const big = ks.filter((k) => o[k]!.tactic === 'flank').sort((a, b) => (me.units[b] ?? 0) - (me.units[a] ?? 0))[0];
    if (big) o[big] = { troops: me.units[big]!, tactic: 'assault' };
  }
  return o;
}

/** 양쪽 AI로 끝까지 (밸런스 확인·관전 autoAll·플레이어 '맡기기') */
export function autoTactical(rng: RngHolder, b: BattleInput, meta: Parameters<typeof createTacBattle>[2]): { tb: TacBattle; outcome: BattleOutcome } {
  const tb = createTacBattle(rng, b, meta);
  const plain = (side: Side): SideOrders => Object.fromEntries(kindsOf(tb[side].units).map((k) => [k, { troops: tb[side].units[k]!, tactic: 'assault' as TacOrder }]));
  while (!tb.done) playPhase(tb, rng, ['both', 'atk'].includes(TAC_CALIB.assaultOnly) ? plain('atk') : aiOrders(tb, 'atk', rng), ['both', 'def'].includes(TAC_CALIB.assaultOnly) ? plain('def') : aiOrders(tb, 'def', rng), b);
  return { tb, outcome: tacOutcome(tb, b) };
}

/** 화면용 요약 */
export const troopsText = (t: Troops) => compText(normComp(t));

/** v4.3 밸런스 확인: 자동 전투 대 5단계 자동 전투 (같은 입력, 별도 난수) */
export const TAC_CALIB = { ban: [] as string[], assaultOnly: '' as '' | 'both' | 'atk' | 'def', routA: 0, routD: 0, n: 0, autoWin: 0, tacWin: 0, agree: 0, autoAL: 0, autoDL: 0, tacAL: 0, tacDL: 0, routs: 0, phases: 0, uses: {} as Record<string, number> };
export function recordCalib(s: { rng: number }, b: BattleInput, meta: Parameters<typeof createTacBattle>[2]) {
  const h1 = { rng: (s.rng ^ 0x2545f491) | 0 }, h2 = { rng: (s.rng ^ 0x2545f491) | 0 };
  const a = resolveBattle(h1, b);
  const { tb, outcome: t } = autoTactical(h2, b, meta);
  const C = TAC_CALIB;
  const at = Math.max(1, b.attackerTroops), dt = Math.max(1, b.defenderCity.troops);
  C.n++; C.autoWin += +a.won; C.tacWin += +t.won; C.agree += +(a.won === t.won);
  C.autoAL += a.attackerLoss / at; C.autoDL += a.defenderLoss / dt; C.tacAL += t.attackerLoss / at; C.tacDL += t.defenderLoss / dt;
  C.routs += +!!tb.routed; C.routA += +(tb.routed === 'atk'); C.routD += +(tb.routed === 'def'); C.phases += tb.phase;
  for (const p of tb.phases) for (const side of ['atk', 'def'] as Side[]) for (const o of Object.values(p.orders[side])) if (o) C.uses[o.tactic] = (C.uses[o.tactic] ?? 0) + 1;
}
