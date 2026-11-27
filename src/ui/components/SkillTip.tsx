// v4.4.1 특기 설명 상자: 특기에 마우스를 올리면(휴대폰은 누르면) 능력치 조건·발동 확률·효과 수치·출처를 보여 준다.
// 일반 특기는 손자병법 구절, 고유 특기는 『삼국지연의』 일화와 전투에서 쓰는 고유 기술(⭐)까지.
import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { SkillDef } from '../../core';
import { STAT_LABEL, skillEffectLines, skillRuleLines, techLines } from '../../core';

const pct = (p: number) => `${Math.round(p * 100)}%`;

/** 마우스를 올리면 뜨는 설명 상자. 스크롤 창 안에서도 잘리지 않게 화면 맨 위(body)에 띄운다 */
export function Tip({ content, children, className = '', wide = false }: { content: ReactNode; children: ReactNode; className?: string; wide?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; up: boolean; max: number } | null>(null);
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const w = wide ? 400 : 340;
    const x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
    const up = r.top > window.innerHeight * 0.55;
    const y = up ? window.innerHeight - r.top + 6 : r.bottom + 6;
    setPos({ x, y, up, max: Math.max(160, (up ? r.top : window.innerHeight - r.bottom) - 14) });
  };
  return (
    <span ref={ref} className={`tip-wrap ${className}`} tabIndex={0} onMouseEnter={show} onMouseLeave={() => setPos(null)} onFocus={show} onBlur={() => setPos(null)}>
      {children}
      {pos && createPortal(
        <span className={`tip-box ${wide ? 'wide' : ''}`} role="tooltip" style={{ left: pos.x, maxHeight: pos.max, ...(pos.up ? { bottom: pos.y } : { top: pos.y }) }}>{content}</span>,
        document.body,
      )}
    </span>
  );
}

/** 특기 설명 상자 내용. owner·p를 주면 그 장수의 실제 발동 확률도 */
export function SkillTipBody({ sk, owner, p, techP }: { sk: SkillDef; owner?: string; p?: number; techP?: number }) {
  return (
    <span className="skill-tip">
      <b className="st-title">{sk.general ? '🌟' : '✨'} {sk.name} <span className="hanja">{sk.hanja}</span></b>
      <span className="st-kind">{sk.general ? `고유 특기${owner ? ` · ${owner}` : ''}` : `${STAT_LABEL[sk.stat]} 일반 특기${owner ? ` · ${owner}` : ''}`}</span>
      {sk.story && (
        <span className="st-story">📜 {sk.story}<small>{sk.source}</small></span>
      )}
      <span className="st-desc">{sk.desc}</span>
      <span className="st-sec">능력 · 조건</span>
      <ul>
        {skillRuleLines(sk).map((l, i) => <li key={`r${i}`}>{l}</li>)}
        {p !== undefined && <li><b>지금 발동 확률 {pct(p)}</b></li>}
      </ul>
      <span className="st-sec">전투 효과</span>
      <ul>{skillEffectLines(sk).map((l, i) => <li key={`e${i}`}>{l}</li>)}</ul>
      {sk.sun && <span className="st-sun">📘 손자병법 「{sk.sun}」</span>}
      {sk.tech && (
        <>
          <span className="st-sec tech">⭐ 고유 기술 「{sk.tech.name}」 <span className="hanja">{sk.tech.hanja}</span></span>
          <span className="st-desc">{sk.tech.desc}</span>
          <ul>
            {techLines(sk.tech, sk.stat).map((l, i) => <li key={`t${i}`}>{l}</li>)}
            {techP !== undefined && <li><b>지금 성공률 {pct(techP)}</b></li>}
          </ul>
        </>
      )}
    </span>
  );
}
