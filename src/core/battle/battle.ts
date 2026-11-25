// 자동 계산 전투. 결과와 함께 "왜 그렇게 됐는지" 원인을 돌려준다 (Game.md 5-3).
import { BALANCE } from '../config';
import { randRange, type RngHolder } from '../rng/rng';
import type { City, General, Road } from '../state/types';
import { weatherAttackModifier } from '../systems/weather';

export interface BattleInput {
  weather?: import('../state/types').WeatherKind;
  attackerTroops: number;
  attackerGeneral: General;
  defenderCity: City;
  defenderGenerals: General[];
  road: Road;
  season: number;
}

export interface BattleOutcome {
  attackerPower: number;
  defenderPower: number;
  attackerLoss: number;
  defenderLoss: number;
  won: boolean;
  reasons: string[];
}

const commandFactor = (lead: number, war: number) => (0.5 + lead / 100) * (0.7 + war / 333);

export function resolveBattle(rng: RngHolder, b: BattleInput): BattleOutcome {
  const reasons: string[] = [];
  const g = b.attackerGeneral;
  let atk = b.attackerTroops * commandFactor(g.stats.leadership, g.stats.war);

  const roadMod = BALANCE.roadAttackModifier[b.road.type] ?? 1;
  if (roadMod < 1) {
    const label = { river: '도하 공격', pass: '산길 행군', sea: '상륙 작전', land: '' }[b.road.type];
    reasons.push(`${label}으로 공격력 ${Math.round((1 - roadMod) * 100)}% 감소`);
  }
  atk *= roadMod;
  if (b.season === 3) {
    atk *= BALANCE.winterAttackPenalty;
    reasons.push('겨울 보급난으로 공격력 소폭 감소');
  }
  const wm = weatherAttackModifier(b.weather, b.road.type);
  if (wm.reason) { atk *= wm.mul; reasons.push(wm.reason); }
  if (b.weather === 'fog' && b.attackerGeneral.stats.intellect >= 85) { atk *= 1.12; reasons.push(`안개를 이용한 ${b.attackerGeneral.name}의 기습 +12%`); }

  const city = b.defenderCity;
  const best = b.defenderGenerals.reduce<General | null>(
    (acc, x) => (!acc || x.stats.leadership + x.stats.war > acc.stats.leadership + acc.stats.war ? x : acc),
    null,
  );
  const dLead = best?.stats.leadership ?? BALANCE.neutralLeadership;
  const dWar = best?.stats.war ?? BALANCE.neutralWar;
  let def = city.troops * commandFactor(dLead, dWar);
  const wallMul = 1 + (city.wall / 200) * (city.fortress ? BALANCE.fortressWallMultiplier : 1);
  def *= wallMul;
  if (city.fortress) reasons.push(`${city.name}은(는) 산성/요새라 수비력 상승`);
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

  return { attackerPower: Math.round(atk), defenderPower: Math.round(def), attackerLoss, defenderLoss: Math.max(0, defenderLoss), won, reasons };
}
