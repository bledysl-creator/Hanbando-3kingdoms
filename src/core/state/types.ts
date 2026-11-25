// 게임 상태 타입. 모든 값은 JSON 직렬화 가능해야 한다 (클래스·함수·Map 금지).

export type FactionId = string;
export type CityId = string;
export type GeneralId = string;

export type Terrain = 'plain' | 'mountain' | 'coast' | 'river';
export type RoadType = 'land' | 'river' | 'pass' | 'sea';

export interface Stats {
  leadership: number; // 통솔
  war: number; // 무력
  intellect: number; // 지력
  politics: number; // 정치
  charm: number; // 매력
}

export interface Persona {
  ambition: number; // 야망
  righteousness: number; // 의리
  greed: number; // 탐욕
  pride: number; // 자존심
  risk: number; // 위험감수
}

export interface Faction {
  id: FactionId;
  name: string;
  hanja: string;
  color: string;
  rulerId: GeneralId;
  traits: string[];
  gold: number;
  food: number;
  wood: number;
  iron: number;
  alive: boolean;
}

export interface City {
  id: CityId;
  name: string;
  lon: number;
  lat: number;
  terrain: Terrain;
  fortress: boolean;
  port: boolean;
  owner: FactionId | null;
  population: number;
  agriculture: number;
  commerce: number;
  wall: number;
  order: number; // 민심
  troops: number;
  wood: number; // 목재 생산 등급
  iron: number; // 철 생산 등급
}

export interface Road {
  from: CityId;
  to: CityId;
  type: RoadType;
}

export interface General {
  id: GeneralId;
  name: string;
  hanja: string;
  birth: number;
  stats: Stats;
  persona: Persona;
  faction: FactionId | null; // null = 재야
  city: CityId;
  loyalty: number;
  acted: boolean; // 이번 턴 행동했는가
  alive: boolean;
}

export type RelationType = 'sworn' | 'trust' | 'enmity';
export interface Relation {
  a: GeneralId;
  b: GeneralId;
  type: RelationType;
}

export type LogKind = 'info' | 'warn' | 'danger' | 'good';
export interface LogEntry {
  turn: number;
  year: number;
  season: number;
  text: string;
  kind: LogKind;
  factionId?: FactionId | null;
}

export type MissionKind = 'own_all_cities' | 'destroy_faction' | 'recruit';
export interface Mission {
  id: string;
  label: string;
  kind: MissionKind;
  target: number;
  factionId?: FactionId;
}

export interface BattleReport {
  turn: number;
  attackerFaction: FactionId;
  defenderFaction: FactionId | null;
  fromCity: CityId;
  toCity: CityId;
  generalId: GeneralId;
  attackerTroops: number;
  defenderTroops: number;
  attackerPower: number;
  defenderPower: number;
  attackerLoss: number;
  defenderLoss: number;
  won: boolean;
  reasons: string[];
}

export type DiplomaticStatus = 'war' | 'truce' | 'alliance';
export interface Treaty {
  status: DiplomaticStatus;
  until: number | null; // 만료 턴 (null = 무기한)
}
export interface DiplomaticOffer {
  from: FactionId;
  to: FactionId;
  proposal: 'truce' | 'alliance';
  gold: number;
  turn: number;
}

export interface GameState {
  saveVersion: number;
  scenarioId: string;
  turn: number;
  year: number;
  season: number; // 0 봄 1 여름 2 가을 3 겨울
  era: string;
  eraStartYear: number;
  rng: number;
  playerFactionId: FactionId | null; // null = 관전 모드
  factions: Record<FactionId, Faction>;
  cities: Record<CityId, City>;
  roads: Road[];
  generals: Record<GeneralId, General>;
  relations: Relation[];
  missions: Mission[];
  recruits: Record<FactionId, number>;
  log: LogEntry[];
  lastBattles: BattleReport[];
  diplomacy: Record<string, Treaty>; // key: 'a|b' (사전순)
  offers: DiplomaticOffer[]; // AI → 플레이어 제안 (플레이어 응답 대기)
  outcome: 'playing' | 'won' | 'lost' | 'unified';
  winner: FactionId | null;
}
