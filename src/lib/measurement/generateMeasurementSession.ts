// src/lib/measurement/generateMeasurementSession.ts

import { hashStringToUint32 } from '../hash';
import { createRng } from '../rng';
import type { Rng } from '../rng';

import type { MeasurementProblem } from './problemFactories/length';
import {
  makeLengthRulerRead,
  makeLengthRulerEstimate,
  makeLengthCompareObjects,
  makeLengthOrderThree,
  makeLengthConversionCmM,
  makePerimeterRectangleCm,
} from './problemFactories/length';
import { makeMassBestUnit, makeMassBalanceScale, makeMassConversionGKg } from './problemFactories/mass';
import {
  makeCapacityBestUnit,
  makeCapacityConversionMlL,
  makeCapacityFillCount,
  makeCapacityCompareContainers,
} from './problemFactories/capacity';
import { makeMixedWord1Step, makeMixedWord2StepEasy } from './problemFactories/mixed';

export type MeasurementPage = {
  pageId: string;
  pageNo: number;
  problems: MeasurementProblem[];
  userAnswers: Record<string, string>;
  graded?: Record<string, boolean>;
};

export type { MeasurementProblem };

export type GenerateMeasurementPageParams = {
  sessionId: string;
  pageNo: number;
  problemsPerPage: number;
  prevLastTemplateKey?: string;
};

const ALL_TYPES = [
  'length_ruler_read',
  'length_ruler_estimate',
  'length_compare_objects',
  'length_order_three',
  'length_conversion_cm_m',
  'perimeter_rectangle_cm',
  'mass_best_unit',
  'mass_balance_scale',
  'mass_conversion_g_kg',
  'capacity_best_unit',
  'capacity_conversion_ml_l',
  'capacity_fill_count',
  'capacity_compare_containers',
  'mixed_word_problem_1step',
  'mixed_word_problem_2step_easy',
] as const;

type MeasurementType = (typeof ALL_TYPES)[number];

type Difficulty = 1 | 2 | 3;

function pageDifficulty(pageNo: number): Difficulty {
  if (pageNo <= 0) return 1;
  if (pageNo <= 2) return 2;
  return 3;
}

function makeProblemId(sessionId: string, pageNo: number, index: number, type: string): string {
  const h = hashStringToUint32(`${sessionId}:${pageNo}:${index}:${type}`);
  return `m-${pageNo}-${index}-${h.toString(16)}`;
}

function pickType(rng: Rng, pageNo: number): MeasurementType {
  const d = pageDifficulty(pageNo);

  const easy: MeasurementType[] = [
    'length_ruler_read',
    'length_compare_objects',
    'mass_best_unit',
    'capacity_best_unit',
    'capacity_compare_containers',
    'capacity_fill_count',
  ];

  const medium: MeasurementType[] = [
    'length_ruler_estimate',
    'length_order_three',
    'length_conversion_cm_m',
    'perimeter_rectangle_cm',
    'mass_balance_scale',
    'mass_conversion_g_kg',
    'capacity_conversion_ml_l',
    'mixed_word_problem_1step',
  ];

  const hard: MeasurementType[] = [
    'mixed_word_problem_2step_easy',
    'length_ruler_estimate',
    'length_order_three',
    'perimeter_rectangle_cm',
    'capacity_fill_count',
    'mass_balance_scale',
  ];

  const pool = d === 1 ? easy : d === 2 ? [...easy, ...medium] : [...easy, ...medium, ...hard];
  return rng.pick(pool);
}

function buildProblem(rng: Rng, type: MeasurementType, id: string, difficulty: Difficulty): MeasurementProblem {
  switch (type) {
    case 'length_ruler_read':
      return makeLengthRulerRead(rng, id, difficulty);
    case 'length_ruler_estimate':
      return makeLengthRulerEstimate(rng, id, difficulty);
    case 'length_compare_objects':
      return makeLengthCompareObjects(rng, id, difficulty);
    case 'length_order_three':
      return makeLengthOrderThree(rng, id, difficulty);
    case 'length_conversion_cm_m':
      return makeLengthConversionCmM(rng, id, difficulty);
    case 'perimeter_rectangle_cm':
      return makePerimeterRectangleCm(rng, id, difficulty);

    case 'mass_best_unit':
      return makeMassBestUnit(rng, id, difficulty);
    case 'mass_balance_scale':
      return makeMassBalanceScale(rng, id, difficulty);
    case 'mass_conversion_g_kg':
      return makeMassConversionGKg(rng, id, difficulty);

    case 'capacity_best_unit':
      return makeCapacityBestUnit(rng, id, difficulty);
    case 'capacity_conversion_ml_l':
      return makeCapacityConversionMlL(rng, id, difficulty);
    case 'capacity_fill_count':
      return makeCapacityFillCount(rng, id, difficulty);
    case 'capacity_compare_containers':
      return makeCapacityCompareContainers(rng, id, difficulty);

    case 'mixed_word_problem_1step':
      return makeMixedWord1Step(rng, id, difficulty);
    case 'mixed_word_problem_2step_easy':
      return makeMixedWord2StepEasy(rng, id, difficulty);

    default: {
      const _exhaustive: never = type;
      throw new Error(`Unhandled measurement type: ${_exhaustive}`);
    }
  }
}

function normalizeExpectedKey(v: unknown): string {
  if (typeof v === 'number') return String(Math.round(v * 10) / 10);
  return String(v);
}

export function generateMeasurementPage(params: GenerateMeasurementPageParams): MeasurementPage {
  const { sessionId, pageNo, problemsPerPage, prevLastTemplateKey } = params;
  const difficulty = pageDifficulty(pageNo);

  const seed = hashStringToUint32(`${sessionId}:${pageNo}`);
  const rng = createRng(seed);

  const expectedSeen = new Set<string>();
  const problems: MeasurementProblem[] = [];

  let lastTemplateKey = prevLastTemplateKey;

  let guard = 0;
  while (problems.length < problemsPerPage && guard < 1000) {
    guard++;

    let type = pickType(rng, pageNo);

    // Avoid identical template keys back-to-back across pages (first problem only).
    if (problems.length === 0 && lastTemplateKey && type === lastTemplateKey) {
      type = pickType(rng, pageNo);
    }

    const id = makeProblemId(sessionId, pageNo, problems.length, type);
    const problem = buildProblem(rng, type, id, difficulty);

    const expectedKey = normalizeExpectedKey(problem.meta.expected);
    if (expectedSeen.has(expectedKey)) {
      continue;
    }

    // Avoid repeating exact template back-to-back inside a page.
    if (problems.length > 0) {
      const prev = problems[problems.length - 1];
      if (prev.meta.templateKey === problem.meta.templateKey) {
        continue;
      }
    }

    expectedSeen.add(expectedKey);
    problems.push(problem);
    lastTemplateKey = type;
  }

  if (problems.length < problemsPerPage) {
    throw new Error('Failed to generate enough unique measurement problems');
  }

  return {
    pageId: `measurement-page-${pageNo}`,
    pageNo,
    problems,
    userAnswers: {},
  };
}

export function lastTemplateKeyFromPage(page: MeasurementPage | undefined): string | undefined {
  const last = page?.problems?.[page.problems.length - 1];
  return last?.meta?.templateKey;
}
