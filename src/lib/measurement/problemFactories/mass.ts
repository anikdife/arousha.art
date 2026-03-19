// src/lib/measurement/problemFactories/mass.ts

import { Rng } from '../../rng';
import {
  formatWithUnit,
  makeNearbyNumberOptions,
  makeUnitOptions,
} from '../distractors';
import type { MeasurementProblem } from './length';

type Difficulty = 1 | 2 | 3;

// ---------- Best unit to measure mass ----------

const BEST_UNIT_ITEMS: Array<{ item: string; unit: 'g' | 'kg' }> = [
  // light objects – clearly grams
  { item: 'paper clip', unit: 'g' },
  { item: 'pencil', unit: 'g' },
  { item: 'apple', unit: 'g' },
  { item: 'toy car', unit: 'g' },
  { item: 'small book', unit: 'g' },
  { item: 'packet of chips', unit: 'g' },

  // heavier objects – clearly kilograms
  { item: 'bag of flour', unit: 'kg' },
  { item: 'bag of rice', unit: 'kg' },
  { item: 'school bag full of books', unit: 'kg' },
  { item: 'dog', unit: 'kg' },
  { item: 'watermelon', unit: 'kg' },
  { item: 'suitcase', unit: 'kg' },
];

function bestUnitPrompt(rng: Rng, item: string): { prompt: string; templateKey: string } {
  const variant = rng.pick(['best', 'choose', 'about'] as const);
  switch (variant) {
    case 'choose':
      return {
        prompt: `Which unit would you use to measure the mass of a ${item}?`,
        templateKey: 'mass_best_unit:choose',
      };
    case 'about':
      return {
        prompt: `To measure how heavy a ${item} is, would you use grams or kilograms?`,
        templateKey: 'mass_best_unit:about',
      };
    case 'best':
    default:
      return {
        prompt: `What is the best unit to measure the mass of a ${item}?`,
        templateKey: 'mass_best_unit:best',
      };
  }
}

export function makeMassBestUnit(
  rng: Rng,
  id: string,
  difficulty: Difficulty,
): MeasurementProblem {
  void difficulty;
  const { item, unit } = rng.pick(BEST_UNIT_ITEMS);
  const { prompt, templateKey } = bestUnitPrompt(rng, item);

  return {
    id,
    kind: 'mcq',
    type: 'mass_best_unit',
    prompt,
    choices: makeUnitOptions('g', 'kg'),
    meta: {
      topicArea: 'mass',
      difficulty,
      expected: unit,
      templateKey,
      data: { item },
    },
  };
}

// ---------- Estimate common masses ----------

const ESTIMATE_ITEMS: Array<{
  item: string;
  unit: 'g' | 'kg';
  correct: number;
  distractorSteps: number[];
}> = [
  // grams
  {
    item: 'apple',
    unit: 'g',
    correct: 200,
    distractorSteps: [100, 150, 250, 300, 500],
  },
  {
    item: 'banana',
    unit: 'g',
    correct: 150,
    distractorSteps: [80, 100, 200, 250, 300],
  },
  {
    item: 'chocolate bar',
    unit: 'g',
    correct: 50,
    distractorSteps: [20, 30, 60, 80, 100],
  },
  {
    item: 'textbook',
    unit: 'g',
    correct: 900,
    distractorSteps: [500, 700, 1100, 1300, 1500],
  },

  // kilograms
  {
    item: 'bag of rice',
    unit: 'kg',
    correct: 2,
    distractorSteps: [1, 3, 4, 5, 6],
  },
  {
    item: 'small dog',
    unit: 'kg',
    correct: 8,
    distractorSteps: [4, 6, 10, 12, 15],
  },
  {
    item: 'baby',
    unit: 'kg',
    correct: 4,
    distractorSteps: [2, 3, 5, 6, 7],
  },
  {
    item: 'cat',
    unit: 'kg',
    correct: 5,
    distractorSteps: [2, 3, 4, 6, 8],
  },
];

function estimatePrompt(rng: Rng, item: string): { prompt: string; templateKey: string } {
  const v = rng.pick(['about', 'closest', 'weigh'] as const);
  switch (v) {
    case 'closest':
      return {
        prompt: `Which is the best estimate for the mass of a ${item}?`,
        templateKey: 'mass_estimate_common:closest',
      };
    case 'weigh':
      return {
        prompt: `About how much would a ${item} weigh?`,
        templateKey: 'mass_estimate_common:weigh',
      };
    case 'about':
    default:
      return {
        prompt: `About how much does a ${item} weigh?`,
        templateKey: 'mass_estimate_common:about',
      };
  }
}

