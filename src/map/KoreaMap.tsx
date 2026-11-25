// 한반도 전략 지도 (SVG). 세력 영역은 도시 기준 보로노이 분할을 해안선으로 잘라 칠한다.
import { useMemo, useRef, useState } from 'react';
import type { GameState } from '../core';
import { WEATHER_ICON, WEATHER_LABEL, visibleTroops } from '../core';
import { LANDMARKS, isConnectedToCapital, supplyRatio } from '../core';
import { CITY_AREAS, REGION_AREAS, LAND_PATH, REGIONS, REGION_PATHS, RIDGES, RIVERS, VIEW_H, VIEW_W, mountainGlyphs, project, toPath } from './geo';

const LM_LABEL = { pass: '고개', ford: '나루터', port: '항구', fortress: '산성' } as const;

export type MapMode = 'political' | 'terrain' | 'economy' | 'population' | 'military' | 'order' | 'supply' | 'weather';
export const MAP_MODES: { key: MapMode; label: string }[] = [
  { key: 'political', label: '정치' },
  { key: 'terrain', label: '지형' },
  { key: 'economy', label: '경제' },
  { key: 'population', label: '인구' },
  { key: 'military', label: '병력' },
  { key: 'order', label: '민심' },
  { key: 'supply', label: '보급' },
  { key: 'weather', label: '기후' },
];

const WEATHER_COLOR: Record<string, string> = { clear: '#c9b36a', rain: '#4f7fa8', storm: '#2f4f8a', typhoon: '#6a3fa0', snow: '#c8d6e0', blizzard: '#eef4f8', cold: '#7fb0c8', drought: '#c0733a', fog: '#8a9098' };

// 값(0~1) → 색 (어두운 남색 → 금색 → 붉은색)
function ramp(t: number): string {
  t = Math.max(0, Math.min(1, t));
  const stops = [[24, 40, 64], [64, 110, 90], [201, 166, 90], [220, 90, 60]];
  const x = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
// 고도 색 (저지대 녹색 → 구릉 황토 → 고산 갈색·흰색)
function elevColor(m: number): string {
  const stops: [number, number[]][] = [[0, [70, 120, 70]], [300, [120, 140, 80]], [700, [160, 140, 90]], [1100, [130, 100, 70]], [1500, [220, 215, 205]]];
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i], [b, cb] = stops[i + 1];
    if (m <= b) { const f = (m - a) / (b - a); return `rgb(${ca.map((v, k) => Math.round(v + (cb[k] - v) * f)).join(',')})`; }
  }
  return 'rgb(220,215,205)';
}

export interface MapLayers { landmarks: boolean; rivers: boolean; roads: boolean; labels: boolean; relief: boolean; battles: boolean; effects: boolean }
export const DEFAULT_LAYERS: MapLayers = { landmarks: true, rivers: true, roads: true, labels: true, relief: true, battles: true, effects: true };
export const LAYER_LABELS: { key: keyof MapLayers; label: string }[] = [
  { key: 'relief', label: '음영 기복' }, { key: 'rivers', label: '강' }, { key: 'roads', label: '길' }, { key: 'landmarks', label: '거점' }, { key: 'labels', label: '시·군 이름' }, { key: 'battles', label: '최근 전투' }, { key: 'effects', label: '날씨·재해 효과' },
];

interface Props {
  layers?: MapLayers;
  mode?: MapMode;
  state: GameState;
  selectedCityId?: string | null;
  highlightCityIds?: string[];
  onSelectCity?: (id: string) => void;
  mini?: boolean;
}


