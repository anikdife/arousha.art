// src/lib/geometry/generators/generate2DShapeQuestion.ts

import type {
  GeometryDifficulty,
  GeometryDiagram,
  GeometryProblem,
  GeometryShapeName,
} from '../models';
import { makeAnswer } from '../validation';
import { idFrom, makeOptionsFromTexts, pickDistinct, rngFromSeed } from '../util';

const SHAPES: readonly GeometryShapeName[] = [
  'square',
  'rectangle',
  'triangle',
  'circle',
  'pentagon',
  'hexagon',
] as const;

function sidesOf(shape: GeometryShapeName): number {
  switch (shape) {
    case 'triangle':
      return 3;
    case 'square':
    case 'rectangle':
      return 4;
    case 'pentagon':
      return 5;
    case 'hexagon':
      return 6;
    case 'circle':
      return 0;
    default: {
      const _exhaustive: never = shape;
      return _exhaustive;
    }
  }
}

function cornersOf(shape: GeometryShapeName): number {
  // Year 3: circle has 0 corners.
  return sidesOf(shape);
}

function isPolygon(shape: GeometryShapeName): boolean {
  return shape !== 'circle';
}

function makeDistinctNumberOptions(params: {
  correct: number;
  count: number;
  rng: ReturnType<typeof rngFromSeed>;
}): string[] {
  const { correct, count, rng } = params;

  const values = new Set<number>();
  values.add(correct);

  // Keep distractors close to the correct answer (NAPLAN-like).
  const deltas = [-1, 1, 2, -2, 3, -3, 4];
  for (const d of deltas) {
    if (values.size >= count) break;
    values.add(Math.max(0, correct + d));
  }

  // Last resort: keep adding increasing integers.
  let n = correct + 5;
  while (values.size < count) {
    values.add(Math.max(0, n));
    n++;
  }

  return rng.shuffle(Array.from(values).map(String)).slice(0, count);
}

type ShapeTemplate =
  | 'shape_identify_name'
  | 'shape_count_sides'
  | 'shape_count_corners'
  | 'shape_property_equal_sides'
  | 'shape_property_has_round_edge'
  | 'shape_compare_sides_more'
  | 'shape_compare_sides_less'
  | 'shape_compare_corners_more'
  | 'shape_compare_corners_less'
  | 'shape_select_polygon'
  | 'shape_select_not_polygon'
  | 'shape_truth_statement_sides';

function symmetryFor(shape: GeometryShapeName, difficulty: GeometryDifficulty): GeometryDiagram['symmetryLines'] | undefined {
  // Only add symmetry hints at higher difficulty (and only for shapes where it makes sense).
  if (difficulty < 3) return undefined;

  const centerLines: GeometryDiagram['symmetryLines'] = [
    { orientation: 'vertical', at: 0.5 },
    { orientation: 'horizontal', at: 0.5 },
  ];

  switch (shape) {
    case 'square':
      return centerLines;
    case 'rectangle':
      return centerLines;
    case 'hexagon':
      // True hexagon symmetry includes diagonals, but our diagram renderer
      // currently supports vertical/horizontal symmetry hints only.
      return centerLines;
    default:
      return undefined;
  }
}

function makeDiagram(shape: GeometryShapeName, difficulty: GeometryDifficulty): GeometryDiagram {
  return {
    shapeType: shape,
    width: 180,
    height: 140,
    symmetryLines: symmetryFor(shape, difficulty),
  };
}

function makeMcqProblem(params: {
  seed: number;
  templateKey: ShapeTemplate;
  difficulty: GeometryDifficulty;
  questionText: string;
  diagram?: GeometryDiagram;
  optionTexts: string[];
  correctText: string;
  explanation: string;
}): GeometryProblem {
  const {
    seed,
    templateKey,
    difficulty,
    questionText,
    diagram,
    optionTexts,
    correctText,
    explanation,
  } = params;

  const options = makeOptionsFromTexts(seed, optionTexts);
  const correct = options.find((o) => o.text === correctText);
  if (!correct) throw new Error('2D shapes generator produced invalid correct option');

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
      subtopic: '2d-shapes',
      difficulty,
      yearLevel: 3,
      templateKey,
    },
  };
}

function pickTwoDistinctShapes(
  rng: ReturnType<typeof rngFromSeed>,
  pool: readonly GeometryShapeName[],
): { a: GeometryShapeName; b: GeometryShapeName } {
  const a = rng.pick(pool);
  let b = rng.pick(pool);
  let guard = 0;
  while (b === a && guard < 20) {
    b = rng.pick(pool);
    guard++;
  }
  return { a, b };
}

