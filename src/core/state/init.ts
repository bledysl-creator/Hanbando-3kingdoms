import type { GameData, ScenarioDef } from '../data';
import { pairKey } from '../diplomacy/diplomacy';
import { BALANCE } from '../config';
import type { GameState } from './types';
import { rollWeather } from '../systems/weather';
import { recordAnnal } from '../systems/chronicle';
import { regionize } from './regionize';
import { foundFaction } from './found';
import { spreadGenerals } from './spread';

export const SAVE_VERSION = 10;

/** 시나리오와 고정 데이터로 새 게임 상태를 만든다. */
export interface CreateOptions {
  seed?: number;
  playerFactionId?: string | null;
  /** v3.1: 등장 예정 장수도 처음부터 등장 */
  allGenerals?: boolean;
  /** v3.2: 'region'이면 시·군 345곳이 각각 도시 */
  scale?: 'city' | 'region';
  /** v3.2: 아무 도시(시·군)에서 아무 장수를 군주로 새 세력을 세워 시작 */
  newRuler?: { cityId: string; generalId: string };
}

export function createGame(data: GameData, scenario: ScenarioDef, opts: CreateOptions = {}): GameState {
  if (opts.scale === 'region') ({ data, scenario } = regionize(data, scenario));
  const s: GameState = {
    saveVersion: SAVE_VERSION,
    scenarioId: scenario.id,
    mapScale: opts.scale ?? 'city',
    turn: 1,
    year: scenario.year,
    season: scenario.season,
    era: scenario.era,
    eraStartYear: scenario.eraStartYear,
    rng: (opts.seed ?? 20261125) | 0,
    playerFactionId: opts.playerFactionId === undefined ? scenario.playerFactionId : opts.playerFactionId,
    factions: {},
    cities: {},
    roads: data.roads.map((r) => ({ ...r })),
    generals: {},
    relations: scenario.relations.map((r) => ({ ...r })),
    missions: [],
    recruits: {},
    log: [],
    lastBattles: [],
    weather: {},
    intel: {},
    chronicle: [],
    annals: [],
    heirs: Object.fromEntries(Object.entries(scenario.heirs ?? {}).map(([k, v]) => [k, [...v]])),
    diplomacy: {},
    offers: [],
    outcome: 'playing',
    winner: null,
  };

  for (const f of data.factions) {
    const res = scenario.factions[f.id];
    if (!res) continue;
    s.factions[f.id] = { ...f, ...scenario.factionNames?.[f.id], traits: [...f.traits], ...res, alive: true };
    s.recruits[f.id] = 0;
  }

  for (const t of scenario.treaties ?? []) {
    if (s.factions[t.a] && s.factions[t.b]) s.diplomacy[pairKey(t.a, t.b)] = { status: t.status, until: t.turns === null ? null : s.turn + t.turns };
  }

  for (const c of data.cities) {
    const sc = scenario.cities[c.id];
    s.cities[c.id] = { ...c, owner: sc?.owner ?? null, troops: sc?.troops ?? 2000, ships: c.port ? (sc?.owner && data.factions.find((f) => f.id === sc.owner)?.traits.includes('수군') ? BALANCE.startShipsNaval : BALANCE.startShipsPort) : 0, order: 70, morale: 70, training: sc?.owner ? 55 : 40 };
  }

  for (const g of data.generals) {
    const sg = scenario.generals[g.id];
    const db = scenario.debuts?.[g.id];
    if (!sg && db && opts.allGenerals) {
      // v3.1 "모든 장수 등장": 등장 예정 장수도 처음부터 성인으로 나온다 (가상 설정)
      const birth = Math.min(g.birth, scenario.year - BALANCE.allGeneralsMinAge);
      const fac = db.faction && s.factions[db.faction] ? db.faction : null;
      const rulerCity = fac ? scenario.generals[s.factions[fac].rulerId]?.city : undefined;
      const city = fac && s.cities[db.city]?.owner !== fac && rulerCity ? rulerCity : db.city;
      s.generals[g.id] = { ...g, birth, stats: { ...g.stats }, persona: { ...g.persona }, faction: fac, city, loyalty: fac ? 70 : 0, acted: false, alive: true };
      continue;
    }
    if (!sg && db) {
      // 아직 등장하지 않은 장수 (성인이 되면 등장)
      s.generals[g.id] = { ...g, stats: { ...g.stats }, persona: { ...g.persona }, faction: null, city: db.city, loyalty: 0, acted: false, alive: false, debut: { ...db } };
      continue;
    }
    if (!sg) continue;
    s.generals[g.id] = {
      ...g,
      stats: { ...g.stats },
      persona: { ...g.persona },
      faction: sg.faction,
      city: sg.city,
      loyalty: sg.loyalty,
      acted: false,
      alive: true,
    };
  }

  // v3.4 장수 편제: 한 도시에 장수가 몰리지 않게 (한 장수 = 한 지역의 태수)
  spreadGenerals(s);
  // v3.2 신군주: 고른 도시에서 고른 장수가 새 세력을 세운다
  let rival: string | undefined;
  if (opts.newRuler) {
    const r = foundFaction(s, opts.newRuler.cityId, opts.newRuler.generalId);
    if (!r.ok) throw new Error(r.error);
    s.playerFactionId = r.factionId;
    rival = r.rival ?? undefined;
  }
  // 임무: 플레이어 세력에 맞춰 숙적을 채운다
  const pf = s.playerFactionId;
  rival ??= pf ? scenario.rivals?.[pf] : undefined;
  s.missions = scenario.missions
    .filter((m) => m.kind !== 'destroy_faction' || m.factionId || rival)
    .map((m) => {
      if (m.kind === 'destroy_faction' && !m.factionId && rival) {
        const ruler = s.generals[s.factions[rival]?.rulerId];
        return { ...m, factionId: rival, label: m.label.replace('{rival}', ruler?.name ?? rival) };
      }
      return { ...m };
    });

  rollWeather(s);
  recordAnnal(s);
  s.log.push({ turn: 1, year: s.year, season: s.season, kind: 'info', text: `${scenario.name} — ${scenario.description}` });
  return s;
}
