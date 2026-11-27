// v4.3 5단계 전술 전투를 게임 상태에 붙인다: 플레이어 출진·포위 직접 지휘 → 단계마다 명령 → 끝나면 함락·퇴각 처리(finishAttack).
// 전투가 진행 중이면 다른 명령은 막히고, 턴을 넘기면 남은 단계는 AI가 대신 지휘한다.
import { BALANCE } from '../config';
import { fixJosa } from '../josa';
import { generalsIn, relationBetween, roadBetween } from '../query';
import type { BattleInput } from '../battle/battle';
import type { FormationKind } from '../battle/formation';
import type { TacticKind } from '../battle/tactics';
import { aiOrders, cleanOrders, createTacBattle, evalPhase, other, playPhase, tacOutcome, type PhaseEval, type SideOrders, type TacBattle } from '../battle/phased';
import { finishAttack, log, marchInput } from '../commands/commands';
import { returnArmy, siegeTacticalInput } from './siege';
import type { GameState, Siege } from '../state/types';

/** 전투를 다시 계산할 때 필요한 출진 정보 (상태에 저장, JSON 가능) */
export interface TacContext { factionId: string; generalId: string; fromCity: string; toCity: string; troops: number; tactic?: TacticKind; formation?: FormationKind; deputyId?: string; siege?: Siege }

type Held = TacBattle & { ctx: TacContext; reportIndex?: number; message?: string };
const held = (s: GameState) => s.tacBattle as Held | undefined;

/** 전투 입력을 다시 만든다 (전투 중에는 다른 명령이 막혀 있어 상태가 그대로다) */
export function tacticalInput(s: GameState, ctx: TacContext): BattleInput {
  if (ctx.siege) {
    const input = siegeTacticalInput(s, ctx.siege);
    return { ...input, defenderCity: s.cities[ctx.toCity], defenderGenerals: generalsIn(s, ctx.toCity).filter((x) => x.faction === s.cities[ctx.toCity].owner) };
  }
  const g = s.generals[ctx.generalId], from = s.cities[ctx.fromCity], to = s.cities[ctx.toCity];
  const road = roadBetween(s, from.id, to.id)!;
  const dep = ctx.deputyId ? s.generals[ctx.deputyId] : null;
  return { ...marchInput(s, ctx.factionId, g, from, to, ctx.troops, road, ctx.tactic, ctx.formation), attackerDeputy: dep, bond: dep ? relationBetween(s, g.id, dep.id)?.type : undefined };
}

/** 플레이어 출진: 병력·군량은 이미 빠졌다 */
export function startTacticalMut(s: GameState, ctx: TacContext) {
  const to = s.cities[ctx.toCity];
  const tb = createTacBattle(s, tacticalInput(s, ctx), { id: `tb${s.turn}_${ctx.generalId}`, turn: s.turn, playerSide: 'atk', attackerFaction: ctx.factionId, defenderFaction: to.owner, fromCity: ctx.fromCity }) as Held;
  tb.ctx = ctx;
  s.tacBattle = tb;
}

/** 포위당한 성을 직접 지휘해 지금 맞선다 (포위 대응 대신) */
export function startSiegeTactical(state: GameState, factionId: string, siegeId: string): { state: GameState; ok: boolean; message: string } {
  const s = structuredClone(state);
  const sg = (s.sieges ?? []).find((x) => x.id === siegeId);
  if (!sg || s.cities[sg.toCity]?.owner !== factionId) return { state, ok: false, message: '포위를 찾을 수 없습니다.' };
  if (s.tacBattle && !s.tacBattle.done) return { state, ok: false, message: '이미 다른 전투를 지휘하고 있습니다.' };
  if (!s.generals[sg.generalId]?.alive) return { state, ok: false, message: '적장이 없어 싸울 수 없습니다.' };
  s.sieges = (s.sieges ?? []).filter((x) => x.id !== siegeId);
  const ctx: TacContext = { factionId: sg.attackerFaction, generalId: sg.generalId, fromCity: sg.fromCity, toCity: sg.toCity, troops: sg.troops, tactic: sg.tactic, formation: sg.formation, deputyId: sg.deputyId, siege: sg };
  const tb = createTacBattle(s, tacticalInput(s, ctx), { id: `tb${s.turn}_${sg.id}`, turn: s.turn, playerSide: 'def', attackerFaction: sg.attackerFaction, defenderFaction: factionId, fromCity: sg.fromCity, siegeId }) as Held;
  tb.ctx = ctx;
  s.tacBattle = tb;
  return { state: s, ok: true, message: fixJosa(`⚔️ ${s.cities[sg.toCity].name} 성문을 열고 맞섭니다 — 전투 창에서 지휘하세요.`) };
}

