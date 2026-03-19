// src/lib/geometry/generators/generateAngleQuestion.ts

import type { GeometryDifficulty, GeometryDiagram, GeometryProblem } from '../models';
import { makeAnswer } from '../validation';
import { idFrom, makeOptionsFromTexts, rngFromSeed } from '../util';

type AngleKind = 'small' | 'right' | 'wide';

type AngleTemplate =
  | 'angle_identify_right_yesno'
  | 'angle_identify_type_mcq'
  | 'angle_compare_larger'
  | 'angle_compare_smaller'
  | 'angle_compare_right_angle'
  | 'angle_compare_same_or_not'
  | 'angle_pick_right_from_two'
  | 'angle_pick_wide_from_two'
  | 'angle_pick_small_from_two';

function makeMcq(params: {
  seed: number;
  templateKey: AngleTemplate;
  difficulty: GeometryDifficulty;
  questionText: string;
  diagram?: GeometryDiagram;
  optionTexts: string[];
  correctText: string;
  explanation: string;
}): GeometryProblem {
  const { seed, templateKey, difficulty, questionText, diagram, optionTexts, correctText, explanation } = params;

  const options = makeOptionsFromTexts(seed, optionTexts);
  const correct = options.find((o) => o.text === correctText);
  if (!correct) throw new Error('Angle generator produced invalid correct option');

  return {
    id: idFrom(seed, templateKey),
    questionText,
    diagram,
    type: 'multiple-choice',
    options,
    correctAnswer: makeAnswer('multiple-choice', correct.id),
    explanation,
    marks: 1,
    metadata: {
      topic: 'geometry',
      subtopic: 'angles',
      difficulty,
      yearLevel: 3,
      templateKey,
    },
  };
}

