import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { isProjectOwner } from '../../lib/isProjectOwner';
import { ensureUserProfileAfterLogin, setUserRole } from '../../lib/userProfileService';
import type {
  RMImagesManifest,
  RMIndex,
  RMIndexStory,
  RMQuestionSet,
  RMStory,
} from '../../lib/readingMagazine/adminTypes';
import {
  createRmStoryAssets,
  deleteRmStoryFolder,
  loadRmImagesManifest,
  loadRmQuestions,
  loadRmStory,
  publishRmStory,
  saveRmImagesManifest,
  saveRmIndex,
  saveRmQuestions,
  saveRmStory,
} from '../../lib/readingMagazine/adminStorageService';
import { loadRmAdminBundle, invalidateRmAdminCache } from '../../lib/readingMagazine/adminIndexService';
import {
  computeWordCount,
  deriveIndexStoryFromStory,
  sentenceStats,
  splitParagraphs,
  validateImages,
  validateQuestions,
  validateStory,
} from '../../lib/readingMagazine/adminValidators';
import {
  getImagePreviewUrl,
  imagePathExists,
  removeCaptionImage,
  uploadCaptionImage,
} from '../../lib/readingMagazine/adminImageService';

type TabKey = 'story' | 'images' | 'questions' | 'preview';

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function tryParseJson<T>(text: string): Parsed<T> {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

function buildStoryIdFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return `rm-y3-${slug || 'story'}-${Date.now()}`;
}

function replaceStoryInIndex(index: RMIndex, nextStory: RMIndexStory): RMIndex {
  const exists = index.stories.some((s) => s.storyId === nextStory.storyId);
  if (!exists) return { ...index, stories: [nextStory, ...index.stories] };
  return {
    ...index,
    stories: index.stories.map((s) => (s.storyId === nextStory.storyId ? nextStory : s)),
  };
}

