// src/lib/languageConventions/rng.ts

import { hashStringToUint32 } from '../hash';

export type Rng = {
  int: (min: number, max: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  shuffle: <T>(arr: T[]) => T[];
};

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: string): Rng {
  const next = mulberry32(hashStringToUint32(seed));

  const int = (min: number, max: number) => {
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error('rng.int bounds must be finite');
    if (hi < lo) throw new Error('rng.int max < min');
    return Math.floor(next() * (hi - lo + 1)) + lo;
  };

  const pick = <T,>(arr: readonly T[]): T => {
    if (!arr.length) throw new Error('rng.pick empty array');
    return arr[int(0, arr.length - 1)];
  };

  const shuffle = <T,>(arr: T[]): T[] => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = int(0, i);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  };

  return { int, pick, shuffle };
}
