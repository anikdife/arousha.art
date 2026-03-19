// src/lib/additionGenerator.ts

export type AdditionProblemKind = 'mcq' | 'input';
export type AdditionDifficulty = 'easy' | 'medium' | 'hard';
export type AdditionMode = 'basic' | 'placeValue' | 'missingAddend' | 'equivalence' | 'mentalMath';

export type MCQOption = {
  label: string;
  value: number;
};

export type AdditionOperands =
  | { mode: 'basic' | 'mentalMath'; a: number; b: number }
  | { mode: 'placeValue'; parts: [number, number, number] }
  | { mode: 'missingAddend'; total: number; known: number; missing: 'a' | 'b' }
  | { mode: 'equivalence'; a: number; b: number };

export type AdditionProblem = {
  id: string;
  kind: AdditionProblemKind;
  difficulty: AdditionDifficulty;
  mode: AdditionMode;
  prompt: string;
  operands: AdditionOperands;
  correctAnswer: number;
  options?: MCQOption[];
  explanationSteps?: string[];
};

export type GenerateAdditionPageParams = {
  seed: string;
  count?: number;
  difficulty?: AdditionDifficulty;
  mixWeights?: Partial<Record<AdditionMode, number>>;
};

function hashStringToUint32(input: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

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

function randInt(rng: () => number, min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error('randInt bounds must be finite');
  if (max < min) throw new Error('randInt max < min');
  const r = rng();
  const n = Math.floor(r * (max - min + 1)) + min;
  return n;
}

function chooseWeighted(rng: () => number, weights: Record<string, number>): string {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  if (entries.length === 0) throw new Error('No positive weights');
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let t = rng() * total;
  for (const [k, w] of entries) {
    t -= w;
    if (t <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

function clampNonNegative(n: number): number {
  return n < 0 ? 0 : n;
}

function swapDigits(n: number): number | null {
  const s = String(Math.abs(n));
  if (s.length !== 2) return null;
  const swapped = Number(s[1] + s[0]);
  return Number.isFinite(swapped) ? swapped : null;
}

function uniqueNumbers(values: number[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

function makeProblemId(seed: string, index: number, mode: AdditionMode, kind: AdditionProblemKind): string {
  const h = hashStringToUint32(`${seed}|${index}|${mode}|${kind}`);
  return `add-${h.toString(16).padStart(8, '0')}`;
}

function formatNumber(n: number): string {
  return String(n);
}

function computeExpectedFromOperands(operands: AdditionOperands): number {
  switch (operands.mode) {
    case 'basic':
    case 'mentalMath':
      return operands.a + operands.b;
    case 'placeValue':
      return operands.parts[0] + operands.parts[1] + operands.parts[2];
    case 'missingAddend':
      return operands.total - operands.known;
    case 'equivalence':
      return operands.a + operands.b;
    default: {
      const _exhaustive: never = operands;
      return _exhaustive;
    }
  }
}

export function expectedAnswer(problem: AdditionProblem): number {
  return computeExpectedFromOperands(problem.operands);
}

function buildNumericDistractors(rng: () => number, correct: number, hints?: {
  a?: number;
  b?: number;
  placeValueParts?: [number, number, number];
}): number[] {
  const candidates: number[] = [];

  const plusMinus1 = [correct - 1, correct + 1].filter((n) => n >= 0);
  candidates.push(...plusMinus1);

  const plusMinus10 = [correct - 10, correct + 10].filter((n) => n >= 0);
  candidates.push(...plusMinus10);

  const swapped = swapDigits(correct);
  if (swapped != null && swapped >= 0) candidates.push(swapped);

  if (typeof hints?.a === 'number' && typeof hints?.b === 'number') {
    const a = hints.a;
    const b = hints.b;

    const ones = (a % 10) + (b % 10);
    const tens = Math.floor(a / 10) + Math.floor(b / 10);
    const naiveNoCarry = tens * 10 + (ones % 10);
    if (naiveNoCarry !== correct && naiveNoCarry >= 0) candidates.push(naiveNoCarry);

    const carryMistake = clampNonNegative(correct - 10);
    if (carryMistake !== correct) candidates.push(carryMistake);
  }

  if (hints?.placeValueParts) {
    const [h, t, o] = hints.placeValueParts;
    const correctLocal = h + t + o;

    const tAsOnes = h + (t / 10) + o;
    if (Number.isInteger(tAsOnes) && tAsOnes >= 0 && tAsOnes !== correctLocal) candidates.push(tAsOnes);

    const concatenation = Number(`${h}${String(t).padStart(2, '0')}${o}`);
    if (Number.isFinite(concatenation) && concatenation >= 0 && concatenation <= 999999 && concatenation !== correctLocal) {
      candidates.push(concatenation);
    }

    const dropHundreds = Number(`${t}${o}`);
    if (Number.isFinite(dropHundreds) && dropHundreds >= 0 && dropHundreds !== correctLocal) candidates.push(dropHundreds);

    const appendO = Number(`${h + t}${o}`);
    if (Number.isFinite(appendO) && appendO >= 0 && appendO !== correctLocal) candidates.push(appendO);
  }

  // Add some random near-misses.
  for (let i = 0; i < 10; i++) {
    const delta = randInt(rng, -20, 20);
    const n = correct + delta;
    if (n >= 0 && n !== correct) candidates.push(n);
  }

  return uniqueNumbers(candidates);
}

function buildMcqOptionsNumeric(rng: () => number, correct: number, hints?: {
  a?: number;
  b?: number;
  placeValueParts?: [number, number, number];
}): MCQOption[] {
  const distractors = buildNumericDistractors(rng, correct, hints)
    .filter((n) => n !== correct)
    .filter((n) => n >= 0);

  // Shuffle deterministically by sampling.
  const picked: number[] = [];
  let attempts = 0;
  while (picked.length < 3 && attempts < 200) {
    attempts++;
    if (distractors.length === 0) break;
    const idx = randInt(rng, 0, distractors.length - 1);
    const v = distractors[idx];
    if (!picked.includes(v) && v !== correct) picked.push(v);
  }

  // Backfill with simple randoms if needed.
  while (picked.length < 3) {
    const v = randInt(rng, 0, Math.max(20, correct + 25));
    if (v !== correct && !picked.includes(v)) picked.push(v);
  }

  const values = uniqueNumbers([correct, ...picked]).slice(0, 4);

  // Ensure we actually have 4 and include correct.
  const finalValues = values.includes(correct) ? values : [correct, ...values].slice(0, 4);
  while (finalValues.length < 4) {
    const v = randInt(rng, 0, Math.max(20, correct + 50));
    if (!finalValues.includes(v) && v >= 0) finalValues.push(v);
  }

  // Deterministic shuffle
  for (let i = finalValues.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    const tmp = finalValues[i];
    finalValues[i] = finalValues[j];
    finalValues[j] = tmp;
  }

  // Ensure exactly one correct
  const correctCount = finalValues.filter((v) => v === correct).length;
  if (correctCount !== 1) {
    // Force uniqueness
    const uniq = uniqueNumbers(finalValues.filter((v) => v !== correct));
    const rebuilt = [correct, ...uniq].slice(0, 4);
    while (rebuilt.length < 4) {
      const v = randInt(rng, 0, Math.max(20, correct + 50));
      if (!rebuilt.includes(v) && v !== correct) rebuilt.push(v);
    }
    for (let i = rebuilt.length - 1; i > 0; i--) {
      const j = randInt(rng, 0, i);
      const tmp = rebuilt[i];
      rebuilt[i] = rebuilt[j];
      rebuilt[j] = tmp;
    }
    return rebuilt.map((v) => ({ label: formatNumber(v), value: v }));
  }

  return finalValues.map((v) => ({ label: formatNumber(v), value: v }));
}

function makeBasicOperands(rng: () => number, difficulty: AdditionDifficulty): { a: number; b: number } {
  // Prefer 1–2 digit addends.
  const aIsTwoDigit = rng() < 0.7;
  const bIsTwoDigit = rng() < 0.7;

  const a = aIsTwoDigit ? randInt(rng, 10, 99) : randInt(rng, 0, 9);
  let b = bIsTwoDigit ? randInt(rng, 10, 99) : randInt(rng, 0, 9);

  // Enforce ones carry constraints.
  const a1 = a % 10;
  const b1 = b % 10;
  const onesSum = a1 + b1;

  if (difficulty === 'easy') {
    // No carry in ones.
    if (onesSum >= 10) {
      const maxB1 = 9 - a1;
      const newB1 = randInt(rng, 0, Math.max(0, maxB1));
      b = Math.floor(b / 10) * 10 + newB1;
    }
  }

  if (difficulty === 'medium') {
    // Carry allowed; no extra constraints.
  }

  if (difficulty === 'hard') {
    // Encourage carry sometimes.
    if (onesSum < 10 && rng() < 0.6) {
      const minB1 = Math.max(0, 10 - a1);
      const newB1 = randInt(rng, minB1, 9);
      b = Math.floor(b / 10) * 10 + newB1;
    }
  }

  // Keep sums within 0..999.
  if (a + b > 999) {
    const target = randInt(rng, 0, 999);
    const newA = Math.min(a, target);
    const newB = Math.max(0, target - newA);
    return { a: newA, b: newB };
  }

  return { a, b };
}

function makePlaceValueOperands(rng: () => number): [number, number, number] {
  // Exactly H + T + O, like 200 + 60 + 3
  const h = randInt(rng, 0, 9) * 100;
  const t = randInt(rng, 0, 9) * 10;
  const o = randInt(rng, 0, 9);

  // Avoid the all-zero trivial case.
  if (h === 0 && t === 0 && o === 0) return [100, 0, 0];
  return [h, t, o];
}

function makeMentalMathOperands(rng: () => number): { a: number; b: number } {
  const tens = randInt(rng, 0, 99) * 10;
  const small = randInt(rng, 0, 9);

  const a = tens;
  const b = small;

  if (a + b <= 999) return { a, b };
  return { a: randInt(rng, 0, 900), b: randInt(rng, 0, 9) };
}

function makeMissingAddend(rng: () => number, difficulty: AdditionDifficulty): { total: number; known: number; missing: 'a' | 'b' } {
  const missing = rng() < 0.5 ? 'a' : 'b';

  // Use the same constraints as basic, but pick total and known.
  const { a, b } = makeBasicOperands(rng, difficulty);
  const total = a + b;
  const known = missing === 'a' ? b : a;

  return { total, known, missing };
}

function makeEquivalenceMcq(rng: () => number, difficulty: AdditionDifficulty): { a: number; b: number } {
  const { a, b } = makeBasicOperands(rng, difficulty);
  return { a, b };
}

function buildEquivalenceOptions(rng: () => number, a: number, b: number): MCQOption[] {
  const correct = a + b;

  const opts: MCQOption[] = [];
  const pushUnique = (option: MCQOption) => {
    if (option.value < 0) return;
    if (opts.some((o) => o.value === option.value)) return;
    if (opts.some((o) => o.label === option.label)) return;
    opts.push(option);
  };

  // Correct option is commuted order.
  pushUnique({ label: `${b} + ${a}`, value: correct });

  // Plausible distractors (must be != correct)
  const d1 = a + (b + 1);
  if (d1 !== correct) pushUnique({ label: `${a} + ${b + 1}`, value: d1 });

  const d2 = Math.abs(b - a);
  if (d2 !== correct) pushUnique({ label: `${b} - ${a}`, value: d2 });

  const d3 = a * b;
  if (d3 !== correct && d3 <= 999) pushUnique({ label: `${a} × ${b}`, value: d3 });

  // Backfill with near sums if needed.
  while (opts.length < 4) {
    const da = clampNonNegative(a + randInt(rng, -2, 2));
    const db = clampNonNegative(b + randInt(rng, -2, 2));
    const v = da + db;
    if (v === correct) continue;
    const label = `${da} + ${db}`;
    if (opts.some((o) => o.label === label)) continue;
    if (opts.some((o) => o.value === v)) continue;
    opts.push({ label, value: v });
  }

  // Ensure exactly 4 and exactly 1 correct.
  const trimmed = opts.slice(0, 4);
  const correctCount = trimmed.filter((o) => o.value === correct).length;
  if (correctCount !== 1) {
    // Rebuild with strict rules.
    const out: MCQOption[] = [{ label: `${b} + ${a}`, value: correct }];
    const pool: MCQOption[] = [];
    pool.push({ label: `${b} - ${a}`, value: Math.abs(b - a) });
    pool.push({ label: `${a} + ${b + 1}`, value: a + (b + 1) });
    pool.push({ label: `${a} + ${Math.max(0, b - 1)}`, value: a + Math.max(0, b - 1) });
    pool.push({ label: `${a} × ${b}`, value: a * b });

    for (const p of pool) {
      if (out.length >= 4) break;
      if (p.value === correct) continue;
      if (out.some((o) => o.label === p.label)) continue;
      if (out.some((o) => o.value === p.value)) continue;
      if (p.value < 0) continue;
      out.push(p);
    }

    while (out.length < 4) {
      const v = clampNonNegative(correct + randInt(rng, -15, 15));
      if (v === correct) continue;
      const label = String(v);
      if (out.some((o) => o.label === label)) continue;
      if (out.some((o) => o.value === v)) continue;
      out.push({ label, value: v });
    }

    // Shuffle
    for (let i = out.length - 1; i > 0; i--) {
      const j = randInt(rng, 0, i);
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }

    return out;
  }

  // Shuffle
  for (let i = trimmed.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    const tmp = trimmed[i];
    trimmed[i] = trimmed[j];
    trimmed[j] = tmp;
  }

  return trimmed;
}

export function validateProblem(problem: AdditionProblem): void {
  if (!problem || typeof problem !== 'object') throw new Error('Problem missing');
  if (!problem.id) throw new Error('Problem id missing');
  if (problem.kind !== 'mcq' && problem.kind !== 'input') throw new Error('Invalid kind');
  if (!problem.prompt || typeof problem.prompt !== 'string') throw new Error('Prompt missing');
  if (!Number.isInteger(problem.correctAnswer) || problem.correctAnswer < 0 || problem.correctAnswer > 999) {
    throw new Error(`Invalid correctAnswer: ${problem.correctAnswer}`);
  }

  const computed = expectedAnswer(problem);
  if (computed !== problem.correctAnswer) {
    throw new Error(`Correct answer mismatch (computed ${computed}, stored ${problem.correctAnswer})`);
  }

  if (problem.kind === 'mcq') {
    if (!problem.options || !Array.isArray(problem.options)) throw new Error('MCQ options missing');
    if (problem.options.length !== 4) throw new Error('MCQ must have exactly 4 options');

    const values = problem.options.map((o) => o.value);
    const uniqValues = new Set(values);
    if (uniqValues.size !== 4) throw new Error('MCQ option values must be unique');

    if (values.some((v) => v < 0)) throw new Error('MCQ options must be non-negative');

    const correctCount = values.filter((v) => v === problem.correctAnswer).length;
    if (correctCount !== 1) throw new Error('MCQ must include exactly 1 correct option');

    if (problem.options.some((o) => typeof o.label !== 'string' || o.label.trim() === '')) {
      throw new Error('MCQ options must have labels');
    }
  } else {
    if (problem.options != null) throw new Error('Input problems must not have options');
  }

  // Basic operand sanity
  if (!problem.operands) throw new Error('Operands missing');
  if (problem.operands.mode === 'placeValue') {
    const [h, t, o] = problem.operands.parts;
    if (h % 100 !== 0 || t % 10 !== 0) throw new Error('Invalid placeValue parts');
    if (o < 0 || o > 9) throw new Error('Invalid ones part');
  }
}

export function generateAdditionPage(params: GenerateAdditionPageParams): AdditionProblem[] {
  const {
    seed,
    count = 10,
    difficulty = 'easy',
    mixWeights = {
      basic: 5,
      placeValue: 3,
      missingAddend: 1,
      equivalence: 1,
      mentalMath: 2,
    },
  } = params;

  const rng = mulberry32(hashStringToUint32(seed));

  const weights: Record<string, number> = {
    basic: mixWeights.basic ?? 0,
    placeValue: mixWeights.placeValue ?? 0,
    missingAddend: mixWeights.missingAddend ?? 0,
    equivalence: mixWeights.equivalence ?? 0,
    mentalMath: mixWeights.mentalMath ?? 0,
  };

  const problems: AdditionProblem[] = [];

  for (let i = 0; i < count; i++) {
    const mode = chooseWeighted(rng, weights) as AdditionMode;

    if (mode === 'basic') {
      const { a, b } = makeBasicOperands(rng, difficulty);
      const correct = a + b;
      const id = makeProblemId(seed, i, mode, 'mcq');
      const prompt = `${a} + ${b} = ?`;
      const options = buildMcqOptionsNumeric(rng, correct, { a, b });

      const problem: AdditionProblem = {
        id,
        kind: 'mcq',
        difficulty,
        mode,
        prompt,
        operands: { mode: 'basic', a, b },
        correctAnswer: correct,
        options,
        explanationSteps: [],
      };

      validateProblem(problem);
      problems.push(problem);
      continue;
    }

    if (mode === 'placeValue') {
      const parts = makePlaceValueOperands(rng);
      const correct = parts[0] + parts[1] + parts[2];
      const id = makeProblemId(seed, i, mode, 'mcq');
      const prompt = `${parts[0]} + ${parts[1]} + ${parts[2]} = ?`;
      const options = buildMcqOptionsNumeric(rng, correct, { placeValueParts: parts });

      const problem: AdditionProblem = {
        id,
        kind: 'mcq',
        difficulty,
        mode,
        prompt,
        operands: { mode: 'placeValue', parts },
        correctAnswer: correct,
        options,
        explanationSteps: [],
      };

      validateProblem(problem);
      problems.push(problem);
      continue;
    }

    if (mode === 'missingAddend') {
      const { total, known, missing } = makeMissingAddend(rng, difficulty);
      const missingValue = total - known;
      const id = makeProblemId(seed, i, mode, 'input');

      const prompt = missing === 'a' ? `___ + ${known} = ${total}` : `${known} + ___ = ${total}`;

      const problem: AdditionProblem = {
        id,
        kind: 'input',
        difficulty,
        mode,
        prompt,
        operands: { mode: 'missingAddend', total, known, missing },
        correctAnswer: missingValue,
        explanationSteps: [],
      };

      validateProblem(problem);
      problems.push(problem);
      continue;
    }

    if (mode === 'equivalence') {
      const { a, b } = makeEquivalenceMcq(rng, difficulty);
      const correct = a + b;
      const id = makeProblemId(seed, i, mode, 'mcq');
      const prompt = `Which of these is equal to ${a} + ${b}?`;
      const options = buildEquivalenceOptions(rng, a, b);

      const problem: AdditionProblem = {
        id,
        kind: 'mcq',
        difficulty,
        mode,
        prompt,
        operands: { mode: 'equivalence', a, b },
        correctAnswer: correct,
        options,
        explanationSteps: [],
      };

      validateProblem(problem);
      problems.push(problem);
      continue;
    }

    if (mode === 'mentalMath') {
      const { a, b } = makeMentalMathOperands(rng);
      const correct = a + b;
      const id = makeProblemId(seed, i, mode, 'mcq');
      const prompt = `${a} + ${b} = ?`;
      const options = buildMcqOptionsNumeric(rng, correct, { a, b });

      const problem: AdditionProblem = {
        id,
        kind: 'mcq',
        difficulty,
        mode,
        prompt,
        operands: { mode: 'mentalMath', a, b },
        correctAnswer: correct,
        options,
        explanationSteps: [],
      };

      validateProblem(problem);
      problems.push(problem);
      continue;
    }

    const _exhaustive: never = mode;
    throw new Error(`Unhandled mode: ${_exhaustive}`);
  }

  return problems;
}

export function runSelfTest(): { ok: boolean; issues: string[] } {
  const issues: string[] = [];

  const difficulties: AdditionDifficulty[] = ['easy', 'medium', 'hard'];
  const modes: AdditionMode[] = ['basic', 'placeValue', 'missingAddend', 'equivalence', 'mentalMath'];

  for (const difficulty of difficulties) {
    for (let i = 0; i < 200; i++) {
      const seed = `selftest:${difficulty}:${i}`;
      const mixWeights: Partial<Record<AdditionMode, number>> = Object.fromEntries(
        modes.map((m) => [m, 1])
      ) as any;

      let problems: AdditionProblem[] = [];
      try {
        problems = generateAdditionPage({ seed, count: 1, difficulty, mixWeights });
      } catch (e) {
        issues.push(`generate failed (${difficulty}) seed=${seed}: ${(e as Error)?.message ?? String(e)}`);
        continue;
      }

      const p = problems[0];
      try {
        validateProblem(p);
      } catch (e) {
        issues.push(`validate failed (${difficulty}) mode=${p?.mode} seed=${seed}: ${(e as Error)?.message ?? String(e)}`);
      }

      // Determinism check.
      try {
        const again = generateAdditionPage({ seed, count: 1, difficulty, mixWeights })[0];
        const a = JSON.stringify(p);
        const b = JSON.stringify(again);
        if (a !== b) issues.push(`non-deterministic (${difficulty}) seed=${seed}`);
      } catch (e) {
        issues.push(`determinism regen failed (${difficulty}) seed=${seed}: ${(e as Error)?.message ?? String(e)}`);
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

declare global {
  interface Window {
    runAdditionSelfTest?: () => { ok: boolean; issues: string[] };
  }
}

if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  window.runAdditionSelfTest = runSelfTest;
}