export function makeMassEstimateCommon(
  rng: Rng,
  id: string,
  difficulty: Difficulty,
): MeasurementProblem {
  void difficulty;
  const picked = rng.pick(ESTIMATE_ITEMS);
  const correct = formatWithUnit(picked.correct, picked.unit);

  const options = new Set<string>();
  options.add(correct);

  let guard = 0;
  while (options.size < 4 && guard < 200) {
    guard++;
    const d = rng.pick(picked.distractorSteps);
    if (d <= 0 || d === picked.correct) continue;
    options.add(formatWithUnit(d, picked.unit));
  }

  const { prompt, templateKey } = estimatePrompt(rng, picked.item);

  return {
    id,
    kind: 'mcq',
    type: 'mass_estimate_common',
    prompt,
    choices: rng.shuffle(Array.from(options)),
    meta: {
      topicArea: 'mass',
      difficulty,
      expected: correct,
      templateKey,
      data: { item: picked.item, unit: picked.unit, correct: picked.correct },
    },
  };
}

// ---------- Balance scale questions ----------

export function makeMassBalanceScale(
  rng: Rng,
  id: string,
  difficulty: Difficulty,
): MeasurementProblem {
  // Slightly richer scenarios while remaining Year-3 friendly.
  const itemLabel = rng.pick(
    ['bags', 'boxes', 'water bottles', 'packs'] as const,
  );

  // number of identical items on the scale
  const count = difficulty === 1 ? 2 : rng.pick([2, 4] as const); // avoid thirds for now
  const eachKg = rng.pick([0.5, 1, 1.5, 2] as const);
  const totalKg = eachKg * count;

  const expected = formatWithUnit(eachKg, 'kg');
  const choices = makeNearbyNumberOptions(
    rng,
    eachKg,
    'kg',
    0.5,
    4,
  );

  const singular = itemLabel.slice(0, -1);

  const variant = rng.pick(['plain', 'story'] as const);
  const prompt =
    variant === 'story'
      ? `On a balance scale, ${count} identical ${itemLabel} together weigh ${totalKg} kg. What is the mass of one ${singular}?`
      : `A scale shows ${totalKg} kg for ${count} identical ${itemLabel}. What is the mass of one ${singular}?`;

  return {
    id,
    kind: 'mcq',
    type: 'mass_balance_scale',
    prompt,
    choices,
    meta: {
      topicArea: 'mass',
      difficulty,
      expected,
      unitHint: 'kg',
      templateKey:
        variant === 'story'
          ? 'mass_balance_scale:story'
          : 'mass_balance_scale:plain',
      figure: { kind: 'balance', maxKg: 4, totalKg, itemLabel },
      data: { totalKg, eachKg, count },
    },
  };
}

// ---------- Conversion between g and kg ----------

export function makeMassConversionGKg(
  rng: Rng,
  id: string,
  difficulty: Difficulty,
): MeasurementProblem {
  // At higher difficulty allow halves like 0.5 kg
  const dir = rng.chance(0.5) ? 'g_to_kg' : 'kg_to_g';

  if (dir === 'g_to_kg') {
    const gValues =
      difficulty === 1
        ? ([1000, 2000, 3000] as const)
        : ([500, 1000, 1500, 2000, 2500, 3000] as const);
    const g = rng.pick(gValues);

    return {
      id,
      kind: 'input',
      type: 'mass_conversion_g_kg',
      prompt: `Convert ${g} g to kg.`,
      meta: {
        topicArea: 'mass',
        difficulty,
        expected: g / 1000,
        unitHint: 'kg',
        templateKey: 'mass_conversion_g_kg:g_to_kg',
        data: { dir, g },
      },
    };
  }

  const kgValues =
    difficulty === 1
      ? ([1, 2, 3] as const)
      : ([0.5, 1, 1.5, 2, 2.5, 3] as const);
  const kg = rng.pick(kgValues);

  return {
    id,
    kind: 'input',
    type: 'mass_conversion_g_kg',
    prompt: `Convert ${kg} kg to g.`,
    meta: {
      topicArea: 'mass',
      difficulty,
      expected: kg * 1000,
      unitHint: 'g',
      templateKey: 'mass_conversion_g_kg:kg_to_g',
      data: { dir, kg },
    },
  };
}
