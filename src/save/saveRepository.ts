// 저장 계층. 게임 코드는 이 인터페이스만 사용한다 → 나중에 Supabase로 교체 가능.
import { del, get, keys, set } from 'idb-keyval';
import { BALANCE, DATA, REGION_GRAPH, SAVE_VERSION, type GameState } from '../core';

export interface SaveMeta { slot: string; label: string; savedAt: string; turn: number; year: number; season: number }

export interface SaveRepository {
  save(slot: string, state: GameState): Promise<void>;
  load(slot: string): Promise<GameState | null>;
  list(): Promise<SaveMeta[]>;
  remove(slot: string): Promise<void>;
}

const PREFIX = 'hanbando3k:save:';

/** 구버전 세이브를 현재 구조로 올린다. 구조가 바뀌면 여기에 단계를 추가한다. */
export function migrate(raw: unknown): GameState {
  const s = raw as GameState;
  if (!s || typeof s !== 'object' || typeof s.saveVersion !== 'number') throw new Error('세이브 파일 형식이 아닙니다.');
  if (s.saveVersion > SAVE_VERSION) throw new Error('더 새로운 버전의 세이브입니다.');
  // v1 → v2: 외교 추가
  if (s.saveVersion < 2) { s.diplomacy = {}; s.offers = []; s.saveVersion = 2; }
  // v2 → v3: 날씨 추가
  if (s.saveVersion < 3) { s.weather = {}; for (const id of Object.keys(s.cities)) s.weather[id] = 'clear'; s.saveVersion = 3; }
  // v3 → v4: 사기·훈련
  if (s.saveVersion < 4) { for (const c of Object.values(s.cities)) { c.morale = 70; c.training = 50; } s.saveVersion = 4; }
  // v4 → v5: 후계·등장 장수
  if (s.saveVersion < 5) { s.heirs = {}; s.saveVersion = 5; }
  // v5 → v6: 첩보
  if (s.saveVersion < 6) { s.intel = {}; s.saveVersion = 6; }
  // v6 → v7: 역사서
  if (s.saveVersion < 7) { s.chronicle = []; s.annals = []; s.saveVersion = 7; }
  // v7 → v8: 도시 실측 고도 (v1.9)
  if (s.saveVersion < 8) {
    for (const c of DATA.cities) if (s.cities[c.id] && s.cities[c.id].elev === undefined) s.cities[c.id].elev = c.elev;
    s.saveVersion = 8;
  }
  // v8 → v9: 수군 (v2.0)
  if (s.saveVersion < 9) {
    for (const c of Object.values(s.cities)) if (c.ships === undefined) c.ships = c.port ? BALANCE.startShipsPort : 0;
    s.saveVersion = 9;
  }
  // v9 → v10: 한양 → 서울 개명 (v3.5, 도시 수치는 진행 중인 판을 그대로 둠)
  if (s.saveVersion < 10) {
    if (s.cities.hanyang?.name === '한양') s.cities.hanyang.name = '서울';
    s.saveVersion = 10;
  }
  // v10 → v11: 실측 지형(산악도·분지)·말 산지·군마·포로 (v4.0). 도시 지형·산물은 데이터에서 채운다
  if (s.saveVersion < 11) {
    const src = new Map([...DATA.cities, ...REGION_GRAPH.cities].map((c) => [c.id, c]));
    for (const c of Object.values(s.cities)) {
      const d = src.get(c.id);
      if (d) { c.relief = d.relief; c.basin = d.basin; c.landform = d.landform; c.horses = d.horses ?? 0; }
    }
    for (const f of Object.values(s.factions)) f.horses ??= Object.values(s.cities).filter((c) => c.owner === f.id).reduce((a, c) => a + (c.horses ?? 0), 0) * BALANCE.horsesStartPerLevel;
    s.captives ??= [];
    s.saveVersion = 11;
  }
  return s;
}

export const indexedDbRepo: SaveRepository = {
  async save(slot, state) {
    const meta: SaveMeta = { slot, label: slot === 'auto' ? '자동 저장' : `슬롯 ${slot}`, savedAt: new Date().toISOString(), turn: state.turn, year: state.year, season: state.season };
    await set(PREFIX + slot, { meta, state });
  },
  async load(slot) {
    const v = await get<{ meta: SaveMeta; state: GameState }>(PREFIX + slot);
    return v ? migrate(v.state) : null;
  },
  async list() {
    const ks = (await keys()).filter((k) => typeof k === 'string' && k.startsWith(PREFIX)) as string[];
    const metas = await Promise.all(ks.map(async (k) => (await get<{ meta: SaveMeta }>(k))?.meta));
    return metas.filter((m): m is SaveMeta => !!m).sort((a, b) => a.slot.localeCompare(b.slot));
  },
  async remove(slot) {
    await del(PREFIX + slot);
  },
};

export function exportJson(state: GameState) {
  const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `hanbando3k-${state.year}-${state.season}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
