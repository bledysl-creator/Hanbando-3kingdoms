// 화면 테두리 HUD: 상단 자원바, 군주 카드, 좌측 메뉴, 미니맵, 임무, 천하 동향, 하단 명령바, 턴 진행
import type { GameState } from '../../core';
import { citiesOf, factionPower, generalsOf, missionProgress, seasonLabel, totalTroops } from '../../core';
import { useState } from 'react';
import { KoreaMap } from '../../map/KoreaMap';
import { Portrait } from './Portrait';

const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

export function TopBar({ state, onHelp, onSettings, onMail, onTrophy }: { state: GameState; onHelp: () => void; onSettings: () => void; onMail: () => void; onTrophy: () => void }) {
  const f = state.playerFactionId ? state.factions[state.playerFactionId] : null;
  const seasonIcon = ['🌸', '☀️', '🍁', '❄️'][state.season];
  return (
    <header className="topbar">
      <div className="title">
        삼국지 한반도전 <button className="icon-btn round" title="도움말" onClick={onHelp}>?</button>
      </div>
      <MissionDropdown state={state} />
      <div className="date">{seasonIcon} {seasonLabel(state)}</div>
      {f ? (
        <div className="resources">
          <span title="금">🪙 금 {fmt(f.gold)}</span>
          <span title="곡식(군량)">🌾 곡 {fmt(f.food)}</span>
          <span title="목재">🪵 목재 {fmt(f.wood)}</span>
          <span title="철">⛓️ 철 {fmt(f.iron)}</span>
          <span title="총 병력">⚔️ 병력 {fmt(totalTroops(state, f.id))}</span>
        </div>
      ) : (
        <div className="resources"><span>관전 모드</span></div>
      )}
      <div className="top-icons">
        <button className="icon-btn" title="전투 보고" onClick={onMail}>✉️</button>
        <button className="icon-btn" title="세력 순위" onClick={onTrophy}>🏆</button>
        <button className="icon-btn" title="설정 · 저장" onClick={onSettings}>⚙️</button>
      </div>
    </header>
  );
}

export function RulerCard({ state }: { state: GameState }) {
  const fid = state.playerFactionId;
  if (!fid) return null;
  const f = state.factions[fid];
  const ruler = state.generals[f.rulerId];
  return (
    <div className="ruler-card panel">
      <Portrait general={ruler} color={f.color} size={84} />
      <div className="ruler-info">
        <div className="ruler-name"><span className="badge" style={{ background: f.color }}>{f.hanja}</span> {ruler.name}</div>
        <dl>
          <dt>세력력</dt><dd>{fmt(factionPower(state, fid))}</dd>
          <dt>영지</dt><dd>{citiesOf(state, fid).length}</dd>
          <dt>장수</dt><dd>{generalsOf(state, fid).length}</dd>
        </dl>
      </div>
    </div>
  );
}

export type MenuKey = '내정' | '군사' | '인재' | '외교' | '계략' | '정보';
const MENU: { key: MenuKey; icon: string; ready: boolean }[] = [
  { key: '내정', icon: '🏯', ready: true },
  { key: '군사', icon: '⚔️', ready: true },
  { key: '인재', icon: '👥', ready: true },
  { key: '외교', icon: '🤝', ready: true },
  { key: '계략', icon: '🗡️', ready: true },
  { key: '정보', icon: '📜', ready: true },
];

export function SideMenu({ active, onPick }: { active?: MenuKey | null; onPick: (k: MenuKey) => void }) {
  return (
    <nav className="side-menu">
      {MENU.map((m) => (
        <button key={m.key} className={`menu-btn ${active === m.key ? 'active' : ''}`} disabled={!m.ready} title={m.ready ? m.key : `${m.key} — 준비 중`} onClick={() => onPick(m.key)}>
          <span className="mi">{m.icon}</span> {m.key}
          {!m.ready && <small className="soon">준비 중</small>}
        </button>
      ))}
    </nav>
  );
}

