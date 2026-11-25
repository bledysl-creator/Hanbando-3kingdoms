// 외교 (v0.4): 휴전·동맹·파기. 플레이어와 AI가 같은 규칙을 쓴다 (Game.md 5-4).
import { BALANCE } from '../config';
import { chance } from '../rng/rng';
import { relationBetween, totalTroops } from '../query';
import type { DiplomaticStatus, GameState, Treaty } from '../state/types';

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function treatyOf(s: GameState, a: string, b: string): Treaty {
  return s.diplomacy[pairKey(a, b)] ?? { status: 'war', until: null };
}

export function statusOf(s: GameState, a: string | null, b: string | null): DiplomaticStatus {
  if (!a || !b || a === b) return 'war';
  return treatyOf(s, a, b).status;
}

/** 공격할 수 있는 상대인가 (휴전·동맹 중이면 불가) */
export function canAttack(s: GameState, a: string, b: string | null): boolean {
  return !b || statusOf(s, a, b) === 'war';
}

export function setTreaty(s: GameState, a: string, b: string, status: DiplomaticStatus, turns: number | null) {
  s.diplomacy[pairKey(a, b)] = { status, until: turns === null ? null : s.turn + turns };
}

export type Proposal = 'truce' | 'alliance';

/** 상대 세력이 제안을 받아들일 확률. 이유도 함께 돌려준다 (원인과 결과). */
export function acceptanceChance(
  s: GameState, from: string, to: string, proposal: Proposal, envoyId: string, gold: number,
): { p: number; reasons: string[] } {
  const reasons: string[] = [];
  const envoy = s.generals[envoyId];
  let p = proposal === 'truce' ? BALANCE.truceBase : BALANCE.allianceBase;
  const skill = ((envoy?.stats.intellect ?? 50) + (envoy?.stats.charm ?? 50)) / 400;
  p += skill;
  reasons.push(`사신 ${envoy?.name ?? '?'}의 지력·매력 +${Math.round(skill * 100)}%`);
  if (gold > 0) {
    const g = Math.min(0.3, gold / BALANCE.diplomacyGoldPerPercent / 100);
    p += g;
    reasons.push(`예물 금 ${gold.toLocaleString()} +${Math.round(g * 100)}%`);
  }
  const mine = totalTroops(s, from), theirs = totalTroops(s, to);
  if (mine > theirs * 1.3) { p += 0.1; reasons.push('우리 군세가 강해 상대가 두려워함 +10%'); }
  if (theirs > mine * 1.5) { p -= 0.15; reasons.push('상대가 훨씬 강해 우리를 얕봄 −15%'); }
  // 상대가 다른 적과 싸우는 중이면 등 뒤를 지키고 싶어 한다
  const otherWars = Object.keys(s.factions).filter((f) => f !== to && f !== from && s.factions[f].alive && statusOf(s, to, f) === 'war').length;
  if (otherWars > 0) { p += 0.05 * otherWars; reasons.push(`상대는 다른 세력 ${otherWars}곳과 대치 중 +${otherWars * 5}%`); }
  const rulerRel = relationBetween(s, s.factions[from].rulerId, s.factions[to].rulerId);
  if (rulerRel?.type === 'enmity') { p -= 0.25; reasons.push('두 군주는 원수 사이 −25%'); }
  if (proposal === 'alliance' && statusOf(s, from, to) !== 'truce') { p -= 0.15; reasons.push('휴전 없이 바로 동맹은 어려움 −15%'); }
  const ruler = s.generals[s.factions[to].rulerId];
  if (ruler && ruler.persona.ambition > 85) { p -= 0.1; reasons.push(`${ruler.name}의 큰 야망 −10%`); }
  return { p: Math.max(0.03, Math.min(0.95, p)), reasons };
}

/** 남은 세력이 모두 동맹이면 천하통일을 위해 동맹이 깨진다 */
export function expireTreaties(s: GameState, log: (text: string) => void) {
  for (const [k, t] of Object.entries(s.diplomacy)) {
    const [a, b] = k.split('|');
    if (!s.factions[a]?.alive || !s.factions[b]?.alive) { delete s.diplomacy[k]; continue; }
    if (t.until !== null && s.turn >= t.until) {
      delete s.diplomacy[k];
      log(`${s.factions[a].name}·${s.factions[b].name}의 ${t.status === 'truce' ? '휴전' : '동맹'}이 기한 만료로 끝났습니다.`);
    }
  }
  const alive = Object.values(s.factions).filter((f) => f.alive).map((f) => f.id);
  const anyWar = alive.some((a, i) => alive.slice(i + 1).some((b) => statusOf(s, a, b) === 'war'));
  if (alive.length >= 2 && !anyWar) {
    for (const k of Object.keys(s.diplomacy)) delete s.diplomacy[k];
    log('남은 세력이 모두 손을 잡자 천하의 주인을 가리기 위해 맹약이 모두 깨졌습니다.');
  }
}

export function tryProposal(
  s: GameState, from: string, to: string, proposal: Proposal, envoyId: string, gold: number,
): { accepted: boolean; p: number; reasons: string[] } {
  const { p, reasons } = acceptanceChance(s, from, to, proposal, envoyId, gold);
  const accepted = chance(s, p);
  if (accepted) setTreaty(s, from, to, proposal, proposal === 'truce' ? BALANCE.truceTurns : null);
  return { accepted, p, reasons };
}

export function aiWantsTruce(s: GameState, fid: string, other: string): boolean {
  // 두 곳 이상과 대치 중이면 가장 강한 적과는 휴전을 원한다
  const enemies = Object.keys(s.factions).filter((f) => f !== fid && s.factions[f].alive && statusOf(s, fid, f) === 'war');
  if (enemies.length < 2) return false;
  const strongest = enemies.sort((a, b) => totalTroops(s, b) - totalTroops(s, a))[0];
  return strongest === other;
}

export { chance };
