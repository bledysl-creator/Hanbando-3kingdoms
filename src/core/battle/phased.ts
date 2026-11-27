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
import { compEffect, compText, counterMul, formationEffect, normComp, unitName, UNIT_KINDS, type Comp, type UnitKind } from './formation';
import { tacticChance, TACTICS, type TacticKind } from './tactics';
import { SKILLS, sideSkills, techChance, unlocks, type ActiveSkill, type SkillCond, type SkillDef, type TechDef } from './skills';
import type { RouteLabel, RouteTerrain } from './ground';

export type TacOrder = 'assault' | 'charge' | 'hold' | 'volley' | 'fire' | 'ambush' | 'feint' | 'flank' | 'night'
  // v4.4 손자병법 전술
  | 'decoy' | 'rest' | 'flood' | 'raid' | 'encircle' | 'provoke' | 'halfcross';
export type Side = 'atk' | 'def';
export type Troops = Partial<Record<UnitKind, number>>;
export interface UnitOrder { troops: number; tactic: TacOrder }
/** 병과별 명령 + (v4.4.1) 이번 단계에 쓸 고유 기술 (고유 특기 id) */
export type SideOrders = Partial<Record<UnitKind, UnitOrder>> & { tech?: string };

const ALL: UnitKind[] = ['infantry', 'spear', 'archer', 'cavalry', 'chariot'];
export const TAC_ORDERS: Record<TacOrder, { name: string; icon: string; desc: string; kinds: UnitKind[]; sun?: string; hanja?: string }> = {
  assault: { name: '정면 공격', icon: '⚔️', desc: '정면으로 맞붙는다. 이점도 약점도 없다.', kinds: ALL },
  charge: { name: '돌격', icon: '🐎', desc: '힘껏 들이친다. 기병·전차는 평지에서 매섭다. 창병 방진에 막히면 크게 다친다. 사격하는 궁병은 덮친다.', kinds: ['infantry', 'spear', 'cavalry', 'chariot'] },
  hold: { name: '방진', icon: '🛡️', desc: '방패와 창을 세우고 버틴다. 피해가 줄고 공격도 준다. 창병 방진은 돌격을 꺾는다. 협공에는 옆구리가 약하다.', kinds: ['infantry', 'spear', 'archer'] },
  volley: { name: '일제 사격', icon: '🏹', desc: '거리를 두고 쏜다. 받는 피해가 적고, 달려드는 말을 맞힌다. 비·눈에 약하다.', kinds: ['archer'] },
  fire: { name: '화공', icon: '🔥', desc: '불화살·불섶으로 적진을 태운다. 성공하면 큰 피해와 사기 저하. 지력 60 이상, 비·눈이면 못 쓴다. 한 전투에 한 번.', kinds: ['archer', 'infantry'] },
  ambush: { name: '매복', icon: '🌲', desc: '이번 단계에 숨어 싸우지 않는다. 다음 단계에 기습하면 공격 ×1.7 (골짜기 궁병은 더). 적 지력이 높거나 트인 평지면 들킨다.', kinds: ['infantry', 'spear', 'archer', 'cavalry'] },
  feint: { name: '거짓 퇴각', icon: '🏳️', desc: '지는 척 물러난다. 쫓아온 적(정면 공격·돌격·협공)은 다음 단계에 대열이 흐트러져 매복·협공에 크게 당한다.', kinds: ['infantry', 'cavalry'] },
  flank: { name: '협공', icon: '↪️', desc: '다른 병과가 정면을 붙잡는 동안 옆과 뒤를 친다. 방진·유인된 적에게 강하다. 혼자서는 약하다.', kinds: ['infantry', 'spear', 'cavalry', 'chariot'] },
  night: { name: '야습', icon: '🌙', desc: '첫 단계에만. 밤에 기습한다. 무력 65 이상, 안개 낀 날 더 좋다.', kinds: ALL, sun: '攻其無備 出其不意 (計)' },
  // ---- v4.4 손자병법에서 가져온 전술 ----
  decoy: { name: '의병', hanja: '疑兵', icon: '🚩', desc: '깃발을 늘어세우고 먼지를 일으켜 대군이 있는 듯 꾸민다. 성공하면 이번 단계 적 전체 공격 −25%. 내 병력이 적을수록 잘 통한다. 지력 55 이상.', kinds: ['infantry', 'cavalry'], sun: '能而示之不能… 虛張聲勢 (計·虛實)' },
  rest: { name: '이일대로', hanja: '以逸待勞', icon: '⛺', desc: '이번 단계는 진을 지키며 쉰다(피해 적음). 다음 단계 공격 +25%, 이번 단계 쳐들어온 적은 지쳐 다음 단계 피해 +10%.', kinds: ['infantry', 'spear', 'archer', 'cavalry'], sun: '以近待遠 以佚待勞 以飽待飢 (軍爭)' },
  flood: { name: '수공', hanja: '水攻', icon: '🌊', desc: '둑을 막았다 터뜨려 적진을 물에 잠근다. 강 길이나 비·눈일 때만, 지력 75 이상, 한 전투에 한 번. 성공하면 큰 피해와 사기 −10.', kinds: ['infantry'], sun: '以水佐攻者强 (火攻)' },
  raid: { name: '습량', hanja: '襲糧', icon: '🌾', desc: '적의 군량·치중을 기습해 태운다. 이번 단계 싸움은 약하지만, 성공하면 적 사기 −8에 남은 단계 적 공격 −8%(굶주림). 4단계까지, 한 전투에 한 번.', kinds: ['cavalry', 'infantry'], sun: '火積 火輜 / 以飽待飢 (火攻·軍爭)' },
  encircle: { name: '포위', hanja: '圍', icon: '⭕', desc: '내 병력이 적의 2배 이상일 때 둘러싼다. 공격 +25%, 적 사기 −4. 다만 갇힌 적은 사지(死地)라 공격이 10% 오른다.', kinds: ['infantry', 'spear', 'cavalry', 'chariot'], sun: '十則圍之 / 圍師必闕 (謀攻·軍爭)' },
  provoke: { name: '도발', hanja: '挑發', icon: '😤', desc: '적장을 욕보여 성나게 한다. 성공하면 다음 단계 적은 방진·매복·쉬기·거짓 퇴각을 못 하고 대열이 흐트러진다. 자존심 센 적장에게 잘 통함. 지력 60 이상.', kinds: ['infantry', 'cavalry'], sun: '忿速可侮 / 怒而撓之 (九變·計)' },
  halfcross: { name: '반도격', hanja: '半濟而擊', icon: '🌉', desc: '강을 반쯤 건너온 적을 친다. 수비 쪽, 강을 건너오는 싸움의 1~2단계에만. 공격 +60%, 피해 −20%.', kinds: ['archer', 'cavalry', 'infantry'], sun: '客絶水而來 令半濟而擊之利 (行軍)' },
};
/** 확률이 걸린 전술 (특기 성공률 보정 대상) */
export const CHANCE_ORDERS: TacOrder[] = ['fire', 'night', 'feint', 'ambush', 'decoy', 'flood', 'raid', 'provoke'];
const ATTACKS: TacOrder[] = ['assault', 'charge', 'flank', 'night', 'encircle'];
const FRONT: TacOrder[] = ['assault', 'charge', 'hold', 'volley', 'fire', 'night', 'encircle', 'halfcross', 'flood'];
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
  /** v4.4 장수 특기 (발동 확률 포함) */
  skills?: ActiveSkill[];
  /** 대표 장수 자존심 (도발이 잘 걸리는 정도) */
  pride?: number;
  /** 지난 단계에 쉰 병과 (이일대로) */
  rested?: UnitKind[];
  /** 지난 단계에 쳐들어가다 지침 */
  tired?: boolean;
  /** 도발에 걸려 격분 */
  provoked?: boolean;
  /** 군량을 잃어 굶주림 */
  starved?: boolean;
  floodUsed?: boolean;
  raidUsed?: boolean;
  /** v4.4.1 이미 쓴 고유 기술 (특기 id) / 대복병: 다음 단계 기습 배율 */
  techUsed?: string[];
  springMul?: number;
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
  /** v4.4 이번 단계에 발동한 특기 */
  skills?: { side: Side; id: string; owner: string }[];
  /** v4.4.1 이번 단계에 쓴 고유 기술 */
  techs?: { side: Side; id: string; owner: string; ok: boolean; chance: number }[];
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
  terrain: {
    walled: boolean; wall: number; valley: boolean; open: boolean; wet: boolean; fog: boolean; drought: boolean; road: string; relief: number; rough: boolean;
    /** v4.4.1 길별·방향별 지형: 강을 낀 싸움, 공격군이 올려 치는 높이(m), 길의 지형 비율 */
    river?: boolean; climb?: number; route?: RouteTerrain; label?: RouteLabel;
  };
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

