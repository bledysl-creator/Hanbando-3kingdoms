// 도시 패널: 선택한 도시의 정보와 명령(내정·군사·인재)
import { useEffect, useMemo, useState } from 'react';
import type { Command, GameState, General } from '../../core';
import { BALANCE, discordChance, rumorChance, scoutChance, visibleTroops, withinTwo, WEATHER_ICON, WEATHER_LABEL, estimateRatio, freeGeneralsIn, generalsIn, isConnectedToCapital, marchOpinions, neighbors, obedience, statusOf, supplyRatio } from '../../core';
import type { MenuKey } from './Hud';
import { Portrait } from './Portrait';
import { REGIONS } from '../../map/geo';

const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
const TERRAIN = { plain: '평지', mountain: '산악', coast: '해안', river: '강변' } as const;
const ROAD = { land: '육로', river: '도하', pass: '고개', sea: '해로' } as const;

interface Props {
  state: GameState;
  cityId: string;
  tab: MenuKey;
  onTab: (t: MenuKey) => void;
  onCommand: (cmd: Command) => void;
  onClose: () => void;
  onTargetHover: (ids: string[]) => void;
}

export function CityPanel({ state, cityId, tab, onTab, onCommand, onClose, onTargetHover }: Props) {
  const c = state.cities[cityId];
  const pf = state.playerFactionId;
  const owner = c.owner ? state.factions[c.owner] : null;
  const mine = !!pf && c.owner === pf;
  const gens = generalsIn(state, c.id).filter((g) => g.faction === c.owner);
  const free = freeGeneralsIn(state, c.id);
  const ready = gens.filter((g) => !g.acted);
  const [gid, setGid] = useState<string>('');
  useEffect(() => {
    if (!ready.find((g) => g.id === gid)) setGid(ready[0]?.id ?? '');
  }, [cityId, ready.map((g) => g.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const actor = gid ? state.generals[gid] : undefined;
  const ns = useMemo(() => neighbors(state, c.id), [state, c.id]);

  return (
    <aside className="city-panel panel">
      <button className="close" onClick={onClose}>✕</button>
      <h2>
        <span className="badge" style={{ background: owner?.color ?? '#777' }}>{owner?.hanja ?? '中'}</span> {c.name}
        <small> {TERRAIN[c.terrain]}{c.fortress ? ' · 산성' : ''}{c.port ? ' · 항구' : ''}</small>
      </h2>
      <div className="stat-grid">
        <span>세력</span><b>{owner ? `${owner.name}(${owner.hanja})` : '중립'}</b>
        <span>병력</span><b>{(() => { const v = visibleTroops(state, pf, c.id); return v.value === null ? '알 수 없음 (첩보 필요)' : v.exact ? fmt(v.value) : `약 ${fmt(v.value)} (${v.age}턴 전 첩보)`; })()}</b>
        <span>인구</span><b>{fmt(c.population)}</b>
        <span>민심</span><b>{Math.round(c.order)}</b>
        <Bar label="농업" v={c.agriculture} />
        <Bar label="상업" v={c.commerce} />
        <Bar label="성벽" v={c.wall} />
        <Bar label="사기" v={c.morale} />
        <Bar label="훈련" v={c.training} />
        <span>특산</span><b>목재 {c.wood} · 철 {c.iron}</b>
        <span>날씨</span><b>{WEATHER_ICON[state.weather[c.id] ?? 'clear']} {WEATHER_LABEL[state.weather[c.id] ?? 'clear']}</b>
      </div>

      <p className="regions-line"><span className="muted">관할 시·군 {REGIONS.filter((r) => r.parent === c.id).length}곳:</span> {REGIONS.filter((r) => r.parent === c.id).map((r) => r.name).join(' · ')}</p>
      <h4>장수 ({gens.length})</h4>
      <div className="gen-row">
        {gens.map((g) => (
          <div key={g.id} className={`gen-chip ${g.acted ? 'acted' : ''}`} title={`통${g.stats.leadership} 무${g.stats.war} 지${g.stats.intellect} 정${g.stats.politics} 매${g.stats.charm} · 충성 ${g.loyalty}`}>
            <Portrait general={g} color={owner?.color ?? '#777'} size={36} />
            <span>{g.name}</span>
          </div>
        ))}
        {gens.length === 0 && <span className="muted">없음</span>}
      </div>
      {free.length > 0 && (
        <p className="muted">재야 인재: {free.map((g) => g.name).join(', ')}</p>
      )}

      {mine && (
        <>
          <div className="tabs">
            {(['내정', '군사', '인재', '계략'] as MenuKey[]).map((t) => (
              <button key={t} className={tab === t ? 'active' : ''} onClick={() => onTab(t)}>{t}</button>
            ))}
          </div>
          {ready.length === 0 ? (
            <p className="muted">이번 턴에 행동할 수 있는 장수가 없습니다.</p>
          ) : (
            <label className="field">
              실행 장수
              <select value={gid} onChange={(e) => setGid(e.target.value)}>
                {ready.map((g) => (
                  <option key={g.id} value={g.id}>{g.name} (통{g.stats.leadership} 무{g.stats.war} 지{g.stats.intellect} 정{g.stats.politics} 매{g.stats.charm})</option>
                ))}
              </select>
            </label>
          )}
          {actor && tab === '내정' && <DomesticTab actor={actor} onCommand={onCommand} />}
          {actor && tab === '군사' && <MilitaryTab state={state} actor={actor} cityTroops={c.troops} population={c.population} neighbors={ns} onCommand={onCommand} onTargetHover={onTargetHover} />}
          {actor && tab === '계략' && <IntrigueTab state={state} actor={actor} onCommand={onCommand} />}
          {actor && tab === '인재' && <TalentTab state={state} actor={actor} free={free} onCommand={onCommand} />}
        </>
      )}
      {!mine && pf && (
        <p className="muted">
          {ns.some((n) => n.city.owner === pf) ? '인접한 우리 도시에서 군사 → 출진으로 공격할 수 있습니다.' : '우리 영토와 인접하지 않은 도시입니다.'}
        </p>
      )}
    </aside>
  );
}

function Bar({ label, v }: { label: string; v: number }) {
  return (
    <>
      <span>{label}</span>
      <div className="bar"><div style={{ width: `${v}%` }} /><em>{v}</em></div>
    </>
  );
}

function DomesticTab({ actor, onCommand }: { actor: General; onCommand: (c: Command) => void }) {
  const gain = Math.max(1, Math.round(2 + actor.stats.politics / 15));
  return (
    <div className="actions">
      <button onClick={() => onCommand({ type: 'develop', generalId: actor.id, field: 'agriculture' })}>🌾 농업 개발 <small>금 {BALANCE.developGold} · +{gain}</small></button>
      <button onClick={() => onCommand({ type: 'develop', generalId: actor.id, field: 'commerce' })}>🪙 상업 개발 <small>금 {BALANCE.developGold} · +{gain}</small></button>
      <button onClick={() => onCommand({ type: 'develop', generalId: actor.id, field: 'wall' })}>🧱 성벽 보수 <small>금 {BALANCE.wallGold} · 목재 {BALANCE.wallWood} · +{gain}</small></button>
    </div>
  );
}

function MilitaryTab({ state, actor, cityTroops, population, neighbors: ns, onCommand, onTargetHover }: {
  state: GameState; actor: General; cityTroops: number; population: number;
  neighbors: ReturnType<typeof neighbors>; onCommand: (c: Command) => void; onTargetHover: (ids: string[]) => void;
}) {
  const pf = state.playerFactionId!;
  const maxConscript = Math.floor(population * BALANCE.conscriptMaxPopRatio);
  const [amount, setAmount] = useState(Math.min(5000, maxConscript));
  const maxOut = Math.max(0, cityTroops - 500);
  const [troops, setTroops] = useState(Math.round(maxOut * 0.7));
  const enemies = ns.filter((n) => n.city.owner !== pf);
  const friends = ns.filter((n) => n.city.owner === pf);
  const [target, setTarget] = useState(enemies[0]?.city.id ?? '');
  const [dest, setDest] = useState(friends[0]?.city.id ?? '');
  useEffect(() => { onTargetHover(target ? [target] : []); return () => onTargetHover([]); }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  const supply = supplyRatio(state, pf);
  const isolated = !isConnectedToCapital(state, pf, actor.city);
  const city = state.cities[actor.city];
  return (
    <div className="actions">
      {(supply < 1 || isolated) && (
        <p className="warn-line">{supply < 1 ? `⚠ 군량 보급 ${Math.round(supply * 100)}% — 출진 시 공격력 감소. ` : ''}{isolated ? '⚠ 본거지와 끊긴 고립 도시 — 출진 시 −20%' : ''}</p>
      )}
      <div className="sub">
        <b>훈련</b> <small>곡 {Math.ceil(city.troops * BALANCE.trainFood).toLocaleString()} · 훈련 +{Math.max(3, Math.round(4 + actor.stats.leadership / 10))} · 사기 +3</small>
        <button disabled={city.training >= 100} onClick={() => onCommand({ type: 'train', generalId: actor.id })}>🎯 병사 훈련 (현재 {city.training})</button>
      </div>
      <div className="sub">
        <b>징병</b> <small>금 {Math.ceil(amount * BALANCE.conscriptGoldPerTroop)} · 철 {Math.ceil(amount * BALANCE.conscriptIronPerTroop)} · 인구 −{amount.toLocaleString()}</small>
        <input type="range" min={0} max={maxConscript} step={500} value={amount} onChange={(e) => setAmount(+e.target.value)} />
        <button disabled={amount < 100} onClick={() => onCommand({ type: 'conscript', generalId: actor.id, amount })}>🛡️ {amount.toLocaleString()}명 징병</button>
        <p className="hint">병사도 결국 백성입니다. 징병하면 생산 인구와 민심이 줄고, 신병이 섞여 훈련도·사기가 내려갑니다.</p>
      </div>
      <div className="sub">
        <b>출진</b>
        {enemies.length === 0 ? <p className="muted">인접한 적 도시가 없습니다.</p> : (
          <>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {enemies.map((n) => (
                <option key={n.city.id} value={n.city.id}>
                  {n.city.name} ({n.city.owner ? state.factions[n.city.owner].name : '중립'} · 병력 {n.city.troops.toLocaleString()} · {ROAD[n.road.type]})
                </option>
              ))}
            </select>
            <input type="range" min={0} max={maxOut} step={500} value={Math.min(troops, maxOut)} onChange={(e) => setTroops(+e.target.value)} />
            {target && (() => {
              const ratio = estimateRatio(state, actor, city, state.cities[target], Math.min(troops, maxOut));
              const ops = marchOpinions(state, city.id, ratio, supply < 1, statusOf(state, pf, state.cities[target].owner ?? '') !== 'war');
              return (
                <div className="council">
                  <div className="muted small">예상 승산 <b className={ratio >= 1 ? 'good' : 'bad'}>{ratio.toFixed(2)}배</b> · {actor.name}의 복종도 {obedience(state, actor)}</div>
                  {ops.map((o) => (
                    <div key={o.generalId} className={`op ${o.stance}`}><b>{state.generals[o.generalId].name}</b> “{o.text}”</div>
                  ))}
                </div>
              );
            })()}
            <button disabled={troops < 1000} onClick={() => onCommand({ type: 'march', generalId: actor.id, toCityId: target, troops })}>⚔️ {Math.min(troops, maxOut).toLocaleString()}명 출진</button>
            <p className="hint">군량 {Math.ceil(Math.min(troops, maxOut) * BALANCE.foodPerTroop).toLocaleString()} 소모. 도하·고개·겨울은 공격에 불리합니다.</p>
          </>
        )}
      </div>
      <div className="sub">
        <b>이동</b>
        {friends.length === 0 ? <p className="muted">인접한 아군 도시가 없습니다.</p> : (
          <>
            <select value={dest} onChange={(e) => setDest(e.target.value)}>
              {friends.map((n) => <option key={n.city.id} value={n.city.id}>{n.city.name} (병력 {n.city.troops.toLocaleString()})</option>)}
            </select>
            <button onClick={() => onCommand({ type: 'transfer', generalId: actor.id, toCityId: dest, troops: Math.min(troops, maxOut) })}>🚶 장수 + 병력 {Math.min(troops, maxOut).toLocaleString()}명 이동</button>
          </>
        )}
      </div>
    </div>
  );
}

function TalentTab({ state, actor, free, onCommand }: { state: GameState; actor: General; free: General[]; onCommand: (c: Command) => void }) {
  const pf = state.playerFactionId!;
  const mine = Object.values(state.generals).filter((g) => g.alive && g.faction === pf && g.city === actor.city && g.id !== state.factions[pf].rulerId);
  return (
    <div className="actions">
      <div className="sub">
        <b>등용</b>
        {free.length === 0 ? <p className="muted">이 도시에 재야 장수가 없습니다.</p> : free.map((t) => (
          <button key={t.id} onClick={() => onCommand({ type: 'recruit', generalId: actor.id, targetId: t.id })}>
            🤝 {t.name} 등용 <small>통{t.stats.leadership} 무{t.stats.war} 지{t.stats.intellect} 정{t.stats.politics} 매{t.stats.charm}</small>
          </button>
        ))}
      </div>
      <div className="sub">
        <b>포상</b> <small>금 {BALANCE.rewardGold} → 충성 +{BALANCE.rewardLoyalty}</small>
        {mine.length === 0 ? <p className="muted">포상할 장수가 없습니다.</p> : mine.map((t) => (
          <button key={t.id} onClick={() => onCommand({ type: 'reward', generalId: actor.id, targetId: t.id })}>🎁 {t.name} (충성 {t.loyalty})</button>
        ))}
      </div>
    </div>
  );
}

function IntrigueTab({ state, actor, onCommand }: { state: GameState; actor: General; onCommand: (c: Command) => void }) {
  const pf = state.playerFactionId!;
  const here = actor.city;
  const scoutable = Object.values(state.cities).filter((x) => x.owner !== pf && withinTwo(state, here, x.id));
  const adjacent = neighbors(state, here).map((n) => n.city).filter((x) => x.owner !== pf);
  const victims = Object.values(state.generals).filter((g) => g.alive && g.faction && g.faction !== pf && (g.city === here || adjacent.some((a) => a.id === g.city)));
  const [sc, setSc] = useState(scoutable[0]?.id ?? '');
  const [ru, setRu] = useState(adjacent[0]?.id ?? '');
  const [vi, setVi] = useState(victims[0]?.id ?? '');
  return (
    <div className="actions">
      <div className="sub">
        <b>첩보</b> <small>금 {BALANCE.scoutGold} · 두 칸 이내 · 실패하면 오보를 받을 수도 있음</small>
        {scoutable.length === 0 ? <p className="muted">정찰할 도시가 없습니다.</p> : (<>
          <select value={sc} onChange={(e) => setSc(e.target.value)}>{scoutable.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.owner ? state.factions[x.owner].name : '중립'})</option>)}</select>
          <button onClick={() => onCommand({ type: 'scout', generalId: actor.id, cityId: sc })}>🕵️ 첩자 파견 (정확도 {Math.round(scoutChance(state, actor, sc || scoutable[0].id) * 100)}%)</button>
        </>)}
      </div>
      <div className="sub">
        <b>유언비어</b> <small>금 {BALANCE.rumorGold} · 인접 도시 민심 −{BALANCE.rumorOrder}, 사기 −{BALANCE.rumorMorale}</small>
        {adjacent.length === 0 ? <p className="muted">인접한 적 도시가 없습니다.</p> : (<>
          <select value={ru} onChange={(e) => setRu(e.target.value)}>{adjacent.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <button onClick={() => onCommand({ type: 'rumor', generalId: actor.id, cityId: ru })}>📣 유언비어 ({Math.round(rumorChance(state, actor, ru || adjacent[0].id) * 100)}%)</button>
        </>)}
      </div>
      <div className="sub">
        <b>이간</b> <small>금 {BALANCE.discordGold} · 적 장수 충성 −10~20 (군주·의형제 불가)</small>
        {victims.length === 0 ? <p className="muted">이간할 장수가 없습니다.</p> : (<>
          <select value={vi} onChange={(e) => setVi(e.target.value)}>{victims.map((g) => <option key={g.id} value={g.id}>{g.name} ({state.factions[g.faction!].name} · {state.cities[g.city].name})</option>)}</select>
          <button onClick={() => onCommand({ type: 'discord', generalId: actor.id, targetId: vi })}>🗡️ 이간 ({Math.round(discordChance(state, actor, state.generals[vi || victims[0].id]) * 100)}%)</button>
        </>)}
      </div>
    </div>
  );
}
