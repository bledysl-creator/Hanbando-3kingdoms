// 앱 루트: 타이틀 → 메인 지도 화면. 게임 상태는 core 함수로만 바꾼다.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BALANCE, canFound, applyCommand, attemptUprising, canRise, uprisingChance, respondOffer, siegesOf, setSiegeResponse, createGame, DATA, endTurn, SCENARIOS, citiesOf, type Command, type GameState } from '../core';
import { DEFAULT_LAYERS, KoreaMap, LAYER_LABELS, MAP_MODES, type MapLayers, type MapMode } from '../map/KoreaMap';
import { indexedDbRepo } from '../save/saveRepository';
import { VERSION } from '../version';
import { CityPanel } from './components/CityPanel';
import { EventCards, pickEvents, type EventCardItem } from './components/EventCard';
import { SiegeModal } from './components/Siege';
import { DiplomacyModal, OffersModal } from './components/Diplomacy';
import { CommandBar, EventLog, MiniMap, MissionPanel, RulerCard, SideMenu, TopBar, TurnButton, type BarKey, type MenuKey } from './components/Hud';
import { SimStatsModal, BattleReportView, BattlesModal, ArmyModal, TacticsModal, DevModal, ChronicleModal, CitiesModal, FactionsModal, GeneralsModal, HelpModal, Modal, SettingsModal } from './components/Modals';

type ModalKey = 'dev' | 'tactics' | 'army' | 'generals' | 'cities' | 'chronicle' | 'factions' | 'battles' | 'settings' | 'help' | 'diplomacy' | null;

export function App() {
  const [state, setState] = useState<GameState | null>(null);
  if (!state) return <TitleScreen onStart={setState} />;
  return <GameScreen state={state} setState={setState} onQuit={() => setState(null)} />;
}