/** 이번 단계 예상: 적이 '척후 보고'대로 움직일 때 (상태 불변) */
export function previewTactical(s: GameState, mine: SideOrders): { eval: PhaseEval; enemy: SideOrders } | null {
  const tb = held(s);
  if (!tb || tb.done || !tb.playerSide) return null;
  const side = tb.playerSide;
  const enemy = aiOrders(tb, other(side));
  const ev = side === 'atk' ? evalPhase(tb, mine, enemy) : evalPhase(tb, enemy, mine);
  return { eval: ev, enemy: cleanOrders(tb, other(side), enemy) };
}

function finishMut(s: GameState) {
  const tb = held(s)!;
  const ctx = tb.ctx;
  const input = tacticalInput(s, ctx);
  const out = tacOutcome(tb, input);
  const g = s.generals[ctx.generalId], from = s.cities[ctx.fromCity], to = s.cities[ctx.toCity];
  const road = roadBetween(s, from.id, to.id)!;
  const pf = s.playerFactionId;
  const sg = ctx.siege;
  const before = s.lastBattles.length;
  const res = finishAttack(s, ctx.factionId, g, from, to, ctx.troops, road, undefined, {
    outcome: out,
    battle: { attackerDeputy: input.attackerDeputy, bond: input.bond },
    ...(sg ? { returnTroops: (n: number) => returnArmy(s, sg, n) } : {}),
  });
  if (sg && !out.won && pf) log(s, `⚔️ 직접 지휘로 ${to.name}을(를) 지켜 냈습니다! (적 손실 ${out.attackerLoss.toLocaleString()})`, 'good', pf);
  tb.done = true;
  tb.reportIndex = s.lastBattles.length > before ? s.lastBattles.length - 1 : undefined;
  tb.message = res.ok ? res.message : res.error;
}

/** 이번 단계 명령을 내린다 → 적도 고르고 한 단계를 치른다. 마지막 단계면 결판 */
export function orderTactical(state: GameState, mine: SideOrders): { state: GameState; ok: boolean; message: string } {
  const s = structuredClone(state);
  const tb = held(s);
  if (!tb || tb.done || !tb.playerSide) return { state, ok: false, message: '진행 중인 전투가 없습니다.' };
  const side = tb.playerSide;
  const enemy = aiOrders(tb, other(side), s);
  const input = tacticalInput(s, tb.ctx);
  const done = side === 'atk' ? playPhase(tb, s, mine, enemy, input) : playPhase(tb, s, enemy, mine, input);
  if (done) finishMut(s);
  const last = tb.phases[tb.phases.length - 1];
  return { state: s, ok: true, message: done ? fixJosa(tb.message ?? '전투 종료') : `${last.phase}/${BALANCE.tactical.phases}단계 종료` };
}

/** 남은 단계를 AI(책사)에게 맡긴다 */
export function autoTacticalRest(state: GameState): GameState {
  const s = structuredClone(state);
  autoRestMut(s);
  return s;
}
function autoRestMut(s: GameState) {
  const tb = held(s);
  if (!tb || tb.done) return;
  const input = tacticalInput(s, tb.ctx);
  while (!tb.done) playPhase(tb, s, aiOrders(tb, 'atk', s), aiOrders(tb, 'def', s), input);
  finishMut(s);
}

/** 공격군(플레이어)이 스스로 물러난다: 추격 손실이 줄어든다 */
export function retreatTactical(state: GameState): GameState {
  const s = structuredClone(state);
  const tb = held(s);
  if (!tb || tb.done || tb.playerSide !== 'atk') return state;
  tb.retreated = true;
  tb.done = true;
  finishMut(s);
  return s;
}

/** 끝난 전투 창을 닫는다 */
export function closeTactical(state: GameState): GameState {
  if (!state.tacBattle?.done) return state;
  const s = structuredClone(state);
  delete s.tacBattle;
  return s;
}

/** 턴을 넘길 때: 끝나지 않은 전투는 AI가 마무리, 끝난 전투 창은 치운다 */
export function settleTacticalMut(s: GameState) {
  if (!s.tacBattle) return;
  if (!s.tacBattle.done) autoRestMut(s);
  delete s.tacBattle;
}

export const tacticalReportIndex = (s: GameState) => held(s)?.reportIndex;
export const tacticalMessage = (s: GameState) => held(s)?.message;
