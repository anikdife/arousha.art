import type {
  RMImagesManifest,
  RMIndexStory,
  RMQuestion,
  RMQuestionSet,
  RMStory,
  RMTextType,
  ValidationResult,
} from './adminTypes';

const TEXT_TYPES: RMTextType[] = ['narrative', 'informative', 'letter', 'article', 'fantasy'];
const QUESTION_SKILLS = ['literal', 'inferential', 'vocabulary', 'purpose', 'textStructure'] as const;

const BANNED_TERMS = [
  'violence',
  'weapon',
  'blood',
  'kill',
  'gun',
  'knife',
  'fight',
  'dead',
  'death',
];

function norm(s: string): string {
  return s.toLowerCase();
}

export function computeWordCount(story: Pick<RMStory, 'text' | 'headings'>): number {
  const pieces: string[] = [];
  pieces.push(story.text ?? '');
  for (const h of story.headings ?? []) {
    pieces.push(h.heading ?? '');
    pieces.push(h.text ?? '');
  }
  const all = pieces.join(' ').trim();
  if (!all) return 0;
  return all.split(/\s+/).filter(Boolean).length;
}

export function splitParagraphs(text: string): string[] {
  return (text ?? '')
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function sentenceStats(text: string): { avgWords: number; maxWords: number; sentenceCount: number } {
  const raw = (text ?? '').replace(/\n+/g, ' ').trim();
  if (!raw) return { avgWords: 0, maxWords: 0, sentenceCount: 0 };

  const sentences = raw
    .split(/[.!?]+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length === 0) return { avgWords: 0, maxWords: 0, sentenceCount: 0 };

  const counts = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  const maxWords = Math.max(...counts);
  const avgWords = counts.reduce((a, b) => a + b, 0) / counts.length;
  return { avgWords, maxWords, sentenceCount: sentences.length };
}

export function validateStory(storyId: string, story: RMStory): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!story || typeof story !== 'object') {
    return { ok: false, errors: ['Story JSON is missing or not an object.'], warnings: [] };
  }

  if (story.id !== storyId) errors.push(`Story id must equal storyId (${storyId}).`);
  if (story.year !== 3) errors.push('Story year must be 3.');
  if (!TEXT_TYPES.includes(story.type)) errors.push('Story type is invalid.');

  const title = String(story.title ?? '').trim();
  if (title.length < 3 || title.length > 80) errors.push('Title length must be 3..80 characters.');

  const paragraphs = splitParagraphs(String(story.text ?? ''));
  if (paragraphs.length < 3) errors.push('Text must have at least 3 paragraphs separated by blank lines.');

  const computed = computeWordCount({ text: String(story.text ?? ''), headings: Array.isArray(story.headings) ? story.headings : [] });
  if (typeof story.wordCount !== 'number' || Number.isNaN(story.wordCount)) {
    errors.push('wordCount must be a number.');
  } else if (story.wordCount !== computed) {
    errors.push(`wordCount must equal computed word count (${computed}).`);
  }

  const stats = sentenceStats(String(story.text ?? ''));
  if (stats.sentenceCount > 0) {
    if (stats.avgWords > 12) errors.push(`Average sentence length too high (${stats.avgWords.toFixed(1)} > 12).`);
    if (stats.maxWords > 16) errors.push(`Max sentence length too high (${stats.maxWords} > 16).`);
  }

  const headings = Array.isArray(story.headings) ? story.headings : [];
  if ((story.type === 'narrative' || story.type === 'letter') && headings.length !== 0) {
    errors.push('headings must be an empty array for narrative and letter types.');
  }

  const captions = Array.isArray(story.captions) ? story.captions : [];
  if (captions.length > 6) errors.push('captions length must be 0..6.');
  captions.forEach((c, idx) => {
    const cap = String((c as any)?.caption ?? '').trim();
    if (cap.length > 0 && (cap.length < 5 || cap.length > 140)) {
      errors.push(`Caption ${idx} length must be 5..140 characters (or empty).`);
    }
  });

  const haystack = norm(`${story.title ?? ''} ${story.text ?? ''}`);
  const hit = BANNED_TERMS.find((t) => haystack.includes(t));
  if (hit) errors.push(`Banned term detected: "${hit}".`);

  if (story.type === 'article' && headings.length === 0) warnings.push('Articles should include headings.');

  return { ok: errors.length === 0, errors, warnings };
}

