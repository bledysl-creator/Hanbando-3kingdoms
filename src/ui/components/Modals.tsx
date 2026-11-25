// 목록·보고서 창: 장수, 도시, 연표, 세력 정보, 전투 보고, 설정/저장, 도움말
import { useEffect, useState, type ReactNode } from 'react';
import type { BattleReport, GameState } from '../../core';
import { BALANCE, TACTICS, MEMORY_LABEL, armyReport, SEASONS, visibleTroops, writeChronicle, citiesOf, factionPower, generalsOf, obedience, statusOf, totalTroops } from '../../core';
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

export function GeneralDetail({ state, id, onBack, onPickCity }: { state: GameState; id: string; onBack: () => void; onPickCity: (id: string) => void }) {
  const g = state.generals[id];
  const f = g.faction ? state.factions[g.faction] : null;
  const rels = state.relations.filter((r) => r.a === id || r.b === id);
  const P = [['야망', g.persona.ambition], ['의리', g.persona.righteousness], ['탐욕', g.persona.greed], ['자존심', g.persona.pride], ['위험감수', g.persona.risk]] as const;
  const S = [['통솔', g.stats.leadership], ['무력', g.stats.war], ['지력', g.stats.intellect], ['정치', g.stats.politics], ['매력', g.stats.charm]] as const;
  const REL = { sworn: '의형제', trust: '신뢰', enmity: '원한' } as const;
  return (
    <div className="gen-detail">
      <div className="gd-head">
        <Portrait general={g} color={f?.color ?? '#777'} size={72} />
        <div>
          <h3>{g.name} <small className="muted">{g.hanja} · {state.year - g.birth}세</small></h3>
          <div>{f ? `${f.name}(${f.hanja})` : '재야'} · {state.cities[g.city].name}{g.faction ? ` · 충성 ${g.loyalty} · 복종도 ${obedience(state, g)}` : ''}</div>
        </div>
      </div>
      <div className="gd-cols">
        <div><h4>능력</h4>{S.map(([k, v]) => <div key={k} className="gd-bar"><span>{k}</span><div className="bar"><div style={{ width: `${v}%` }} /><em>{v}</em></div></div>)}</div>
        <div><h4>성격</h4>{P.map(([k, v]) => <div key={k} className="gd-bar"><span>{k}</span><div className="bar persona"><div style={{ width: `${v}%` }} /><em>{v}</em></div></div>)}</div>
      </div>
      <h4>인간관계</h4>
      {rels.length === 0 ? <p className="muted small">특별한 관계 없음</p> : <p>{rels.map((r) => { const o = r.a === id ? r.b : r.a; return <span key={o} className={`rel ${r.type}`}>{state.generals[o]?.name} ({REL[r.type]})</span>; })}</p>}
      <h4>기억</h4>
      {(g.memories ?? []).length === 0 ? <p className="muted small">아직 기억할 만한 일이 없음</p> : (
        <ul className="small">{[...(g.memories ?? [])].reverse().map((m, i) => <li key={i}>{m.turn}턴 — {state.generals[m.with]?.name ?? ''} {MEMORY_LABEL[m.kind]}</li>)}</ul>
      )}
      <div className="actions row"><button onClick={onBack}>← 목록</button><button onClick={() => onPickCity(g.city)}>도시로 이동</button></div>
    </div>
  );
}

