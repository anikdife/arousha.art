import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../auth/AuthProvider';
import type { RMIndexStory, RMQuestionSet, RMStory } from '../../../lib/readingMagazine/adminTypes';
import {
  loadRmImagesManifest,
  loadRmIndex,
  loadRmQuestions,
  loadRmStory,
} from '../../../lib/readingMagazine/adminStorageService';
import { getImagePreviewUrl } from '../../../lib/readingMagazine/adminImageService';
import { getOrChooseDailyRandomStoryId } from '../../../lib/readingMagazine/dailyRandomStory';
import { getOrAssignReadingMagazineY3CurrentPractice } from '../../../lib/readingMagazine/studentProgressService';

function todaySeed(): string {
  return new Date().toISOString().slice(0, 10);
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  const n = index % length;
  return n < 0 ? n + length : n;
}

function splitTitleLines(title: string, maxChars: number): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let line = words[0];

  for (let i = 1; i < words.length; i++) {
    const next = `${line} ${words[i]}`;
    if (next.length <= maxChars) {
      line = next;
    } else {
      lines.push(line);
      line = words[i];
    }
  }

  lines.push(line);
  return lines.slice(0, 3);
}

function splitInHalf<T>(items: T[]): [T[], T[]] {
  const list = items ?? [];
  const mid = Math.ceil(list.length / 2);
  return [list.slice(0, mid), list.slice(mid)];
}

type StoryBlock =
  | { kind: 'heading'; heading: string; text: string }
  | { kind: 'paragraph'; text: string };

type CoverStory = { title: string; type: string };

function drawCover(canvas: HTMLCanvasElement, story: CoverStory) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(280, Math.floor(rect.width || 420));
  const cssH = Math.max(340, Math.floor(rect.height || 520));

  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = cssW;
  const h = cssH;

  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#1d4ed8');
  g.addColorStop(0.55, '#7c3aed');
  g.addColorStop(1, '#059669');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Soft vignette
  const v = ctx.createRadialGradient(w * 0.5, h * 0.4, w * 0.1, w * 0.5, h * 0.5, w * 0.7);
  v.addColorStop(0, 'rgba(255,255,255,0.15)');
  v.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);

  // Decorative waves
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = 'white';
  for (let i = 0; i < 6; i++) {
    const y = h * (0.55 + i * 0.07);
    ctx.beginPath();
    ctx.moveTo(-20, y);
    for (let x = -20; x <= w + 20; x += 40) {
      ctx.quadraticCurveTo(x + 20, y - 14, x + 40, y);
    }
    ctx.lineTo(w + 20, h);
    ctx.lineTo(-20, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Title plate
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  const plateW = w * 0.82;
  const plateX = (w - plateW) / 2;
  const plateY = h * 0.12;
  const plateH = h * 0.28;
  const r = 18;
  ctx.beginPath();
  ctx.moveTo(plateX + r, plateY);
  ctx.arcTo(plateX + plateW, plateY, plateX + plateW, plateY + plateH, r);
  ctx.arcTo(plateX + plateW, plateY + plateH, plateX, plateY + plateH, r);
  ctx.arcTo(plateX, plateY + plateH, plateX, plateY, r);
  ctx.arcTo(plateX, plateY, plateX + plateW, plateY, r);
  ctx.closePath();
  ctx.fill();

  // Title text
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 26px system-ui, -apple-system, Segoe UI, Roboto, Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = splitTitleLines(story.title, 18);
  const lineH = 32;
  const startY = plateY + plateH / 2 - ((lines.length - 1) * lineH) / 2;
  lines.forEach((line, idx) => {
    ctx.fillText(line, w / 2, startY + idx * lineH);
  });

  // Subtitle
  ctx.fillStyle = 'rgba(15,23,42,0.8)';
  ctx.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto, Arial';
  ctx.fillText('Year 3 • Reading Magazine', w / 2, plateY + plateH - 18);

  // Bottom badge
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, h - 64, w, 64);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
  ctx.textAlign = 'left';
  ctx.fillText(story.type.toUpperCase(), 16, h - 36);
}

const LS_INDEX_KEY = 'rm:y3:reading-magazine:index:v1';
const LS_STORY_PREFIX = 'rm:y3:reading-magazine:story:v1:';

function safeParseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function safeSetLocalStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / privacy mode
  }
}

type CachedIndex = {
  cachedAt: string;
  stories: RMIndexStory[];
};

