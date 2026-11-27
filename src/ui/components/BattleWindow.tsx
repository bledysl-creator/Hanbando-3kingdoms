// v4.3 5단계 전술 전투 창: 전투를 다섯 단계(각 20%)로 나눠, 단계마다 병과별 투입 병력과 전술을 고른다.
// 왼쪽 사이드바 = 병과별 지휘, 오른쪽 = 이번 단계 예상 결과와 척후 보고, 아래 = 지난 단계 기록.
import { useEffect, useMemo, useState } from 'react';
import type { GameState, SideOrders, TacOrder, TacBattle, UnitKind } from '../../core';
import { BALANCE, TAC_ORDERS, UNIT_KINDS, WEATHER_ICON, WEATHER_LABEL, balanceOf, fixJosa, orderBlocked, orderChance, ordersText, otherSide, previewTactical, sumT, tacticalReportIndex, unitName } from '../../core';
import { Portrait } from './Portrait';

const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
const pct = (p: number) => `${Math.round(p * 100)}%`;
const ORDER_LIST: TacOrder[] = ['assault', 'charge', 'hold', 'volley', 'fire', 'ambush', 'feint', 'flank', 'night'];
const HORSE: UnitKind[] = ['cavalry', 'chariot'];

/** 지난 단계에서 이어지는 기본 명령: 숨은 병과는 기습, 나머지는 그대로 */
function defaultOrders(tb: TacBattle): SideOrders {
  const side = tb.playerSide!;
  const me = tb[side];
  const last = tb.phases[tb.phases.length - 1]?.orders[side];
  const o: SideOrders = {};
  for (const k of UNIT_KINDS) {
    const n = me.units[k] ?? 0;
    if (n <= 0) continue;
    let t: TacOrder = last?.[k]?.tactic ?? (k === 'archer' ? 'volley' : 'assault');
    if (me.hidden.includes(k)) t = k === 'archer' ? 'volley' : HORSE.includes(k) ? 'charge' : 'assault';
    else if (tb[otherSide(side)].lured && k !== 'archer') t = 'flank';
    else if (t === 'ambush' || t === 'feint' || t === 'fire' || t === 'night') t = k === 'archer' ? 'volley' : 'assault';
    if (orderBlocked(tb, side, k, t)) t = 'assault';
    o[k] = { troops: n, tactic: t };
  }
  return o;
}

const PRESETS: { id: string; name: string; desc: string; make: (tb: TacBattle) => SideOrders | null }[] = [
  {
    id: 'all', name: '⚔️ 전군 정면 공격', desc: '모든 병과가 정면으로 맞붙는다',
    make: (tb) => Object.fromEntries(UNIT_KINDS.filter((k) => (tb[tb.playerSide!].units[k] ?? 0) > 0).map((k) => [k, { troops: tb[tb.playerSide!].units[k]!, tactic: k === 'archer' ? 'volley' : 'assault' }])),
  },
  {
    id: 'lure', name: '🏳️🌲 기병 유인 · 보병 매복', desc: '기병이 지는 척 물러나 적을 끌어내고, 보병·궁병은 숨어 다음 단계에 기습',
    make: (tb) => {
      const me = tb[tb.playerSide!];
      if (!(me.units.cavalry ?? 0) || orderBlocked(tb, tb.playerSide!, 'infantry', 'ambush')) return null;
      const o: SideOrders = {};
      for (const k of UNIT_KINDS) if ((me.units[k] ?? 0) > 0) o[k] = { troops: me.units[k]!, tactic: k === 'cavalry' ? 'feint' : k === 'infantry' || k === 'archer' ? 'ambush' : k === 'spear' ? 'hold' : 'assault' };
      return o;
    },
  },
  {
    id: 'valley', name: '🏹 궁병 골짜기 매복 · 보병 방진', desc: '보병·창병이 버티는 동안 궁병을 숨겼다가 다음 단계에 양쪽에서 쏜다 (골짜기·고갯길이면 더 강함)',
    make: (tb) => {
      const me = tb[tb.playerSide!];
      if (!(me.units.archer ?? 0) || orderBlocked(tb, tb.playerSide!, 'archer', 'ambush')) return null;
      const o: SideOrders = {};
      for (const k of UNIT_KINDS) if ((me.units[k] ?? 0) > 0) o[k] = { troops: me.units[k]!, tactic: k === 'archer' ? 'ambush' : k === 'cavalry' || k === 'chariot' ? 'flank' : 'hold' };
      return o;
    },
  },
  {
    id: 'spring', name: '🌲↪️ 기습 + 협공', desc: '숨어 있던 병과가 뛰쳐나오고 기병은 옆구리를 친다 (유인된 적에게 가장 강함)',
    make: (tb) => {
      const me = tb[tb.playerSide!];
      if (me.hidden.length === 0) return null;
      const o: SideOrders = {};
      for (const k of UNIT_KINDS) if ((me.units[k] ?? 0) > 0) o[k] = { troops: me.units[k]!, tactic: me.hidden.includes(k) ? (k === 'archer' ? 'volley' : 'assault') : HORSE.includes(k) || k === 'spear' ? 'flank' : 'assault' };
      return o;
    },
  },
];