/** v4.4.1 강을 낀 싸움 (도하 길이거나 강변 비율이 높은 길) */
export const isRiver = (tb: Pick<TacBattle, 'terrain'>) => tb.terrain.river ?? tb.terrain.road === 'river';
/** 올려 치는 싸움: 높은 산성이거나, 목표가 길보다 크게 높다 (高陵勿向) */
export const isUphill = (tb: Pick<TacBattle, 'terrain'>) => (tb.terrain.walled && tb.terrain.relief >= BALANCE.tactical.uphillRelief) || (tb.terrain.climb ?? 0) >= BALANCE.tactical.uphillClimb;
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
  const gr = B.ground;
  const rel = gr.rel;
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
    if (!walled && gr.open && (k === 'cavalry' || k === 'chariot')) d *= 1.05;
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
  // 수비 쪽 특기는 대표 장수와, 그다음으로 뛰어난 장수 한 명 (부장 몫)
  const dSecond = b.defenderGenerals.filter((x) => x.id !== dBest?.id).sort((x, y) => Math.max(y.stats.war, y.stats.intellect, y.stats.leadership) - Math.max(x.stats.war, x.stats.intellect, x.stats.leadership))[0];
  const skillsOn = BALANCE.skills.enabled;
  const aSkills = skillsOn ? sideSkills([{ g: B.g, deputy: false }, ...(B.dep ? [{ g: B.dep, deputy: true }] : [])]) : [];
  const dSkills = skillsOn ? sideSkills([...(dBest ? [{ g: dBest, deputy: false }] : []), ...(dSecond ? [{ g: dSecond, deputy: true }] : [])]) : [];
  const dInt = Math.max(BALANCE.neutralLeadership, ...b.defenderGenerals.map((x) => x.stats.intellect));
  const side = (faction: string | null, units: Troops, morale: number, per: number, int: number, war: number, lead: number, leaderId: string | undefined, deputyId: string | undefined, skills: ActiveSkill[], pride: number): TacSide => ({
    faction, leaderId, deputyId, units: { ...units }, init: { ...units }, morale, morale0: morale, per, int, war, lead, hidden: [], lured: false, fireUsed: false, clashLoss: 0,
    skills, pride, rested: [], tired: false, provoked: false, starved: false, floodUsed: false, raidUsed: false,
  });
  return {
    id: meta.id, turn: meta.turn, playerSide: meta.playerSide, attackerFaction: meta.attackerFaction, defenderFaction: meta.defenderFaction,
    generalId: B.g.id, deputyId: B.dep?.id, fromCity: meta.fromCity, toCity: city.id, troops: b.attackerTroops, defTroops: Math.max(0, city.troops),
    phase: 0,
    atk: side(meta.attackerFaction, atkUnits, b.attackerMorale ?? 70, (B.atk / Math.max(1, b.attackerTroops)) * atkMul, B.us.intellect, B.us.war, B.g.stats.leadership, B.g.id, B.dep?.id, aSkills, B.g.persona?.pride ?? 50),
    def: side(meta.defenderFaction, defUnits, city.morale ?? 70, (B.def / Math.max(1, city.troops)) * defMul, dInt, B.dWar, B.dLead, dBest?.id, dSecond?.id, dSkills, dBest?.persona?.pride ?? 50),
    terrain: {
      walled, wall: b.ignoreWalls ? 0 : city.wall, valley: gr.valley, open: gr.open,
      wet: !!b.weather && WET.includes(b.weather), fog: b.weather === 'fog', drought: b.weather === 'drought', road: b.road.type, relief: rel, rough: gr.rough,
      river: gr.river, climb: gr.climb, route: gr.route ?? undefined, label: gr.label,
    },
    mul, cavalryTrait: !!b.cavalryTrait, reasons, phases: [], duel: d.duel, opening, siegeId: meta.siegeId,
  };
}

// ---------------------------------------------------------------- 전술 가능 여부·확률

/** 이 병과가 이번 단계에 이 전술을 쓸 수 있나 (안 되면 이유) */
export function orderBlocked(tb: TacBattle, side: Side, k: UnitKind, t: TacOrder): string | null {
  const o = TAC_ORDERS[t];
  if (!o.kinds.includes(k)) return `${unitName(k).name}은(는) 쓸 수 없음`;
  const me = tb[side], foe = tb[other(side)];
  const C = T();
  const un = (x: TacOrder) => unlocks(me.skills, x);
  if (me.provoked && ['hold', 'ambush', 'rest', 'feint', 'decoy'].includes(t)) return '장수가 도발에 격분해 버티거나 숨지 못함';
  if (t === 'fire') {
    if (me.fireUsed) return '이번 전투에 이미 씀';
    if (tb.terrain.wet) return '비·눈에는 불이 붙지 않음';
    if (me.int < 60 && !un(t)) return '지력 60 이상 장수가 필요';
  }
  if (t === 'night') {
    if (tb.phase !== 0) return '첫 단계에만';
    if (me.war < 65 && !un(t)) return '무력 65 이상 장수가 필요';
  }
  if (t === 'ambush' && tb.phase >= C.phases - 1) return '마지막 단계에는 숨을 틈이 없음';
  if (t === 'decoy' && me.int < C.decoy.minInt && !un(t)) return `지력 ${C.decoy.minInt} 이상 장수가 필요`;
  if (t === 'rest' && tb.phase >= C.phases - 1) return '마지막 단계에는 쉴 틈이 없음';
  if (t === 'flood') {
    if (me.floodUsed) return '이번 전투에 이미 씀';
    if (tb.terrain.drought) return '가뭄에 물이 모자람';
    if (!isRiver(tb) && !tb.terrain.wet) return '강을 낀 길이거나 비·눈이 와야 함';
    if (me.int < C.flood.minInt && !un(t)) return `지력 ${C.flood.minInt} 이상 장수가 필요`;
  }
  if (t === 'raid') {
    if (me.raidUsed) return '이번 전투에 이미 씀';
    if (tb.phase >= C.phases - 1) return '4단계까지만';
    if (me.int < C.raid.minInt && !un(t)) return `지력 ${C.raid.minInt} 이상 장수가 필요`;
  }
  if (t === 'encircle' && sumT(me.units) < sumT(foe.units) * C.encircle.ratio) return `병력이 적의 ${C.encircle.ratio}배 이상이어야 함`;
  if (t === 'provoke' && me.int < C.provoke.minInt && !un(t)) return `지력 ${C.provoke.minInt} 이상 장수가 필요`;
  if (t === 'halfcross') {
    if (side !== 'def') return '지키는 쪽만';
    if (!isRiver(tb)) return '적이 강을 건너올 때만';
    if (tb.phase >= C.halfcrossPhases) return `${C.halfcrossPhases}단계까지만 (적이 다 건너옴)`;
  }
  return null;
}

