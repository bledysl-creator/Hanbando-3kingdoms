// 한반도 전략 지도 (SVG). 세력 영역은 도시 기준 보로노이 분할을 해안선으로 잘라 칠한다.
import { useMemo, useRef, useState } from 'react';
import type { GameState } from '../core';
import { WEATHER_ICON, WEATHER_LABEL, visibleTroops } from '../core';
import { LAND_PATH, REGIONS, REGION_PATHS, RIDGES, RIVERS, VIEW_H, VIEW_W, mountainGlyphs, project, toPath } from './geo';

export type MapMode = 'political' | 'terrain' | 'economy' | 'population' | 'military' | 'order' | 'weather';
export const MAP_MODES: { key: MapMode; label: string }[] = [
  { key: 'political', label: '정치' },
  { key: 'terrain', label: '지형' },
  { key: 'economy', label: '경제' },
  { key: 'population', label: '인구' },
  { key: 'military', label: '병력' },
  { key: 'order', label: '민심' },
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

interface Props {
  mode?: MapMode;
  state: GameState;
  selectedCityId?: string | null;
  highlightCityIds?: string[];
  onSelectCity?: (id: string) => void;
  mini?: boolean;
}


export function KoreaMap({ mode = 'political', state, selectedCityId, highlightCityIds = [], onSelectCity, mini }: Props) {
  const cities = useMemo(() => Object.values(state.cities), [state.cities]);
  const pts = useMemo(() => cities.map((c) => project([c.lon, c.lat])), [cities]);
  const glyphs = useMemo(() => RIDGES.flatMap((r) => mountainGlyphs(r.pts)), []);

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

        {/* 세력 영역: 전국 시·군을 관할 도시 소유 세력 색으로 */}
        <g clipPath={`url(#${mini ? 'land-mini' : 'land'})`}>
          {REGIONS.map((r) => {
            const pc = state.cities[r.parent];
            const owner = pc?.owner;
            const f = owner ? state.factions[owner] : null;
            const sel = r.parent === selectedCityId;
            let fill = f ? f.color : '#8a8070';
            let op = mini ? 0.9 : sel ? 0.62 : f ? 0.42 : 0.25;
            if (!mini && mode !== 'political' && pc) {
              op = sel ? 0.95 : 0.8;
              if (mode === 'terrain') fill = elevColor(r.elev);
              else if (mode === 'economy') fill = ramp((pc.agriculture + pc.commerce) / 180);
              else if (mode === 'population') fill = ramp(pc.population / 100000);
              else if (mode === 'military') { const v = visibleTroops(state, state.playerFactionId, pc.id).value; fill = v === null ? '#4a4f58' : ramp(v / 40000); }
              else if (mode === 'order') fill = ramp(pc.order / 100);
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
                onClick={mini ? undefined : () => click(r.parent)}
                className={mini ? undefined : 'region'}
              >
                {!mini && <title>{`${r.name} (${r.province}) — 관할: ${state.cities[r.parent]?.name}`}</title>}
              </path>
            );
          })}
          {!mini && (
            <>
              {/* 산맥 */}
              {glyphs.map(([x, y], i) => (
                <path key={i} d={`M${x - 6},${y + 4}L${x},${y - 6}L${x + 6},${y + 4}`} fill="#3b3426" fillOpacity={0.55} stroke="#d8cba3" strokeOpacity={0.45} strokeWidth={0.8} />
              ))}
              {/* 강 */}
              {RIVERS.map((r) => (
                <path key={r.name} d={toPath(r.pts)} fill="none" stroke="#7fb6d6" strokeOpacity={0.8} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              ))}
            </>
          )}
        </g>

        {!mini && (
          <>
            {/* 시·군 이름 (확대 시) */}
            {view.k >= 1.7 && REGIONS.map((r) => {
              const [x, y] = project([r.lon, r.lat]);
              return <text key={r.id} x={x} y={y} textAnchor="middle" fontSize={5.5 / Math.min(view.k / 1.7, 1.6)} fill="#f3e7cc" fillOpacity={0.75} pointerEvents="none">{r.name}</text>;
            })}

            {/* 도로 */}
            {state.roads.map((r) => {
              const [x1, y1] = project([state.cities[r.from].lon, state.cities[r.from].lat]);
              const [x2, y2] = project([state.cities[r.to].lon, state.cities[r.to].lat]);
              const dash = r.type === 'sea' ? '2 6' : r.type === 'pass' ? '6 4' : undefined;
              return <line key={r.from + r.to} x1={x1} y1={y1} x2={x2} y2={y2} stroke={r.type === 'sea' ? '#9cc7e0' : '#e8d9a8'} strokeOpacity={0.45} strokeWidth={1.2} strokeDasharray={dash} />;
            })}

            {/* 도시 */}
            {cities.map((c, i) => {
              const [x, y] = pts[i];
              const f = c.owner ? state.factions[c.owner] : null;
              const sel = c.id === selectedCityId;
              const hl = highlightCityIds.includes(c.id);
              return (
                <g key={c.id} className="city" transform={`translate(${x},${y})`} onClick={() => click(c.id)}>
                  {(sel || hl) && <circle r={sel ? 16 : 13} fill="none" stroke={sel ? '#ffe08a' : '#ff6b5b'} strokeWidth={2} filter="url(#glow)" className="pulse" />}
                  <rect x={-7} y={-7} width={14} height={14} rx={c.fortress ? 2 : 7} fill={f?.color ?? '#9a9080'} stroke="#f3e2b0" strokeWidth={1.4} />
                  {c.fortress && <path d="M-5,-7v-3h2v2h2v-2h2v2h2v-2h2v3" fill="none" stroke="#f3e2b0" strokeWidth={1} />}
                  {state.weather[c.id] && state.weather[c.id] !== 'clear' && (
                    <text x={10} y={-6} fontSize={11} pointerEvents="none"><title>{WEATHER_LABEL[state.weather[c.id]]}</title>{WEATHER_ICON[state.weather[c.id]]}</text>
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
              // 깃발은 세력 영토의 중심(도시 좌표 평균)에 세운다
              const owned = cities.filter((c) => c.owner === f.id);
              if (!owned.length) return null;
              const [x, y] = owned
                .map((c) => project([c.lon, c.lat]))
                .reduce((a, p) => [a[0] + p[0] / owned.length, a[1] + p[1] / owned.length], [0, 0]);
              return (
                <g key={f.id} transform={`translate(${x - 15},${y - 44})`} className="banner" pointerEvents="none">
                  <rect x={0} y={0} width={30} height={34} rx={2} fill={f.color} stroke="#e9cf86" strokeWidth={1.5} />
                  <text x={15} y={25} textAnchor="middle" fontSize={22} fontWeight={700} fill="#fff7e0" style={{ fontFamily: 'serif' }}>{f.hanja}</text>
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
              return <text key={f.id} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={56} fontWeight={700} fill="#fff7e0" stroke="#0007" strokeWidth={2} style={{ fontFamily: 'serif' }}>{f.hanja}</text>;
            })}
      </g>
    </svg>
  );
}
