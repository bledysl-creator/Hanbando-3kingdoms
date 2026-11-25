// 규칙 기반 + Utility AI (Game.md 5-5). 플레이어와 같은 명령만 사용한다.
import { BALANCE } from '../config';
import { executeCommand, type Command } from '../commands/commands';
import { freeGeneralsIn, generalsIn, neighbors } from '../query';
import type { City, GameState, General } from '../state/types';

interface Option { score: number; cmd: Command; why: string }

function estimateRatio(s: GameState, g: General, from: City, to: City, troops: number): number {
  const road = neighbors(s, from.id).find((n) => n.city.id === to.id)?.road;
  const roadMod = road ? BALANCE.roadAttackModifier[road.type] ?? 1 : 1;
  const atk = troops * (0.5 + g.stats.leadership / 100) * (0.7 + g.stats.war / 333) * roadMod;
  const defs = generalsIn(s, to.id).filter((x) => x.faction === to.owner);
  const best = defs.reduce<number>((a, x) => Math.max(a, x.stats.leadership), BALANCE.neutralLeadership);
  const wallMul = 1 + (to.wall / 200) * (to.fortress ? BALANCE.fortressWallMultiplier : 1);
  const def = to.troops * (0.5 + best / 100) * 1.0 * wallMul * (to.terrain === 'mountain' ? BALANCE.mountainDefenseBonus : 1);
  return atk / Math.max(1, def);
}

function optionsFor(s: GameState, fid: string, g: General): Option[] {
  const f = s.factions[fid];
  const city = s.cities[g.city];
  const ns = neighbors(s, city.id);
  const enemyNs = ns.filter((n) => n.city.owner !== fid);
  const threat = enemyNs.reduce((a, n) => a + n.city.troops, 0);
  const isFrontier = enemyNs.length > 0;
  const opts: Option[] = [];

  // 공격
  if (isFrontier && s.season !== 3) {
    const troops = city.troops - Math.max(500, Math.round(threat * 0.25));
    for (const n of enemyNs) {
      if (troops < 1000) break;
      const ratio = estimateRatio(s, g, city, n.city, troops);
      if (ratio > BALANCE.aiAttackRatio) {
        const value = (n.city.population / 10000 + n.city.agriculture / 20 + n.city.commerce / 20) * (n.city.owner === null ? 0.8 : 1);
        opts.push({ score: 50 + ratio * 10 + value, cmd: { type: 'march', generalId: g.id, toCityId: n.city.id, troops }, why: `승산 ${ratio.toFixed(2)}` });
      }
    }
  }
  // 징병: 위협 대비 병력이 부족할 때
  if (isFrontier && city.troops < threat * 0.9 && f.gold > 800 && f.iron > 3000) {
    const amount = Math.min(Math.floor(city.population * 0.06), Math.floor(f.iron / BALANCE.conscriptIronPerTroop), 8000);
    if (amount >= 1000) opts.push({ score: 40 + (threat / Math.max(1, city.troops)) * 10, cmd: { type: 'conscript', generalId: g.id, amount }, why: '전선 방어 보강' });
  }
  // 공세 준비: 여유 자원이 많으면 전선에서 병력을 키운다
  const totalT = Object.values(s.cities).filter((c) => c.owner === fid).reduce((a, c) => a + c.troops, 0);
  if (isFrontier && f.gold > 2500 && f.iron > 5000 && f.food > totalT * 1.2) {
    const amount = Math.min(Math.floor(city.population * 0.05), Math.floor(f.iron / BALANCE.conscriptIronPerTroop), 6000);
    if (amount >= 1000) opts.push({ score: 30 + f.gold / 1000, cmd: { type: 'conscript', generalId: g.id, amount }, why: '공세 준비' });
  }
  // 후방 병력 전선으로
  if (!isFrontier && city.troops > 6000) {
    const front = ns.filter((n) => n.city.owner === fid && neighbors(s, n.city.id).some((m) => m.city.owner !== fid));
    const target = front.sort((a, b) => a.city.troops - b.city.troops)[0];
    if (target) opts.push({ score: 35, cmd: { type: 'transfer', generalId: g.id, toCityId: target.city.id, troops: city.troops - 3000 }, why: '전선 보강' });
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
