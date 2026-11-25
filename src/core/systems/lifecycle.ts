// 생애 (v1.0): 등장·노화·사망·후계자, 멸망한 세력의 재기 (Game.md 5-1, 5-6)
import { BALANCE } from '../config';
import { log } from '../commands/commands';
import { chance, rand } from '../rng/rng';
import { relationBetween } from '../query';
import type { GameState, General } from '../state/types';

const age = (s: GameState, g: General) => s.year - g.birth;

/** 매년 봄: 새 인물 등장, 자연사 */
export function processLifecycle(s: GameState) {
  if (s.season !== 0) return;
  for (const g of Object.values(s.generals)) {
    if (!g.alive && g.debut && s.year >= g.debut.year) {
      g.alive = true;
      const f = g.debut.faction && s.factions[g.debut.faction]?.alive ? g.debut.faction : null;
      const city = s.cities[g.debut.city];
      g.faction = f && city.owner === f ? f : null;
      g.loyalty = g.faction ? 85 : 0;
      delete g.debut;
      log(s, `${g.name}이(가) 세상에 이름을 드러냈습니다${g.faction ? ` (${s.factions[g.faction].name})` : ` — ${city.name}의 재야`}.`, 'info', g.faction);
    }
  }
  for (const g of Object.values(s.generals)) {
    if (!g.alive || g.debut) continue;
    const a = age(s, g);
    if (a < BALANCE.deathAgeStart) continue;
    const p = Math.min(0.5, ((a - BALANCE.deathAgeStart) ** 2) / BALANCE.deathAgeDivisor);
    if (rand(s) < p) killGeneral(s, g, `${g.name}이(가) ${a}세로 세상을 떠났습니다.`);
  }
}

export function killGeneral(s: GameState, g: General, text: string) {
  g.alive = false;
  const fid = g.faction;
  log(s, text, 'danger', fid);
  if (fid && s.factions[fid]?.rulerId === g.id) succeed(s, fid, g);
}

/** 군주 사망 → 후계자 (후계 순위 → 의형제·신뢰 → 능력) */
function succeed(s: GameState, fid: string, dead: General) {
  const f = s.factions[fid];
  const members = Object.values(s.generals).filter((x) => x.alive && x.faction === fid);
  if (members.length === 0) {
    for (const c of Object.values(s.cities)) if (c.owner === fid) c.owner = null;
    f.alive = false;
    log(s, `${f.name}(${f.hanja})는 뒤를 이을 사람이 없어 흩어졌습니다.`, 'danger', fid);
    return;
  }
  const order = s.heirs[fid] ?? [];
  const heir =
    order.map((id) => s.generals[id]).find((x) => x?.alive && x.faction === fid) ??
    members.sort((a, b) => score(s, dead, b) - score(s, dead, a))[0];
  f.rulerId = heir.id;
  heir.loyalty = 100;
  log(s, `${heir.name}이(가) ${dead.name}의 뒤를 이어 ${f.name}의 군주가 되었습니다.`, 'warn', fid);
  // 후계에 불만인 야심가는 충성이 떨어진다
  for (const m of members) {
    if (m.id !== heir.id && m.persona.ambition >= 75) m.loyalty = Math.max(0, m.loyalty - 15);
  }
}

function score(s: GameState, dead: General, g: General) {
  const rel = relationBetween(s, dead.id, g.id);
  return g.stats.charm + g.stats.leadership + g.stats.politics + (rel?.type === 'sworn' ? 60 : rel?.type === 'trust' ? 30 : 0);
}

/** 재기 가능한 상태인가: 세력은 망했지만 군주가 살아 있다 */
export function canRise(s: GameState, fid: string): boolean {
  const f = s.factions[fid];
  const r = s.generals[f?.rulerId];
  return !!f && !f.alive && !!r && r.alive;
}

export function uprisingChance(s: GameState, fid: string): number {
  const r = s.generals[s.factions[fid].rulerId];
  const c = s.cities[r.city];
  if (c.troops > BALANCE.uprisingMaxGarrison) return 0;
  return Math.min(0.85, BALANCE.uprisingBase + r.stats.charm / 400 + (c.order < 40 ? 0.15 : 0));
}

/** 재기 시도: 군주가 머무는 도시에서 의병을 일으킨다 */
export function attemptUprising(s: GameState, fid: string): { ok: boolean; message: string } {
  if (!canRise(s, fid)) return { ok: false, message: '재기할 수 없습니다.' };
  const f = s.factions[fid];
  const r = s.generals[f.rulerId];
  const c = s.cities[r.city];
  const p = uprisingChance(s, fid);
  if (p <= 0) return { ok: false, message: `${c.name}의 수비군(${c.troops.toLocaleString()})이 너무 많아 재기할 수 없습니다.` };
  if (!chance(s, p)) {
    r.city = c.id;
    log(s, `${r.name}의 ${c.name} 거병이 실패했습니다.`, 'warn', fid);
    return { ok: true, message: `거병 실패 (확률 ${Math.round(p * 100)}%). 다음 기회를 노리세요.` };
  }
  const prev = c.owner;
  c.owner = fid;
  c.troops = Math.round(c.population * BALANCE.uprisingVolunteerRatio);
  c.morale = 80;
  c.training = 35;
  f.alive = true;
  f.gold = Math.max(f.gold, 1500);
  f.food = Math.max(f.food, 20000);
  r.faction = fid;
  // 옛 동지(의형제·신뢰) 재야 장수가 돌아온다
  for (const g of Object.values(s.generals)) {
    if (!g.alive || g.faction !== null || g.id === r.id) continue;
    const rel = relationBetween(s, g.id, r.id);
    if (rel?.type === 'sworn' || rel?.type === 'trust' || (g.memories ?? []).some((m) => m.kind === 'recruitedBy' && s.generals[m.with]?.id && s.generals[m.with].id === r.id)) {
      g.faction = fid;
      g.city = c.id;
      g.loyalty = 90;
    }
  }
  log(s, `${r.name}이(가) ${c.name}에서 의병을 일으켜 ${f.name}(${f.hanja})을(를) 다시 세웠습니다!${prev ? ` (${s.factions[prev].name}에게서 탈환)` : ''}`, 'good', fid);
  return { ok: true, message: `${c.name}에서 재기 성공!` };
}

/** AI 세력의 재기: 매년 봄 한 번 시도 */
export function processAiUprisings(s: GameState) {
  if (s.season !== 0) return;
  for (const f of Object.values(s.factions)) {
    if (f.id === s.playerFactionId || !canRise(s, f.id)) continue;
    // 군주가 수비가 약한 이웃 도시로 숨어든다
    const r = s.generals[f.rulerId];
    const weakest = Object.values(s.cities).filter((c) => c.troops <= BALANCE.uprisingMaxGarrison).sort((a, b) => a.troops - b.troops)[0];
    if (weakest && rand(s) < 0.5) r.city = weakest.id;
    attemptUprising(s, f.id);
  }
}
