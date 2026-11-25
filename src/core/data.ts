// 고정 데이터 로더. data/*.json을 타입과 함께 노출한다.
import factionsJson from '../../data/factions.json';
import citiesJson from '../../data/cities.json';
import roadsJson from '../../data/roads.json';
import generalsJson from '../../data/generals.json';
import scenario197 from '../../data/scenarios/197_sabun.json';
import type { Persona, RoadType, Stats, Terrain, MissionKind, RelationType } from './state/types';

export interface FactionDef { id: string; name: string; hanja: string; color: string; rulerId: string; traits: string[] }
export interface CityDef {
  id: string; name: string; lon: number; lat: number; terrain: Terrain; fortress: boolean; port: boolean;
  population: number; agriculture: number; commerce: number; wall: number; wood: number; iron: number;
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
};