function angleSize(kind: AngleKind): number {
  switch (kind) {
    case 'small':
      return 45;
    case 'right':
      return 90;
    case 'wide':
      return 130;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function pickNonEqualKind(rng: ReturnType<typeof rngFromSeed>, exclude: AngleKind, allowed: readonly AngleKind[]): AngleKind {
  const pool = allowed.filter((k) => k !== exclude);
  return rng.pick(pool.length ? pool : (['small', 'right'] as const));
}

function makeCornerDiagram(kind: AngleKind): GeometryDiagram {
  return {
    shapeType: 'right-angle-corner',
    width: 180,
    height: 140,
    data: {
      cornerKind: kind,
    },
  };
}

function makeCompareDiagram(a: AngleKind, b: AngleKind): GeometryDiagram {
  return {
    shapeType: 'angle-compare',
    width: 240,
    height: 150,
    data: {
      angleA: a,
      angleB: b,
      labels: ['A', 'B'],
    },
  };
}

function chooseAllowedKinds(difficulty: GeometryDifficulty, rng: ReturnType<typeof rngFromSeed>): readonly AngleKind[] {
  // d1: small + right only
  if (difficulty === 1) return ['small', 'right'] as const;

  // d2: mostly small/right, sometimes wide
  if (difficulty === 2) {
    return rng.chance(0.35) ? (['small', 'right', 'wide'] as const) : (['small', 'right'] as const);
  }

  // d3: include wide
  return ['small', 'right', 'wide'] as const;
}

function isRight(kind: AngleKind): boolean {
  return kind === 'right';
}

function isWide(kind: AngleKind): boolean {
  return kind === 'wide';
}

function isSmall(kind: AngleKind): boolean {
  return kind === 'small';
}

export function generateAngleQuestion(seed: number): GeometryProblem {
  const rng = rngFromSeed(seed);
  const difficulty: GeometryDifficulty = (rng.int(1, 3) as GeometryDifficulty) ?? 1;

  const allowed = chooseAllowedKinds(difficulty, rng);

  // Template set expands with difficulty but ONLY uses existing renderers.
  const templates: AngleTemplate[] = [
    'angle_identify_right_yesno',
    'angle_identify_type_mcq',
    'angle_compare_larger',
    'angle_compare_smaller',
    'angle_compare_right_angle',
    'angle_compare_same_or_not',
    'angle_pick_right_from_two',
  ];

  if (allowed.includes('wide')) {
    templates.push('angle_pick_wide_from_two');
  }
  templates.push('angle_pick_small_from_two');

  const templateKey = rng.pick(templates);

  // 1) Identify right angle: Yes/No with single corner diagram
  if (templateKey === 'angle_identify_right_yesno') {
    const showRight = rng.chance(0.55);
    const kind: AngleKind = showRight ? 'right' : rng.pick(allowed.filter((k) => k !== 'right') as AngleKind[]);

    return makeMcq({
      seed,
      templateKey,
      difficulty,
      questionText: 'Is this a right angle (a square corner)?',
      diagram: makeCornerDiagram(kind),
      optionTexts: ['Yes', 'No'],
      correctText: kind === 'right' ? 'Yes' : 'No',
      explanation:
        kind === 'right'
          ? 'A right angle looks exactly like a square corner.'
          : 'A right angle looks exactly like a square corner. This one does not.',
    });
  }

  // 2) Identify type: small/right/(wide) using single corner diagram
  if (templateKey === 'angle_identify_type_mcq') {
    const kind: AngleKind = difficulty === 1 ? rng.pick(['small', 'right'] as const) : rng.pick(allowed as AngleKind[]);

    const optionTexts =
      allowed.includes('wide')
        ? (['Small angle', 'Right angle', 'Wide angle'] as const)
        : (['Small angle', 'Right angle'] as const);

    const correctText =
      kind === 'small' ? 'Small angle' : kind === 'right' ? 'Right angle' : 'Wide angle';

    const explanation =
      kind === 'small'
        ? 'A small angle opens less than a square corner.'
        : kind === 'right'
          ? 'A right angle looks exactly like a square corner.'
          : 'A wide angle opens more than a square corner.';

    return makeMcq({
      seed,
      templateKey,
      difficulty,
      questionText: 'What kind of angle is this?',
      diagram: makeCornerDiagram(kind),
      optionTexts: Array.from(optionTexts),
      correctText,
      explanation,
    });
  }

  // Helper: choose A/B kinds with optional ties
  function pickPair(params: { allowEqual: boolean }): { a: AngleKind; b: AngleKind } {
    const a: AngleKind = rng.pick(allowed as AngleKind[]);
    let b: AngleKind = rng.pick(allowed as AngleKind[]);

    if (!params.allowEqual) {
      // avoid equality most of the time
      if (rng.chance(0.85)) {
        b = pickNonEqualKind(rng, a, allowed);
      }
    } else {
      // allow equal sometimes, but not always
      if (rng.chance(0.65)) {
        b = pickNonEqualKind(rng, a, allowed);
      } else {
        b = a;
      }
    }

    // Ensure b is allowed
    if (!allowed.includes(b)) {
      b = a === 'small' ? 'right' : 'small';
      if (!allowed.includes(b)) b = allowed[0]!;
    }

    return { a, b };
  }

  // 3) Compare larger
  if (templateKey === 'angle_compare_larger') {
    const { a, b } = pickPair({ allowEqual: true });
    const sa = angleSize(a);
    const sb = angleSize(b);

    const correct =
      sa === sb ? 'They are equal' : sa > sb ? 'Angle A' : 'Angle B';

    return makeMcq({
      seed,
      templateKey,
      difficulty,
      questionText: 'Which angle is larger (opens wider)?',
      diagram: makeCompareDiagram(a, b),
      optionTexts: ['Angle A', 'Angle B', 'They are equal'],
      correctText: correct,
      explanation:
        correct === 'They are equal'
          ? 'The angles open the same amount.'
          : `${correct} opens wider.`,
    });
  }

  // 4) Compare smaller
  if (templateKey === 'angle_compare_smaller') {
    const { a, b } = pickPair({ allowEqual: true });
    const sa = angleSize(a);
    const sb = angleSize(b);

    const correct =
      sa === sb ? 'They are equal' : sa < sb ? 'Angle A' : 'Angle B';

    return makeMcq({
      seed,
      templateKey,
      difficulty,
      questionText: 'Which angle is smaller (opens less)?',
      diagram: makeCompareDiagram(a, b),
      optionTexts: ['Angle A', 'Angle B', 'They are equal'],
      correctText: correct,
      explanation:
        correct === 'They are equal'
          ? 'The angles open the same amount.'
          : `${correct} opens less.`,
    });
  }

  // 5) Compare: which one is a right angle?
  if (templateKey === 'angle_compare_right_angle') {
    // force one right, one not right
    const aIsRight = rng.chance(0.5);
    const a: AngleKind = aIsRight ? 'right' : rng.pick(allowed.filter((k) => k !== 'right') as AngleKind[]);
    const b: AngleKind = aIsRight ? rng.pick(allowed.filter((k) => k !== 'right') as AngleKind[]) : 'right';

    const correct = isRight(a) ? 'Angle A' : 'Angle B';

    return makeMcq({
      seed,
      templateKey,
      difficulty,
      questionText: 'Which angle is a right angle (a square corner)?',
      diagram: makeCompareDiagram(a, b),
      optionTexts: ['Angle A', 'Angle B'],
      correctText: correct,
      explanation: `${correct} is a square corner, so it is a right angle.`,
    });
  }

  // 6) Compare: same or not?
  if (templateKey === 'angle_compare_same_or_not') {
    const { a, b } = pickPair({ allowEqual: true });
    const same = angleSize(a) === angleSize(b);

    return makeMcq({
      seed,
      templateKey,
      difficulty,
      questionText: 'Do Angle A and Angle B open the same amount?',
      diagram: makeCompareDiagram(a, b),
      optionTexts: ['Yes', 'No'],
      correctText: same ? 'Yes' : 'No',
      explanation: same ? 'Both angles open the same amount.' : 'One angle opens more than the other.',
    });
  }

  // 7) Pick the right angle from two (A/B)
  if (templateKey === 'angle_pick_right_from_two') {
    const rightOnA = rng.chance(0.5);
    const a: AngleKind = rightOnA ? 'right' : rng.pick(allowed.filter((k) => k !== 'right') as AngleKind[]);
    const b: AngleKind = rightOnA ? rng.pick(allowed.filter((k) => k !== 'right') as AngleKind[]) : 'right';

    return makeMcq({
      seed,
      templateKey,
      difficulty,
      questionText: 'Pick the right angle.',
      diagram: makeCompareDiagram(a, b),
      optionTexts: ['Angle A', 'Angle B'],
      correctText: rightOnA ? 'Angle A' : 'Angle B',
      explanation: 'A right angle looks exactly like a square corner.',
    });
  }

  // 8) Pick the wide angle from two (only if wide is allowed)
  if (templateKey === 'angle_pick_wide_from_two') {
    // force one wide, one not wide (if possible)
    const nonWidePool = allowed.filter((k) => k !== 'wide') as AngleKind[];
    const wideOnA = rng.chance(0.5);

    const a: AngleKind = wideOnA ? 'wide' : rng.pick(nonWidePool.length ? nonWidePool : (['right'] as const));
    const b: AngleKind = wideOnA ? rng.pick(nonWidePool.length ? nonWidePool : (['right'] as const)) : 'wide';

    const correct = isWide(a) ? 'Angle A' : 'Angle B';

    return makeMcq({
      seed,
      templateKey,
      difficulty,
      questionText: 'Which angle is wider than a square corner?',
      diagram: makeCompareDiagram(a, b),
      optionTexts: ['Angle A', 'Angle B'],
      correctText: correct,
      explanation: `${correct} opens more than a square corner.`,
    });
  }

  // 9) Pick the small angle from two
  {
    const nonSmallPool = allowed.filter((k) => k !== 'small') as AngleKind[];
    const smallOnA = rng.chance(0.5);

    const a: AngleKind = smallOnA ? 'small' : rng.pick(nonSmallPool.length ? nonSmallPool : (['right'] as const));
    const b: AngleKind = smallOnA ? rng.pick(nonSmallPool.length ? nonSmallPool : (['right'] as const)) : 'small';

    const correct = isSmall(a) ? 'Angle A' : 'Angle B';

    return makeMcq({
      seed,
      templateKey: 'angle_pick_small_from_two',
      difficulty,
      questionText: 'Which angle is smaller than a square corner?',
      diagram: makeCompareDiagram(a, b),
      optionTexts: ['Angle A', 'Angle B'],
      correctText: correct,
      explanation: `${correct} opens less than a square corner.`,
    });
  }
}
