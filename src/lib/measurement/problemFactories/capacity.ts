// src/lib/measurement/problemFactories/capacity.ts

import { Rng } from '../../rng';
import {
  formatWithUnit,
  makeNearbyNumberOptions,
  makeUnitOptions,
  makeLetterOptions,
} from '../distractors';
import type { MeasurementProblem } from './length';

type Difficulty = 1 | 2 | 3;

const BEST_UNIT_ITEMS: Array<{ item: string; unit: 'mL' | 'L' }> = [
  { item: 'teaspoon of medicine', unit: 'mL' },
  { item: 'small cup of juice', unit: 'mL' },
  { item: 'water bottle', unit: 'mL' },
  { item: 'juice box', unit: 'mL' },
  { item: 'lunchbox drink bottle', unit: 'mL' },
  { item: 'bucket', unit: 'L' },
  { item: 'milk carton', unit: 'L' },
  { item: 'large bottle of soft drink', unit: 'L' },
  { item: 'bath', unit: 'L' },
  { item: 'swimming pool', unit: 'L' },
  { item: 'rainwater tank', unit: 'L' },
];

function bestUnitPrompt(
  rng: Rng,
  item: string,
): { prompt: string; templateKey: string } {
  const v = rng.pick(['measure', 'choose', 'use'] as const);
  switch (v) {
    case 'choose':
      return {
        prompt: `Which unit is best to measure the capacity of a ${item}?`,
        templateKey: 'capacity_best_unit:choose',
      };
    case 'use':
      return {
        prompt: `What unit would you use to measure how much a ${item} can hold?`,
        templateKey: 'capacity_best_unit:use',
      };
    case 'measure':
    default:
      return {
        prompt: `What is the best unit to measure the capacity of a ${item}?`,
        templateKey: 'capacity_best_unit:measure',
      };
  }
}

export function makeCapacityBestUnit(
  rng: Rng,
  id: string,
  difficulty: Difficulty,
): MeasurementProblem {
  void difficulty;
  const { item, unit } = rng.pick(BEST_UNIT_ITEMS);
  const expected = unit === 'mL' ? 'mL' : 'L';

  const { prompt, templateKey } = bestUnitPrompt(rng, item);

  return {
    id,
    kind: 'mcq',
    type: 'capacity_best_unit',
    prompt,
    choices: makeUnitOptions('mL', 'L'),
    meta: {
      topicArea: 'capacity',
      difficulty,
      expected,
      templateKey,
      data: { item, expected },
    },
  };
}

// ---------------------------------------------------------------------------
// Conversions mL ↔ L
// ---------------------------------------------------------------------------

export function makeCapacityConversionMlL(
  rng: Rng,
  id: string,
  difficulty: Difficulty,
): MeasurementProblem {
  void difficulty;
  const dir = rng.chance(0.5) ? 'ml_to_l' : 'l_to_ml';

  if (dir === 'ml_to_l') {
    // Simple multiples of 100, include 500 for 0.5 L.
    const ml = rng.pick([250, 500, 750, 1000, 1500, 2000, 2500, 3000] as const);
    const expected = ml / 1000;
    const showHint = rng.chance(0.5);

    return {
      id,
      kind: 'input',
      type: 'capacity_conversion_ml_l',
      prompt: `Convert ${ml} mL to L.${showHint ? ' (Remember: 1000 mL = 1 L.)' : ''}`,
      meta: {
        topicArea: 'capacity',
        difficulty,
        expected,
        unitHint: 'L',
        templateKey: 'capacity_conversion_ml_l:ml_to_l',
        data: { dir, ml },
      },
    };
  }

  const l = rng.pick([0.25, 0.5, 1, 1.5, 2, 3] as const);
  const expected = l * 1000;
  const showHint = rng.chance(0.5);

  return {
    id,
    kind: 'input',
    type: 'capacity_conversion_ml_l',
    prompt: `Convert ${l} L to mL.${showHint ? ' (Remember: 1 L = 1000 mL.)' : ''}`,
    meta: {
      topicArea: 'capacity',
      difficulty,
      expected,
      unitHint: 'mL',
      templateKey: 'capacity_conversion_ml_l:l_to_ml',
      data: { dir, l },
    },
  };
}

// ---------------------------------------------------------------------------
// Cups to fill a jug
// ---------------------------------------------------------------------------

export function makeCapacityFillCount(
  rng: Rng,
  id: string,
  difficulty: Difficulty,
): MeasurementProblem {
  const jugL = rng.pick([1, 2, 3, 4, 5] as const);
  const jugMl = jugL * 1000;

  const cupCandidates = [100, 125, 200, 250, 400, 500] as const;
  let cupMl = 250;
  let count = 0;

  // Find a cup size giving an exact, reasonable number of cups.
  let guard = 0;
  while (guard < 200) {
    guard++;
    const c = rng.pick(cupCandidates);
    const k = jugMl / c;
    if (Number.isInteger(k) && k > 1 && k <= (difficulty === 1 ? 10 : 20)) {
      cupMl = c;
      count = k;
      break;
    }
  }

  const expected = String(count);
  const choices = makeNearbyNumberOptions(rng, count, null, 1, 4);

  const context = rng.pick([
    'orange juice',
    'water',
    'lemonade',
    'milk',
  ] as const);
  const style = rng.pick(['plain', 'story'] as const);

  const prompt =
    style === 'story'
      ? `A jug holds ${jugL} L of ${context}. Each cup holds ${cupMl} mL. How many full cups are needed to fill the jug?`
      : `A jug holds ${jugL} L. A cup holds ${cupMl} mL. How many cups are needed to fill the jug?`;

  return {
    id,
    kind: 'mcq',
    type: 'capacity_fill_count',
    prompt,
    choices,
    meta: {
      topicArea: 'capacity',
      difficulty,
      expected,
      templateKey:
        style === 'story'
          ? 'capacity_fill_count:story'
          : 'capacity_fill_count:plain',
      data: { jugL, cupMl, context },
    },
  };
}

