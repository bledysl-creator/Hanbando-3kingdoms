// 사건 안내 그림 (v3.4). 외부 이미지 없이 코드로 그린 오리지널 삽화(SVG).
// 장면마다 하늘·땅·주인공 실루엣·소품을 겹쳐 그리고, 세력 색을 깃발에 칠한다.
import type { EventKind } from '../../core';

export type ArtKind = EventKind | 'lost' | 'unify';

const W = 520, H = 210;

function Sky({ top, bottom, id }: { top: string; bottom: string; id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={top} /><stop offset="1" stopColor={bottom} /></linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#sky-${id})`} />
    </>
  );
}

const Mountains = ({ color, y = 120, op = 1 }: { color: string; y?: number; op?: number }) => (
  <path d={`M0,${y + 40} L60,${y - 10} L110,${y + 20} L170,${y - 30} L240,${y + 15} L300,${y - 20} L360,${y + 25} L430,${y - 15} L520,${y + 30} L520,${H} L0,${H}Z`} fill={color} opacity={op} />
);

const Castle = ({ x, y, color, flag, burning }: { x: number; y: number; color: string; flag?: string; burning?: boolean }) => (
  <g transform={`translate(${x},${y})`}>
    <rect x={-70} y={-20} width={140} height={50} fill={color} />
    {[-70, -50, -30, -10, 10, 30, 50].map((cx) => <rect key={cx} x={cx} y={-28} width={12} height={8} fill={color} />)}
    <path d="M-40,-20 L0,-62 L40,-20Z" fill={color} />
    <rect x={-30} y={-48} width={60} height={28} fill={color} />
    <path d="M-48,-48 L0,-80 L48,-48Z" fill={color} />
    <rect x={-10} y={5} width={20} height={25} rx={10} fill="#0b0d10" />
    {flag && (
      <g transform="translate(0,-80)">
        <line x1={0} y1={0} x2={0} y2={-34} stroke="#2a2218" strokeWidth={2} />
        <path d="M0,-34 L30,-28 L24,-20 L30,-12 L0,-16Z" fill={flag} stroke="#f0d68e" strokeWidth={0.8} className="art-wave" />
      </g>
    )}
    {burning && (
      <g>
        <path d="M-60,-20 Q-50,-60 -40,-25 Q-30,-70 -18,-24 Q-5,-55 5,-22" fill="#ff7a1a" opacity={0.85} className="art-flicker" />
        <path d="M20,-20 Q32,-66 44,-22 Q55,-52 64,-20" fill="#ffb020" opacity={0.85} className="art-flicker" />
        <circle cx={-20} cy={-100} r={22} fill="#3a3430" opacity={0.6} className="art-smoke" />
        <circle cx={18} cy={-120} r={28} fill="#3a3430" opacity={0.45} className="art-smoke" style={{ animationDelay: '0.8s' }} />
      </g>
    )}
  </g>
);

/** 말 탄 장수 실루엣 (깃발 색) */
const Rider = ({ x, y, s = 1, flag, flip }: { x: number; y: number; s?: number; flag?: string; flip?: boolean }) => (
  <g transform={`translate(${x},${y}) scale(${flip ? -s : s},${s})`}>
    <path d="M-34,0 Q-30,-22 -8,-24 L14,-26 Q22,-34 30,-30 L34,-22 Q26,-22 24,-16 L22,0 L16,0 L16,-12 L-20,-12 L-24,0 L-30,0Z" fill="#14110d" />
    <path d="M-2,-24 L2,-46 Q6,-52 12,-46 L10,-24Z" fill="#14110d" />
    <circle cx={7} cy={-52} r={5} fill="#14110d" />
    <line x1={-6} y1={-30} x2={-30} y2={-78} stroke="#14110d" strokeWidth={2} />
    {flag && <path d="M-30,-78 L-8,-72 L-14,-66 L-8,-60 L-28,-62Z" fill={flag} className="art-wave" />}
  </g>
);

const Soldier = ({ x, y, flip }: { x: number; y: number; flip?: boolean }) => (
  <g transform={`translate(${x},${y}) scale(${flip ? -1 : 1},1)`}>
    <circle cx={0} cy={-30} r={4} fill="#14110d" />
    <path d="M-5,-26 L5,-26 L4,-10 L6,0 L2,0 L0,-8 L-2,0 L-6,0 L-4,-10Z" fill="#14110d" />
    <line x1={6} y1={-40} x2={6} y2={0} stroke="#14110d" strokeWidth={1.5} />
    <path d="M6,-44 L8,-38 L4,-38Z" fill="#14110d" />
  </g>
);

const Moon = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={20} fill="#f3ead2" opacity={0.9} />;
const Sun = ({ x, y, color = '#ffd27a' }: { x: number; y: number; color?: string }) => (
  <g>
    <circle cx={x} cy={y} r={60} fill={color} opacity={0.18} />
    <circle cx={x} cy={y} r={32} fill={color} opacity={0.9} />
  </g>
);

