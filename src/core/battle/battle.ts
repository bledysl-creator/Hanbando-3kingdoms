// 자동 계산 전투. 결과와 함께 "왜 그렇게 됐는지" 원인을 돌려준다 (Game.md 5-3).
import { BALANCE } from '../config';
import { rand, randRange, type RngHolder } from '../rng/rng';
import type { City, General, Road } from '../state/types';
import { weatherAttackModifier } from '../systems/weather';
import { tacticChance, TACTICS, type TacticKind } from './tactics';
import { landmarksOfCity, landmarksOnRoad } from '../data';

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
  road: Road;
  season: number;
  tactic?: TacticKind;
  /** 출진 도시의 전선 수와 공격 세력의 수군 특성 (v2.0) */
  attackerShips?: number;
  navalTrait?: boolean;
}

export interface BattleOutcome {
  attackerPower: number;
  defenderPower: number;
  attackerLoss: number;
  defenderLoss: number;
  won: boolean;
  reasons: string[];
  tactic?: { kind: TacticKind; success: boolean; chance: number };
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
  const wallMul = 1 + (city.wall / 200) * (city.fortress ? BALANCE.fortressWallMultiplier : 1);
  def *= wallMul;
  if (city.fortress) reasons.push(`${city.name}은(는) 산성/요새라 수비력 상승`);
  const forts = landmarksOfCity(city.id, 'fortress');
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

  atk *= randRange(rng, 0.88, 1.12);
  def *= randRange(rng, 0.88, 1.12);

  const ratio = atk / Math.max(1, def);
  const won = ratio > 1;
  let attackerLoss: number;
  let defenderLoss: number;
  if (won) {
    attackerLoss = Math.min(b.attackerTroops, Math.round(b.attackerTroops * (0.35 / ratio)));
    defenderLoss = city.troops;
    reasons.unshift(`${g.name}의 공격력 ${Math.round(atk).toLocaleString()} vs 수비력 ${Math.round(def).toLocaleString()} — 공격 성공`);
  } else {
    attackerLoss = Math.min(b.attackerTroops, Math.round(b.attackerTroops * Math.min(0.9, 0.4 / ratio)));
    defenderLoss = Math.min(city.troops - 1, Math.round(city.troops * BALANCE.failedAttackAttrition * ratio));
    reasons.unshift(`${g.name}의 공격력 ${Math.round(atk).toLocaleString()} vs 수비력 ${Math.round(def).toLocaleString()} — 공격 실패`);
  }
  if (b.attackerTroops > city.troops * 1.5 && !won) reasons.push('병력은 우세했으나 지형과 성벽을 넘지 못함');

  return { attackerPower: Math.round(atk), defenderPower: Math.round(def), attackerLoss, defenderLoss: Math.max(0, defenderLoss), won, reasons, tactic };
}
