import type { LCSkill, LCQuestion } from './types';
import type { BanksBundle } from './bankStorageService';
import { createRng } from './rng';

type MixBucket = {
  label: string;
  count: number;
  candidates: (q: LCQuestion) => boolean;
  fallbacks: Array<(q: LCQuestion) => boolean>;
};

function dedupeById(items: LCQuestion[]): LCQuestion[] {
  const out: LCQuestion[] = [];
  const seen = new Set<string>();
  for (const q of items) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    out.push(q);
  }
  return out;
}

function isMcq(q: LCQuestion): boolean {
  return q.type === 'mcq';
}

function pickOne(params: {
  rng: ReturnType<typeof createRng>;
  bank: LCQuestion[];
  required: (q: LCQuestion) => boolean;
  fallbacks: Array<(q: LCQuestion) => boolean>;
  selectedIds: Set<string>;
  usedIds: Set<string>;
}): LCQuestion | null {
  const { rng, bank, required, fallbacks, selectedIds, usedIds } = params;

  const strategies: Array<(q: LCQuestion) => boolean> = [required, ...fallbacks];

  const tryPick = (predicate: (q: LCQuestion) => boolean, allowUsed: boolean): LCQuestion | null => {
    const pool = bank.filter((q) => predicate(q) && !selectedIds.has(q.id) && (allowUsed || !usedIds.has(q.id)));
    if (pool.length === 0) return null;
    const shuffled = rng.shuffle(pool.slice());
    return shuffled[0] ?? null;
  };

  // Prefer not used in session
  for (const pred of strategies) {
    const q = tryPick(pred, false);
    if (q) return q;
  }

  // Allow used in session
  for (const pred of strategies) {
    const q = tryPick(pred, true);
    if (q) return q;
  }

  return null;
}

function mixBuckets(): MixBucket[] {
  // Required per-page mix (10 total)
  // spelling total 4 (2 spell + 2 selectIncorrect)
  // grammar/wordChoice 3 (mcq)
  // punctuation 1 (mcq)
  // capitalisation 1 (mcq)
  // sentence structure 1 (mcq)

  const spellingSpell: MixBucket = {
    label: 'spelling:spell',
    count: 2,
    candidates: (q) => q.skill === 'spelling' && q.type === 'spell',
    fallbacks: [
      // same skill different type
      (q) => q.skill === 'spelling' && q.type === 'selectIncorrect',
      // same section any mcq
      (q) => isMcq(q),
      // finally any question
      (_q) => true,
    ],
  };

  const spellingSelectIncorrect: MixBucket = {
    label: 'spelling:selectIncorrect',
    count: 2,
    candidates: (q) => q.skill === 'spelling' && q.type === 'selectIncorrect',
    fallbacks: [
      (q) => q.skill === 'spelling' && q.type === 'spell',
      (q) => isMcq(q),
      (_q) => true,
    ],
  };

  const grammarWordChoice: MixBucket = {
    label: 'grammar/wordChoice:mcq',
    count: 3,
    candidates: (q) =>
      q.type === 'mcq' && (q.skill === 'grammar' || q.skill === 'wordChoice'),
    fallbacks: [
      // Try any mcq
      (q) => q.type === 'mcq',
      // Finally any question
      (_q) => true,
    ],
  };

  const punctuation: MixBucket = {
    label: 'punctuation:mcq',
    count: 1,
    candidates: (q) => q.type === 'mcq' && q.skill === 'punctuation',
    fallbacks: [(q) => q.type === 'mcq', (_q) => true],
  };

  const capitalisation: MixBucket = {
    label: 'capitalisation:mcq',
    count: 1,
    candidates: (q) => q.type === 'mcq' && q.skill === 'capitalisation',
    fallbacks: [(q) => q.type === 'mcq', (_q) => true],
  };

  const sentence: MixBucket = {
    label: 'sentence:mcq',
    count: 1,
    candidates: (q) => q.type === 'mcq' && q.skill === 'sentence',
    fallbacks: [(q) => q.type === 'mcq', (_q) => true],
  };

  return [spellingSpell, spellingSelectIncorrect, grammarWordChoice, punctuation, capitalisation, sentence];
}

