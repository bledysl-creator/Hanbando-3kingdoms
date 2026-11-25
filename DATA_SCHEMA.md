# DATA_SCHEMA.md — 데이터 구조

> 고정 데이터는 `data/*.json`(모딩 대상), 진행 상태는 `GameState`(세이브). 타입 원본: `src/core/data.ts`, `src/core/state/types.ts`. 기준 v2.8, 세이브 v9.

## 1. 고정 데이터

### factions.json — `FactionDef[]`
| 필드 | 타입 | 설명 |
|---|---|---|
| id | string | `wei` |
| name / hanja | string | 위 / 魏 |
| color | string | 세력색 |
| rulerId | string | 군주 장수 id |
| traits | string[] | 세력 특성 (`BALANCE.traitEffects` 키) |

### cities.json — `CityDef[]`
| 필드 | 타입 | 설명 |
|---|---|---|
| id, name | string | `hanyang`, 한양 |
| lon, lat | number | 경위도 |
| elev | number | 도성 시·군 실측 평균 고도(m) |
| terrain | `plain`·`mountain`·`coast`·`river` | 지형 |
| fortress, port | boolean | 산성·항구 |
| population | number | 인구 |
| agriculture, commerce, wall | 0~100 | 농업·상업·성벽 |
| wood, iron | 1~5 | 생산 등급 |

### roads.json — `{ from, to, type }[]` (`land`·`river`·`pass`·`sea`)

### generals.json — `GeneralDef[]`
| 필드 | 설명 |
|---|---|
| id, name, hanja, birth | `guan_yu`, 관우, 關羽, 160 |
| stats | { leadership, war, intellect, politics, charm } 1~100 (직접 정한 값) |
| persona | { ambition, righteousness, greed, pride, risk } 0~100 |

### landmarks.json — 고개·나루터·항구·산성
`{ id, name, type: 'pass'|'ford'|'port'|'fortress', lon, lat, road?: [cityA, cityB], city?: cityId, note }`

### geo/regions.json — 시·군 345곳
`{ id, name, province: '남'|'북', lon, lat, parent: cityId, elev, elevMax, rings: [lon,lat][][] }`

### geo/rivers.json — `{ name, source, estimated, pts: [lon,lat][] }[]`

### scenarios/*.json — `ScenarioDef`
| 필드 | 설명 |
|---|---|
| id, name, description, year, season, era, eraStartYear | 시작 시점 |
| factions | 세력별 시작 금·곡·목재·철 |
| cities | 도시별 `{ owner, troops }` |
| generals | 장수별 `{ faction, city, loyalty }` |
| relations | `{ a, b, type: 'sworn'|'trust'|'enmity' }` |
| missions, rivals, factionIntro | 임무·숙적·소개 |
| debuts | 등장 예정 `{ year, city, faction }` |
| heirs | 후계 순위 |
| treaties | 시작 맹약 `{ a, b, status, turns, note }` |

### public/terrain.webp — 실측 음영 기복도 (지도 투영과 같은 560×1000 좌표, 2배 해상도)

## 2. 진행 상태 `GameState`
| 필드 | 설명 |
|---|---|
| saveVersion | 9 |
| turn, year, season(0~3), era, eraStartYear | 시간 |
| rng | 시드 난수 상태 (정수 하나) |
| playerFactionId | null이면 관전 |
| factions | `Faction` = FactionDef + 자원 + alive |
| cities | `City` = CityDef + owner, troops, order, morale, training, ships?, epidemic?, fire?, governor?, droughtTurns? |
| generals | `General` = GeneralDef + faction, city, loyalty, acted, alive, memories?, debut? |
| roads, relations, missions, recruits | |
| weather | 도시별 이번 계절 날씨 |
| diplomacy | `'a|b'` → { status, until } |
| offers | AI → 플레이어 외교 제안 |
| intel | 세력별 첩보 (오보 포함) |
| log, lastBattles, chronicle, annals | 기록 (상한 있음) |
| heirs | 후계 순위 |
| outcome, winner | 승패 |

## 3. 세이브 마이그레이션
v1 외교 → v2 날씨 → … → v7 역사서 → v8 도시 고도 → v9 전선. `src/save/saveRepository.ts › migrate`. 새 필드는 가능하면 선택(optional)으로 두어 마이그레이션을 줄인다.

## 4. 확장 예정 스키마 (설계)
- `General.relations` 수치형: `{ [otherId]: { trust, respect, intimacy, grudge, jealousy, fear, favor } }`
- `General.persona` 확장: jealousy, vengeance, patience, suspicion
- `General.goals`: `{ short: GoalKind, long: GoalKind }`
- `Army`(지도 위 부대): `{ id, faction, general, troops, at: tileId|cityId, path, supply, fatigue }`
- `Tile`(육각): `{ q, r, elev, slope, soil, water, climate, resources, moveCost, owner }` — 별도 바이너리/청크 파일
