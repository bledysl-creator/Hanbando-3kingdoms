// 초상화 대용: 세력색 원 + 한자 이니셜 (Game.md 6 — 아트 비용 0, 기존 게임 초상화 사용 금지)
import type { General } from '../../core';

export function Portrait({ general, color, size = 48 }: { general: General; color: string; size?: number }) {
  return (
    <div className="portrait" style={{ width: size, height: size, background: `radial-gradient(circle at 35% 30%, ${color}, #11161d 85%)`, fontSize: size * 0.42 }} title={`${general.name} (${general.hanja})`}>
      {general.hanja.slice(0, 1)}
      <span className="portrait-name" style={{ fontSize: Math.max(10, size * 0.16) }}>{general.hanja.slice(1)}</span>
    </div>
  );
}
