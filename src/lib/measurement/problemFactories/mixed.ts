// src/lib/measurement/problemFactories/mixed.ts

import { Rng } from '../../rng';
import { formatWithUnit, makeNearbyNumberOptions } from '../distractors';
import type { MeasurementProblem, MeasurementTopicArea } from './length';

type Difficulty = 1 | 2 | 3;

export function makeMixedWord1Step(rng: Rng, id: string, difficulty: Difficulty): MeasurementProblem {
  const area: MeasurementTopicArea = rng.pick(['length', 'mass', 'capacity'] as const);

  if (area === 'length') {
    const total = rng.int(50, 200);
    const cut = rng.int(10, Math.min(120, total - 5));
    const left = total - cut;

    const expected = formatWithUnit(left, 'cm');
    return {
      id,
      kind: 'mcq',
      type: 'mixed_word_problem_1step',
      prompt: `A ribbon is ${total} cm long. Ella cuts off ${cut} cm. How long is the ribbon now?`,
      choices: makeNearbyNumberOptions(rng, left, 'cm', 5, 4),
      meta: {
        topicArea: 'length',
        difficulty,
        expected,
        templateKey: 'mixed_word_problem_1step:length',
        data: { total, cut },
      },
    };
  }

  if (area === 'mass') {
    const a = rng.pick([100, 200, 300, 400, 500] as const);
    const b = rng.pick([100, 200, 300, 400, 500] as const);
    const total = a + b;

    const expected = formatWithUnit(total, 'g');
    return {
      id,
      kind: 'mcq',
      type: 'mixed_word_problem_1step',
      prompt: `A bag has ${a} g of rice. Another bag has ${b} g of rice. How much rice is there altogether?`,
      choices: makeNearbyNumberOptions(rng, total, 'g', 100, 4),
      meta: {
        topicArea: 'mass',
        difficulty,
        expected,
        templateKey: 'mixed_word_problem_1step:mass',
        data: { a, b },
      },
    };
  }

  const bottle = rng.pick([250, 500] as const);
  const add = rng.pick([250, 500, 1000] as const);
  const total = bottle + add;

  const expected = formatWithUnit(total, 'mL');
  return {
    id,
    kind: 'mcq',
    type: 'mixed_word_problem_1step',
    prompt: `A bottle has ${bottle} mL of water. Sam pours in ${add} mL more. How much water is in the bottle now?`,
    choices: makeNearbyNumberOptions(rng, total, 'mL', 250, 4),
    meta: {
      topicArea: 'capacity',
      difficulty,
      expected,
      templateKey: 'mixed_word_problem_1step:capacity',
      data: { bottle, add },
    },
  };
}

export function makeMixedWord2StepEasy(rng: Rng, id: string, difficulty: Difficulty): MeasurementProblem {
  void difficulty;
  const area: MeasurementTopicArea = rng.pick(['length', 'mass', 'capacity'] as const);

  if (area === 'length') {
    const stick = rng.int(60, 140);
    const used = rng.int(10, 50);
    const pieces = rng.pick([2, 3] as const);

    const left = stick - used;
    const totalLeft = left * pieces;

    const expected = formatWithUnit(totalLeft, 'cm');

    return {
      id,
      kind: 'mcq',
      type: 'mixed_word_problem_2step_easy',
      prompt: `A stick is ${stick} cm long. ${used} cm is used. How much length is left on one stick? If there are ${pieces} sticks, what is the total length left?`,
      choices: makeNearbyNumberOptions(rng, totalLeft, 'cm', 10, 4),
      meta: {
        topicArea: 'length',
        difficulty,
        expected,
        templateKey: 'mixed_word_problem_2step_easy:length',
        data: { stick, used, pieces },
      },
    };
  }

  if (area === 'mass') {
    const eachKg = rng.pick([1, 2] as const);
    const count = rng.pick([2, 3] as const);
    const extraG = rng.pick([0, 500] as const);

    const totalG = count * eachKg * 1000 + extraG;

    const expected = formatWithUnit(totalG, 'g');

    return {
      id,
      kind: 'mcq',
      type: 'mixed_word_problem_2step_easy',
      prompt: `A bag of flour has ${eachKg} kg. You buy ${count} bags. Then you add ${extraG} g more. How many grams of flour do you have in total?`,
      choices: makeNearbyNumberOptions(rng, totalG, 'g', 500, 4),
      meta: {
        topicArea: 'mass',
        difficulty,
        expected,
        templateKey: 'mixed_word_problem_2step_easy:mass',
        data: { eachKg, count, extraG },
      },
    };
  }

  const cupMl = rng.pick([250, 500] as const);
  const cups = rng.pick([2, 3, 4] as const);
  const extraMl = rng.pick([0, 250, 500] as const);
  const totalMl = cups * cupMl + extraMl;

  const expected = formatWithUnit(totalMl, 'mL');

  return {
    id,
    kind: 'mcq',
    type: 'mixed_word_problem_2step_easy',
    prompt: `A cup holds ${cupMl} mL. You pour ${cups} cups into a jug. Then you pour in ${extraMl} mL more. How much liquid is in the jug now?`,
    choices: makeNearbyNumberOptions(rng, totalMl, 'mL', 250, 4),
    meta: {
      topicArea: 'capacity',
      difficulty,
      expected,
      templateKey: 'mixed_word_problem_2step_easy:capacity',
      data: { cupMl, cups, extraMl },
    },
  };
}
