// v4.3 5단계 전술 전투 창: 전투를 다섯 단계(각 20%)로 나눠, 단계마다 병과별 투입 병력과 전술을 고른다.
// 왼쪽 사이드바 = 병과별 지휘, 오른쪽 = 이번 단계 예상 결과와 척후 보고, 아래 = 지난 단계 기록.
import { useEffect, useMemo, useState } from 'react';
import type { GameState, SideOrders, TacOrder, TacBattle, UnitKind } from '../../core';
import { BALANCE, SKILLS, STAT_LABEL, TAC_ORDERS, UNIT_KINDS, WEATHER_ICON, WEATHER_LABEL, balanceOf, fixJosa, orderBlocked, orderChance, ordersText, otherSide, previewTactical, sumT, tacticalReportIndex, unitName } from '../../core';
import { Portrait } from './Portrait';

const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
const pct = (p: number) => `${Math.round(p * 100)}%`;
const ORDER_LIST: TacOrder[] = ['assault', 'charge', 'hold', 'volley', 'flank', 'encircle', 'halfcross', 'ambush', 'feint', 'decoy', 'provoke', 'rest', 'fire', 'flood', 'raid', 'night'];
/** 이 전투에서 아예 쓸 수 없는 전술은 버튼을 숨긴다 (반도격은 강을 지킬 때, 포위는 병력이 두 배일 때만) */
const hiddenOrder = (tb: TacBattle, t: TacOrder) => (t === 'halfcross' && (tb.playerSide !== 'def' || tb.terrain.road !== 'river' || tb.phase >= BALANCE.tactical.halfcrossPhases)) || (t === 'encircle' && sumT(tb[tb.playerSide!].units) < sumT(tb[otherSide(tb.playerSide!)].units) * BALANCE.tactical.encircle.ratio);
const ONE_SHOT: TacOrder[] = ['ambush', 'feint', 'fire', 'night', 'decoy', 'flood', 'raid', 'provoke', 'rest'];
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
    else if (ONE_SHOT.includes(t)) t = k === 'archer' ? 'volley' : 'assault';
    if (orderBlocked(tb, side, k, t)) t = 'assault';
    o[k] = { troops: n, tactic: t };
  }
  return o;
}