// ---------------------------------------------------------------------------
// Compare container capacities
// ---------------------------------------------------------------------------

export function makeCapacityCompareContainers(
  rng: Rng,
  id: string,
  difficulty: Difficulty,
): MeasurementProblem {
  const ask: 'most' | 'least' = rng.chance(0.5) ? 'most' : 'least';

  const base = rng.pick([250, 500, 750, 1000, 1500, 2000] as const);
  const step = difficulty === 1 ? 250 : rng.pick([100, 250, 500] as const);

  const vals = rng.shuffle([base, base + step, base + 2 * step]).slice(0, 3);

  const labels = ['A', 'B', 'C'] as const;
  const items = labels.map((l, i) => ({ l, ml: vals[i] }));

  const best = items.reduce(
    (acc, x) =>
      ask === 'most'
        ? x.ml > acc.ml
          ? x
          : acc
        : x.ml < acc.ml
        ? x
        : acc,
    items[0],
  );
  const expected = best.l;

  const figureLabels = items.map((it) => ({
    label: it.l as 'A' | 'B' | 'C',
    value: `${it.ml} mL`,
  }));

  const promptVariant = rng.pick(['short', 'withValues'] as const);
  const prompt =
    promptVariant === 'withValues'
      ? `The containers are labelled:\nA: ${items[0].ml} mL\nB: ${items[1].ml} mL\nC: ${items[2].ml} mL\nWhich container holds the ${
          ask === 'most' ? 'most' : 'least'
        }?`
      : `Which container holds the ${
          ask === 'most' ? 'most' : 'least'
        }? (See the labels.)`;

  return {
    id,
    kind: 'mcq',
    type: 'capacity_compare_containers',
    prompt,
    choices: makeLetterOptions(expected, ['A', 'B', 'C']),
    meta: {
      topicArea: 'capacity',
      difficulty,
      expected,
      templateKey: 'capacity_compare_containers',
      figure: { kind: 'containers', labels: figureLabels, ask },
      data: { items, ask },
    },
  };
}

// ---------------------------------------------------------------------------
// EXTRA WORD-PROBLEM TEMPLATES
// You can add these into your measurement mix for more variety.
// ---------------------------------------------------------------------------

// Total capacity when combining two containers.
export function makeCapacityTotalWordProblem(
  rng: Rng,
  id: string,
  difficulty: Difficulty,
): MeasurementProblem {
  const base = difficulty === 1 ? 250 : 500;
  const step = difficulty === 1 ? 250 : 250;

  const aMl = base + step * rng.int(0, 2); // 250/500/750 or 500/750/1000
  const bMl = base + step * rng.int(0, 2);

  const total = aMl + bMl;
  const expected = formatWithUnit(total, 'mL');
  const choices = makeNearbyNumberOptions(rng, total, 'mL', 2, 4);

  const drink = rng.pick(['fruit punch', 'orange juice', 'milkshake'] as const);

  const prompt = `A jug has ${aMl} mL of ${drink}. Another jug has ${bMl} mL of ${drink}. What is the total amount of ${drink}?`;

  return {
    id,
    kind: 'mcq',
    type: 'capacity_total_word_problem',
    prompt,
    choices,
    meta: {
      topicArea: 'capacity',
      difficulty,
      expected,
      unitHint: 'mL',
      templateKey: 'capacity_total_word_problem',
      data: { aMl, bMl, drink },
    },
  };
}

// Share a total capacity equally into cups.
export function makeCapacityShareEquallyWordProblem(
  rng: Rng,
  id: string,
  difficulty: Difficulty,
): MeasurementProblem {
  const totalL = rng.pick([1, 2, 3] as const);
  const totalMl = totalL * 1000;

  const friends =
    difficulty === 1 ? rng.pick([2, 4] as const) : rng.pick([3, 4, 5] as const);

  const eachMl = totalMl / friends;
  const expected = formatWithUnit(eachMl, 'mL');
  const choices = makeNearbyNumberOptions(rng, eachMl, 'mL', 1, 4);

  const prompt = `A ${totalL} L bottle of cordial is shared equally between ${friends} friends. How much cordial does each friend get?`;

  return {
    id,
    kind: 'mcq',
    type: 'capacity_share_equally_word_problem',
    prompt,
    choices,
    meta: {
      topicArea: 'capacity',
      difficulty,
      expected,
      unitHint: 'mL',
      templateKey: 'capacity_share_equally_word_problem',
      data: { totalL, friends, eachMl },
    },
  };
}

// Difference in capacity between two containers.
export function makeCapacityDifferenceWordProblem(
  rng: Rng,
  id: string,
  difficulty: Difficulty,
): MeasurementProblem {
  const base = rng.pick([500, 750, 1000, 1500] as const);
  const diffStep = difficulty === 1 ? 250 : 500;
  const diff = diffStep * rng.int(1, 2);

  const bigger = base + diff;
  const smaller = base;

  const expected = diff;
  const choices = makeNearbyNumberOptions(rng, diff, 'mL', 1, 4);

  const prompt = `Bottle A holds ${bigger} mL of water. Bottle B holds ${smaller} mL of water. How much more water does Bottle A hold than Bottle B?`;

  return {
    id,
    kind: 'mcq',
    type: 'capacity_difference_word_problem',
    prompt,
    choices,
    meta: {
      topicArea: 'capacity',
      difficulty,
      expected,
      unitHint: 'mL',
      templateKey: 'capacity_difference_word_problem',
      data: { bigger, smaller, diff },
    },
  };
}
