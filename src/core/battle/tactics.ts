// 계책 (v1.6): 출진할 때 고르는 전술. 성공하면 공격력 상승, 실패하면 소폭 손해.
// 장수 능력·날씨·길·지형·수비 장수의 지력이 성공률을 좌우한다.
import { BALANCE } from '../config';
import type { City, General, Road, WeatherKind } from '../state/types';

export type TacticKind = 'fire' | 'ambush' | 'night';
export const TACTICS: { id: TacticKind; name: string; icon: string; desc: string }[] = [
  { id: 'fire', name: '화공', icon: '🔥', desc: '불을 놓아 적진을 태운다. 지력이 높을수록, 맑고 건조할수록 잘 된다. 비·눈에는 쓸 수 없다.' },
  { id: 'ambush', name: '매복', icon: '🌲', desc: '고개·산악에서 숨어 기다리다 친다. 지력·통솔이 높을수록 잘 된다. 고개 길이나 산악 도시에서만.' },
  { id: 'night', name: '야습', icon: '🌙', desc: '밤에 기습한다. 무력이 높을수록 잘 된다. 안개 낀 날 더 좋다.' },
];

export interface TacticCtx { general: General; defenders: General[]; weather?: WeatherKind; road: Road; target: City }

/** 성공 확률 (0이면 쓸 수 없음) */
export function tacticChance(t: TacticKind, c: TacticCtx): number {
  const g = c.general.stats;
  const defInt = Math.max(0, ...c.defenders.map((d) => d.stats.intellect));
  const counter = Math.max(0, defInt - 60) / 200;
  let p = 0;
  if (t === 'fire') {
    if (c.weather && ['rain', 'storm', 'typhoon', 'snow', 'blizzard'].includes(c.weather)) return 0;
    if (g.intellect < 60) return 0;
    p = (g.intellect - 50) / 60 + (c.weather === 'drought' ? 0.2 : 0) + (c.road.type === 'river' ? -0.1 : 0);
  } else if (t === 'ambush') {
    if (c.road.type !== 'pass' && c.target.terrain !== 'mountain') return 0;
    p = (g.intellect + g.leadership) / 220 - 0.2;
  } else {
    if (g.war < 65) return 0;
    p = (g.war - 40) / 90 + (c.weather === 'fog' ? 0.2 : 0);
  }
  return Math.max(0.05, Math.min(0.9, p - counter));
}

export const tacticBonus = (t: TacticKind) => BALANCE.tacticBonus[t];
