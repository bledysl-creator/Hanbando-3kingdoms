// 자동 계산 전투. 결과와 함께 "왜 그렇게 됐는지" 원인을 돌려준다 (Game.md 5-3).
import { BALANCE } from '../config';
import { fixJosa } from '../josa';
import { rand, randRange, type RngHolder } from '../rng/rng';
import type { City, General, Road } from '../state/types';
import { weatherAttackModifier } from '../systems/weather';
import { tacticChance, TACTICS, type TacticKind } from './tactics';
import { autoSkillMul } from './skills';
import { landmarksOfCity, landmarksOnRoad } from '../data';
import { commandCap, defenseCap, effectiveTroops, unitStats } from '../systems/stats';
import { compEffect, compFromFormation, compText, normComp, reliefOf, type Comp, type FormationKind } from './formation';

export interface BattleInput {
  attackerMorale?: number;
  attackerTraining?: number;
  supply?: number; // 0~1 보급 충족률
  isolated?: boolean;
  weather?: import('../state/types').WeatherKind;
  attackerTroops: number;
  attackerGeneral: General;
  defenderCity: City;
  defenderGenerals: General[];
  /** v3.3 배수진 수비 배율 (1 = 없음) */
  lastStand?: number;
  road: Road;
  season: number;
  tactic?: TacticKind;
  /** 출진 도시의 전선 수와 공격 세력의 수군 특성 (v2.0) */
  attackerShips?: number;
  navalTrait?: boolean;
  /** 세력 특성 공격 보너스 (v2.7) */
  traitAttack?: number;
  /** v3.6 포위 대응: 공격·수비 배율과 그 이유, 성벽을 쓰지 않는 야전(출성 요격) */
  attackMul?: number;
  attackReason?: string;
  defenseMul?: number;
  defenseReason?: string;
  ignoreWalls?: boolean;
  /** v3.9 병종 편성 (없으면 균형)과 최강무력 특성(기병 돌격 +) */
  formation?: FormationKind;
  cavalryTrait?: boolean;
  /** v3.9 일기토를 막는다 (포위 예측 등) */
  noDuel?: boolean;
  /** v4.0 수비 편성 (없으면 균형) */
  defForm?: FormationKind;
  /** v4.1 공격군·수비군 편제 (병종 비율). 없으면 formation/defForm 또는 처음 편제 */
  attackerComp?: Comp;
  defenderComp?: Comp;
  /** v4.2 부장: 무력·지력은 주장과 부장 중 높은 쪽, 지휘 한도에 부장 통솔이 더해진다 */
  attackerDeputy?: General | null;
  /** v4.2 주장과 부장의 사이 (의형제·신뢰면 공격 +) */
  bond?: 'sworn' | 'trust' | 'enmity';
}

/** v3.9 일기토 결과 */
export interface DuelResult { attackerId: string; defenderId: string; winnerId: string; slain: boolean; chance: number }

export interface BattleOutcome {
  attackerPower: number;
  defenderPower: number;
  attackerLoss: number;
  defenderLoss: number;
  won: boolean;
  reasons: string[];
  tactic?: { kind: TacticKind; success: boolean; chance: number };
  /** v3.9 함락 시 살아남은 수비병 (손실 = 접전 + 추격에서 실제로 죽은 수) */
  defenderSurvivors?: number;
  /** v3.9 전투 단계 요약: 접전 손실 / 추격 손실 */
  phases?: { clashAttacker: number; clashDefender: number; pursuit: number; pursuer: 'attacker' | 'defender' };
  duel?: DuelResult;
  formation?: FormationKind;
  defForm?: FormationKind;
  comp?: Comp;
  defComp?: Comp;
  /** v4.0 전장의 변수 */
  fortune?: string;
  /** v4.0 함락 때 수비 장수의 운명 (finishAttack이 채움) */
  fates?: import('../state/types').GeneralFate[];
  /** v4.3 5단계 전술 전투 기록 */
  tactical?: import('../state/types').TacticalPhaseSummary[];
}

