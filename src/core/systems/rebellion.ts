// 반란·독립 (v3.4): 야심 크고 충성 낮은 장수는 맡은 땅을 들고 독립한다. 큰 나라일수록 다스리기 어렵다.
// → 한 세력이 커져도 안에서 흔들려 승패가 계속 뒤집힌다 (Game.md 5-1 "충성 낮으면 배신·망명·독립")
import { BALANCE } from '../config';
import { foundFaction } from '../state/found';
import { pairKey } from '../diplomacy/diplomacy';
import { log } from '../commands/commands';
import { chance } from '../rng/rng';
import { relationBetween } from '../query';
import type { GameState, General } from '../state/types';

const PALETTE = ['#b5651d', '#6b8e23', '#8b3a62', '#2e8b8b', '#a0522d', '#556b2f', '#7b68ee', '#cd853f', '#20b2aa', '#9a6324'];

/** 이 장수가 이번 해에 독립할 확률 (0이면 조건 미달) */
export function rebellionChance(s: GameState, g: General): number {
  if (!g.alive || !g.faction) return 0;
  const f = s.factions[g.faction];
  if (!f?.alive || f.rulerId === g.id) return 0;
  const ruler = s.generals[f.rulerId];
  if (!ruler || ruler.city === g.city) return 0; // 군주 곁에서는 못 일으킨다
  const c = s.cities[g.city];
  if (c.owner !== f.id) return 0;
  if (g.loyalty >= BALANCE.rebelLoyaltyBelow || g.persona.ambition < BALANCE.rebelAmbitionMin) return 0;
  const rel = relationBetween(s, g.id, ruler.id);
  if (rel?.type === 'sworn' || rel?.type === 'trust') return 0;
  const all = Object.keys(s.cities).length;
  const share = Object.values(s.cities).filter((x) => x.owner === f.id).length / all;
  let p = BALANCE.rebelBase + (g.persona.ambition - BALANCE.rebelAmbitionMin) / 200 + (BALANCE.rebelLoyaltyBelow - g.loyalty) / 100;
  if (share >= BALANCE.rebelBigShare) p *= BALANCE.rebelBigMul; // 큰 나라는 변방이 흔들린다
  if (c.order < 40) p += 0.05;
  return Math.min(BALANCE.rebelMax, p);
}

/** 매년 봄: 조건을 갖춘 장수가 독립한다 (세력마다 한 해 최대 1명) */
export function processRebellions(s: GameState) {
  if (s.season !== 0) return;
  for (const f of Object.values(s.factions)) {
    if (!f.alive) continue;
    const cands = Object.values(s.generals).filter((g) => g.faction === f.id).map((g) => ({ g, p: rebellionChance(s, g) })).filter((x) => x.p > 0)
      .sort((a, b) => b.p - a.p);
    for (const { g, p } of cands) {
      if (!chance(s, p)) continue;
      const c = s.cities[g.city];
      const prev = f.id;
      const share = Object.values(s.cities).filter((x) => x.owner === prev).length;
      const n = Object.values(s.factions).length;
      const r = foundFaction(s, c.id, g.id, {
        idPrefix: 'reb', color: PALETTE[n % PALETTE.length], verb: '반기를 들고',
        gold: Math.round(f.gold / Math.max(2, share)), food: Math.round(f.food / Math.max(2, share)), wood: 3000, iron: 3000, minTroops: 0,
      });
      if (!r.ok) continue;
      // 같은 도시에서 충성이 낮거나 반란 장수와 가까운 장수는 따라간다
      for (const x of Object.values(s.generals)) {
        if (!x.alive || x.id === g.id || x.city !== c.id || x.faction !== prev) continue;
        const rel = relationBetween(s, x.id, g.id);
        if (x.loyalty < 55 || rel?.type === 'sworn' || rel?.type === 'trust') { x.faction = r.factionId; x.loyalty = 70; }
      }
      // 옛 주인과는 맹약 없이 전쟁 상태
      delete s.diplomacy[pairKey(prev, r.factionId)];
      log(s, `${f.name}의 ${g.name}이(가) ${c.name}에서 독립했습니다! (충성 ${g.loyalty}·야망 ${g.persona.ambition})`, 'danger', prev, { event: 'rebel', other: r.factionId });
      break; // 한 세력은 한 해에 한 번
    }
  }
}
