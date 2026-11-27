// v4.4.1 길별·방향별 전투 지형.
// 같은 길이라도 어느 쪽에서 쳐들어가느냐에 따라 싸우는 땅이 다르다. 예: 원주→서울은 한강 들판으로 내려오며 넓어지고,
// 서울→원주는 산골짜기로 들어간다. 실측 DEM과 하천 데이터로 길마다·방향마다 평지·구릉·산악·계곡·강 비율을 재 두었다
// (tools/geo/build_road_terrain.py → data/geo/road_terrain.json). 여기서는 그 값을 전투에 쓰는 지형 판정으로 바꾼다.
import roadTerrainJson from '../../../data/geo/road_terrain.json';
import { BALANCE } from '../config';
import type { City, Road } from '../state/types';
import { reliefOf } from './formation';

export type RouteLabel = 'plain' | 'hill' | 'mountain' | 'valley' | 'river' | 'sea';
export interface RouteTerrain {
  /** 목표에 다가가는 구간(뒤쪽에 무게)의 지형 비율. plain+hill+mountain+valley = 1, river는 따로 (강변·도하 구간) */
  plain: number; hill: number; mountain: number; valley: number; river: number;
  /** 목표 앞 평균 고도 − 길 중간 평균 고도 (m). 양수면 공격군이 올려 친다 */
  climb: number;
  /** 길의 가중 기복 (도시 산악도와 같은 눈금) */
  relief: number;
  /** 직선이 하천을 가로지르는 횟수 */
  crossings: number;
  label: RouteLabel;
}

const ROUTES = roadTerrainJson as unknown as Record<string, RouteTerrain>;

export const ROUTE_LABEL: Record<RouteLabel, { name: string; icon: string }> = {
  plain: { name: '평지', icon: '🌾' },
  hill: { name: '구릉', icon: '🌄' },
  mountain: { name: '산악', icon: '⛰️' },
  valley: { name: '계곡', icon: '🏞️' },
  river: { name: '강', icon: '🌊' },
  sea: { name: '바다', icon: '⛵' },
};

/** from에서 to로 쳐들어갈 때 싸우는 땅 (데이터가 없으면 null) */
export function routeProfile(from: string, to: string): RouteTerrain | null {
  return ROUTES[`${from}>${to}`] ?? null;
}

/** 길의 공격 방향: target 쪽으로 */
export function attackFrom(road: Road, targetId: string): string {
  return road.to === targetId ? road.from : road.to;
}

export interface Ground {
  from: string; to: string;
  route: RouteTerrain | null;
  /** 전투 산악도: 목표 도시 산악도와 길 기복의 평균 */
  rel: number;
  /** 트인 들판 (기병·전차 유리, 매복 불리) */
  open: boolean;
  /** 험한 땅 (좁은 길: 수비 방진 강화, 공격 돌격 약화, 추격 약화) */
  rough: boolean;
  /** 골짜기 (매복 유리) */
  valley: boolean;
  /** 강을 끼고 싸움 (반도격·수공 가능, 궁병 도하 엄호) */
  river: boolean;
  /** 공격군이 올려 치는 높이 (m, 음수면 내려 친다) */
  climb: number;
  label: RouteLabel;
}

/** 길(road)로 target을 칠 때의 전투 지형 */
export function groundOf(road: Road, target: City): Ground {
  const from = attackFrom(road, target.id);
  const route = BALANCE.ground.enabled ? routeProfile(from, target.id) : null;
  const cityRel = reliefOf(target);
  const G = BALANCE.ground;
  if (!route) {
    // 옛 판정 (데이터 없음)
    return {
      from, to: target.id, route: null, rel: cityRel,
      open: cityRel < BALANCE.reliefCavalryFrom && road.type === 'land',
      rough: road.type === 'pass' || cityRel >= 45,
      valley: road.type === 'pass' || cityRel >= 45,
      river: road.type === 'river',
      climb: 0,
      label: road.type === 'sea' ? 'sea' : road.type === 'river' ? 'river' : road.type === 'pass' ? 'mountain' : cityRel >= 45 ? 'mountain' : 'plain',
    };
  }
  const rel = Math.round(cityRel * (1 - G.routeReliefWeight) + route.relief * G.routeReliefWeight);
  const roughShare = route.mountain + route.valley;
  return {
    from, to: target.id, route, rel,
    open: road.type === 'land' && route.plain >= G.openPlain && rel < G.openRelief,
    rough: road.type === 'pass' || roughShare >= G.roughShare || rel >= 45,
    valley: road.type === 'pass' || route.valley >= G.valleyShare || rel >= 45,
    river: road.type === 'river' || route.label === 'river',
    climb: route.climb,
    label: route.label,
  };
}

/** 길 지형이 공격력에 주는 배율: 넓은 들로 내려오면 대군이 펼쳐지고, 골짜기·산을 오르면 막힌다 */
export function routeAttackMul(g: Ground): { mul: number; text?: string } {
  const r = g.route;
  if (!r) return { mul: 1 };
  if (r.label === 'sea') return { mul: 1, text: routeText(r) }; // 바다는 상륙전 규칙(전선)으로 따로 계산
  const G = BALANCE.ground;
  let m = 1 + G.plainBonus * (r.plain - G.plainRef) - G.valleyPenalty * r.valley - G.mountainPenalty * r.mountain;
  if (g.climb > G.climbFrom) m -= Math.min(G.climbCap, (g.climb - G.climbFrom) / G.climbDiv);
  else if (g.climb < -G.climbFrom) m += Math.min(G.descendCap, (-g.climb - G.climbFrom) / G.climbDiv / 2);
  m = Math.max(G.min, Math.min(G.max, m));
  return { mul: m, text: routeText(r) };
}

/** "평지 62% · 구릉 21% · 강 24%" */
export function routeText(r: RouteTerrain): string {
  if (r.label === 'sea') return '바다를 건너 상륙';
  const parts = (['plain', 'hill', 'mountain', 'valley'] as const).filter((k) => r[k] >= 0.05).sort((a, b) => r[b] - r[a]).map((k) => `${ROUTE_LABEL[k].name} ${Math.round(r[k] * 100)}%`);
  if (r.river >= 0.05) parts.push(`강 ${Math.round(r.river * 100)}%`);
  return parts.join(' · ');
}

/** 올려 치기·내려 치기 설명 */
export function climbText(climb: number): string | null {
  if (climb >= 60) return `목표가 ${climb}m 높아 올려 침`;
  if (climb <= -60) return `${-climb}m 내려가며 침`;
  return null;
}
