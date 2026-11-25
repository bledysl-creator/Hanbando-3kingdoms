// 시드 기반 난수 (mulberry32). Math.random() 사용 금지 — 항상 이 모듈만 쓴다.
// 상태(rng)는 GameState에 저장되므로 같은 세이브 + 같은 명령 = 같은 결과.

export interface RngHolder {
  rng: number;
}

/** 0 이상 1 미만의 난수를 반환하고 holder.rng를 전진시킨다. */
export function rand(h: RngHolder): number {
  h.rng = (h.rng + 0x6d2b79f5) | 0;
  let t = h.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(h: RngHolder, min: number, max: number): number {
  return min + (max - min) * rand(h);
}

export function chance(h: RngHolder, p: number): boolean {
  return rand(h) < p;
}

export function pick<T>(h: RngHolder, arr: readonly T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(rand(h) * arr.length)];
}