/** v4.0 전장의 변수: 아무도 예상 못 한 일 (side: 누가 득을 보나) */
export const FORTUNES: { text: string; side: 'atk' | 'def'; mul: number }[] = [
  { text: '길잡이가 샛길을 찾아내 성 뒤로 돌아감', side: 'atk', mul: 1.15 },
  { text: '성 안 내응자가 밤에 쪽문을 열어 줌', side: 'atk', mul: 1.2 },
  { text: '수비군 군량고에 불이 나 성 안이 술렁임', side: 'atk', mul: 1.12 },
  { text: '공격군 선봉장이 유시에 맞아 쓰러짐', side: 'def', mul: 1.15 },
  { text: '갑작스런 돌풍에 공격군 사다리가 넘어짐', side: 'def', mul: 1.12 },
  { text: '공격군 진중에 돌림병이 돌아 대열이 흐트러짐', side: 'def', mul: 1.18 },
  { text: '북과 함성에 수비군이 겁을 먹음', side: 'atk', mul: 1.1 },
  { text: '이웃 고을 의용군이 몰래 성에 들어와 힘을 보탬', side: 'def', mul: 1.1 },
];

/** v4.0 사기 배율: 사기가 낮으면 크게 약하고(오합지졸), 높으면 한 사람이 열을 상대한다 */
export function moraleFactor(m: number): number {
  return Math.min(BALANCE.moraleCap, 0.5 + 0.5 * Math.pow(Math.max(0, m) / BALANCE.moraleRef, BALANCE.moraleExp)) * (m < BALANCE.routMorale ? BALANCE.routMoraleMul : 1);
}

const commandFactor = (lead: number, war: number) => (0.5 + lead / 100) * (0.7 + war / 333);
/** 사기·훈련 배율 (둘 다 70·55 근처면 약 1) */
export const qualityFactor = (morale: number, training: number) => moraleFactor(morale) * (0.78 + training / 250);

/** v4.3 전투 기초 전력 (계책·편제 상성·일기토·전장의 변수·난수 전). 5단계 전투가 이것을 바탕으로 싸운다 */
export interface BattleBase {
  atk: number; def: number; reasons: string[];
  g: General; dep: General | null; us: General['stats'];
  rel: number; best: General | null; dLead: number; dWar: number; champ: General | null; ag: General;
}

