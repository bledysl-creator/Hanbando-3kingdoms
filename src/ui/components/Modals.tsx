// 목록·보고서 창: 장수, 도시, 연표, 세력 정보, 전투 보고, 설정/저장, 도움말
import { useEffect, useState, type ReactNode } from 'react';
import type { BattleReport, GameState } from '../../core';
import { SEASONS, citiesOf, factionPower, generalsOf, totalTroops } from '../../core';
import { exportJson, indexedDbRepo, migrate, type SaveMeta } from '../../save/saveRepository';
import { Portrait } from './Portrait';

const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className={`modal panel ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <header><h2>{title}</h2><button className="close" onClick={onClose}>✕</button></header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function GeneralsModal({ state, onClose, onPickCity }: { state: GameState; onClose: () => void; onPickCity: (id: string) => void }) {
  const [filter, setFilter] = useState<'mine' | 'free' | 'all'>('mine');
  const pf = state.playerFactionId;
  const list = Object.values(state.generals)
    .filter((g) => g.alive && (filter === 'all' || (filter === 'free' ? g.faction === null : g.faction === pf)))
    .sort((a, b) => b.stats.leadership + b.stats.war + b.stats.intellect - (a.stats.leadership + a.stats.war + a.stats.intellect));
  return (
    <Modal title="장수" onClose={onClose} wide>
      <div className="tabs">
        <button className={filter === 'mine' ? 'active' : ''} onClick={() => setFilter('mine')}>아군</button>
        <button className={filter === 'free' ? 'active' : ''} onClick={() => setFilter('free')}>재야</button>
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>전체</button>
      </div>
      <table className="table">
        <thead><tr><th></th><th>이름</th><th>세력</th><th>위치</th><th>통솔</th><th>무력</th><th>지력</th><th>정치</th><th>매력</th><th>충성</th><th>상태</th></tr></thead>
        <tbody>
          {list.map((g) => {
            const f = g.faction ? state.factions[g.faction] : null;
            return (
              <tr key={g.id} onClick={() => { onPickCity(g.city); onClose(); }}>
                <td><Portrait general={g} color={f?.color ?? '#777'} size={30} /></td>
                <td>{g.name} <small className="muted">{g.hanja}</small></td>
                <td>{f ? f.name : '재야'}</td>
                <td>{state.cities[g.city].name}</td>
                <td>{g.stats.leadership}</td><td>{g.stats.war}</td><td>{g.stats.intellect}</td><td>{g.stats.politics}</td><td>{g.stats.charm}</td>
                <td>{g.faction ? g.loyalty : '-'}</td>
                <td>{g.acted ? '행동 완료' : g.faction === pf ? '대기' : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
}

export function CitiesModal({ state, onClose, onPickCity }: { state: GameState; onClose: () => void; onPickCity: (id: string) => void }) {
  const [mineOnly, setMineOnly] = useState(true);
  const list = Object.values(state.cities).filter((c) => !mineOnly || c.owner === state.playerFactionId);
  return (
    <Modal title="도시" onClose={onClose} wide>
      <div className="tabs">
        <button className={mineOnly ? 'active' : ''} onClick={() => setMineOnly(true)}>아군 도시</button>
        <button className={!mineOnly ? 'active' : ''} onClick={() => setMineOnly(false)}>전체</button>
      </div>
      <table className="table">
        <thead><tr><th>도시</th><th>세력</th><th>병력</th><th>인구</th><th>농업</th><th>상업</th><th>성벽</th><th>민심</th><th>장수</th></tr></thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id} onClick={() => { onPickCity(c.id); onClose(); }}>
              <td>{c.name}{c.fortress ? ' 🏯' : ''}</td>
              <td>{c.owner ? state.factions[c.owner].name : '중립'}</td>
              <td>{fmt(c.troops)}</td><td>{fmt(c.population)}</td><td>{c.agriculture}</td><td>{c.commerce}</td><td>{c.wall}</td><td>{Math.round(c.order)}</td>
              <td>{Object.values(state.generals).filter((g) => g.alive && g.city === c.id && g.faction === c.owner).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

export function ChronicleModal({ state, onClose }: { state: GameState; onClose: () => void }) {
  const entries = [...state.log].reverse();
  return (
    <Modal title="연표 — 이번 판의 한반도 역사" onClose={onClose}>
      <ol className="chronicle">
        {entries.map((l, i) => (
          <li key={i} className={l.kind}><span className="when">{l.year}년 {SEASONS[l.season]}</span> {l.text}</li>
        ))}
      </ol>
    </Modal>
  );
}

export function FactionsModal({ state, onClose }: { state: GameState; onClose: () => void }) {
  const fs = Object.values(state.factions).sort((a, b) => factionPower(state, b.id) - factionPower(state, a.id));
  return (
    <Modal title="천하 정세" onClose={onClose}>
      <table className="table">
        <thead><tr><th>세력</th><th>군주</th><th>세력력</th><th>도시</th><th>장수</th><th>병력</th></tr></thead>
        <tbody>
          {fs.map((f) => (
            <tr key={f.id} className={f.alive ? '' : 'dead'}>
              <td><span className="badge" style={{ background: f.color }}>{f.hanja}</span> {f.name}{f.alive ? '' : ' (멸망)'}</td>
              <td>{state.generals[f.rulerId].name}</td>
              <td>{f.alive ? fmt(factionPower(state, f.id)) : '-'}</td>
              <td>{citiesOf(state, f.id).length}</td>
              <td>{generalsOf(state, f.id).length}</td>
              <td>{fmt(totalTroops(state, f.id))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

export function BattleReportView({ state, report }: { state: GameState; report: BattleReport }) {
  const att = state.factions[report.attackerFaction];
  const def = report.defenderFaction ? state.factions[report.defenderFaction] : null;
  return (
    <div className={`battle-report ${report.won ? 'won' : 'lost'}`}>
      <h3>{state.cities[report.fromCity].name} → {state.cities[report.toCity].name} : {report.won ? '함락' : '공격 실패'}</h3>
      <div className="vs">
        <div><b style={{ color: att.color }}>{att.name}</b> {state.generals[report.generalId].name}<br />병력 {fmt(report.attackerTroops)} · 손실 {fmt(report.attackerLoss)}</div>
        <div className="x">VS</div>
        <div><b style={{ color: def?.color }}>{def?.name ?? '중립'}</b><br />병력 {fmt(report.defenderTroops)} · 손실 {fmt(report.defenderLoss)}</div>
      </div>
      <h4>원인 분석</h4>
      <ul>{report.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
    </div>
  );
}

export function BattlesModal({ state, onClose }: { state: GameState; onClose: () => void }) {
  const list = [...state.lastBattles].reverse().slice(0, 12);
  return (
    <Modal title="전투 보고" onClose={onClose}>
      {list.length === 0 ? <p className="muted">아직 전투가 없습니다.</p> : list.map((r, i) => <BattleReportView key={i} state={state} report={r} />)}
    </Modal>
  );
}

export function SettingsModal({ state, onClose, onLoad, onNewGame }: { state: GameState; onClose: () => void; onLoad: (s: GameState) => void; onNewGame: () => void }) {
  const [slots, setSlots] = useState<SaveMeta[]>([]);
  const [msg, setMsg] = useState('');
  const refresh = () => indexedDbRepo.list().then(setSlots).catch((e) => setMsg(String(e)));
  useEffect(() => { refresh(); }, []);
  const save = async (slot: string) => { await indexedDbRepo.save(slot, state); setMsg(`슬롯 ${slot}에 저장했습니다.`); refresh(); };
  const load = async (slot: string) => { const s = await indexedDbRepo.load(slot); if (s) { onLoad(s); onClose(); } };
  const importFile = (file: File) => file.text().then((t) => { onLoad(migrate(JSON.parse(t))); onClose(); }).catch((e) => setMsg(`불러오기 실패: ${e.message}`));
  return (
    <Modal title="설정 · 저장" onClose={onClose}>
      <h4>저장 슬롯 (브라우저 IndexedDB)</h4>
      <table className="table">
        <tbody>
          {['auto', '1', '2', '3'].map((slot) => {
            const m = slots.find((x) => x.slot === slot);
            return (
              <tr key={slot}>
                <td>{slot === 'auto' ? '자동 저장' : `슬롯 ${slot}`}</td>
                <td className="muted">{m ? `${m.year}년 ${SEASONS[m.season]} · ${new Date(m.savedAt).toLocaleString('ko-KR')}` : '비어 있음'}</td>
                <td>{slot !== 'auto' && <button onClick={() => save(slot)}>저장</button>}</td>
                <td><button disabled={!m} onClick={() => load(slot)}>불러오기</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="actions row">
        <button onClick={() => exportJson(state)}>📤 JSON 내보내기</button>
        <label className="file-btn">📥 JSON 불러오기<input type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} /></label>
        <button onClick={() => { onNewGame(); onClose(); }}>🆕 타이틀로</button>
      </div>
      {msg && <p className="hint">{msg}</p>}
    </Modal>
  );
}

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="도움말" onClose={onClose}>
      <ul className="help">
        <li><b>목표</b>: 한반도 24개 도시를 모두 차지하면 통일입니다. 1턴 = 1계절.</li>
        <li><b>도시 클릭</b> → 오른쪽 도시 패널에서 내정·군사·인재 명령. 장수 1명은 한 턴에 한 번 행동합니다.</li>
        <li><b>내정</b>: 농업(가을 수확 곡식) · 상업(매 계절 금) · 성벽(수비력). 정치가 높은 장수가 효과적.</li>
        <li><b>군사</b>: 징병(금·철 소모, 인구·민심 감소), 출진(인접 도시 공격, 군량 소모), 이동.</li>
        <li><b>지형</b>: 강을 건너는 도하 공격, 고개, 해로, 겨울 행군은 불리. 산성·산악 도시는 수비 유리.</li>
        <li><b>인재</b>: 재야 장수 등용(매력), 포상(충성 상승). 충성이 낮고 야망이 큰 장수는 떠날 수 있습니다.</li>
        <li><b>군량</b>: 병사는 매 계절 곡식을 먹습니다. 부족하면 탈영이 일어납니다.</li>
        <li>지도는 마우스 휠로 확대, 드래그로 이동합니다. 외교·계략·부대·계책은 준비 중입니다.</li>
      </ul>
    </Modal>
  );
}
