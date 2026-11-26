// v4.0 함락된 성의 장수 운명과 포로 처분.
// 통솔·지력이 높으면 혼란 속에서도 병사를 이끌고 빠져나가고, 무력이 낮으면 난전에서 쓰러지기 쉽다.
// 빠져나갈 아군 성이 없거나 분지에 갇히면 사로잡히기 쉽다. 군주는 사로잡히지 않고 탈출·전사·잠적한다.
import { BALANCE } from '../config';
import { rand } from '../rng/rng';
import { log } from '../commands/commands';
import type { CityId, GameState, General, GeneralFate } from '../state/types';
import { killGeneral } from './lifecycle';
import { remember } from './persona';

export function fateChances(d: General, hasHaven: boolean, cavalryPursuit: boolean, basin: number) {
  const st = d.stats;
  let escape = BALANCE.fateEscapeBase + (st.leadership + st.intellect - 120) / BALANCE.fateEscapeDiv - (hasHaven ? 0 : BALANCE.fateNoHaven);
  if (basin >= BALANCE.basinFrom) escape -= 0.1;
  escape = Math.max(0.05, Math.min(0.9, escape));
  const slain = Math.max(0.01, Math.min(0.2, BALANCE.fateSlainBase + (70 - st.war) / BALANCE.fateSlainDiv + (cavalryPursuit ? BALANCE.fateCavalrySlain : 0)));
  escape = Math.min(escape, 1 - slain);
  const captured = Math.max(0, 1 - escape - slain);
  return { escape, captured, slain };
}

const isRuler = (s: GameState, g: General) => !!g.faction && s.factions[g.faction]?.rulerId === g.id;

/** 함락 때 수비 장수들의 운명을 정한다. 탈출하는 장수는 haven 으로 옮긴다. 포로는 captor 의 처분을 기다린다. */
export function decideFates(s: GameState, defenders: General[], cityId: CityId, captor: string, haven: CityId | undefined, cavalryPursuit: boolean): GeneralFate[] {
  const city = s.cities[cityId];
  const out: GeneralFate[] = [];
  for (const d of defenders) {
    const ch = fateChances(d, !!haven, cavalryPursuit, city.basin ?? 0);
    const r = rand(s);
    const from = d.faction;
    if (r < ch.slain) {
      out.push({ generalId: d.id, fate: 'slain', chance: ch });
      killGeneral(s, d, `${d.name}이(가) ${city.name} 함락 때 난전 속에서 전사했습니다.`);
    } else if ((r < ch.slain + ch.escape || isRuler(s, d)) && haven) {
      d.city = haven;
      out.push({ generalId: d.id, fate: 'escaped', to: haven, chance: ch });
    } else if (isRuler(s, d) || r < ch.slain + ch.escape) {
      // 갈 곳 없는 군주, 또는 탈출했지만 갈 곳이 없는 장수는 재야로 몸을 숨긴다
      d.faction = null;
      out.push({ generalId: d.id, fate: 'fled', chance: ch });
    } else {
      out.push({ generalId: d.id, fate: 'captured', chance: ch });
      d.faction = null;
      d.city = cityId;
      remember(d, s.turn, 'defeatedBy', s.factions[captor].rulerId);
      if (captor === s.playerFactionId) (s.captives ??= []).push({ generalId: d.id, captor, from, turn: s.turn, cityId });
      else aiCaptiveDecision(s, captor, d, from);
    }
  }
  return out;
}

/** 포로 등용 확률: 옛 주군에 대한 충성이 낮고 의리가 약할수록, 우리 군주 매력이 높을수록 */
export function captiveRecruitChance(s: GameState, captor: string, g: General): number {
  const ruler = s.generals[s.factions[captor].rulerId];
  const p = BALANCE.captiveRecruitBase + (60 - g.loyalty) / 120 + ((ruler?.stats.charm ?? 60) - 60) / 200 - (g.persona.righteousness - 50) / 200;
  return Math.max(0.05, Math.min(0.85, p));
}

function release(s: GameState, g: General, from: string | null) {
  const home = from && s.factions[from]?.alive ? Object.values(s.cities).find((c) => c.owner === from) : undefined;
  if (home && from) { g.faction = from; g.city = home.id; }
  else g.faction = null;
}