const FC_NOTE: Partial<Record<TacOrder, string>> = {
  feint: ' → 성공하고 적이 쫓아오면 다음 단계 적 대열 흐트러짐',
  decoy: ' → 성공하면 이번 단계 적 전체 공격 약화',
  rest: ' → 다음 단계 이 병과 공격 강화',
  raid: ' → 성공하면 남은 단계 적 굶주림',
  provoke: ' → 성공하면 다음 단계 적장 격분',
  flood: ' → 성공하면 적진이 물에 잠김',
};

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
    id: 'decoy', name: '🚩 의병 + 방진', desc: '보병이 깃발과 먼지로 대군인 척 꾸며 적을 주춤하게 하고, 창병은 방진, 궁병은 사격 (병력이 적을 때 · 장비의 일갈)',
    make: (tb) => {
      const side = tb.playerSide!, me = tb[side];
      const dk: UnitKind | null = !orderBlocked(tb, side, 'infantry', 'decoy') && (me.units.infantry ?? 0) > 0 ? 'infantry' : !orderBlocked(tb, side, 'cavalry', 'decoy') && (me.units.cavalry ?? 0) > 0 ? 'cavalry' : null;
      if (!dk) return null;
      const o: SideOrders = {};
      for (const k of UNIT_KINDS) if ((me.units[k] ?? 0) > 0) o[k] = { troops: me.units[k]!, tactic: k === dk ? 'decoy' : k === 'archer' ? 'volley' : k === 'spear' ? 'hold' : HORSE.includes(k) ? 'flank' : 'hold' };
      return o;
    },
  },
  {
    id: 'rest', name: '⛺ 이일대로', desc: '이번 단계는 진을 지키며 쉬고, 쳐들어와 지친 적을 다음 단계에 친다 (以逸待勞)',
    make: (tb) => {
      const side = tb.playerSide!, me = tb[side];
      if (orderBlocked(tb, side, 'infantry', 'rest') && orderBlocked(tb, side, 'archer', 'rest')) return null;
      const o: SideOrders = {};
      for (const k of UNIT_KINDS) if ((me.units[k] ?? 0) > 0) o[k] = { troops: me.units[k]!, tactic: orderBlocked(tb, side, k, 'rest') ? 'hold' : 'rest' };
      return o;
    },
  },
  {
    id: 'halfcross', name: '🌉 반도격', desc: '강을 반쯤 건너온 적을 궁병·보병·기병이 한꺼번에 친다 (지킬 때 1~2단계)',
    make: (tb) => {
      const side = tb.playerSide!, me = tb[side];
      if (UNIT_KINDS.every((k) => !(me.units[k] ?? 0) || orderBlocked(tb, side, k, 'halfcross'))) return null;
      const o: SideOrders = {};
      for (const k of UNIT_KINDS) if ((me.units[k] ?? 0) > 0) o[k] = { troops: me.units[k]!, tactic: orderBlocked(tb, side, k, 'halfcross') ? 'hold' : 'halfcross' };
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
  const fA = state.factions[tb.attackerFaction], fD = tb.defenderFaction ? state.factions[tb.defenderFaction] : null;
  const road = state.roads.find((r) => (r.from === tb.fromCity && r.to === tb.toCity) || (r.to === tb.fromCity && r.from === tb.toCity));
  const bal = balanceOf(tb, road ? { road, city: to, weather: state.weather[to.id] } : undefined);
  const mineShare = side === 'atk' ? bal / (1 + bal) : 1 / (1 + bal);
  const kinds = UNIT_KINDS.filter((k) => (me.units[k] ?? 0) > 0);
  /** 아군 특기가 밀어 주는 전술이면 특기 이름 */
  const boostOf = (t: TacOrder) => (me.skills ?? []).filter((a) => { const e = SKILLS[a.id]?.effect; return !!e?.orders?.includes(t) && (!!e.strike && e.strike > 1 || !!e.chance || !!e.unlock); }).map((a) => `${a.owner}「${SKILLS[a.id].name}」`).join(' · ');
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
            <div className="small">{lead?.name ?? '지휘관 없음'}{x.deputyId && state.generals[x.deputyId] ? ` · ${s === 'atk' ? '부장' : '함께 지킴'} ${state.generals[x.deputyId].name}` : ''} <span className="muted">통솔 {x.lead} · 무력 {x.war} · 지력 {x.int}</span></div>
          </div>
        </div>
        <div className="tb-meter"><span>병력</span><div className="bar"><div style={{ width: `${(total / Math.max(1, init)) * 100}%` }} /><em>{fmt(total)} / {fmt(init)}</em></div></div>
        <div className="tb-meter"><span>사기</span><div className={`bar morale ${x.morale < 35 ? 'low' : ''}`}><div style={{ width: `${Math.min(100, x.morale)}%` }} /><em>{Math.round(x.morale)}</em></div></div>
        <div className="tb-units">{UNIT_KINDS.filter((k) => (x.init[k] ?? 0) > 0).map((k) => <span key={k} title={unitName(k).desc} className={x.hidden.includes(k) ? 'hid' : ''}>{unitName(k).icon}{fmt(x.units[k] ?? 0)}{x.hidden.includes(k) ? (s === side ? ' 🌲매복 중' : '') : ''}</span>)}</div>
        {(x.skills ?? []).length > 0 && (
          <div className="tb-skills">
            {(x.skills ?? []).map((a, i) => {
              const sk = SKILLS[a.id];
              if (!sk) return null;
              const fired = last?.skills?.some((f) => f.side === s && f.id === a.id && f.owner === a.owner);
              return <span key={i} className={`tb-skill ${sk.general ? 'unique' : ''} ${fired ? 'fired' : ''}`} title={fixJosa(`${a.owner} — ${sk.name}(${sk.hanja}) · ${sk.general ? '고유 특기' : `${STAT_LABEL[sk.stat]} 특기`}\n${sk.desc}\n${sk.story ? `📜 ${sk.story} (${sk.source})` : `📘 손자병법 ${sk.sun}`}\n단계마다 발동 ${pct(a.p)}`)}>✨ {sk.name}<small> {a.owner} {pct(a.p)}</small></span>;
            })}
          </div>
        )}
        <div className="tb-chips">
          {x.lured && <span className="chip bad">🏳️ 유인당해 대열 흐트러짐</span>}
          {x.provoked && <span className="chip bad">😤 도발에 격분 — 버티거나 숨지 못함</span>}
          {x.tired && <span className="chip bad">💦 쳐들어가다 지침</span>}
          {(x.rested ?? []).length > 0 && <span className="chip good">⛺ {(x.rested ?? []).map((k) => unitName(k).name).join('·')} 쉬어 힘을 모음</span>}
          {x.starved && <span className="chip bad">🌾 군량을 잃어 굶주림</span>}
          {x.fireUsed && <span className="chip">🔥 화공 씀</span>}
          {x.floodUsed && <span className="chip">🌊 수공 씀</span>}
          {x.raidUsed && <span className="chip">🌾 습량 씀</span>}
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
          {tb.terrain.rough && <span title="隘形者 我先居之 必盈之以待敵 (地形)">🪨 좁은 길 — 수비 방진 강화, 공격 돌격 약화</span>}
          {tb.terrain.walled && tb.terrain.relief >= BALANCE.tactical.uphillRelief && <span title="高陵勿向 (軍爭)">⛰️ 높은 산성 — 올려 치는 돌격 약화</span>}
          {tb.terrain.road === 'river' && <span title="客絶水而來 令半濟而擊之利 (行軍)">🌉 강을 건너는 싸움 — 수비 반도격 1~2단계</span>}
          <span title="朝氣銳 晝氣惰 暮氣歸 (軍爭)">🌅 공격군 기세 ×{BALANCE.tactical.spirit[Math.min(tb.phase, N - 1)]}</span>
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
                      {ORDER_LIST.filter((t) => TAC_ORDERS[t].kinds.includes(k) && !hiddenOrder(tb, t)).map((t) => {
                        const why = orderBlocked(tb, side, k, t);
                        const c = orderChance(tb, side, k, t);
                        return (
                          <button key={t} className={o.tactic === t ? 'active' : ''} disabled={!!why} title={fixJosa(`${TAC_ORDERS[t].hanja ? `${TAC_ORDERS[t].name}(${TAC_ORDERS[t].hanja}) — ` : ''}${TAC_ORDERS[t].desc}${TAC_ORDERS[t].sun ? `\n📘 손자병법 ${TAC_ORDERS[t].sun}` : ''}${boostOf(t) ? `\n✨ 특기 ${boostOf(t)}` : ''}${why ? `\n불가: ${why}` : ''}`)} onClick={() => set(k, { tactic: t })}>
                            {TAC_ORDERS[t].icon} {TAC_ORDERS[t].name}{boostOf(t) && !why ? <i className="tb-boost">✨</i> : null}{c !== null && !why ? <small> {pct(c)}</small> : null}
                          </button>
                        );
                      })}
                    </div>
                    <div className="tb-unit-fc small">
                      {o.tactic === 'ambush' ? <>🌲 숨어서 싸우지 않음 · 들키지 않을 확률 <b>{pct(ch ?? 0)}</b> → 다음 단계 기습 ×{BALANCE.tactical.ambushSpring}{k === 'archer' && tb.terrain.valley ? ` (골짜기 ×${BALANCE.tactical.valleyArcher} 더)` : ''}</>
                        : <>예상: 적에게 <b className="good">−{fmt(dealt)}</b> · 아군 <b className="bad">−{fmt(lost)}</b>{ch !== null ? <> · 성공률 <b>{pct(ch)}</b></> : null}{FC_NOTE[o.tactic] ?? ''}</>}
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
              {ev && ev.skills.length > 0 && (
                <>
                  <h4>✨ 이번 단계 특기 (발동 확률)</h4>
                  <ul className="small tb-skill-fc">
                    {ev.skills.map((x, i) => <li key={i} className={x.side === side ? 'good' : 'bad'}>{x.side === side ? '아군' : '적'} {x.owner} 「{x.name}({x.hanja})」 {pct(x.a)} — {SKILLS[x.id]?.desc}</li>)}
                  </ul>
                </>
              )}
              <h4>🔭 척후 보고 — 적의 움직임 (예상)</h4>
              <p className="small">{preview ? ordersText(preview.enemy) : '—'}</p>
              <p className="small muted">적장도 단계마다 전술을 바꿉니다. 보고와 다르게 움직일 수 있습니다.</p>
              {(foe.lured || me.lured || me.hidden.length > 0 || foe.provoked || me.provoked || foe.tired || (me.rested ?? []).length > 0 || foe.starved) && <h4>지난 단계에서 이어지는 것</h4>}
              {(me.rested ?? []).length > 0 && <p className="small good">⛺ {(me.rested ?? []).map((k) => unitName(k).name).join('·')} 쉬어 힘을 모았습니다 — 이번에 치면 공격 ×{BALANCE.tactical.restBonus}</p>}
              {foe.tired && <p className="small good">💦 쳐들어오던 적이 지쳤습니다 — 이번 단계 적 피해 ×{BALANCE.tactical.tiredExpose}</p>}
              {foe.provoked && <p className="small good">😤 적장이 격분했습니다 — 방진·매복을 못 하고 대열이 흐트러짐</p>}
              {me.provoked && <p className="small bad">😤 아군 장수가 도발에 격분 — 이번 단계는 버티거나 숨을 수 없음</p>}
              {foe.starved && <p className="small good">🌾 적 군량이 불타 굶주립니다 — 남은 단계 적 공격 ×{BALANCE.tactical.raid.starve}</p>}
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
                  <li>🚩 의병(疑兵) → 대군인 척 꾸며 이번 단계 적 공격 −{pct(BALANCE.tactical.decoy.cut)} · 병력이 적을수록 잘 통함</li>
                  <li>⛺ 이일대로(以逸待勞) → 이번엔 쉬고, 다음 단계 공격 ×{BALANCE.tactical.restBonus} · 쳐들어온 적은 지침</li>
                  <li>🌊 수공(水攻) → 강 길·비·눈, 지력 {BALANCE.tactical.flood.minInt}+ · 🌾 습량(襲糧) → 적 사기 −{BALANCE.tactical.raid.morale}, 남은 단계 굶주림</li>
                  <li>⭕ 포위(十則圍之) → 병력 {BALANCE.tactical.encircle.ratio}배 이상 · 갇힌 적은 사지라 더 사나움 · 😤 도발(忿速可侮) → 적장이 성나 버티지 못함</li>
                  <li>🌉 반도격(半濟而擊) → 강을 건너오는 적을 1~2단계에 · 🪨 좁은 길(隘形)은 지키는 방진이 강함 · 🌅 공격군은 처음 기세가 날카롭고 갈수록 무뎌짐(朝氣銳 暮氣歸)</li>
                  <li>☠️ 사지(死地) → 적의 1/3 이하로 몰린 쪽은 덜 무너지고 더 사납게 싸움 · 지력 {BALANCE.tactical.wiseCap.int}+ 장수는 거짓 퇴각·도발에 잘 안 속음(佯北勿從)</li>
                  <li>✨ 장수 특기 → 단계마다 능력치만큼 발동, 맞는 전술의 공격·성공률이 오름 (장수 정보 창에서 확인)</li>
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
