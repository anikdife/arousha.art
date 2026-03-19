// src/lib/geometry/generateGeometryPage.ts

import { hashStringToUint32 } from '../hash';
import type { GeometryPage, GeometryProblem, GeometrySubtopic } from './models';
import { validateGeometryPage } from './validation';
import { rngFromSeed } from './util';
import { generate2DShapeQuestion } from './generators/generate2DShapeQuestion';
import { generateAngleQuestion } from './generators/generateAngleQuestion';
import { generateSymmetryQuestion } from './generators/generateSymmetryQuestion';

function subSeed(baseSeed: number, key: string): number {
  return hashStringToUint32(`geometry:${baseSeed}:${key}`);
}

function generateForSubtopic(subtopic: GeometrySubtopic, seed: number): GeometryProblem {
  switch (subtopic) {
    case '2d-shapes':
      return generate2DShapeQuestion(seed);
    case 'angles':
      return generateAngleQuestion(seed);
    case 'symmetry':
      return generateSymmetryQuestion(seed);
    default: {
      const _exhaustive: never = subtopic;
      throw new Error(`Unhandled geometry subtopic: ${_exhaustive}`);
    }
  }
}

function buildSchedule(count: number, seed: number): GeometrySubtopic[] {
  if (count <= 0) return [];

  const base: GeometrySubtopic[] = ['2d-shapes', 'angles', 'symmetry'];
  const rng = rngFromSeed(seed);

  // Balanced mix: repeat the 3-subtopic set, then distribute remainder.
  const schedule: GeometrySubtopic[] = [];
  while (schedule.length + 3 <= count) schedule.push(...base);

  const remaining = count - schedule.length;
  if (remaining > 0) {
    const shuffled = rng.shuffle([...base]);
    schedule.push(...shuffled.slice(0, remaining));
  }

  // Shuffle overall schedule but keep balance.
  return rng.shuffle(schedule);
}

export function generateGeometryPage(seed: number, count: number): GeometryPage {
  if (!Number.isFinite(seed)) throw new Error('generateGeometryPage: seed must be a finite number');
  if (!Number.isInteger(count) || count < 1) throw new Error('generateGeometryPage: count must be a positive integer');

  const schedule = buildSchedule(count, seed);

  const problems: GeometryProblem[] = [];
  const usedTemplateKeys = new Set<string>();

  for (let i = 0; i < schedule.length; i++) {
    const subtopic = schedule[i];

    let attempt = 0;
    let problem: GeometryProblem | null = null;
    while (attempt < 50) {
      const s = subSeed(seed, `${subtopic}:${i}:${attempt}`);
      const candidate = generateForSubtopic(subtopic, s);

      // Avoid the exact same pattern twice in a row.
      const prev = problems[problems.length - 1];
      if (prev && prev.metadata.templateKey === candidate.metadata.templateKey) {
        attempt++;
        continue;
      }

      // Prefer not repeating the same pattern within a page, but don't fail the page
      // if the caller asked for more questions than we have distinct patterns.
      if (usedTemplateKeys.has(candidate.metadata.templateKey) && attempt < 10) {
        attempt++;
        continue;
      }

      problem = candidate;
      break;
    }

    if (!problem) throw new Error(`generateGeometryPage: failed to generate unique problem for ${subtopic}`);

    usedTemplateKeys.add(problem.metadata.templateKey);
    problems.push(problem);
  }

  // Validate safety + correctness.
  validateGeometryPage(problems);

  return { seed, problems };
}
