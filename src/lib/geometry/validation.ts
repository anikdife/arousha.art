// src/lib/geometry/validation.ts

import type { GeometryProblem, GeometryProblemType } from './models';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isIntegerString(s: string): boolean {
  if (typeof s !== 'string') return false;
  if (!/^-?\d+$/.test(s.trim())) return false;
  const n = Number(s);
  return Number.isInteger(n);
}

function validateMcq(problem: GeometryProblem) {
  assert(problem.type === 'multiple-choice', 'validateMcq called for non-MCQ');
  // Allow Yes/No style MCQ.
  assert(Array.isArray(problem.options) && problem.options.length >= 2, 'MCQ must have at least 2 options');

  const ids = problem.options.map((o) => o.id);
  assert(new Set(ids).size === ids.length, 'MCQ option ids must be unique');

  const correctId = problem.correctAnswer.value;
  assert(ids.includes(correctId), 'MCQ correctAnswer must match an option id');

  // Exactly one correct option is implicit by design: one correctAnswer id.
}

function validateInput(problem: GeometryProblem) {
  assert(problem.type === 'input', 'validateInput called for non-input');
  assert(problem.correctAnswer.kind === 'input', 'Input correctAnswer.kind must be input');
  assert(isIntegerString(problem.correctAnswer.value), 'Input correctAnswer must be an integer string');
}

export function validateGeometryProblem(problem: GeometryProblem): void {
  assert(problem.marks === 1, 'GeometryProblem.marks must be 1');
  assert(problem.metadata.topic === 'geometry', 'GeometryProblem.metadata.topic must be geometry');
  assert(problem.metadata.yearLevel === 3, 'GeometryProblem.metadata.yearLevel must be 3');
  assert(typeof problem.id === 'string' && problem.id.length > 0, 'GeometryProblem.id required');
  assert(typeof problem.questionText === 'string' && problem.questionText.length > 0, 'GeometryProblem.questionText required');
  assert(typeof problem.explanation === 'string' && problem.explanation.length > 0, 'GeometryProblem.explanation required');

  if (problem.type === 'multiple-choice') validateMcq(problem);
  if (problem.type === 'input') validateInput(problem);

  assert(problem.correctAnswer.kind === problem.type, 'correctAnswer.kind must match problem.type');
}

export function validateGeometryPage(problems: GeometryProblem[]): void {
  for (const p of problems) validateGeometryProblem(p);
}

export function makeAnswer(kind: GeometryProblemType, value: string) {
  return { kind, value } as const;
}
