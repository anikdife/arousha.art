export type MultiplicationProblemKind =
  | 'FACT'
  | 'MISSING_FACTOR'
  | 'REPEATED_ADDITION'
  | 'ARRAY_GROUPS'
  | 'WORD_PROBLEM'
  | 'EQUIVALENCE_CHOICE';

export interface MultiplicationGeneratorOptions {
  difficulty: 'easy' | 'medium';
  count: number;
  seedKey: string;
  includeKinds?: Partial<Record<MultiplicationProblemKind, number>>;
  maxFactorA?: number;
  maxFactorB?: number;
  allowZero?: boolean;
  allowOne?: boolean;
  mcqChoices?: number;
  ensureUniquenessWithinPage?: boolean;
}

export type ArrayGroupsMeta = {
  rows: number;
  cols: number;
  labelItem: string;
  labelGroup: string;
};

export type WordProblemMeta = {
  templateId: string;
  noun: string;
  groupLabel: string;
  itemLabel: string;
};

export type McqMeta = {
  options: number[];
  correctIndex: number;
};

export interface MultiplicationProblem {
  id: string;
  kind: MultiplicationProblemKind;
  a?: number;
  b?: number;
  total?: number;
  prompt: string;
  answer: number;
  mcq?: McqMeta;
  meta?: ArrayGroupsMeta | WordProblemMeta | Record<string, unknown>;
}

export function stableHashSeed(input: string): number {
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Ensure unsigned 32-bit
  return hash >>> 0;
}

