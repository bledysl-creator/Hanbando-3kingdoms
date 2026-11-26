// v4.0 도시 특징: 산물·지형·성벽을 한눈에 (도시 특징 카드)
import { BALANCE } from '../config';
import { reliefOf } from '../battle/formation';
import type { City, GameState } from '../state/types';

export interface CityTrait { icon: string; label: string; desc: string }

export function cityTraits(s: GameState, c: City): CityTrait[] {
  const out: CityTrait[] = [];
  const big = s.mapScale === 'region' ? 1 / 12 : 1;
  if (c.agriculture >= 75) out.push({ icon: '🌾', label: '곡창', desc: '쌀이 많이 나 가을 수확이 크다' });
  if (c.commerce >= 70) out.push({ icon: '💰', label: '상업 도시', desc: '장터가 커서 세금이 잘 걷히고 곡식을 싸게 산다' });
  if (c.population >= 80000 * big) out.push({ icon: '🏙️', label: '대도시', desc: '인구가 많아 세금·징병 여력이 크다' });
  if (c.iron >= 4) out.push({ icon: '⛏️', label: '철 산지', desc: '철이 많이 나 징병(무기) 부담이 적다' });
  if (c.wood >= 5) out.push({ icon: '🌲', label: '울창한 숲', desc: '목재가 많이 나 성벽·전선을 짓기 좋다 (산불 주의)' });
  if ((c.horses ?? 0) >= 4) out.push({ icon: '🐎', label: '큰 목장', desc: `말이 많이 난다 (계절마다 약 ${(c.horses ?? 0) * BALANCE.horsesPerLevel}필). 기병을 꾸리고 교역·예물로 쓴다` });
  else if ((c.horses ?? 0) > 0) out.push({ icon: '🐴', label: '말 산지', desc: `말을 기른다 (계절마다 약 ${(c.horses ?? 0) * BALANCE.horsesPerLevel}필)` });
  if (c.port) out.push({ icon: '⚓', label: '항구', desc: '어물과 바닷길 교역, 전선 건조' });
  const rel = reliefOf(c);
  if (c.landform === 'basin') out.push({ icon: '🥣', label: '분지', desc: `능선에 둘러싸인 분지 (둘러싼 정도 ${Math.round((c.basin ?? 0) * 100)}%) — 들어오는 길이 좁아 지키기 쉽지만, 함락되면 빠져나가기 어렵다` });
  else if (c.landform === 'mountain' || rel >= 55) out.push({ icon: '⛰️', label: '산악', desc: `산악도 ${rel} — 기병·대군이 힘을 못 쓰고 매복이 쉽다` });
  else if (c.landform === 'plain' || rel < 25) out.push({ icon: '🟩', label: '평야', desc: `산악도 ${rel} — 기병이 달리기 좋다` });
  else out.push({ icon: '🏞️', label: '구릉', desc: `산악도 ${rel} — 낮은 산과 들이 섞였다` });
  if (c.fortress || c.wall >= 80) out.push({ icon: '🏯', label: '큰 성', desc: `성벽 ${c.wall}${c.fortress ? ' · 산성' : ''} — 성벽 위 궁노가 기병 돌격을 막는다` });
  return out;
}

/** 한 줄 요약 */
export function cityBlurb(s: GameState, c: City): string {
  const t = cityTraits(s, c).map((x) => x.label);
  if (!t.length) return `${c.name}은(는) 평범한 고을이다.`;
  return `${c.name}: ${t.join(' · ')}`;
}
