// 자동 계산 전투. 결과와 함께 "왜 그렇게 됐는지" 원인을 돌려준다 (Game.md 5-3).
import { BALANCE } from '../config';
import { fixJosa } from '../josa';
import { rand, randRange, type RngHolder } from '../rng/rng';
import type { City, General, Road } from '../state/types';
import { weatherAttackModifier } from '../systems/weather';
import { tacticChance, TACTICS, type TacticKind } from './tactics';
import { landmarksOfCity, landmarksOnRoad } from '../data';
import { formationEffect, FORMATIONS, type FormationKind } from './formation';

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
}

const commandFactor = (lead: number, war: number) => (0.5 + lead / 100) * (0.7 + war / 333);
/** 사기·훈련 배율 (둘 다 70·55 근처면 약 1) */
export const qualityFactor = (morale: number, training: number) => (0.62 + morale / 250) * (0.78 + training / 250);

export function resolveBattle(rng: RngHolder, b: BattleInput): BattleOutcome {
  const reasons: string[] = [];
  const g = b.attackerGeneral;
  let atk = b.attackerTroops * commandFactor(g.stats.leadership, g.stats.war);

  const aq = qualityFactor(b.attackerMorale ?? 70, b.attackerTraining ?? 55);
  atk *= aq;
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
  if (b.weather === 'fog' && b.attackerGeneral.stats.intellect >= 85) { atk *= 1.12; reasons.push(`안개를 이용한 ${b.attackerGeneral.name}의 기습 +12%`); }

  if (b.attackMul !== undefined && b.attackMul !== 1) { atk *= b.attackMul; if (b.attackReason) reasons.push(b.attackReason); }

  let tactic: BattleOutcome['tactic'];
  if (b.tactic) {
    const p = tacticChance(b.tactic, { general: b.attackerGeneral, defenders: b.defenderGenerals, weather: b.weather, road: b.road, target: b.defenderCity });
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
  const fe = formationEffect(b.formation, b.road, city, b.weather);
  if (b.formation && b.formation !== 'balanced') {
    const fname = FORMATIONS.find((x) => x.id === b.formation)!.name;
    atk *= fe.attack;
    if (b.formation === 'cavalry' && b.cavalryTrait && fe.attack > 1) { atk *= 1 + BALANCE.formation.cavalryTraitBonus; fe.reasons.push(`천하무쌍 기병대 +${Math.round(BALANCE.formation.cavalryTraitBonus * 100)}%`); }
    reasons.push(fe.reasons.length ? `[${fname}] ${fe.reasons.join(', ')}` : `[${fname}] 이 땅에서는 특별한 이점이 없음`);
  }
  const best = b.defenderGenerals.reduce<General | null>(
    (acc, x) => (!acc || x.stats.leadership + x.stats.war > acc.stats.leadership + acc.stats.war ? x : acc),
    null,
  );
  const dLead = best?.stats.leadership ?? BALANCE.neutralLeadership;
  const dWar = best?.stats.war ?? BALANCE.neutralWar;
  const dq = qualityFactor(city.morale ?? 70, city.training ?? 55);
  let def = city.troops * commandFactor(dLead, dWar) * dq;
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

  // v3.9 일기토: 두 진영에 이름난 맹장이 있으면 진 앞에서 맞붙기도 한다. 이긴 쪽 사기가 오르고 진 쪽은 흔들린다.
  let duel: DuelResult | undefined;
  const champ = b.defenderGenerals.reduce<General | null>((acc, x) => (!acc || x.stats.war > acc.stats.war ? x : acc), null);
  if (!b.noDuel && champ && g.stats.war >= BALANCE.duelMinWar && champ.stats.war >= BALANCE.duelMinWar) {
    const pDuel = Math.min(0.8, BALANCE.duelChance * (0.6 + (g.persona.pride + champ.persona.pride) / 250));
    if (rand(rng) < pDuel) {
      const pWin = 1 / (1 + Math.exp(-(g.stats.war - champ.stats.war) / BALANCE.duelSpread));
      const aWins = rand(rng) < pWin;
      const slain = rand(rng) < BALANCE.duelSlainChance;
      const winner = aWins ? g : champ, loser = aWins ? champ : g;
      duel = { attackerId: g.id, defenderId: champ.id, winnerId: winner.id, slain, chance: aWins ? pWin : 1 - pWin };
      if (aWins) { atk *= BALANCE.duelWinMul; def *= BALANCE.duelLoseMul; } else { def *= BALANCE.duelWinMul; atk *= BALANCE.duelLoseMul; }
      reasons.push(`⚔️ 일기토! ${g.name}(무력 ${g.stats.war}) 대 ${champ.name}(무력 ${champ.stats.war}) — ${winner.name}이(가) ${slain ? `${loser.name}을(를) 베었다` : '이겼다'}! ${aWins ? '공격군' : '수비군'} 사기 충천, 상대 −${Math.round((1 - BALANCE.duelLoseMul) * 100)}%`);
    }
  }

  atk *= randRange(rng, 0.88, 1.12);
  def *= randRange(rng, 0.88, 1.12);

  // v3.9 냉병기 전투의 손실: 맞붙는 동안은 양쪽이 비슷하게 잃고, 진 쪽이 무너져 달아날 때(추격) 크게 잃는다.
  // 기병이 많을수록 추격이 매섭고, 산길·고개에서는 달아나기 쉽다. 함락된 성의 생존자는 패잔병이 되어 흩어진다.
  const ratio = atk / Math.max(1, def);
  const won = ratio > 1;
  const q = won ? ratio : 1 / Math.max(0.01, ratio);
  const rough = b.road.type === 'pass' || city.terrain === 'mountain' ? BALANCE.pursuitRoughMul : 1;
  const winnerRate = Math.max(BALANCE.clashWinnerMin, BALANCE.clashLoss / q);
  const loserRate = Math.min(BALANCE.clashLoserCap, BALANCE.clashLoss * Math.sqrt(q));
  const pursuitRate = BALANCE.pursuitLoss * rough * Math.min(BALANCE.pursuitRatioCap, Math.sqrt(q));
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
    if (pursuit > 0) reasons.push(`성이 무너지자 ${b.formation === 'cavalry' ? '기병이 ' : ''}달아나는 수비군을 추격해 ${pursuit.toLocaleString()}명을 더 쓰러뜨림`);
  } else {
    defenderLoss = Math.min(city.troops - 1, Math.round(city.troops * winnerRate * (walled ? BALANCE.wallClashShield : 1)));
    const aClash = Math.round(b.attackerTroops * Math.min(0.6, loserRate * (b.ignoreWalls ? 1 : 1 + city.wall / BALANCE.assaultWallDiv / 2)) * fe.ownLoss);
    const pursuit = Math.round((b.attackerTroops - aClash) * pursuitRate);
    attackerLoss = Math.min(b.attackerTroops, aClash + pursuit);
    phases = { clashAttacker: aClash, clashDefender: defenderLoss, pursuit, pursuer: 'defender' };
    reasons.unshift(`${g.name}의 공격력 ${Math.round(atk).toLocaleString()} vs 수비력 ${Math.round(def).toLocaleString()} — 공격 실패`);
    if (pursuit > 0) reasons.push(`물러나는 공격군을 수비군이 뒤쫓아 ${pursuit.toLocaleString()}명을 더 쓰러뜨림${rough < 1 ? ' (험한 길이라 추격이 덜함)' : ''}`);
  }
  if (b.attackerTroops > city.troops * 1.5 && !won) reasons.push('병력은 우세했으나 지형과 성벽을 넘지 못함');
  if (b.attackerTroops < city.troops && won) reasons.push('적은 병력으로 큰 성을 무너뜨린 대승!');

  return { attackerPower: Math.round(atk), defenderPower: Math.round(def), attackerLoss, defenderLoss: Math.max(0, defenderLoss), won, reasons: reasons.map(fixJosa), tactic, defenderSurvivors, phases, duel, formation: b.formation };
}
