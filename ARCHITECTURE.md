# ARCHITECTURE.md — 시스템 아키텍처

> 기준 버전 v2.8. 규칙은 [`CLAUDE.md`](./CLAUDE.md) 4장, 계산식은 [`SIMULATION_RULES.md`](./SIMULATION_RULES.md).

## 1. 전체 구조

```
 data/*.json ──┐                          ┌── src/ui (React 19)  ── 화면·입력
 data/geo/*  ──┤                          │       │ applyCommand / endTurn
               ▼                          │       ▼
        src/core/data.ts ──► createGame ──► GameState (평범한 JSON 객체)
                                             │   ▲
          commands/  battle/  systems/  ai/  │   │ executeCommand (드래프트 수정)
          diplomacy/ rng/ (시드 난수)  ──────┘   │
                                                 │
 src/map (SVG 지도: geo.ts 투영 + KoreaMap.tsx) ─┘ 읽기 전용
 src/save (IndexedDB + JSON, migrate v1→v9)
 src/sim/simWorker.ts (Web Worker: 관전 N판 통계)
 tools/ (simulate.ts, validate-data.ts, geo/*.py 지도 데이터 생성)
```

- **core는 DOM·React·브라우저 API를 모른다.** Node(tsx)·Worker·브라우저 어디서나 같은 결과.
- UI는 `src/core/index.ts`만 import한다.
- 상태 변경은 두 경로뿐: `applyCommand(state, faction, cmd)`(복사본에 적용)와 `endTurn(state)`.

## 2. 턴 파이프라인 (`systems/turn.ts › endTurnMut`)

```
플레이어 명령들 ─► [AI 세력 순서대로 runFactionAI: 외교 → 장수별 Utility 선택 → executeCommand]
  ─► processEconomy (수입·수확·군량 소비·탈영·인구)
  ─► processEpidemics ─► processWildfires ─► processGovernors
  ─► applyWeatherEffects ─► processLoyalty (충성·이탈) ─► checkOutcome
  ─► 계절 +1 ─► rollWeather ─► processLifecycle (노화·사망·후계·등장)
  ─► recordAnnal(연초) ─► processAiUprisings ─► processSurrenders(연초) ─► expireTreaties
```

## 3. 모듈 의존성

| 모듈 | 의존 | 비고 |
|---|---|---|
| rng | 없음 | mulberry32, 상태는 `GameState.rng` 숫자 하나 |
| config | 없음 | 모든 밸런스 수치 |
| data | config, JSON | 고정 데이터·거점·하천 |
| query | state | 순수 조회 (이웃·보급·연결) |
| battle | config, data, rng, weather, tactics | 전투 결과 + 원인 |
| commands | battle, diplomacy, systems/* | 플레이어·AI 공용 명령 |
| systems/* | commands(log), rng, query | 계절 처리 |
| ai | commands, battle/estimate, diplomacy | 명령만 사용 |
| map(UI) | core 공개 API, data/geo | 표시만 |

순환 참조(commands ↔ systems)는 함수 호출 시점에만 쓰여 ESM에서 안전하다. 새 시스템은 `systems/`에 두고 `turn.ts`에서 한 줄로 연결한다.

## 4. 결정론
- 모든 확률은 `rng.chance/rand/pick`만 사용(`Math.random` 금지). 테스트: 같은 시드·같은 명령 → 같은 상태 JSON.
- 객체 순회 순서는 데이터 정의 순서로 고정(Record 키 삽입 순).
- UI의 연출(애니메이션)은 상태를 바꾸지 않는다.

## 5. 저장
- `SaveRepository` 인터페이스 → `indexedDbRepo`(idb-keyval) · JSON 내보내기/불러오기.
- `saveVersion` + `migrate()` 단계별 변환. 구조 변경 시 버전 +1과 테스트 필수.
- **미구현**: 이벤트 로그 + 스냅샷으로 과거 시점 재현 (ROADMAP v3.9). 설계: 매 연초 스냅샷(JSON) + 턴별 명령 로그 → 스냅샷에서 명령을 재실행하면 결정론 덕분에 같은 상태가 된다.

## 6. 성능 분석

| 시스템 | 현재 규모 | 비용 | 확장 시 문제 | 대응 |
|---|---|---|---|---|
| AI 1턴 | 도시 24 × 장수 ~50 | 장수마다 이웃 탐색 O(N·deg) | 도시 345·장수 300이면 BFS(frontDistance) 반복이 병목 | 턴당 1회 계산 캐시 |
| 관전 100판×160턴 | ~15초 (Node) | 1판 ≈ 0.15초 | 1,000판 ≈ 2.5분 | Worker 병렬(브라우저), Node는 tools/ |
| SVG 지도 | 시·군 path 345 + 효과 | DOM 수천 개 | 육각 타일 5만 개는 SVG 불가 | **Canvas/WebGL 전환 필요** (v4.0) |
| 저장 | 상태 ~30KB | 무시 | 장수 1,000명·로그 커지면 수 MB | 로그 상한·압축 |
| 날씨·산불 연출 | 영향 도시 수만큼 clipPath | 가벼움 | 타일화 시 셰이더로 | — |

## 7. 구현 난이도 (다음 단계)

| 시스템 | 난이도 | 의존 | 위험 |
|---|---|---|---|
| 개발자 모드(AI 근거) | 하 | ai | 없음 |
| 반란·독립·망명 | 중 | persona, lifecycle | 밸런스 붕괴(세력 난립) |
| 인간관계 수치화·심리 확장 | 중 | persona, 세이브 | 데이터 작성량 |
| 혼인·무역·영토교환·밀약 | 중 | diplomacy, 결혼 시스템 | AI 수락 규칙 |
| 피로·장비·부상·군마 | 중 | battle, economy | 수치 폭증 |
| 인구 동태·난민·산업 | 중 | economy | 시뮬 안정성 |
| 장수 대량 확충 | 중(데이터) | data | 고증·능력치 작성량 |
| 군현 시작(345 도시) | 상 | data, map, ai 성능 | AI 속도, 도로망 자동 생성 |
| 부대 이동(행군) | 상 | 새 상태(Army), map | 턴 구조 변경 |
| 육각 타일 5만 + Canvas | 최상 | 지도 데이터 파이프라인, 렌더러 교체 | 전면 재작성 |
| LLM 외교 | 중 | 외부 API(선택) | 비용 0 원칙 → 플러그인으로만 |
