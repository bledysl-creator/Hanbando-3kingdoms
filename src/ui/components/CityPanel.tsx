// 도시 패널: 선택한 도시의 정보와 명령(내정·군사·인재)
import { useEffect, useMemo, useState } from 'react';
import type { Advice, Command, Comp, UnitKind, GameState, General, StudyStat, TacticKind } from '../../core';
import { BALANCE, DATA, STUDY_LABEL, council, compEffect, compOf, compText, horsePrice, breedYield, RANCH_LABEL, isBigCity, organizeCost, UNIT_KINDS, duelPreview, foodPrice, governorOf, reliefFood, TACTICS, tacticChance, discordChance, rumorChance, scoutChance, visibleTroops, withinTwo, WEATHER_ICON, WEATHER_LABEL, estimateRatio, landmarksOfCity, routeProfile, routeText, ROUTE_LABEL, climbText, STAT_KEYS, STAT_NAME, developGain, trainGain, supplyMul, unitStats, commandCap, statGrade, relationBetween, minGarrison, minMarch, disbandPreview, freeGeneralsIn, generalsIn, isConnectedToCapital, marchOpinions, neighbors, obedience, statusOf, supplyRatio } from '../../core';
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
  /** v4.2.1 남은 장수를 내정·인사로 맡기기 */
  onDelegate?: (cityId: string) => void;
}

/** v4.3 5단계 전술 전투로 직접 지휘 (설정, 기본 켬) */
const tacticalOn = () => { try { return localStorage.getItem('hanbando.tactical') !== '0'; } catch { return true; } };