export const OwnerReadingMagazineY3: React.FC = () => {
  const { currentUser, userProfile } = useAuth();

  const [bootLoading, setBootLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [storyLoading, setStoryLoading] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const [showInstruction, setShowInstruction] = useState(false);

  const instructionText = useMemo(
    () =>
      `You are an Australian NAPLAN Reading content generator.

GOAL
In ONE response, generate in order:
1) story.json  (a Year 3 Reading Magazine text)
2) questions.json  (10 NAPLAN-style MCQs based ONLY on story.json)
3) image.json  (image prompts/briefs that match story.json)

DO NOT generate PDFs.
DO NOT generate markdown.
DO NOT generate any commentary.
DO NOT copy or paraphrase real NAPLAN passages or questions.
Everything must be original, but in NAPLAN Year 3 style and difficulty.

OUTPUT MUST BE STRICTLY VALID JSON OBJECTS, concatenated in this exact order with the exact keys:
{
  "story.json": { ... },
  "questions.json": { ... },
  "image.json": { ... }
}

No extra keys at the top level.

────────────────────────────────────────
PART 1: story.json (TEXT ONLY)
────────────────────────────────────────
Generate ONE reading source for Year 3.

Allowed story types (pick ONE):
- "narrative"
- "informative"
- "letter"
- "article"
- "fantasy"

DIFFICULTY CONSTRAINTS (STRICT)
- Australian English
- Total word count:
  narrative/fantasy: 180–300
  informative/article: 150–280
  letter: 120–200
- Sentence length: max 12 words per sentence
- Paragraphs: 3–6 paragraphs
- Vocabulary: common and concrete (Year 3), no abstract nouns, no idioms
- No violence, fear, adult themes, brands, or unsafe topics
- Keep it engaging and clear

STRUCTURE RULES
- For narrative/fantasy/letter: headings MUST be []
- For informative/article: headings MUST be used (2–4 headings)
- captions: 0–2 items (short captions describing helpful images)

story.json schema (MUST MATCH EXACTLY):
{
  "sourceId": "read-src-001",
  "storyId": "rm-y3-<unique-number>",
  "year": 3,
  "type": "narrative|informative|letter|article|fantasy",
  "title": "string",
  "version": 1,
  "wordCount": number,
  "text": "string (paragraphs separated by \\\n\\\n)",
  "headings": [
    { "heading": "string", "text": "string" }
  ],
  "captions": [
    { "caption": "string" }
  ]
}

IMPORTANT:
- Ensure wordCount matches the generated text (approximate is okay but keep close).
- Text must be fully original.

────────────────────────────────────────
PART 2: questions.json (NAPLAN-STYLE MCQ)
────────────────────────────────────────
Generate EXACTLY 10 multiple-choice questions based ONLY on story.json.
All answers must be findable from the story text, headings, or captions.

Allowed skill enum (ONLY these strings):
- "literal"
- "inferential"
- "vocabulary"
- "purpose"
- "textStructure"

Questions schema:
{
  "sourceId": "read-src-001",
  "storyId": "<must match story.json.storyId>",
  "year": 3,
  "type": "<must match story.json.type>",
  "title": "<must match story.json.title>",
  "version": 1,
  "questions": [
    {
      "id": "q01",
      "type": "mcq",
      "skill": "literal|inferential|vocabulary|purpose|textStructure",
      "prompt": "string",
      "choices": ["string","string","string","string"],
      "correctIndex": 0,
      "evidence": { "quote": "exact quote from story text (<= 20 words)" }
    }
  ]
}

MCQ RULES (MANDATORY)
- Exactly 4 choices per question
- Exactly 1 correct choice
- choices must be unique
- correctIndex must be 0..3
- No “All of the above” / “None of the above”
- Year 3 wording (short, clear)
- Evidence quote must be copied exactly from the story and <= 20 words

MIX RULES (STRICT BY STORY TYPE)
Total questions = 10 for ALL types.

If type is "narrative" or "fantasy":
- literal: 4
- inferential: 3
- vocabulary: 1
- purpose: 1
- textStructure: 1

If type is "informative" or "article":
- literal: 4
- inferential: 3
- vocabulary: 1
- purpose: 1
- textStructure: 1
(For textStructure: ask about headings, captions, or why information is grouped.)

If type is "letter":
- literal: 4
- inferential: 3
- vocabulary: 1
- purpose: 1
- textStructure: 1
(textStructure can be greeting/sign-off or how the letter is set out.)

VALIDATION CHECK BEFORE OUTPUT
- Confirm skill counts match the mix exactly
- Confirm at least 3 inferential questions
- Confirm at least 1 vocabulary question
- Confirm at least 1 purpose OR textStructure (we require both 1 each)
- Confirm evidence quotes exist in story text exactly

────────────────────────────────────────
PART 3: image.json (IMAGE BRIEFS ONLY)
────────────────────────────────────────
Generate 1–2 image briefs that match story.json.
These images should be safe, child-friendly, and typical of reading magazines:
- animals, objects, places, simple scenes
- no faces required (avoid identifying people)
- no logos/brands

image.json schema:
{
  "sourceId": "read-src-001",
  "storyId": "<must match story.json.storyId>",
  "year": 3,
  "type": "<must match story.json.type>",
  "title": "<must match story.json.title>",
  "version": 1,
  "images": [
    {
      "id": "img01",
      "kind": "illustration|photoStyle|diagram",
      "altText": "string (simple Year 3 description)",
      "caption": "string (must match or align with story captions if present)",
      "prompt": "string (detailed generation brief, no brand names, no faces needed)",
      "composition": {
        "subject": "string",
        "background": "string",
        "objects": ["string"],
        "styleNotes": ["string"]
      }
    }
  ]
}

IMAGE RULES
- Keep prompts simple and safe
- If story is informative/article: prefer diagram-like or labelled illustration style
- If narrative/fantasy: prefer story illustration style
- Avoid humans’ identifiable faces; if humans exist, describe as generic silhouettes or back view

────────────────────────────────────────
FINAL OUTPUT REQUIREMENT
────────────────────────────────────────
Return ONLY one JSON object with exactly these top-level keys:
- "story.json"
- "questions.json"
- "image.json"

Now generate the full pipeline output.
`,
    []
  );

  const [metaVersion, setMetaVersion] = useState<number>(1);
  const [metaPublished, setMetaPublished] = useState<boolean>(false);
  const [loadedMetaVersion, setLoadedMetaVersion] = useState<number>(1);

  const [index, setIndex] = useState<RMIndex>({ version: 1, stories: [] });
  const [search, setSearch] = useState('');
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('story');

  const [storyText, setStoryText] = useState<string>('');
  const [questionsText, setQuestionsText] = useState<string>('');
  const [imagesManifest, setImagesManifest] = useState<RMImagesManifest | null>(null);

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [imageUrlsByCaption, setImageUrlsByCaption] = useState<Record<number, string | null>>({});
  const [imageMissingByCaption, setImageMissingByCaption] = useState<Record<number, boolean>>({});

  const storyLoadSeq = useRef(0);
  const filteredStories = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...(index.stories ?? [])];
    list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    if (!q) return list;
    return list.filter((s) => (s.title ?? '').toLowerCase().includes(q) || s.storyId.toLowerCase().includes(q));
  }, [index.stories, search]);

  const selectedIndexStory = useMemo(() => {
    if (!selectedStoryId) return null;
    return (index.stories ?? []).find((s) => s.storyId === selectedStoryId) ?? null;
  }, [index.stories, selectedStoryId]);

  const parsedStory = useMemo(() => tryParseJson<RMStory>(storyText), [storyText]);
  const parsedQuestions = useMemo(() => tryParseJson<RMQuestionSet>(questionsText), [questionsText]);

  const storyValidation = useMemo(() => {
    if (!selectedStoryId) return null;
    if (!parsedStory.ok) return { ok: false, errors: [`Invalid JSON: ${parsedStory.error}`], warnings: [] };
    return validateStory(selectedStoryId, parsedStory.value);
  }, [parsedStory, selectedStoryId]);

  const imageValidation = useMemo(() => {
    if (!parsedStory.ok) return null;
    return validateImages(parsedStory.value, imagesManifest);
  }, [imagesManifest, parsedStory]);

  const questionsValidation = useMemo(() => {
    if (!selectedStoryId) return null;
    if (!parsedQuestions.ok) {
      return {
        ok: false,
        errors: [`Invalid JSON: ${parsedQuestions.error}`],
        warnings: [],
        stats: { total: 0, bySkill: {} },
      };
    }
    return validateQuestions(selectedStoryId, parsedQuestions.value, { strictForPublish: activeTab === 'preview' });
  }, [activeTab, parsedQuestions, selectedStoryId]);

  const derivedSummary = useMemo(() => {
    if (!parsedStory.ok) return null;
    const s = parsedStory.value;
    const computedWords = computeWordCount({ text: s.text, headings: s.headings });
    const paragraphs = splitParagraphs(s.text);
    const stats = sentenceStats(s.text);
    return {
      title: s.title,
      type: s.type,
      wordCount: s.wordCount,
      computedWords,
      paragraphCount: paragraphs.length,
      sentenceAvg: stats.avgWords,
      sentenceMax: stats.maxWords,
    };
  }, [parsedStory]);

  const loadBundle = async () => {
    setBootLoading(true);
    setFatalError(null);
    try {
      const bundle = await loadRmAdminBundle();
      setMetaVersion(bundle.meta.version);
      setMetaPublished(Boolean(bundle.meta.published));
      setLoadedMetaVersion(bundle.meta.version);
      setIndex(bundle.index);

      const first = bundle.index.stories?.[0]?.storyId ?? null;
      setSelectedStoryId((prev) => {
        if (prev && (bundle.index.stories ?? []).some((s) => s.storyId === prev)) return prev;
        return first;
      });
    } catch (e: any) {
      setFatalError(String(e?.message ?? e));
    } finally {
      setBootLoading(false);
    }
  };

  const loadSelectedStory = async (storyId: string) => {
    const seq = (storyLoadSeq.current += 1);
    setStoryLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const [story, questions, manifest] = await Promise.all([
        loadRmStory(storyId),
        loadRmQuestions(storyId),
        loadRmImagesManifest(storyId),
      ]);

      if (seq !== storyLoadSeq.current) return;
      setStoryText(prettyJson(story));
      setQuestionsText(prettyJson(questions));
      setImagesManifest(manifest);
      setImageUrlsByCaption({});
      setImageMissingByCaption({});
    } catch (e: any) {
      if (seq !== storyLoadSeq.current) return;
      setErrorMsg(String(e?.message ?? e));
    } finally {
      if (seq === storyLoadSeq.current) setStoryLoading(false);
    }
  };

  useEffect(() => {
    void loadBundle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedStoryId) void loadSelectedStory(selectedStoryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoryId]);

  const canInteract = Boolean(currentUser);

  const ensureOwnerRoleForStorage = async (): Promise<void> => {
    if (!currentUser) return;
    if (!isProjectOwner(currentUser, userProfile)) return;

    // Storage rules allow writes to adminReading/* only when Firestore users/{uid}.role == 'owner'
    // (or fallback email). Keep Storage permissions in sync with the app's owner allowlist.
    if (!userProfile) {
      await ensureUserProfileAfterLogin({
        uid: currentUser.uid,
        email: currentUser.email || undefined,
        displayName: currentUser.displayName || undefined,
        role: 'owner',
      });
      return;
    }

    if (userProfile.role !== 'owner') {
      await setUserRole(currentUser.uid, 'owner');
    }
  };

  const createNewStory = async () => {
    if (!currentUser) return;
    setErrorMsg(null);
    setStatusMsg(null);

    const titleHint = 'New Reading Story';
    const storyId = buildStoryIdFromTitle(titleHint);

    setBusy(true);
    try {
      await ensureOwnerRoleForStorage();
      await createRmStoryAssets({ storyId, uid: currentUser.uid, metaVersion, title: titleHint });

      const now = new Date().toISOString();
      const entry: RMIndexStory = {
        storyId,
        title: titleHint,
        type: 'narrative',
        wordCount: 0,
        status: 'draft',
        hasImages: false,
        hasQuestions: false,
        updatedAt: now,
        updatedByUid: currentUser.uid,
      };

      const nextIndex: RMIndex = { ...index, stories: [entry, ...(index.stories ?? [])] };
      await saveRmIndex(nextIndex);
      setIndex(nextIndex);
      invalidateRmAdminCache();
      setSelectedStoryId(storyId);
      setStatusMsg('Created new story (draft).');
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    if (!currentUser || !selectedStoryId) return;

    setErrorMsg(null);
    setStatusMsg(null);

    const storyParsed = tryParseJson<RMStory>(storyText);
    const questionsParsed = tryParseJson<RMQuestionSet>(questionsText);

    if (!storyParsed.ok) {
      setErrorMsg(`Story JSON invalid: ${storyParsed.error}`);
      return;
    }
    if (!questionsParsed.ok) {
      setErrorMsg(`Questions JSON invalid: ${questionsParsed.error}`);
      return;
    }

    setBusy(true);
    try {
      await Promise.all([
        saveRmStory(selectedStoryId, storyParsed.value),
        saveRmQuestions(selectedStoryId, questionsParsed.value),
      ]);

      // Update index entry derived fields
      const hasQuestions = Array.isArray(questionsParsed.value.questions) && questionsParsed.value.questions.length > 0;
      const hasImages = Boolean(imagesManifest?.images?.length);

      const nextEntry = deriveIndexStoryFromStory(selectedStoryId, storyParsed.value, {
        status: selectedIndexStory?.status ?? 'draft',
        hasImages,
        hasQuestions,
        updatedAt: new Date().toISOString(),
        updatedByUid: currentUser.uid,
      });

      const nextIndex = replaceStoryInIndex(index, nextEntry);
      await saveRmIndex(nextIndex);
      setIndex(nextIndex);

      invalidateRmAdminCache();

      setStatusMsg('Draft saved.');
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const openDelete = () => {
    if (!selectedStoryId) return;
    setConfirmDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!currentUser || !selectedStoryId) return;

    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      await deleteRmStoryFolder(selectedStoryId);
      const nextIndex: RMIndex = {
        ...index,
        stories: (index.stories ?? []).filter((s) => s.storyId !== selectedStoryId),
      };

      await saveRmIndex(nextIndex);
      setIndex(nextIndex);
      setSelectedStoryId(nextIndex.stories?.[0]?.storyId ?? null);
      setConfirmDeleteOpen(false);

      invalidateRmAdminCache();
      setStatusMsg('Story deleted.');
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const loadPreviewAssets = async () => {
    if (!parsedStory.ok || !imagesManifest) return;

    const captions = parsedStory.value.captions ?? [];
    const nextUrls: Record<number, string | null> = {};
    const nextMissing: Record<number, boolean> = {};

    for (let i = 0; i < captions.length; i++) {
      const mapping = (imagesManifest.images ?? []).find((m) => m.captionIndex === i);
      if (!mapping?.storagePath) {
        nextUrls[i] = null;
        nextMissing[i] = true;
        continue;
      }

      const exists = await imagePathExists(mapping.storagePath);
      nextMissing[i] = !exists;
      nextUrls[i] = exists ? await getImagePreviewUrl(mapping.storagePath) : null;
    }

    setImageUrlsByCaption(nextUrls);
    setImageMissingByCaption(nextMissing);
  };

  useEffect(() => {
    if (activeTab === 'preview' || activeTab === 'images') {
      void loadPreviewAssets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedStoryId, imagesManifest?.images?.length]);

  const publish = async () => {
    if (!currentUser || !selectedStoryId) return;

    setErrorMsg(null);
    setStatusMsg(null);

    const storyParsed = tryParseJson<RMStory>(storyText);
    const questionsParsed = tryParseJson<RMQuestionSet>(questionsText);

    if (!storyParsed.ok) {
      setErrorMsg(`Story JSON invalid: ${storyParsed.error}`);
      return;
    }
    if (!questionsParsed.ok) {
      setErrorMsg(`Questions JSON invalid: ${questionsParsed.error}`);
      return;
    }

    const vStory = validateStory(selectedStoryId, storyParsed.value);
    const vImgs = validateImages(storyParsed.value, imagesManifest);
    const vQs = validateQuestions(selectedStoryId, questionsParsed.value, { strictForPublish: true });

    // Extra image existence validation for publish
    const captions = storyParsed.value.captions ?? [];
    const mappings = imagesManifest?.images ?? [];
    const missingPaths: number[] = [];
    for (let i = 0; i < captions.length; i++) {
      const m = mappings.find((mm) => mm.captionIndex === i);
      if (m?.storagePath) {
        const exists = await imagePathExists(m.storagePath);
        if (!exists) missingPaths.push(i);
      }
    }
    if (missingPaths.length > 0) {
      vImgs.errors.push(`Some mapped images are missing in Storage (captionIndex: ${missingPaths.join(', ')}).`);
    }

    if (!vStory.ok || !vImgs.ok || !vQs.ok) {
      setErrorMsg('Fix blocking validation errors before publishing.');
      setActiveTab('preview');
      return;
    }

    setBusy(true);
    try {
      const hasImages = captions.length === 0 ? true : vImgs.ok;
      const hasQuestions = vQs.ok;

      const entry = deriveIndexStoryFromStory(selectedStoryId, storyParsed.value, {
        status: 'published',
        hasImages,
        hasQuestions,
        updatedAt: new Date().toISOString(),
        updatedByUid: currentUser.uid,
      });

      const nextIndex: RMIndex = {
        ...replaceStoryInIndex(index, entry),
        version: metaVersion,
      };

      const res = await publishRmStory({
        storyId: selectedStoryId,
        uid: currentUser.uid,
        loadedMetaVersion,
        nextMetaPublished: true,
        index: nextIndex,
        story: storyParsed.value,
        questions: questionsParsed.value,
        hasImages,
        hasQuestions,
      });

      if ('conflictVersion' in res) {
        setErrorMsg(`Version changed on server (${res.conflictVersion}). Please reload before publishing.`);
        return;
      }

      setMetaVersion(res.newVersion);
      setLoadedMetaVersion(res.newVersion);
      setMetaPublished(true);
      setIndex({ ...nextIndex, version: res.newVersion });

      invalidateRmAdminCache();
      setStatusMsg(`Published. Version is now ${res.newVersion}.`);
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const uploadForCaptionIndex = async (captionIndex: number, file: File) => {
    if (!selectedStoryId) {
      setErrorMsg('No story selected.');
      return;
    }
    if (!imagesManifest) {
      setErrorMsg('Images manifest not loaded yet. Please reload and try again.');
      return;
    }

    setErrorMsg(null);
    setStatusMsg(null);

    setBusy(true);
    try {
      const res = await uploadCaptionImage({
        storyId: selectedStoryId,
        captionIndex,
        file,
        existingManifest: imagesManifest,
      });

      if ('error' in res) {
        setErrorMsg(res.error);
        return;
      }

      await saveRmImagesManifest(selectedStoryId, res.manifest);
      setImagesManifest(res.manifest);
      setStatusMsg('Image uploaded.');
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const removeImageForCaptionIndex = async (captionIndex: number) => {
    if (!selectedStoryId || !imagesManifest) return;

    setErrorMsg(null);
    setStatusMsg(null);

    setBusy(true);
    try {
      const res = await removeCaptionImage({
        storyId: selectedStoryId,
        captionIndex,
        existingManifest: imagesManifest,
        deleteFile: true,
      });

      if ('error' in res) {
        setErrorMsg(res.error);
        return;
      }

      await saveRmImagesManifest(selectedStoryId, res.manifest);
      setImagesManifest(res.manifest);
      setStatusMsg('Image removed.');
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  if (bootLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white border border-gray-200 rounded-xl p-6">Loading…</div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white border border-gray-200 rounded-xl p-6">Please sign in.</div>
      </div>
    );
  }

  if (fatalError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-2xl">
          <div className="text-lg font-semibold text-gray-900">Failed to load</div>
          <div className="text-sm text-red-700 mt-2 whitespace-pre-wrap">{fatalError}</div>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => void loadBundle()}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'story', label: 'Story JSON' },
    { key: 'images', label: 'Images' },
    { key: 'questions', label: 'Questions' },
    { key: 'preview', label: 'Preview' },
  ];

  const selectedStoryParsed = parsedStory.ok ? parsedStory.value : null;
  const captions = selectedStoryParsed?.captions ?? [];
  const mappings = imagesManifest?.images ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Owner • Reading Magazine (Year 3)</h1>
            <div className="text-sm text-gray-600">/owner/banks/y3/reading-magazine</div>
            <div className="text-xs text-gray-500 mt-1">
              Profile role: <span className="font-mono">{userProfile?.role ?? '(none)'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(busy || storyLoading) && (
              <div className="text-xs text-gray-600 mr-2">{busy ? 'Working…' : 'Loading story…'}</div>
            )}
            <div className="text-xs text-gray-600 mr-2">
              Version: <span className="font-mono">{metaVersion}</span>
            </div>
            <div className="text-xs text-gray-600 mr-2">
              Published: <span className="font-mono">{metaPublished ? 'true' : 'false'}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowInstruction((v) => !v)}
              className="px-3 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-300"
              aria-pressed={showInstruction}
            >
              Instruction
            </button>
            <button
              type="button"
              disabled={!canInteract || !selectedStoryId || busy || storyLoading}
              onClick={() => void saveDraft()}
              className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-black disabled:opacity-50"
            >
              Save Draft
            </button>
            <button
              type="button"
              disabled={!canInteract || !selectedStoryId || busy || storyLoading}
              onClick={() => void publish()}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              Publish
            </button>
            <Link to="/owner" className="px-3 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300">
              Back
            </Link>
          </div>
        </div>

        {(statusMsg || errorMsg) && (
          <div
            className={`mt-4 rounded-lg border p-3 text-sm ${
              errorMsg ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'
            }`}
          >
            {errorMsg ?? statusMsg}
          </div>
        )}

        {showInstruction && (
          <div className="mt-4 bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-gray-900">Instruction</div>
                <div className="text-sm text-gray-600 mt-1">Copy/paste into your content generator.</div>
              </div>
              <button
                type="button"
                onClick={() => setShowInstruction(false)}
                className="px-3 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-300"
              >
                Close
              </button>
            </div>
            <pre className="mt-4 whitespace-pre-wrap text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg p-4 overflow-auto max-h-[70vh]">
              {instructionText}
            </pre>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sidebar */}
          <aside className="lg:col-span-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-gray-900">Stories</div>
                <button
                  type="button"
                  onClick={() => void createNewStory()}
                  disabled={!canInteract || busy}
                  className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  New Story
                </button>
              </div>

              <div className="mt-3">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search title or id…"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                />
              </div>

              <div className="mt-3 max-h-[65vh] overflow-auto divide-y">
                {filteredStories.length === 0 ? (
                  <div className="text-sm text-gray-500 py-6">No stories yet.</div>
                ) : (
                  filteredStories.map((s) => {
                    const active = s.storyId === selectedStoryId;
                    return (
                      <button
                        key={s.storyId}
                        type="button"
                        onClick={() => setSelectedStoryId(s.storyId)}
                        className={`w-full text-left py-3 ${active ? 'bg-blue-50' : ''}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-gray-900 truncate pr-2">{s.title || s.storyId}</div>
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${
                              s.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {s.status}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1 font-mono">{s.storyId}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {s.type} • {s.wordCount} words
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  disabled={!canInteract || !selectedStoryId || busy || storyLoading}
                  onClick={openDelete}
                  className="px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  Delete
                </button>
                <button
                  type="button"
                  disabled={busy || storyLoading}
                  onClick={() => void loadBundle()}
                  className="px-3 py-2 rounded-lg bg-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-300"
                >
                  Reload
                </button>
              </div>
            </div>
          </aside>

          {/* Main */}
          <main className="lg:col-span-8">
            {!selectedStoryId ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="text-sm text-gray-600">Select a story to edit.</div>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl">
                {/* Tabs */}
                <div className="border-b border-gray-200 px-4 pt-4">
                  <div className="flex flex-wrap gap-2">
                    {tabs.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setActiveTab(t.key)}
                        className={`px-4 py-2 text-sm font-semibold rounded-lg ${
                          activeTab === t.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Summary */}
                  <div className="mt-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-700">
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="font-semibold text-gray-900">Selected</div>
                      <div className="mt-1 font-mono">{selectedStoryId}</div>
                      <div className="mt-1">Index status: {selectedIndexStory?.status ?? 'draft'}</div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="font-semibold text-gray-900">Derived</div>
                      {derivedSummary ? (
                        <>
                          <div className="mt-1">Type: {String(derivedSummary.type)}</div>
                          <div className="mt-1">wordCount: {derivedSummary.wordCount} (computed {derivedSummary.computedWords})</div>
                          <div className="mt-1">Paragraphs: {derivedSummary.paragraphCount}</div>
                          <div className="mt-1">
                            Sentence avg/max: {derivedSummary.sentenceAvg.toFixed(1)} / {derivedSummary.sentenceMax}
                          </div>
                        </>
                      ) : (
                        <div className="mt-1 text-red-700">Invalid story JSON</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4">
                  {/* Validation panel */}
                  <div className="grid grid-cols-1 gap-3">
                    {storyValidation && (storyValidation.errors.length > 0 || storyValidation.warnings.length > 0) && (
                      <div className="rounded-lg border border-gray-200 p-3">
                        <div className="text-sm font-semibold text-gray-900">Story Validation</div>
                        {storyValidation.errors.map((e, i) => (
                          <div key={i} className="text-sm text-red-700 mt-1">
                            • {e}
                          </div>
                        ))}
                        {storyValidation.warnings.map((w, i) => (
                          <div key={i} className="text-sm text-yellow-700 mt-1">
                            • {w}
                          </div>
                        ))}
                      </div>
                    )}

                    {imageValidation && (imageValidation.errors.length > 0 || imageValidation.warnings.length > 0) && (
                      <div className="rounded-lg border border-gray-200 p-3">
                        <div className="text-sm font-semibold text-gray-900">Images Validation</div>
                        {imageValidation.errors.map((e, i) => (
                          <div key={i} className="text-sm text-red-700 mt-1">
                            • {e}
                          </div>
                        ))}
                        {imageValidation.warnings.map((w, i) => (
                          <div key={i} className="text-sm text-yellow-700 mt-1">
                            • {w}
                          </div>
                        ))}
                      </div>
                    )}

                    {questionsValidation && (questionsValidation.errors.length > 0 || questionsValidation.warnings.length > 0) && (
                      <div className="rounded-lg border border-gray-200 p-3">
                        <div className="text-sm font-semibold text-gray-900">Questions Validation</div>
                        {questionsValidation.errors.map((e, i) => (
                          <div key={i} className="text-sm text-red-700 mt-1">
                            • {e}
                          </div>
                        ))}
                        {questionsValidation.warnings.map((w, i) => (
                          <div key={i} className="text-sm text-yellow-700 mt-1">
                            • {w}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Tabs content */}
                  {activeTab === 'story' && (
                    <div className="mt-4">
                      <label className="block text-sm font-semibold text-gray-700">story.json</label>
                      <textarea
                        value={storyText}
                        onChange={(e) => {
                          setErrorMsg(null);
                          setStatusMsg(null);
                          setStoryText(e.target.value);
                        }}
                        spellCheck={false}
                        className="mt-2 w-full h-[520px] font-mono text-xs px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                  )}

                  {activeTab === 'questions' && (
                    <div className="mt-4">
                      <label className="block text-sm font-semibold text-gray-700">questions.json</label>
                      <textarea
                        value={questionsText}
                        onChange={(e) => {
                          setErrorMsg(null);
                          setStatusMsg(null);
                          setQuestionsText(e.target.value);
                        }}
                        spellCheck={false}
                        className="mt-2 w-full h-[520px] font-mono text-xs px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />

                      <div className="mt-3 text-xs text-gray-700">
                        <div className="font-semibold text-gray-900">Stats</div>
                        <div className="mt-1">Total: {questionsValidation?.stats.total ?? 0}</div>
                        <pre className="mt-2 whitespace-pre-wrap font-mono text-xs bg-gray-50 border border-gray-200 rounded-lg p-3">
                          {prettyJson(questionsValidation?.stats.bySkill ?? {})}
                        </pre>
                      </div>
                    </div>
                  )}

                  {activeTab === 'images' && (
                    <div className="mt-4">
                      <div className="text-sm font-semibold text-gray-900">Images</div>
                      <div className="text-sm text-gray-600 mt-1">Mapped to captionIndex from story.json captions.</div>

                      {!parsedStory.ok ? (
                        <div className="mt-3 text-sm text-red-700">Fix story JSON first to edit images.</div>
                      ) : captions.length === 0 ? (
                        <div className="mt-3 text-sm text-gray-600">This story has no captions. No images required.</div>
                      ) : (
                        <div className="mt-4 space-y-4">
                          {captions.map((c, idx) => {
                            const m = mappings.find((mm) => mm.captionIndex === idx);
                            const url = imageUrlsByCaption[idx] ?? null;
                            const missing = imageMissingByCaption[idx] ?? false;
                            const inputId = `rm-upload-${selectedStoryId ?? 'none'}-${idx}`;

                            return (
                              <div key={idx} className="border border-gray-200 rounded-xl p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-semibold text-gray-900">Caption {idx}</div>
                                    <div className="text-sm text-gray-700 mt-1">{c.caption}</div>
                                    <div className="text-xs text-gray-500 mt-2 font-mono">{m?.storagePath ?? 'No image mapped'}</div>
                                    {missing && m?.storagePath && (
                                      <div className="text-xs text-red-700 mt-1">Mapped file missing in Storage.</div>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <input
                                      id={inputId}
                                      type="file"
                                      accept="image/png,image/jpeg,image/webp"
                                      className="sr-only"
                                      onChange={(e) => {
                                        const f = e.currentTarget.files?.[0];
                                        // Allow picking the same file again.
                                        e.currentTarget.value = '';
                                        if (f) void uploadForCaptionIndex(idx, f);
                                      }}
                                    />
                                    <label
                                      htmlFor={inputId}
                                      aria-disabled={!canInteract}
                                      className={`px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 select-none ${
                                        !canInteract ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
                                      }`}
                                    >
                                      Upload
                                    </label>
                                    <button
                                      type="button"
                                      disabled={!canInteract || !m}
                                      onClick={() => void removeImageForCaptionIndex(idx)}
                                      className="px-3 py-2 rounded-lg bg-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-300 disabled:opacity-50"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>

                                {url && (
                                  <div className="mt-3">
                                    <img src={url} alt={c.caption} className="max-h-48 rounded-lg border border-gray-200" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'preview' && (
                    <div className="mt-4">
                      <div className="text-sm font-semibold text-gray-900">Preview</div>
                      {!parsedStory.ok ? (
                        <div className="mt-3 text-sm text-red-700">Fix story JSON first.</div>
                      ) : (
                        <div className="mt-4">
                          <div className="text-xl font-bold text-gray-900">{parsedStory.value.title}</div>
                          <div className="text-sm text-gray-600 mt-1">{parsedStory.value.type} • {parsedStory.value.wordCount} words</div>

                          {parsedStory.value.headings.length > 0 && (
                            <div className="mt-4 space-y-3">
                              {parsedStory.value.headings.map((h, i) => (
                                <div key={i}>
                                  <div className="text-sm font-semibold text-gray-900">{h.heading}</div>
                                  <div className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{h.text}</div>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="mt-4 space-y-3">
                            {splitParagraphs(parsedStory.value.text).map((p, i) => (
                              <p key={i} className="text-sm text-gray-800">{p}</p>
                            ))}
                          </div>

                          {captions.length > 0 && (
                            <div className="mt-6">
                              <div className="text-sm font-semibold text-gray-900">Captions</div>
                              <div className="mt-3 space-y-4">
                                {captions.map((c, idx) => (
                                  <div key={idx} className="border border-gray-200 rounded-xl p-4">
                                    {imageUrlsByCaption[idx] && (
                                      <img
                                        src={imageUrlsByCaption[idx] as string}
                                        alt={c.caption}
                                        className="max-h-56 rounded-lg border border-gray-200"
                                      />
                                    )}
                                    <div className="text-sm text-gray-800 mt-2">{c.caption}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="mt-6">
                            <div className="text-sm font-semibold text-gray-900">Questions</div>
                            {!parsedQuestions.ok ? (
                              <div className="mt-2 text-sm text-red-700">Fix questions JSON first.</div>
                            ) : (
                              <div className="mt-3 space-y-3">
                                {(parsedQuestions.value.questions ?? []).map((q, i) => (
                                  <div key={q.id || i} className="border border-gray-200 rounded-xl p-4">
                                    <div className="text-sm font-semibold text-gray-900">{q.id} • {q.skill}</div>
                                    <div className="text-sm text-gray-800 mt-2">{q.prompt}</div>
                                    {Array.isArray((q as any).choices) && (q as any).choices.length > 0 && (
                                      <ol className="mt-2 text-sm text-gray-700 list-decimal pl-6">
                                        {(q as any).choices.map((c: string, idx: number) => (
                                          <li key={idx}>{c}</li>
                                        ))}
                                      </ol>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>

        {/* Confirm delete modal */}
        {confirmDeleteOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl border border-gray-200 max-w-lg w-full p-6">
              <div className="text-lg font-semibold text-gray-900">Delete story?</div>
              <div className="text-sm text-gray-600 mt-2">
                This will delete story.json, questions.json, images.json and all image files for:
              </div>
              <div className="mt-3 font-mono text-xs bg-gray-50 border border-gray-200 rounded-lg p-3">
                {selectedStoryId}
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(false)}
                  className="px-3 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirmDelete()}
                  className="px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
