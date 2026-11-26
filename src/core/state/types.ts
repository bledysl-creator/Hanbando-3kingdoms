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
  /** 군현 지도(v3.2): 원래 관할 도시, 치소 여부 */
  parent?: string;
  seat?: boolean;
  /** 도성 시·군의 실측 평균 고도(m) (v1.9) */
  elev?: number;
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
  morale: number; // 사기 0~100 (v0.8)
  training: number; // 훈련도 0~100 (v0.8)
  wood: number; // 목재 생산 등급
  iron: number; // 철 생산 등급
  /** 전선(戰船) 척수 — 항구 도시만 (v2.0) */
  ships?: number;
  /** 역병이 남은 턴 수 (v2.3) */
  epidemic?: number;
  /** 산불이 남은 턴 수 (v2.8) */
  fire?: number;
  /** 태수 장수 id (v2.4) */
  governor?: string;
  droughtTurns?: number; // 이번 해 가뭄을 겪은 계절 수 (가을 수확 감소)
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
  memories?: Memory[]; // 기억 (v0.9)
  debut?: { year: number; city: CityId; faction: FactionId | null }; // 등장 예정 (v1.0)
}

export type MemoryKind = 'rewarded' | 'ignored' | 'defeatedBy' | 'defeated' | 'recruitedBy' | 'refusedOrder';
export interface Memory {
  turn: number;
  kind: MemoryKind;
  with: GeneralId; // 관련 인물
}

export type RelationType = 'sworn' | 'trust' | 'enmity';
export interface Relation {
  a: GeneralId;
  b: GeneralId;
  type: RelationType;
}

export type WeatherKind = 'clear' | 'rain' | 'storm' | 'typhoon' | 'snow' | 'blizzard' | 'cold' | 'drought' | 'fog';

export type LogKind = 'info' | 'warn' | 'danger' | 'good';
export interface LogEntry {
  turn: number;
  year: number;
  season: number;
  text: string;
  kind: LogKind;
  factionId?: FactionId | null;
  /** v3.4 그림 안내 카드용 사건 종류와 상대 세력 */
  event?: EventKind;
  other?: FactionId | null;
}
export type EventKind = 'capture' | 'destroyed' | 'rebel' | 'debut' | 'death' | 'uprising' | 'plague' | 'fire' | 'harvest' | 'surrender' | 'treaty';

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
  /** v3.9 전투 세부 (선택) */
  tactic?: { kind: import('../battle/tactics').TacticKind; success: boolean; chance: number };
  formation?: import('../battle/formation').FormationKind;
  duel?: import('../battle/battle').DuelResult;
  phases?: { clashAttacker: number; clashDefender: number; pursuit: number; pursuer: 'attacker' | 'defender' };
  defenderSurvivors?: number;
}

export interface AiTraceEntry {
  turn: number;
  faction: FactionId;
  general: GeneralId;
  city: CityId;
  /** 점수 높은 순 후보 (최대 5개) */
  options: { why: string; score: number; cmd: string }[];
  /** 실제로 실행된 후보 (options 인덱스), 없으면 -1 */
  chosen: number;
  result: string;
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
  /** 지도 규모 (v3.2): city = 24개 도시, region = 시·군 345곳 */
  mapScale?: 'city' | 'region';
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
  weather: Record<CityId, WeatherKind>; // 이번 계절 도시별 날씨 (v0.7)
  heirs: Record<FactionId, GeneralId[]>;
  chronicle: { year: number; season: number; text: string }[]; // 역사서용 큰 사건 (v1.2)
  annals: { year: number; cities: Record<FactionId, number>; troops: Record<FactionId, number>; rulers: Record<FactionId, GeneralId> }[]; // 연초 국세 (v1.2)
  intel: Record<FactionId, Record<CityId, { turn: number; troops: number; false?: boolean }>>; // 첩보 (v1.1) // 후계 순위 (v1.0)
  diplomacy: Record<string, Treaty>; // key: 'a|b' (사전순)
  offers: DiplomaticOffer[]; // AI → 플레이어 제안 (플레이어 응답 대기)
  /** v3.6 플레이어 도시 포위: 다음 턴 시작에 플레이어가 고른 대응으로 결판난다 */
  sieges?: Siege[];
  /** v3.6.1 세력별 화친 재요청 금지 기한 (이 턴 전까지 거절) */
  parleyUntil?: Record<FactionId, number>;
  /** 개발자 모드: 지난 턴 AI 판단 근거 (v3.0, 선택 — 저장해도 무방) */
  aiTrace?: AiTraceEntry[];
  outcome: 'playing' | 'won' | 'lost' | 'unified';
  winner: FactionId | null;
}

/** v3.6 포위 대응 */
export type SiegeResponse =
  | { kind: 'hold' }
  | { kind: 'pincer'; fromCity: CityId; troops: number }
  | { kind: 'sortie' }
  | { kind: 'evacuate'; toCity: CityId }
  | { kind: 'parley' };

export interface Siege {
  id: string;
  turn: number;
  attackerFaction: FactionId;
  generalId: GeneralId;
  fromCity: CityId;
  toCity: CityId;
  troops: number;
  tactic?: import('../battle/tactics').TacticKind;
  /** v3.9 병종 편성 */
  formation?: import('../battle/formation').FormationKind;
  morale: number;
  training: number;
  ships: number;
  supply?: number;
  isolated: boolean;
  response?: SiegeResponse;
}