export function CityPanel({ state, cityId, tab, onTab, onCommand, onClose, onTargetHover, onDelegate }: Props) {
  const c = state.cities[cityId];
  const pf = state.playerFactionId;
  const owner = c.owner ? state.factions[c.owner] : null;
  const mine = !!pf && c.owner === pf;
  const gens = generalsIn(state, c.id).filter((g) => g.faction === c.owner);
  const free = freeGeneralsIn(state, c.id);
  const ready = gens.filter((g) => !g.acted);
  const [gid, setGid] = useState<string>('');
  const [allGens, setAllGens] = useState(false);
  // v4.2.1 내 도시는 명령이 먼저 보이도록 도시 수치를 접어 둔다 (펼침 여부는 기억)
  const [statsOpen, setStatsOpen] = useState(() => { try { return localStorage.getItem('hanbando.cityStats') === '1'; } catch { return false; } });
  const toggleStats = () => setStatsOpen((v) => { try { localStorage.setItem('hanbando.cityStats', v ? '0' : '1'); } catch { /* 저장 불가 */ } return !v; });
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
      {/* 장수 목록: 도시 이름 바로 아래. 한 줄 5명, ▼로 전체. 행동 남은 장수는 금테, 마친 장수는 회색, 고른 실행 장수는 채워진 테 */}
      <div className="gen-strip">
        <div className="gen-strip-head">
          <b>장수 {gens.length}</b>
          {mine && <small className="muted">행동 가능 {ready.length}명</small>}
          {mine && ready.length > 0 && onDelegate && (
            <button className="gen-more delegate" title="남은 장수에게 내정·인사(개발·구휼·등용·포상·훈련·태수 등)를 알아서 맡깁니다. 출진·병력 이동·징병·계략은 하지 않습니다." onClick={() => onDelegate(c.id)}>🤖 맡기기</button>
          )}
          {gens.length > 5 && (
            <button className="gen-more" onClick={() => setAllGens((v) => !v)} aria-expanded={allGens}>{allGens ? '▲ 접기' : `▼ 전체`}</button>
          )}
        </div>
        <div className="gen-row5">
          {(() => { const sorted = mine ? [...gens].sort((a, b) => Number(a.acted) - Number(b.acted)) : gens; return allGens ? sorted : sorted.slice(0, 5); })().map((g, i) => {
            const canAct = mine && !g.acted;
            const cls = `gen-cell ${mine && g.acted ? 'done' : ''} ${canAct ? 'ready' : ''} ${g.id === gid ? 'chosen' : ''}`;
            return (
              <button key={g.id} className={cls} aria-disabled={!canAct} onClick={() => canAct && setGid(g.id)} aria-label={`${g.name} ${mine ? (g.acted ? '행동 마침' : '행동 가능') : ''}`}>
                <Portrait general={g} color={owner?.color ?? '#777'} size={34} />
                <span className="gen-name">{g.name}</span>
                <span className={`ct-tip gen-tip ${i % 5 >= 3 ? 'right' : ''}`} role="tooltip">
                  <b>{g.name} <small>{g.hanja} · {state.year - g.birth}세{mine ? (g.acted ? ' · 행동 마침' : ' · 행동 가능') : ''}</small></b>
                  {STAT_KEYS.map((k) => <span key={k} className="tip-stat"><em>{STAT_NAME[k]}</em> {g.stats[k]} <i className={`grade g${statGrade(g.stats[k])}`}>{statGrade(g.stats[k])}</i></span>)}
                  {g.faction && <span className="tip-stat wide"><em>충성</em> {g.loyalty}</span>}
                </span>
              </button>
            );
          })}
          {gens.length === 0 && <span className="muted">없음</span>}
        </div>
      </div>
      {mine && (
        <button className="city-summary" onClick={toggleStats} aria-expanded={statsOpen} title="도시 정보 펼치기·접기">
          <span>⚔️ {fmt(c.troops)}</span><span>😊 {Math.round(c.order)}</span><span>🌾 {c.agriculture}</span><span>🪙 {c.commerce}</span><span>🧱 {c.wall}</span><span>🎯 {c.training}</span>
          <span>{WEATHER_ICON[state.weather[c.id] ?? 'clear']}</span>{(c.fire ?? 0) > 0 && <span className="bad">🔥</span>}{(c.epidemic ?? 0) > 0 && <span className="bad">🦠</span>}
          <em>{statsOpen ? '▲' : '▼ 정보'}</em>
        </button>
      )}
      {mine && !statsOpen && free.length > 0 && <p className="muted small free-hint">🧑‍🎓 재야 인재: {free.map((g) => g.name).join(', ')} — 인재 탭에서 등용</p>}
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
            <p className="actor-line">실행 장수 <b>{actor?.name}</b> <small className="muted">통{actor?.stats.leadership} 무{actor?.stats.war} 지{actor?.stats.intellect} 정{actor?.stats.politics} 매{actor?.stats.charm}</small></p>
          )}
          {actor && tab === '내정' && <DomesticTab state={state} cityId={c.id} actor={actor} onCommand={onCommand} />}
          {actor && tab === '군사' && <MilitaryTab key={`${c.id}:${actor.id}`} state={state} actor={actor} cityTroops={c.troops} population={c.population} neighbors={ns} onCommand={onCommand} onTargetHover={onTargetHover} />}
          {actor && tab === '계략' && <IntrigueTab state={state} actor={actor} onCommand={onCommand} />}
          {actor && tab === '인재' && <TalentTab state={state} actor={actor} free={free} onCommand={onCommand} />}
        </>
      )}
      {(!mine || statsOpen) && (
        <>
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
        {free.length > 0 && (
          <p className="muted">재야 인재: {free.map((g) => g.name).join(', ')}</p>
        )}
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
  const gain = developGain(actor, false);
  const [amt, setAmt] = useState(10000);
  const [disband, setDisband] = useState(3000);
  const buy = foodPrice(state, cityId, 'buyFood');
  const sell = foodPrice(state, cityId, 'sellFood');
  const city = state.cities[cityId];
  return (
    <div className="actions">
      {/* v4.2.1 가장 자주 쓰는 개발을 맨 위에 한 줄로 */}
      <div className="dev-row">
        <button disabled={city.agriculture >= 100} onClick={() => onCommand({ type: 'develop', generalId: actor.id, field: 'agriculture' })}>🌾 농업 <b>{city.agriculture}</b><small>금 {BALANCE.developGold} · +{gain}</small></button>
        <button disabled={city.commerce >= 100} onClick={() => onCommand({ type: 'develop', generalId: actor.id, field: 'commerce' })}>🪙 상업 <b>{city.commerce}</b><small>금 {BALANCE.developGold} · +{gain}</small></button>
        <button disabled={city.wall >= 100} title="정치+지력" onClick={() => onCommand({ type: 'develop', generalId: actor.id, field: 'wall' })}>🧱 성벽 <b>{city.wall}</b><small>금 {BALANCE.wallGold} · 목재 {BALANCE.wallWood / 1000}천 · +{developGain(actor, true)}</small></button>
      </div>
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
      {(() => {
        const hb = horsePrice(state, cityId, 'buyHorses'), hs = horsePrice(state, cityId, 'sellHorses');
        const have = state.factions[state.playerFactionId!].horses ?? 0;
        return (
          <div className="sub">
            <b>군마 시장</b> <small>말 1필 — 사기 금 {hb.toFixed(1)} · 팔기 금 {hs.toFixed(1)} (곡식 {BALANCE.horseFoodRatio}석 값) · 보유 {have.toLocaleString()}필 · 기병 10명당 1필</small>
            <div className="row2">
              <button onClick={() => onCommand({ type: 'trade', generalId: actor.id, action: 'buyHorses', amount: 100 })}>🐎 100필 사기 <small>금 {Math.round(hb * 100).toLocaleString()}</small></button>
              <button disabled={have < 100} onClick={() => onCommand({ type: 'trade', generalId: actor.id, action: 'sellHorses', amount: 100 })}>💰 100필 팔기 <small>금 +{Math.round(hs * 100).toLocaleString()}</small></button>
            </div>
          </div>
        );
      })()}
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
  const [advisorId, setAdvisor] = useState<string | undefined>(undefined);
  const [deputyId, setDeputy] = useState<string>('');
  const [councilOpen, setCouncil] = useState<{ key: string; advice: Advice[] } | null>(null);
  const [studyStat, setStudy] = useState<StudyStat>('war');
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
      {/* v4.2.1 출진·이동을 맨 위로 (군사 탭에서 가장 자주 쓰는 명령) */}
      <div className="sub">
        <b>출진</b>
        {enemies.length === 0 ? <p className="muted">인접한 적 도시가 없습니다.</p> : (
          <>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {enemies.map((n) => (
                <option key={n.city.id} value={n.city.id}>
                  {n.city.name} ({n.city.owner ? state.factions[n.city.owner].name : '중립'} · 병력 {n.city.troops.toLocaleString()} · {ROAD[n.road.type]}{(() => { const rp = routeProfile(actor.city, n.city.id); return rp ? `·${ROUTE_LABEL[rp.label].name}` : ''; })()})
                </option>
              ))}
            </select>
            {(() => {
              // v4.4.1 길별·방향별 전투 지형: 이 길로 쳐들어가면 어떤 땅에서 싸우나 (반대 방향과 다르다)
              const rp = routeProfile(actor.city, target), back = routeProfile(target, actor.city);
              if (!rp) return null;
              const ct = climbText(rp.climb);
              return (
                <p className="small route-line" title={back ? `반대로 ${state.cities[target]?.name}에서 쳐들어오면: ${ROUTE_LABEL[back.label].name}길 — ${routeText(back)}` : undefined}>
                  🗺 싸울 땅 {ROUTE_LABEL[rp.label].icon}<b>{ROUTE_LABEL[rp.label].name}</b> — {routeText(rp)}{ct ? ` · ${ct}` : ''}
                </p>
              );
            })()}
            <TroopSlider value={troops} max={maxOut} step={step} total={cityTroops} keep={keep} onChange={setTroops} />
            {(() => {
              // v4.2 부장: 같은 성의 행동 전 장수 1명을 붙인다. 무력·지력은 둘 중 높은 쪽, 지휘 한도에 부장 통솔이 더해진다
              const cands = generalsIn(state, actor.city).filter((x) => x.faction === pf && x.id !== actor.id && !x.acted && relationBetween(state, actor.id, x.id)?.type !== 'enmity');
              const dep = deputyId ? state.generals[deputyId] : undefined;
              const cap = commandCap(actor.stats.leadership, dep ? [dep.stats.leadership] : []);
              const us = unitStats(actor, dep);
              const bond = dep ? relationBetween(state, actor.id, dep.id)?.type : undefined;
              return (
                <div className="tactic-pick deputy-pick">
                  <small>부장</small>
                  <select value={deputyId} onChange={(e) => setDeputy(e.target.value)}>
                    <option value="">없음 (단독 출진)</option>
                    {cands.map((x) => <option key={x.id} value={x.id}>{x.name} — 통{x.stats.leadership} 무{x.stats.war}{statGrade(x.stats.war)} 지{x.stats.intellect}{statGrade(x.stats.intellect)}{relationBetween(state, actor.id, x.id)?.type === 'sworn' ? ' · 의형제' : relationBetween(state, actor.id, x.id)?.type === 'trust' ? ' · 신뢰' : ''}</option>)}
                  </select>
                  <p className="hint small">부대 능력: 통솔 {us.leadership} · 무력 {us.war} · 지력 {us.intellect} · 지휘 한도 <b className={troops > cap ? 'bad' : 'good'}>{cap.toLocaleString()}명</b>{troops > cap ? ` — 넘는 ${(troops - cap).toLocaleString()}명은 절반만 제 몫` : ''}{bond === 'sworn' ? ` · 🤝 의형제 +${Math.round((BALANCE.bondSworn - 1) * 100)}%` : bond === 'trust' ? ` · 🤝 신뢰 +${Math.round((BALANCE.bondTrust - 1) * 100)}%` : ''}</p>
                </div>
              );
            })()}
            {target && (() => {
              const to = state.cities[target];
              const road = neighbors(state, city.id).find((n) => n.city.id === target)?.road;
              if (!road) return null;
              const fe = compEffect(compOf(city), compOf(to), road, to, state.weather[target], to.wall >= 50, state.factions[pf].traits.includes('최강무력'));
              const pct = Math.round((fe.attack - 1) * 100);
              const dp = deputyId ? state.generals[deputyId] : undefined;
              const fighter = dp && dp.stats.war > actor.stats.war ? dp : actor;
              const duel = duelPreview(state, fighter, target);
              return (
                <div className="tactic-pick formation-pick">
                  <p className="hint">우리 편제 <b>{compText(compOf(city))}</b> 대 적 <b>{compText(compOf(to))}</b> → 편제 효과 <b className={pct >= 0 ? 'good' : 'bad'}>{pct >= 0 ? '+' : ''}{pct}%</b></p>
                  {fe.reasons.map((r) => <p key={r} className="hint small">· {r}</p>)}
                  {duel && <p className="hint duel-hint">⚔️ 일기토가 벌어질 수 있음: {fighter.name}(무력 {fighter.stats.war}) 대 {duel.champ.name}(무력 {duel.champ.stats.war}) — 이길 확률 {Math.round(duel.win * 100)}%</p>}
                </div>
              );
            })()}
            {target && (() => {
              const to = state.cities[target];
              const road = neighbors(state, city.id).find((n) => n.city.id === target)?.road;
              const fe = road ? compEffect(compOf(city), compOf(to), road, to, state.weather[target], to.wall >= 50).attack : 1;
              const ratio = estimateRatio(state, actor, city, to, troops, undefined, deputyId ? state.generals[deputyId] : undefined) * fe;
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
              const dp2 = deputyId ? state.generals[deputyId] : undefined;
              const ctx = { general: dp2 ? { ...actor, stats: unitStats(actor, dp2) } : actor, defenders: generalsIn(state, target).filter((x) => x.faction === to.owner), weather: state.weather[target], road, target: to };
              return (
                <div className="tactic-pick">
                  <small>계책</small>
                  <button className={tactic === '' ? 'active' : ''} onClick={() => { setTactic(''); setAdvisor(undefined); }}>정공법</button>
                  {TACTICS.map((t) => {
                    const p = tacticChance(t.id, ctx);
                    return (
                      <button key={t.id} className={tactic === t.id ? 'active' : ''} disabled={p === 0} title={t.desc} onClick={() => { setTactic(t.id); setAdvisor(undefined); }}>
                        {t.icon} {t.name} {p === 0 ? '불가' : `${Math.round(p * 100)}%`}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            {target && (() => {
              const ckey = `${target}|${troops}|${state.turn}`;
              const open = councilOpen?.key === ckey ? councilOpen : null;
              return (
                <div className="council-box">
                  {!open ? (
                    <button className="ghost" onClick={() => setCouncil({ key: ckey, advice: council(state, pf, actor, target, troops).advice })}>🪶 책사 회의 열기 <small>지력 {BALANCE.councilMinInt}+ 책사들의 의견</small></button>
                  ) : open.advice.length === 0 ? <p className="muted small">지력 {BALANCE.councilMinInt} 이상인 책사가 없습니다.</p> : (
                    <>
                      <div className="muted small">🪶 책사 회의 — 지력이 높을수록 판단이 정확합니다. 실제 결과는 아무도 모릅니다.</div>
                      {open.advice.map((a) => {
                        const ag = state.generals[a.advisorId];
                        const chosen = advisorId === a.advisorId;
                        return (
                          <div key={a.advisorId} className={`advice ${chosen ? 'chosen' : ''}`}>
                            <b>{ag.name}</b> <small className="muted">지력 {ag.stats.intellect} · 판단 정확도 {Math.round(a.accuracy * 100)}%</small>
                            <div>“{a.text}”</div>
                            {a.plan && <button onClick={() => { setTactic(a.plan!.tactic ?? ''); setAdvisor(a.advisorId); }}>{chosen ? '✓ 이 계책을 따름' : '이 계책을 따른다'} <small>(따르면 충성 +{BALANCE.adviceLoyalty})</small></button>}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              );
            })()}
            <button disabled={troops < least} onClick={() => onCommand({ type: 'march', generalId: actor.id, toCityId: target, troops, tactic: tactic || undefined, advisorId, deputyId: deputyId || undefined, tactical: tacticalOn() })}>⚔️ {troops < least ? `최소 ${least.toLocaleString()}명 필요` : `${troops.toLocaleString()}명 출진`}</button>
            <p className="hint">군량 {Math.ceil(troops * BALANCE.foodPerTroop * supplyMul(state, city.id, pf)).toLocaleString()} 소모 (이 성 최고 정치 장수의 병참 반영). 도하·고개·겨울은 공격에 불리합니다. 출진 부대는 이 성의 군사 편제 비율 그대로 나갑니다.{tacticalOn() ? ' 출진하면 전투 창이 열려 5단계로 직접 지휘합니다 (설정에서 끌 수 있음).' : ''}</p>
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
        <b>훈련</b> <small>곡 {Math.ceil(city.troops * BALANCE.trainFood).toLocaleString()} · 훈련 +{trainGain(actor)} (통솔+무력) · 사기 +3</small>
        <button disabled={city.training >= 100} onClick={() => onCommand({ type: 'train', generalId: actor.id })}>🎯 병사 훈련 (현재 {city.training})</button>
      </div>
      <div className="sub">
        <b>징병</b> <small>금 {Math.ceil(amount * BALANCE.conscriptGoldPerTroop)} · 철 {Math.ceil(amount * BALANCE.conscriptIronPerTroop)} · 인구 −{amount.toLocaleString()}</small>
        <input type="range" min={0} max={maxConscript} step={500} value={amount} onChange={(e) => setAmount(+e.target.value)} />
        <button disabled={amount < 100} onClick={() => onCommand({ type: 'conscript', generalId: actor.id, amount })}>🛡️ {amount.toLocaleString()}명 징병</button>
        <p className="hint">병사도 결국 백성입니다. 징병하면 생산 인구와 민심이 줄고, 신병이 섞여 훈련도·사기가 내려갑니다.</p>
      </div>
      <OrganizeBox key={`org:${city.id}:${city.troops}`} state={state} cityId={city.id} actor={actor} onCommand={onCommand} />
      <div className="sub">
        <b>수련·학문</b> <small>금 {BALANCE.studyGold} · {actor.name}의 능력 +{BALANCE.studyMin}~{BALANCE.studyMax} (무작위, {BALANCE.studyHighFrom} 이상은 절반, 같은 성에 그 능력 90+ 스승이 있으면 +1)</small>
        <div className="row2">
          <select value={studyStat} onChange={(e) => setStudy(e.target.value as StudyStat)}>
            {(Object.keys(STUDY_LABEL) as StudyStat[]).map((k) => <option key={k} value={k}>{STUDY_LABEL[k]} — 현재 {actor.stats[k]}</option>)}
          </select>
          <button disabled={actor.stats[studyStat] >= 100 || state.factions[pf].gold < BALANCE.studyGold} onClick={() => onCommand({ type: 'study', generalId: actor.id, stat: studyStat })}>📚 수련</button>
        </div>
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

/** v4.1 군사 편제(사이드바 슬라이더)와 마창 */
const UNIT_INFO: Record<UnitKind, { icon: string; name: string; tip: string }> = {
  infantry: { icon: '🛡️', name: '보병', tip: '징병하면 모두 보병. 나머지 비율이 보병이 된다' },
  spear: { icon: '🔱', name: '창병', tip: '기병·전차병에 강하다 · 철 0.3/명' },
  archer: { icon: '🏹', name: '궁병', tip: '성벽 위에서 강하고 보병을 잘 잡는다 · 목재 0.3 + 철 0.05/명' },
  cavalry: { icon: '🐎', name: '기병', tip: '평지·추격에 강하고 궁병을 덮친다, 창병에 약하다 · 말 1필 + 철 0.1/명' },
  chariot: { icon: '🛞', name: '전차병', tip: '평지 공격력 최고, 산·강·진흙·성벽에 약하다 · 큰 도시만 · 말 0.5필 + 철 1/명' },
};
function OrganizeBox({ state, cityId, actor, onCommand }: { state: GameState; cityId: string; actor: General; onCommand: (c: Command) => void }) {
  const city = state.cities[cityId];
  const f = state.factions[city.owner!];
  const cur = compOf(city);
  const pctOf = (c: Comp) => Object.fromEntries(UNIT_KINDS.map((k) => [k, Math.round((c[k] ?? 0) * 100)])) as Record<UnitKind, number>;
  const [p, setP] = useState(pctOf(cur));
  const big = isBigCity(state, city);
  const set = (k: UnitKind, v: number) => {
    const others = UNIT_KINDS.filter((x) => x !== 'infantry' && x !== k).reduce((a, x) => a + p[x], 0);
    const nv = Math.max(0, Math.min(v, 100 - others));
    setP({ ...p, [k]: nv, infantry: 100 - others - nv });
  };
  const target: Comp = Object.fromEntries(UNIT_KINDS.map((k) => [k, p[k] / 100]));
  const cost = organizeCost(state, city, target);
  const same = UNIT_KINDS.every((k) => Math.abs(p[k] - Math.round((cur[k] ?? 0) * 100)) < 1);
  const lv = city.ranch ?? 0;
  const breedFood = BALANCE.breedFoodPerLevel * lv;
  return (
    <>
      <div className="sub organize">
        <b>군사 편제</b> <small>병력 {city.troops.toLocaleString()}명 · 군마 {(f.horses ?? 0).toLocaleString()}필 · 철 {f.iron.toLocaleString()} · 목재 {f.wood.toLocaleString()}</small>
        {UNIT_KINDS.map((k) => {
          const info = UNIT_INFO[k];
          const n = Math.round((city.troops * p[k]) / 100);
          const off = k === 'chariot' && !big && (cur.chariot ?? 0) === 0;
          return (
            <div key={k} className="org-row" title={info.tip}>
              <span className="org-name">{info.icon} {info.name}</span>
              {k === 'infantry'
                ? <div className="org-bar"><div style={{ width: `${p.infantry}%` }} /></div>
                : <input type="range" min={0} max={100} step={5} value={p[k]} disabled={off} onChange={(e) => set(k, +e.target.value)} />}
              <span className="org-num">{p[k]}% <small>{n.toLocaleString()}</small></span>
            </div>
          );
        })}
        {!big && <p className="hint">전차병은 큰 도시(인구 {(BALANCE.chariotCityPop / (state.mapScale === 'region' ? BALANCE.regionPopDiv : 1)).toLocaleString()} 이상)에서만 꾸릴 수 있습니다.</p>}
        {!same && <p className={`hint ${cost.error ? 'bad' : ''}`}>{cost.error ?? `비용: 말 ${cost.horses >= 0 ? cost.horses.toLocaleString() : `+${(-cost.horses).toLocaleString()} 돌려받음`} · 철 ${cost.iron.toLocaleString()} · 목재 ${cost.wood.toLocaleString()} · 훈련 −${cost.trainDrop}`}</p>}
        <div className="row2">
          <button disabled={same || !!cost.error} onClick={() => onCommand({ type: 'organize', generalId: actor.id, comp: target })}>⚖️ 편제 바꾸기</button>
          <button disabled={same} onClick={() => setP(pctOf(cur))}>되돌리기</button>
        </div>
        <p className="hint">징병한 신병은 모두 보병입니다. 말·철·목재를 들여 병종을 바꾸세요. 성을 지킬 때도 이 편제로 싸웁니다.</p>
      </div>
      <div className="sub">
        <b>마창 ({RANCH_LABEL[lv]})</b> <small>{lv > 0 ? `계절마다 말 ${BALANCE.ranchPassive * lv}필이 저절로 늘어남` : '이 고을에는 말을 기를 목장이 없습니다'}</small>
        {lv > 0 && (
          <div className="ranch-row">
            <button disabled={f.gold < BALANCE.breedGold || f.food < breedFood} onClick={() => onCommand({ type: 'breedHorses', generalId: actor.id })}>🐎 말 기르기 +{breedYield(state, city, actor).toLocaleString()}필</button>
            <small>금 {BALANCE.breedGold} · 곡식 {breedFood.toLocaleString()} · {actor.name}의 정치가 높을수록 많이</small>
          </div>
        )}
      </div>
    </>
  );
}
