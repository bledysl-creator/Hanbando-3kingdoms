// v3.9 병종 편성 (냉병기 전투): 출진할 때 군의 중심 병종을 고른다.
// 근거: 한~삼국시대 군은 창·방패 보병, 쇠뇌·활 부대, 기병으로 이루어졌고, 쇠뇌는 기병 돌격 저지와 수성에,
// 기병은 평지 돌격과 패주하는 적의 추격에 강했다. 비·눈에는 활시위가 눅고(추정), 산길·물길·성벽에서는 기병이 힘을 못 쓴다.
// 기병은 말이 필요하다 — 말 산지(제주·관북·관서 북방) 도시를 가진 세력만 고를 수 있다 (docs/history/battle-v3.9.md).
import { BALANCE } from '../config';
import type { City, GameState, General, Road, WeatherKind } from '../state/types';

export type FormationKind = 'balanced' | 'infantry' | 'archer' | 'cavalry';

export const FORMATIONS: { id: FormationKind; name: string; icon: string; desc: string }[] = [
  { id: 'balanced', name: '균형', icon: '⚖️', desc: '보병·궁노·기병을 고루 섞는다. 특별한 장단점이 없다.' },
  { id: 'infantry', name: '창방패 보병', icon: '🛡️', desc: '성벽과 산길에 강하다 (성 공격·고개 +). 발이 느려 추격은 약하다.' },
  { id: 'archer', name: '궁노', icon: '🏹', desc: '쇠뇌 사격으로 강을 건너는 군을 엄호하고 아군 피해를 줄인다. 비·눈·폭풍에는 활시위가 눅어 약하다.' },
  { id: 'cavalry', name: '기병', icon: '🐎', desc: '평지 돌격과 추격에 매우 강하다. 산길·강·성벽·눈길에서는 약하다. 말 산지 도시가 있어야 고를 수 있다.' },
];

const WET: WeatherKind[] = ['rain', 'storm', 'typhoon', 'snow', 'blizzard'];

/** 세력이 말을 댈 수 있는가: 말 산지(cities.json horses) 또는 그 관할 시·군을 가지고 있으면 */
export function hasHorses(s: GameState, fid: string): boolean {
  for (const c of Object.values(s.cities)) if (c.owner === fid && BALANCE.horseCities.includes(c.parent ?? c.id)) return true;
  return false;
}

export interface FormationEffect { attack: number; ownLoss: number; pursuit: number; reasons: string[] }

/** 편성 효과: 공격 배율·아군 손실 배율·추격 배율과 그 이유 */
export function formationEffect(f: FormationKind | undefined, road: Road, target: City, weather?: WeatherKind): FormationEffect {
  const F = BALANCE.formation;
  const e: FormationEffect = { attack: 1, ownLoss: 1, pursuit: 1, reasons: [] };
  const walled = target.wall >= BALANCE.formation.wallHigh || target.fortress;
  const add = (m: number, why: string) => { e.attack *= m; e.reasons.push(`${why} ${m >= 1 ? '+' : '−'}${Math.round(Math.abs(m - 1) * 100)}%`); };
  if (!f || f === 'balanced') return e;
  if (f === 'infantry') {
    if (walled) add(F.infantryWall, '창방패 보병이 사다리로 성벽에 붙음');
    if (road.type === 'pass' || target.terrain === 'mountain') add(F.infantryRough, '보병은 험한 산길에도 대오를 유지');
    e.pursuit = F.infantryPursuit;
  } else if (f === 'archer') {
    if (road.type === 'river' || road.type === 'sea') add(F.archerRiver, '쇠뇌 사격이 도하를 엄호');
    if (weather && WET.includes(weather)) add(F.archerWet, '비·눈에 활시위가 눅어 사격이 약함');
    if (walled) add(F.archerWall, '성벽 뒤 적에게는 화살이 잘 닿지 않음');
    e.ownLoss = F.archerOwnLoss;
    e.pursuit = F.archerPursuit;
  } else if (f === 'cavalry') {
    const open = (target.terrain === 'plain' || target.terrain === 'coast') && road.type === 'land';
    if (open) add(F.cavalryOpen, '평지에서 기병 돌격');
    if (road.type === 'pass' || target.terrain === 'mountain') add(F.cavalryRough, '기병이 산길에서 힘을 못 씀');
    if (road.type === 'river' || road.type === 'sea') add(F.cavalryRiver, '말을 끌고 물을 건너기 어려움');
    if (walled) add(F.cavalryWall, '기병은 성벽을 넘지 못함');
    if (weather === 'snow' || weather === 'blizzard') add(F.cavalrySnow, '눈길에 말이 미끄러짐');
    e.pursuit = F.cavalryPursuit;
  }
  return e;
}

/** AI와 화면 추천: 이 길·이 성에서 공격 배율이 가장 높은 편성 (같으면 추격이 센 기병, 그다음 균형) */
export function bestFormation(s: GameState, fid: string, road: Road, target: City, horses = hasHorses(s, fid)): FormationKind {
  const weather = s.weather[target.id];
  let best: FormationKind = 'balanced', bestScore = 1;
  for (const f of FORMATIONS) {
    if (f.id === 'balanced' || (f.id === 'cavalry' && !horses)) continue;
    const e = formationEffect(f.id, road, target, weather);
    const score = e.attack * (1 + (e.pursuit - 1) * 0.03) / (1 + (e.ownLoss - 1) * 0.3);
    if (score > bestScore + 0.001) { best = f.id; bestScore = score; }
  }
  return best;
}

/** 일기토 미리보기: 상대 성의 가장 무력 높은 장수와 내 장수가 모두 기준 이상이면 이길 확률 */
export function duelPreview(s: GameState, g: General, targetId: string): { champ: General; win: number } | null {
  const to = s.cities[targetId];
  let champ: General | null = null;
  for (const x of Object.values(s.generals)) if (x.alive && x.city === targetId && x.faction === to.owner && (!champ || x.stats.war > champ.stats.war)) champ = x;
  if (!champ || g.stats.war < BALANCE.duelMinWar || champ.stats.war < BALANCE.duelMinWar) return null;
  return { champ, win: 1 / (1 + Math.exp(-(g.stats.war - champ.stats.war) / BALANCE.duelSpread)) };
}
