// src/lib/geometry/util.ts

import { hashStringToUint32 } from '../hash';
import { createRng } from '../rng';
import type { Rng } from '../rng';

export function rngFromSeed(seed: number): Rng {
  // Keep seed stable across JS number quirks.
  const s = seed >>> 0;
  return createRng(s);
}

export function idFrom(seed: number, key: string): string {
  const h = hashStringToUint32(`geometry:${seed}:${key}`);
  return `g-${seed}-${h.toString(16)}`;
}

export function pickDistinct<T>(rng: Rng, arr: readonly T[], count: number): T[] {
  if (count > arr.length) throw new Error('pickDistinct: count exceeds array length');
  const copy = [...arr];
  rng.shuffle(copy);
  return copy.slice(0, count);
}

export function makeOptionsFromTexts(seed: number, texts: string[]): { id: string; text: string }[] {
  return texts.map((t, i) => ({ id: idFrom(seed, `opt:${i}:${t}`), text: t }));
}
