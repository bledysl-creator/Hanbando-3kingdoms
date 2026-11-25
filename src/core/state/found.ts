// 신군주 거병 (v3.2): 아무 도시(군현 지도에서는 아무 시·군)에서 아무 장수를 군주로 새 세력을 세운다.
import { BALANCE } from '../config';
import { checkFactionDestroyed, log } from '../commands/commands';
import type { GameState } from './types';

const TWO_CHAR_SURNAMES = ['제갈', '하후', '공손', '사마', '태사', '관구', '사섭'];

export type FoundResult = { ok: true; factionId: string; rival: string | null } | { ok: false; error: string };

/** 군주가 될 수 있는 장수: 살아 있고 이미 다른 세력의 군주가 아닌 사람 */
export function canFound(s: GameState, cityId: string, generalId: string): string | null {
  const c = s.cities[cityId];
  const g = s.generals[generalId];
  if (!c) return '없는 도시입니다.';
  if (!g || !g.alive) return '그 장수는 아직 세상에 나오지 않았습니다.';
  if (Object.values(s.factions).some((f) => f.alive && f.rulerId === g.id)) return `${g.name}은(는) 이미 군주입니다.`;
  const rulerHere = Object.values(s.factions).find((f) => f.alive && s.generals[f.rulerId]?.city === cityId);
  if (rulerHere) return `${c.name}에는 ${s.generals[rulerHere.rulerId].name}이(가) 머물러 있어 거병할 수 없습니다.`;
  return null;
}

export function foundFaction(s: GameState, cityId: string, generalId: string): FoundResult {
  const err = canFound(s, cityId, generalId);
  if (err) return { ok: false, error: err };
  const c = s.cities[cityId];
  const g = s.generals[generalId];
  let id = 'neo';
  for (let i = 2; s.factions[id]; i++) id = `neo${i}`;
  const two = TWO_CHAR_SURNAMES.find((x) => g.name.startsWith(x));
  let name = two ?? g.name[0];
  const hanja = g.hanja.slice(0, two ? 2 : 1);
  if (Object.values(s.factions).some((f) => f.name === name)) name = g.name;
  s.factions[id] = {
    id, name, hanja, color: BALANCE.newRulerColor, rulerId: g.id, traits: [],
    gold: BALANCE.newRulerGold, food: BALANCE.newRulerFood, wood: BALANCE.newRulerWood, iron: BALANCE.newRulerIron, alive: true,
  };
  s.recruits[id] = 0;
  s.heirs[id] = [];
  const prev = c.owner;
  // 그 도시에 있던 옛 주인의 장수들은 군주 곁으로 물러난다
  if (prev && s.factions[prev]) {
    const home = s.generals[s.factions[prev].rulerId]?.city;
    for (const x of Object.values(s.generals)) if (x.alive && x.faction === prev && x.city === cityId && x.id !== g.id && home) x.city = home;
  }
  // 장수가 다른 세력 소속이었으면 그 세력을 떠난다
  for (const f of Object.values(s.factions)) if (f.id !== id) s.heirs[f.id] = (s.heirs[f.id] ?? []).filter((h) => h !== g.id);
  g.faction = id;
  g.city = cityId;
  g.loyalty = 100;
  c.owner = id;
  c.governor = undefined;
  c.troops = Math.max(c.troops, BALANCE.newRulerTroops);
  c.morale = 80;
  c.training = Math.max(c.training, 45);
  checkFactionDestroyed(s, prev);
  log(s, `${g.name}이(가) ${c.name}에서 거병해 ${name}(${hanja}) 세력을 세웠습니다.`, 'warn', id);
  return { ok: true, factionId: id, rival: prev && s.factions[prev]?.alive ? prev : null };
}