/** 특기 발동값: 실제로 굴린 값(0/1) 또는 기대값(확률). 키는 skills 배열 순서 */
export type SkillAct = Record<Side, number[]>;
const expectedAct = (tb: TacBattle): SkillAct => ({ atk: (tb.atk.skills ?? []).map((a) => a.p), def: (tb.def.skills ?? []).map((a) => a.p) });

/** 특기가 이번 전술 성공률에 더하고 빼는 값 */
function skillChanceAdj(tb: TacBattle, side: Side, t: TacOrder, act: SkillAct): number {
  let d = 0;
  (tb[side].skills ?? []).forEach((a, i) => {
    const e = SKILLS[a.id]?.effect;
    if (e?.chance && (!e.orders || e.orders.includes(t))) d += act[side][i] * e.chance;
  });
  const fs = other(side);
  (tb[fs].skills ?? []).forEach((a, i) => {
    const e = SKILLS[a.id]?.effect;
    if (e?.foeChance && (!e.foeOrders || e.foeOrders.includes(t))) d -= act[fs][i] * e.foeChance;
  });
  return d;
}

/** 특기 보정 전 기본 성공률 */
function baseChance(tb: TacBattle, side: Side, k: UnitKind, t: TacOrder): number | null {
  const me = tb[side], foe = tb[other(side)];
  const C = T();
  const outnum = sumT(me.units) < sumT(foe.units) * 0.8;
  if (t === 'fire') {
    const counter = Math.max(0, foe.int - 60) / 200;
    return Math.max(0.05, Math.min(0.9, (me.int - 50) / 60 + (tb.terrain.drought ? 0.2 : 0) + (isRiver(tb) ? -0.1 : 0) - counter));
  }
  if (t === 'night') return Math.max(0.05, Math.min(0.9, (me.war - 40) / 90 + (tb.terrain.fog ? 0.2 : 0) - Math.max(0, foe.int - 60) / 200));
  if (t === 'feint') {
    const f = C.feintChance;
    return Math.max(f.min, Math.min(f.max, f.base + (me.int - foe.int) / f.div));
  }
  if (t === 'ambush') {
    const a = C.ambushFound;
    const found = Math.max(a.min, Math.min(a.max, a.base + (foe.int - me.int) / a.div - (tb.terrain.valley ? a.valley : 0) + (tb.terrain.open ? a.open : 0) + (k === 'cavalry' ? 0.08 : 0)));
    return 1 - found;
  }
  if (t === 'decoy') {
    const d = C.decoy;
    return Math.max(d.min, Math.min(d.max, d.base + (me.int - foe.int) / d.div + (outnum ? d.few : 0) + (tb.terrain.valley || tb.terrain.fog ? 0.05 : 0)));
  }
  if (t === 'flood') {
    const f = C.flood;
    return Math.max(f.min, Math.min(f.max, f.base + (me.int - 60) / f.div + (tb.terrain.wet ? f.wet : 0) + (tb.terrain.valley ? 0.05 : 0) - Math.max(0, foe.int - 60) / 200));
  }
  if (t === 'raid') {
    const r = C.raid;
    return Math.max(r.min, Math.min(r.max, r.base + (me.int + me.war - 120) / r.div - Math.max(0, foe.int - 60) / 200 + (tb.terrain.fog ? 0.1 : 0)));
  }
  if (t === 'provoke') {
    const v = C.provoke;
    return Math.max(v.min, Math.min(v.max, v.base + (me.int - foe.int) / v.div + ((foe.pride ?? 50) - 60) / v.prideDiv));
  }
  return null;
}

/** 확률이 걸린 전술의 성공률 (매복은 '들키지 않을' 확률). act가 없으면 특기는 발동 확률만큼 기대값으로 */
export function orderChance(tb: TacBattle, side: Side, k: UnitKind, t: TacOrder, act?: SkillAct): number | null {
  const base = baseChance(tb, side, k, t);
  if (base === null) return null;
  if (orderBlocked(tb, side, k, t)) return 0;
  const C = T();
  let p = base + skillChanceAdj(tb, side, t, act ?? expectedAct(tb));
  // 佯北勿從: 지혜로운 적장은 지는 척·욕보이기에 잘 넘어가지 않는다
  if ((t === 'feint' || t === 'provoke') && tb[other(side)].int >= C.wiseCap.int) p = Math.min(p, C.wiseCap.cap);
  return Math.max(0.03, Math.min(0.95, p));
}

/** 특기 하나가 지금 조건에 맞나 */
export function skillCondOk(tb: TacBattle, side: Side, when: SkillCond[] | undefined): boolean {
  if (!when) return true;
  const me = tb[side], foe = tb[other(side)];
  const ph = tb.phase + 1;
  const last = tb.phases[tb.phases.length - 1];
  return when.every((c) => {
    switch (c) {
      case 'early': return ph <= 2;
      case 'late': return ph >= 4;
      case 'outnumbered': return sumT(me.units) < sumT(foe.units) * 0.8;
      case 'walled': return side === 'def' && tb.terrain.walled;
      case 'water': return isRiver(tb) || tb.terrain.road === 'sea';
      case 'atk': return side === 'atk';
      case 'def': return side === 'def';
      case 'fog': return tb.terrain.fog;
      case 'rough': return tb.terrain.rough;
      case 'losing': return !!last && (side === 'atk' ? last.ratio < 1 : last.ratio > 1);
    }
    return true;
  });
}

/** 특기가 이 병과·전술에 걸리나 */
function skillHits(e: SkillDef['effect'], kind: UnitKind, tactic: TacOrder, springs: boolean): boolean {
  if (e.kinds && !e.kinds.includes(kind)) return false;
  if (e.orders && !e.orders.includes(tactic) && !(springs && e.orders.includes('ambush'))) return false;
  return true;
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
  if (o?.tech) {
    const opt = techOptions(tb, side).find((x) => x.id === o.tech);
    if (opt && !opt.blocked) out.tech = o.tech;
  }
  return out;
}