export function generate2DShapeQuestion(seed: number): GeometryProblem {
  const rng = rngFromSeed(seed);
  const difficulty: GeometryDifficulty = (rng.int(1, 3) as GeometryDifficulty) ?? 1;

  const templates: readonly ShapeTemplate[] = [
    'shape_identify_name',
    'shape_count_sides',
    'shape_count_corners',
    'shape_property_equal_sides',
    'shape_property_has_round_edge',
    'shape_compare_sides_more',
    'shape_compare_sides_less',
    'shape_compare_corners_more',
    'shape_compare_corners_less',
    'shape_select_polygon',
    'shape_select_not_polygon',
    'shape_truth_statement_sides',
  ] as const;

  const templateKey = rng.pick(templates);

  // Choose a target shape.
  const shape = rng.pick(SHAPES);

  if (templateKey === 'shape_identify_name') {
    const choices = pickDistinct(rng, SHAPES, 4);
    if (!choices.includes(shape)) choices[rng.int(0, choices.length - 1)] = shape;

    return makeMcqProblem({
      seed,
      templateKey,
      difficulty,
      questionText: 'What is the name of this shape?',
      diagram: makeDiagram(shape, difficulty),
      optionTexts: choices.map((s) => s),
      correctText: shape,
      explanation: `This shape is called a ${shape}.`,
    });
  }

  if (templateKey === 'shape_count_sides') {
    // Avoid circle for “count sides” at low difficulty.
    const pool = (difficulty === 1
      ? (SHAPES.filter((s) => s !== 'circle') as GeometryShapeName[])
      : (SHAPES as GeometryShapeName[]));

    const target = rng.pick(pool);
    const sides = sidesOf(target);
    const optionTexts = makeDistinctNumberOptions({ correct: sides, count: 4, rng });

    return makeMcqProblem({
      seed,
      templateKey,
      difficulty,
      questionText: 'How many sides does this shape have?',
      diagram: makeDiagram(target, difficulty),
      optionTexts,
      correctText: String(sides),
      explanation: `Count the straight sides. This shape has ${sides} sides.`,
    });
  }

  if (templateKey === 'shape_count_corners') {
    // Avoid circle for “count corners” at low difficulty.
    const pool = (difficulty === 1
      ? (SHAPES.filter((s) => s !== 'circle') as GeometryShapeName[])
      : (SHAPES as GeometryShapeName[]));

    const target = rng.pick(pool);
    const corners = cornersOf(target);
    const optionTexts = makeDistinctNumberOptions({ correct: corners, count: 4, rng });

    return makeMcqProblem({
      seed,
      templateKey,
      difficulty,
      questionText: 'How many corners does this shape have?',
      diagram: makeDiagram(target, difficulty),
      optionTexts,
      correctText: String(corners),
      explanation: `Corners are the pointy turns. This shape has ${corners} corners.`,
    });
  }

  if (templateKey === 'shape_property_equal_sides') {
    // Keep property unambiguous for Year 3 (in this set, square is the intended correct answer).
    const optionTexts = ['square', 'rectangle', 'triangle', 'circle'];
    return makeMcqProblem({
      seed,
      templateKey,
      difficulty,
      questionText: 'Which shape has 4 equal sides?',
      optionTexts,
      correctText: 'square',
      explanation: 'A square has 4 sides that are all the same length.',
    });
  }

  if (templateKey === 'shape_property_has_round_edge') {
    const optionTexts = ['circle', 'square', 'triangle', 'rectangle'];
    return makeMcqProblem({
      seed,
      templateKey,
      difficulty,
      questionText: 'Which shape is round?',
      optionTexts,
      correctText: 'circle',
      explanation: 'A circle is round and has no straight sides.',
    });
  }

  if (templateKey === 'shape_select_polygon') {
    const optionTexts = ['triangle', 'square', 'rectangle', 'circle'];
    // Any polygon is correct; to keep single-correct, we select a specific correct option.
    const correctPool = ['triangle', 'square', 'rectangle'] as const;
    const correctText = rng.pick(correctPool);

    return makeMcqProblem({
      seed,
      templateKey,
      difficulty,
      questionText: 'Which shape has only straight sides?',
      optionTexts,
      correctText,
      explanation: 'Polygons have only straight sides. A circle is round.',
    });
  }

  if (templateKey === 'shape_select_not_polygon') {
    const optionTexts = ['circle', 'triangle', 'square', 'pentagon'];
    return makeMcqProblem({
      seed,
      templateKey,
      difficulty,
      questionText: 'Which shape is NOT a polygon?',
      optionTexts,
      correctText: 'circle',
      explanation: 'A circle is round. Polygons have straight sides.',
    });
  }

  if (templateKey === 'shape_compare_sides_more' || templateKey === 'shape_compare_sides_less') {
    const pool = SHAPES.filter((s) => s !== 'circle') as GeometryShapeName[];
    const { a, b } = pickTwoDistinctShapes(rng, pool);

    const sa = sidesOf(a);
    const sb = sidesOf(b);

    // Ensure a clear winner (no ties)
    if (sa === sb) {
      // Force b to a different-side-count shape
      const altPool = pool.filter((s) => s !== a && sidesOf(s) !== sa);
      const bb = altPool.length ? rng.pick(altPool) : b;
      const sbb = sidesOf(bb);

      const wantMore = templateKey === 'shape_compare_sides_more';
      const correctText =
        wantMore ? (sa > sbb ? a : bb) : (sa < sbb ? a : bb);

      const optionTexts = pickDistinct(rng, pool, 4);
      if (!optionTexts.includes(correctText)) optionTexts[rng.int(0, optionTexts.length - 1)] = correctText;

      return makeMcqProblem({
        seed,
        templateKey,
        difficulty,
        questionText: wantMore ? 'Which shape has MORE sides?' : 'Which shape has FEWER sides?',
        optionTexts,
        correctText,
        explanation: wantMore
          ? `${correctText} has more sides than the other shape.`
          : `${correctText} has fewer sides than the other shape.`,
      });
    }

    const wantMore = templateKey === 'shape_compare_sides_more';
    const correctText = wantMore ? (sa > sb ? a : b) : (sa < sb ? a : b);

    const optionTexts = pickDistinct(rng, pool, 4);
    if (!optionTexts.includes(correctText)) optionTexts[rng.int(0, optionTexts.length - 1)] = correctText;

    return makeMcqProblem({
      seed,
      templateKey,
      difficulty,
      questionText: wantMore ? 'Which shape has MORE sides?' : 'Which shape has FEWER sides?',
      optionTexts,
      correctText,
      explanation: wantMore
        ? `${correctText} has more sides than the other shape.`
        : `${correctText} has fewer sides than the other shape.`,
    });
  }

  if (templateKey === 'shape_compare_corners_more' || templateKey === 'shape_compare_corners_less') {
    const pool = SHAPES.filter((s) => s !== 'circle') as GeometryShapeName[];
    const { a, b } = pickTwoDistinctShapes(rng, pool);

    const ca = cornersOf(a);
    const cb = cornersOf(b);

    // Ensure a clear winner (no ties)
    if (ca === cb) {
      const altPool = pool.filter((s) => s !== a && cornersOf(s) !== ca);
      const bb = altPool.length ? rng.pick(altPool) : b;
      const cbb = cornersOf(bb);

      const wantMore = templateKey === 'shape_compare_corners_more';
      const correctText =
        wantMore ? (ca > cbb ? a : bb) : (ca < cbb ? a : bb);

      const optionTexts = pickDistinct(rng, pool, 4);
      if (!optionTexts.includes(correctText)) optionTexts[rng.int(0, optionTexts.length - 1)] = correctText;

      return makeMcqProblem({
        seed,
        templateKey,
        difficulty,
        questionText: wantMore ? 'Which shape has MORE corners?' : 'Which shape has FEWER corners?',
        optionTexts,
        correctText,
        explanation: wantMore
          ? `${correctText} has more corners than the other shape.`
          : `${correctText} has fewer corners than the other shape.`,
      });
    }

    const wantMore = templateKey === 'shape_compare_corners_more';
    const correctText = wantMore ? (ca > cb ? a : b) : (ca < cb ? a : b);

    const optionTexts = pickDistinct(rng, pool, 4);
    if (!optionTexts.includes(correctText)) optionTexts[rng.int(0, optionTexts.length - 1)] = correctText;

    return makeMcqProblem({
      seed,
      templateKey,
      difficulty,
      questionText: wantMore ? 'Which shape has MORE corners?' : 'Which shape has FEWER corners?',
      optionTexts,
      correctText,
      explanation: wantMore
        ? `${correctText} has more corners than the other shape.`
        : `${correctText} has fewer corners than the other shape.`,
    });
  }

  // shape_truth_statement_sides
  {
    // “Which statement is true?” using 4 statements (single correct).
    // Keep Year 3-friendly: use small numbers and common shapes.
    const common: GeometryShapeName[] = ['triangle', 'square', 'rectangle', 'pentagon', 'hexagon', 'circle'];
    const target = rng.pick(common);
    const sides = sidesOf(target);

    const trueStmt =
      target === 'circle'
        ? 'A circle has no straight sides.'
        : `A ${target} has ${sides} sides.`;

    const falsePool = [
      'A triangle has 4 sides.',
      'A square has 3 sides.',
      'A rectangle is round.',
      'A circle has 4 corners.',
      'A pentagon has 6 sides.',
      'A hexagon has 5 sides.',
    ];

    const optionTexts = rng.shuffle([trueStmt, ...rng.shuffle(falsePool).slice(0, 3)]);

    return makeMcqProblem({
      seed,
      templateKey,
      difficulty,
      questionText: 'Which statement is true?',
      optionTexts,
      correctText: trueStmt,
      explanation:
        target === 'circle'
          ? 'A circle is round and has no straight sides.'
          : `Count the sides. A ${target} has ${sides} sides.`,
    });
  }
}
