// 도시 패널: 선택한 도시의 정보와 명령(내정·군사·인재)
import { useEffect, useMemo, useState } from 'react';
import type { Command, GameState, General, TacticKind } from '../../core';
import { BALANCE, DATA, foodPrice, governorOf, reliefFood, TACTICS, tacticChance, discordChance, rumorChance, scoutChance, visibleTroops, withinTwo, WEATHER_ICON, WEATHER_LABEL, estimateRatio, landmarksOfCity, minGarrison, minMarch, disbandPreview, freeGeneralsIn, generalsIn, isConnectedToCapital, marchOpinions, neighbors, obedience, statusOf, supplyRatio } from '../../core';
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
        {landmarksOfCity(c.id).length > 0 && (
          <div className="landmarks-line">{landmarksOfCity(c.id).map((l) => (l.type === 'port' ? '⚓' : '🏯') + l.name).join(' · ')}</div>
        )}
      </h2>
      <div className="stat-grid">
        <span>세력</span><b>{owner ? `${owner.name}(${owner.hanja})` : '중립'}</b>
        <span>병력</span><b>{(() => { const v = visibleTroops(state, pf, c.id); return v.value === null ? '알 수 없음 (첩보 필요)' : v.exact ? fmt(v.value) : `약 ${fmt(v.value)} (${v.age}턴 전 첩보)`; })()}</b>{(c.fire ?? 0) > 0 && <><span>산불</span><b className="bad">🔥 {c.fire}턴 — 인구·농지·목재 피해 중 (비가 오면 꺼짐)</b></>}{(c.epidemic ?? 0) > 0 && <><span>역병</span><b className="bad">🦠 {c.epidemic}턴 남음 — 인구·병력 감소 중</b></>}{c.port && <><span>전선</span><b>⛵ {c.ships ?? 0}척</b></>}
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

      {c.parent ? (
        <p className="regions-line"><span className="muted">{REGIONS.find((r) => r.id === c.id)?.province} · {c.seat ? '치소' : '속현'} · 옛 관할 {DATA.cities.find((x) => x.id === c.parent)?.name}</span></p>
      ) : (
        <p className="regions-line"><span className="muted">관할 시·군 {REGIONS.filter((r) => r.parent === c.id).length}곳:</span> {REGIONS.filter((r) => r.parent === c.id).map((r) => r.name).join(' · ')}</p>
      )}
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
          {actor && tab === '내정' && <DomesticTab state={state} cityId={c.id} actor={actor} onCommand={onCommand} />}
          {actor && tab === '군사' && <MilitaryTab key={`${c.id}:${actor.id}`} state={state} actor={actor} cityTroops={c.troops} population={c.population} neighbors={ns} onCommand={onCommand} onTargetHover={onTargetHover} />}
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