export function GeneralsModal({ state, onClose, onPickCity }: { state: GameState; onClose: () => void; onPickCity: (id: string) => void }) {
  const [filter, setFilter] = useState<'mine' | 'free' | 'all'>('mine');
  const [detail, setDetail] = useState<string | null>(null);
  if (detail) return <Modal title="장수 정보" onClose={onClose}><GeneralDetail state={state} id={detail} onBack={() => setDetail(null)} onPickCity={(c) => { onPickCity(c); onClose(); }} /></Modal>;
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
              <tr key={g.id} onClick={() => setDetail(g.id)}>
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
              <td>{(() => { const v = visibleTroops(state, state.playerFactionId, c.id); return v.value === null ? '?' : v.exact ? fmt(v.value) : `약 ${fmt(v.value)}`; })()}</td><td>{fmt(c.population)}</td><td>{c.agriculture}</td><td>{c.commerce}</td><td>{c.wall}</td><td>{Math.round(c.order)}</td>
              <td>{Object.values(state.generals).filter((g) => g.alive && g.city === c.id && g.faction === c.owner).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

export function TacticsModal({ state, onClose }: { state: GameState; onClose: () => void }) {
  const fid = state.playerFactionId;
  const mine = fid ? generalsOf(state, fid) : [];
  const top = (key: 'intellect' | 'war' | 'leadership') => [...mine].sort((a, b) => b.stats[key] - a.stats[key]).slice(0, 3).map((g) => `${g.name}(${g.stats[key]})`).join(', ');
  return (
    <Modal title="계책 — 출진할 때 고르는 전술" onClose={onClose}>
      <p className="muted">도시 패널 → 군사 → 출진에서 계책을 고르면 성공률이 표시됩니다. 성공하면 공격력이 크게 오르고, 실패하면 10% 손해를 봅니다. 수비 장수의 지력이 높으면 간파당하기 쉽습니다.</p>
      {TACTICS.map((t) => (
        <div key={t.id} className="sub">
          <b>{t.icon} {t.name}</b> <small>성공 시 공격력 +{Math.round((BALANCE.tacticBonus[t.id] - 1) * 100)}%</small>
          <p>{t.desc}</p>
        </div>
      ))}
      <p className="muted small">아군 지력 상위: {top('intellect') || '—'} · 무력 상위: {top('war') || '—'} · 통솔 상위: {top('leadership') || '—'}</p>
    </Modal>
  );
}

export function ArmyModal({ state, onClose, onPickCity }: { state: GameState; onClose: () => void; onPickCity: (id: string) => void }) {
  const fid = state.playerFactionId;
  const rows = fid ? armyReport(state, fid) : [];
  const total = rows.reduce((a, r) => a + r.troops, 0);
  const front = rows.filter((r) => r.role === 'front');
  return (
    <Modal title="부대 — 아군 병력 배치와 접경 위협" onClose={onClose} wide>
      <p className="muted">총병력 {fmt(total)} · 전선 도시 {front.length}곳 · 후방 {rows.length - front.length}곳. 위협 = 접한 적 병력 ÷ 아군 병력 (첩보가 없으면 추정치).</p>
      <table className="table">
        <thead><tr><th>도시</th><th>구분</th><th>병력</th><th>사기</th><th>훈련</th><th>전선</th><th>장수</th><th>접경 적</th><th>위협</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.cityId} onClick={() => { onPickCity(r.cityId); onClose(); }} className={r.threatRatio > 1 ? 'danger-row' : ''}>
              <td>{r.name}{r.isolated ? ' ⛓고립' : ''}</td>
              <td>{r.role === 'front' ? '전선' : '후방'}</td>
              <td>{fmt(r.troops)}</td><td>{r.morale}</td><td>{r.training}</td>
              <td>{state.cities[r.cityId].port ? `⛵${state.cities[r.cityId].ships ?? 0}` : '—'}</td>
              <td>{r.generals.join(', ') || '—'}</td>
              <td>{r.threats.filter((t) => t.owner).map((t) => `${t.name}(${t.troops === null ? '?' : (t.exact ? '' : '약 ') + fmt(t.troops)})`).join(', ') || '—'}</td>
              <td>{r.role === 'front' ? `${r.threatRatio > 1 ? '⚠ ' : ''}${r.threatRatio.toFixed(2)}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

export function ChronicleModal({ state, onClose }: { state: GameState; onClose: () => void }) {
  const entries = [...state.log].reverse();
  const [tab, setTab] = useState<'log' | 'book'>('log');
  const book = tab === 'book' ? writeChronicle(state) : '';
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([writeChronicle(state)], { type: 'text/markdown' }));
    a.download = `한반도삼국지-역사서-${state.year}.md`;
    a.click();
  };
  return (
    <Modal title="연표 — 이번 판의 한반도 역사" onClose={onClose}>
      <div className="tabs">
        <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>천하 동향</button>
        <button className={tab === 'book' ? 'active' : ''} onClick={() => setTab('book')}>역사서</button>
        <button onClick={download}>📥 역사서 내보내기 (.md)</button>
      </div>
      {tab === 'book' ? (
        <div className="book">{book.split('\n').map((l, i) => l.startsWith('# ') ? <h2 key={i}>{l.slice(2)}</h2> : l.startsWith('## ') ? <h3 key={i}>{l.slice(3)}</h3> : l.startsWith('- ') ? <p key={i} className="ev">· {l.slice(2)}</p> : l === '---' ? <hr key={i} /> : l ? <p key={i}>{l}</p> : null)}</div>
      ) : (
      <ol className="chronicle">
        {entries.map((l, i) => (
          <li key={i} className={l.kind}><span className="when">{l.year}년 {SEASONS[l.season]}</span> {l.text}</li>
        ))}
      </ol>
      )}
    </Modal>
  );
}

export function FactionsModal({ state, onClose }: { state: GameState; onClose: () => void }) {
  const fs = Object.values(state.factions).sort((a, b) => factionPower(state, b.id) - factionPower(state, a.id));
  return (
    <Modal title="천하 정세" onClose={onClose}>
      <table className="table">
        <thead><tr><th>세력</th><th>군주</th><th>세력력</th><th>도시</th><th>장수</th><th>병력</th><th>맹약</th></tr></thead>
        <tbody>
          {fs.map((f) => (
            <tr key={f.id} className={f.alive ? '' : 'dead'}>
              <td><span className="badge" style={{ background: f.color }}>{f.hanja}</span> {f.name}{f.alive ? '' : ' (멸망)'}</td>
              <td>{state.generals[f.rulerId].name}</td>
              <td>{f.alive ? fmt(factionPower(state, f.id)) : '-'}</td>
              <td>{citiesOf(state, f.id).length}</td>
              <td>{generalsOf(state, f.id).length}</td>
              <td>{fmt(totalTroops(state, f.id))}</td>
              <td className="small">{Object.values(state.factions).filter((o) => o.id !== f.id && statusOf(state, f.id, o.id) !== 'war').map((o) => `${o.hanja}${statusOf(state, f.id, o.id) === 'truce' ? '휴전' : '동맹'}`).join(' ') || '-'}</td>
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
        <li><b>계략·첩보</b>: 우리 땅과 맞닿지 않은 적 도시의 병력은 보이지 않습니다(전장의 안개). 첩자를 보내 알아내되, 실패하면 적이 흘린 가짜 정보를 받을 수 있습니다. 유언비어로 적 도시의 민심·사기를, 이간으로 적 장수의 충성을 떨어뜨립니다.</li>
        <li><b>생애</b>: 장수는 나이를 먹고 세상을 떠나며, 새 인물(조비·사마의·육손·강유 등)이 때가 되면 등장합니다. 군주가 죽으면 후계자가 뒤를 잇습니다. 세력이 망해도 군주가 살아 있으면 수비가 약한 도시로 잠행해 의병을 일으켜 재기할 수 있습니다.</li>
        <li><b>장수 인격</b>: 장수마다 야망·의리·자존심·위험감수 성향이 있어 복종도가 다릅니다. 승산이 낮거나 충성이 낮으면 출진 명령을 거부할 수 있고(의형제·군주는 항상 따름), 출진 전에 장수들이 의견을 냅니다. 장수는 포상·패전·등용을 기억합니다. 장수 목록에서 이름을 누르면 상세 정보가 보입니다.</li>
        <li><b>사기·훈련·보급</b>: 병력의 질이 전투력을 바꿉니다. 훈련으로 올리고, 징병한 신병은 훈련도를 낮춥니다. 승리하면 사기가 오르고 패배·굶주림에 떨어집니다. 군량이 한 계절치보다 적으면 보급 부족, 본거지와 끊긴 도시는 고립되어 공격력이 줄어듭니다.</li>
        <li><b>날씨</b>: 계절과 지역에 따라 도시마다 날씨가 바뀝니다. 폭우·태풍·폭설인 도시를 공격하면 불리하고(특히 강을 건널 때), 태풍은 농업·성벽, 가뭄은 가을 수확, 한파·폭설은 병력을 깎습니다. 지력 높은 장수는 안개를 기습에 씁니다.</li>
        <li><b>군량</b>: 병사는 매 계절 곡식을 먹습니다. 부족하면 탈영이 일어납니다.</li>
        <li><b>외교</b>: 사신과 예물로 휴전(2년)·동맹을 제안합니다. 맹약 중인 세력은 공격할 수 없고, 파기하면 의리 높은 장수가 실망합니다.</li>
        <li>지도는 마우스 휠로 확대, 드래그로 이동합니다. 부대·계책은 준비 중입니다.</li>
      </ul>
    </Modal>
  );
}

import type { SimProgress } from '../../sim/simWorker';
import { DATA } from '../../core';

export function SimStatsModal({ onClose }: { onClose: () => void }) {
  const [p, setP] = useState<SimProgress | null>(null);
  const [runs, setRuns] = useState(30);
  const [w, setW] = useState<Worker | null>(null);
  useEffect(() => () => w?.terminate(), [w]);
  const start = () => {
    w?.terminate();
    const worker = new Worker(new URL('../../sim/simWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => setP(e.data);
    worker.postMessage({ runs, maxTurns: 160, seed: Math.floor(Date.now() % 100000) });
    setW(worker);
    setP(null);
  };
  const facs = DATA.factions;
  const avgTurn = p && p.turns.length ? (p.turns.reduce((a, b) => a + b, 0) / p.turns.length).toFixed(1) : '-';
  const hot = p ? Object.entries(p.battles).sort((a, b) => b[1] - a[1]).slice(0, 5) : [];
  return (
    <Modal title="관전 통계 — AI끼리 여러 판 돌려보기" onClose={onClose}>
      <div className="actions row">
        <select value={runs} onChange={(e) => setRuns(+e.target.value)}>{[10, 30, 100].map((n) => <option key={n} value={n}>{n}판</option>)}</select>
        <button className="primary" onClick={start}>시뮬레이션 시작 (최대 40년)</button>
      </div>
      {p && (
        <>
          <p className="muted">{p.done}/{p.runs}판 완료 · 통일까지 평균 {avgTurn}턴 · 장수 이탈 {p.defections}회 · 재기 {p.uprisings}회</p>
          <table className="table">
            <thead><tr><th>세력</th><th>통일 확률</th><th>생존율</th><th>평균 도시</th></tr></thead>
            <tbody>{facs.map((f) => (
              <tr key={f.id}>
                <td><span className="badge" style={{ background: f.color }}>{f.hanja}</span> {f.name}</td>
                <td><div className="bar"><div style={{ width: `${((p.wins[f.id] ?? 0) / p.done) * 100}%` }} /><em>{Math.round(((p.wins[f.id] ?? 0) / p.done) * 100)}%</em></div></td>
                <td>{Math.round(((p.survive[f.id] ?? 0) / p.done) * 100)}%</td>
                <td>{((p.cities[f.id] ?? 0) / p.done).toFixed(1)}</td>
              </tr>
            ))}</tbody>
          </table>
          <p className="small">가장 많이 주인이 바뀐 도시: {hot.map(([c, n]) => `${DATA.cities.find((x) => x.id === c)?.name} ${n}회`).join(', ')}</p>
        </>
      )}
      <p className="hint">밸런스는 감이 아니라 이런 자동 시뮬레이션 통계로 조정합니다 (Game.md 5-7).</p>
    </Modal>
  );
}
