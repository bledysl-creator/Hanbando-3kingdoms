// 규칙 기반 + Utility AI (Game.md 5-5). 플레이어와 같은 명령만 사용한다.
import { BALANCE } from '../config';
import { executeCommand, type Command } from '../commands/commands';
import { freeGeneralsIn, generalsIn, neighbors } from '../query';
import type { City, GameState, General } from '../state/types';
import { aiWantsTruce, canAttack, statusOf, tryProposal } from '../diplomacy/diplomacy';
import { chance } from '../rng/rng';
import { weatherAttackModifier } from '../systems/weather';
import { qualityFactor } from '../battle/battle';
import { log } from '../commands/commands';

interface Option { score: number; cmd: Command; why: string }

function estimateRatio(s: GameState, g: General, from: City, to: City, troops: number): number {
  const road = neighbors(s, from.id).find((n) => n.city.id === to.id)?.road;
  const roadMod = road ? BALANCE.roadAttackModifier[road.type] ?? 1 : 1;
  const wm = weatherAttackModifier(s.weather[to.id], road?.type ?? 'land').mul;
  const atk = troops * (0.5 + g.stats.leadership / 100) * (0.7 + g.stats.war / 333) * roadMod * wm * qualityFactor(from.morale, from.training);
  const defs = generalsIn(s, to.id).filter((x) => x.faction === to.owner);
  const best = defs.reduce<number>((a, x) => Math.max(a, x.stats.leadership), BALANCE.neutralLeadership);
  const wallMul = 1 + (to.wall / 200) * (to.fortress ? BALANCE.fortressWallMultiplier : 1);
  const def = to.troops * (0.5 + best / 100) * qualityFactor(to.morale, to.training) * wallMul * (to.terrain === 'mountain' ? BALANCE.mountainDefenseBonus : 1);
  return atk / Math.max(1, def);
}

/** 적대 세력(중립 제외) 인접 병력 합 */
function threatOf(s: GameState, fid: string, cityId: string): number {
  return neighbors(s, cityId).reduce((a, n) => a + (n.city.owner && n.city.owner !== fid && statusOf(s, fid, n.city.owner) === 'war' ? n.city.troops : 0), 0);
}
function isFrontierCity(s: GameState, fid: string, cityId: string): boolean {
  return neighbors(s, cityId).some((n) => n.city.owner !== fid);
}

function optionsFor(s: GameState, fid: string, g: General): Option[] {
  const f = s.factions[fid];
  const city = s.cities[g.city];
  const ns = neighbors(s, city.id);
  const enemyNs = ns.filter((n) => n.city.owner !== fid);
  const threat = threatOf(s, fid, city.id);
  const isFrontier = enemyNs.length > 0;
  const opts: Option[] = [];

  // 공격
  if (isFrontier && s.season !== 3) {
    const troops = city.troops - Math.max(500, Math.round(threat * 0.25));
    for (const n of enemyNs) {
      if (troops < 1000) break;
      if (!canAttack(s, fid, n.city.owner)) continue;
      const ratio = estimateRatio(s, g, city, n.city, troops);
      if (ratio > BALANCE.aiAttackRatio) {
        const value = (n.city.population / 10000 + n.city.agriculture / 20 + n.city.commerce / 20) * (n.city.owner === null ? 0.8 : 1);
        opts.push({ score: 50 + ratio * 10 + value, cmd: { type: 'march', generalId: g.id, toCityId: n.city.id, troops }, why: `승산 ${ratio.toFixed(2)}` });
      }
    }
  }
  // 징병: 위협 대비 병력이 부족할 때
  if (isFrontier && city.troops < threat * 0.9 && f.gold > 800 && f.iron > 3000) {
    const amount = Math.min(Math.floor(city.population * 0.08), Math.floor(f.iron / BALANCE.conscriptIronPerTroop), 10000);
    if (amount >= 1000) opts.push({ score: 40 + (threat / Math.max(1, city.troops)) * 10, cmd: { type: 'conscript', generalId: g.id, amount }, why: '전선 방어 보강' });
  }
  // 공세 준비: 여유 자원이 많으면 전선에서 병력을 키운다
  const totalT = Object.values(s.cities).filter((c) => c.owner === fid).reduce((a, c) => a + c.troops, 0);
  if (isFrontier && f.gold > 2500 && f.iron > 5000 && f.food > totalT * 1.2) {
    const amount = Math.min(Math.floor(city.population * 0.08), Math.floor(f.iron / BALANCE.conscriptIronPerTroop), 10000);
    if (amount >= 1000) opts.push({ score: 30 + f.gold / 1000, cmd: { type: 'conscript', generalId: g.id, amount }, why: '공세 준비' });
  }
  // 병력 재배치: 여유 병력을 가장 위협받는 인접 아군 도시로
  const surplus = city.troops - Math.max(3000, threat * 0.8);
  if (surplus > 3000) {
    let best: { id: string; need: number } | null = null;
    for (const n of ns) {
      if (n.city.owner !== fid) continue;
      const need = Math.max(threatOf(s, fid, n.city.id) * 0.9, isFrontierCity(s, fid, n.city.id) && threat === 0 ? n.city.troops + 4000 : 0) - n.city.troops;
      if (need > 2000 && (!best || need > best.need)) best = { id: n.city.id, need };
    }
    if (best) opts.push({ score: 42 + best.need / 1000, cmd: { type: 'transfer', generalId: g.id, toCityId: best.id, troops: Math.min(surplus, best.need + 2000) }, why: '병력 재배치' });
  }
  // 훈련: 전선 도시의 훈련도가 낮으면
  if (isFrontier && city.training < 65 && f.food > city.troops) {
    opts.push({ score: 26 + (65 - city.training) / 3, cmd: { type: 'train', generalId: g.id }, why: '훈련' });
  }
  // 등용
  const free = freeGeneralsIn(s, city.id);
  if (free.length > 0) opts.push({ score: 45, cmd: { type: 'recruit', generalId: g.id, targetId: free[0].id }, why: '재야 인재 등용' });
  // 포상: 충성 낮은 장수
  const unhappy = generalsIn(s, city.id, fid).find((x) => x.loyalty < 55 && x.id !== f.rulerId);
  if (unhappy && f.gold > 1500) opts.push({ score: 38, cmd: { type: 'reward', generalId: g.id, targetId: unhappy.id }, why: '충성 관리' });
  // 내정
  if (f.gold > BALANCE.developGold + 200) {
    const foodRatio = f.food / Math.max(1, Object.values(s.cities).filter((c) => c.owner === fid).reduce((a, c) => a + c.troops, 0));
    const field = foodRatio < 1 ? 'agriculture' : city.commerce <= city.agriculture ? 'commerce' : 'agriculture';
    if (city[field] < 100) opts.push({ score: 20 + g.stats.politics / 10 + (foodRatio < 1 ? 10 : 0), cmd: { type: 'develop', generalId: g.id, field }, why: '내정' });
    if (isFrontier && city.wall < 90 && f.wood > 3000) opts.push({ score: 18 + g.stats.politics / 12, cmd: { type: 'develop', generalId: g.id, field: 'wall' }, why: '성벽 보수' });
  }
  return opts;
}