export function makeRng(seed: number): () => number {
  // mulberry32
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

type MultiplicationPage = { pageId: string; problems: MultiplicationProblem[] };

type NounSet = {
  id: string;
  group: { singular: string; plural: string };
  item: { singular: string; plural: string };
};

const NOUN_SETS: NounSet[] = [
  { id: 'bags_apples', group: { singular: 'bag', plural: 'bags' }, item: { singular: 'apple', plural: 'apples' } },
  { id: 'cars_people', group: { singular: 'car', plural: 'cars' }, item: { singular: 'person', plural: 'people' } },
  { id: 'students_blocks', group: { singular: 'student', plural: 'students' }, item: { singular: 'block', plural: 'blocks' } },
  { id: 'boxes_pencils', group: { singular: 'box', plural: 'boxes' }, item: { singular: 'pencil', plural: 'pencils' } },
  { id: 'plates_cupcakes', group: { singular: 'plate', plural: 'plates' }, item: { singular: 'cupcake', plural: 'cupcakes' } },
  { id: 'shelves_books', group: { singular: 'shelf', plural: 'shelves' }, item: { singular: 'book', plural: 'books' } },
  { id: 'packets_stickers', group: { singular: 'packet', plural: 'packets' }, item: { singular: 'sticker', plural: 'stickers' } },
  { id: 'rows_chairs', group: { singular: 'row', plural: 'rows' }, item: { singular: 'chair', plural: 'chairs' } },
  { id: 'trays_eggs', group: { singular: 'tray', plural: 'trays' }, item: { singular: 'egg', plural: 'eggs' } },
  { id: 'teams_players', group: { singular: 'team', plural: 'teams' }, item: { singular: 'player', plural: 'players' } },
  { id: 'buses_children', group: { singular: 'bus', plural: 'buses' }, item: { singular: 'child', plural: 'children' } },
  { id: 'tables_chairs', group: { singular: 'table', plural: 'tables' }, item: { singular: 'chair', plural: 'chairs' } },
];

function pluralize(noun: { singular: string; plural: string } | string, count: number): string {
  if (typeof noun === 'string') return count === 1 ? noun : `${noun}s`;
  return count === 1 ? noun.singular : noun.plural;
}

function randInt(rng: () => number, min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(rng() * (hi - lo + 1)) + lo;
}

function pickOne<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function pickWeightedKind(
  rng: () => number,
  weights: Record<MultiplicationProblemKind, number>
): MultiplicationProblemKind {
  const entries = Object.entries(weights) as Array<[MultiplicationProblemKind, number]>;
  const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
  if (total <= 0) return 'FACT';

  let roll = rng() * total;
  for (const [kind, w] of entries) {
    const weight = Math.max(0, w);
    if (weight === 0) continue;
    if (roll < weight) return kind;
    roll -= weight;
  }
  return entries[entries.length - 1][0];
}

function canonicalPairKey(a: number, b: number): string {
  const x = Math.min(a, b);
  const y = Math.max(a, b);
  return `${x}x${y}`;
}

function defaultMaxTotal(difficulty: 'easy' | 'medium'): number {
  return difficulty === 'easy' ? 81 : 144;
}

function defaultWeights(difficulty: 'easy' | 'medium'): Record<MultiplicationProblemKind, number> {
  if (difficulty === 'easy') {
    return {
      FACT: 4,
      MISSING_FACTOR: 2,
      REPEATED_ADDITION: 2,
      ARRAY_GROUPS: 3,
      WORD_PROBLEM: 3,
      EQUIVALENCE_CHOICE: 2,
    };
  }

  return {
    FACT: 4,
    MISSING_FACTOR: 3,
    REPEATED_ADDITION: 2,
    ARRAY_GROUPS: 3,
    WORD_PROBLEM: 3,
    EQUIVALENCE_CHOICE: 3,
  };
}

function clampFactor(n: number, opts: Required<Pick<MultiplicationGeneratorOptions, 'allowZero' | 'allowOne'>>): boolean {
  if (!opts.allowZero && n === 0) return false;
  if (!opts.allowOne && n === 1) return false;
  return true;
}

function pickFactor(
  rng: () => number,
  max: number,
  opts: Required<Pick<MultiplicationGeneratorOptions, 'allowZero' | 'allowOne'>>
): number {
  // Try a few times to honor allowZero/allowOne.
  for (let i = 0; i < 50; i++) {
    const n = randInt(rng, 0, max);
    if (clampFactor(n, opts)) return n;
  }

  // Fallback to a safe value.
  if (opts.allowOne) return 1;
  if (opts.allowZero) return 0;
  return 2;
}

function pickFactorsWithMaxTotal(
  rng: () => number,
  maxA: number,
  maxB: number,
  maxTotal: number,
  opts: Required<Pick<MultiplicationGeneratorOptions, 'allowZero' | 'allowOne'>>
): { a: number; b: number } {
  for (let attempt = 0; attempt < 200; attempt++) {
    const a = pickFactor(rng, maxA, opts);
    const b = pickFactor(rng, maxB, opts);
    const total = a * b;
    if (total <= maxTotal) return { a, b };
  }

  // Guaranteed fallback within maxTotal by constraining b.
  const a = Math.min(pickFactor(rng, maxA, opts), maxA);
  const safeB = Math.min(maxB, Math.floor(maxTotal / Math.max(1, a)));
  const b = Math.max(0, safeB);
  return { a, b };
}

type WordTemplate = {
  id: string;
  render: (args: {
    a: number;
    b: number;
    group: { singular: string; plural: string };
    item: { singular: string; plural: string };
  }) => string;
};

const WORD_TEMPLATES: WordTemplate[] = [
  {
    id: 'bags_each',
    render: ({ a, b, group, item }) =>
      `There are ${a} ${pluralize(group, a)}. Each ${group.singular} has ${b} ${pluralize(item, b)}. How many ${item.plural} altogether?`,
  },
  {
    id: 'teacher_gives',
    render: ({ a, b, group, item }) =>
      `A teacher gives ${a} ${pluralize(group, a)} ${b} ${pluralize(item, b)} each. How many ${item.plural} are given altogether?`,
  },
  {
    id: 'cars_people',
    render: ({ a, b, group, item }) =>
      `There are ${a} ${pluralize(group, a)}. Each ${group.singular} has ${b} ${pluralize(item, b)}. How many ${item.plural} are there altogether?`,
  },
  {
    id: 'rows_in_room',
    render: ({ a, b, group, item }) =>
      `A room has ${a} ${pluralize(group, a)}. There are ${b} ${pluralize(item, b)} in each ${group.singular}. How many ${item.plural} are there?`,
  },
  {
    id: 'packs_items',
    render: ({ a, b, group, item }) =>
      `A shop sells ${a} ${pluralize(group, a)}. Each ${group.singular} has ${b} ${pluralize(item, b)}. How many ${item.plural} is that?`,
  },
  {
    id: 'shelves_books',
    render: ({ a, b, group, item }) =>
      `There are ${a} ${pluralize(group, a)}. Each ${group.singular} holds ${b} ${pluralize(item, b)}. How many ${item.plural} in total?`,
  },
  {
    id: 'teams_players',
    render: ({ a, b, group, item }) =>
      `There are ${a} ${pluralize(group, a)}. Each ${group.singular} has ${b} ${pluralize(item, b)}. How many ${item.plural} altogether?`,
  },
  {
    id: 'trays_eggs',
    render: ({ a, b, group, item }) =>
      `There are ${a} ${pluralize(group, a)}. Each ${group.singular} has ${b} ${pluralize(item, b)}. How many ${item.plural} is that altogether?`,
  },
];

function makeWordProblem(rng: () => number, a: number, b: number): { prompt: string; meta: WordProblemMeta } {
  const nounSet = pickOne(rng, NOUN_SETS);
  const template = pickOne(rng, WORD_TEMPLATES);

  const prompt = template.render({ a, b, group: nounSet.group, item: nounSet.item });
  return {
    prompt,
    meta: {
      templateId: template.id,
      noun: nounSet.id,
      groupLabel: nounSet.group.singular,
      itemLabel: nounSet.item.singular,
    },
  };
}

function makeEquivalenceChoices(
  rng: () => number,
  a: number,
  b: number,
  choices: number,
  opts: Required<Pick<MultiplicationGeneratorOptions, 'allowZero' | 'allowOne'>>
): McqMeta {
  const correct = a * b;
  const optionSet = new Set<number>();
  optionSet.add(correct);

  const candidates: number[] = [];
  candidates.push(a + b);
  candidates.push(correct + a);
  candidates.push(correct - a);
  candidates.push(correct + b);
  candidates.push(correct - b);
  candidates.push((a + 1) * b);
  candidates.push(Math.max(0, (a - 1) * b));
  candidates.push(a * (b + 1));
  candidates.push(Math.max(0, a * (b - 1)));

  // Bias to keep distractors reasonable.
  for (const c of candidates) {
    if (!opts.allowZero && c === 0) continue;
    if (!opts.allowOne && c === 1) continue;
    if (c < 0) continue;
    optionSet.add(c);
    if (optionSet.size >= choices) break;
  }

  while (optionSet.size < choices) {
    const jitter = randInt(rng, -6, 6);
    const maybe = Math.max(0, correct + jitter);
    if (!opts.allowZero && maybe === 0) continue;
    if (!opts.allowOne && maybe === 1) continue;
    optionSet.add(maybe);
  }

  const options = Array.from(optionSet);
  // Shuffle deterministically
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  const correctIndex = options.indexOf(correct);
  return { options, correctIndex };
}

export function formatMultiplicationPrompt(problem: MultiplicationProblem): string {
  switch (problem.kind) {
    case 'FACT':
      return `${problem.a} × ${problem.b} = ?`;
    case 'MISSING_FACTOR': {
      const a = problem.a;
      const b = problem.b;
      const total = problem.total;
      if (typeof a === 'number' && typeof b === 'number') return `${a} × ${b} = ${total}`;
      if (typeof a === 'number') return `${a} × ? = ${total}`;
      if (typeof b === 'number') return `? × ${b} = ${total}`;
      return `? × ? = ${total}`;
    }
    case 'REPEATED_ADDITION': {
      const a = problem.a ?? 0;
      const b = problem.b ?? 0;
      const parts = Array.from({ length: b }, () => a).join(' + ');
      return `${parts} = ?`;
    }
    case 'ARRAY_GROUPS':
      return problem.prompt;
    case 'WORD_PROBLEM':
      return problem.prompt;
    case 'EQUIVALENCE_CHOICE':
      return `Which is equal to ${problem.a} × ${problem.b}?`;
    default:
      return problem.prompt;
  }
}

export function evaluateMultiplicationAnswer(
  problem: MultiplicationProblem,
  userInput: string
): { ok: boolean; expected: number } {
  const expected = problem.answer;
  const trimmed = userInput.trim();
  if (!/^-?\d+$/.test(trimmed)) return { ok: false, expected };
  const value = parseInt(trimmed, 10);
  return { ok: value === expected, expected };
}

function buildProblem(
  rng: () => number,
  seedKey: string,
  index: number,
  kind: MultiplicationProblemKind,
  cfg: {
    difficulty: 'easy' | 'medium';
    maxA: number;
    maxB: number;
    maxTotal: number;
    allowZero: boolean;
    allowOne: boolean;
    mcqChoices: number;
  }
): MultiplicationProblem {
  const factorOpts = { allowZero: cfg.allowZero, allowOne: cfg.allowOne };

  switch (kind) {
    case 'FACT': {
      const { a, b } = pickFactorsWithMaxTotal(rng, cfg.maxA, cfg.maxB, cfg.maxTotal, factorOpts);
      const total = a * b;
      return {
        id: `mul-${stableHashSeed(`${seedKey}:p:${index}:fact:${a}:${b}`)}`,
        kind,
        a,
        b,
        total,
        answer: total,
        prompt: '',
      };
    }

    case 'MISSING_FACTOR': {
      const { a, b } = pickFactorsWithMaxTotal(rng, cfg.maxA, cfg.maxB, cfg.maxTotal, factorOpts);
      const total = a * b;
      const hideA = rng() < 0.5;
      return {
        id: `mul-${stableHashSeed(`${seedKey}:p:${index}:missing:${a}:${b}:${hideA ? 'a' : 'b'}`)}`,
        kind,
        a: hideA ? undefined : a,
        b: hideA ? b : undefined,
        total,
        answer: hideA ? a : b,
        prompt: '',
      };
    }

    case 'REPEATED_ADDITION': {
      const b = randInt(rng, 2, 6);
      const a = pickFactor(rng, cfg.maxA, factorOpts);
      const total = a * b;
      if (total > cfg.maxTotal) {
        const safeA = Math.max(0, Math.floor(cfg.maxTotal / b));
        return {
          id: `mul-${stableHashSeed(`${seedKey}:p:${index}:repeat:${safeA}:${b}`)}`,
          kind,
          a: safeA,
          b,
          total: safeA * b,
          answer: safeA * b,
          prompt: '',
        };
      }

      return {
        id: `mul-${stableHashSeed(`${seedKey}:p:${index}:repeat:${a}:${b}`)}`,
        kind,
        a,
        b,
        total,
        answer: total,
        prompt: '',
      };
    }

    case 'ARRAY_GROUPS': {
      const { a, b } = pickFactorsWithMaxTotal(rng, cfg.maxA, cfg.maxB, cfg.maxTotal, factorOpts);
      const nounSet = pickOne(rng, NOUN_SETS);
      const rows = a;
      const cols = b;
      const prompt = `There are ${rows} ${pluralize(nounSet.group, rows)} of ${cols} ${pluralize(
        nounSet.item,
        cols
      )}. How many ${nounSet.item.plural} altogether?`;

      return {
        id: `mul-${stableHashSeed(`${seedKey}:p:${index}:array:${rows}:${cols}:${nounSet.id}`)}`,
        kind,
        a: rows,
        b: cols,
        total: rows * cols,
        answer: rows * cols,
        prompt,
        meta: {
          rows,
          cols,
          labelItem: nounSet.item.singular,
          labelGroup: nounSet.group.singular,
        } satisfies ArrayGroupsMeta,
      };
    }

    case 'WORD_PROBLEM': {
      // Ensure we often cover singular/plural cases deterministically.
      const preferOne = rng() < 0.25;
      const preferTwo = rng() < 0.2;

      const a = preferOne ? 1 : preferTwo ? 2 : pickFactor(rng, cfg.maxA, factorOpts);
      const b = pickFactor(rng, cfg.maxB, factorOpts);
      const total = a * b;

      const cappedA = total > cfg.maxTotal ? Math.max(1, Math.floor(cfg.maxTotal / Math.max(1, b))) : a;
      const cappedTotal = cappedA * b;

      const { prompt, meta } = makeWordProblem(rng, cappedA, b);

      return {
        id: `mul-${stableHashSeed(`${seedKey}:p:${index}:word:${cappedA}:${b}:${meta.templateId}:${meta.noun}`)}`,
        kind,
        a: cappedA,
        b,
        total: cappedTotal,
        answer: cappedTotal,
        prompt,
        meta,
      };
    }

    case 'EQUIVALENCE_CHOICE': {
      const { a, b } = pickFactorsWithMaxTotal(rng, cfg.maxA, cfg.maxB, cfg.maxTotal, factorOpts);
      const mcq = makeEquivalenceChoices(rng, a, b, cfg.mcqChoices, factorOpts);
      return {
        id: `mul-${stableHashSeed(`${seedKey}:p:${index}:eq:${a}:${b}`)}`,
        kind,
        a,
        b,
        total: a * b,
        answer: a * b,
        prompt: '',
        mcq,
      };
    }
  }
}

function deducePair(problem: MultiplicationProblem): { a: number; b: number } | null {
  if (typeof problem.a === 'number' && typeof problem.b === 'number') {
    return { a: problem.a, b: problem.b };
  }

  if (problem.kind === 'MISSING_FACTOR' && typeof problem.total === 'number') {
    if (typeof problem.a === 'number' && typeof problem.b !== 'number') {
      // a × ? = total
      if (problem.a === 0) return { a: problem.a, b: 0 };
      if (problem.total % problem.a !== 0) return null;
      return { a: problem.a, b: problem.total / problem.a };
    }
    if (typeof problem.b === 'number' && typeof problem.a !== 'number') {
      // ? × b = total
      if (problem.b === 0) return { a: 0, b: problem.b };
      if (problem.total % problem.b !== 0) return null;
      return { a: problem.total / problem.b, b: problem.b };
    }
  }

  return null;
}

export function generateMultiplicationPage(options: MultiplicationGeneratorOptions): MultiplicationPage {
  const difficulty = options.difficulty;
  const maxA = options.maxFactorA ?? (difficulty === 'easy' ? 10 : 12);
  const maxB = options.maxFactorB ?? (difficulty === 'easy' ? 10 : 12);
  const allowZero = options.allowZero ?? true;
  const allowOne = options.allowOne ?? true;
  const mcqChoices = options.mcqChoices ?? 4;
  const ensureUnique = options.ensureUniquenessWithinPage ?? true;

  const maxTotal = defaultMaxTotal(difficulty);

  const seed = stableHashSeed(options.seedKey);
  const rng = makeRng(seed);

  const baseWeights = defaultWeights(difficulty);
  const weights: Record<MultiplicationProblemKind, number> = {
    ...baseWeights,
    ...(options.includeKinds ?? {}),
  };

  const usedPairs = new Set<string>();
  const problems: MultiplicationProblem[] = [];

  const pageId = `mul-page-${stableHashSeed(`page:${options.seedKey}`)}`;

  const cfg = { difficulty, maxA, maxB, maxTotal, allowZero, allowOne, mcqChoices };

  let attempts = 0;
  const maxAttempts = Math.max(200, options.count * 80);

  while (problems.length < options.count && attempts < maxAttempts) {
    attempts++;

    const kind = pickWeightedKind(rng, weights);
    const index = problems.length;

    const problem = buildProblem(rng, options.seedKey, index, kind, cfg);

    if (ensureUnique) {
      const pair = deducePair(problem);
      if (pair) {
        const key = canonicalPairKey(pair.a, pair.b);
        if (usedPairs.has(key)) continue;
        usedPairs.add(key);
      }
    }

    problem.prompt = formatMultiplicationPrompt(problem);
    problems.push(problem);
  }

  if (problems.length !== options.count) {
    throw new Error('Unable to generate a full multiplication page with the requested constraints.');
  }

  return { pageId, problems };
}
