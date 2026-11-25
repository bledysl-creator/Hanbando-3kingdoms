// 한반도 지리 데이터(단순화). 경위도 → 화면 좌표 투영.
// 해안선은 실제 지형을 참고해 손으로 단순화한 것. Phase 1에서 OSM/DEM 기반으로 교체 예정.

export const VIEW_W = 560;
export const VIEW_H = 1000;
const LON0 = 124, LAT0 = 43;
const KX = 78.8, KY = 100; // cos(38°) 보정

export type LonLat = [number, number];
export const project = ([lon, lat]: LonLat): [number, number] => [(lon - LON0) * KX, (LAT0 - lat) * KY];

export const PENINSULA: LonLat[] = [
  [124.35, 40.05], [124.9, 40.45], [125.5, 40.85], [126.0, 41.35], [126.6, 41.7], [127.2, 41.5], [128.0, 41.45],
  [128.2, 41.95], [128.9, 42.05], [129.6, 42.45], [130.0, 42.9], [130.6, 42.45], [130.4, 42.25], [129.8, 41.8],
  [129.65, 41.3], [129.3, 40.9], [128.6, 40.3], [127.9, 39.95], [127.5, 39.7], [127.42, 39.3], [127.6, 39.0],
  [128.3, 38.6], [128.6, 38.2], [128.9, 37.75], [129.2, 37.4], [129.4, 36.9], [129.45, 36.4], [129.58, 36.05],
  [129.4, 35.5], [129.15, 35.1], [128.6, 34.95], [128.0, 34.85], [127.7, 34.7], [127.3, 34.5], [126.8, 34.4],
  [126.4, 34.3], [126.3, 34.75], [126.35, 35.1], [126.5, 35.6], [126.72, 36.0], [126.5, 36.4], [126.15, 36.75],
  [126.55, 37.0], [126.62, 37.45], [126.2, 37.7], [125.7, 37.7], [125.2, 37.9], [124.8, 38.1], [125.15, 38.6],
  [125.38, 38.75], [125.1, 39.2], [124.9, 39.6],
];

export const JEJU: LonLat[] = [
  [126.17, 33.3], [126.3, 33.22], [126.6, 33.24], [126.9, 33.35], [126.95, 33.48], [126.7, 33.56], [126.4, 33.5], [126.17, 33.38],
];

export const RIVERS: { name: string; pts: LonLat[] }[] = [
  { name: '대동강', pts: [[127.0, 39.6], [126.3, 39.2], [125.75, 39.02], [125.3, 38.75]] },
  { name: '청천강', pts: [[126.6, 40.3], [125.9, 39.8], [125.5, 39.6]] },
  { name: '한강', pts: [[128.4, 37.3], [127.9, 37.5], [127.3, 37.5], [126.98, 37.53], [126.6, 37.7]] },
  { name: '금강', pts: [[127.6, 35.9], [127.6, 36.4], [127.3, 36.5], [127.1, 36.4], [126.9, 36.2], [126.72, 36.0]] },
  { name: '낙동강', pts: [[128.9, 37.0], [128.6, 36.6], [128.3, 36.2], [128.4, 35.8], [128.6, 35.4], [128.95, 35.1]] },
  { name: '영산강', pts: [[126.95, 35.25], [126.7, 35.0], [126.4, 34.8]] },
];

export const RIDGES: { name: string; pts: LonLat[] }[] = [
  { name: '태백산맥', pts: [[128.2, 38.9], [128.5, 38.3], [128.8, 37.8], [129.05, 37.2], [129.2, 36.6], [129.1, 36.1]] },
  { name: '소백산맥', pts: [[128.7, 37.0], [128.2, 36.8], [127.9, 36.3], [127.7, 35.8], [127.6, 35.3]] },
  { name: '낭림산맥', pts: [[126.9, 41.1], [127.1, 40.4], [127.2, 39.8]] },
  { name: '함경산맥', pts: [[127.4, 40.6], [128.3, 40.9], [129.0, 41.4], [129.5, 41.95]] },
  { name: '개마고원', pts: [[127.6, 41.2], [128.1, 41.1], [128.6, 41.6]] },
];

export const toPath = (pts: LonLat[], close = false) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${project(p).map((v) => v.toFixed(1)).join(',')}`).join('') + (close ? 'Z' : '');

/** 산맥 선을 따라 작은 산 기호(^)를 배치 */
export function mountainGlyphs(pts: LonLat[], step = 14): [number, number][] {
  const xy = pts.map(project);
  const out: [number, number][] = [];
  for (let i = 0; i < xy.length - 1; i++) {
    const [x1, y1] = xy[i], [x2, y2] = xy[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    for (let d = 0; d < len; d += step) {
      const t = d / len;
      const jitter = ((i * 31 + Math.round(d)) % 7) - 3;
      out.push([x1 + (x2 - x1) * t + jitter, y1 + (y2 - y1) * t - jitter / 2]);
    }
  }
  return out;
}

// ── 전국 시·군 (v0.5) ── data/geo/regions.json (tools/geo/build_regions.py로 생성)
import regionsJson from '../../data/geo/regions.json';

export interface Region {
  id: string;
  name: string;
  province: string;
  lon: number;
  lat: number;
  parent: string; // 관할 게임 도시 id
  elev: number; // 추정 평균 고도(m) — tools/geo/estimate_elevation.py
  rings: LonLat[][];
}

export const REGIONS = regionsJson as unknown as Region[];

/** 시·군별 SVG path (투영 완료, 한 번만 계산) */
export const REGION_PATHS: Record<string, string> = Object.fromEntries(
  REGIONS.map((r) => [r.id, r.rings.map((ring) => toPath(ring, true)).join('')]),
);

/** 전체 육지 path (해안선) */
export const LAND_PATH = Object.values(REGION_PATHS).join('');
