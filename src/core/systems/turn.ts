// 턴 진행: AI 행동 → 계절 처리 → 충성/이탈 → 임무/승패 → 다음 계절 (Game.md 3, 5)
import { BALANCE, SEASONS } from '../config';
import { runFactionAI } from '../ai/ai';
import { log } from '../commands/commands';
import { chance, randRange } from '../rng/rng';
import { relationBetween } from '../query';
import type { GameState } from '../state/types';
import { expireTreaties } from '../diplomacy/diplomacy';
import { applyWeatherEffects, rollWeather } from './weather';
import { canRise, processAiUprisings, processLifecycle } from './lifecycle';
import { recordAnnal } from './chronicle';
import { processSurrenders } from './surrender';
import { processRebellions } from './rebellion';
import { resolveSieges } from './siege';
import { expireCaptives } from './captives';
import { processRegionMuster } from './muster';
import { processEpidemics } from './epidemic';
import { processWildfires } from './wildfire';
import { processGovernors } from './office';
import { traitSum } from '../commands/commands';
import { landmarksOfCity } from '../data';
import { chancellorOf, rulerCharmDrift } from './stats';

export function processEconomy(s: GameState) {
  for (const f of Object.values(s.factions)) {
    if (!f.alive) continue;
    let gold = 0, harvest = 0, wood = 0, iron = 0, troops = 0, fish = 0, horses = 0;
    for (const c of Object.values(s.cities)) {
      if (c.owner !== f.id) continue;
      const k = c.population / 1000;
      const orderMul = 0.5 + c.order / 200;
      gold += c.commerce * k * BALANCE.goldPerCommerce * orderMul * (1 + BALANCE.portLandmarkCommerce * landmarksOfCity(c.id, 'port').length);
      if (s.season === 2) {
        const dry = Math.max(0, 1 - (c.droughtTurns ?? 0) * BALANCE.droughtHarvestLoss);
        harvest += c.agriculture * k * BALANCE.harvestPerAgriculture * orderMul * dry * (1 + traitSum(f.traits, 'harvest'));
      }
      // v3.3 어업: 항구 도시는 계절마다 바다에서 곡식(어물)을 얻는다 (겨울은 절반)
      if (c.port) fish += (c.population / 1000) * BALANCE.fishPerPort1000 * orderMul * (s.season === 3 ? 0.5 : 1);
      // 군현 지도는 도시가 많아 목재·철 산출을 도시 수에 맞춰 줄인다 (v3.2)
      const rk = s.mapScale === 'region' ? BALANCE.regionResourceScale : 1;
      wood += c.wood * BALANCE.woodPerLevel * rk * ((c.fire ?? 0) > 0 ? BALANCE.fireWoodPenalty : 1);
      iron += c.iron * BALANCE.ironPerLevel * rk;
      horses += ((c.horses ?? 0) * BALANCE.horsesPerLevel + (c.ranch ?? 0) * BALANCE.ranchPassive) * orderMul; // v4.0 군마 + v4.1 마창
      troops += c.troops;
      // 인구·민심
      c.population = Math.round(c.population * (1 + BALANCE.popGrowth * (c.order / 100) - (s.season === 3 ? 0.004 : 0)));
      c.order = Math.min(100, c.order + 2);
      c.morale += (70 - c.morale) * 0.1; // 사기는 서서히 평상(70)으로
      c.morale = Math.round(c.morale);
    }
    // v4.2 재상: 세력 최고 정치 장수가 나라 살림 전체를 끌어올린다
    const cm = chancellorOf(s, f.id).mul;
    f.gold += Math.round(gold * cm);
    f.food += Math.round(harvest * cm + fish);
    f.wood += wood;
    f.iron += iron;
    f.horses = Math.round((f.horses ?? 0) * (1 - BALANCE.horseDecay) + horses);
    const eat = Math.round(troops * BALANCE.foodPerTroop);
    f.food -= eat;
    if (f.food < 0) {
      // 군량 부족 → 탈영
      const deficitRatio = Math.min(0.3, -f.food / Math.max(1, eat));
      f.food = 0;
      for (const c of Object.values(s.cities)) {
        if (c.owner !== f.id) continue;
        const lost = Math.round(c.troops * deficitRatio);
        c.troops -= lost;
        c.order = Math.max(0, c.order - 5);
        c.morale = Math.max(0, c.morale - BALANCE.starvationMorale);
      }
      log(s, `${f.name}군 군량 부족! 병사들이 탈영하고 있습니다.`, 'danger', f.id);
    }
    if (s.season === 2 && harvest > 0) log(s, `${f.name}: 가을 수확으로 곡식 ${Math.round(harvest).toLocaleString()}을(를) 거두었습니다.`, 'info', f.id, { event: 'harvest' });
  }
  // 중립 도시는 병력이 천천히 회복
  for (const c of Object.values(s.cities)) if (c.owner === null) c.troops = Math.min(8000, c.troops + 300);
}

