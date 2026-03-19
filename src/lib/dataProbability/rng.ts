// src/lib/dataProbability/rng.ts

import { hashStringToUint32 } from '../hash';

export type Rng = {
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: T[]): T[];
  chance(p: number): boolean;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: string): Rng {
  const s = hashStringToUint32(seed);
  const next = mulberry32(s);

  return {
    int(min: number, max: number) {
      if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error('rng.int: bounds must be finite');
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      const r = next();
      return lo + Math.floor(r * (hi - lo + 1));
    },

    pick<T>(arr: readonly T[]): T {
      if (!arr.length) throw new Error('rng.pick: empty array');
      return arr[this.int(0, arr.length - 1)];
    },

    shuffle<T>(arr: T[]): T[] {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = this.int(0, i);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },

    chance(p: number): boolean {
      if (p <= 0) return false;
      if (p >= 1) return true;
      return next() < p;
    },
  };
}
