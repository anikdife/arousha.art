// src/lib/dataProbability/generators.ts

import type { Question, Visual, Difficulty, Domain } from './types';
import { createRng } from './rng';
import { hashStringToUint32 } from '../hash';

function idFrom(seed: string, key: string): string {
  const h = hashStringToUint32(`${seed}:${key}`);
  return `dp-${h.toString(16)}`;
}

function uniqueStrings(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

function makeMcq(seed: string, correct: string, distractors: string[]): { choices: string[]; correctIndex: number } {
  const all = uniqueStrings([correct, ...distractors]).slice(0, 4);
  if (all.length !== 4) throw new Error('MCQ must have exactly 4 unique choices');
  const rng = createRng(`${seed}:mcq`);
  rng.shuffle(all);
  const idx = all.indexOf(correct);
  if (idx < 0) throw new Error('MCQ correct missing');
  return { choices: all, correctIndex: idx };
}

function nearbyNumbers(n: number): number[] {
  const c = [n - 2, n - 1, n + 1, n + 2, n + 3, n - 3].filter((x) => x >= 0);
  return uniqueStrings(c.map(String)).map(Number);
}

function pickDifficulty(rng: ReturnType<typeof createRng>): Difficulty {
  return (rng.pick([1, 2, 3] as const) as Difficulty) ?? 1;
}

function tallyString(n: number): string {
  const groups = Math.floor(n / 5);
  const rem = n % 5;
  const five = '||||\\';
  return `${Array.from({ length: groups }).map(() => five).join(' ')}${groups > 0 && rem > 0 ? ' ' : ''}${'|'.repeat(rem)}`.trim();
}

// ---------- DATA: Bar chart (favourite fruits style) ----------

const FRUITS = ['Apple', 'Banana', 'Grapes', 'Orange', 'Pear', 'Mango'] as const;

type BarVariant = 'read_value' | 'most_votes' | 'difference' | 'total';

export function makeBarChartQuestion(pageSeed: string, index: number): Question {
  const rng = createRng(`${pageSeed}:bar:${index}`);
  const difficulty = pickDifficulty(rng);

  const categories = rng.shuffle([...FRUITS]).slice(0, 4);
  const values = categories.map(() => rng.int(0, 8));

  // Ensure at least 2 distinct values.
  if (new Set(values).size < 2) {
    values[0] = 2;
    values[1] = 5;
  }

  const maxY = Math.max(6, Math.max(...values));
  const visual: Visual = {
    type: 'barChart',
    title: 'Favourite fruits',
    xLabel: 'Fruit',
    yLabel: 'Students',
    categories,
    values,
    maxY,
  };

  const variant: BarVariant = rng.pick(['read_value', 'most_votes', 'difference', 'total'] as const);

  if (variant === 'read_value') {
    const i = rng.int(0, categories.length - 1);
    const cat = categories[i];
    const v = values[i];
    const correct = String(v);
    const distractors = nearbyNumbers(v).filter((x) => x !== v).slice(0, 3).map(String);

    return {
      core: {
        id: idFrom(pageSeed, `bar:${index}:read:${cat}`),
        kind: 'input',
        prompt: `How many students voted for ${cat}?`,
        marks: 1,
        difficulty,
        domain: 'data',
        explanation: 'Read the height of the bar for that fruit.',
      },
      visual,
      answer: { correctValue: v, accept: { type: 'exact' } },
    };
  }

  if (variant === 'most_votes') {
    const max = Math.max(...values);
    const winners = categories.filter((_, i) => values[i] === max);
    // Avoid ties for this question.
    if (winners.length !== 1) {
      values[0] = max + 1;
    }
    const newMax = Math.max(...values);
    const winner = categories[values.indexOf(newMax)];

    const mcq = makeMcq(pageSeed, winner, categories.filter((c) => c !== winner));

    return {
      core: {
        id: idFrom(pageSeed, `bar:${index}:most`),
        kind: 'mcq',
        prompt: 'Which fruit got the most votes?',
        marks: 1,
        difficulty,
        domain: 'data',
        explanation: 'The tallest bar shows the most votes.',
      },
      visual,
      answer: mcq,
    };
  }

  if (variant === 'difference') {
    const a = rng.int(0, categories.length - 1);
    let b = rng.int(0, categories.length - 1);
    if (b === a) b = (b + 1) % categories.length;

    const diff = Math.abs(values[a] - values[b]);
    const correct = String(diff);
    const distractors = nearbyNumbers(diff).filter((x) => x !== diff).slice(0, 3).map(String);

    return {
      core: {
        id: idFrom(pageSeed, `bar:${index}:diff:${a}:${b}`),
        kind: 'input',
        prompt: `How many more students voted for ${categories[a]} than ${categories[b]}?`,
        marks: 1,
        difficulty,
        domain: 'data',
        explanation: 'Find both bar heights and subtract.',
      },
      visual,
      answer: { correctValue: diff, accept: { type: 'exact' } },
    };
  }

  // total
  const total = values.reduce((s, x) => s + x, 0);
  return {
    core: {
      id: idFrom(pageSeed, `bar:${index}:total`),
      kind: 'input',
      prompt: 'How many students voted altogether?',
      marks: 1,
      difficulty,
      domain: 'data',
      explanation: 'Add the votes for all bars.',
    },
    visual,
    answer: { correctValue: total, accept: { type: 'exact' } },
  };
}

// ---------- DATA: Table + tally ----------

const TRANSPORT = ['Walk', 'Car', 'Bus', 'Bike'] as const;

type TableVariant = 'which_true' | 'total' | 'difference';

export function makeTableQuestion(pageSeed: string, index: number): Question {
  const rng = createRng(`${pageSeed}:table:${index}`);
  const difficulty = pickDifficulty(rng);

  const categories = rng.shuffle([...TRANSPORT]).slice(0, 4);
  const counts = categories.map(() => rng.int(1, 10));

  // Ensure variety.
  if (new Set(counts).size < 2) {
    counts[0] = 3;
    counts[1] = 7;
  }

  const useTally = rng.chance(0.5);
  const rows = categories.map((c, i) => [c, useTally ? tallyString(counts[i]) : counts[i]]);

  const visual: Visual = {
    type: 'table',
    title: 'How students came to school',
    headers: ['Way to school', useTally ? 'Tally' : 'Number'],
    rows,
  };

  const variant: TableVariant = rng.pick(['which_true', 'total', 'difference'] as const);

  if (variant === 'total') {
    const total = counts.reduce((s, x) => s + x, 0);
    return {
      core: {
        id: idFrom(pageSeed, `table:${index}:total`),
        kind: 'input',
        prompt: 'How many students are there altogether?',
        marks: 1,
        difficulty,
        domain: 'data',
        explanation: 'Add the numbers for all rows.',
      },
      visual,
      answer: { correctValue: total, accept: { type: 'exact' } },
    };
  }

  if (variant === 'difference') {
    const a = rng.int(0, categories.length - 1);
    let b = rng.int(0, categories.length - 1);
    if (b === a) b = (b + 1) % categories.length;

    const diff = Math.abs(counts[a] - counts[b]);
    return {
      core: {
        id: idFrom(pageSeed, `table:${index}:diff:${a}:${b}`),
        kind: 'input',
        prompt: `How many more students came by ${categories[a]} than by ${categories[b]}?`,
        marks: 1,
        difficulty,
        domain: 'data',
        explanation: 'Compare the two rows and subtract.',
      },
      visual,
      answer: { correctValue: diff, accept: { type: 'exact' } },
    };
  }

  // which_true
  // Build one true statement.
  const a = rng.int(0, categories.length - 1);
  const b = (a + 1) % categories.length;
  const trueText = `${categories[a]}: ${counts[a]} students`;
  const wrong1 = `${categories[a]}: ${counts[a] + 1} students`;
  const wrong2 = `${categories[b]}: ${Math.max(0, counts[b] - 1)} students`;
  const wrong3 = `${categories[b]}: ${counts[b] + 2} students`;

  const mcq = makeMcq(pageSeed, trueText, [wrong1, wrong2, wrong3]);

  return {
    core: {
      id: idFrom(pageSeed, `table:${index}:true`),
      kind: 'mcq',
      prompt: 'Which statement is true?',
      marks: 1,
      difficulty,
      domain: 'data',
      explanation: 'Check the table and find the statement that matches.',
    },
    visual,
    answer: mcq,
  };
}

// ---------- DATA: Line graph (distance ran each day) ----------

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

type LineVariant = 'at_least_5' | 'greatest_day' | 'read_day';

export function makeLineGraphQuestion(pageSeed: string, index: number): Question {
  const rng = createRng(`${pageSeed}:line:${index}`);
  const difficulty = pickDifficulty(rng);

  const xCategories = [...DAYS];
  const points = xCategories.map(() => rng.int(0, 12));

  // Ensure at least one >= 5.
  if (points.every((p) => p < 5)) points[rng.int(0, points.length - 1)] = 6;

  const maxY = Math.max(8, Math.max(...points));

  const visual: Visual = {
    type: 'lineGraph',
    title: 'Distance run each day',
    xCategories,
    yLabel: 'km',
    points,
    maxY,
  };

  const variant: LineVariant = rng.pick(['at_least_5', 'greatest_day', 'read_day'] as const);

  if (variant === 'read_day') {
    const dayIndex = rng.int(0, xCategories.length - 1);
    const v = points[dayIndex];
    return {
      core: {
        id: idFrom(pageSeed, `line:${index}:read:${dayIndex}`),
        kind: 'input',
        prompt: `How far did Jill run on ${xCategories[dayIndex]}?`,
        marks: 1,
        difficulty,
        domain: 'data',
        explanation: 'Find the point above that day and read the distance.',
      },
      visual,
      answer: { correctValue: v, accept: { type: 'exact' } },
    };
  }

  if (variant === 'greatest_day') {
    const max = Math.max(...points);
    const winners = xCategories.filter((_, i) => points[i] === max);
    // Avoid ties.
    if (winners.length !== 1) points[0] = max + 1;
    const newMax = Math.max(...points);
    const day = xCategories[points.indexOf(newMax)];
    const mcq = makeMcq(pageSeed, day, xCategories.filter((d) => d !== day));
    return {
      core: {
        id: idFrom(pageSeed, `line:${index}:greatest`),
        kind: 'mcq',
        prompt: 'Which day was the greatest distance?',
        marks: 1,
        difficulty,
        domain: 'data',
        explanation: 'The highest point is the greatest distance.',
      },
      visual,
      answer: mcq,
    };
  }

  // at_least_5
  const count = points.filter((p) => p >= 5).length;
  return {
    core: {
      id: idFrom(pageSeed, `line:${index}:atleast5`),
      kind: 'input',
      prompt: 'On how many days did Jill run at least 5 km?',
      marks: 1,
      difficulty,
      domain: 'data',
      explanation: 'Count the days where the point is 5 or more.',
    },
    visual,
    answer: { correctValue: count, accept: { type: 'exact' } },
  };
}

// ---------- DATA: Picture graph ----------

const PETS = ['Cats', 'Dogs', 'Fish', 'Birds'] as const;

type PictureVariant = 'read_value' | 'difference' | 'which_correct';

export function makePictureGraphQuestion(pageSeed: string, index: number): Question {
  const rng = createRng(`${pageSeed}:pic:${index}`);
  const difficulty = pickDifficulty(rng);

  const categories = rng.shuffle([...PETS]).slice(0, 4);
  const keyValue = rng.pick([2, 5] as const);
  const iconsPerCategory = categories.map(() => rng.int(0, 6));

  if (new Set(iconsPerCategory).size < 2) {
    iconsPerCategory[0] = 1;
    iconsPerCategory[1] = 4;
  }

  const visual: Visual = {
    type: 'pictureGraph',
    title: 'Favourite pets',
    keyLabel: `1 picture = ${keyValue} people`,
    keyValue,
    categories,
    iconsPerCategory,
  };

  const variant: PictureVariant = rng.pick(['read_value', 'difference', 'which_correct'] as const);

  if (variant === 'read_value') {
    const i = rng.int(0, categories.length - 1);
    const total = iconsPerCategory[i] * keyValue;
    return {
      core: {
        id: idFrom(pageSeed, `pic:${index}:read:${i}`),
        kind: 'input',
        prompt: `How many people like ${categories[i]}?`,
        marks: 1,
        difficulty,
        domain: 'data',
        explanation: 'Count the pictures and multiply by the key.',
      },
      visual,
      answer: { correctValue: total, accept: { type: 'exact' } },
    };
  }

  if (variant === 'difference') {
    const a = 0;
    const b = 1;
    const diff = Math.abs(iconsPerCategory[a] - iconsPerCategory[b]) * keyValue;
    return {
      core: {
        id: idFrom(pageSeed, `pic:${index}:diff`),
        kind: 'input',
        prompt: `How many more people like ${categories[a]} than ${categories[b]}?`,
        marks: 1,
        difficulty,
        domain: 'data',
        explanation: 'Compare the number of pictures, then use the key.',
      },
      visual,
      answer: { correctValue: diff, accept: { type: 'exact' } },
    };
  }

  // which_correct
  const i = rng.int(0, categories.length - 1);
  const correctNum = iconsPerCategory[i] * keyValue;
  const correct = `${categories[i]}: ${correctNum}`;
  const wrong1 = `${categories[i]}: ${Math.max(0, correctNum - keyValue)}`;
  const wrong2 = `${categories[i]}: ${correctNum + keyValue}`;
  const wrong3 = `${categories[(i + 1) % categories.length]}: ${iconsPerCategory[(i + 1) % categories.length] * keyValue}`;

  const mcq = makeMcq(pageSeed, correct, [wrong1, wrong2, wrong3]);

  return {
    core: {
      id: idFrom(pageSeed, `pic:${index}:which`),
      kind: 'mcq',
      prompt: 'Which is correct?',
      marks: 1,
      difficulty,
      domain: 'data',
      explanation: 'Use the key to work out how many each row shows.',
    },
    visual,
    answer: mcq,
  };
}

// ---------- PROBABILITY helpers ----------

const SCALE4 = ['impossible', 'unlikely', 'likely', 'certain'] as const;

function classifyChance(numer: number, denom: number): (typeof SCALE4)[number] {
  if (denom <= 0) throw new Error('denom must be > 0');
  if (numer <= 0) return 'impossible';
  if (numer >= denom) return 'certain';
  // Avoid exactly half per requirements.
  if (numer * 2 === denom) {
    // caller must avoid, but we handle anyway.
    return numer < denom ? 'unlikely' : 'likely';
  }
  return numer * 2 < denom ? 'unlikely' : 'likely';
}

function makeScaleMcq(seed: string, correct: string): { choices: string[]; correctIndex: number } {
  const distractors = SCALE4.filter((x) => x !== correct);
  return makeMcq(seed, correct, [...distractors]);
}

// ---------- PROBABILITY: Bag/Box ----------

type BagVariant = 'most_likely' | 'least_likely' | 'chance_label';

export function makeBagQuestion(pageSeed: string, index: number): Question {
  const rng = createRng(`${pageSeed}:bag:${index}`);
  const difficulty = pickDifficulty(rng);

  const palette = rng.pick([
    ['Red', 'Blue', 'Green', 'Yellow'],
    ['Yellow', 'Blue', 'Red', 'Green'],
    ['Purple', 'Green', 'Orange', 'Blue'],
  ] as const);

  const labels = [...palette];
  const counts = [rng.int(1, 6), rng.int(1, 6), rng.int(1, 6), rng.int(1, 6)];

  // Ensure a clear max (helps "most likely" avoid ties and keeps visuals unambiguous).
  {
    const max = Math.max(...counts);
    const maxIdxs = counts.map((v, i) => ({ v, i })).filter((x) => x.v === max).map((x) => x.i);
    if (maxIdxs.length !== 1) {
      // Bump the first max by 1.
      counts[maxIdxs[0]] = max + 1;
    }
  }

  const items = labels.map((label, i) => ({ label, count: counts[i] }));

  const visual: Visual = {
    type: 'bag',
    title: 'Counters in a bag',
    items,
  };

  const variant: BagVariant = rng.pick(['most_likely', 'least_likely', 'chance_label'] as const);

  if (variant === 'most_likely') {
    const max = Math.max(...counts);
    const label = labels[counts.indexOf(max)];
    const mcq = makeMcq(pageSeed, label, labels.filter((l) => l !== label));
    return {
      core: {
        id: idFrom(pageSeed, `bag:${index}:most`),
        kind: 'mcq',
        prompt: 'Which colour is most likely to be picked?',
        marks: 1,
        difficulty,
        domain: 'probability',
        explanation: 'The colour with the most counters is most likely.',
      },
      visual,
      answer: mcq,
    };
  }

  if (variant === 'least_likely') {
    const min = Math.min(...counts);
    const label = labels[counts.indexOf(min)];
    const mcq = makeMcq(pageSeed, label, labels.filter((l) => l !== label));
    return {
      core: {
        id: idFrom(pageSeed, `bag:${index}:least`),
        kind: 'mcq',
        prompt: 'Which colour is least likely to be picked?',
        marks: 1,
        difficulty,
        domain: 'probability',
        explanation: 'The colour with the fewest counters is least likely.',
      },
      visual,
      answer: mcq,
    };
  }

  // chance_label
  const focus = rng.pick(labels);
  const focusCount = items.find((i) => i.label === focus)?.count ?? 0;
  const total = counts.reduce((s, x) => s + x, 0);

  // Ensure not exactly half.
  if (focusCount * 2 === total) {
    // Choose a different focus.
    const alt = labels.find((l) => (items.find((i) => i.label === l)?.count ?? 0) * 2 !== total);
    if (alt) {
      return makeBagQuestion(pageSeed, index + 1000);
    }
  }

  const correctLabel = classifyChance(focusCount, total);
  const mcq = makeScaleMcq(pageSeed, correctLabel);

  return {
    core: {
      id: idFrom(pageSeed, `bag:${index}:chance:${focus}`),
      kind: 'mcq',
      prompt: `What is the chance of picking ${focus}?`,
      marks: 1,
      difficulty,
      domain: 'probability',
      explanation: 'Compare the number of that colour to the total.',
    },
    visual: { ...visual, title: `Counters in a bag (focus: ${focus})` },
    answer: mcq,
  };
}

// ---------- PROBABILITY: Spinner ----------

type SpinnerVariant = 'chance_label' | 'most_likely';

export function makeSpinnerQuestion(pageSeed: string, index: number): Question {
  const rng = createRng(`${pageSeed}:spin:${index}`);
  const difficulty = pickDifficulty(rng);

  const labels = rng.pick([
    ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow'],
    ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange'],
  ] as const);

  const sectorCount = rng.pick([6, 7, 8] as const);
  const used = labels.slice(0, sectorCount);

  // weights 1 or 2 (use number[] to avoid overly-narrow literal inference)
  const weights: number[] = used.map(() => Number(rng.pick([1, 1, 1, 2] as const)));
  // Ensure at least one 2 for variety.
  if (!weights.includes(2)) weights[rng.int(0, weights.length - 1)] = 2;

  const sectors = used.map((label, i) => ({ label, weight: weights[i], colorKey: label.toLowerCase() }));

  const visual: Visual = {
    type: 'spinner',
    title: 'Spinner',
    sectors,
  };

  const variant: SpinnerVariant = rng.pick(['chance_label', 'most_likely'] as const);

  if (variant === 'most_likely') {
    const max = Math.max(...weights);
    const candidates = sectors.filter((s) => s.weight === max).map((s) => s.label);
    // Avoid ties.
    const idx = weights.indexOf(max);
    const correct = candidates.length === 1 ? candidates[0] : sectors[Math.max(0, idx)].label;
    const mcq = makeMcq(pageSeed, correct, sectors.map((s) => s.label).filter((l) => l !== correct));

    return {
      core: {
        id: idFrom(pageSeed, `spin:${index}:most`),
        kind: 'mcq',
        prompt: 'Which colour is most likely?',
        marks: 1,
        difficulty,
        domain: 'probability',
        explanation: 'The biggest sections are most likely.',
      },
      visual,
      answer: mcq,
    };
  }

  // chance_label
  const focus = rng.pick(sectors).label;
  const numer = sectors.filter((s) => s.label === focus).reduce((s, x) => s + x.weight, 0);
  const denom = sectors.reduce((s, x) => s + x.weight, 0);

  // Ensure not exactly half.
  if (numer * 2 === denom) {
    return makeSpinnerQuestion(pageSeed, index + 500);
  }

  const label = classifyChance(numer, denom);
  const mcq = makeScaleMcq(pageSeed, label);

  return {
    core: {
      id: idFrom(pageSeed, `spin:${index}:chance:${focus}`),
      kind: 'mcq',
      prompt: `What is the chance the arrow lands on ${focus}?`,
      marks: 1,
      difficulty,
      domain: 'probability',
      explanation: 'Look at how much of the spinner is that colour.',
    },
    visual: { ...visual, questionFocusLabel: focus },
    answer: mcq,
  };
}

// ---------- PROBABILITY: Certain statements ----------

export function makeCertainStatementQuestion(pageSeed: string, index: number): Question {
  const rng = createRng(`${pageSeed}:certain:${index}`);
  const difficulty = pickDifficulty(rng);

  const correct = 'Tomorrow is Friday.';
  const distractors = [
    'Tomorrow might rain.',
    'Tomorrow is Sunday.',
    'Tomorrow is Tuesday.',
  ];

  const mcq = makeMcq(pageSeed, correct, distractors);

  return {
    core: {
      id: idFrom(pageSeed, `certain:${index}`),
      kind: 'mcq',
      prompt: 'Today is Thursday. Which is certain?',
      marks: 1,
      difficulty,
      domain: 'probability',
      explanation: 'If today is Thursday, tomorrow is Friday.',
    },
    visual: {
      type: 'table',
      title: 'Days',
      headers: ['Today', 'Tomorrow'],
      rows: [['Thursday', 'Friday']],
    },
    answer: mcq,
  };
}

// ---------- Dispatcher for mixed pages ----------

export function generateQuestion(pageSeed: string, index: number, domain: Domain): Question {
  const rng = createRng(`${pageSeed}:qpick:${domain}:${index}`);

  if (domain === 'data') {
    const factory = rng.pick([makeBarChartQuestion, makeTableQuestion, makeLineGraphQuestion, makePictureGraphQuestion] as const);
    return factory(pageSeed, index);
  }

  const factory = rng.pick([makeBagQuestion, makeSpinnerQuestion, makeCertainStatementQuestion] as const);
  return factory(pageSeed, index);
}