export function battleBase(b: BattleInput): BattleBase {
  const reasons: string[] = [];
  const g = b.attackerGeneral;
  const dep = b.attackerDeputy && b.attackerDeputy.alive ? b.attackerDeputy : null;
  const us = unitStats(g, dep);
  // v4.2 통솔 지휘 한도: 장수가 거느릴 수 있는 병력을 넘으면 넘는 병력은 절반만 제 몫을 한다
  const aCap = commandCap(g.stats.leadership, dep ? [dep.stats.leadership] : []);
  const aEff = effectiveTroops(b.attackerTroops, aCap);
  let atk = aEff * commandFactor(g.stats.leadership, us.war);
  if (dep && (b.bond === 'sworn' || b.bond === 'trust')) {
    const m = b.bond === 'sworn' ? BALANCE.bondSworn : BALANCE.bondTrust;
    atk *= m;
    reasons.push(`🤝 ${b.bond === 'sworn' ? '의형제' : '서로 믿는 사이'}인 ${g.name}과(와) ${dep.name}이(가) 손발을 맞춤 +${Math.round((m - 1) * 100)}%`);
  }
  if (dep) reasons.push(`부장 ${dep.name} 동행 (무력 ${us.war} · 지력 ${us.intellect} · 지휘 한도 +${(dep.stats.leadership * BALANCE.deputyCommandPer).toLocaleString()})`);
  if (aEff < b.attackerTroops) reasons.push(`${g.name}(통솔 ${g.stats.leadership})의 지휘 한도 ${aCap.toLocaleString()}명을 넘는 대군이라 ${Math.round((1 - aEff / b.attackerTroops) * 100)}%가 제 몫을 못 함`);

  const aq = qualityFactor(b.attackerMorale ?? 70, b.attackerTraining ?? 55);
  atk *= aq;
  if ((b.attackerMorale ?? 70) < BALANCE.routMorale) reasons.push(`사기가 바닥난 오합지졸 — 싸우기 전에 달아나는 병사가 많음`);
  if (aq < 0.93) reasons.push(`아군 사기·훈련 부족 (×${aq.toFixed(2)})`);
  else if (aq > 1.07) reasons.push(`높은 사기·훈련 (×${aq.toFixed(2)})`);
  if (b.supply !== undefined && b.supply < 1) {
    const sm = 0.6 + 0.4 * b.supply;
    atk *= sm;
    reasons.push(`군량 보급 부족으로 공격력 ${Math.round((1 - sm) * 100)}% 감소`);
  }
  if (b.isolated) { atk *= BALANCE.isolatedPenalty; reasons.push('본거지와 끊긴 고립된 도시에서 출진 −20%'); }
  const roadMod = BALANCE.roadAttackModifier[b.road.type] ?? 1;
  if (roadMod < 1) {
    const label = { river: '도하 공격', pass: '산길 행군', sea: '상륙 작전', land: '' }[b.road.type];
    reasons.push(`${label}으로 공격력 ${Math.round((1 - roadMod) * 100)}% 감소`);
  }
  atk *= roadMod;
  if (b.traitAttack) { atk *= 1 + b.traitAttack; reasons.push(`세력 특성(무용) 공격 +${Math.round(b.traitAttack * 100)}%`); }
  if (b.road.type === 'sea') {
    const sb = Math.min(BALANCE.shipAttackCap, (b.attackerShips ?? 0) * BALANCE.shipAttackPer) + (b.navalTrait ? BALANCE.navalTraitBonus : 0);
    if (sb > 0) { atk *= 1 + sb; reasons.push(`전선 ${b.attackerShips ?? 0}척${b.navalTrait ? '과 수군의 솜씨' : ''}로 상륙 지원 +${Math.round(sb * 100)}%`); }
    else reasons.push('전선 없이 바다를 건너 상륙이 매우 어려움');
    const ds = Math.min(BALANCE.shipDefenseCap, (b.defenderCity.ships ?? 0) * BALANCE.shipDefensePer);
    if (ds > 0) { atk /= 1 + ds; reasons.push(`${b.defenderCity.name} 항구의 전선 ${b.defenderCity.ships}척이 막아섬 −${Math.round(ds * 100)}%`); }
  }
  for (const lm of landmarksOnRoad(b.road.from, b.road.to)) {
    if (lm.type === 'pass') { atk *= BALANCE.namedPassPenalty; reasons.push(`${lm.name}을(를) 넘는 험한 길 −${Math.round((1 - BALANCE.namedPassPenalty) * 100)}%`); }
    else if (lm.type === 'ford') { atk *= BALANCE.fordEase; reasons.push(`${lm.name}로 강을 건너 도하 부담 완화 +${Math.round((BALANCE.fordEase - 1) * 100)}%`); }
  }
  if (b.season === 3) {
    atk *= BALANCE.winterAttackPenalty;
    reasons.push('겨울 보급난으로 공격력 소폭 감소');
  }
  const wm = weatherAttackModifier(b.weather, b.road.type);
  if (wm.reason) { atk *= wm.mul; reasons.push(wm.reason); }
  if (b.weather === 'fog' && us.intellect >= 85) { atk *= 1.12; reasons.push(`안개를 이용한 ${dep && dep.stats.intellect > g.stats.intellect ? dep.name : g.name}의 기습 +12%`); }

  if (b.attackMul !== undefined && b.attackMul !== 1) { atk *= b.attackMul; if (b.attackReason) reasons.push(b.attackReason); }

  const city = b.defenderCity;
  // v4.0 실측 지형: 험한 산골짜기에서는 대군이 한꺼번에 펼치지 못한다
  const rel = reliefOf(city);
  if (rel >= BALANCE.frontageFrom && b.attackerTroops > city.troops * 1.2) {
    const fm = Math.pow(city.troops / b.attackerTroops, rel / BALANCE.frontageDiv);
    atk *= fm;
    reasons.push(`산악도 ${rel}의 좁은 골짜기라 대군이 한꺼번에 싸우지 못함 −${Math.round((1 - fm) * 100)}%`);
  }
  const best = b.defenderGenerals.reduce<General | null>(
    (acc, x) => (!acc || x.stats.leadership + x.stats.war > acc.stats.leadership + acc.stats.war ? x : acc),
    null,
  );
  const dLead = best?.stats.leadership ?? BALANCE.neutralLeadership;
  const dWar = best?.stats.war ?? BALANCE.neutralWar;
  const dq = qualityFactor(city.morale ?? 70, city.training ?? 55);
  const dCap = defenseCap(b.defenderGenerals);
  const dEff = effectiveTroops(city.troops, dCap);
  let def = dEff * commandFactor(dLead, dWar) * dq;
  if (dEff < city.troops) reasons.push(`수비 장수의 지휘 한도 ${dCap.toLocaleString()}명을 넘는 수비병은 ${Math.round((1 - dEff / city.troops) * 100)}%가 제 몫을 못 함`);
  if (dq > 1.07) reasons.push(`수비군의 높은 사기·훈련 (×${dq.toFixed(2)})`);
  else if (dq < 0.93) reasons.push(`수비군 사기·훈련 부족 (×${dq.toFixed(2)})`);
  const wallMul = b.ignoreWalls ? 1 : 1 + (city.wall / 200) * (city.fortress ? BALANCE.fortressWallMultiplier : 1);
  def *= wallMul;
  if (city.fortress && !b.ignoreWalls) reasons.push(`${city.name}은(는) 산성/요새라 수비력 상승`);
  if (b.ignoreWalls) reasons.push('성 밖 들판에서 맞붙어 성벽의 도움이 없음');
  const forts = b.ignoreWalls ? [] : landmarksOfCity(city.id, 'fortress');
  if (forts.length) {
    def *= 1 + BALANCE.landmarkFortressBonus * forts.length;
    reasons.push(`${forts.map((f) => f.name).join('·')}이(가) 수비를 도움 +${Math.round(BALANCE.landmarkFortressBonus * forts.length * 100)}%`);
  }
  const elevBonus = Math.min(BALANCE.elevDefenseCap, ((city.elev ?? 0) / 1000) * BALANCE.elevDefensePer1000m);
  if (elevBonus >= 0.02) {
    def *= 1 + elevBonus;
    reasons.push(`해발 ${city.elev}m 고지대라 수비 +${Math.round(elevBonus * 100)}%`);
  }
  if ((city.basin ?? 0) >= BALANCE.basinFrom && !b.ignoreWalls) {
    const bm = 1 + BALANCE.basinDefense * (city.basin ?? 0);
    def *= bm;
    reasons.push(`능선에 둘러싸인 분지라 들어오는 길이 좁음 +${Math.round((bm - 1) * 100)}%`);
  }
  if (city.terrain === 'mountain') {
    def *= BALANCE.mountainDefenseBonus;
    reasons.push('험준한 산악 지형이 수비에 유리');
  }
  if (!best) reasons.push('수비 측에 지휘관이 없음');
  if (b.defenseMul !== undefined && b.defenseMul !== 1) { def *= b.defenseMul; if (b.defenseReason) reasons.push(b.defenseReason); }
  if (b.lastStand && b.lastStand > 1) {
    def *= b.lastStand;
    reasons.push(`땅이 얼마 남지 않은 수비군의 배수진 +${Math.round((b.lastStand - 1) * 100)}%`);
  }

  const champ = b.defenderGenerals.reduce<General | null>((acc, x) => (!acc || x.stats.war > acc.stats.war ? x : acc), null);
  const ag = dep && dep.stats.war > g.stats.war ? dep : g; // 부장이 더 세면 부장이 나선다
  return { atk, def, reasons, g, dep, us, rel, best, dLead, dWar, champ, ag };
}

