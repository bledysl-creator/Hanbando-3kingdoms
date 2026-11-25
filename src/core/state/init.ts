import type { GameData, ScenarioDef } from '../data';
import type { GameState } from './types';

export const SAVE_VERSION = 1;

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
    missions: scenario.missions.map((m) => ({ ...m })),
    recruits: {},
    log: [],
    lastBattles: [],
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

  s.log.push({ turn: 1, year: s.year, season: s.season, kind: 'info', text: `${scenario.name} — ${scenario.description}` });
  return s;
}