function TitleScreen({ onStart }: { onStart: (s: GameState) => void }) {
  const [hasAuto, setHasAuto] = useState(false);
  const [pick, setPick] = useState(false);
  const [stats, setStats] = useState(false);
  const [allGen, setAllGen] = useState(() => localStorage.getItem('hanbando.allGenerals') !== '0');
  useEffect(() => { indexedDbRepo.list().then((l) => setHasAuto(l.some((m) => m.slot === 'auto'))).catch(() => {}); }, []);
  const [scId, setScId] = useState(() => localStorage.getItem('hanbando.scenario') ?? '197_sabun');
  const [scale, setScale] = useState<'city' | 'region'>(() => (localStorage.getItem('hanbando.scale') === 'region' ? 'region' : 'city'));
  const sc = SCENARIOS[scId] ?? SCENARIOS['197_sabun'];
  const preview = useMemo(() => createGame(DATA, sc, { allGenerals: allGen, scale }), [sc, allGen, scale]);
  const opts = { allGenerals: allGen, scale };
  const seed = () => Math.floor(Date.now() % 2147483647);
  const start = (fid: string | null) => onStart(createGame(DATA, sc, { ...opts, seed: seed(), playerFactionId: fid }));
  // v3.2 신군주: 아무 도시(시·군)와 아무 장수
  const [nrCity, setNrCity] = useState('');
  const [nrGen, setNrGen] = useState('');
  const cityList = useMemo(() => Object.values(preview.cities).sort((a, b) => a.name.localeCompare(b.name, 'ko')), [preview]);
  const genList = useMemo(() => {
    const rulers = new Set(Object.values(preview.factions).map((f) => f.rulerId));
    const sum = (g: GameState['generals'][string]) => Object.values(g.stats).reduce((a, b) => a + b, 0);
    return Object.values(preview.generals).filter((g) => g.alive && !rulers.has(g.id)).sort((a, b) => sum(b) - sum(a));
  }, [preview]);
  const nrErr = nrCity && nrGen ? canFound(preview, nrCity, nrGen) : '도시와 장수를 고르세요.';
  const startNew = () => onStart(createGame(DATA, sc, { ...opts, seed: seed(), newRuler: { cityId: nrCity, generalId: nrGen } }));
  const setSc = (id: string) => { setScId(id); localStorage.setItem('hanbando.scenario', id); };
  const setSl = (v: 'city' | 'region') => { setScale(v); localStorage.setItem('hanbando.scale', v); setNrCity(''); };
  return (
    <div className="title-screen">
      <div className="title-bg"><KoreaMap state={preview} mini /></div>
      <div className={`title-box panel ${pick ? 'wide' : ''}`}>
        <h1>三國志 <span>한반도 천하쟁패</span></h1>
        {!pick ? (
          <>
            <p className="quote">천하의 영웅들이 낯선 땅에 모였다.<br />백두산에서 한라산까지, 한강에서 낙동강까지.<br />역사는 정해져 있지 않다.</p>
            <p className="scenario"><b>{sc.name}</b> — {sc.description}</p>
            <div className="actions">
              <button className="primary" onClick={() => setPick(true)}>새 게임</button>
              <button disabled={!hasAuto} onClick={() => indexedDbRepo.load('auto').then((s) => s && onStart(s))}>이어하기</button>
              <button onClick={() => start(null)}>관전 모드 (AI끼리 진행)</button>
              <button onClick={() => setStats(true)}>📊 관전 통계 (여러 판 자동)</button>
            </div>
            {stats && <SimStatsModal onClose={() => setStats(false)} />}
          </>
        ) : (
          <>
            <div className="opt-row">
              <label>시나리오 <select value={sc.id} onChange={(e) => setSc(e.target.value)}>{Object.values(SCENARIOS).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
              <label>지도 <select value={scale} onChange={(e) => setSl(e.target.value as 'city' | 'region')}><option value="city">주요 도시 24곳</option><option value="region">군현 지도 — 시·군 345곳이 모두 도시</option></select></label>
            </div>
            <p className="scenario"><b>{sc.name}</b> — {sc.description}<br />플레이할 군주를 고르세요.</p>
            <div className={`faction-pick ${Object.keys(preview.factions).length > 4 ? "many" : ""}`}>
              {Object.values(preview.factions).map((f) => {
                const ruler = preview.generals[f.rulerId];
                const cities = citiesOf(preview, f.id);
                const gens = Object.values(preview.generals).filter((g) => g.faction === f.id);
                const troops = cities.reduce((a, c) => a + c.troops, 0);
                return (
                  <button key={f.id} className="faction-card" style={{ borderColor: f.color }} onClick={() => start(f.id)}>
                    <span className="fc-hanja" style={{ background: f.color, fontSize: f.hanja.length > 1 ? 20 : undefined }}>{f.hanja}</span>
                    <b>{ruler.name}</b>
                    <small>도시 {cities.length} · 장수 {gens.length} · 병력 {troops.toLocaleString()}</small>
                    <p>{sc.factionIntro?.[f.id]}</p>
                    <small className="muted" title={f.traits.map((t) => `${t}: ${BALANCE.traitText[t] ?? ''}`).join('\n')}>{f.traits.map((t) => `${t}(${BALANCE.traitText[t] ?? ''})`).join(' · ')}</small>
                  </button>
                );
              })}
            </div>
            <div className="new-ruler">
              <b>🚩 신군주로 시작</b> <span className="muted small">— 아무 {scale === 'region' ? '시·군' : '도시'}에서 아무 장수를 군주로 세워 새 세력으로 거병합니다 (가상 설정)</span>
              <div className="opt-row">
                <select value={nrCity} onChange={(e) => setNrCity(e.target.value)}>
                  <option value="">{scale === 'region' ? '시·군' : '도시'} 고르기 ({cityList.length}곳)</option>
                  {cityList.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.owner ? preview.factions[c.owner].name : '주인 없음'}</option>)}
                </select>
                <select value={nrGen} onChange={(e) => setNrGen(e.target.value)}>
                  <option value="">군주 고르기 ({genList.length}명)</option>
                  {genList.map((g) => <option key={g.id} value={g.id}>{g.name} {g.hanja} — 통{g.stats.leadership} 무{g.stats.war} 지{g.stats.intellect} 정{g.stats.politics} 매{g.stats.charm} ({g.faction ? preview.factions[g.faction].name : '재야'})</option>)}
                </select>
                <button className="primary" disabled={!!nrErr} title={nrErr ?? ''} onClick={startNew}>거병</button>
              </div>
              {nrErr && nrCity && nrGen && <p className="small warn-text">{nrErr}</p>}
            </div>
            <label className="opt-line"><input type="checkbox" checked={allGen} onChange={(e) => { setAllGen(e.target.checked); localStorage.setItem('hanbando.allGenerals', e.target.checked ? '1' : '0'); }} /> 모든 장수 등장 — 후대 인물(사마의·강유·육항 등)도 처음부터 성인으로 등장 (가상 설정). 끄면 실제 생년에 맞춰 차례로 등장</label>
            <div className="actions row"><button onClick={() => setPick(false)}>← 뒤로</button></div>
          </>
        )}
        <p className="muted small">v{VERSION} 프로토타입 · 오리지널 게임 · 저장은 이 브라우저에만 됩니다</p>
      </div>
    </div>
  );
}