// ---------------------------------------------------------------- v4.4.1 고유 기술

interface TechRun { t: TechDef; a: number; p: number; owner: string; id: string }
export interface TechOption { id: string; owner: string; ownerId: string; tech: TechDef; p: number; blocked: string | null }

/** 이 쪽 장수들의 고유 기술과 지금 쓸 수 있는지 */
export function techOptions(tb: TacBattle, side: Side): TechOption[] {
  if (!BALANCE.skills.tech) return [];
  const me = tb[side], foe = tb[other(side)];
  const out: TechOption[] = [];
  for (const sk of me.skills ?? []) {
    const def = SKILLS[sk.id];
    const t = def?.tech;
    if (!t) continue;
    const p = techChance(t, sk.v ?? BALANCE.skills.uniqueRef, !!sk.deputy, foe.int);
    out.push({ id: sk.id, owner: sk.owner, ownerId: sk.ownerId, tech: t, p, blocked: techBlocked(tb, side, sk.id, t) });
  }
  return out;
}

export function techBlocked(tb: TacBattle, side: Side, id: string, t: TechDef): string | null {
  const me = tb[side];
  if ((me.techUsed ?? []).includes(id)) return '이번 전투에 이미 씀';
  if (sumT(me.units) <= 0) return '병력이 없음';
  const ph = tb.phase + 1;
  const last = tb.phases[tb.phases.length - 1];
  for (const n of t.need ?? []) {
    if (n === 'dry' && tb.terrain.wet) return '비·눈에는 불이 붙지 않음';
    if (n === 'wet' && !isRiver(tb) && tb.terrain.road !== 'sea' && !tb.terrain.wet) return '강을 낀 길이거나 비·눈이 와야 함';
    if (n === 'atk' && side !== 'atk') return '공격할 때만';
    if (n === 'def' && side !== 'def') return '지킬 때만';
    if (n === 'walled' && !(side === 'def' && tb.terrain.walled)) return '성벽 위에서 지킬 때만';
    if (n === 'rough' && !tb.terrain.rough) return '험한 길에서만';
    if (n === 'losing' && !(last && (side === 'atk' ? last.ratio < 1 : last.ratio > 1))) return '형세가 불리할 때만';
    if (n === 'notLast' && ph >= T().phases) return '마지막 단계에는 못 씀';
    if (n === 'midLate' && ph < 3) return '3단계부터';
  }
  return null;
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
  next: Record<Side, NextState>;
  /** 확률 전술 결과 (예상 모드에서는 확률만) */
  rolls: { side: Side; kind: UnitKind; tactic: TacOrder; chance: number; ok?: boolean }[];
  power: Record<Side, number>;
  /** 성벽 배율을 뺀 손실 (형세 계산용) */
  plainLoss: Record<Side, number>;
  /** v4.4 이번 단계에 발동한 특기 (예상 모드는 발동 확률) */
  skills: { side: Side; id: string; owner: string; name: string; hanja: string; a: number }[];
  /** 무너지는 사기 기준을 낮추는 값 (특기·사지) */
  rally: Record<Side, number>;
  /** v4.4.1 이번 단계 고유 기술 (예상 모드는 ok=false, chance만) */
  techs?: { side: Side; id: string; owner: string; ok: boolean; chance: number }[];
  /** 정리된 이번 단계 명령 (기록용: 단계를 치른 뒤에는 화공 등 한 번 쓰는 전술이 막혀 다시 정리하면 달라진다) */
  orders: Record<Side, SideOrders>;
}
interface NextState { hidden: UnitKind[]; lured: boolean; fireUsed: boolean; rested: UnitKind[]; tired: boolean; provoked: boolean; starved: boolean; floodUsed: boolean; raidUsed: boolean; techUsed: string[]; springMul: number }

type Roll = (p: number) => number; // 성공이면 1, 실패면 0 (예상 모드는 p를 돌려 기대값을 섞는다)