/** v3.9 일기토 판정 (자동 전투·5단계 전투 공용). 배율을 돌려준다 */
export function rollDuel(rng: RngHolder, b: BattleInput, B: Pick<BattleBase, 'champ' | 'ag'>, reasons: string[]): { duel?: DuelResult; atkMul: number; defMul: number } {
  const { champ, ag } = B;
  let atk = 1, def = 1;
  let duel: DuelResult | undefined;
  if (!b.noDuel && champ && ag.stats.war >= BALANCE.duelMinWar && champ.stats.war >= BALANCE.duelMinWar) {
    const pDuel = Math.min(0.8, BALANCE.duelChance * (0.6 + (ag.persona.pride + champ.persona.pride) / 250));
    if (rand(rng) < pDuel) {
      const pWin = 1 / (1 + Math.exp(-(ag.stats.war - champ.stats.war) / BALANCE.duelSpread));
      const aWins = rand(rng) < pWin;
      const slain = rand(rng) < BALANCE.duelSlainChance;
      const winner = aWins ? ag : champ, loser = aWins ? champ : ag;
      duel = { attackerId: ag.id, defenderId: champ.id, winnerId: winner.id, slain, chance: aWins ? pWin : 1 - pWin };
      if (aWins) { atk *= BALANCE.duelWinMul; def *= BALANCE.duelLoseMul; } else { def *= BALANCE.duelWinMul; atk *= BALANCE.duelLoseMul; }
      reasons.push(`⚔️ 일기토! ${ag.name}(무력 ${ag.stats.war}) 대 ${champ.name}(무력 ${champ.stats.war}) — ${winner.name}이(가) ${slain ? `${loser.name}을(를) 베었다` : '이겼다'}! ${aWins ? '공격군' : '수비군'} 사기 충천, 상대 −${Math.round((1 - BALANCE.duelLoseMul) * 100)}%`);
    }
  }

  return { duel, atkMul: atk, defMul: def };
}