export function EventArt({ kind, color = '#c9a24e', other = '#888' }: { kind: ArtKind; color?: string; other?: string }) {
  const id = kind;
  let body: React.ReactNode;
  switch (kind) {
    case 'capture':
      body = (<>
        <Sky top="#f2a65a" bottom="#5b2a1c" id={id} /><Sun x={420} y={70} />
        <Mountains color="#3b2a20" y={110} op={0.8} />
        <Castle x={330} y={150} color="#20160f" flag={color} />
        <Rider x={110} y={190} s={1.3} flag={color} />
        {[170, 195, 220].map((x) => <Soldier key={x} x={x} y={195} />)}
      </>);
      break;
    case 'lost':
      body = (<>
        <Sky top="#3b1a14" bottom="#120a08" id={id} />
        <Mountains color="#1f1410" y={115} />
        <Castle x={260} y={155} color="#0d0907" flag={other} burning />
        <Rider x={430} y={195} s={1} flag={color} flip />
      </>);
      break;
    case 'rebel':
      body = (<>
        <Sky top="#1b1f33" bottom="#40263a" id={id} />
        <path d="M300,0 L280,60 L300,58 L270,130" stroke="#fff6c8" strokeWidth={3} fill="none" className="art-flash" />
        <Mountains color="#151320" y={120} />
        <g transform="translate(180,190)">
          <path d="M-14,0 L-10,-50 Q0,-60 10,-50 L14,0Z" fill="#0c0b10" />
          <circle cx={0} cy={-64} r={9} fill="#0c0b10" />
          <line x1={10} y1={-50} x2={40} y2={-150} stroke="#0c0b10" strokeWidth={3} />
          <path d="M40,-150 L100,-138 L88,-124 L100,-110 L36,-116Z" fill={color} className="art-wave" />
        </g>
        <path d="M330,190 L360,150 L390,190Z" fill={other} opacity={0.6} transform="rotate(25 360 170)" />
      </>);
      break;
    case 'debut':
      body = (<>
        <Sky top="#7fb3d6" bottom="#f5d9a0" id={id} /><Sun x={260} y={140} color="#ffe39a" />
        <Mountains color="#3a4a3a" y={130} op={0.9} />
        <g transform="translate(260,195)">
          <path d="M-12,0 L-9,-46 Q0,-56 9,-46 L12,0Z" fill="#141a14" />
          <circle cx={0} cy={-60} r={8} fill="#141a14" />
          <line x1={-14} y1={-36} x2={-40} y2={-90} stroke="#141a14" strokeWidth={2.5} />
        </g>
      </>);
      break;
    case 'duel':
      body = (<>
        <Sky top="#5a2a1a" bottom="#1a0f0a" id={id} /><Sun x={260} y={120} color="#ff9a4a" />
        <Mountains color="#1f1410" y={130} />
        <Rider x={190} y={190} s={1.25} flag={color} />
        <Rider x={330} y={190} s={1.25} flag={other} flip />
        <path d="M250,100 L270,130 M270,100 L250,130" stroke="#fff3c0" strokeWidth={4} className="art-flash" />
      </>);
      break;
    case 'fate':
      body = (<>
        <Sky top="#1a1d2a" bottom="#3a2a22" id={id} /><Moon x={430} y={50} />
        <Mountains color="#120f0c" y={125} />
        <Castle x={120} y={160} color="#0b0907" flag={other} burning />
        <Rider x={360} y={195} s={1.1} flag={color} />
        {[400, 425, 450].map((x) => <Soldier key={x} x={x} y={198} />)}
      </>);
      break;
    case 'death':
      body = (<>
        <Sky top="#0e1320" bottom="#252a38" id={id} /><Moon x={400} y={55} />
        <Mountains color="#0b0e16" y={135} />
        {[150, 370].map((x) => (
          <g key={x} transform={`translate(${x},200)`}>
            <line x1={0} y1={0} x2={0} y2={-120} stroke="#2a2a2a" strokeWidth={3} />
            <rect x={2} y={-118} width={22} height={90} fill="#efeae0" opacity={0.85} className="art-wave" />
          </g>
        ))}
        <g transform="translate(260,190)">
          <rect x={-6} y={-40} width={12} height={40} fill="#efe6cc" />
          <path d="M0,-58 Q8,-48 0,-40 Q-8,-48 0,-58Z" fill="#ffcf6a" className="art-flicker" />
          <circle cx={0} cy={-48} r={26} fill="#ffcf6a" opacity={0.15} />
        </g>
      </>);
      break;
    case 'uprising':
      body = (<>
        <Sky top="#4a2a5c" bottom="#e0905a" id={id} /><Sun x={90} y={170} color="#ffb070" />
        <Mountains color="#2a1d2a" y={130} />
        {[200, 230, 260, 290, 320, 350].map((x, i) => <Soldier key={x} x={x} y={195 - (i % 2) * 4} />)}
        <Rider x={270} y={160} s={1.1} flag={color} />
      </>);
      break;
    case 'plague':
      body = (<>
        <Sky top="#2d3a2d" bottom="#4a5a3a" id={id} />
        <Mountains color="#1d261b" y={120} />
        {[120, 220, 330, 420].map((x) => (
          <g key={x} transform={`translate(${x},190)`}>
            <rect x={-26} y={-26} width={52} height={26} fill="#1a1812" />
            <path d="M-34,-26 L0,-48 L34,-26Z" fill="#2a2418" />
          </g>
        ))}
        {[160, 280, 380].map((x, i) => <circle key={x} cx={x} cy={120} r={40} fill="#9ad06a" opacity={0.18} className="art-smoke" style={{ animationDelay: `${i * 0.7}s` }} />)}
      </>);
      break;
    case 'fire':
      body = (<>
        <Sky top="#3a1208" bottom="#a33a10" id={id} />
        <Mountains color="#20100a" y={110} />
        {Array.from({ length: 14 }, (_, i) => 30 + i * 36).map((x, i) => (
          <g key={x} transform={`translate(${x},${185 - (i % 3) * 8})`}>
            <path d="M0,0 L-10,0 L0,-40 L10,0Z" fill="#160b06" />
            <path d={`M-8,-10 Q0,-${50 + (i % 4) * 8} 8,-10Z`} fill={i % 2 ? '#ff8a1a' : '#ffc43a'} opacity={0.85} className="art-flicker" style={{ animationDelay: `${i * 0.13}s` }} />
          </g>
        ))}
      </>);
      break;
    case 'harvest':
      body = (<>
        <Sky top="#8fc0e0" bottom="#f6e3a6" id={id} /><Sun x={430} y={60} />
        <Mountains color="#6b7a4a" y={120} op={0.7} />
        <rect x={0} y={150} width={W} height={60} fill="#d9a83a" />
        {Array.from({ length: 12 }, (_, i) => 20 + i * 42).map((x) => (
          <g key={x} transform={`translate(${x},175)`}>
            <path d="M0,0 L-6,-30 M0,0 L0,-34 M0,0 L6,-30" stroke="#8a5a14" strokeWidth={2} />
            <ellipse cx={0} cy={-34} rx={6} ry={10} fill="#f0c050" />
          </g>
        ))}
      </>);
      break;
    case 'treaty':
      body = (<>
        <Sky top="#2a3a4a" bottom="#6a5a3a" id={id} />
        <Mountains color="#1a2028" y={130} />
        <rect x={190} y={110} width={140} height={70} rx={6} fill="#efe2bf" stroke="#8a6a2a" strokeWidth={3} />
        {[125, 140, 155].map((y) => <line key={y} x1={205} y1={y} x2={315} y2={y} stroke="#6a5030" strokeWidth={2} />)}
        <circle cx={300} cy={168} r={9} fill="#b0201a" />
        {[[120, color], [400, other]].map(([x, c]) => (
          <g key={String(x)} transform={`translate(${x},200)`}>
            <line x1={0} y1={0} x2={0} y2={-140} stroke="#2a2218" strokeWidth={3} />
            <rect x={2} y={-138} width={40} height={60} fill={String(c)} className="art-wave" />
          </g>
        ))}
      </>);
      break;
    case 'surrender':
    case 'destroyed':
      body = (<>
        <Sky top="#2a2a2a" bottom="#555048" id={id} />
        <Mountains color="#1a1a1a" y={125} />
        <Castle x={260} y={160} color="#121212" flag={kind === 'surrender' ? other : undefined} burning={kind === 'destroyed'} />
        <g transform="translate(120,200) rotate(-60)"><line x1={0} y1={0} x2={0} y2={-90} stroke="#2a2218" strokeWidth={3} /><rect x={2} y={-88} width={30} height={40} fill={color} opacity={0.7} /></g>
      </>);
      break;
    case 'unify':
    default:
      body = (<>
        <Sky top="#c48a2a" bottom="#3a2410" id={id} /><Sun x={260} y={90} color="#ffe08a" />
        <Mountains color="#2a1a0c" y={135} />
        <Castle x={260} y={175} color="#1a1008" flag={color} />
        {[60, 120, 400, 460].map((x) => <Soldier key={x} x={x} y={200} flip={x > 260} />)}
      </>);
  }
  return (
    <svg className="event-art" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="img">
      {body}
      <rect width={W} height={H} fill="none" stroke="#c9a24e" strokeWidth={3} />
    </svg>
  );
}
