// v4.0 포로 처분 창과 도시 특징 카드
import type { Command, GameState } from '../../core';
import { captiveRecruitChance, cityTraits } from '../../core';
import { Modal } from './Modals';

export function CaptiveModal({ state, onClose, onCommand }: { state: GameState; onClose: () => void; onCommand: (c: Command) => void }) {
  const pf = state.playerFactionId!;
  const ruler = state.factions[pf].rulerId;
  const list = (state.captives ?? []).filter((c) => c.captor === pf && state.generals[c.generalId]?.alive);
  return (
    <Modal title="포로 처분" onClose={onClose}>
      {list.length === 0 ? <p className="muted">사로잡은 장수가 없습니다.</p> : list.map((c) => {
        const g = state.generals[c.generalId];
        const p = captiveRecruitChance(state, pf, g);
        return (
          <div key={c.generalId} className="captive-row">
            <div>
              <b>{g.name}</b> <small className="muted">{c.from ? `${state.factions[c.from]?.name ?? ''} 출신 · ` : ''}{state.cities[c.cityId].name}에서 사로잡음</small><br />
              <small>통{g.stats.leadership} 무{g.stats.war} 지{g.stats.intellect} 정{g.stats.politics} 매{g.stats.charm} · 의리 {g.persona.righteousness}</small>
            </div>
            <div className="captive-actions">
              <button onClick={() => onCommand({ type: 'captive', generalId: ruler, targetId: g.id, action: 'recruit' })}>🤝 등용 <small>{Math.round(p * 100)}%</small></button>
              <button onClick={() => onCommand({ type: 'captive', generalId: ruler, targetId: g.id, action: 'release' })}>🕊️ 석방</button>
              <button className="danger" onClick={() => onCommand({ type: 'captive', generalId: ruler, targetId: g.id, action: 'execute' })}>⚔️ 처형</button>
            </div>
          </div>
        );
      })}
      <p className="hint">등용에 실패해도 다시 석방·처형할 수 있습니다. 처형하면 의리를 중히 여기는 우리 장수들의 충성이 조금 떨어집니다. 8턴 동안 처분하지 않으면 풀려납니다.</p>
    </Modal>
  );
}

export function CityTraitCard({ state, cityId }: { state: GameState; cityId: string }) {
  const c = state.cities[cityId];
  if (!c) return null;
  const ts = cityTraits(state, c);
  return (
    <div className="city-trait-card panel">
      <div className="ct-head"><b>{c.name}</b> <small className="muted">{c.owner ? state.factions[c.owner]?.name : '중립'} · 쌀 {c.agriculture} · 상업 {c.commerce} · 철 {c.iron} · 목재 {c.wood}{c.horses ? ` · 말 ${c.horses}` : ''}</small></div>
      {ts.map((t) => <div key={t.label} className="ct-row" title={t.desc}><span>{t.icon}</span> <b>{t.label}</b> <small>{t.desc}</small></div>)}
    </div>
  );
}