/** 한 단계를 계산한다. roll이 없으면 기대값(예상)으로, 있으면 실제로 굴린다. 상태는 바꾸지 않는다 */
export function evalPhase(tb: TacBattle, oA: SideOrders, oD: SideOrders, rng?: RngHolder): PhaseEval {
  const C = T();
  const orders: Record<Side, SideOrders> = { atk: cleanOrders(tb, 'atk', oA), def: cleanOrders(tb, 'def', oD) };
  const roll: Roll = rng ? (p) => (rand(rng) < p ? 1 : 0) : (p) => p;
  const rolls: PhaseEval['rolls'] = [];
  const events: string[] = [];
  const name = (side: Side) => (side === 'atk' ? '공격군' : '수비군');
  const nextOf = (x: TacSide): NextState => ({ hidden: [], lured: false, fireUsed: x.fireUsed, rested: [], tired: false, provoked: false, starved: !!x.starved, floodUsed: !!x.floodUsed, raidUsed: !!x.raidUsed, techUsed: [...(x.techUsed ?? [])], springMul: 1 });
  const next: PhaseEval['next'] = { atk: nextOf(tb.atk), def: nextOf(tb.def) };
  const moraleD: Record<Side, number> = { atk: 0, def: 0 };
  const rally: Record<Side, number> = { atk: 0, def: 0 };
  const foeStrike: Record<Side, number> = { atk: 1, def: 1 }; // 이 쪽 공격에 곱하는 적 특기·의병 효과
  const ev: Record<Side, UnitEval[]> = { atk: [], def: [] };
  const blend = (p: number, a: { s: number; e: number }, b: { s: number; e: number }) => ({ s: p * a.s + (1 - p) * b.s, e: p * a.e + (1 - p) * b.e });

  // 0) v4.4.1 고유 기술: 명령에 든 기술을 능력치 확률로 굴린다 (전투당 한 번)
  const tech: Record<Side, TechRun | null> = { atk: null, def: null };
  const techRes: NonNullable<PhaseEval['techs']> = [];
  for (const side of ['atk', 'def'] as Side[]) {
    const id = orders[side].tech;
    if (!id) continue;
    const opt = techOptions(tb, side).find((x) => x.id === id);
    if (!opt || opt.blocked) continue;
    const a = roll(opt.p);
    tech[side] = { t: opt.tech, a, p: opt.p, owner: opt.owner, id };
    next[side].techUsed.push(id);
    techRes.push({ side, id, owner: opt.owner, ok: rng ? a === 1 : false, chance: opt.p });
    if (rng) events.push(a ? `⭐ ${name(side)} ${opt.owner}의 고유 기술 「${opt.tech.name}(${opt.tech.hanja})」 성공! (성공률 ${Math.round(opt.p * 100)}%)` : `⭐ ${name(side)} ${opt.owner}의 고유 기술 「${opt.tech.name}」이(가) 실패 (성공률 ${Math.round(opt.p * 100)}%)`);
  }
  /** 계중계: 이 쪽의 특기·계략이 막히는 정도 (0~1) */
  const nullified: Record<Side, number> = { atk: 0, def: 0 };
  for (const side of ['atk', 'def'] as Side[]) {
    const r = tech[side];
    if (!r) continue;
    const { t, a } = r;
    if (t.nullify) nullified[other(side)] = a;
    if (t.foeStrike) foeStrike[other(side)] *= 1 + a * (t.foeStrike - 1);
    if (t.morale) moraleD[other(side)] -= a * t.morale * BALANCE.skills.techMoraleMul;
    if (t.heal) moraleD[side] += a * t.heal * BALANCE.skills.techMoraleMul;
    if (t.rally) rally[side] += a * t.rally;
    moraleD[side] -= (1 - a) * (t.failMorale ?? BALANCE.skills.techFailMorale);
    if (rng && a) {
      if (t.lure) { next[other(side)].lured = true; moraleD[other(side)] -= C.lureMorale; }
      if (t.starve) next[other(side)].starved = true;
      if (t.tire) next[other(side)].tired = true;
      if (t.hideAll) { next[side].hidden = kindsOf(tb[side].units); next[side].springMul = t.springMul ?? 1; }
    }
  }
  const techMul = (side: Side, kind: UnitKind) => {
    let sm = 1, em = 1;
    const mine = tech[side], foe = tech[other(side)];
    if (mine) {
      if (mine.t.strike && (!mine.t.kinds || mine.t.kinds.includes(kind))) sm *= 1 + mine.a * (mine.t.strike - 1);
      if (mine.t.expose) em *= 1 + mine.a * (mine.t.expose - 1);
    }
    if (foe?.t.foeExpose) em *= 1 + foe.a * (foe.t.foeExpose - 1);
    return { sm, em };
  };

  // 0-1) 장수 특기 발동: 조건이 맞고 쓰는 전술이 걸리는 특기만 능력치 확률로 굴린다 (계중계에 걸리면 막힘)
  const act: SkillAct = { atk: [], def: [] };
  const skillRes: PhaseEval['skills'] = [];
  for (const side of ['atk', 'def'] as Side[]) {
    const me = tb[side];
    (me.skills ?? []).forEach((sk, i) => {
      const def = SKILLS[sk.id];
      const e = def?.effect;
      let a = 0;
      if (e && skillCondOk(tb, side, e.when)) {
        const used = kindsOf(me.units).some((k) => {
          const o = orders[side][k];
          return !!o && o.troops > 0 && skillHits({ ...e, kinds: undefined }, k, o.tactic, me.hidden.includes(k) && o.tactic !== 'ambush');
        });
        if (!e.orders || used) a = roll(sk.p * (1 - nullified[side]));
      }
      act[side][i] = a;
      if (a > 0 && def) {
        skillRes.push({ side, id: sk.id, owner: sk.owner, name: def.name, hanja: def.hanja, a });
        if (e!.foeStrike) foeStrike[other(side)] *= 1 + a * (e!.foeStrike - 1);
        if (e!.morale) moraleD[other(side)] -= a * e!.morale;
        if (e!.rally) rally[side] += a * e!.rally;
        if (rng && !def.passive) events.push(`✨ ${name(side)} ${sk.owner}의 특기 「${def.name}(${def.hanja})」 발동!`);
      }
    });
  }
  const skillMul = (side: Side, kind: UnitKind, tactic: TacOrder, springs: boolean) => {
    let sm = 1, em = 1;
    (tb[side].skills ?? []).forEach((sk, i) => {
      const a = act[side][i];
      const e = SKILLS[sk.id]?.effect;
      if (!a || !e || !skillHits(e, kind, tactic, springs)) return;
      if (e.strike) sm *= 1 + a * (e.strike - 1);
      if (e.expose) em *= 1 + a * (e.expose - 1);
    });
    return { sm, em };
  };
  const fireWeak = (side: Side) => (tb[side].skills ?? []).reduce((m, sk, i) => m * (SKILLS[sk.id]?.effect.fireWeak && act[side][i] ? SKILLS[sk.id].effect.fireWeak! : 1), 1);
  // 사지(死地則戰): 적에게 크게 몰린 쪽은 덜 무너지고 더 사납게 싸운다
  const dg: Record<Side, boolean> = { atk: false, def: false };
  for (const side of ['atk', 'def'] as Side[]) {
    if (sumT(tb[side].units) <= sumT(tb[other(side)].units) * C.deathGround.ratio) {
      dg[side] = true;
      rally[side] += C.deathGround.rally;
      if (rng && !tb.phases.some((p) => p.events.some((x) => x.includes(`${name(side)}이 사지`)))) events.push(`☠️ ${name(side)}이 사지(死地)에 몰려 결사적으로 싸움 — 덜 무너지고 공격 +${Math.round((C.deathGround.strike - 1) * 100)}%`);
    }
  }

  // 1) 병과마다 전술의 기본 배율
  for (const side of ['atk', 'def'] as Side[]) {
    const me = tb[side], foe = tb[other(side)];
    for (const k of kindsOf(me.units)) {
      const o = orders[side][k]!;
      let { s, e } = O('assault');
      const t = o.tactic;
      let hidden = false;
      const springs = me.hidden.includes(k) && t !== 'ambush';
      const chance = () => orderChance(tb, side, k, t, act)! * (1 - nullified[side]);
      const okEvent = (ok: number, p: number, extra = '') => {
        if (rng) events.push(ok ? `${TAC_ORDERS[t].icon} ${name(side)} ${unitName(k).name}의 ${TAC_ORDERS[t].name} 성공!${extra} (성공률 ${Math.round(p * 100)}%)` : `${TAC_ORDERS[t].icon} ${name(side)} ${unitName(k).name}의 ${TAC_ORDERS[t].name}이(가) 실패 (성공률 ${Math.round(p * 100)}%)`);
      };
      if (t === 'charge') {
        ({ s, e } = O(k === 'cavalry' ? 'chargeHorse' : k === 'chariot' ? 'chargeChariot' : 'charge'));
        if (side === 'atk' && tb.terrain.rough) s *= C.narrowCharge;
        if (side === 'atk' && isUphill(tb)) s *= C.uphillCharge;
      } else if (t === 'hold') {
        ({ s, e } = O('hold'));
        if (side === 'def' && tb.terrain.rough) { s *= C.narrowHold.s; e *= C.narrowHold.e; }
      } else if (t === 'volley') { ({ s, e } = O('volley')); if (tb.terrain.wet) s *= C.volleyWet; }
      else if (t === 'fire' || t === 'night') {
        const p = chance();
        const ok = roll(p);
        rolls.push({ side, kind: k, tactic: t, chance: p, ok: rng ? ok === 1 : undefined });
        ({ s, e } = blend(ok, O(t === 'fire' ? 'fireOk' : 'nightOk'), O(t === 'fire' ? 'fireFail' : 'nightFail')));
        const weak = t === 'fire' ? fireWeak(other(side)) : 1;
        if (weak > 1) s *= 1 + ok * (weak - 1);
        moraleD[other(side)] -= ok * C.moraleHit[t];
        if (t === 'fire') next[side].fireUsed = true;
        okEvent(ok, p, weak > 1 ? ' — 기름 먹인 등갑에 불이 옮겨붙음' : '');
      } else if (t === 'ambush') {
        const p = chance(); // 들키지 않을 확률
        const safe = roll(p);
        rolls.push({ side, kind: k, tactic: t, chance: p, ok: rng ? safe === 1 : undefined });
        // 숨은 병력은 싸우지 않는다. 들키면 숨은 채로 몰려 맞는다
        s = (1 - safe) * O('found').s; e = (1 - safe) * O('found').e;
        hidden = safe === 1 || !rng;
        if (rng && safe) next[side].hidden.push(k);
        if (rng && !safe) { events.push(`👁️ ${name(side)} ${unitName(k).name}의 매복이 ${name(other(side))}에게 들킴! (지력 ${foe.int} 대 ${me.int})`); moraleD[side] -= 4; }
      } else if (t === 'feint') {
        const p = chance();
        const ok = roll(p);
        rolls.push({ side, kind: k, tactic: t, chance: p, ok: rng ? ok === 1 : undefined });
        ({ s, e } = blend(ok, O('feint'), O('feintFail')));
        moraleD[side] -= (1 - ok) * C.moraleHit.feintFail;
      } else if (t === 'flank') {
        const anchor = kindsOf(me.units).some((j) => j !== k && FRONT.includes(orders[side][j]!.tactic) && orders[side][j]!.troops > 0);
        ({ s, e } = O(anchor ? 'flank' : 'flankAlone'));
        if (foe.lured) s *= C.lureBonus;
      } else if (t === 'decoy') {
        const p = chance();
        const ok = roll(p);
        rolls.push({ side, kind: k, tactic: t, chance: p, ok: rng ? ok === 1 : undefined });
        ({ s, e } = blend(ok, O('decoyOk'), O('decoyFail')));
        foeStrike[other(side)] *= 1 - ok * C.decoy.cut;
        moraleD[side] -= (1 - ok) * 4;
        if (rng) events.push(ok ? `🚩 ${name(side)}의 의병(疑兵) — 깃발과 먼지에 ${name(other(side))}이(가) 복병을 의심해 주춤함 (공격 −${Math.round(C.decoy.cut * 100)}%, 성공률 ${Math.round(p * 100)}%)` : `🚩 ${name(side)}의 의병을 ${name(other(side))}이(가) 허세로 꿰뚫어 봄 (성공률 ${Math.round(p * 100)}%)`);
      } else if (t === 'rest') {
        ({ s, e } = O('rest'));
        next[side].rested.push(k);
      } else if (t === 'flood') {
        const p = chance();
        const ok = roll(p);
        rolls.push({ side, kind: k, tactic: t, chance: p, ok: rng ? ok === 1 : undefined });
        ({ s, e } = blend(ok, O('floodOk'), O('floodFail')));
        moraleD[other(side)] -= ok * C.flood.morale;
        next[side].floodUsed = true;
        okEvent(ok, p, ' 둑을 터뜨려 적진이 물바다가 됨');
      } else if (t === 'raid') {
        const p = chance();
        const ok = roll(p);
        rolls.push({ side, kind: k, tactic: t, chance: p, ok: rng ? ok === 1 : undefined });
        ({ s, e } = blend(ok, O('raidOk'), O('raidFail')));
        moraleD[other(side)] -= ok * C.raid.morale;
        next[side].raidUsed = true;
        if (rng && ok) next[other(side)].starved = true;
        okEvent(ok, p, ` ${name(other(side))}의 군량이 불타 굶주리기 시작함`);
      } else if (t === 'encircle') {
        ({ s, e } = O('encircle'));
      } else if (t === 'provoke') {
        const p = chance();
        const ok = roll(p);
        rolls.push({ side, kind: k, tactic: t, chance: p, ok: rng ? ok === 1 : undefined });
        ({ s, e } = blend(ok, O('provokeOk'), O('provokeFail')));
        if (rng && ok) next[other(side)].provoked = true;
        okEvent(ok, p, ` 성난 ${name(other(side))} 장수가 다음 단계에 앞뒤 없이 달려듦`);
      } else if (t === 'halfcross') {
        ({ s, e } = O('halfcross'));
      }
      if (springs) {
        s *= C.ambushSpring * (k === 'archer' && tb.terrain.valley ? C.valleyArcher : 1) * (foe.lured ? C.lureBonus : 1) * (me.springMul ?? 1);
        moraleD[other(side)] -= C.moraleHit.ambush;
        if (rng) events.push(`🌲 매복해 있던 ${name(side)} ${unitName(k).name}이(가) 뛰쳐나와 기습!${k === 'archer' && tb.terrain.valley ? ' (골짜기 양쪽에서 화살비)' : ''}${foe.lured ? ' — 쫓아온 적이 한가운데 갇힘' : ''}`);
      }
      // 이일대로: 지난 단계에 쉰 병과가 지친 적을 친다
      if ((me.rested ?? []).includes(k) && t !== 'rest' && ATTACKS.concat(['volley', 'halfcross']).includes(t)) {
        s *= C.restBonus;
        if (rng) events.push(`⛺ 쉬고 있던 ${name(side)} ${unitName(k).name}이(가) 힘을 모아 침 (以逸待勞)`);
      }
      if (me.lured && PURSUERS.includes(t)) e *= C.lureExpose;
      if (me.provoked) e *= C.lureExpose;
      if (me.tired) e *= C.tiredExpose;
      if (k === 'archer' && t !== 'ambush') e *= BALANCE.formation.archerOwnLoss;
      // 특기
      const sk = skillMul(side, k, t, springs);
      s *= sk.sm; e *= sk.em;
      // 고유 기술
      const tm = techMul(side, k);
      s *= tm.sm; e *= tm.em;
      const hideAll = tech[side]?.t.hideAll ? tech[side]!.a : 0;
      if (hideAll > 0) { s *= 1 - hideAll; e = e * (1 - hideAll) + hideAll * C.techHideExpose; hidden = hidden || !rng || hideAll === 1; }
      ev[side].push({ kind: k, troops: o.troops, reserve: me.units[k]! - o.troops, tactic: t, s, e, strike: 0, expo: 0, hidden, springs });
    }
  }
  // 포위당한 쪽은 사지라 더 사납게 싸운다 (圍師必闕을 어긴 대가)
  for (const side of ['atk', 'def'] as Side[]) {
    if (ev[side].some((u) => u.tactic === 'encircle' && u.troops > 0)) {
      moraleD[other(side)] -= C.encircle.morale;
      if (!dg[other(side)]) rally[other(side)] += C.deathGround.rally / 2;
      dg[other(side)] = true;
      if (rng) events.push(`⭕ ${name(side)}이(가) ${name(other(side))}을(를) 에워쌈 — 갇힌 적은 사지에서 결사적으로 싸움`);
    }
  }
  // 이일대로: 쉬는 적에게 쳐들어간 쪽은 다음 단계 지친다
  for (const side of ['atk', 'def'] as Side[]) {
    const foeRests = ev[other(side)].some((u) => u.tactic === 'rest' && u.troops > 0);
    const myAtk = ev[side].filter((u) => ATTACKS.includes(u.tactic)).reduce((a, u) => a + u.troops, 0);
    if (foeRests && myAtk > sumT(tb[side].units) * 0.4) next[side].tired = true;
  }

  // 2) 상대 전술과의 상성 + 병종 상성(공격군만, 자동 전투와 같음)
  const P = C.pair;
  const visible = (side: Side) => ev[side].filter((u) => !u.hidden);
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
    // 기세(朝氣銳 晝氣惰 暮氣歸): 공격군은 처음에 날카롭고 갈수록 무뎌진다
    const spirit = side === 'atk' ? C.spirit[Math.min(C.spirit.length - 1, tb.phase)] ?? 1 : 1;
    const starve = me.starved ? C.raid.starve : 1;
    const death = dg[side] ? C.deathGround.strike : 1;
    const env = morale * open * fort * spirit * starve * death * foeStrike[side];
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
      u.strike = (u.troops * u.s * sm + u.reserve * O('reserve').s) * cm * base * me.per * env;
      const vis = !u.hidden;
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
  // 3-1) 고유 기술의 큰 피해 (대화공·수엄·겁영 등): 적 병력을 곧바로 없앤다
  for (const side of ['atk', 'def'] as Side[]) {
    const r = tech[side];
    if (!r?.t.kill || !r.a) continue;
    const foeSide = other(side);
    const water = isRiver(tb) || tb.terrain.road === 'sea';
    const fire = r.t.need?.includes('dry') ? fireWeak(foeSide) : 1;
    const rate = Math.min(C.techKillCap, r.t.kill * (water && r.t.waterMul ? r.t.waterMul : 1) * fire) * r.a;
    let killed = 0;
    for (const k of kindsOf(tb[foeSide].units)) {
      const have = (tb[foeSide].units[k] ?? 0) - (loss[foeSide][k] ?? 0);
      const n = Math.max(0, Math.min(have, Math.round((tb[foeSide].units[k] ?? 0) * rate)));
      loss[foeSide][k] = (loss[foeSide][k] ?? 0) + n;
      killed += n;
    }
    plainLoss[foeSide] += killed;
    const top = ev[side].filter((u) => u.troops > 0).sort((a, b) => b.troops - a.troops)[0];
    if (top) dealt[side][top.kind] = (dealt[side][top.kind] ?? 0) + killed;
    if (rng && killed) events.push(`💥 「${r.t.name}」에 ${name(foeSide)} ${killed.toLocaleString()}명이 한꺼번에 쓰러짐${water && r.t.waterMul ? ' (물 위라 더 크게 번짐)' : ''}${fire > 1 ? ' — 등갑에 불이 옮겨붙음' : ''}`);
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
  return { ratio, loss, dealt, morale, events, next, rolls, power: { atk: pA, def: pD }, plainLoss, skills: skillRes, rally, orders, techs: techRes };
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
    const nx = ev.next[side];
    me.hidden = nx.hidden;
    me.lured = nx.lured;
    me.fireUsed = nx.fireUsed;
    me.rested = nx.rested;
    me.tired = nx.tired;
    me.provoked = nx.provoked;
    me.starved = nx.starved;
    me.floodUsed = nx.floodUsed;
    me.raidUsed = nx.raidUsed;
    me.techUsed = nx.techUsed;
    me.springMul = nx.springMul;
  }
  tb.phases.push({ phase: ph, orders: ev.orders, techs: ev.techs?.length ? ev.techs : undefined, skills: ev.skills.filter((x) => x.a > 0).map((x) => ({ side: x.side, id: x.id, owner: x.owner })), loss: ev.loss, ratio: ev.ratio, morale: { atk: Math.round(tb.atk.morale), def: Math.round(tb.def.morale) }, events: ev.events.map(fixJosa) });
  tb.phase = ph;
  const C = T();
  const broken = (s: Side) => tb[s].morale < Math.min(C.routMorale, tb[s].morale0 - C.routDrop) - ev.rally[s] || sumT(tb[s].units) < sumT(tb[s].init) * (C.routRemain - ev.rally[s] / 200);
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
  const fireOk = tb.phases.some((p) => p.events.some((e) => e.includes('화공 성공')) && Object.values(p.orders.atk).some((o) => typeof o === 'object' && o?.tactic === 'fire'));
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
  const t = o.tech ? SKILLS[o.tech]?.tech : undefined;
  return (t ? `⭐${t.name} ` : '') + (parts.join(' ') || '대기');
}

