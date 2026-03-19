// src/lib/geometry/generators/generateSymmetryQuestion.ts

import type { GeometryDifficulty, GeometryDiagram, GeometryProblem, GeometryShapeName } from '../models';
import { makeAnswer } from '../validation';
import { idFrom, makeOptionsFromTexts, rngFromSeed } from '../util';

type SymmetryTemplate = 'symmetry_fold_line_yesno' | 'symmetry_count_category';

type SymmetryCategory = 'no fold line' | 'one fold line' | 'more than one fold line';

type SymmetryShapeSpec = {
  shape: GeometryShapeName;
  // How many vertical/horizontal lines we consider for Year 3.
  category: SymmetryCategory;
  // Valid fold lines (orientation + at) that will work.
  validLines: ReadonlyArray<{ orientation: 'vertical' | 'horizontal'; at: number }>;
};

const SYMMETRY_SHAPES: readonly SymmetryShapeSpec[] = [
  {
    shape: 'rectangle',
    category: 'more than one fold line',
    validLines: [
      { orientation: 'vertical', at: 0.5 },
      { orientation: 'horizontal', at: 0.5 },
    ],
  },
  {
    shape: 'square',
    category: 'more than one fold line',
    validLines: [
      { orientation: 'vertical', at: 0.5 },
      { orientation: 'horizontal', at: 0.5 },
    ],
  },
  {
    shape: 'circle',
    category: 'more than one fold line',
    validLines: [
      { orientation: 'vertical', at: 0.5 },
      { orientation: 'horizontal', at: 0.5 },
    ],
  },
  {
    shape: 'triangle',
    category: 'one fold line',
    validLines: [{ orientation: 'vertical', at: 0.5 }],
  },
  {
    shape: 'pentagon',
    // Treat as irregular for our simple renderer; keep category "no fold line".
    category: 'no fold line',
    validLines: [],
  },
] as const;

function makeMcq(params: {
  seed: number;
  templateKey: SymmetryTemplate;
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
  if (!correct) throw new Error('Symmetry generator produced invalid correct option');

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
      subtopic: 'symmetry',
      difficulty,
      yearLevel: 3,
      templateKey,
    },
  };
}

export function generateSymmetryQuestion(seed: number): GeometryProblem {
  const rng = rngFromSeed(seed);
  const difficulty: GeometryDifficulty = (rng.int(1, 3) as GeometryDifficulty) ?? 1;

  const templateKey: SymmetryTemplate = rng.pick(['symmetry_fold_line_yesno', 'symmetry_count_category'] as const);
  const shapeSpec = rng.pick(SYMMETRY_SHAPES);

  if (templateKey === 'symmetry_fold_line_yesno') {
    const showValid = shapeSpec.validLines.length > 0 ? rng.chance(0.7) : false;

    // Pick a candidate line.
    let line: { orientation: 'vertical' | 'horizontal'; at: number };
    if (showValid) {
      line = rng.pick(shapeSpec.validLines);
    } else {
      // Produce an invalid vertical/horizontal line: wrong position, or a line type not listed.
      const orientation = rng.pick(['vertical', 'horizontal'] as const);
      const at = rng.pick([0.2, 0.3, 0.7, 0.8] as const);
      line = { orientation, at };

      // Guard: ensure it's not accidentally valid.
      if (shapeSpec.validLines.some((v) => v.orientation === line.orientation && Math.abs(v.at - line.at) < 1e-9)) {
        line = { orientation, at: 0.3 };
      }
    }

    const diagram: GeometryDiagram = {
      shapeType: shapeSpec.shape,
      width: 180,
      height: 140,
      symmetryLines: [line],
      data: {
        // Helps render triangles as isosceles for the valid case.
        triangleKind: shapeSpec.shape === 'triangle' ? 'isosceles' : undefined,
      },
    };

    const isCorrectFoldLine = shapeSpec.validLines.some(
      (v) => v.orientation === line.orientation && Math.abs(v.at - line.at) < 1e-9
    );

    return makeMcq({
      seed,
      templateKey,
      difficulty,
      questionText: 'If you fold along the line, will both sides match?',
      diagram,
      optionTexts: ['Yes', 'No'],
      correctText: isCorrectFoldLine ? 'Yes' : 'No',
      explanation: isCorrectFoldLine
        ? 'This line is a fold line of symmetry because both sides match.'
        : 'This is not a fold line of symmetry because the sides will not match when folded.',
    });
  }

  // symmetry_count_category
  // Use a known category to avoid ambiguity.
  const diagram: GeometryDiagram = {
    shapeType: shapeSpec.shape,
    width: 180,
    height: 140,
    data: {
      triangleKind: shapeSpec.shape === 'triangle' ? 'isosceles' : undefined,
    },
  };

  const optionTexts: SymmetryCategory[] = ['no fold line', 'one fold line', 'more than one fold line'];

  return makeMcq({
    seed,
    templateKey,
    difficulty,
    questionText: 'How many fold lines of symmetry does this shape have?',
    diagram,
    optionTexts: [...optionTexts],
    correctText: shapeSpec.category,
    explanation:
      shapeSpec.category === 'no fold line'
        ? 'There is no way to fold it so both sides match.'
        : shapeSpec.category === 'one fold line'
          ? 'There is one fold line where both sides match.'
          : 'There is more than one fold line where both sides match.',
  });
}