/** v4.0 전장의 변수 판정 (자동 전투·5단계 전투 공용) */
export function rollFortune(rng: RngHolder, b: BattleInput, usIntellect: number, reasons: string[]): { fortune?: string; side?: 'atk' | 'def'; atkMul: number; defMul: number } {
  const us = { intellect: usIntellect };
  let atk = 1, def = 1;
  let side: 'atk' | 'def' | undefined;
  let fortune: string | undefined;
  if (rand(rng) < BALANCE.fortuneChance) {
    const f = FORTUNES[Math.floor(rand(rng) * FORTUNES.length)];
    // v4.2 지력: 손해 보는 쪽의 지력이 더 높으면 미리 꿰뚫어 막아낼 수 있다
    const dInt = Math.max(BALANCE.neutralLeadership, ...b.defenderGenerals.map((x) => x.stats.intellect));
    const victimInt = f.side === 'atk' ? dInt : us.intellect, otherInt = f.side === 'atk' ? us.intellect : dInt;
    if (victimInt > otherInt && rand(rng) < (victimInt - otherInt) / BALANCE.fortuneIntDiv) {
      reasons.push(`🧠 ${f.side === 'atk' ? '수비' : '공격'} 측이 미리 꿰뚫어 봄 — 「${f.text}」을(를) 막아냄 (지력 ${victimInt} 대 ${otherInt})`);
    } else {
      if (f.side === 'atk') atk *= f.mul; else def *= f.mul;
      fortune = f.text; side = f.side;
      reasons.push(`🎲 전장의 변수: ${f.text} (${f.side === 'atk' ? '공격' : '수비'} +${Math.round((f.mul - 1) * 100)}%)`);
    }
  }

  return { fortune, side, atkMul: atk, defMul: def };
}