/** AI 군주의 포로 처분: 등용 시도 → 실패하면 의리 낮은 군주는 맹장을 처형하기도, 아니면 풀어 준다 */
function aiCaptiveDecision(s: GameState, captor: string, g: General, from: string | null) {
  const ruler = s.generals[s.factions[captor].rulerId];
  if (rand(s) < captiveRecruitChance(s, captor, g)) {
    g.faction = captor; g.loyalty = 55;
    log(s, `${g.name}이(가) 포로가 된 뒤 ${s.factions[captor].name}에 투항했습니다.`, 'warn', from, { event: 'fate', other: captor });
    return;
  }
  const harsh = (100 - (ruler?.persona.righteousness ?? 50)) / 100;
  if (g.stats.war >= 80 && rand(s) < harsh * 0.5) {
    killGeneral(s, g, `${s.factions[captor].name}이(가) 사로잡은 ${g.name}을(를) 처형했습니다.`);
    return;
  }
  release(s, g, from);
  log(s, `${s.factions[captor].name}이(가) 사로잡은 ${g.name}을(를) 풀어 주었습니다.`, 'info', from, { event: 'fate', other: captor });
}

/** 플레이어의 포로 처분 */
export function decideCaptiveMut(s: GameState, factionId: string, generalId: string, action: 'recruit' | 'release' | 'execute'): { ok: true; message: string } | { ok: false; error: string } {
  const i = (s.captives ?? []).findIndex((c) => c.generalId === generalId && c.captor === factionId);
  if (i < 0) return { ok: false, error: '그런 포로가 없습니다.' };
  const cap = s.captives![i];
  const g = s.generals[generalId];
  if (!g.alive) { s.captives!.splice(i, 1); return { ok: false, error: '이미 세상을 떠났습니다.' }; }
  if (action === 'recruit') {
    const p = captiveRecruitChance(s, factionId, g);
    if (rand(s) < p) {
      s.captives!.splice(i, 1);
      g.faction = factionId; g.loyalty = 55;
      const town = Object.values(s.cities).find((c) => c.id === cap.cityId && c.owner === factionId) ?? Object.values(s.cities).find((c) => c.owner === factionId);
      if (town) g.city = town.id;
      log(s, `${g.name}이(가) 항복해 우리 장수가 되었습니다.`, 'good', factionId);
      return { ok: true, message: `${g.name}: "목숨을 살려 주신 은혜, 잊지 않겠습니다." — 등용 성공 (확률 ${Math.round(p * 100)}%)` };
    }
    g.loyalty = Math.min(100, g.loyalty + 5);
    return { ok: true, message: `${g.name}: "두 주군을 섬길 수는 없소!" — 등용 실패 (확률 ${Math.round(p * 100)}%). 풀어 주거나 처형할 수 있습니다.` };
  }
  s.captives!.splice(i, 1);
  if (action === 'release') {
    release(s, g, cap.from);
    log(s, `${g.name}을(를) 풀어 보냈습니다.`, 'info', factionId);
    return { ok: true, message: `${g.name}을(를) 풀어 주었습니다. 다시 적으로 만날 수도 있습니다.` };
  }
  killGeneral(s, g, `${s.factions[factionId].name}이(가) 포로 ${g.name}을(를) 처형했습니다.`);
  for (const m of Object.values(s.generals)) if (m.alive && m.faction === factionId && m.persona.righteousness >= 70) m.loyalty = Math.max(0, m.loyalty - BALANCE.captiveExecuteLoyalty);
  return { ok: true, message: `${g.name}을(를) 처형했습니다. 의리를 중히 여기는 장수들이 마음이 편치 않습니다.` };
}

/** 오래 처분하지 않은 포로는 풀려난다 */
export function expireCaptives(s: GameState) {
  if (!s.captives?.length) return;
  s.captives = s.captives.filter((c) => {
    const g = s.generals[c.generalId];
    if (!g?.alive) return false;
    if (s.turn - c.turn < BALANCE.captiveExpire) return true;
    release(s, g, c.from);
    log(s, `처분이 미뤄지는 사이 포로 ${g.name}이(가) 풀려났습니다.`, 'info', c.captor);
    return false;
  });
}

export const isCaptive = (s: GameState, id: string) => !!s.captives?.some((c) => c.generalId === id);
