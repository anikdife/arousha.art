// src/lib/additionWordProblemGenerator.ts

export type WordProblemDifficulty = 'easy' | 'medium' | 'hard';

export type AdditionWordProblem = {
  id: string;
  kind: 'word-input' | 'word-mcq';
  difficulty: WordProblemDifficulty;
  prompt: string;
  a: number;
  b: number;
  total: number;
  unit: string;
  contextTag: string;
  options?: number[];
  explanationSteps?: string[];
};

export type GenerateAdditionWordProblemsParams = {
  seed: string;
  count?: number;
  difficulty?: WordProblemDifficulty;
  mix?: { input: number; mcq: number };
  maxTotal?: number;
};

const FORBIDDEN_WORDS = [
  'eaten',
  'ate',
  'left',
  'remaining',
  'gave away',
  'lost',
  'fewer',
  'reduce',
  'decrease',
  'how many more',
  'difference',
] as const;

type Template = {
  key: string;
  unit: string;
  contextTag: string;
  requiredPhrase: 'altogether' | 'in total' | 'total now';
  buildPrompt: (a: number, b: number, unit: string) => string;
};

const TEMPLATES: Template[] = [
  // A) Combine two groups
  {
    key: 'combine-stickers-school',
    unit: 'stickers',
    contextTag: 'school',
    requiredPhrase: 'altogether',
    buildPrompt: (a, b, unit) => `Lina has ${a} ${unit}. Amir has ${b} ${unit}. How many ${unit} do they have altogether?`,
  },
  {
    key: 'combine-toycars-toys',
    unit: 'toy cars',
    contextTag: 'toys',
    requiredPhrase: 'altogether',
    buildPrompt: (a, b, unit) => `Sam has ${a} ${unit}. Mia has ${b} ${unit}. How many ${unit} do they have altogether?`,
  },

  // B) Increase by receiving more
  {
    key: 'increase-apples-home',
    unit: 'apples',
    contextTag: 'home',
    requiredPhrase: 'total now',
    buildPrompt: (a, b, unit) => `There are ${a} ${unit} in a bowl. Mum adds ${b} more ${unit}. How many ${unit} are in the bowl total now?`,
  },
  {
    key: 'increase-pencils-school',
    unit: 'pencils',
    contextTag: 'school',
    requiredPhrase: 'total now',
    buildPrompt: (a, b, unit) => `There are ${a} ${unit} in a pencil case. A friend puts ${b} more ${unit} in. How many ${unit} are there in total now?`,
  },

  // C) Classroom collection
  {
    key: 'class-pages-school',
    unit: 'pages',
    contextTag: 'school',
    requiredPhrase: 'in total',
    buildPrompt: (a, b, unit) => `The class read ${a} ${unit} on Monday and ${b} ${unit} on Tuesday. How many ${unit} did they read in total?`,
  },
  {
    key: 'class-books-school',
    unit: 'books',
    contextTag: 'school',
    requiredPhrase: 'in total',
    buildPrompt: (a, b, unit) => `A class collected ${a} ${unit} for a reading corner. Then they collected ${b} more ${unit}. How many ${unit} did they collect in total?`,
  },

  // D) Shopping add-on
  {
    key: 'shop-balloons-shopping',
    unit: 'balloons',
    contextTag: 'shopping',
    requiredPhrase: 'total now',
    buildPrompt: (a, b, unit) => `A shop has ${a} ${unit}. The owner brings ${b} more ${unit}. How many ${unit} are there total now?`,
  },
  {
    key: 'shop-cupcakes-shopping',
    unit: 'cupcakes',
    contextTag: 'shopping',
    requiredPhrase: 'total now',
    buildPrompt: (a, b, unit) => `A bakery made ${a} ${unit} in the morning. Then the bakery made ${b} more ${unit}. How many ${unit} are there total now?`,
  },

  // E) Building blocks / toys
  {
    key: 'toys-blocks-toys',
    unit: 'blocks',
    contextTag: 'toys',
    requiredPhrase: 'total now',
    buildPrompt: (a, b, unit) => `Sam builds a tower with ${a} ${unit}. Then Sam adds ${b} more ${unit}. How many ${unit} are in the tower total now?`,
  },
  {
    key: 'toys-shells-toys',
    unit: 'shells',
    contextTag: 'toys',
    requiredPhrase: 'altogether',
    buildPrompt: (a, b, unit) => `Ava has ${a} ${unit}. Then Ava finds ${b} more ${unit}. How many ${unit} does Ava have altogether?`,
  },

  // F) Groups in containers
  {
    key: 'containers-marbles-toys',
    unit: 'marbles',
    contextTag: 'toys',
    requiredPhrase: 'altogether',
    buildPrompt: (a, b, unit) => `There are ${a} ${unit} in one bag and ${b} ${unit} in another bag. How many ${unit} are there altogether?`,
  },
  {
    key: 'containers-coins-home',
    unit: 'coins',
    contextTag: 'home',
    requiredPhrase: 'in total',
    buildPrompt: (a, b, unit) => `There are ${a} ${unit} in one jar and ${b} ${unit} in another jar. How many ${unit} are there in total?`,
  },

  // G) Event counts
  {
    key: 'event-club-school',
    unit: 'students',
    contextTag: 'school',
    requiredPhrase: 'in total',
    buildPrompt: (a, b, unit) => `${a} ${unit} joined the library club in Term 1 and ${b} more ${unit} joined in Term 2. How many ${unit} joined in total?`,
  },
];

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
  if (max < min) throw new Error('randInt max < min');
  const r = rng();
  return Math.floor(r * (max - min + 1)) + min;
}