// ---------------------------------------------------------------- AI 지휘

/**
 * AI의 전술 선택. rng가 없으면 무작위 갈래 없이 가장 그럴듯한 선택 (플레이어 화면의 '척후 보고'용).
 * 지력이 높으면 기병 거짓 퇴각 + 보병·궁병 매복의 연계를 노리고, 화공·수공이 잘 될 때 쓰고, 적 기병이 많으면 창병 방진을 세운다.
 * v4.4: 손자병법 전술 — 강을 건너오는 적은 반도격, 병력이 적으면 의병, 두 배 넘으면 포위, 자존심 센 적장은 도발,
 * 장수 특기가 밀어 주는 전술(장비 의병·관우 수공·조조 습량·사마의 이일대로 …)은 더 자주 고른다.
 */
export function aiOrders(tb: TacBattle, side: Side, rng?: RngHolder): SideOrders {
  const me = tb[side], foe = tb[other(side)];
  const C = T();
  const r = () => (rng ? rand(rng) : 1);
  const ph = tb.phase + 1;
  const has = (k: UnitKind) => (me.units[k] ?? 0) > 0;
  const foeTot = sumT(foe.units) || 1, myTot = sumT(me.units);
  const foeHorse = ((foe.units.cavalry ?? 0) + (foe.units.chariot ?? 0)) / foeTot;
  const foeSpear = (foe.units.spear ?? 0) / foeTot;
  const lastFoe = tb.phases[tb.phases.length - 1]?.orders[other(side)];
  const foeHeldPikes = lastFoe?.spear?.tactic === 'hold';
  const last = ph >= C.phases;
  const canHide = !last && me.hidden.length === 0 && !foe.lured && !me.provoked;
  const ok = (k: UnitKind, t: TacOrder) => !orderBlocked(tb, side, k, t) && !TAC_CALIB.ban.includes(t);
  const ch = (k: UnitKind, t: TacOrder) => (ok(k, t) ? orderChance(tb, side, k, t) ?? 0 : 0);
  /** 내 특기가 이 전술을 밀어 주나 */
  const favored = (t: TacOrder) => (me.skills ?? []).some((a) => { const e = SKILLS[a.id]?.effect; return !!e?.orders?.includes(t) && (!!e.strike && e.strike > 1 || !!e.chance || !!e.unlock) && skillCondOk(tb, side, e.when); });
  const combo = canHide && ph <= 3 && me.int >= 68 && has('cavalry') && (has('infantry') || has('archer')) && r() < 0.2 + (me.int - 68) / 80 + (favored('ambush') || favored('feint') ? 0.15 : 0);
  const valleyAmbush = canHide && !combo && tb.terrain.valley && ph <= 3 && me.int >= 62 && has('archer') && r() < 0.3 + (favored('ambush') ? 0.2 : 0);
  // 한 전투에 한 번 쓰는 큰 계략: 수공 > 습량
  const floodK: UnitKind | null = has('infantry') && ph <= 3 && ch('infantry', 'flood') >= (favored('flood') ? 0.35 : 0.5) ? 'infantry' : null;
  const raidK: UnitKind | null = !floodK && !combo && ph <= 3 && ((has('cavalry') && ch('cavalry', 'raid') >= 0.4) || (favored('raid') && has('cavalry') && ch('cavalry', 'raid') >= 0.3)) && (favored('raid') || r() < 0.35) ? 'cavalry' : null;
  const outnumbered = myTot < foeTot * 0.7;
  const decoyK: UnitKind | null = !floodK && ph <= 3 && (outnumbered || favored('decoy')) && has('infantry') && ch('infantry', 'decoy') >= 0.45 && (favored('decoy') || r() < 0.5) ? 'infantry' : null;
  const provokeK: UnitKind | null = !floodK && !decoyK && ph <= 2 && has('infantry') && ch('infantry', 'provoke') >= (favored('provoke') ? 0.4 : 0.5) && (foe.pride ?? 50) >= 70 && (favored('provoke') || r() < 0.4) ? 'infantry' : null;
  // 이일대로: 수비가 지력이 높거나 특기가 있으면 첫 단계에 쉬며 적이 지치기를 기다린다
  const restK = !last && ph <= 2 && !combo && (favored('rest') || (side === 'def' && me.int >= 75 && r() < 0.25)) ? true : false;
  const encircleOk = myTot >= foeTot * C.encircle.ratio;
  const o: SideOrders = {};
  for (const k of kindsOf(me.units)) {
    let t: TacOrder = 'assault';
    const horse = k === 'cavalry' || k === 'chariot';
    if (me.hidden.includes(k)) t = k === 'archer' ? 'volley' : horse ? 'charge' : 'assault';
    else if (k === floodK) t = 'flood';
    else if (k === decoyK) t = 'decoy';
    else if (k === provokeK) t = 'provoke';
    else if (foe.lured && (k === 'cavalry' || k === 'infantry' || k === 'spear' || k === 'chariot')) t = 'flank';
    else if (ok(k, 'halfcross') && k !== 'cavalry') t = 'halfcross';
    else if (k === 'archer') {
      const pf = ch(k, 'fire');
      if (!me.fireUsed && pf >= (favored('fire') ? 0.4 : 0.5) && ph <= 3) t = 'fire';
      else if (combo || valleyAmbush) t = 'ambush';
      else if (restK && (me.rested ?? []).length === 0 && ph === 1) t = 'rest';
      else t = 'volley';
    } else if (k === 'cavalry') {
      if (combo) t = 'feint';
      else if (k === raidK) t = 'raid';
      else if (ok(k, 'halfcross')) t = 'halfcross';
      else if (foeHeldPikes || foeSpear > 0.3) t = 'flank';
      else if (encircleOk && ok(k, 'encircle') && !tb.terrain.rough) t = 'encircle';
      else if (ph === 1 && me.war >= 80 && ok(k, 'night') && (favored('night') ? r() < 0.6 : r() < 0.1)) t = 'night';
      else t = tb.terrain.open || favored('charge') ? 'charge' : 'assault';
    } else if (k === 'chariot') t = tb.terrain.open && !foeHeldPikes ? 'charge' : 'flank';
    else if (k === 'spear') t = foeHorse > 0.2 ? 'hold' : encircleOk && ok(k, 'encircle') ? 'encircle' : restK && ph === 1 ? 'rest' : 'assault';
    else if (k === 'infantry') {
      if (combo) t = 'ambush';
      else if (ph === 1 && me.war >= 80 && r() < 0.15 + (favored('night') ? 0.3 : 0) && ok(k, 'night')) t = 'night';
      else if (restK && ph === 1) t = 'rest';
      else if (side === 'def' && (tb.terrain.walled || tb.terrain.rough) && (foeHorse > 0.3 || favored('hold'))) t = 'hold';
      else if (encircleOk && ok(k, 'encircle')) t = 'encircle';
      else t = 'assault';
    }
    if (me.provoked && horse && t !== 'flank') t = 'charge';
    if (!ok(k, t)) t = 'assault';
    o[k] = { troops: me.units[k]!, tactic: t };
  }
  // 협공은 정면을 붙잡는 병과가 있어야 한다
  const ks = kindsOf(me.units);
  if (!ks.some((k) => FRONT.includes(o[k]!.tactic))) {
    const big = ks.filter((k) => o[k]!.tactic === 'flank').sort((a, b) => (me.units[b] ?? 0) - (me.units[a] ?? 0))[0];
    if (big) o[big] = { troops: me.units[big]!, tactic: 'assault' };
  }
  const tk = aiTech(tb, side, r);
  if (tk) o.tech = tk;
  return o;
}