export function validateImages(story: RMStory, manifest: RMImagesManifest | null): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const captions = Array.isArray(story?.captions) ? story.captions : [];
  if (captions.length === 0) {
    return { ok: true, errors: [], warnings: [] };
  }

  const images = manifest?.images ?? [];
  const byCaption = new Map<number, number>();
  for (const img of images) {
    if (typeof img.captionIndex !== 'number') continue;
    byCaption.set(img.captionIndex, (byCaption.get(img.captionIndex) ?? 0) + 1);
  }

  for (let i = 0; i < captions.length; i++) {
    if (!byCaption.has(i)) errors.push(`Missing image mapping for captionIndex ${i}.`);
  }

  Array.from(byCaption.entries()).forEach(([idx, count]) => {
    if (count > 1) warnings.push(`Multiple images mapped to captionIndex ${idx}; only one should be active.`);
  });

  return { ok: errors.length === 0, errors, warnings };
}

export function validateQuestions(
  storyId: string,
  questionSet: RMQuestionSet,
  opts: { strictForPublish: boolean }
): ValidationResult & { stats: { total: number; bySkill: Record<string, number> } } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const bySkill: Record<string, number> = {};
  const qs = Array.isArray(questionSet?.questions) ? questionSet.questions : [];

  if (questionSet.storyId !== storyId) errors.push(`questions.storyId must equal ${storyId}.`);
  if (questionSet.year !== 3) errors.push('questions.year must be 3.');
  if (typeof questionSet.version !== 'number') errors.push('questions.version must be a number.');

  if (opts.strictForPublish) {
    if (qs.length !== 10) errors.push('Exactly 10 questions are required to publish.');
  }

  const seen = new Set<string>();
  qs.forEach((q, idx) => {
    const qq = q as RMQuestion;
    const id = String(qq.id ?? '').trim();
    if (!id) errors.push(`Question ${idx}: id is required.`);
    if (id && seen.has(id)) errors.push(`Question ${idx}: duplicate id "${id}".`);
    if (id) seen.add(id);

    if (qq.type !== 'mcq') errors.push(`Question ${idx}: type must be "mcq".`);

    const skill = String(qq.skill ?? '');
    if (!QUESTION_SKILLS.includes(skill as any)) errors.push(`Question ${idx}: invalid skill.`);
    bySkill[skill] = (bySkill[skill] ?? 0) + 1;

    const prompt = String(qq.prompt ?? '').trim();
    if (!prompt) errors.push(`Question ${idx}: prompt is required.`);

    const choices = (qq.choices ?? []) as any;
    if (!Array.isArray(choices) || choices.length !== 4) {
      errors.push(`Question ${idx}: choices must be a 4-item array.`);
    } else {
      const c = choices.map((x: any) => String(x));
      const uniq = new Set(c.map((x) => x.trim()));
      if (uniq.size !== 4) errors.push(`Question ${idx}: choices must be unique.`);
    }

    const ci = qq.correctIndex as any;
    if (!(ci === 0 || ci === 1 || ci === 2 || ci === 3)) errors.push(`Question ${idx}: correctIndex must be 0..3.`);
  });

  // Recommended mix (warn only)
  const literal = bySkill.literal ?? 0;
  const inferential = bySkill.inferential ?? 0;
  const vocabulary = bySkill.vocabulary ?? 0;
  const purpose = bySkill.purpose ?? 0;
  const textStructure = bySkill.textStructure ?? 0;

  if (literal < 3) warnings.push('Recommended: at least 3 literal questions.');
  if (inferential < 3) warnings.push('Recommended: at least 3 inferential questions.');
  if (vocabulary < 1) warnings.push('Recommended: at least 1 vocabulary question.');
  if (purpose + textStructure < 1) warnings.push('Recommended: at least 1 purpose or textStructure question.');

  return { ok: errors.length === 0, errors, warnings, stats: { total: qs.length, bySkill } };
}

export function deriveIndexStoryFromStory(
  storyId: string,
  story: RMStory,
  partial: Partial<RMIndexStory>
): RMIndexStory {
  return {
    storyId,
    title: String(story.title ?? '').trim(),
    type: story.type,
    wordCount: story.wordCount,
    status: (partial.status ?? 'draft') as any,
    hasImages: Boolean(partial.hasImages),
    hasQuestions: Boolean(partial.hasQuestions),
    updatedAt: partial.updatedAt ?? new Date().toISOString(),
    updatedByUid: partial.updatedByUid ?? '',
  };
}