function shuffleInPlace<T>(rng: () => number, arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function chooseWeighted(rng: () => number, weights: { input: number; mcq: number }): 'word-input' | 'word-mcq' {
  const a = Math.max(0, weights.input ?? 0);
  const b = Math.max(0, weights.mcq ?? 0);
  const total = a + b;
  if (total <= 0) return 'word-input';
  const t = rng() * total;
  return t < a ? 'word-input' : 'word-mcq';
}

function normalizeMaxTotal(difficulty: WordProblemDifficulty, maxTotal?: number): number {
  const base = difficulty === 'easy' ? 40 : difficulty === 'medium' ? 200 : 999;
  if (maxTotal == null) return base;
  if (!Number.isFinite(maxTotal)) return base;
  return Math.max(0, Math.min(999, Math.floor(maxTotal)));
}

function pickAddends(
  rng: () => number,
  difficulty: WordProblemDifficulty,
  maxTotal: number
): { a: number; b: number; total: number } {
  const tries = 200;

  for (let i = 0; i < tries; i++) {
    let a = 0;
    let b = 0;

    if (difficulty === 'easy') {
      a = randInt(rng, 0, 20);
      b = randInt(rng, 0, 20);
      const total = a + b;
      if (total <= 40 && total <= maxTotal) return { a, b, total };
      continue;
    }

    if (difficulty === 'medium') {
      a = randInt(rng, 10, 99);
      b = randInt(rng, 10, 99);
      const total = a + b;
      if (total <= 200 && total <= maxTotal) return { a, b, total };
      continue;
    }

    // hard
    a = randInt(rng, 50, 399);
    b = randInt(rng, 50, 399);
    const total = a + b;
    if (total <= 999 && total <= maxTotal) return { a, b, total };
  }

  // Deterministic fallback
  const a = difficulty === 'easy' ? 10 : difficulty === 'medium' ? 55 : 250;
  const b = difficulty === 'easy' ? 9 : difficulty === 'medium' ? 45 : 249;
  const total = Math.min(a + b, maxTotal);
  return { a: Math.max(0, total - b), b, total: Math.max(0, total - b) + b };
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

function reverseDigits(n: number): number | null {
  const s = String(Math.abs(n));
  if (s.length < 2) return null;
  const r = Number(s.split('').reverse().join(''));
  if (!Number.isFinite(r)) return null;
  return r;
}

function buildDistractors(params: {
  rng: () => number;
  a: number;
  b: number;
  total: number;
  maxTotal: number;
}): number[] {
  const { rng, a, b, total, maxTotal } = params;

  const candidates: number[] = [];

  // off-by-1
  if (total - 1 >= 0) candidates.push(total - 1);
  if (total + 1 <= maxTotal) candidates.push(total + 1);

  // off-by-10
  if (total - 10 >= 0) candidates.push(total - 10);
  if (total + 10 <= maxTotal) candidates.push(total + 10);

  // common carry mistake for two-digit numbers
  if (a >= 10 && a <= 99 && b >= 10 && b <= 99) {
    const onesSum = (a % 10) + (b % 10);
    const tensSum = (Math.floor(a / 10) + Math.floor(b / 10)) * 10;

    const onesOnly = onesSum;
    const tensOnly = tensSum;

    if (onesOnly >= 0 && onesOnly <= maxTotal) candidates.push(onesOnly);
    if (tensOnly >= 0 && tensOnly <= maxTotal) candidates.push(tensOnly);

    // no-carry mistake: keep only ones digit when onesSum >= 10
    if (onesSum >= 10) {
      const noCarry = tensSum + (onesSum % 10);
      if (noCarry >= 0 && noCarry <= maxTotal) candidates.push(noCarry);
    }
  }

  // digit swap of total (reverse)
  const swapped = reverseDigits(total);
  if (swapped != null && swapped !== total && swapped >= 0 && swapped <= maxTotal) candidates.push(swapped);

  const filtered = uniqueNumbers(candidates).filter((n) => Number.isInteger(n) && n >= 0 && n <= maxTotal && n !== total);

  // Keep some determinism but also variety
  shuffleInPlace(rng, filtered);
  return filtered;
}

function buildOptions(params: {
  rng: () => number;
  a: number;
  b: number;
  total: number;
  maxTotal: number;
}): number[] {
  const { rng, a, b, total, maxTotal } = params;

  const out: number[] = [total];

  const distractors = buildDistractors({ rng, a, b, total, maxTotal });
  for (const d of distractors) {
    if (out.length >= 4) break;
    if (!out.includes(d)) out.push(d);
  }

  // Backfill
  while (out.length < 4) {
    const delta = randInt(rng, -25, 25);
    const v = Math.max(0, Math.min(maxTotal, total + delta));
    if (v === total) continue;
    if (out.includes(v)) continue;
    out.push(v);
  }

  // Shuffle so correct is not always first
  shuffleInPlace(rng, out);

  // Ensure correct appears exactly once and options are unique
  const uniq = uniqueNumbers(out);
  if (uniq.length !== 4 || uniq.filter((n) => n === total).length !== 1) {
    const fixed = uniqueNumbers([total, ...out.filter((n) => n !== total)]);
    while (fixed.length < 4) {
      const v = Math.max(0, Math.min(maxTotal, total + randInt(rng, -40, 40)));
      if (v !== total && !fixed.includes(v)) fixed.push(v);
    }
    shuffleInPlace(rng, fixed);
    return fixed.slice(0, 4);
  }

  return uniq;
}

function makeProblemId(seed: string, index: number, templateKey: string, kind: 'word-input' | 'word-mcq'): string {
  const h = hashStringToUint32(`${seed}|${index}|${templateKey}|${kind}`);
  return `addw-${h.toString(16).padStart(8, '0')}`;
}

function validate(problem: AdditionWordProblem): void {
  if (!problem || typeof problem !== 'object') throw new Error('Problem missing');
  if (!problem.id) throw new Error('Problem id missing');
  if (problem.kind !== 'word-input' && problem.kind !== 'word-mcq') throw new Error('Invalid kind');
  if (!problem.prompt || typeof problem.prompt !== 'string') throw new Error('Prompt missing');
  if (!Number.isInteger(problem.a) || !Number.isInteger(problem.b) || !Number.isInteger(problem.total)) throw new Error('Non-integer values');
  if (problem.total !== problem.a + problem.b) throw new Error('Total mismatch');
  if (problem.total < 0 || problem.total > 999) throw new Error('Total out of bounds');
  if (!problem.unit || typeof problem.unit !== 'string') throw new Error('Unit missing');
  if (!problem.contextTag || typeof problem.contextTag !== 'string') throw new Error('Context missing');

  const promptLower = problem.prompt.toLowerCase();
  const unitLower = problem.unit.toLowerCase();

  if (!promptLower.includes(unitLower)) throw new Error('Prompt missing unit');

  const hasRequired = promptLower.includes('altogether') || promptLower.includes('in total') || promptLower.includes('total now');
  if (!hasRequired) throw new Error('Prompt missing required phrase');

  for (const w of FORBIDDEN_WORDS) {
    if (promptLower.includes(w)) throw new Error(`Forbidden word found: ${w}`);
  }

  const d = problem.difficulty;
  if (d === 'easy') {
    if (problem.a < 0 || problem.a > 20 || problem.b < 0 || problem.b > 20) throw new Error('Easy addends out of range');
    if (problem.total > 40) throw new Error('Easy total out of range');
  }

  if (d === 'medium') {
    if (problem.a < 10 || problem.a > 99 || problem.b < 10 || problem.b > 99) throw new Error('Medium addends out of range');
    if (problem.total > 200) throw new Error('Medium total out of range');
  }

  if (d === 'hard') {
    if (problem.a < 50 || problem.a > 399 || problem.b < 50 || problem.b > 399) throw new Error('Hard addends out of range');
    if (problem.total > 999) throw new Error('Hard total out of range');
  }

  if (problem.kind === 'word-mcq') {
    if (!problem.options || !Array.isArray(problem.options)) throw new Error('MCQ options missing');
    if (problem.options.length !== 4) throw new Error('MCQ must have exactly 4 options');
    const uniq = new Set(problem.options);
    if (uniq.size !== 4) throw new Error('MCQ options must be unique');
    const correctCount = problem.options.filter((n) => n === problem.total).length;
    if (correctCount !== 1) throw new Error('MCQ must include correct exactly once');
    if (problem.options.some((n) => !Number.isInteger(n) || n < 0 || n > 999)) throw new Error('MCQ options out of range');
  } else {
    if (problem.options != null) throw new Error('Input problems must not have options');
  }
}

export function expectedAnswer(problem: AdditionWordProblem): number {
  return problem.total;
}

export function generateAdditionWordProblems(params: GenerateAdditionWordProblemsParams): AdditionWordProblem[] {
  const {
    seed,
    count = 10,
    difficulty = 'easy',
    mix = { input: 7, mcq: 3 },
    maxTotal: maxTotalParam,
  } = params;

  const maxTotal = normalizeMaxTotal(difficulty, maxTotalParam);
  const rng = mulberry32(hashStringToUint32(seed));

  const out: AdditionWordProblem[] = [];

  for (let i = 0; i < count; i++) {
    const template = TEMPLATES[randInt(rng, 0, TEMPLATES.length - 1)];
    const kind = chooseWeighted(rng, mix);
    const { a, b, total } = pickAddends(rng, difficulty, maxTotal);

    const prompt = template.buildPrompt(a, b, template.unit);

    const problem: AdditionWordProblem = {
      id: makeProblemId(seed, i, template.key, kind),
      kind,
      difficulty,
      prompt,
      a,
      b,
      total,
      unit: template.unit,
      contextTag: template.contextTag,
      explanationSteps: [],
    };

    if (kind === 'word-mcq') {
      const options = buildOptions({ rng, a, b, total, maxTotal });
      problem.options = options;
    }

    validate(problem);
    out.push(problem);
  }

  return out;
}

export function runSelfTest(): { ok: boolean; issues: string[] } {
  const issues: string[] = [];

  const seeds = ['seed-a', 'seed-b', 'seed-c'];
  const diffs: WordProblemDifficulty[] = ['easy', 'medium', 'hard'];

  for (const d of diffs) {
    for (const s of seeds) {
      try {
        const p1 = generateAdditionWordProblems({ seed: `${s}:${d}`, count: 12, difficulty: d, mix: { input: 5, mcq: 5 } });
        const p2 = generateAdditionWordProblems({ seed: `${s}:${d}`, count: 12, difficulty: d, mix: { input: 5, mcq: 5 } });

        const sig1 = p1.map((p) => `${p.id}|${p.prompt}|${p.kind}|${p.total}`).join('||');
        const sig2 = p2.map((p) => `${p.id}|${p.prompt}|${p.kind}|${p.total}`).join('||');
        if (sig1 !== sig2) issues.push(`Determinism failed for ${d}:${s}`);

        for (const p of p1) {
          validate(p);
          if (expectedAnswer(p) !== p.total) issues.push(`Expected mismatch: ${p.id}`);
        }

        // Ensure templates cover required phrases and don't contain forbidden words
        const combined = p1.map((p) => p.prompt.toLowerCase()).join(' ');
        for (const w of FORBIDDEN_WORDS) {
          if (combined.includes(w)) issues.push(`Forbidden word appeared in batch (${d}:${s}): ${w}`);
        }
      } catch (e) {
        issues.push(`Exception for ${d}:${s}: ${(e as Error)?.message ?? String(e)}`);
      }
    }
  }

  // Template sanity
  if (TEMPLATES.length < 10 || TEMPLATES.length > 16) {
    issues.push(`Template count must be 10..16, got ${TEMPLATES.length}`);
  }

  const requiredCategories: Array<Template['key']> = [
    'combine-stickers-school',
    'increase-apples-home',
    'class-pages-school',
    'shop-balloons-shopping',
    'toys-blocks-toys',
    'containers-marbles-toys',
    'event-club-school',
  ];

  for (const k of requiredCategories) {
    if (!TEMPLATES.some((t) => t.key === k)) issues.push(`Missing required template: ${k}`);
  }

  return { ok: issues.length === 0, issues };
}

declare global {
  interface Window {
    runAdditionWordSelfTest?: () => { ok: boolean; issues: string[] };
  }
}

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.runAdditionWordSelfTest = runSelfTest;
}
