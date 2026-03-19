// src/lib/languageConventions/bank.ts

import type { LCQuestion } from './types';
import rawBankData from './bank.data.json';

/**
 * Versioned, static question bank.
 *
 * IMPORTANT: Do not attempt to parse PDFs at runtime.
 * Populate this array only with the already-extracted question list.
 */
export const LC_QUESTION_BANK_VERSION = '2025-12-31';

/**
 * Year 3 – Language Conventions question bank
 *
 * Add your extracted questions to `bank.data.json` (same folder as this file).
 * This module performs minimal runtime validation and will ignore invalid rows.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isChoiceTuple4(value: unknown): value is [string, string, string, string] {
  return Array.isArray(value) && value.length === 4 && value.every((v) => typeof v === 'string');
}

function isCorrectIndex(value: unknown): value is 0 | 1 | 2 | 3 {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function coerceQuestion(value: unknown): LCQuestion | null {
  if (!isRecord(value)) return null;
  if (!isString(value.id)) return null;
  if (!isString(value.type)) return null;
  if (!isString(value.prompt)) return null;
  if (!isString(value.skill)) return null;

  if (value.type === 'mcq') {
    if (!isChoiceTuple4(value.choices)) return null;
    if (!isCorrectIndex(value.correctIndex)) return null;
    const sentence = isString(value.sentence) ? value.sentence : undefined;
    return {
      id: value.id,
      type: 'mcq',
      prompt: value.prompt,
      sentence,
      choices: value.choices,
      correctIndex: value.correctIndex,
      skill: value.skill as any,
    };
  }

  if (value.type === 'spell') {
    if (!isString(value.sentenceWithError)) return null;
    if (!isString(value.errorToken)) return null;
    if (!isString(value.correctToken)) return null;
    return {
      id: value.id,
      type: 'spell',
      prompt: value.prompt,
      sentenceWithError: value.sentenceWithError,
      errorToken: value.errorToken,
      correctToken: value.correctToken,
      skill: 'spelling',
    };
  }

  if (value.type === 'selectIncorrect') {
    if (!isString(value.sentence)) return null;
    if (!isStringArray(value.tokens)) return null;
    if (typeof value.incorrectIndex !== 'number') return null;
    if (!isString(value.correctToken)) return null;
    return {
      id: value.id,
      type: 'selectIncorrect',
      prompt: value.prompt,
      sentence: value.sentence,
      tokens: value.tokens,
      incorrectIndex: value.incorrectIndex,
      correctToken: value.correctToken,
      skill: value.skill as any,
    };
  }

  return null;
}

function loadBank(value: unknown): LCQuestion[] {
  if (!Array.isArray(value)) return [];
  const out: LCQuestion[] = [];
  const seenIds = new Set<string>();

  for (const row of value) {
    const q = coerceQuestion(row);
    if (!q) continue;
    if (seenIds.has(q.id)) continue;
    seenIds.add(q.id);
    out.push(q);
  }

  return out;
}

export function validateLcBank(value: unknown): LCQuestion[] {
  return loadBank(value);
}

export function parseLcBankJsonTextStrict(text: string): LCQuestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e: any) {
    throw new Error(`Bank JSON is malformed: ${String(e?.message ?? e)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Bank JSON is malformed: expected a top-level array of questions.');
  }

  const bank = loadBank(parsed);
  if (bank.length === 0) {
    throw new Error('Bank JSON is malformed: no valid questions found after validation.');
  }

  return bank;
}

export const LC_QUESTION_BANK: LCQuestion[] = loadBank(rawBankData);