export function processLoyalty(s: GameState) {
  for (const g of Object.values(s.generals)) {
    if (!g.alive || !g.faction) continue;
    const f = s.factions[g.faction];
    if (f.rulerId === g.id) { g.loyalty = 100; continue; }
    const rel = relationBetween(s, g.id, f.rulerId);
    if (rel?.type === 'sworn') { g.loyalty = 100; continue; }
    // v4.2 군주의 매력(인망)이 모든 신하의 마음을 붙잡는다
    const drift = -(g.persona.ambition - 50) / 40 + (g.persona.righteousness - 50) / 60 + rulerCharmDrift(s.generals[f.rulerId]) + randRange(s, -1, 1);
    g.loyalty = Math.max(0, Math.min(100, Math.round(g.loyalty + drift)));
    if (g.loyalty < BALANCE.defectLoyalty && g.persona.ambition > BALANCE.defectAmbition && chance(s, BALANCE.defectChance)) {
      g.faction = null;
      g.loyalty = 0;
      log(s, `${g.name}이(가) ${f.name}군을 떠나 재야로 들어갔습니다.`, 'warn', f.id);
    }
  }
}

export function checkOutcome(s: GameState) {
  const owners = new Set(Object.values(s.cities).map((c) => c.owner).filter(Boolean));
  if (owners.size === 1) {
    const [w] = [...owners] as string[];
    const allOwned = Object.values(s.cities).every((c) => c.owner === w);
    if (allOwned) {
      s.winner = w;
      s.outcome = s.playerFactionId === null ? 'unified' : w === s.playerFactionId ? 'won' : 'lost';
      log(s, `${s.factions[w].name}(${s.factions[w].hanja})이(가) 한반도를 통일했습니다!`, 'good', w);
      return;
    }
  }
  // 세력이 망해도 군주가 살아 있으면 재기할 수 있다 (Game.md 5-6)
  if (s.playerFactionId && !s.factions[s.playerFactionId].alive && !canRise(s, s.playerFactionId)) {
    s.outcome = 'lost';
  }
}

/** 플레이어가 "턴 진행"을 눌렀을 때. 상태를 직접 수정한다. */
export function endTurnMut(s: GameState) {
  if (s.outcome !== 'playing') return;
  s.aiTrace = [];
  // v3.6 지난 계절 포위된 플레이어 도시: 고른 대응으로 결판
  resolveSieges(s);
  expireCaptives(s);
  checkOutcome(s);
  if (s.outcome !== 'playing') return;
  for (const fid of Object.keys(s.factions)) {
    if (fid === s.playerFactionId) continue;
    runFactionAI(s, fid);
    checkOutcome(s);
    if (s.outcome !== 'playing') return;
  }
  applyWeatherEffects(s, (t, fid) => { if (fid === s.playerFactionId) log(s, t, 'warn', fid); });
  processEconomy(s);
  processRegionMuster(s);
  processEpidemics(s);
  processWildfires(s);
  processGovernors(s);
  if (s.season === 2) for (const c of Object.values(s.cities)) c.droughtTurns = 0;
  processLoyalty(s);
  checkOutcome(s);

  // 지난 턴의 미응답 제안은 사라진다
  s.offers = s.offers.filter((o) => o.turn >= s.turn);
  s.season = (s.season + 1) % 4;
  if (s.season === 0) s.year += 1;
  s.turn += 1;
  for (const g of Object.values(s.generals)) g.acted = false;
  rollWeather(s);
  processLifecycle(s);
  if (s.season === 0) recordAnnal(s);
  processAiUprisings(s);
  processRebellions(s);
  processSurrenders(s);
  checkOutcome(s);
  expireTreaties(s, (t) => log(s, t, 'info'));
  if (s.outcome === 'playing') log(s, `${s.year}년 ${SEASONS[s.season]}이 되었습니다.`, 'info');
}

export function endTurn(state: GameState): GameState {
  const draft = structuredClone(state);
  endTurnMut(draft);
  return draft;
}