export function BattleWindow({ state, onOrder, onAuto, onRetreat, onClose }: {
  state: GameState;
  onOrder: (o: SideOrders) => void;
  onAuto: () => void;
  onRetreat: () => void;
  onClose: () => void;
}) {
  const tb = state.tacBattle!;
  const side = tb.playerSide ?? 'atk';
  const foeSide = otherSide(side);
  const me = tb[side], foe = tb[foeSide];
  const N = BALANCE.tactical.phases;
  const [orders, setOrders] = useState<SideOrders>(() => defaultOrders(tb));
  useEffect(() => { if (!tb.done) setOrders(defaultOrders(tb)); }, [tb.phase, tb.done]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(() => (tb.done ? null : previewTactical(state, orders)), [state, orders, tb.done]);
  const from = state.cities[tb.fromCity], to = state.cities[tb.toCity];
  const dep = tb.deputyId ? state.generals[tb.deputyId] : null;
  const fA = state.factions[tb.attackerFaction], fD = tb.defenderFaction ? state.factions[tb.defenderFaction] : null;
  const road = state.roads.find((r) => (r.from === tb.fromCity && r.to === tb.toCity) || (r.to === tb.fromCity && r.from === tb.toCity));
  const bal = balanceOf(tb, road ? { road, city: to, weather: state.weather[to.id] } : undefined);
  const mineShare = side === 'atk' ? bal / (1 + bal) : 1 / (1 + bal);
  const kinds = UNIT_KINDS.filter((k) => (me.units[k] ?? 0) > 0);
  const set = (k: UnitKind, patch: Partial<{ troops: number; tactic: TacOrder }>) => setOrders((o) => ({ ...o, [k]: { ...(o[k] ?? { troops: me.units[k] ?? 0, tactic: 'assault' }), ...patch } }));
  const ev = preview?.eval;
  const mineLoss = ev ? sumT(ev.loss[side]) : 0, foeLoss = ev ? sumT(ev.loss[foeSide]) : 0;
  const phaseWin = ev ? (side === 'atk' ? ev.ratio >= 1 : ev.ratio < 1) : false;
  const last = tb.phases[tb.phases.length - 1];
  const ri = tb.done ? tacticalReportIndex(state) : undefined;
  const report = ri !== undefined ? state.lastBattles[ri] : undefined;
  const iWon = report ? (side === 'atk' ? report.won : !report.won) : false;

  const sideCard = (s: 'atk' | 'def') => {
    const x = tb[s];
    const f = s === 'atk' ? fA : fD;
    const lead = x.leaderId ? state.generals[x.leaderId] : null;
    const total = sumT(x.units), init = sumT(x.init);
    return (
      <div className={`tb-side ${s === side ? 'mine' : ''}`} style={{ borderColor: f?.color ?? '#777' }}>
        <div className="tb-side-head">
          {lead && <Portrait general={lead} color={f?.color ?? '#777'} size={46} />}
          <div>
            <div><b style={{ color: f?.color }}>{f?.name ?? '중립'}{s === 'atk' ? ' 공격군' : ' 수비군'}</b>{s === side && <span className="tb-you">아군</span>}</div>
            <div className="small">{lead?.name ?? '지휘관 없음'}{s === 'atk' && dep ? ` · 부장 ${dep.name}` : ''} <span className="muted">통솔 {x.lead} · 무력 {x.war} · 지력 {x.int}</span></div>
          </div>
        </div>
        <div className="tb-meter"><span>병력</span><div className="bar"><div style={{ width: `${(total / Math.max(1, init)) * 100}%` }} /><em>{fmt(total)} / {fmt(init)}</em></div></div>
        <div className="tb-meter"><span>사기</span><div className={`bar morale ${x.morale < 35 ? 'low' : ''}`}><div style={{ width: `${Math.min(100, x.morale)}%` }} /><em>{Math.round(x.morale)}</em></div></div>
        <div className="tb-units">{UNIT_KINDS.filter((k) => (x.init[k] ?? 0) > 0).map((k) => <span key={k} title={unitName(k).desc} className={x.hidden.includes(k) ? 'hid' : ''}>{unitName(k).icon}{fmt(x.units[k] ?? 0)}{x.hidden.includes(k) ? (s === side ? ' 🌲매복 중' : '') : ''}</span>)}</div>
        <div className="tb-chips">
          {x.lured && <span className="chip bad">🏳️ 유인당해 대열 흐트러짐</span>}
          {x.fireUsed && <span className="chip">🔥 화공 씀</span>}
          {s !== side && x.hidden.length > 0 && <span className="chip">❓ 일부 병력이 보이지 않음</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="tb-back">
      <div className="tb-window panel">
        <header className="tb-head">
          <h2>⚔️ {from.name} → {to.name} 전투 <small className="muted">{side === 'atk' ? '공격 지휘' : '수비 지휘'}</small></h2>
          <div className="tb-steps">
            {Array.from({ length: N }, (_, i) => {
              const p = tb.phases[i];
              const good = p ? (side === 'atk' ? p.ratio >= 1 : p.ratio < 1) : null;
              return <div key={i} className={`tb-step ${p ? (good ? 'won' : 'lost') : i === tb.phase && !tb.done ? 'now' : ''}`}><b>{i + 1}/{N}</b><small>{p ? (good ? '우세' : '열세') : i === tb.phase && !tb.done ? '지휘 중' : '—'}</small></div>;
            })}
          </div>
        </header>
        <div className="tb-terrain small">
          <span>{WEATHER_ICON[state.weather[to.id]]} {WEATHER_LABEL[state.weather[to.id]]}</span>
          {tb.terrain.walled && <span>🏯 성벽 {tb.terrain.wall}</span>}
          {tb.terrain.valley && <span>⛰️ 골짜기·고갯길 (매복 유리)</span>}
          {tb.terrain.open && <span>🌾 트인 평지 (기병·전차 유리, 매복 불리)</span>}
          <span>산악도 {tb.terrain.relief}</span>
          {tb.duel && <span>⚔️ 일기토: {state.generals[tb.duel.winnerId]?.name} 승리</span>}
          {tb.opening && <span>{tb.opening.success ? '✅' : '❌'} 선제 계책</span>}
        </div>
        <div className="tb-sides">
          {sideCard('atk')}
          <div className="tb-balance">
            <div className="small muted">형세</div>
            <div className="tb-tug"><div style={{ width: `${mineShare * 100}%` }} /></div>
            <div className={mineShare >= 0.5 ? 'good' : 'bad'}><b>{mineShare >= 0.5 ? '아군 우세' : '아군 열세'}</b> {pct(mineShare)}</div>
          </div>
          {sideCard('def')}
        </div>

        {!tb.done ? (
          <div className="tb-main">
            <aside className="tb-orders">
              <h3>{tb.phase + 1}/{N}단계 — 병과별 지휘</h3>
              <div className="tb-presets">
                {PRESETS.map((p) => { const o = p.make(tb); return <button key={p.id} disabled={!o} title={p.desc} onClick={() => o && setOrders(o)}>{p.name}</button>; })}
              </div>
              {kinds.map((k) => {
                const o = orders[k] ?? { troops: me.units[k] ?? 0, tactic: 'assault' as TacOrder };
                const u = unitName(k);
                const max = me.units[k] ?? 0;
                const dealt = ev?.dealt[side][k] ?? 0, lost = ev?.loss[side][k] ?? 0;
                const ch = orderChance(tb, side, k, o.tactic);
                return (
                  <div key={k} className="tb-unit">
                    <div className="tb-unit-head">
                      <b>{u.icon} {u.name}</b>
                      {me.hidden.includes(k) && <span className="chip good">🌲 매복 중 — 이번에 치면 기습</span>}
                      <span className="muted small">{fmt(o.troops)} / {fmt(max)} 투입</span>
                    </div>
                    <input type="range" min={0} max={max} step={1} value={o.troops} onChange={(e) => set(k, { troops: Number(e.target.value) })} aria-label={`${u.name} 투입 병력`} />
                    <div className="tb-tactics">
                      {ORDER_LIST.filter((t) => TAC_ORDERS[t].kinds.includes(k)).map((t) => {
                        const why = orderBlocked(tb, side, k, t);
                        const c = orderChance(tb, side, k, t);
                        return (
                          <button key={t} className={o.tactic === t ? 'active' : ''} disabled={!!why} title={fixJosa(`${TAC_ORDERS[t].desc}${why ? `\n불가: ${why}` : ''}`)} onClick={() => set(k, { tactic: t })}>
                            {TAC_ORDERS[t].icon} {TAC_ORDERS[t].name}{c !== null && !why ? <small> {pct(c)}</small> : null}
                          </button>
                        );
                      })}
                    </div>
                    <div className="tb-unit-fc small">
                      {o.tactic === 'ambush' ? <>🌲 숨어서 싸우지 않음 · 들키지 않을 확률 <b>{pct(ch ?? 0)}</b> → 다음 단계 기습 ×{BALANCE.tactical.ambushSpring}{k === 'archer' && tb.terrain.valley ? ` (골짜기 ×${BALANCE.tactical.valleyArcher} 더)` : ''}</>
                        : <>예상: 적에게 <b className="good">−{fmt(dealt)}</b> · 아군 <b className="bad">−{fmt(lost)}</b>{ch !== null ? <> · 성공률 <b>{pct(ch)}</b></> : null}{o.tactic === 'feint' ? ' → 성공하고 적이 쫓아오면 다음 단계 적 대열 흐트러짐' : ''}</>}
                    </div>
                  </div>
                );
              })}
              {kinds.length === 0 && <p className="muted">남은 병력이 없습니다.</p>}
            </aside>
            <section className="tb-forecast">
              <h3>이번 단계 예상</h3>
              {ev && (
                <>
                  <div className={`tb-fc-big ${phaseWin ? 'good' : 'bad'}`}>{phaseWin ? '이 단계는 아군 우세' : '이 단계는 아군 열세'} <small className="muted">(전력비 {(side === 'atk' ? ev.ratio : 1 / ev.ratio).toFixed(2)})</small></div>
                  <div className="tb-fc-row"><span>적 손실</span><b className="good">−{fmt(foeLoss)}</b><small className="muted">({pct(foeLoss / Math.max(1, sumT(foe.units)))})</small></div>
                  <div className="tb-fc-row"><span>아군 손실</span><b className="bad">−{fmt(mineLoss)}</b><small className="muted">({pct(mineLoss / Math.max(1, sumT(me.units)))})</small></div>
                  <div className="tb-fc-row"><span>단계 뒤 사기</span><b>{Math.round(ev.morale[side])}</b><small className="muted">적 {Math.round(ev.morale[foeSide])}</small></div>
                </>
              )}
              <h4>🔭 척후 보고 — 적의 움직임 (예상)</h4>
              <p className="small">{preview ? ordersText(preview.enemy) : '—'}</p>
              <p className="small muted">적장도 단계마다 전술을 바꿉니다. 보고와 다르게 움직일 수 있습니다.</p>
              {(foe.lured || me.lured || me.hidden.length > 0) && <h4>지난 단계에서 이어지는 것</h4>}
              {me.hidden.length > 0 && <p className="small good">🌲 {me.hidden.map((k) => unitName(k).name).join('·')} 매복 완료 — 이번 단계에 공격하면 기습 ×{BALANCE.tactical.ambushSpring}{foe.lured ? ` · 유인된 적에게 ×${BALANCE.tactical.lureBonus} 더` : ''}</p>}
              {foe.lured && <p className="small good">🏳️ 적이 거짓 퇴각에 걸려 대열이 흐트러졌습니다 — 협공·기습이 매섭게 먹힙니다</p>}
              {me.lured && <p className="small bad">⚠️ 아군이 적의 유인에 걸려 대열이 흐트러졌습니다 — 방진으로 추스르는 것도 방법</p>}
              <details className="tb-help">
                <summary>전술 상성 한눈에</summary>
                <ul className="small">
                  <li>🐎 돌격 → 🏹 사격 중인 궁병을 덮침 (+30%) / 🔱 창병 방진에 막힘 (−45%, 크게 다침)</li>
                  <li>🏹 일제 사격 → 돌격해 오는 기병·전차에 +15%, 받는 피해 적음</li>
                  <li>↪️ 협공 → 다른 병과가 정면을 붙잡아야 제 힘 · 방진 옆구리 +25% · 유인된 적 +30%</li>
                  <li>🌲 매복 → 이번엔 숨고 다음 단계 기습 ×{BALANCE.tactical.ambushSpring} (골짜기 궁병 더) · 평지·적 지력이 높으면 들킴</li>
                  <li>🏳️ 거짓 퇴각 → 적이 정면 공격·돌격·협공으로 쫓아오면 다음 단계 적 대열 흐트러짐</li>
                  <li>🔥 화공 → 성공하면 큰 피해·사기 저하, 한 전투에 한 번 · 🌙 야습 → 첫 단계만</li>
                  <li>투입하지 않은 병력은 뒤에서 대기 (피해·공격 모두 적음)</li>
                </ul>
              </details>
            </section>
          </div>
        ) : (
          <div className={`tb-result ${iWon ? 'won' : 'lost'}`}>
            <h3>{iWon ? (side === 'atk' ? `🏯 ${to.name} 함락!` : `🛡️ ${to.name}을(를) 지켜 냈습니다!`) : side === 'atk' ? `${to.name} 공격 실패${tb.retreated ? ' (스스로 물러남)' : ''}` : `${to.name} 함락당함`}</h3>
            {report && <p>아군 손실 <b className="bad">{fmt(side === 'atk' ? report.attackerLoss : report.defenderLoss)}</b> · 적 손실 <b className="good">{fmt(side === 'atk' ? report.defenderLoss : report.attackerLoss)}</b>{tb.routed ? ` · ${tb.routed === side ? '아군' : '적군'}이 ${tb.phase}단계에서 무너짐` : ''}</p>}
          </div>
        )}

        {tb.phases.length > 0 && (
          <div className="tb-log">
            {[...tb.phases].reverse().map((p) => (
              <div key={p.phase} className={`tb-log-row ${p === last ? 'latest' : ''}`}>
                <b>{p.phase}/{N}단계</b> <span className="small">아군 {ordersText(p.orders[side])} · 적 {ordersText(p.orders[foeSide])}</span>
                <span className="small"> — 손실 아군 <b className="bad">{fmt(sumT(p.loss[side]))}</b> · 적 <b className="good">{fmt(sumT(p.loss[foeSide]))}</b></span>
                {p.events.map((e, i) => <div key={i} className="small tb-ev">· {e}</div>)}
              </div>
            ))}
          </div>
        )}

        <footer className="tb-foot">
          {!tb.done ? (
            <>
              <button className="primary" onClick={() => onOrder(orders)}>⚔️ {tb.phase + 1}/{N}단계 명령</button>
              <button onClick={onAuto} title="남은 단계를 군사(AI)가 대신 지휘합니다">🤖 남은 단계 맡기기</button>
              {side === 'atk' && <button onClick={onRetreat} title="질서 있게 물러나면 추격 손실이 줄어듭니다">🏳️ 퇴각</button>}
            </>
          ) : (
            <button className="primary" onClick={onClose}>전투 보고 보기 · 닫기</button>
          )}
        </footer>
      </div>
    </div>
  );
}