export function KoreaMap({ layers = DEFAULT_LAYERS, mode = 'political', state, selectedCityId, highlightCityIds = [], onSelectCity, mini }: Props) {
  const cities = useMemo(() => Object.values(state.cities), [state.cities]);
  const pts = useMemo(() => cities.map((c) => project([c.lon, c.lat])), [cities]);
  const glyphs = useMemo(() => RIDGES.flatMap((r) => mountainGlyphs(r.pts)), []);
  // v3.2 군현 지도: 시·군 하나하나가 도시
  const regionMode = state.mapScale === 'region';
  const popK = regionMode ? 12 : 1;
  const placed: [number, number][] = [];

  // 군주 깃발: 군주가 있는 도시
  const rulers = Object.values(state.factions)
    .filter((f) => f.alive)
    .map((f) => ({ f, g: state.generals[f.rulerId] }))
    .filter((x) => x.g && x.g.alive && x.g.faction === x.f.id);

  // 확대/이동
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const onWheel = (e: React.WheelEvent) => {
    if (mini) return;
    const k = Math.min(3, Math.max(0.8, view.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    setView((v) => ({ ...v, k }));
  };
  const onDown = (e: React.PointerEvent) => {
    if (mini) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    const rect = svgRef.current?.getBoundingClientRect();
    const scale = rect ? VIEW_H / rect.height : 1;
    setView((v) => ({ ...v, x: d.vx + (dx * scale) / v.k, y: d.vy + (dy * scale) / v.k }));
  };
  const onUp = () => { setTimeout(() => (drag.current = null), 0); };
  const click = (id: string) => { if (!drag.current?.moved) onSelectCity?.(id); };

  const cx = VIEW_W / 2, cy = VIEW_H / 2;
  const transform = `translate(${cx} ${cy}) scale(${view.k}) translate(${-cx + view.x} ${-cy + view.y})`;

  return (
    <svg
      ref={svgRef}
      className={mini ? 'map map-mini' : 'map'}
      viewBox={`-20 -10 ${VIEW_W + 40} ${VIEW_H + 20}`}
      preserveAspectRatio="xMidYMid meet"
      onWheel={onWheel}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
    >
      <defs>
        <pattern id="wx-rain" width="9" height="16" patternUnits="userSpaceOnUse"><path d="M3,0L1,7M8,8L6,15" stroke="#a9d2ff" strokeWidth="0.9" strokeOpacity="0.75" /></pattern>
        <pattern id="wx-storm" width="6" height="12" patternUnits="userSpaceOnUse"><path d="M3,0L0,9M6,4L4,11" stroke="#cfe6ff" strokeWidth="1.2" strokeOpacity="0.85" /></pattern>
        <pattern id="wx-snow" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r="1.1" fill="#fff" fillOpacity="0.9" /><circle cx="11" cy="11" r="0.9" fill="#fff" fillOpacity="0.8" /><circle cx="13" cy="2" r="0.7" fill="#fff" fillOpacity="0.7" /></pattern>
        <pattern id="wx-blizzard" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="#fff" /><circle cx="6" cy="6" r="1" fill="#fff" fillOpacity="0.85" /></pattern>
        <radialGradient id="fire-glow"><stop offset="0" stopColor="#ffdd55" stopOpacity="0.95" /><stop offset="0.45" stopColor="#ff6a1a" stopOpacity="0.7" /><stop offset="1" stopColor="#b3200c" stopOpacity="0" /></radialGradient>
        <marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0L10,5L0,10z" fill="context-stroke" />
        </marker>
        <clipPath id={mini ? 'land-mini' : 'land'}>
          <path d={LAND_PATH} />
        </clipPath>
        <radialGradient id="landShade" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#5b6b45" />
          <stop offset="100%" stopColor="#2e3a26" />
        </radialGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="coast" x="-10%" y="-10%" width="120%" height="120%">
          <feMorphology operator="dilate" radius="4" in="SourceAlpha" result="d" />
          <feGaussianBlur stdDeviation="5" in="d" result="b" />
          <feFlood floodColor="#8fb8c9" floodOpacity="0.35" />
          <feComposite in2="b" operator="in" />
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <g transform={mini ? undefined : transform}>
        {/* 육지 */}
        <path d={LAND_PATH} fill="url(#landShade)" stroke="#c9b37a" strokeWidth={mini ? 2 : 1.2} filter={mini ? undefined : 'url(#coast)'} />
        {/* v1.9 실측 고도 음영 기복도 (Terrain Tiles DEM, tools/geo/build_terrain.py) */}
        {!mini && layers.relief && <image href={`${import.meta.env.BASE_URL}terrain.webp`} x={0} y={0} width={VIEW_W} height={VIEW_H} preserveAspectRatio="none" opacity={mode === 'terrain' ? 1 : 0.6} pointerEvents="none" />}

        {/* 세력 영역: 전국 시·군을 관할 도시 소유 세력 색으로 */}
        <g clipPath={`url(#${mini ? 'land-mini' : 'land'})`}>
          {REGIONS.map((r) => {
            const pc = regionMode ? state.cities[r.id] : state.cities[r.parent];
            const owner = pc?.owner;
            const f = owner ? state.factions[owner] : null;
            const sel = !!pc && pc.id === selectedCityId;
            let fill = f ? f.color : '#8a8070';
            let op = mini ? 0.9 : sel ? 0.62 : f ? 0.42 : 0.25;
            if (!mini && mode !== 'political' && pc) {
              op = sel ? 0.95 : 0.8;
              if (mode === 'terrain') { fill = elevColor(r.elev); op = sel ? 0.35 : 0.02; }
              else if (mode === 'economy') fill = ramp((pc.agriculture + pc.commerce) / 180);
              else if (mode === 'population') fill = ramp((pc.population * popK) / 100000);
              else if (mode === 'military') { const v = visibleTroops(state, state.playerFactionId, pc.id).value; fill = v === null ? '#4a4f58' : ramp((v * popK) / 40000); }
              else if (mode === 'order') fill = ramp(pc.order / 100);
              else if (mode === 'supply') fill = pc.owner ? ramp(isConnectedToCapital(state, pc.owner, pc.id) ? supplyRatio(state, pc.owner) : 0.15) : '#4a4f58';
              else if (mode === 'weather') fill = WEATHER_COLOR[state.weather[pc.id] ?? 'clear'];
            }
            return (
              <path
                key={r.id}
                d={REGION_PATHS[r.id]}
                fill={fill}
                fillOpacity={op}
                stroke={mini ? 'none' : '#0d1420'}
                strokeOpacity={0.28}
                strokeWidth={0.5}
                onClick={mini || !pc ? undefined : () => click(pc.id)}
                className={mini ? undefined : 'region'}
              >
                {!mini && <title>{`${r.name} (${r.province}) — ${regionMode ? (f ? f.name + ' 영토' : '주인 없음') : '관할: ' + state.cities[r.parent]?.name}\n평균 고도 ${r.elev}m · 최고 ${r.elevMax ?? r.elev}m`}</title>}
              </path>
            );
          })}
          {!mini && (
            <>
              {/* 산맥 */}
              {mode !== 'terrain' && glyphs.map(([x, y], i) => (
                <path key={i} d={`M${x - 6},${y + 4}L${x},${y - 6}L${x + 6},${y + 4}`} fill="#3b3426" fillOpacity={0.55} stroke="#d8cba3" strokeOpacity={0.45} strokeWidth={0.8} />
              ))}
              {/* 강 */}
              {layers.rivers && RIVERS.map((r, i) => (
                <path key={i} d={toPath(r.pts)} fill="none" stroke="#7fb6d6" strokeOpacity={r.estimated ? 0.65 : 0.85} strokeWidth={r.name === '압록강' || r.name === '두만강' || r.name === '한강' || r.name === '낙동강' ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round"><title>{r.name + (r.estimated ? ' (추정선)' : '')}</title></path>
              ))}
              {layers.rivers && view.k >= 1.2 && RIVERS.filter((r, i) => RIVERS.findIndex((x) => x.name === r.name) === i).map((r) => {
                const [x, y] = project(r.pts[Math.floor(r.pts.length / 2)]);
                return <text key={'rl' + r.name} x={x + 4} y={y - 3} fontSize={6} fill="#a8d4ee" fontStyle="italic" pointerEvents="none" stroke="#14202a" strokeWidth={1.4} paintOrder="stroke">{r.name}</text>;
              })}
            </>
          )}
        </g>

        {!mini && (
          <>
            {/* 시·군 이름 (확대 시) */}
            {layers.labels && !regionMode && view.k >= 1.7 && REGIONS.map((r) => {
              const [x, y] = project([r.lon, r.lat]);
              return <text key={r.id} x={x} y={y} textAnchor="middle" fontSize={5.5 / Math.min(view.k / 1.7, 1.6)} fill="#f3e7cc" fillOpacity={0.75} pointerEvents="none">{r.name}</text>;
            })}

            {/* 도로 */}
            {layers.roads && state.roads.map((r) => {
              const [x1, y1] = project([state.cities[r.from].lon, state.cities[r.from].lat]);
              const [x2, y2] = project([state.cities[r.to].lon, state.cities[r.to].lat]);
              const dash = r.type === 'sea' ? '2 6' : r.type === 'pass' ? '6 4' : undefined;
              return <line key={r.from + r.to} x1={x1} y1={y1} x2={x2} y2={y2} stroke={r.type === 'sea' ? '#9cc7e0' : '#e8d9a8'} strokeOpacity={regionMode ? 0.22 : 0.45} strokeWidth={regionMode ? 0.6 : 1.2} strokeDasharray={dash} />;
            })}

            {/* 거점: 고개·나루·항구·산성 (v1.3) */}
            {layers.landmarks && LANDMARKS.map((l) => {
              const [x, y] = project([l.lon, l.lat]);
              const sz = 1 / Math.min(Math.max(view.k, 1), 2.2);
              const icon = l.type === 'pass' ? '⛰' : l.type === 'ford' ? '⛴' : l.type === 'port' ? '⚓' : '🏯';
              return (
                <g key={l.id} transform={`translate(${x},${y}) scale(${sz})`} className="landmark" pointerEvents="visiblePainted">
                  <title>{`${l.name} — ${LM_LABEL[l.type]}\n${l.note}`}</title>
                  <circle r={5.5} fill="#1d1a14" fillOpacity={0.7} stroke="#d8c27a" strokeWidth={0.8} />
                  <text y={3} textAnchor="middle" fontSize={7}>{icon}</text>
                  {view.k >= 1.4 && <text y={13} textAnchor="middle" fontSize={6.5} fill="#ffe7a8" stroke="#1d1a14" strokeWidth={1.6} paintOrder="stroke">{l.name}</text>}
                </g>
              );
            })}

            {/* v2.8 날씨·재해 효과: 그 도시 관할 시·군 안에서만 비·눈·안개·가뭄·한파·산불을 그린다 */}
            {layers.effects && cities.map((c) => {
              const area = CITY_AREAS[c.id] ?? REGION_AREAS[c.id];
              const w = state.weather[c.id];
              const fire = (c.fire ?? 0) > 0;
              if (!area || (!fire && (!w || w === 'clear'))) return null;
              const pad = 20;
              const box = { x: area.x - pad, y: area.y - pad, width: area.w + pad * 2, height: area.h + pad * 2 };
              const pat = w === 'rain' ? 'wx-rain' : w === 'storm' || w === 'typhoon' ? 'wx-storm' : w === 'snow' ? 'wx-snow' : w === 'blizzard' ? 'wx-blizzard' : null;
              return (
                <g key={'wx' + c.id} pointerEvents="none">
                  <clipPath id={`wxc-${c.id}`}><path d={area.path} /></clipPath>
                  <g clipPath={`url(#wxc-${c.id})`}>
                    {(w === 'rain' || w === 'storm' || w === 'typhoon') && <rect {...box} fill="#1d3550" fillOpacity={w === 'rain' ? 0.18 : 0.3} />}
                    {pat && <rect {...box} fill={`url(#${pat})`} className={`wx-fall ${w === 'snow' || w === 'blizzard' ? 'wx-slow' : ''} ${w === 'storm' || w === 'typhoon' || w === 'blizzard' ? 'wx-fast' : ''}`} />}
                    {(w === 'snow' || w === 'blizzard') && <rect {...box} fill="#eef6ff" fillOpacity={w === 'blizzard' ? 0.3 : 0.16} />}
                    {w === 'fog' && <rect {...box} fill="#e8ecef" className="wx-fog" />}
                    {w === 'drought' && <rect {...box} fill="#d9822b" className="wx-drought" />}
                    {w === 'cold' && <rect {...box} fill="#9fd0ff" fillOpacity={0.18} />}
                    {fire && <rect {...box} fill="#ff4a10" className="wx-fire-tint" />}
                  </g>
                  {w === 'storm' || w === 'typhoon' ? <text x={area.x + area.w / 2} y={area.y + area.h / 2} fontSize={w === 'typhoon' ? 26 : 14} textAnchor="middle" className={w === 'typhoon' ? 'wx-spin' : 'wx-flash'}>{w === 'typhoon' ? '🌀' : '⚡'}</text> : null}
                  {fire && area.spots.map(([x, y], i) => (
                    <g key={i} transform={`translate(${x},${y})`}>
                      <circle r={11} fill="url(#fire-glow)" className="wx-flicker" style={{ animationDelay: `${i * 0.23}s` }} />
                      <text y={4} fontSize={11} textAnchor="middle" className="wx-flicker" style={{ animationDelay: `${i * 0.31}s` }}>🔥</text>
                      <circle cy={-10} r={4} fill="#5a5048" className="wx-smoke" style={{ animationDelay: `${i * 0.5}s` }} />
                    </g>
                  ))}
                </g>
              );
            })}

            {/* v2.5 최근 전투 화살표: 최근 1년(4턴)의 공격, 오래될수록 옅게 */}
            {layers.battles && state.lastBattles.filter((b) => b.turn >= state.turn - 3).map((b, i) => {
              const a = state.cities[b.fromCity], t = state.cities[b.toCity];
              if (!a || !t) return null;
              const [x1, y1] = project([a.lon, a.lat]);
              const [x2, y2] = project([t.lon, t.lat]);
              const mx = (x1 + x2) / 2 - (y2 - y1) * 0.18, my = (y1 + y2) / 2 + (x2 - x1) * 0.18;
              const len = Math.hypot(x2 - x1, y2 - y1);
              const ex = x2 - ((x2 - mx) / len) * 12, ey = y2 - ((y2 - my) / len) * 12;
              const col = state.factions[b.attackerFaction]?.color ?? '#ccc';
              return (
                <g key={'bt' + i} className="battle-arrow" pointerEvents="visiblePainted">
                  <title>{`${state.factions[b.attackerFaction]?.name}군 ${state.generals[b.generalId]?.name ?? ''}: ${a.name} → ${t.name} ${b.won ? '함락' : '실패'} (${b.attackerTroops.toLocaleString()} vs ${b.defenderTroops.toLocaleString()})`}</title>
                  <path d={`M${x1},${y1}Q${mx},${my} ${ex},${ey}`} fill="none" stroke={col} strokeWidth={b.turn >= state.turn - 1 ? 3 : 2} strokeOpacity={Math.max(0.3, 0.95 - (state.turn - b.turn) * 0.2)} strokeDasharray={b.won ? undefined : '5 3'} markerEnd="url(#arrowhead)" />
                  <text x={mx} y={my} textAnchor="middle" fontSize={10} pointerEvents="none">{b.won ? '⚔️' : '✖'}</text>
                </g>
              );
            })}

            {/* 도시 */}
            {cities.map((c, i) => {
              const [x, y] = pts[i];
              const f = c.owner ? state.factions[c.owner] : null;
              const sel = c.id === selectedCityId;
              const hl = highlightCityIds.includes(c.id);
              if (regionMode) {
                // 군현 지도: 작은 표지, 이름은 치소·선택·확대 시에만
                const sz = 1 / Math.min(Math.max(view.k, 1), 2.4);
                const showName = layers.labels && (sel || hl || view.k >= 1.7 || (c.seat && view.k >= 1.2));
                return (
                  <g key={c.id} className="city" transform={`translate(${x},${y}) scale(${sz})`} onClick={() => click(c.id)}>
                    {(sel || hl) && <circle r={sel ? 11 : 9} fill="none" stroke={sel ? '#ffe08a' : '#ff6b5b'} strokeWidth={2} filter="url(#glow)" className="pulse" />}
                    <rect x={-4} y={-4} width={8} height={8} rx={c.fortress ? 1 : 4} fill={f?.color ?? '#9a9080'} stroke={c.seat ? '#ffe08a' : '#f3e2b0'} strokeWidth={c.seat ? 1.6 : 0.9} />
                    {view.k >= 1.7 && state.weather[c.id] && state.weather[c.id] !== 'clear' && <text x={6} y={-4} fontSize={8} pointerEvents="none">{WEATHER_ICON[state.weather[c.id]]}</text>}
                    {(c.epidemic ?? 0) > 0 && <text x={-14} y={9} fontSize={8} pointerEvents="none">🦠</text>}
                    {showName && <text y={14} textAnchor="middle" fontSize={c.seat ? 10 : 8.5} fill="#f5ecd6" fontWeight={c.seat ? 700 : 400} stroke="#10151c" strokeWidth={2.2} paintOrder="stroke" pointerEvents="none">{c.name}</text>}
                    <title>{`${c.name} — ${f ? f.name : '주인 없음'}${c.seat ? ' (치소)' : ''}`}</title>
                  </g>
                );
              }
              return (
                <g key={c.id} className="city" transform={`translate(${x},${y})`} onClick={() => click(c.id)}>
                  {(sel || hl) && <circle r={sel ? 16 : 13} fill="none" stroke={sel ? '#ffe08a' : '#ff6b5b'} strokeWidth={2} filter="url(#glow)" className="pulse" />}
                  <rect x={-7} y={-7} width={14} height={14} rx={c.fortress ? 2 : 7} fill={f?.color ?? '#9a9080'} stroke="#f3e2b0" strokeWidth={1.4} />
                  {c.fortress && <path d="M-5,-7v-3h2v2h2v-2h2v2h2v-2h2v3" fill="none" stroke="#f3e2b0" strokeWidth={1} />}
                  {state.weather[c.id] && state.weather[c.id] !== 'clear' && (
                    <text x={10} y={-6} fontSize={11} pointerEvents="none"><title>{WEATHER_LABEL[state.weather[c.id]]}</title>{WEATHER_ICON[state.weather[c.id]]}</text>
                  )}
                  {(c.epidemic ?? 0) > 0 && <text x={-20} y={14} fontSize={10} pointerEvents="none"><title>역병</title>🦠</text>}
                  {view.k >= 1.2 && (c.ships ?? 0) > 0 && (
                    <text x={-22} y={-4} fontSize={8} fill="#bfe3ff" stroke="#0d1420" strokeWidth={1.5} paintOrder="stroke" pointerEvents="none">⛵{c.ships}</text>
                  )}
                  <g transform="translate(0,19)">
                    <rect x={-c.name.length * 7 - 6} y={-9} width={c.name.length * 14 + 12} height={18} rx={4} fill="#141a22" fillOpacity={0.85} stroke={sel ? '#ffe08a' : '#a88d4f'} strokeWidth={0.9} />
                    <text textAnchor="middle" dy={4.5} fontSize={12} fill="#f5ecd6" fontWeight={600}>{c.name}</text>
                  </g>
                </g>
              );
            })}

            {/* 군주 깃발 */}
            {rulers.map(({ f, g }) => {
              // 깃발은 세력 영토의 중심(도시 좌표 평균)에 세운다. 겹치면 옆으로 비킨다 (v3.2)
              const owned = cities.filter((c) => c.owner === f.id);
              if (!owned.length) return null;
              const [x0, y0] = owned
                .map((c) => project([c.lon, c.lat]))
                .reduce((a, p) => [a[0] + p[0] / owned.length, a[1] + p[1] / owned.length], [0, 0]);
              let x = x0, y = y0;
              const hit = (ax: number, ay: number) => placed.some(([px, py]) => Math.abs(px - ax) < 46 && Math.abs(py - ay) < 56);
              const off = [[0, 0], [0, 58], [-48, 0], [0, -58], [-48, 58], [48, 58], [-48, -58], [48, 0]].find(([dx, dy]) => !hit(x + dx, y + dy)) ?? [0, 0];
              x += off[0]; y += off[1];
              placed.push([x, y]);
              return (
                <g key={f.id} transform={`translate(${x - 15},${y - 44})`} className="banner" pointerEvents="none">
                  <rect x={f.hanja.length > 1 ? -8 : 0} y={0} width={f.hanja.length > 1 ? 46 : 30} height={34} rx={2} fill={f.color} stroke="#e9cf86" strokeWidth={1.5} />
                  <text x={15} y={f.hanja.length > 1 ? 23 : 25} textAnchor="middle" fontSize={f.hanja.length > 1 ? 17 : 22} fontWeight={700} fill="#fff7e0" style={{ fontFamily: 'serif' }}>{f.hanja}</text>
                  <rect x={-4} y={36} width={g.name.length * 13 + 8} height={17} rx={3} fill="#10151c" fillOpacity={0.8} />
                  <text x={g.name.length * 6.5} y={49} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff">{g.name}</text>
                </g>
              );
            })}
          </>
        )}

        {mini &&
          Object.values(state.factions)
            .filter((f) => f.alive)
            .map((f) => {
              const owned = cities.filter((c) => c.owner === f.id);
              if (!owned.length) return null;
              const [x, y] = owned.map((c) => project([c.lon, c.lat])).reduce((a, p) => [a[0] + p[0] / owned.length, a[1] + p[1] / owned.length], [0, 0]);
              return <text key={f.id} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={f.hanja.length > 1 ? 36 : 56} fontWeight={700} fill="#fff7e0" stroke="#0007" strokeWidth={2} style={{ fontFamily: 'serif' }}>{f.hanja}</text>;
            })}
      </g>
    </svg>
  );
}