export function resolveBattle(rng: RngHolder, b: BattleInput): BattleOutcome {
  const B = battleBase(b);
  const { reasons, g, dep, us, rel, dLead, champ } = B;
  let { atk, def } = B;
  let tactic: BattleOutcome['tactic'];
  if (b.tactic) {
    const p = tacticChance(b.tactic, { general: dep ? { ...g, stats: us } : g, defenders: b.defenderGenerals, weather: b.weather, road: b.road, target: b.defenderCity });
    const name = TACTICS.find((t) => t.id === b.tactic)!.name;
    if (p > 0) {
      const success = rand(rng) < p;
      tactic = { kind: b.tactic, success, chance: p };
      if (success) { atk *= BALANCE.tacticBonus[b.tactic]; reasons.push(`계책 「${name}」 성공! 공격력 +${Math.round((BALANCE.tacticBonus[b.tactic] - 1) * 100)}% (성공률 ${Math.round(p * 100)}%)`); }
      else { atk *= BALANCE.tacticFailPenalty; reasons.push(`계책 「${name}」이(가) 간파당함 −${Math.round((1 - BALANCE.tacticFailPenalty) * 100)}% (성공률 ${Math.round(p * 100)}%)`); }
    } else reasons.push(`계책 「${name}」은(는) 지금 쓸 수 없어 정공법으로 싸움`);
  }

  const city = b.defenderCity;
  // v3.9 병종 편성
  // v4.1 군사 편제: 병종마다 지형·날씨·성벽 효과와 상대 편제와의 상성을 병력 비율로 섞는다
  const aComp = normComp(b.attackerComp ?? compFromFormation(b.formation));
  const dComp = normComp(b.defenderComp ?? compFromFormation(b.defForm));
  const fe = compEffect(aComp, dComp, b.road, city, b.weather, !b.ignoreWalls && city.wall >= 50, b.cavalryTrait);
  atk *= fe.attack;
  reasons.push(`[편제] ${compText(aComp)} vs ${compText(dComp)} → ${fe.attack >= 1 ? '+' : '−'}${Math.round(Math.abs(fe.attack - 1) * 100)}%`);
  for (const r of fe.reasons) reasons.push(`  · ${r}`);
  // v4.4 장수 특기: 정면 싸움에 늘 쓰이는 특기만 발동 확률만큼 (계략 특기는 5단계 전투에서만)
  if (BALANCE.skills.enabled && BALANCE.skills.auto) {
    const walled = !b.ignoreWalls && city.wall >= 50;
    const water = b.road.type === 'river' || b.road.type === 'sea', fog = b.weather === 'fog', rough = b.road.type === 'pass' || rel >= 45;
    const dTop = [...b.defenderGenerals].sort((x, y) => y.stats.leadership - x.stats.leadership);
    const dSecond = dTop.slice(1).sort((x, y) => Math.max(y.stats.war, y.stats.intellect, y.stats.leadership) - Math.max(x.stats.war, x.stats.intellect, x.stats.leadership))[0];
    const am = autoSkillMul([{ g, deputy: false }, ...(dep ? [{ g: dep, deputy: true }] : [])], { atk: true, walled, outnumbered: b.attackerTroops < city.troops * 0.8, water, fog, rough });
    const dm = autoSkillMul([...(dTop[0] ? [{ g: dTop[0], deputy: false }] : []), ...(dSecond ? [{ g: dSecond, deputy: true }] : [])], { atk: false, walled, outnumbered: city.troops < b.attackerTroops * 0.8, water, fog, rough });
    if (am.mul > 1.005) { atk *= am.mul; reasons.push(`✨ 공격군 장수 특기${am.names.length ? ` ${am.names.join('·')}` : ''} +${Math.round((am.mul - 1) * 100)}%`); }
    if (dm.mul > 1.005) { def *= dm.mul; reasons.push(`✨ 수비군 장수 특기${dm.names.length ? ` ${dm.names.join('·')}` : ''} +${Math.round((dm.mul - 1) * 100)}%`); }
  }
  let duel: DuelResult | undefined;
  let fortune: string | undefined;
  {
    const d = rollDuel(rng, b, B, reasons);
    duel = d.duel; atk *= d.atkMul; def *= d.defMul;
  }
  {
    const f = rollFortune(rng, b, us.intellect, reasons);
    fortune = f.fortune; atk *= f.atkMul; def *= f.defMul;
  }

  atk *= randRange(rng, 0.88, 1.12);
  def *= randRange(rng, 0.88, 1.12);

  // v3.9 냉병기 전투의 손실: 맞붙는 동안은 양쪽이 비슷하게 잃고, 진 쪽이 무너져 달아날 때(추격) 크게 잃는다.
  // 기병이 많을수록 추격이 매섭고, 산길·고개에서는 달아나기 쉽다. 함락된 성의 생존자는 패잔병이 되어 흩어진다.
  const ratio = atk / Math.max(1, def);
  const won = ratio > 1;
  const q = won ? ratio : 1 / Math.max(0.01, ratio);
  const rough = b.road.type === 'pass' || rel >= 45 ? BALANCE.pursuitRoughMul : 1;
  const winnerRate = Math.max(BALANCE.clashWinnerMin, BALANCE.clashLoss / q);
  // v4.2 무력(칼끝)은 진 쪽 접전 손실을 키우고, 진 쪽 통솔(질서 있는 후퇴)은 줄인다. 추격은 쫓는 쪽 무력이 좌우
  const dChampWar = champ?.stats.war ?? BALANCE.neutralWar;
  const winWar = won ? us.war : dChampWar, loseLead = won ? dLead : g.stats.leadership;
  const blade = (BALANCE.clashWarBase + winWar / BALANCE.clashWarDiv) * (BALANCE.clashLeadBase - loseLead / BALANCE.clashLeadDiv);
  const loserRate = Math.min(BALANCE.clashLoserCap, BALANCE.clashLoss * Math.sqrt(q) * blade);
  const pursuitRate = BALANCE.pursuitLoss * rough * Math.min(BALANCE.pursuitRatioCap, Math.sqrt(q)) * (BALANCE.pursuitWarBase + winWar / BALANCE.pursuitWarDiv);
  const walled = !b.ignoreWalls && city.wall >= 50;
  let attackerLoss: number;
  let defenderLoss: number;
  let phases: BattleOutcome['phases'];
  let defenderSurvivors: number | undefined;
  if (won) {
    const assault = b.ignoreWalls ? 1 : 1 + city.wall / BALANCE.assaultWallDiv;
    attackerLoss = Math.min(b.attackerTroops, Math.round(b.attackerTroops * winnerRate * assault * fe.ownLoss));
    const dClash = Math.round(city.troops * loserRate);
    const pursuit = Math.round((city.troops - dClash) * pursuitRate * fe.pursuit);
    defenderLoss = Math.min(city.troops, dClash + pursuit);
    defenderSurvivors = city.troops - defenderLoss;
    phases = { clashAttacker: attackerLoss, clashDefender: dClash, pursuit, pursuer: 'attacker' };
    reasons.unshift(`${g.name}의 공격력 ${Math.round(atk).toLocaleString()} vs 수비력 ${Math.round(def).toLocaleString()} — 공격 성공`);
    if (pursuit > 0) reasons.push(`성이 무너지자 ${(aComp.cavalry ?? 0) + (aComp.chariot ?? 0) >= 0.25 ? '기병·전차가 ' : ''}달아나는 수비군을 추격해 ${pursuit.toLocaleString()}명을 더 쓰러뜨림`);
  } else {
    defenderLoss = Math.min(city.troops - 1, Math.round(city.troops * winnerRate * (walled ? BALANCE.wallClashShield : 1)));
    const aClash = Math.round(b.attackerTroops * Math.min(0.6, loserRate * (b.ignoreWalls ? 1 : 1 + city.wall / BALANCE.assaultWallDiv / 2)) * fe.ownLoss);
    const pursuit = Math.round((b.attackerTroops - aClash) * pursuitRate * (1 + ((dComp.cavalry ?? 0) + (dComp.chariot ?? 0) * 0.5) * 1.0));
    attackerLoss = Math.min(b.attackerTroops, aClash + pursuit);
    phases = { clashAttacker: aClash, clashDefender: defenderLoss, pursuit, pursuer: 'defender' };
    reasons.unshift(`${g.name}의 공격력 ${Math.round(atk).toLocaleString()} vs 수비력 ${Math.round(def).toLocaleString()} — 공격 실패`);
    if (pursuit > 0) reasons.push(`물러나는 공격군을 수비군이 뒤쫓아 ${pursuit.toLocaleString()}명을 더 쓰러뜨림${rough < 1 ? ' (험한 길이라 추격이 덜함)' : ''}`);
  }
  if (b.attackerTroops > city.troops * 1.5 && !won) reasons.push('병력은 우세했으나 지형과 성벽을 넘지 못함');
  if (b.attackerTroops < city.troops && won) reasons.push('적은 병력으로 큰 성을 무너뜨린 대승!');

  return { attackerPower: Math.round(atk), defenderPower: Math.round(def), attackerLoss, defenderLoss: Math.max(0, defenderLoss), won, reasons: reasons.map(fixJosa), tactic, defenderSurvivors, phases, duel, formation: b.formation, defForm: b.defForm, comp: aComp, defComp: dComp, fortune };
}