type CachedStoryPayload = {
  cachedAt: string;
  storyId: string;
  updatedAt: string;
  story: RMStory;
  questions: RMQuestionSet | null;
  imageUrlsByCaptionIndex: Record<number, string>;
  loadedImagesCount: number;
  loadedQuestionsCount: number;
};

export type Y3ReadingTabProps = {
  overrideOffset: number;
  onNextStory: () => void;
};

export const Y3ReadingTab: React.FC<Y3ReadingTabProps> = ({ overrideOffset, onNextStory }) => {
  const { currentUser, userProfile } = useAuth();
  const studentUid = userProfile?.role === 'student' ? currentUser?.uid ?? undefined : undefined;

  const [indexStories, setIndexStories] = useState<RMIndexStory[]>([]);
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [indexError, setIndexError] = useState<string | null>(null);

  const publishedStories = useMemo(
    () => indexStories.filter((s) => s.status === 'published'),
    [indexStories]
  );

  const availableStories = publishedStories.length > 0 ? publishedStories : indexStories;

  const storyIds = useMemo(() => availableStories.map((s) => s.storyId).filter(Boolean), [availableStories]);

  const [studentStoryId, setStudentStoryId] = useState<string>('');
  const [studentAssignError, setStudentAssignError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!studentUid) {
      setStudentStoryId('');
      setStudentAssignError(null);
      return;
    }
    if (storyIds.length === 0) return;

    setStudentAssignError(null);

    (async () => {
      try {
        const assignment = await getOrAssignReadingMagazineY3CurrentPractice({ studentUid, storyIds });
        if (cancelled) return;
        setStudentStoryId(assignment?.storyId ?? '');
      } catch (e: any) {
        if (cancelled) return;
        console.error('Failed to assign reading-magazine story:', e);
        setStudentAssignError(String(e?.message ?? e));
        setStudentStoryId('');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studentUid, storyIds.join('|')]);

  const baseStoryId = useMemo(
    () => getOrChooseDailyRandomStoryId(availableStories, todaySeed()),
    [availableStories]
  );

  const baseIndex = useMemo(() => {
    if (!baseStoryId) return 0;
    const idx = availableStories.findIndex((s) => s.storyId === baseStoryId);
    return idx >= 0 ? idx : 0;
  }, [availableStories, baseStoryId]);

  const activeIndex = clampIndex(baseIndex + overrideOffset, availableStories.length);
  const activeIndexStory = availableStories[activeIndex];

  const nonStudentStoryId = activeIndexStory?.storyId ?? '';
  const nonStudentUpdatedAt = activeIndexStory?.updatedAt ?? '';

  const assignedIndexStory = useMemo(
    () => (studentStoryId ? availableStories.find((s) => s.storyId === studentStoryId) : undefined),
    [availableStories, studentStoryId]
  );

  const activeStoryId = studentUid ? studentStoryId : nonStudentStoryId;
  const activeStoryUpdatedAt = studentUid ? assignedIndexStory?.updatedAt ?? '' : nonStudentUpdatedAt;

  const [story, setStory] = useState<RMStory | null>(null);
  const [imageUrlsByCaptionIndex, setImageUrlsByCaptionIndex] = useState<Record<number, string>>({});
  const [loadedQuestionsCount, setLoadedQuestionsCount] = useState(0);
  const [loadedImagesCount, setLoadedImagesCount] = useState(0);
  const [loadingStory, setLoadingStory] = useState(false);
  const [storyError, setStoryError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const coverBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Seed from cache first to avoid extra fetches when switching tabs.
    const cached = safeParseJson<CachedIndex>(localStorage.getItem(LS_INDEX_KEY));
    if (cached?.stories && Array.isArray(cached.stories)) {
      setIndexStories(cached.stories);
      setLoadingIndex(false);
    } else {
      setLoadingIndex(true);
    }

    setIndexError(null);

    (async () => {
      try {
        const index = await loadRmIndex();
        if (cancelled) return;
        const stories = index.stories ?? [];
        setIndexStories(stories);
        safeSetLocalStorage(LS_INDEX_KEY, {
          cachedAt: new Date().toISOString(),
          stories,
        } satisfies CachedIndex);
      } catch (e: any) {
        if (cancelled) return;
        setIndexError(String(e?.message ?? e));
      } finally {
        if (cancelled) return;
        setLoadingIndex(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const storyId = activeStoryId;
    const updatedAt = activeStoryUpdatedAt;

    if (!storyId) {
      setStory(null);
      setImageUrlsByCaptionIndex({});
      setLoadedQuestionsCount(0);
      setLoadedImagesCount(0);
      setStoryError(null);
      setLoadingStory(false);
      return;
    }

    const cacheKey = `${LS_STORY_PREFIX}${storyId}:${updatedAt ?? 'no-updatedAt'}`;
    const cached = safeParseJson<CachedStoryPayload>(localStorage.getItem(cacheKey));
    if (cached?.storyId === storyId && cached?.story && cached?.updatedAt === (updatedAt ?? cached.updatedAt)) {
      setStory(cached.story);
      setImageUrlsByCaptionIndex(cached.imageUrlsByCaptionIndex ?? {});
      setLoadedImagesCount(Number.isFinite(cached.loadedImagesCount) ? cached.loadedImagesCount : 0);
      setLoadedQuestionsCount(Number.isFinite(cached.loadedQuestionsCount) ? cached.loadedQuestionsCount : 0);
      setStoryError(null);
      setLoadingStory(false);
      return () => {
        cancelled = true;
      };
    }

    setLoadingStory(true);
    setStoryError(null);

    (async () => {
      try {
        const [loadedStory, loadedManifest] = await Promise.all([
          loadRmStory(storyId),
          loadRmImagesManifest(storyId),
        ]);

        let loadedQuestions: RMQuestionSet | null = null;
        try {
          loadedQuestions = await loadRmQuestions(storyId);
        } catch {
          loadedQuestions = null;
        }

        const urlEntries = await Promise.all(
          (loadedManifest.images ?? []).map(async (img) => {
            const url = img?.storagePath ? await getImagePreviewUrl(img.storagePath) : null;
            return url ? ([img.captionIndex, url] as const) : null;
          })
        );

        const urlMap: Record<number, string> = {};
        for (const entry of urlEntries) {
          if (!entry) continue;
          const [captionIndex, url] = entry;
          urlMap[captionIndex] = url;
        }

        if (cancelled) return;
        setStory(loadedStory);
        setImageUrlsByCaptionIndex(urlMap);
        const loadedImagesCount = (loadedManifest.images ?? []).length;
        const loadedQuestionsCount = (loadedQuestions?.questions ?? []).length;
        setLoadedImagesCount(loadedImagesCount);
        setLoadedQuestionsCount(loadedQuestionsCount);

        safeSetLocalStorage(cacheKey, {
          cachedAt: new Date().toISOString(),
          storyId,
          updatedAt: updatedAt ?? '',
          story: loadedStory,
          questions: loadedQuestions,
          imageUrlsByCaptionIndex: urlMap,
          loadedImagesCount,
          loadedQuestionsCount,
        } satisfies CachedStoryPayload);
      } catch (e: any) {
        if (cancelled) return;
        setStory(null);
        setImageUrlsByCaptionIndex({});
        setLoadedImagesCount(0);
        setLoadedQuestionsCount(0);
        setStoryError(String(e?.message ?? e));
      } finally {
        if (cancelled) return;
        setLoadingStory(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeStoryId, activeStoryUpdatedAt]);

  const paragraphs = useMemo(() => {
    const text = story?.text ?? '';
    return text
      .split(/\n\s*\n/g)
      .map((p) => p.trim())
      .filter(Boolean);
  }, [story?.text]);

  const imageUrlsInCaptionOrder = useMemo(() => {
    const captions = Array.isArray(story?.captions) ? (story?.captions ?? []) : [];
    const captionsCount = captions.length;
    const urls: string[] = [];
    for (let i = 0; i < captionsCount; i++) {
      const url = imageUrlsByCaptionIndex[i];
      if (url) urls.push(url);
    }
    // Fallback: if captions are missing, try captionIndex 0..1
    if (urls.length === 0) {
      const u0 = imageUrlsByCaptionIndex[0];
      const u1 = imageUrlsByCaptionIndex[1];
      if (u0) urls.push(u0);
      if (u1) urls.push(u1);
    }
    return urls;
  }, [imageUrlsByCaptionIndex, story?.captions]);

  const storyImagesCount = imageUrlsInCaptionOrder.length;
  const coverImageUrl = imageUrlsInCaptionOrder[0] ?? null;

  const storyBlocks = useMemo<StoryBlock[]>(() => {
    const headingBlocks: StoryBlock[] = (story?.headings ?? []).map((h) => ({
      kind: 'heading' as const,
      heading: h.heading,
      text: h.text,
    }));

    const normalize = (s: string) => String(s ?? '').trim().replace(/\s+/g, ' ');
    const headingTextSet = new Set(
      (story?.headings ?? [])
        .map((h) => normalize(h.text))
        .filter(Boolean)
    );

    const paragraphBlocks: StoryBlock[] = paragraphs
      .filter((p) => !headingTextSet.has(normalize(p)))
      .map((p) => ({ kind: 'paragraph' as const, text: p }));

    // Some stories contain BOTH structured headings and full text. Show everything.
    return headingBlocks.length > 0 ? [...headingBlocks, ...paragraphBlocks] : paragraphBlocks;
  }, [paragraphs, story?.headings]);

  const [topBlocks, bottomBlocks] = useMemo(() => splitInHalf(storyBlocks), [storyBlocks]);

  useEffect(() => {
    if (!story) return;
    if (coverImageUrl) return;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      drawCover(canvas, { title: story.title, type: story.type });
    };

    draw();

    const ro = new ResizeObserver(() => draw());
    if (coverBoxRef.current) ro.observe(coverBoxRef.current);

    window.addEventListener('resize', draw);
    return () => {
      window.removeEventListener('resize', draw);
      ro.disconnect();
    };
  }, [story, coverImageUrl]);

  if (loadingIndex) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="text-lg font-semibold text-gray-900">Loading stories…</div>
        </div>
      </div>
    );
  }

  if (indexError) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white border border-red-200 rounded-xl p-6 shadow-sm">
          <div className="text-lg font-semibold text-gray-900">Could not load stories</div>
          <div className="mt-2 text-sm text-red-700">{indexError}</div>
        </div>
      </div>
    );
  }

  if (!activeIndexStory) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="text-lg font-semibold text-gray-900">No stories available</div>
          <div className="mt-2 text-sm text-gray-600">
            Ask an owner to publish at least one story in the Reading Magazine bank.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <div className="text-sm font-semibold text-gray-900">{studentUid ? 'Your Reading' : 'Today’s Reading'}</div>
          <div className="text-xs text-gray-600">
            {studentUid ? 'Matched to your practice questions.' : `Daily random pick: ${todaySeed()}`}
          </div>
        </div>
        {!studentUid && (
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-black"
            onClick={() => {
              onNextStory();
            }}
          >
            New story
          </button>
        )}
      </div>

      {studentAssignError && (
        <div className="mb-6 bg-white border border-red-200 rounded-xl p-4 shadow-sm">
          <div className="text-sm font-semibold text-gray-900">Could not choose your next story</div>
          <div className="mt-1 text-sm text-red-700">{studentAssignError}</div>
        </div>
      )}

      <div className="relative">
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-black/5 to-transparent pointer-events-none" />

        <div className="relative bg-amber-50 border border-amber-100 rounded-3xl shadow-xl overflow-hidden">
          {/* subtle texture */}
          <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.8)_1px,transparent_0)] [background-size:16px_16px] pointer-events-none" />

          {storyImagesCount >= 2 ? (
            <div className="flex flex-col h-[calc(100vh-240px)] min-h-0">
              <div className="flex-1 min-h-0">
                {/* Upper half: text left, image right */}
                <div className="h-1/2 min-h-0 grid grid-cols-2 border-b border-amber-100">
                  <div className="relative p-4 md:p-6 overflow-hidden">
                    <div className="text-xs font-semibold text-gray-700 tracking-wide">
                      {(story?.type ?? '').toUpperCase()}
                    </div>
                    <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 mt-2">
                      {story?.title ?? 'Story'}
                    </h2>

                    {loadingStory && <div className="mt-2 text-xs text-gray-600">Loading story…</div>}
                    {storyError && <div className="mt-2 text-xs text-red-700">{storyError}</div>}

                    <div className="mt-3 space-y-2 overflow-hidden">
                      {topBlocks.map((b, idx) =>
                        b.kind === 'heading' ? (
                          <div key={idx}>
                            <div className="text-sm font-bold text-gray-900">{b.heading}</div>
                            <p className="text-gray-800 leading-snug text-sm mt-1">{b.text}</p>
                          </div>
                        ) : (
                          <p key={idx} className="text-gray-800 leading-snug text-sm">
                            {b.text}
                          </p>
                        )
                      )}
                    </div>
                  </div>

                  <div className="relative p-4 md:p-6 min-h-0">
                    <div className="h-full w-full rounded-2xl overflow-hidden bg-white/70">
                      {imageUrlsInCaptionOrder[0] ? (
                        <img
                          src={imageUrlsInCaptionOrder[0]}
                          alt={`Illustration 1 for ${story?.title ?? 'story'}. ${loadedImagesCount} images.`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm text-gray-600">Image unavailable</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Lower half: image left, text right */}
                <div className="h-1/2 min-h-0 grid grid-cols-2">
                  <div className="relative p-4 md:p-6 min-h-0">
                    <div className="h-full w-full rounded-2xl overflow-hidden bg-white/70">
                      {imageUrlsInCaptionOrder[1] ? (
                        <img
                          src={imageUrlsInCaptionOrder[1]}
                          alt={`Illustration 2 for ${story?.title ?? 'story'}. ${loadedImagesCount} images.`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm text-gray-600">Image unavailable</div>
                      )}
                    </div>
                  </div>

                  <div className="relative p-4 md:p-6 min-h-0 overflow-hidden">
                    {/* spine */}
                    <div className="hidden md:block absolute left-0 top-0 bottom-0 w-[10px] bg-gradient-to-r from-amber-200/80 via-amber-100/30 to-transparent" />

                    <div className="pl-0 md:pl-6">
                      <div className="mt-0 space-y-2 overflow-hidden">
                        {bottomBlocks.map((b, idx) =>
                          b.kind === 'heading' ? (
                            <div key={idx}>
                              <div className="text-sm font-bold text-gray-900">{b.heading}</div>
                              <p className="text-gray-800 leading-snug text-sm mt-1">{b.text}</p>
                            </div>
                          ) : (
                            <p key={idx} className="text-gray-800 leading-snug text-sm">
                              {b.text}
                            </p>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="shrink-0 px-6 md:px-8 pb-6 text-xs text-gray-500">
                Story {activeIndex + 1} of {availableStories.length}
                {overrideOffset !== 0 ? ' (manual override)' : ' (daily selection)'}
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2">
              {/* Left page / cover */}
              <div className="relative p-6 md:p-8">
                <div ref={coverBoxRef} className="aspect-[3/4] w-full rounded-2xl overflow-hidden bg-white/70">
                  {coverImageUrl ? (
                    <img
                      src={coverImageUrl}
                      alt={`Cover for ${story?.title ?? 'story'}. ${loadedImagesCount} images. ${loadedQuestionsCount} questions.`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <canvas
                      ref={canvasRef}
                      className="w-full h-full block"
                      aria-label={`Cover for ${story?.title ?? 'story'}. ${loadedImagesCount} images. ${loadedQuestionsCount} questions.`}
                    />
                  )}
                </div>
              </div>

              {/* Right page / text */}
              <div className="relative p-6 md:p-8">
                {/* spine */}
                <div className="hidden md:block absolute left-0 top-0 bottom-0 w-[10px] bg-gradient-to-r from-amber-200/80 via-amber-100/30 to-transparent" />

                <div className="pl-0 md:pl-6">
                  <div className="text-xs font-semibold text-gray-700 tracking-wide">
                    {(story?.type ?? '').toUpperCase()}
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-2">
                    {story?.title ?? 'Story'}
                  </h2>

                  {loadingStory && <div className="mt-4 text-sm text-gray-600">Loading story…</div>}
                  {storyError && <div className="mt-4 text-sm text-red-700">{storyError}</div>}

                  <div className="mt-6 space-y-4">
                    {storyBlocks.map((b, idx) =>
                      b.kind === 'heading' ? (
                        <div key={idx}>
                          <div className="text-sm font-bold text-gray-900">{b.heading}</div>
                          <p className="text-gray-800 leading-relaxed text-base mt-1">{b.text}</p>
                        </div>
                      ) : (
                        <p key={idx} className="text-gray-800 leading-relaxed text-base">
                          {b.text}
                        </p>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
              <div className="px-6 md:px-8 pb-6 text-xs text-gray-500">
                Story {activeIndex + 1} of {availableStories.length}
                {overrideOffset !== 0 ? ' (manual override)' : ' (daily selection)'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