/** 한 세력의 이번 턴 행동을 모두 수행한다. */
export function runFactionAI(s: GameState, fid: string) {
  const f = s.factions[fid];
  if (!f?.alive) return;
  runFactionDiplomacy(s, fid);
  // 무력·통솔 높은 장수부터 (공격 기회를 먼저 잡도록)
  const gens = Object.values(s.generals)
    .filter((g) => g.alive && g.faction === fid && !g.acted)
    .sort((a, b) => b.stats.leadership + b.stats.war - (a.stats.leadership + a.stats.war));
  for (const g of gens) {
    if (g.acted || g.faction !== fid || s.cities[g.city].owner !== fid) continue;
    const opts = optionsFor(s, fid, g).sort((a, b) => b.score - a.score);
    for (const o of opts) {
      const r = executeCommand(s, fid, o.cmd);
      if (r.ok) break;
    }
  }
}

/** AI 외교: 양면 전쟁이면 가장 강한 적에게 휴전을 제안한다 */
function runFactionDiplomacy(s: GameState, fid: string) {
  const f = s.factions[fid];
  if (!chance(s, BALANCE.aiProposalChance)) return;
  const target = Object.keys(s.factions).find((o) => o !== fid && s.factions[o].alive && statusOf(s, fid, o) === 'war' && aiWantsTruce(s, fid, o));
  if (!target) return;
  const envoy = Object.values(s.generals)
    .filter((g) => g.alive && g.faction === fid && !g.acted && s.cities[g.city].owner === fid && g.id !== f.rulerId)
    .sort((a, b) => b.stats.charm + b.stats.intellect - (a.stats.charm + a.stats.intellect))[0];
  if (!envoy) return;
  const gold = Math.min(Math.floor(f.gold * 0.2), 1500);
  if (target === s.playerFactionId) {
    if (s.offers.some((o) => o.from === fid)) return;
    envoy.acted = true;
    f.gold -= gold;
    s.offers.push({ from: fid, to: target, proposal: 'truce', gold, turn: s.turn });
    log(s, `${f.name}의 사신 ${envoy.name}이(가) 휴전을 청해 왔습니다.`, 'warn', target);
    return;
  }
  envoy.acted = true;
  f.gold -= gold;
  const r = tryProposal(s, fid, target, 'truce', envoy.id, gold);
  if (r.accepted) { s.factions[target].gold += gold; log(s, `${f.name}과(와) ${s.factions[target].name}이(가) 휴전을 맺었습니다.`, 'info'); }
}