function GameScreen({ state, setState, onQuit }: { state: GameState; setState: (s: GameState) => void; onQuit: () => void }) {
  const pf = state.playerFactionId;
  const [selected, setSelected] = useState<string | null>(pf ? state.generals[state.factions[pf].rulerId].city : null);
  const [tab, setTab] = useState<MenuKey>('내정');
  const [modal, setModal] = useState<ModalKey>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [hover, setHover] = useState<string[]>([]);
  const [report, setReport] = useState<number | null>(null);
  const [auto, setAuto] = useState(false);
  const [offersHidden, setOffersHidden] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>('political');
  const [dev, setDev] = useState(() => localStorage.getItem('hanbando.dev') === '1');
  useEffect(() => { const h = () => setDev(localStorage.getItem('hanbando.dev') === '1'); window.addEventListener('hanbando-dev', h); return () => window.removeEventListener('hanbando-dev', h); }, []);
  const [layers, setLayers] = useState<MapLayers>(() => {
    try { return { ...DEFAULT_LAYERS, ...JSON.parse(localStorage.getItem('hanbando.layers') ?? '{}') }; } catch { return DEFAULT_LAYERS; }
  });
  const toggleLayer = (k: keyof MapLayers) => setLayers((l) => { const n = { ...l, [k]: !l[k] }; localStorage.setItem('hanbando.layers', JSON.stringify(n)); return n; });
  const [siegeHidden, setSiegeHidden] = useState(false);
  useEffect(() => { setOffersHidden(false); setSiegeHidden(false); }, [state.turn]);
  const mySieges = pf ? siegesOf(state, pf) : [];

  const flash = (text: string, ok = true) => { setToast({ text, ok }); setTimeout(() => setToast(null), 2600); };

  const onCommand = (cmd: Command) => {
    if (!pf) return;
    const before = state.lastBattles.length;
    const { state: next, result } = applyCommand(state, pf, cmd);
    setState(next);
    flash(result.ok ? result.message : result.error, result.ok);
    if (result.ok && cmd.type === 'march' && next.lastBattles.length > before) setReport(next.lastBattles.length - 1);
    if (result.ok && cmd.type === 'march') setSelected(next.generals[cmd.generalId].city);
  };

  const [events, setEvents] = useState<EventCardItem[]>([]);
  const nextTurn = useCallback(() => {
    const next = endTurn(state);
    setState(next);
    indexedDbRepo.save('auto', next).catch(() => {});
    // v3.4 그림 사건 안내 (자동 진행 중에는 띄우지 않음)
    if (!auto && localStorage.getItem('hanbando.eventCards') !== '0') setEvents(pickEvents(state, next));
  }, [state, setState, auto]);

  // 관전 모드 자동 진행
  useEffect(() => {
    if (!auto || state.outcome !== 'playing') return;
    const t = setTimeout(nextTurn, 450);
    return () => clearTimeout(t);
  }, [auto, state, nextTurn]);

  const onMenu = (k: MenuKey) => {
    if (k === '정보') return setModal('factions');
    if (k === '외교') return setModal('diplomacy');
    setTab(k);
    if (!selected || state.cities[selected].owner !== pf) {
      const first = pf ? citiesOf(state, pf)[0] : undefined;
      if (first) setSelected(first.id);
    }
  };
  const onBar = (k: BarKey) => {
    if (k === '장수') setModal('generals');
    else if (k === '도시') setModal('cities');
    else if (k === '부대') setModal('army');
    else if (k === '계책') setModal('tactics');
    else if (k === '연표') setModal('chronicle');
    else if (k === '외교') setModal('diplomacy');
  };

  const idle = pf ? Object.values(state.generals).filter((g) => g.alive && g.faction === pf && !g.acted && state.cities[g.city].owner === pf).length : 0;

  return (
    <div className="game">
      <div className="map-layer">
        <KoreaMap layers={layers} mode={mapMode} state={state} selectedCityId={selected} highlightCityIds={hover} onSelectCity={setSelected} />
      </div>

      <TopBar state={state} onHelp={() => setModal('help')} onSettings={() => setModal('settings')} onMail={() => setModal('battles')} onTrophy={() => setModal('factions')} />

      <div className="left-col">
        <RulerCard state={state} />
        {pf && <SideMenu active={selected && state.cities[selected]?.owner === pf ? tab : null} onPick={onMenu} />}
      </div>

      <div className="right-col">
        <MiniMap state={state} />
        <div className="map-modes panel">
          {MAP_MODES.map((m) => (
            <button key={m.key} className={mapMode === m.key ? 'active' : ''} onClick={() => setMapMode(m.key)}>{m.label}</button>
          ))}
          <div className="layers">
            {LAYER_LABELS.map((l) => (
              <label key={l.key}><input type="checkbox" checked={layers[l.key]} onChange={() => toggleLayer(l.key)} /> {l.label}</label>
            ))}
          </div>
          {mapMode !== 'political' && (
            <div className="legend">
              {mapMode === 'terrain' ? <><span className="lg terrain" /> 저지대 → 고산 <small>(실측 고도 음영)</small></> : mapMode === 'weather' ? <span>☀️맑음 🌧️비 ⛈️폭우 🌀태풍 🌨️눈 ❄️폭설 🥶한파 🏜️가뭄 🌫️안개</span> : mapMode === 'supply' ? <><span className="lg ramp" /> 끊김·부족 → 충분 <small>(본거지 연결 × 군량)</small></> : <><span className="lg ramp" /> 낮음 → 높음</>}
            </div>
          )}
        </div>
        <MissionPanel state={state} />
        {selected && (
          <CityPanel state={state} cityId={selected} tab={tab} onTab={setTab} onCommand={onCommand} onClose={() => setSelected(null)} onTargetHover={setHover} />
        )}
      </div>

      <EventLog state={state} onOpen={() => setModal('chronicle')} />

      <div className="bottom-right">
        <CommandBar onPick={onBar} />
        {pf ? (
          <TurnButton onClick={nextTurn} disabled={state.outcome !== 'playing'} />
        ) : (
          <TurnButton onClick={() => setAuto((a) => !a)} label={auto ? '일시정지' : '자동 진행'} disabled={state.outcome !== 'playing'} />
        )}
        {pf && <div className="idle-hint">대기 장수 {idle}명</div>}
        {mySieges.length > 0 && <button className="siege-alert" onClick={() => setSiegeHidden(false)}>⚔️ 포위된 성 {mySieges.length}곳 — 대응 정하기</button>}
      </div>

      {pf && canRise(state, pf) && state.outcome === 'playing' && (
        <div className="uprising panel">
          <h3>세력이 무너졌습니다</h3>
          <p>{state.generals[state.factions[pf].rulerId].name}은(는) {state.cities[state.generals[state.factions[pf].rulerId].city].name}에 몸을 숨기고 있습니다. 군주가 살아 있는 한 끝이 아닙니다.</p>
          <p className="muted small">거병 성공률 {Math.round(uprisingChance(state, pf) * 100)}% (수비 {state.cities[state.generals[state.factions[pf].rulerId].city].troops.toLocaleString()} 이하 9,000일 때 가능, 매력·민심 영향). 실패해도 턴을 넘겨 다시 노릴 수 있습니다.</p>
          <div className="actions row">
            <button className="primary" disabled={uprisingChance(state, pf) <= 0} onClick={() => { const d = structuredClone(state); const r = attemptUprising(d, pf); setState(d); flash(r.message, r.ok); }}>의병을 일으킨다</button>
            <select value={state.generals[state.factions[pf].rulerId].city} onChange={(e) => { const d = structuredClone(state); d.generals[d.factions[pf].rulerId].city = e.target.value; setState(d); }}>
              {Object.values(state.cities).map((c) => <option key={c.id} value={c.id}>{c.name}으로 잠행 (수비 {c.troops.toLocaleString()})</option>)}
            </select>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.ok ? 'ok' : 'err'}`}>{toast.text}</div>}

      {mySieges.length > 0 && !siegeHidden && events.length === 0 && auto === false && (
        <SiegeModal state={state} sieges={mySieges} onClose={() => setSiegeHidden(true)}
          onRespond={(id, r) => { const x = setSiegeResponse(state, pf!, id, r); setState(x.state); flash(x.result.ok ? x.result.message : x.result.error, x.result.ok); }} />
      )}
      {events.length > 0 && <EventCards key={state.turn} items={events} onClose={() => setEvents([])} />}
      {report !== null && state.lastBattles[report] && (
        <Modal title="전투 결과" onClose={() => setReport(null)}>
          <BattleReportView state={state} report={state.lastBattles[report]} />
        </Modal>
      )}
      {modal === 'generals' && <GeneralsModal state={state} onClose={() => setModal(null)} onPickCity={setSelected} />}
      {modal === 'tactics' && <TacticsModal state={state} onClose={() => setModal(null)} />}
      {modal === 'army' && <ArmyModal state={state} onClose={() => setModal(null)} onPickCity={setSelected} />}
      {modal === 'cities' && <CitiesModal state={state} onClose={() => setModal(null)} onPickCity={setSelected} />}
      {modal === 'chronicle' && <ChronicleModal state={state} onClose={() => setModal(null)} />}
      {modal === 'factions' && <FactionsModal state={state} onClose={() => setModal(null)} />}
      {modal === 'battles' && <BattlesModal state={state} onClose={() => setModal(null)} />}
      {modal === 'diplomacy' && pf && <DiplomacyModal state={state} onClose={() => setModal(null)} onCommand={onCommand} />}
      {pf && state.offers.some((o) => o.to === pf) && !offersHidden && (
        <OffersModal state={state} onClose={() => setOffersHidden(true)} onRespond={(i, a) => { const r = respondOffer(state, pf, i, a); setState(r.state); flash(r.result.ok ? r.result.message : r.result.error, r.result.ok); }} />
      )}
      {modal === 'help' && <HelpModal onClose={() => setModal(null)} />}
      {modal === 'dev' && <DevModal state={state} onClose={() => setModal(null)} />}
      {dev && <button className="dev-btn" onClick={() => setModal('dev')}>🛠 AI 판단</button>}
      {modal === 'settings' && <SettingsModal state={state} onClose={() => setModal(null)} onLoad={(s) => { setState(s); setSelected(null); }} onNewGame={onQuit} />}

      {state.outcome !== 'playing' && (
        <Modal title={state.outcome === 'won' ? '천하통일!' : state.outcome === 'lost' ? '패배' : '통일 완료'} onClose={onQuit}>
          <p>
            {state.winner ? `${state.factions[state.winner].name}(${state.factions[state.winner].hanja})이(가) ${state.year}년 한반도를 통일했습니다.` : '우리 세력이 멸망했습니다.'}
          </p>
          <div className="actions row">
            <button onClick={() => setModal('chronicle')}>연표 보기</button>
            <button className="primary" onClick={onQuit}>타이틀로</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
