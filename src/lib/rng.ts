// src/lib/rng.ts

export type Rng = {
  int: (min: number, max: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  shuffle: <T>(arr: T[]) => T[];
  chance: (p: number) => boolean;
  uniqueInts: (count: number, min: number, max: number) => number[];
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

export function createRng(seed: number): Rng {
  const next = mulberry32(seed >>> 0);

  const int = (min: number, max: number) => {
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error('rng.int bounds must be finite');
    if (hi < lo) throw new Error('rng.int max < min');
    const r = next();
    return Math.floor(r * (hi - lo + 1)) + lo;
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

  const chance = (p: number) => {
    const pp = Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0;
    return next() < pp;
  };

  const uniqueInts = (count: number, min: number, max: number): number[] => {
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    const range = hi - lo + 1;
    if (count > range) throw new Error('rng.uniqueInts count > range');

    const out = new Set<number>();
    while (out.size < count) {
      out.add(int(lo, hi));
    }
    return Array.from(out);
  };

  return { int, pick, shuffle, chance, uniqueInts };
}
