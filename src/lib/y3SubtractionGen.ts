// src/lib/y3SubtractionGen.ts

import { WordSubProblem, Difficulty, generateWordSubProblem } from './y3SubtractionWords';

export type Year = 3;

export type SubVariant =
  | "2d_no_borrow"
  | "2d_borrow"
  | "3d_no_borrow"
  | "3d_borrow"
  | "across_zero"
  | "missing_subtrahend"
  | "missing_minuend";

export type NumericSubProblem = {
  id: string;
  kind: "numeric";
  variant: SubVariant;
  a: number | null; // top number (minuend); null if missing_minuend
  b: number | null; // bottom number (subtrahend); null if missing_subtrahend
  expected: number; // ALWAYS the correct value the student must type
};

// Legacy alias for backward compatibility
export type SubProblem = NumericSubProblem;

export type AnySubProblem = NumericSubProblem | WordSubProblem;

export type PracticePage = {
  pageId: string;
  problems: AnySubProblem[];
  userAnswers: Record<string, string>;
  graded?: Record<string, boolean>;
};

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generate2dNoBorrow(): NumericSubProblem {
  const bOnes = getRandomInt(1, 9);
  const bTens = getRandomInt(1, 9);
  const aOnes = getRandomInt(bOnes, 9);
  const aTens = getRandomInt(bTens, 9);
  
  const a = aTens * 10 + aOnes;
  const b = bTens * 10 + bOnes;
  const expected = a - b;

  return {
    id: crypto.randomUUID(),
    kind: "numeric",
    variant: "2d_no_borrow",
    a,
    b,
    expected
  };
}

function generate2dBorrow(): NumericSubProblem {
  const aOnes = getRandomInt(0, 9);
  const aTens = getRandomInt(1, 9);
  const bOnes = getRandomInt(aOnes + 1, 9);
  const bTens = getRandomInt(0, aTens);
  
  const a = aTens * 10 + aOnes;
  const b = bTens * 10 + bOnes;
  const expected = a - b;

  return {
    id: crypto.randomUUID(),
    kind: "numeric",
    variant: "2d_borrow",
    a,
    b,
    expected
  };
}

function generate3dNoBorrow(): NumericSubProblem {
  const bOnes = getRandomInt(1, 9);
  const bTens = getRandomInt(1, 9);
  const bHundreds = getRandomInt(1, 9);
  const aOnes = getRandomInt(bOnes, 9);
  const aTens = getRandomInt(bTens, 9);
  const aHundreds = getRandomInt(bHundreds, 9);
  
  const a = aHundreds * 100 + aTens * 10 + aOnes;
  const b = bHundreds * 100 + bTens * 10 + bOnes;
  const expected = a - b;

  return {
    id: crypto.randomUUID(),
    kind: "numeric",
    variant: "3d_no_borrow",
    a,
    b,
    expected
  };
}

function generate3dBorrow(): NumericSubProblem {
  const bOnes = getRandomInt(2, 9);
  const bTens = getRandomInt(1, 9);
  const bHundreds = getRandomInt(1, 8);
  const aOnes = getRandomInt(0, bOnes - 1); // Force borrowing
  const aTens = getRandomInt(0, 9);
  const aHundreds = getRandomInt(bHundreds + 1, 9);
  
  const a = aHundreds * 100 + aTens * 10 + aOnes;
  const b = bHundreds * 100 + bTens * 10 + bOnes;
  const expected = a - b;

  return {
    id: crypto.randomUUID(),
    kind: "numeric",
    variant: "3d_borrow",
    a,
    b,
    expected
  };
}

function generateAcrossZero(): NumericSubProblem {
  const bOnes = getRandomInt(1, 9);
  const bTens = getRandomInt(1, 9);
  const bHundreds = getRandomInt(1, 4);
  const aOnes = getRandomInt(0, 9);
  const aTens = 0; // Force tens digit to be 0
  const aHundreds = getRandomInt(bHundreds + 1, 9);
  
  const a = aHundreds * 100 + aTens * 10 + aOnes;
  const b = bHundreds * 100 + bTens * 10 + bOnes;
  const expected = a - b;

  return {
    id: crypto.randomUUID(),
    kind: "numeric",
    variant: "across_zero",
    a,
    b,
    expected
  };
}

function generateMissingSubtrahend(): NumericSubProblem {
  const a = getRandomInt(10, 99);
  const result = getRandomInt(1, a - 1);
  const expected = a - result; // The missing subtrahend

  return {
    id: crypto.randomUUID(),
    kind: "numeric",
    variant: "missing_subtrahend",
    a,
    b: null,
    expected
  };
}

function generateMissingMinuend(): NumericSubProblem {
  const b = getRandomInt(1, 50);
  const result = getRandomInt(1, 50);
  const expected = result + b; // The missing minuend

  return {
    id: crypto.randomUUID(),
    kind: "numeric",
    variant: "missing_minuend",
    a: null,
    b,
    expected
  };
}

export function generatePracticePage(
  options: { numericCount?: number; wordCount?: number; difficulty?: Difficulty } = {}
): PracticePage {
  const { numericCount = 8, wordCount = 0, difficulty = "easy" } = options;
  const variants: SubVariant[] = [
    "2d_no_borrow",
    "2d_borrow", 
    "3d_no_borrow",
    "3d_borrow",
    "across_zero",
    "missing_subtrahend",
    "missing_minuend"
  ];

  const problems: AnySubProblem[] = [];
  
  // Generate numeric problems
  for (let i = 0; i < numericCount; i++) {
    const variant = variants[i % variants.length];
    
    switch (variant) {
      case "2d_no_borrow":
        problems.push(generate2dNoBorrow());
        break;
      case "2d_borrow":
        problems.push(generate2dBorrow());
        break;
      case "3d_no_borrow":
        problems.push(generate3dNoBorrow());
        break;
      case "3d_borrow":
        problems.push(generate3dBorrow());
        break;
      case "across_zero":
        problems.push(generateAcrossZero());
        break;
      case "missing_subtrahend":
        problems.push(generateMissingSubtrahend());
        break;
      case "missing_minuend":
        problems.push(generateMissingMinuend());
        break;
    }
  }
  
  // Generate word problems
  for (let i = 0; i < wordCount; i++) {
    problems.push(generateWordSubProblem(difficulty));
  }

  return {
    pageId: crypto.randomUUID(),
    problems,
    userAnswers: {},
  };
}

export function expectedAnswer(problem: AnySubProblem): number {
  if (problem.kind === "word") {
    return problem.answer;
  } else {
    return problem.expected;
  }
}

export function computeExpected(problem: SubProblem): number {
  return problem.expected;
}

export function formatForDisplay(problem: SubProblem): { top: string; bottom: string; op: "-"; result?: string } {
  const { variant, a, b } = problem;
  
  if (variant === "missing_subtrahend") {
    const result = a! - problem.expected;
    return {
      top: a!.toString(),
      bottom: "?",
      op: "-",
      result: result.toString()
    };
  }
  
  if (variant === "missing_minuend") {
    const result = problem.expected - b!;
    return {
      top: "?",
      bottom: b!.toString(),
      op: "-",
      result: result.toString()
    };
  }
  
  return {
    top: a!.toString(),
    bottom: b!.toString(),
    op: "-"
  };
}