export function generateLCPage(params: {
  bundle: BanksBundle;
  pageIndex: number;
  seed: string;
  usedIds: Set<string>;
}): { questions: LCQuestion[]; bankUsed: number } {
  const { bundle, pageIndex, seed, usedIds } = params;

  const usableBankIndexes: number[] = [];
  for (let i = 0; i < bundle.banks.length; i++) {
    if ((bundle.banks[i]?.questions ?? []).length > 0) usableBankIndexes.push(i + 1);
  }

  if (usableBankIndexes.length === 0) {
    throw new Error('No usable language conventions banks (all banks are empty)');
  }

  const pick = usableBankIndexes[pageIndex % usableBankIndexes.length] ?? usableBankIndexes[0];
  const bankUsed = pick;
  const bank = dedupeById(bundle.banks[bankUsed - 1]?.questions ?? []);

  if (bank.length === 0) {
    throw new Error(`Selected bank ${bankUsed} has no questions`);
  }

  const rng = createRng(`${seed}-lc-v${bundle.version}-p${pageIndex}-b${bankUsed}`);
  const selectedIds = new Set<string>();
  const out: LCQuestion[] = [];

  for (const bucket of mixBuckets()) {
    for (let i = 0; i < bucket.count; i++) {
      const picked = pickOne({
        rng,
        bank,
        required: bucket.candidates,
        fallbacks: bucket.fallbacks,
        selectedIds,
        usedIds,
      });

      if (!picked) {
        throw new Error(`Not enough questions to satisfy mix (${bucket.label}) in bank ${bankUsed}`);
      }

      selectedIds.add(picked.id);
      out.push(picked);
    }
  }

  // Always 10
  if (out.length !== 10) {
    throw new Error('Internal error: page mix must generate exactly 10 questions');
  }

  // Update used ids for the session (minimize repeats across pages)
  for (const q of out) usedIds.add(q.id);

  return { questions: out, bankUsed };
}

export function generateLCPageFromBank(params: {
  bankQuestions: LCQuestion[];
  bankUsed: number;
  pageIndex: number;
  seed: string;
  usedIds: Set<string>;
  bundleVersion: number;
}): { questions: LCQuestion[]; bankUsed: number } {
  const { bankQuestions, bankUsed, pageIndex, seed, usedIds, bundleVersion } = params;

  const bank = dedupeById(bankQuestions);
  if (bank.length === 0) {
    throw new Error(`Selected bank ${bankUsed} has no questions`);
  }

  const rng = createRng(`${seed}-lc-v${bundleVersion}-p${pageIndex}-b${bankUsed}`);
  const selectedIds = new Set<string>();
  const out: LCQuestion[] = [];

  for (const bucket of mixBuckets()) {
    for (let i = 0; i < bucket.count; i++) {
      const picked = pickOne({
        rng,
        bank,
        required: bucket.candidates,
        fallbacks: bucket.fallbacks,
        selectedIds,
        usedIds,
      });

      if (!picked) {
        throw new Error(`Not enough questions to satisfy mix (${bucket.label}) in bank ${bankUsed}`);
      }

      selectedIds.add(picked.id);
      out.push(picked);
    }
  }

  if (out.length !== 10) {
    throw new Error('Internal error: page mix must generate exactly 10 questions');
  }

  for (const q of out) usedIds.add(q.id);
  return { questions: out, bankUsed };
}

export function summarizeBank(questions: LCQuestion[]): {
  total: number;
  byType: Record<string, number>;
  bySkill: Record<LCSkill, number>;
} {
  const byType: Record<string, number> = {};
  const bySkill: Record<LCSkill, number> = {
    spelling: 0,
    punctuation: 0,
    grammar: 0,
    capitalisation: 0,
    sentence: 0,
    wordChoice: 0,
  };

  for (const q of questions) {
    byType[q.type] = (byType[q.type] ?? 0) + 1;
    bySkill[q.skill] = (bySkill[q.skill] ?? 0) + 1;
  }

  return { total: questions.length, byType, bySkill };
}