export function MiniMap({ state }: { state: GameState }) {
  return (
    <div className="minimap panel">
      <KoreaMap state={state} mini />
    </div>
  );
}

/** v4.2.3 주요 임무: 제목 옆 펼침/접기 (펼침 여부 기억) */
export function MissionDropdown({ state }: { state: GameState }) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('hanbando.missionsOpen') === '1'; } catch { return false; } });
  if (!state.playerFactionId) return null;
  const done = state.missions.filter((m) => missionProgress(state, m).done).length;
  const toggle = () => setOpen((v) => { try { localStorage.setItem('hanbando.missionsOpen', v ? '0' : '1'); } catch { /* 저장 불가 */ } return !v; });
  return (
    <div className="mission-drop">
      <button className={`mission-btn ${open ? 'open' : ''}`} onClick={toggle} aria-expanded={open}>◈ 주요 임무 <b>{done}/{state.missions.length}</b> <span className="caret">{open ? '▲' : '▼'}</span></button>
      {open && <MissionPanel state={state} />}
    </div>
  );
}

export function MissionPanel({ state }: { state: GameState }) {
  if (!state.playerFactionId) return null;
  return (
    <div className="missions panel">
      <ul>
        {state.missions.map((m) => {
          const p = missionProgress(state, m);
          return (
            <li key={m.id} className={p.done ? 'done' : ''}>
              <span className="check">{p.done ? '☑' : '☐'}</span> {m.label}
              <span className="prog">({p.current}/{p.target})</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** v3.4 사건 종류별 아이콘 (글만 읽지 않아도 무슨 일인지 보이게) */
const EVENT_ICON: Record<string, string> = { capture: '⚔️', destroyed: '💀', rebel: '🔥', debut: '🌱', death: '🕯️', uprising: '🚩', plague: '🦠', fire: '🌲', harvest: '🌾', surrender: '🏳️', treaty: '🤝' };

export function EventLog({ state, onOpen }: { state: GameState; onOpen: () => void }) {
  const pf = state.playerFactionId;
  // 다른 세력의 일상 소식(수확 등)은 빼고, 우리 세력 소식과 전투·사건만 보여준다
  const recent = state.log.filter((l) => l.kind !== 'info' || !l.factionId || l.factionId === pf).slice(-4).reverse();
  return (
    <div className="event-log panel" onClick={onOpen} title="연표 열기">
      {recent.map((l, i) => (
        <div key={i} className={`log-line ${l.kind}`}>
          <span className="mark">{l.event ? EVENT_ICON[l.event] : '!'}</span> {l.text}
        </div>
      ))}
    </div>
  );
}

export type BarKey = '장수' | '도시' | '부대' | '계책' | '외교' | '연표';
const BAR: { key: BarKey; icon: string; ready: boolean }[] = [
  { key: '장수', icon: '🧑‍✈️', ready: true },
  { key: '도시', icon: '🏯', ready: true },
  { key: '부대', icon: '🚩', ready: true },
  { key: '계책', icon: '🖌️', ready: true },
  { key: '외교', icon: '🤝', ready: true },
  { key: '연표', icon: '📜', ready: true },
];

export function CommandBar({ onPick }: { onPick: (k: BarKey) => void }) {
  return (
    <div className="command-bar">
      {BAR.map((b) => (
        <button key={b.key} className="bar-btn" disabled={!b.ready} title={b.ready ? b.key : `${b.key} — 준비 중`} onClick={() => onPick(b.key)}>
          <span className="bi">{b.icon}</span>
          <span>{b.key}</span>
        </button>
      ))}
    </div>
  );
}

export function TurnButton({ onClick, disabled, label = '턴 진행' }: { onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <button className="turn-btn" onClick={onClick} disabled={disabled}>
      <span>{label}</span>
      <span className="arrow">➜</span>
    </button>
  );
}
