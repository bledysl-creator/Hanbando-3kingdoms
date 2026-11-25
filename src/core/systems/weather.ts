// 날씨·기후 (v0.7): 계절과 지역(북부·중부·남부, 해안)에 따라 도시마다 날씨가 정해진다.
// 날씨는 전투·수확·인구·병력에 영향을 준다 (Game.md 4 — 장마·태풍·한파·폭설·가뭄).
import { BALANCE } from '../config';
import { rand } from '../rng/rng';
import type { City, GameState, WeatherKind } from '../state/types';

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: '맑음', rain: '비', storm: '폭우', typhoon: '태풍', snow: '눈', blizzard: '폭설', cold: '한파', drought: '가뭄', fog: '안개',
};
export const WEATHER_ICON: Record<WeatherKind, string> = {
  clear: '☀️', rain: '🌧️', storm: '⛈️', typhoon: '🌀', snow: '🌨️', blizzard: '❄️', cold: '🥶', drought: '🏜️', fog: '🌫️',
};

type Zone = 'north' | 'central' | 'south';
const zoneOf = (c: City): Zone => (c.lat >= 39.5 ? 'north' : c.lat >= 36.3 ? 'central' : 'south');
const coastal = (c: City) => c.port || c.terrain === 'coast';

/** 계절·지역별 날씨 확률표 (합이 1이 아니어도 됨 — 나머지는 맑음) */
function table(season: number, zone: Zone, isCoast: boolean): [WeatherKind, number][] {
  switch (season) {
    case 0: return [['rain', 0.18], ['drought', zone === 'north' ? 0.04 : 0.08], ['fog', 0.08], ['cold', zone === 'north' ? 0.08 : 0]];
    case 1: return [['rain', 0.25], ['storm', zone === 'north' ? 0.1 : 0.2], ['typhoon', isCoast && zone === 'south' ? 0.12 : isCoast ? 0.05 : 0], ['drought', 0.06]];
    case 2: return [['rain', 0.12], ['typhoon', isCoast && zone === 'south' ? 0.08 : 0], ['fog', 0.08]];
    default: return zone === 'north'
      ? [['snow', 0.3], ['blizzard', 0.25], ['cold', 0.25]]
      : zone === 'central' ? [['snow', 0.3], ['blizzard', 0.08], ['cold', 0.2]] : [['snow', 0.15], ['cold', 0.1], ['rain', 0.1]];
  }
}

export function rollWeather(s: GameState) {
  for (const c of Object.values(s.cities)) {
    const r = rand(s);
    let acc = 0;
    let w: WeatherKind = 'clear';
    for (const [k, p] of table(s.season, zoneOf(c), coastal(c))) {
      acc += p;
      if (r < acc) { w = k; break; }
    }
    s.weather[c.id] = w;
  }
}

/** 공격 측 전투력 배율과 이유 (목표 도시 날씨 기준) */
export function weatherAttackModifier(w: WeatherKind | undefined, roadType: string): { mul: number; reason?: string } {
  const m = BALANCE.weatherAttack[w ?? 'clear'] ?? 1;
  if (m === 1) return { mul: 1 };
  let mul = m;
  if ((w === 'storm' || w === 'typhoon') && roadType === 'river') mul *= 0.85; // 불어난 강
  return { mul, reason: `${WEATHER_LABEL[w!]}${roadType === 'river' && (w === 'storm' || w === 'typhoon') ? '로 강물이 불어' : ''} 공격력 ${Math.round((1 - mul) * 100)}% 감소` };
}

/** 계절 처리 때 날씨 피해 적용. 플레이어 도시 피해는 기록한다. */
export function applyWeatherEffects(s: GameState, log: (text: string, factionId: string | null) => void) {
  for (const c of Object.values(s.cities)) {
    const w = s.weather[c.id];
    if (w === 'typhoon' || w === 'storm') {
      const loss = w === 'typhoon' ? 4 : 2;
      c.agriculture = Math.max(5, c.agriculture - loss);
      c.population = Math.round(c.population * (w === 'typhoon' ? 0.985 : 0.995));
      if (w === 'typhoon') c.wall = Math.max(10, c.wall - 3);
      if (c.owner) log(`${c.name}에 ${WEATHER_LABEL[w]} 피해 — 농업 −${loss}${w === 'typhoon' ? ', 성벽 −3' : ''}`, c.owner);
    } else if (w === 'drought') {
      c.droughtTurns = (c.droughtTurns ?? 0) + 1;
      c.order = Math.max(0, c.order - 3);
      if (c.owner) log(`${c.name}에 가뭄 — 올가을 수확이 줄어듭니다`, c.owner);
    } else if (w === 'cold' || w === 'blizzard') {
      const lost = Math.round(c.troops * (w === 'blizzard' ? 0.02 : 0.01));
      c.troops -= lost;
      if (c.owner && lost > 300) log(`${c.name}의 ${WEATHER_LABEL[w]}로 병사 ${lost.toLocaleString()}명이 동상·이탈`, c.owner);
    }
  }
}
