// src/lib/measurement/problemFactories/length.ts

import { Rng } from '../../rng';
import {
  formatWithUnit,
  makeNearbyNumberOptions,
  makeLetterOptions,
  makeOrderOptions,
} from '../distractors';

export type MeasurementTopicArea = 'length' | 'mass' | 'capacity';

export type MeasurementProblemKind = 'mcq' | 'input';

export type MeasurementFigureSpec =
  | {
      kind: 'ruler';
      maxCm: 10 | 20;
      startCm: number;
      endCm: number;
      endFraction?: 0 | 0.2 | 0.8;
    }
  | {
      kind: 'containers';
      labels: Array<{ label: 'A' | 'B' | 'C'; value: string }>;
      ask: 'most' | 'least';
    }
  | {
      kind: 'balance';
      maxKg: 4;
      totalKg: number;
      itemLabel: string;
    };

export type MeasurementProblem = {
  id: string;
  kind: MeasurementProblemKind;
  type: string;
  prompt: string;
  choices?: string[];
  meta: {
    topicArea: MeasurementTopicArea;
    difficulty: 1 | 2 | 3;
    expected: string | number;
    unitHint?: string;
    templateKey: string;
    figure?: MeasurementFigureSpec;
    data?: any;
  };
};

const OBJECTS = [
  'pencil',
  'ribbon',
  'rope',
  'stick',
  'crayon',
  'toy car',
  'bookmark',
  'paintbrush',
  'straw',
  'piece of string',
] as const;

const CONTEXTS = [
  'on the desk',
  'on the table',
  'on the floor',
  'in the classroom',
  'on the workbench',
] as const;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// Small helper to pick a prompt variant.
function rulerReadPrompt(rng: Rng, object: string): { prompt: string; templateKey: string } {
  const variant = rng.pick(['how_long', 'what_length', 'measure_about'] as const);
  switch (variant) {
    case 'what_length':
      return {
        prompt: `What is the length of the ${object}?`,
        templateKey: 'length_ruler_read:what_length',
      };
    case 'measure_about':
      return {
        prompt: `Measure the ${object}. About how long is it?`,
        templateKey: 'length_ruler_read:measure_about',
      };
    case 'how_long':
    default:
      return {
        prompt: `How long is the ${object}?`,
        templateKey: 'length_ruler_read:how_long',
      };
  }
}

function rulerEstimatePrompt(
  rng: Rng,
  object: string,
): { prompt: string; templateKey: string } {
  const variant = rng.pick(['about_long', 'round_nearest'] as const);
  switch (variant) {
    case 'round_nearest':
      return {
        prompt: `About how long is the ${object}? Round your answer to the nearest cm.`,
        templateKey: 'length_ruler_estimate:round_nearest',
      };
    case 'about_long':
    default:
      return {
        prompt: `About how long is the ${object}? (Round to the nearest cm.)`,
        templateKey: 'length_ruler_estimate:about_long',
      };
  }
}

export function makeLengthRulerRead(
  rng: Rng,
  id: string,
  difficulty: 1 | 2 | 3,
): MeasurementProblem {
  const maxCm: 10 | 20 = difficulty === 1 ? 10 : 20;
  const object = rng.pick(OBJECTS);
  const context = rng.pick(CONTEXTS);

  // Slightly wider ranges by difficulty.
  const length = rng.int(
    2,
    difficulty === 3 ? 17 : difficulty === 2 ? 13 : 9,
  );

  // Sometimes start at zero, sometimes offset for more variety.
  const forceZeroStart = difficulty === 1 && rng.chance(0.6);
  const start = forceZeroStart ? 0 : rng.int(0, maxCm - length);
  const end = start + length;

  const expected = formatWithUnit(length, 'cm');
  const choices = makeNearbyNumberOptions(rng, length, 'cm', 1, 4);

  const { prompt, templateKey } = rulerReadPrompt(
    rng,
    `${object} ${rng.chance(0.5) ? '' : context}`,
  );

  return {
    id,
    kind: 'mcq',
    type: 'length_ruler_read',
    prompt,
    choices,
    meta: {
      topicArea: 'length',
      difficulty,
      expected,
      unitHint: 'cm',
      templateKey,
      figure: {
        kind: 'ruler',
        maxCm,
        startCm: start,
        endCm: end,
      },
      data: { object, context, length },
    },
  };
}

export function makeLengthRulerEstimate(
  rng: Rng,
  id: string,
  difficulty: 1 | 2 | 3,
): MeasurementProblem {
  const maxCm: 10 | 20 = difficulty === 1 ? 10 : 20;
  const object = rng.pick(OBJECTS);
  const context = rng.pick(CONTEXTS);

  const whole = rng.int(
    2,
    difficulty === 3 ? 17 : difficulty === 2 ? 13 : 9,
  );
  const frac: 0.2 | 0.8 = rng.pick([0.2, 0.8]);

  const start = rng.int(0, clamp(maxCm - (whole + 1), 0, maxCm));
  const endApprox = whole + frac;
  const rounded = Math.round(endApprox);

  const expected = formatWithUnit(rounded, 'cm');
  const choices = makeNearbyNumberOptions(rng, rounded, 'cm', 1, 4);

  const { prompt, templateKey } = rulerEstimatePrompt(
    rng,
    `${object} ${rng.chance(0.5) ? '' : context}`,
  );

  return {
    id,
    kind: 'mcq',
    type: 'length_ruler_estimate',
    prompt,
    choices,
    meta: {
      topicArea: 'length',
      difficulty,
      expected,
      unitHint: 'cm',
      templateKey,
      figure: {
        kind: 'ruler',
        maxCm,
        startCm: start,
        endCm: start + whole,
        endFraction: frac,
      },
      data: { object, context, whole, frac },
    },
  };
}

