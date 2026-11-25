// v3.6 성이 포위당했을 때 대응 고르기: 농성·협공·출성 요격·청야 철수·화친 요청, 대응마다 예상 결과
import { useMemo, useState } from 'react';
import type { GameState, Siege, SiegeKind, SiegeResponse } from '../../core';
import { SIEGE_LABEL, evacuateTargets, pincerSources, siegeForecast } from '../../core';
import { Modal } from './Modals';
import { TroopSlider } from './CityPanel';
import { Portrait } from './Portrait';

const KINDS: SiegeKind[] = ['hold', 'pincer', 'sortie', 'evacuate', 'parley'];
const pct = (p: number) => `${Math.round(p * 100)}%`;

export function SiegeModal({ state, sieges, onRespond, onClose }: {
  state: GameState; sieges: Siege[]; onRespond: (id: string, r: SiegeResponse) => void; onClose: () => void;
}) {
  return (
    <Modal title={`⚔️ 성이 포위당했습니다 (${sieges.length}곳)`} onClose={onClose} wide>
      <p className="muted small">적군이 성 밖에 진을 쳤습니다. 이번 계절에 대응을 고르면 <b>턴을 넘길 때</b> 결판이 납니다. 고르지 않으면 <b>농성</b>으로 싸웁니다. 그 사이 다른 명령(병력 이동·징병 등)도 그대로 할 수 있습니다.</p>
      {sieges.map((sg) => <SiegeCard key={sg.id} state={state} sg={sg} onRespond={onRespond} />)}
    </Modal>
  );
}

function SiegeCard({ state, sg, onRespond }: { state: GameState; sg: Siege; onRespond: (id: string, r: SiegeResponse) => void }) {
  const to = state.cities[sg.toCity];
  const g = state.generals[sg.generalId];
  const af = state.factions[sg.attackerFaction];
  const step = state.mapScale === 'region' ? 100 : 500;
  const sources = useMemo(() => pincerSources(state, sg), [state, sg]);
  const targets = useMemo(() => evacuateTargets(state, sg), [state, sg]);
  const [src, setSrc] = useState(sources[0]?.cityId ?? '');
  const srcInfo = sources.find((x) => x.cityId === src);
  const [pTroops, setPTroops] = useState(srcInfo ? Math.floor((srcInfo.max * 0.6) / step) * step : 0);
  const [dest, setDest] = useState(targets[0] ?? '');
  const responseOf = (k: SiegeKind): SiegeResponse =>
    k === 'pincer' ? { kind: 'pincer', fromCity: src, troops: Math.min(pTroops, srcInfo?.max ?? 0) }
    : k === 'evacuate' ? { kind: 'evacuate', toCity: dest }
    : { kind: k } as SiegeResponse;
  const forecasts = useMemo(() => KINDS.map((k) => siegeForecast(state, sg.id, responseOf(k))), [state, sg.id, src, pTroops, dest]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = sg.response?.kind ?? 'hold';
  return (
    <div className="siege-card">
      <div className="siege-head">
        <Portrait general={g} color={af.color} size={56} />
        <div>
          <b style={{ color: af.color }}>{af.name}군</b> {g.name} <small className="muted">(통솔 {g.stats.leadership} · 무력 {g.stats.war} · 지력 {g.stats.intellect})</small>
          <div>병력 <b className="bad">{sg.troops.toLocaleString()}</b>명이 <b>{to.name}</b>을(를) 포위 — 성안 병력 <b>{to.troops.toLocaleString()}</b> · 성벽 {to.wall} · 사기 {to.morale}</div>
          <div className="muted small">출발: {state.cities[sg.fromCity].name}{sg.tactic ? ' · 계책을 준비한 듯함' : ''}</div>
        </div>
      </div>
      <div className="siege-options">
        {KINDS.map((k, i) => {
          const fc = forecasts[i];
          const L = SIEGE_LABEL[k];
          const on = chosen === k;
          const good = k === 'evacuate' ? null : fc.holdChance >= 0.6 ? 'good' : fc.holdChance >= 0.35 ? '' : 'bad';
          return (
            <div key={k} className={`siege-opt ${on ? 'on' : ''} ${fc.unavailable ? 'off' : ''}`}>
              <div className="siege-opt-title">{L.icon} {L.name}{on && <span className="tag">선택됨</span>}</div>
              <p className="small muted">{L.desc}</p>
              {k === 'pincer' && sources.length > 0 && (
                <div className="siege-ctl">
                  <select value={src} onChange={(e) => { setSrc(e.target.value); const m = sources.find((x) => x.cityId === e.target.value)?.max ?? 0; setPTroops(Math.floor((m * 0.6) / step) * step); }}>
                    {sources.map((x) => <option key={x.cityId} value={x.cityId}>{state.cities[x.cityId].name} ({x.leader?.name ?? '장수 없음'} · 최대 {x.max.toLocaleString()})</option>)}
                  </select>
                  {srcInfo && <TroopSlider value={Math.min(pTroops, srcInfo.max)} max={srcInfo.max} step={step} total={state.cities[src].troops} keep={state.cities[src].troops - srcInfo.max} onChange={setPTroops} />}
                </div>
              )}
              {k === 'evacuate' && targets.length > 0 && (
                <div className="siege-ctl">
                  <select value={dest} onChange={(e) => setDest(e.target.value)}>
                    {targets.map((id) => <option key={id} value={id}>{state.cities[id].name}(으)로 (병력 {state.cities[id].troops.toLocaleString()})</option>)}
                  </select>
                </div>
              )}
              {fc.unavailable ? <p className="small bad">불가: {fc.unavailable}</p> : (
                <div className="siege-fc">
                  {k === 'evacuate' ? <div>성을 지킬 확률 <b className="bad">0%</b> (성을 내줌)</div> : <div>성을 지킬 확률 <b className={good ?? ''}>{pct(fc.holdChance)}</b></div>}
                  {k !== 'evacuate' && <div className="small">예상 손실 — 적 <b>{fc.attackerLoss.toLocaleString()}</b> · 아군 <b>{fc.defenderLoss.toLocaleString()}</b></div>}
                  {fc.notes.map((n) => <div key={n} className="small muted">· {n}</div>)}
                </div>
              )}
              <button className={on ? 'primary' : ''} disabled={!!fc.unavailable} onClick={() => onRespond(sg.id, responseOf(k))}>{on ? '✔ 이 대응으로 정함' : '이 대응으로'}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
