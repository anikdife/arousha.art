// src/lib/measurement/distractors.ts

import { Rng } from '../rng';

export function uniqueStrings(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const k = String(v);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function formatWithUnit(n: number, unit: string): string {
  return `${formatNumber(n)} ${unit}`;
}

export function makeNearbyNumberOptions(rng: Rng, correct: number, unit: string | null, step: number, count: number): string[] {
  const out = new Set<string>();
  const toStr = (n: number) => (unit ? formatWithUnit(n, unit) : formatNumber(n));

  out.add(toStr(correct));

  const deltas = [
    step,
    -step,
    2 * step,
    -2 * step,
    3 * step,
    -3 * step,
    10 * step,
    -10 * step,
  ];

  let i = 0;
  while (out.size < count && i < 200) {
    i++;
    const d = rng.pick(deltas);
    const candidate = correct + d;
    if (!Number.isFinite(candidate)) continue;
    if (candidate < 0) continue;
    out.add(toStr(candidate));
  }

  return rng.shuffle(Array.from(out)).slice(0, count);
}

export function makeLetterOptions(correct: string, letters: readonly string[] = ['A', 'B', 'C', 'D']): string[] {
  const out = new Set<string>();
  for (const l of letters) out.add(l);
  if (!out.has(correct)) out.add(correct);
  return Array.from(out).slice(0, 4);
}

export function makeUnitOptions(unitA: string, unitB: string): string[] {
  return [unitA, unitB];
}

export function makeOrderOptions(rng: Rng, correct: string, all: string[]): string[] {
  const out = new Set<string>();
  out.add(correct);
  let guard = 0;
  while (out.size < 4 && guard < 200) {
    guard++;
    const c = rng.pick(all);
    if (c !== correct) out.add(c);
  }
  return rng.shuffle(Array.from(out));
}