export function makeLengthCompareObjects(
  rng: Rng,
  id: string,
  difficulty: 1 | 2 | 3,
): MeasurementProblem {
  const askLongest = rng.chance(0.5);
  const baseMin = difficulty === 1 ? 5 : difficulty === 2 ? 10 : 20;
  const baseMax = difficulty === 1 ? 40 : difficulty === 2 ? 120 : 200;

  const lengths = rng.uniqueInts(4, baseMin, baseMax);
  const labels = ['A', 'B', 'C', 'D'] as const;

  const pairs = labels.map((l, i) => ({ l, cm: lengths[i] }));
  const best = pairs.reduce(
    (acc, p) =>
      askLongest
        ? p.cm > acc.cm
          ? p
          : acc
        : p.cm < acc.cm
        ? p
        : acc,
    pairs[0],
  );

  const expected = best.l;

  const contextNoun = rng.pick(['ribbons', 'sticks', 'pieces of rope', 'pencils'] as const);

  const style = rng.pick(['inline', 'lined'] as const);
  let prompt: string;
  if (style === 'lined') {
    const lines = pairs
      .map((p) => `${p.l}: ${p.cm} cm`)
      .join('\n');
    prompt = `${askLongest ? 'Which is the longest' : 'Which is the shortest'} ${
      contextNoun
    }?\n${lines}`;
  } else {
    const listText = pairs.map((p) => `${p.l}: ${p.cm} cm`).join(', ');
    prompt = `${askLongest ? 'Which object is the longest' : 'Which object is the shortest'}? ${listText}`;
  }

  return {
    id,
    kind: 'mcq',
    type: 'length_compare_objects',
    prompt,
    choices: makeLetterOptions(expected),
    meta: {
      topicArea: 'length',
      difficulty,
      expected,
      templateKey: askLongest
        ? 'length_compare_objects:longest'
        : 'length_compare_objects:shortest',
      data: { pairs, contextNoun },
    },
  };
}

export function makeLengthOrderThree(
  rng: Rng,
  id: string,
  difficulty: 1 | 2 | 3,
): MeasurementProblem {
  const baseMin = difficulty === 1 ? 5 : difficulty === 2 ? 10 : 20;
  const baseMax = difficulty === 1 ? 60 : difficulty === 2 ? 140 : 200;

  const vals = rng.uniqueInts(3, baseMin, baseMax);
  const labels = ['A', 'B', 'C'] as const;
  const items = labels.map((l, i) => ({ l, cm: vals[i] }));

  const ascending = rng.chance(0.5); // sometimes small→large, sometimes large→small
  const sorted = items
    .slice()
    .sort((a, b) => (ascending ? a.cm - b.cm : b.cm - a.cm));

  const correct = `${sorted[0].l}, ${sorted[1].l}, ${sorted[2].l}`;

  const allPerms = [
    `${labels[0]}, ${labels[1]}, ${labels[2]}`,
    `${labels[0]}, ${labels[2]}, ${labels[1]}`,
    `${labels[1]}, ${labels[0]}, ${labels[2]}`,
    `${labels[1]}, ${labels[2]}, ${labels[0]}`,
    `${labels[2]}, ${labels[0]}, ${labels[1]}`,
    `${labels[2]}, ${labels[1]}, ${labels[0]}`,
  ];

  const directionText = ascending
    ? 'from smallest to largest'
    : 'from largest to smallest';

  const listText = `A: ${items[0].cm} cm, B: ${items[1].cm} cm, C: ${items[2].cm} cm`;

  return {
    id,
    kind: 'mcq',
    type: 'length_order_three',
    prompt: `Order these lengths ${directionText}: ${listText}`,
    choices: makeOrderOptions(rng, correct, allPerms),
    meta: {
      topicArea: 'length',
      difficulty,
      expected: correct,
      templateKey: ascending
        ? 'length_order_three:asc'
        : 'length_order_three:desc',
      data: { items, direction: ascending ? 'asc' : 'desc' },
    },
  };
}