/** v4.4.1 AI 고유 기술: 큰 피해 기술은 바로, 숨기·유인·계중계는 앞 단계에, 버티기 기술은 불리할 때, 공격 기술은 2단계부터 */
function aiTech(tb: TacBattle, side: Side, r: () => number): string | undefined {
  if (TAC_CALIB.ban.includes('tech') || TAC_CALIB.ban.includes(`tech-${side}`)) return undefined;
  const opts = techOptions(tb, side).filter((x) => !x.blocked && x.p >= 0.35);
  if (!opts.length) return undefined;
  const ph = tb.phase + 1;
  const last = tb.phases[tb.phases.length - 1];
  const losing = !!last && (side === 'atk' ? last.ratio < 1 : last.ratio > 1);
  const me = tb[side], foe = tb[other(side)];
  const outnum = sumT(me.units) < sumT(foe.units) * 0.8;
  let best: TechOption | null = null, score = 0;
  for (const o of opts) {
    const t = o.tech;
    let w: number;
    if (t.kill) w = 1;
    else if (t.hideAll || t.lure || t.nullify || t.starve) w = ph <= 3 ? 0.9 : 0.2;
    else if (!t.strike && (t.expose ?? 1) < 1) w = losing ? 0.9 : ph >= 3 ? 0.6 : outnum ? 0.3 : 0.15;
    else if (!t.strike && (t.heal || t.rally)) w = losing ? 0.9 : ph >= 4 ? 0.5 : 0.1;
    else w = ph >= 2 || losing || outnum ? 0.75 : 0.35;
    w *= o.p;
    if (w > score) { score = w; best = o; }
  }
  return best && r() < Math.min(1, score * 1.4 + (ph >= T().phases ? 0.5 : 0)) ? best.id : undefined;
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
  for (const p of tb.phases) for (const side of ['atk', 'def'] as Side[]) { for (const o of Object.values(p.orders[side])) if (o && typeof o === 'object') C.uses[o.tactic] = (C.uses[o.tactic] ?? 0) + 1; if (p.orders[side].tech) C.uses['⭐' + p.orders[side].tech] = (C.uses['⭐' + p.orders[side].tech] ?? 0) + 1; }
}
