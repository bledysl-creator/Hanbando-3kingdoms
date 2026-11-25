// 고정 데이터 로더. data/*.json을 타입과 함께 노출한다.
import factionsJson from '../../data/factions.json';
import citiesJson from '../../data/cities.json';
import roadsJson from '../../data/roads.json';
import generalsJson from '../../data/generals.json';
import landmarksJson from '../../data/landmarks.json';
import scenario197 from '../../data/scenarios/197_sabun.json';
import scenario190 from '../../data/scenarios/190_gunung.json';
import regionGraphJson from '../../data/geo/region_graph.json';
import type { Persona, RoadType, Stats, Terrain, MissionKind, RelationType } from './state/types';

export interface FactionDef { id: string; name: string; hanja: string; color: string; rulerId: string; traits: string[] }
export interface CityDef {
  id: string; name: string; lon: number; lat: number; elev?: number; terrain: Terrain; fortress: boolean; port: boolean;
  population: number; agriculture: number; commerce: number; wall: number; wood: number; iron: number;
  /** 군현 지도(v3.2)에서만: 원래 관할 도시와 그 도시의 치소(중심 시·군) 여부 */
  parent?: string; seat?: boolean;
}
export interface RoadDef { from: string; to: string; type: RoadType }
export interface GeneralDef { id: string; name: string; hanja: string; birth: number; stats: Stats; persona: Persona }
export interface ScenarioDef {
  id: string; name: string; description: string; year: number; season: number; era: string; eraStartYear: number;
  playerFactionId: string | null;
  factions: Record<string, { gold: number; food: number; wood: number; iron: number }>;
  cities: Record<string, { owner: string | null; troops: number }>;
  generals: Record<string, { faction: string | null; city: string; loyalty: number }>;
  relations: { a: string; b: string; type: RelationType }[];
  missions: { id: string; label: string; kind: MissionKind; target: number; factionId?: string }[];
  rivals?: Record<string, string>;
  debuts?: Record<string, { year: number; city: string; faction: string | null }>;
  heirs?: Record<string, string[]>;
  factionIntro?: Record<string, string>;
  /** 시작 시 맺어진 맹약 (v1.7) */
  treaties?: { a: string; b: string; status: 'truce' | 'alliance'; turns: number | null; note?: string }[];
  /** 시나리오에서만 쓰는 세력 이름 (v3.2, 예: 190년 위 → 조) */
  factionNames?: Record<string, { name: string; hanja: string }>;
}

export type LandmarkType = 'pass' | 'ford' | 'port' | 'fortress';
export interface LandmarkDef {
  id: string; name: string; type: LandmarkType; lon: number; lat: number;
  road?: string[] | null; city?: string | null; note: string;
}
export const LANDMARKS: LandmarkDef[] = landmarksJson as LandmarkDef[];

/** 군현 지도(v3.2): 시·군 345곳 도시·도로와 거점 → 시·군 대응 (tools/geo/build_region_graph.py) */
export const REGION_GRAPH = regionGraphJson as unknown as { cities: CityDef[]; roads: RoadDef[]; landmarkRegion: Record<string, string> };

/** 두 도시를 잇는 길 위의 고개·나루 (군현 지도에서는 길 자체가 고개·강 종류를 가진다) */
export function landmarksOnRoad(a: string, b: string): LandmarkDef[] {
  return LANDMARKS.filter((l) => l.road && ((l.road[0] === a && l.road[1] === b) || (l.road[0] === b && l.road[1] === a)));
}
/** 도시에 딸린 산성·항구 */
export function landmarksOfCity(cityId: string, type?: LandmarkType): LandmarkDef[] {
  return LANDMARKS.filter((l) => (l.city === cityId || (!!l.city && REGION_GRAPH.landmarkRegion[l.id] === cityId)) && (!type || l.type === type));
}

export interface GameData {
  factions: FactionDef[];
  cities: CityDef[];
  roads: RoadDef[];
  generals: GeneralDef[];
}

export const DATA: GameData = {
  factions: factionsJson as FactionDef[],
  cities: citiesJson as CityDef[],
  roads: roadsJson as RoadDef[],
  generals: generalsJson as GeneralDef[],
};

export const SCENARIOS: Record<string, ScenarioDef> = {
  [scenario197.id]: scenario197 as ScenarioDef,
  [scenario190.id]: scenario190 as unknown as ScenarioDef,
};
