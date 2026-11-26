// 외교 창 (v0.4): 세력별 관계, 휴전·동맹 제안, 맹약 파기, 받은 제안 응답
import { useMemo, useState } from 'react';
import type { Command, GameState } from '../../core';
import { acceptanceChance, citiesOf, hasHorses, horsePrice, statusOf, totalTroops, treatyOf } from '../../core';
import { Modal } from './Modals';

const STATUS = { war: '대치', truce: '휴전', alliance: '동맹' } as const;

export function DiplomacyModal({ state, onClose, onCommand }: { state: GameState; onClose: () => void; onCommand: (c: Command) => void }) {
  const pf = state.playerFactionId!;
  const envoys = useMemo(
    () => Object.values(state.generals)
      .filter((g) => g.alive && g.faction === pf && !g.acted && state.cities[g.city].owner === pf)
      .sort((a, b) => b.stats.charm + b.stats.intellect - (a.stats.charm + a.stats.intellect)),
    [state, pf],
  );
  const [envoyId, setEnvoyId] = useState(envoys[0]?.id ?? '');
  const [gold, setGold] = useState(0);
  const [horses, setHorses] = useState(0);
  const maxHorses = Math.min(state.factions[pf].horses ?? 0, 2000);
  const hv = (to: string) => envoyId ? Math.round(Math.min(horses, maxHorses) * horsePrice(state, state.generals[envoyId].city, 'sellHorses') * (hasHorses(state, to, 5000) ? 1 : 1.5)) : 0;
  const others = Object.values(state.factions).filter((f) => f.alive && f.id !== pf);
  const maxGold = Math.min(state.factions[pf].gold, 3000);

  return (
    <Modal title="외교" onClose={onClose} wide>
      {envoys.length === 0 ? <p className="muted">사신으로 보낼 수 있는 장수가 없습니다 (모두 행동 완료).</p> : (
        <div className="dip-controls">
          <label className="field">사신
            <select value={envoyId} onChange={(e) => setEnvoyId(e.target.value)}>
              {envoys.map((g) => <option key={g.id} value={g.id}>{g.name} (지{g.stats.intellect} 매{g.stats.charm})</option>)}
            </select>
          </label>
          <label className="field">예물 금 {gold.toLocaleString()}
            <input type="range" min={0} max={maxGold} step={100} value={Math.min(gold, maxGold)} onChange={(e) => setGold(+e.target.value)} />
          </label>
          <label className="field">예물 군마 {Math.min(horses, maxHorses).toLocaleString()}필 <small className="muted">(말이 없는 나라일수록 반김)</small>
            <input type="range" min={0} max={maxHorses} step={10} value={Math.min(horses, maxHorses)} disabled={maxHorses < 10} onChange={(e) => setHorses(+e.target.value)} />
          </label>
        </div>
      )}
      <table className="table dip-table">
        <thead><tr><th>세력</th><th>관계</th><th>도시</th><th>병력</th><th>휴전 제안</th><th>동맹 제안</th><th></th></tr></thead>
        <tbody>
          {others.map((f) => {
            const st = statusOf(state, pf, f.id);
            const t = treatyOf(state, pf, f.id);
            const truce = envoyId ? acceptanceChance(state, pf, f.id, 'truce', envoyId, gold + hv(f.id)) : null;
            const ally = envoyId ? acceptanceChance(state, pf, f.id, 'alliance', envoyId, gold + hv(f.id)) : null;
            return (
              <tr key={f.id}>
                <td><span className="badge" style={{ background: f.color }}>{f.hanja}</span> {state.generals[f.rulerId].name}</td>
                <td className={`st-${st}`}>{STATUS[st]}{t.until ? ` (${t.until - state.turn}턴 남음)` : ''}</td>
                <td>{citiesOf(state, f.id).length}</td>
                <td>{totalTroops(state, f.id).toLocaleString()}</td>
                <td>{st === 'war' && truce && (
                  <button title={truce.reasons.join('\n')} disabled={!envoyId} onClick={() => onCommand({ type: 'diplomacy', generalId: envoyId, targetFactionId: f.id, proposal: 'truce', gold, horses: Math.min(horses, maxHorses) })}>
                    휴전 ({Math.round(truce.p * 100)}%)
                  </button>)}
                </td>
                <td>{st !== 'alliance' && ally && (
                  <button title={ally.reasons.join('\n')} disabled={!envoyId} onClick={() => onCommand({ type: 'diplomacy', generalId: envoyId, targetFactionId: f.id, proposal: 'alliance', gold, horses: Math.min(horses, maxHorses) })}>
                    동맹 ({Math.round(ally.p * 100)}%)
                  </button>)}
                </td>
                <td>{st !== 'war' && (
                  <button className="danger" disabled={!envoyId} onClick={() => onCommand({ type: 'breakTreaty', generalId: envoyId, targetFactionId: f.id })}>맹약 파기</button>
                )}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint">휴전은 {8}턴(2년), 동맹은 무기한입니다. 휴전·동맹 중인 세력은 공격할 수 없습니다. 버튼에 마우스를 올리면 수락률의 이유가 보입니다. 맹약을 깨면 의리 높은 장수들의 충성이 떨어집니다.</p>
    </Modal>
  );
}

export function OffersModal({ state, onRespond, onClose }: { state: GameState; onRespond: (i: number, accept: boolean) => void; onClose: () => void }) {
  const pf = state.playerFactionId;
  return (
    <Modal title="사신이 도착했습니다" onClose={onClose}>
      {state.offers.map((o, i) => o.to !== pf ? null : (
        <div key={i} className="offer">
          <p><span className="badge" style={{ background: state.factions[o.from].color }}>{state.factions[o.from].hanja}</span> {state.generals[state.factions[o.from].rulerId].name}이(가) <b>{o.proposal === 'truce' ? '휴전(2년)' : '동맹'}</b>을 청합니다.{o.gold ? ` 예물: 금 ${o.gold.toLocaleString()}` : ''}</p>
          <div className="actions row">
            <button className="primary" onClick={() => onRespond(i, true)}>받아들인다</button>
            <button onClick={() => onRespond(i, false)}>거절한다</button>
          </div>
        </div>
      ))}
    </Modal>
  );
}
