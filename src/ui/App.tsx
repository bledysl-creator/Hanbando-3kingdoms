// 앱 루트: 타이틀 → 메인 지도 화면. 게임 상태는 core 함수로만 바꾼다.
import { useCallback, useEffect, useState } from 'react';
import { applyCommand, createGame, DATA, endTurn, SCENARIOS, citiesOf, type Command, type GameState } from '../core';
import { KoreaMap } from '../map/KoreaMap';
import { indexedDbRepo } from '../save/saveRepository';
import { CityPanel } from './components/CityPanel';
import { CommandBar, EventLog, MiniMap, MissionPanel, RulerCard, SideMenu, TopBar, TurnButton, type BarKey, type MenuKey } from './components/Hud';
import { BattleReportView, BattlesModal, ChronicleModal, CitiesModal, FactionsModal, GeneralsModal, HelpModal, Modal, SettingsModal } from './components/Modals';

type ModalKey = 'generals' | 'cities' | 'chronicle' | 'factions' | 'battles' | 'settings' | 'help' | null;

export function App() {
  const [state, setState] = useState<GameState | null>(null);
  if (!state) return <TitleScreen onStart={setState} />;
  return <GameScreen state={state} setState={setState} onQuit={() => setState(null)} />;
}

function TitleScreen({ onStart }: { onStart: (s: GameState) => void }) {
  const [hasAuto, setHasAuto] = useState(false);
  useEffect(() => { indexedDbRepo.list().then((l) => setHasAuto(l.some((m) => m.slot === 'auto'))).catch(() => {}); }, []);
  const sc = SCENARIOS['197_sabun'];
  const start = (spectate: boolean) =>
    onStart(createGame(DATA, sc, { seed: Math.floor(Date.now() % 2147483647), playerFactionId: spectate ? null : sc.playerFactionId }));
  return (
    <div className="title-screen">
      <div className="title-bg"><KoreaMap state={createGame(DATA, sc)} mini /></div>
      <div className="title-box panel">
        <h1>三國志 <span>한반도 천하쟁패</span></h1>
        <p className="quote">천하의 영웅들이 낯선 땅에 모였다.<br />백두산에서 한라산까지, 한강에서 낙동강까지.<br />역사는 정해져 있지 않다.</p>
        <p className="scenario"><b>{sc.name}</b> — {sc.description}</p>
        <div className="actions">
          <button className="primary" onClick={() => start(false)}>새 게임 (유비 · 蜀)</button>
          <button disabled={!hasAuto} onClick={() => indexedDbRepo.load('auto').then((s) => s && onStart(s))}>이어하기</button>
          <button onClick={() => start(true)}>관전 모드 (AI끼리 진행)</button>
        </div>
        <p className="muted small">v0.1 프로토타입 · 오리지널 게임 · 저장은 이 브라우저에만 됩니다</p>
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

  const nextTurn = useCallback(() => {
    const next = endTurn(state);
    setState(next);
    indexedDbRepo.save('auto', next).catch(() => {});
  }, [state, setState]);

  // 관전 모드 자동 진행
  useEffect(() => {
    if (!auto || state.outcome !== 'playing') return;
    const t = setTimeout(nextTurn, 450);
    return () => clearTimeout(t);
  }, [auto, state, nextTurn]);

  const onMenu = (k: MenuKey) => {
    if (k === '정보') return setModal('factions');
    setTab(k);
    if (!selected || state.cities[selected].owner !== pf) {
      const first = pf ? citiesOf(state, pf)[0] : undefined;
      if (first) setSelected(first.id);
    }
  };
  const onBar = (k: BarKey) => {
    if (k === '장수') setModal('generals');
    else if (k === '도시') setModal('cities');
    else if (k === '연표') setModal('chronicle');
  };

  const idle = pf ? Object.values(state.generals).filter((g) => g.alive && g.faction === pf && !g.acted && state.cities[g.city].owner === pf).length : 0;

  return (
    <div className="game">
      <div className="map-layer">
        <KoreaMap state={state} selectedCityId={selected} highlightCityIds={hover} onSelectCity={setSelected} />
      </div>

      <TopBar state={state} onHelp={() => setModal('help')} onSettings={() => setModal('settings')} onMail={() => setModal('battles')} onTrophy={() => setModal('factions')} />

      <div className="left-col">
        <RulerCard state={state} />
        {pf && <SideMenu active={selected && state.cities[selected]?.owner === pf ? tab : null} onPick={onMenu} />}
      </div>

      <div className="right-col">
        <MiniMap state={state} />
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
      </div>

      {toast && <div className={`toast ${toast.ok ? 'ok' : 'err'}`}>{toast.text}</div>}

      {report !== null && state.lastBattles[report] && (
        <Modal title="전투 결과" onClose={() => setReport(null)}>
          <BattleReportView state={state} report={state.lastBattles[report]} />
        </Modal>
      )}
      {modal === 'generals' && <GeneralsModal state={state} onClose={() => setModal(null)} onPickCity={setSelected} />}
      {modal === 'cities' && <CitiesModal state={state} onClose={() => setModal(null)} onPickCity={setSelected} />}
      {modal === 'chronicle' && <ChronicleModal state={state} onClose={() => setModal(null)} />}
      {modal === 'factions' && <FactionsModal state={state} onClose={() => setModal(null)} />}
      {modal === 'battles' && <BattlesModal state={state} onClose={() => setModal(null)} />}
      {modal === 'help' && <HelpModal onClose={() => setModal(null)} />}
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
