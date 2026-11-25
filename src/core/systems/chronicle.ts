// 역사서 (v1.2): 매 판의 연대기를 자동으로 쓴다 (Game.md 5-7 "모든 사건은 기록되어 역사서가 된다")
import { SEASONS } from '../config';
import type { GameState } from '../state/types';

export function recordAnnal(s: GameState) {
  const cities: Record<string, number> = {}, troops: Record<string, number> = {}, rulers: Record<string, string> = {};
  for (const c of Object.values(s.cities)) if (c.owner) { cities[c.owner] = (cities[c.owner] ?? 0) + 1; troops[c.owner] = (troops[c.owner] ?? 0) + c.troops; }
  for (const f of Object.values(s.factions)) if (f.alive) rulers[f.id] = f.rulerId;
  s.annals.push({ year: s.year, cities, troops, rulers });
}

/** 마크다운 역사서 */
export function writeChronicle(s: GameState, title = '한반도 삼국지 연대기'): string {
  const lines: string[] = [`# ${title}`, ''];
  const first = s.annals[0];
  if (first) {
    lines.push(`${first.year}년, ${Object.keys(first.cities).map((f) => `${s.generals[first.rulers[f]]?.name}(${s.factions[f].hanja})`).join('·')}이(가) 한반도를 나누어 차지하였다.`, '');
  }
  const years = [...new Set([...s.annals.map((a) => a.year), ...s.chronicle.map((c) => c.year)])].sort((a, b) => a - b);
  for (const y of years) {
    const a = s.annals.find((x) => x.year === y);
    const ev = s.chronicle.filter((c) => c.year === y);
    if (!a && ev.length === 0) continue;
    lines.push(`## ${y}년 (${s.era} ${y - s.eraStartYear + 1}년)`);
    if (a) {
      const rank = Object.entries(a.cities).sort((p, q) => q[1] - p[1]);
      lines.push(`연초의 형세: ${rank.map(([f, n]) => `${s.factions[f].name} ${n}성`).join(', ')}.`);
    }
    for (const e of ev) lines.push(`- ${SEASONS[e.season]}: ${e.text}`);
    lines.push('');
  }
  if (s.winner) lines.push(`---`, `${s.year}년, ${s.factions[s.winner].name}(${s.factions[s.winner].hanja})이(가) 마침내 한반도를 하나로 하였다.`);
  else lines.push(`---`, `${s.year}년 ${SEASONS[s.season]}, 천하는 아직 정해지지 않았다.`);
  return lines.join('\n');
}