function DomesticTab({ state, cityId, actor, onCommand }: { state: GameState; cityId: string; actor: General; onCommand: (c: Command) => void }) {
  const gain = Math.max(1, Math.round(2 + actor.stats.politics / 15));
  const [amt, setAmt] = useState(10000);
  const [disband, setDisband] = useState(3000);
  const buy = foodPrice(state, cityId, 'buyFood');
  const sell = foodPrice(state, cityId, 'sellFood');
  const city = state.cities[cityId];
  return (
    <div className="actions">
      {(city.fire ?? 0) > 0 && (
        <button className="urgent" onClick={() => onCommand({ type: 'extinguish', generalId: actor.id })}>🧯 산불 진화 <small>금 {BALANCE.extinguishGold} · 민심 +2</small></button>
      )}
      <button className={(city.epidemic ?? 0) > 0 ? 'urgent' : ''} onClick={() => onCommand({ type: 'relief', generalId: actor.id })}>
        🍚 구휼 <small>곡 {reliefFood(state, cityId).toLocaleString()} · 민심 +{BALANCE.reliefOrder}{(city.epidemic ?? 0) > 0 ? ' · 역병 진정' : ''}</small>
      </button>
      <div className="sub">
        <b>시장</b> <small>곡식 1,000석 — 사기 금 {buy} · 팔기 금 {sell} (계절·상업·항구에 따라 변동)</small>
        <input type="range" min={1000} max={BALANCE.tradeMax} step={1000} value={amt} onChange={(e) => setAmt(+e.target.value)} />
        <div className="row2">
          <button onClick={() => onCommand({ type: 'trade', generalId: actor.id, action: 'buyFood', amount: amt })}>🛒 곡식 {amt.toLocaleString()}석 사기 <small>금 {Math.round((amt / 1000) * buy).toLocaleString()}</small></button>
          <button onClick={() => onCommand({ type: 'trade', generalId: actor.id, action: 'sellFood', amount: amt })}>💰 팔기 <small>금 +{Math.round((amt / 1000) * sell).toLocaleString()}</small></button>
        </div>
      </div>
      <div className="sub">
        <b>귀농</b> <small>병사를 고향으로 돌려보내 인구·민심을 회복</small>
        {(() => {
          const keep = minGarrison(state);
          const max = Math.max(0, city.troops - keep);
          const pv = disbandPreview(state, cityId, Math.min(disband, max));
          return (
            <>
              <TroopSlider value={pv.amount} max={max} step={state.mapScale === 'region' ? 100 : 500} total={city.troops} keep={keep} onChange={setDisband} />
              <div className="disband-preview">
                <span>😊 민심 <b>{city.order}</b> → <b className="good">{pv.orderAfter}</b> <small>(+{pv.orderGain})</small></span>
                <span>👪 인구 <b className="good">+{pv.amount.toLocaleString()}</b></span>
                <span>🍚 계절마다 군량 <b className="good">+{pv.foodSaved.toLocaleString()}</b></span>
                <span>🌾 가을 수확 <b className="good">+{pv.harvestGain.toLocaleString()}</b></span>
                <span className="wide">1년 동안 곡식 약 <b className="good">+{pv.yearFood.toLocaleString()}</b> (절약 4계절 + 수확)</span>
              </div>
              <button disabled={pv.amount < 100} onClick={() => onCommand({ type: 'disband', generalId: actor.id, amount: pv.amount })}>🏡 {pv.amount.toLocaleString()}명 귀농</button>
            </>
          );
        })()}
      </div>
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
  const keep = minGarrison(state);
  const least = minMarch(state);
  const step = state.mapScale === 'region' ? 100 : 500;
  const maxOut = Math.max(0, cityTroops - keep);
  const [tactic, setTactic] = useState<TacticKind | ''>('');
  const [troopsRaw, setTroops] = useState(Math.floor((maxOut * 0.7) / step) * step);
  const troops = Math.min(troopsRaw, maxOut);
  const [moveRaw, setMove] = useState(0);
  const moveTroops = Math.min(moveRaw, maxOut);
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
        {city.port && (
          <div className="ships-line">
            ⛵ 전선 <b>{city.ships ?? 0}</b>척 / {BALANCE.maxShipsPerCity}
            <button disabled={(city.ships ?? 0) >= BALANCE.maxShipsPerCity} onClick={() => onCommand({ type: 'buildShips', generalId: actor.id })}>
              전선 {BALANCE.shipsPerBuild}척 건조 <small>목재 {BALANCE.shipWood * BALANCE.shipsPerBuild} · 금 {BALANCE.shipGold * BALANCE.shipsPerBuild}{state.factions[pf].traits.includes('수군') ? ' (수군 −30%)' : ''}</small>
            </button>
            <p className="hint">바닷길 상륙은 전선이 많을수록 유리하고, 적 항구의 전선은 상륙을 막습니다.</p>
          </div>
        )}
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
            <TroopSlider value={troops} max={maxOut} step={step} total={cityTroops} keep={keep} onChange={setTroops} />
            {target && (() => {
              const ratio = estimateRatio(state, actor, city, state.cities[target], troops);
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
            {target && (() => {
              const to = state.cities[target];
              const road = neighbors(state, city.id).find((n) => n.city.id === target)?.road;
              if (!road) return null;
              const ctx = { general: actor, defenders: generalsIn(state, target).filter((x) => x.faction === to.owner), weather: state.weather[target], road, target: to };
              return (
                <div className="tactic-pick">
                  <small>계책</small>
                  <button className={tactic === '' ? 'active' : ''} onClick={() => setTactic('')}>정공법</button>
                  {TACTICS.map((t) => {
                    const p = tacticChance(t.id, ctx);
                    return (
                      <button key={t.id} className={tactic === t.id ? 'active' : ''} disabled={p === 0} title={t.desc} onClick={() => setTactic(t.id)}>
                        {t.icon} {t.name} {p === 0 ? '불가' : `${Math.round(p * 100)}%`}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            <button disabled={troops < least} onClick={() => onCommand({ type: 'march', generalId: actor.id, toCityId: target, troops, tactic: tactic || undefined })}>⚔️ {troops < least ? `최소 ${least.toLocaleString()}명 필요` : `${troops.toLocaleString()}명 출진`}</button>
            <p className="hint">군량 {Math.ceil(troops * BALANCE.foodPerTroop).toLocaleString()} 소모. 도하·고개·겨울은 공격에 불리합니다.</p>
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
            <TroopSlider value={moveTroops} max={maxOut} step={step} total={cityTroops} keep={keep} onChange={setMove} />
            <button onClick={() => onCommand({ type: 'transfer', generalId: actor.id, toCityId: dest, troops: moveTroops })}>🚶 {moveTroops > 0 ? `장수 + 병력 ${moveTroops.toLocaleString()}명 이동` : '장수만 이동'}</button>
          </>
        )}
      </div>
    </div>
  );
}

/** 병력 양 슬라이더: 0 ~ (도시 병력 − 최소 수비병). 남는 병력도 함께 보여 준다. */
export function TroopSlider({ value, max, step, total, keep, onChange }: {
  value: number; max: number; step: number; total: number; keep: number; onChange: (v: number) => void;
}) {
  if (max <= 0) return <p className="muted small">보낼 병력이 없습니다 (도시에 최소 {keep.toLocaleString()}명은 남겨야 함).</p>;
  const pct = (r: number) => Math.floor((max * r) / step) * step;
  return (
    <div className="troop-slider">
      <input type="range" min={0} max={max} step={1} value={value}
        onChange={(e) => { const v = +e.target.value; onChange(v >= max ? max : Math.round(v / step) * step); }} />
      <div className="troop-slider-row">
        <span>보냄 <b>{value.toLocaleString()}</b> · 남김 <b>{(total - value).toLocaleString()}</b> <small>(최대 {max.toLocaleString()})</small></span>
        <span className="troop-quick">
          {[0, 0.25, 0.5, 0.75].map((r) => <button key={r} type="button" onClick={() => onChange(pct(r))}>{r * 100}%</button>)}
          <button type="button" onClick={() => onChange(max)}>최대</button>
        </span>
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
        <b>태수</b> <small>{(() => { const gv = governorOf(state, actor.city); return gv ? `현재 ${gv.name} (정치 ${gv.stats.politics})` : '없음 — 임명하면 계절마다 농업·상업이 저절로 오릅니다'; })()}</small>
        {mine.length === 0 ? <p className="muted">임명할 장수가 없습니다.</p> : mine.map((t) => (
          <button key={t.id} disabled={state.cities[actor.city].governor === t.id} onClick={() => onCommand({ type: 'appoint', generalId: actor.id, targetId: t.id })}>🏛️ {t.name} 태수 임명 <small>정{t.stats.politics} 매{t.stats.charm}</small></button>
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
