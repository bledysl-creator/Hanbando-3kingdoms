import type { GameData, ScenarioDef } from '../data';
import type { GameState } from './types';
import { rollWeather } from '../systems/weather';

export const SAVE_VERSION = 3;

/** 시나리오와 고정 데이터로 새 게임 상태를 만든다. */
export function createGame(
  data: GameData,
  scenario: ScenarioDef,
  opts: { seed?: number; playerFactionId?: string | null } = {},
): GameState {
  const s: GameState = {
    saveVersion: SAVE_VERSION,
    scenarioId: scenario.id,
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
    diplomacy: {},
    offers: [],
    outcome: 'playing',
    winner: null,
  };

  for (const f of data.factions) {
    const res = scenario.factions[f.id];
    if (!res) continue;
    s.factions[f.id] = { ...f, traits: [...f.traits], ...res, alive: true };
    s.recruits[f.id] = 0;
  }

  for (const c of data.cities) {
    const sc = scenario.cities[c.id];
    s.cities[c.id] = { ...c, owner: sc?.owner ?? null, troops: sc?.troops ?? 2000, order: 70 };
  }

  for (const g of data.generals) {
    const sg = scenario.generals[g.id];
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

  // 임무: 플레이어 세력에 맞춰 숙적을 채운다
  const pf = s.playerFactionId;
  const rival = pf ? scenario.rivals?.[pf] : undefined;
  s.missions = scenario.missions
    .filter((m) => m.kind !== 'destroy_faction' || m.factionId || rival)
    .map((m) => {
      if (m.kind === 'destroy_faction' && !m.factionId && rival) {
        const rf = data.factions.find((f) => f.id === rival);
        const ruler = data.generals.find((g) => g.id === rf?.rulerId);
        return { ...m, factionId: rival, label: m.label.replace('{rival}', ruler?.name ?? rival) };
      }
      return { ...m };
    });

  rollWeather(s);
  s.log.push({ turn: 1, year: s.year, season: s.season, kind: 'info', text: `${scenario.name} — ${scenario.description}` });
  return s;
}