export function makeLengthConversionCmM(
  rng: Rng,
  id: string,
  difficulty: 1 | 2 | 3,
): MeasurementProblem {
  void difficulty;
  const dir = rng.chance(0.5) ? 'cm_to_m' : 'm_to_cm';
  const cmVals = [100, 150, 200, 250, 300] as const;
  const mVals = [1, 1.5, 2, 2.5, 3] as const;

  if (dir === 'cm_to_m') {
    const cm = rng.pick(cmVals);
    return {
      id,
      kind: 'input',
      type: 'length_conversion_cm_m',
      prompt: `Convert ${cm} cm to m.`,
      meta: {
        topicArea: 'length',
        difficulty,
        expected: cm / 100,
        unitHint: 'm',
        templateKey: 'length_conversion_cm_m:cm_to_m',
        data: { dir, cm },
      },
    };
  }

  const m = rng.pick(mVals);
  return {
    id,
    kind: 'input',
    type: 'length_conversion_cm_m',
    prompt: `Convert ${m} m to cm.`,
    meta: {
      topicArea: 'length',
      difficulty,
      expected: m * 100,
      unitHint: 'cm',
      templateKey: 'length_conversion_cm_m:m_to_cm',
      data: { dir, m },
    },
  };
}

export function makePerimeterRectangleCm(
  rng: Rng,
  id: string,
  difficulty: 1 | 2 | 3,
): MeasurementProblem {
  const sideMax = difficulty === 1 ? 20 : difficulty === 2 ? 40 : 60;
  const a = rng.int(2, sideMax);
  const b = rng.int(2, sideMax);
  const perim = 2 * (a + b);

  const expected = formatWithUnit(perim, 'cm');
  const choices = makeNearbyNumberOptions(
    rng,
    perim,
    'cm',
    difficulty === 1 ? 2 : 4,
    4,
  );

  const context = rng.pick([
    'a garden bed',
    'a rectangle playground',
    'a picture frame',
    'a small field',
  ] as const);

  const style = rng.pick(['plain', 'story'] as const);
  const prompt =
    style === 'story'
      ? `A ${context} is a rectangle with sides ${a} cm and ${b} cm. How far is it around the edge (what is the perimeter)?`
      : `A rectangle has sides ${a} cm and ${b} cm. What is the perimeter?`;

  return {
    id,
    kind: 'mcq',
    type: 'perimeter_rectangle_cm',
    prompt,
    choices,
    meta: {
      topicArea: 'length',
      difficulty,
      expected,
      unitHint: 'cm',
      templateKey:
        style === 'story'
          ? 'perimeter_rectangle_cm:story'
          : 'perimeter_rectangle_cm:plain',
      data: { a, b, context },
    },
  };
}

/**
 * EXTRA WORD-PROBLEM TEMPLATES
 * These add more variety but keep the same MeasurementProblem shape.
 * Wire them into your measurement topic router as needed.
 */

// Two objects, ask “how much longer/shorter”.
export function makeLengthDifferenceWordProblem(
  rng: Rng,
  id: string,
  difficulty: 1 | 2 | 3,
): MeasurementProblem {
  const baseMin = difficulty === 1 ? 10 : 20;
  const baseMax = difficulty === 1 ? 40 : 80;

  const aLen = rng.int(baseMin, baseMax);
  const diff = rng.int(3, 15);
  const bLen = aLen + diff;

  const longFirst = rng.chance(0.5);

  const longObj = rng.pick(['rope', 'ribbon', 'piece of string'] as const);
  const shortObj = rng.pick(['stick', 'pencil', 'crayon'] as const);

  const expected = diff;
  const choices = makeNearbyNumberOptions(rng, diff, 'cm', 1, 4);

  const prompt =
    longFirst
      ? `A ${longObj} is ${bLen} cm long. A ${shortObj} is ${aLen} cm long. How much longer is the ${longObj} than the ${shortObj}?`
      : `A ${shortObj} is ${aLen} cm long. A ${longObj} is ${bLen} cm long. How much longer is the ${longObj} than the ${shortObj}?`;

  return {
    id,
    kind: 'mcq',
    type: 'length_difference_word_problem',
    prompt,
    choices,
    meta: {
      topicArea: 'length',
      difficulty,
      expected,
      unitHint: 'cm',
      templateKey: 'length_difference_word_problem',
      data: { aLen, bLen, longObj, shortObj },
    },
  };
}

// Add two lengths, “total length”.
export function makeLengthTotalWordProblem(
  rng: Rng,
  id: string,
  difficulty: 1 | 2 | 3,
): MeasurementProblem {
  const baseMin = difficulty === 1 ? 5 : 10;
  const baseMax = difficulty === 1 ? 25 : 40;

  const first = rng.int(baseMin, baseMax);
  const second = rng.int(baseMin, baseMax);
  const total = first + second;

  const item = rng.pick(['ribbon', 'rope', 'piece of tape', 'string'] as const);

  const expected = formatWithUnit(total, 'cm');
  const choices = makeNearbyNumberOptions(rng, total, 'cm', 2, 4);

  const prompt = `Sana cuts one ${item} that is ${first} cm long and another that is ${second} cm long. What is the total length of ${item} she has?`;

  return {
    id,
    kind: 'mcq',
    type: 'length_total_word_problem',
    prompt,
    choices,
    meta: {
      topicArea: 'length',
      difficulty,
      expected,
      unitHint: 'cm',
      templateKey: 'length_total_word_problem',
      data: { first, second, item },
    },
  };
}
