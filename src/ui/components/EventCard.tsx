// 사건 안내 카드 (v3.4): 턴이 넘어갈 때 우리 세력에 중요한 사건을 그림과 함께 한 장씩 보여 준다.
import { useEffect, useState } from 'react';
import type { GameState, LogEntry } from '../../core';
import { EventArt, type ArtKind } from './EventArt';

export interface EventCardItem { art: ArtKind; title: string; text: string; color: string; other: string }

const TITLE: Record<ArtKind, string> = {
  capture: '성을 함락했습니다', lost: '성을 빼앗겼습니다', rebel: '반란! 독립 세력 등장', debut: '새 인물 등장', death: '장수의 죽음',
  uprising: '의병 봉기', plague: '역병 발생', fire: '큰 산불', harvest: '가을 수확', surrender: '나라를 바치다', treaty: '맹약 체결',
  destroyed: '한 세력이 무너지다', unify: '천하 통일', fate: '장수의 운명', duel: '일기토!',
};

/** 이번 턴에 새로 생긴 기록 중 플레이어가 알아야 할 사건만 고른다 */
export function pickEvents(prev: GameState, next: GameState, max = 5, onlyNew = false): EventCardItem[] {
  const pf = next.playerFactionId;
  if (!pf) return [];
  const seen = onlyNew ? new Set(prev.log.map((l) => `${l.turn}|${l.text}`)) : null;
  const fresh: LogEntry[] = next.log.filter((l) => l.turn >= prev.turn && l.event && (!seen || !seen.has(`${l.turn}|${l.text}`)));
  const out: EventCardItem[] = [];
  const col = (fid?: string | null) => (fid && next.factions[fid]?.color) || '#9a9080';
  for (const l of fresh) {
    const e = l.event!;
    let art: ArtKind | null = null;
    if (e === 'capture') art = l.factionId === pf ? 'capture' : l.other === pf ? 'lost' : null;
    else if (e === 'rebel' || e === 'uprising' || e === 'surrender' || e === 'destroyed') art = e;
    else if (e === 'treaty') art = l.factionId === pf || l.other === pf ? 'treaty' : null;
    else if (e === 'fate' || e === 'duel') art = l.factionId === pf || l.other === pf ? e : null;
    else if (l.factionId === pf) art = e;
    if (!art) continue;
    // 같은 종류는 한 장으로 묶는다 (수확·역병·산불)
    const same = out.find((o) => o.art === art && (art === 'harvest' || art === 'plague' || art === 'fire' || art === 'debut' || art === 'fate'));
    if (same) { same.text += `\n${l.text}`; continue; }
    out.push({ art, title: TITLE[art], text: l.text, color: art === 'lost' ? col(l.factionId) : col(l.factionId), other: art === 'rebel' || art === 'treaty' || art === 'surrender' ? col(l.other) : col(l.other ?? pf) });
  }
  // 중요한 순서: 잃은 성·반란·함락이 먼저
  const rank: ArtKind[] = ['lost', 'fate', 'duel', 'rebel', 'destroyed', 'capture', 'surrender', 'uprising', 'death', 'plague', 'fire', 'treaty', 'debut', 'harvest'];
  return out.sort((a, b) => rank.indexOf(a.art) - rank.indexOf(b.art)).slice(0, max);
}

export function EventCards({ items, onClose }: { items: EventCardItem[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  const it = items[i];
  if (!it) return null;
  const last = i >= items.length - 1;
  const lines = it.text.split('\n');
  return (
    <div className="event-backdrop" onClick={onClose}>
      <div className="event-card panel" onClick={(e) => e.stopPropagation()}>
        <EventArt kind={it.art} color={it.color} other={it.other} />
        <h3>{it.title}</h3>
        {lines.slice(0, 4).map((t, k) => <p key={k}>{t}</p>)}
        {lines.length > 4 && <p className="muted small">외 {lines.length - 4}건</p>}
        <div className="event-actions">
          <span className="muted small">{i + 1} / {items.length}</span>
          <button onClick={onClose}>모두 닫기</button>
          <button className="primary" autoFocus onClick={() => (last ? onClose() : setI(i + 1))}>{last ? '확인' : '다음 ▶'}</button>
        </div>
      </div>
    </div>
  );
}
