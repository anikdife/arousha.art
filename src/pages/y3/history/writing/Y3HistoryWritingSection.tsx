import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../auth/AuthProvider';
import { computeLocalDayRangeMs } from '../components/DateRangeSheet';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  deleteUnassessedWritingAttempt,
  downloadWritingAnswerText,
  loadWritingAttemptSummaries,
  writingAttemptDocRef,
  submitWritingAssessment,
} from '../../../../lib/writing/attemptService';
import type { WritingAttemptSummaryY3 } from '../../../../lib/writing/attemptTypes';
import { buildWritingAssessmentPdf } from '../../../../lib/writing/writingAssessmentPdf';
import { loadWritingIndexY3 } from '../../../../lib/writing/storageIndex';
import { loadPromptById } from '../../../../lib/writing/promptLoader';
import { getDoc } from 'firebase/firestore';
import { downloadBytes } from '../../../../lib/subtractionPdf';

type WritingTab = 'graph' | 'list' | 'assessment';
type FeedbackMode = 'text' | 'json';

GlobalWorkerOptions.workerSrc = `${(process.env.PUBLIC_URL || '').replace(/\/$/, '')}/pdfjs/pdf.worker.min.mjs`;

function tabButtonClass(active: boolean) {
  const base = 'px-3 py-1.5 text-sm font-semibold rounded-md transition-colors';
  return active ? `${base} bg-gray-900 text-white` : `${base} bg-gray-100 text-gray-800 hover:bg-gray-200`;
}

function safeParseJson(text: string): { ok: true; value: any } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

function buildNaplanAssessorPrompt(params: { story: string; answer: string }): string {
  const story = (params.story ?? '').trim();
  const answer = (params.answer ?? '').trim();

  return `Role: You are an expert Australian primary literacy assessor specializing in NAPLAN Year 3 Writing.


Task: ${story ? story : '[PASTE THE WRITING PROMPT HERE FROM THE LOADED STORY]'}

Evaluation Criteria: Please assess the student’s work using the 10 official NAPLAN categories:

Audience: Is the story engaging for the reader?


Text Structure: Is there an orientation, a complication, and a resolution?


Ideas: How creative and developed are the characters and setting?

Persuasive/Narrative Devices: Does the student use descriptive language or dialogue?


Vocabulary: Is the word choice appropriate and varied?

Cohesion: Do the sentences flow together logically?


Paragraphing: Are ideas grouped into clear paragraphs?


Sentence Structure: Are sentences complete and varied (simple vs. compound)?


Punctuation: Correct use of capitals, full stops, and commas?


Spelling: Accuracy of common and difficult words?

Output Requirements: Return the assessment as VALID JSON ONLY. Use the following structure:

JSON
{
  "studentPerformance": {
    "totalScoreEstimate": "X/100",
    "level": "Year 3 Proficiency",
    "summary": "Short overall summary of the writing quality"
  },
  "criteriaAnalysis": {
    "textStructure": { "score": "X/25", "feedback": "Evaluation of orientation, complication, and resolution" },
    "ideas": { "score": "X/25", "feedback": "Evaluation of creativity and plot development" },
    "vocabulary": { "score": "X/25", "feedback": "Evaluation of word choices" },
    "mechanics": { "score": "X/25", "feedback": "Evaluation of spelling and punctuation" }
  },
  "strengths": ["list of 2-3 specific things done well"],
  "areasForImprovement": ["list of 2-3 specific goals for the student"],
  "evidence": ["Direct quotes from the student's text that justify the scores"]
}
Student Text to Assess: ${answer ? answer : '[PASTE STUDENT answer HERE]'}`;
}

function subTabButtonClass(active: boolean) {
  const base = 'px-3 py-1.5 text-sm font-semibold rounded-md transition-colors';
  return active ? `${base} bg-purple-600 text-white` : `${base} bg-purple-50 text-purple-900 hover:bg-purple-100`;
}

function formatDateTime(ms: number) {
  if (!ms) return 'Date unavailable';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return 'Date unavailable';
  }
}

function formatShortDate(ms: number) {
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function buildStoryTextFromPrompt(prompt: any): string {
  if (!prompt) return '';
  const title = typeof prompt.title === 'string' ? prompt.title : '';
  const taskIntro = typeof prompt.taskIntro === 'string' ? prompt.taskIntro : '';
  const guidance = Array.isArray(prompt.guidance) ? (prompt.guidance as unknown[]).filter((g) => typeof g === 'string') : [];
  const remember = Array.isArray(prompt.remember) ? (prompt.remember as unknown[]).filter((r) => typeof r === 'string') : [];

  const parts: string[] = [];
  if (title) parts.push(title.trim());
  if (taskIntro) parts.push(taskIntro.trim());
  if (guidance.length) parts.push(`Guidance:\n${guidance.map((g) => `- ${String(g).trim()}`).join('\n')}`);
  if (remember.length) parts.push(`Remember:\n${remember.map((r) => `- ${String(r).trim()}`).join('\n')}`);
  return parts.filter(Boolean).join('\n\n').trim();
}

async function writeClipboardText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Fallback for environments where Clipboard API is not available.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
    } finally {
      document.body.removeChild(ta);
    }
  }
}

function toLocalDateInputValue(date: Date): string {
  const tzOffsetMinutes = date.getTimezoneOffset();
  const local = new Date(date.getTime() - tzOffsetMinutes * 60_000);
  return local.toISOString().slice(0, 10);
}

type Point = { xMillis: number; yPercent: number };
type Domain = { minX: number; maxX: number };

function toPoints(items: WritingAttemptSummaryY3[]): Point[] {
  return items
    .filter((it) => it.assessed === true)
    .filter((it) => typeof it.scorePercent === 'number' && Number.isFinite(it.scorePercent))
    .filter((it) => typeof it.assessedAtMillis === 'number' && it.assessedAtMillis > 0)
    .map((it) => ({ xMillis: it.assessedAtMillis, yPercent: Math.max(0, Math.min(100, it.scorePercent ?? 0)) }))
    .sort((a, b) => a.xMillis - b.xMillis);
}

function computeDomain(points: Point[]): Domain {
  if (points.length === 0) {
    const now = Date.now();
    return { minX: now - 6 * 24 * 60 * 60 * 1000, maxX: now };
  }
  const xs = points.map((p) => p.xMillis);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  if (minX === maxX) {
    return { minX: minX - 24 * 60 * 60 * 1000, maxX: maxX + 24 * 60 * 60 * 1000 };
  }
  return { minX, maxX };
}

export const Y3HistoryWritingSection: React.FC<{
  studentUid: string;
  studentName?: string;
  linkedStudentUids: string[];
  defaultTab?: WritingTab;
  hideGraphTab?: boolean;
  hideAssessmentTab?: boolean;
  showAssessmentButton?: boolean;
  hideTabs?: boolean;
  showDateRangeControls?: boolean;
  hideHeader?: boolean;
}> = (props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, userProfile } = useAuth();
  const role = userProfile?.role ?? 'student';

  const canView = useMemo(() => {
    if (!currentUser?.uid) return false;
    if (role === 'student' || role === 'owner') return currentUser.uid === props.studentUid;
    if (role === 'parent' || role === 'teacher') return props.linkedStudentUids.includes(props.studentUid);
    return false;
  }, [currentUser?.uid, props.linkedStudentUids, props.studentUid, role]);

  const canAssess = useMemo(() => {
    if (!currentUser?.uid) return false;
    return role === 'parent' || role === 'teacher' || role === 'owner';
  }, [currentUser?.uid, role]);

  const today = useMemo(() => toLocalDateInputValue(new Date()), []);
  const [fromDate, setFromDate] = useState<string>(today);
  const [toDate, setToDate] = useState<string>(today);

  const dateRange = useMemo(() => {
    if (!canAssess) return null;
    return computeLocalDayRangeMs(fromDate, toDate);
  }, [canAssess, fromDate, toDate]);

  const [tab, setTab] = useState<WritingTab>(() => props.defaultTab ?? (props.hideTabs ? 'list' : 'graph'));

  useEffect(() => {
    if (!props.hideGraphTab) return;
    if (tab === 'graph') setTab(props.defaultTab ?? 'list');
  }, [props.defaultTab, props.hideGraphTab, tab]);

  useEffect(() => {
    if (!props.hideTabs) return;
    if (tab !== 'list') setTab(props.defaultTab ?? 'list');
  }, [props.defaultTab, props.hideTabs, tab]);

  const [attempts, setAttempts] = useState<WritingAttemptSummaryY3[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);

  const [assessedSummaries, setAssessedSummaries] = useState<WritingAttemptSummaryY3[]>([]);
  const [assessedLoading, setAssessedLoading] = useState(false);
  const [assessedError, setAssessedError] = useState<string | null>(null);

  const [listBusy, setListBusy] = useState<{ id: string; action: 'open' | 'download' } | null>(null);
  const [listActionError, setListActionError] = useState<string | null>(null);

  const range = useMemo(() => {
    if (!dateRange) return null;
    return { start: dateRange.startMs, end: dateRange.endMs };
  }, [dateRange]);

  const filteredAssessed = useMemo(() => {
    const base = assessedSummaries
      .filter((a) => a.assessed === true)
      .filter((a) => typeof a.scorePercent === 'number' && Number.isFinite(a.scorePercent))
      .filter((a) => typeof a.assessedAtMillis === 'number' && a.assessedAtMillis > 0);

    const inRange =
      range == null
        ? base
        : base.filter((a) => a.assessedAtMillis >= range.start && a.assessedAtMillis <= range.end);

    return inRange.sort((a, b) => b.assessedAtMillis - a.assessedAtMillis);
  }, [assessedSummaries, range]);

  const openAssessedAttempt = async (attemptId: string) => {
    setListActionError(null);
    setListBusy({ id: attemptId, action: 'open' });
    try {
      navigate('/y3/history/review/writing', {
        state: {
          backgroundLocation: location,
          studentUid: props.studentUid,
          attemptId,
        },
      });
    } catch (e) {
      console.error('Failed to open writing review:', e);
      setListActionError('Failed to open');
    } finally {
      setListBusy(null);
    }
  };

  const downloadAssessedAttemptPdf = async (attemptId: string) => {
    setListActionError(null);
    setListBusy({ id: attemptId, action: 'download' });

    try {
      const snap = await getDoc(writingAttemptDocRef(props.studentUid, attemptId));
      if (!snap.exists()) throw new Error('Writing attempt not found');
      const data = snap.data() as any;

      const promptId = typeof data.promptId === 'string' ? data.promptId : '';
      const promptTitle = typeof data.promptTitle === 'string' ? data.promptTitle : 'Writing prompt';
      const answerStoragePath = typeof data.answerStoragePath === 'string' ? data.answerStoragePath : '';

      const scorePercent = typeof data.scorePercent === 'number' ? data.scorePercent : 0;
      const comment = typeof data.comment === 'string' ? data.comment : '';
      const assessedAtMillis = typeof data.assessedAt?.toDate === 'function' ? data.assessedAt.toDate().getTime() : null;
      const createdAtMillis = typeof data.createdAt?.toDate === 'function' ? data.createdAt.toDate().getTime() : null;

      const studentName = props.studentName ?? 'Student';
      const dateLine = (createdAtMillis ?? assessedAtMillis)
        ? new Date((createdAtMillis ?? assessedAtMillis) as number).toLocaleString()
        : '';
      const marksLine = typeof data.scorePercent === 'number' ? `${Math.round(scorePercent)}%` : '';

      const index = await loadWritingIndexY3();
      const item = (index.items ?? []).find((it) => it.promptId === promptId);
      if (!item) throw new Error('Prompt not found');

      const loaded = await loadPromptById({ item, expectedPromptId: promptId });
      const answerText = answerStoragePath ? await downloadWritingAnswerText(answerStoragePath) : '';

      const bytes = await buildWritingAssessmentPdf({
        title: 'Writing Practice',
        prompt: loaded.prompt,
        promptImageUrl: loaded.imageUrl,
        answerText,
        feedback: {
          scorePercent,
          comment,
          assessedAt: assessedAtMillis ?? undefined,
        },
        includeCoverPage: true,
        cover: {
          studentName,
          dateLine,
          marksLine,
          sessionId: attemptId,
        },
      });

      downloadBytes(bytes, `Writing_${attemptId}_${promptTitle.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)}.pdf`);
    } catch (e: any) {
      console.error('Failed to generate writing PDF:', e);
      setListActionError(String(e?.message ?? 'Failed to download'));
    } finally {
      setListBusy(null);
    }
  };

  // Assessment
  const [assessmentAttemptId, setAssessmentAttemptId] = useState<string | null>(null);
  const [studentAnswer, setStudentAnswer] = useState<string>('');
  const [assessmentComment, setAssessmentComment] = useState<string>('');
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>('text');
  const [assessmentCommentJsonText, setAssessmentCommentJsonText] = useState<string>('');
  const [assessmentCommentJsonError, setAssessmentCommentJsonError] = useState<string | null>(null);
  const [scorePercent, setScorePercent] = useState<number>(0);
  const [assessmentBusy, setAssessmentBusy] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [assessmentSubmitted, setAssessmentSubmitted] = useState(false);

  const [assessmentPrompt, setAssessmentPrompt] = useState<any | null>(null);
  const [assessmentPromptImageUrl, setAssessmentPromptImageUrl] = useState<string>('');

  const [attemptCopyCache, setAttemptCopyCache] = useState<Record<string, { story: string; answer: string }>>({});
  const [copyBusyAttemptId, setCopyBusyAttemptId] = useState<string | null>(null);
  const [copiedAttemptId, setCopiedAttemptId] = useState<string | null>(null);

  const [feedbackPromptCopyBusy, setFeedbackPromptCopyBusy] = useState(false);
  const [feedbackPromptCopied, setFeedbackPromptCopied] = useState(false);

  const [previewPdfDoc, setPreviewPdfDoc] = useState<any | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewWidth, setPreviewWidth] = useState<number>(0);

  const previewCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const previewContainerRef = React.useRef<HTMLDivElement | null>(null);

  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const unassessed = useMemo(() => {
    return attempts
      .filter((a) => a.assessed === false)
      .filter((a) => Boolean(a.answerStoragePath))
      .sort((a, b) => b.createdAtMillis - a.createdAtMillis);
  }, [attempts]);

  useEffect(() => {
    if (tab !== 'assessment') return;

    const measure = () => {
      const el = previewContainerRef.current;
      if (!el) return;
      const w = Math.floor(el.clientWidth);
      setPreviewWidth((prev) => (prev === w ? prev : w));
    };

    // Run after mount/layout.
    const raf = window.requestAnimationFrame(measure);
    window.addEventListener('resize', measure);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      const el = previewContainerRef.current;
      if (el) {
        ro = new ResizeObserver(() => measure());
        ro.observe(el);
      }
    }

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [assessmentAttemptId, tab]);

  // Load attempts (used for Assessment and for lightweight context)
  useEffect(() => {
    let cancelled = false;
    if (!canView) return;

    setAttemptsLoading(true);
    setAttemptsError(null);

    (async () => {
      try {
        if (!cancelled) {
          const summaries = await loadWritingAttemptSummaries({ studentUid: props.studentUid, max: 500 });
          const filtered = summaries
            .filter((s) => Boolean(s.answerStoragePath) && Boolean(s.promptId))
            .sort((a, b) => b.createdAtMillis - a.createdAtMillis);
          setAttempts(filtered);
        }
      } catch (e: any) {
        if (!cancelled) setAttemptsError(String(e?.message ?? 'Failed to load writing attempts'));
      } finally {
        if (!cancelled) setAttemptsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, props.studentUid]);

  // Load assessed summaries (for Graph/List)
  useEffect(() => {
    let cancelled = false;
    if (!canView) return;
    if (tab !== 'graph' && tab !== 'list') return;

    setAssessedLoading(true);
    setAssessedError(null);

    (async () => {
      try {
        const summaries = await loadWritingAttemptSummaries({ studentUid: props.studentUid, max: 2000 });
        if (!cancelled) setAssessedSummaries(summaries);
      } catch (e: any) {
        if (!cancelled) setAssessedError(String(e?.message ?? 'Failed to load writing history'));
      } finally {
        if (!cancelled) setAssessedLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canView, props.studentUid, tab]);

  // Assessment: pick attempt + load student answer
  useEffect(() => {
    if (tab !== 'assessment') return;

    // If nothing selected yet (or selected got removed), default to newest unassessed.
    const current = assessmentAttemptId ? unassessed.find((a) => a.attemptId === assessmentAttemptId) : null;
    const chosen = current ?? (unassessed[0] ?? null);

    if (chosen?.attemptId !== assessmentAttemptId) {
      setAssessmentAttemptId(chosen?.attemptId ?? null);
      setAssessmentSubmitted(false);
      setAssessmentError(null);
      setAssessmentComment('');
      setAssessmentCommentJsonText('');
      setAssessmentCommentJsonError(null);
      setScorePercent(0);
      setStudentAnswer('');
      setAssessmentPrompt(null);
      setAssessmentPromptImageUrl('');
      setPreviewPdfDoc(null);
      setPreviewError(null);
      return;
    }

    // Load answer for currently selected attempt.
    setStudentAnswer('');
    setAssessmentPrompt(null);
    setAssessmentPromptImageUrl('');
    setPreviewPdfDoc(null);
    setPreviewError(null);
    setAssessmentError(null);
    if (!chosen?.answerStoragePath) return;
    if (!chosen?.promptId) return;

    let cancelled = false;
    (async () => {
      try {
        const [text, index] = await Promise.all([downloadWritingAnswerText(chosen.answerStoragePath!), loadWritingIndexY3()]);
        if (cancelled) return;

        setStudentAnswer(text);

        const item = (index.items ?? []).find((it) => it.promptId === chosen.promptId);
        if (!item) throw new Error('Prompt not found');
        const loaded = await loadPromptById({ item, expectedPromptId: chosen.promptId });
        if (cancelled) return;

        setAssessmentPrompt(loaded.prompt);
        setAssessmentPromptImageUrl(loaded.imageUrl);

        setAttemptCopyCache((prev) => ({
          ...prev,
          [chosen.attemptId]: {
            story: buildStoryTextFromPrompt(loaded.prompt),
            answer: text,
          },
        }));
      } catch (e: any) {
        if (!cancelled) setAssessmentError(String(e?.message ?? 'Failed to load student answer'));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [assessmentAttemptId, tab, unassessed]);

  useEffect(() => {
    if (feedbackMode !== 'json') {
      setAssessmentCommentJsonError(null);
      return;
    }

    const raw = (assessmentCommentJsonText ?? '').trim();
    if (!raw) {
      setAssessmentCommentJsonError('Enter valid JSON');
      return;
    }

    const parsed = safeParseJson(raw);
    setAssessmentCommentJsonError(parsed.ok ? null : `Invalid JSON: ${parsed.error}`);
  }, [assessmentCommentJsonText, feedbackMode]);

  const onCopyAttempt = async (attemptId: string) => {
    const cached = attemptCopyCache[attemptId];
    if (!cached) return;

    setCopyBusyAttemptId(attemptId);
    try {
      const text = JSON.stringify({ story: cached.story, answer: cached.answer });
      await writeClipboardText(text);
      setCopiedAttemptId(attemptId);
      window.setTimeout(() => setCopiedAttemptId((cur) => (cur === attemptId ? null : cur)), 1200);
    } finally {
      setCopyBusyAttemptId((cur) => (cur === attemptId ? null : cur));
    }
  };

  const onCopyFeedbackPrompt = async () => {
    if (!assessmentAttemptId) return;
    const cached = attemptCopyCache[assessmentAttemptId];
    if (!cached) return;
    if (feedbackPromptCopyBusy) return;

    setFeedbackPromptCopyBusy(true);
    try {
      const text = buildNaplanAssessorPrompt({ story: cached.story, answer: cached.answer });
      await writeClipboardText(text);
      setFeedbackPromptCopied(true);
      window.setTimeout(() => setFeedbackPromptCopied(false), 1200);
    } finally {
      setFeedbackPromptCopyBusy(false);
    }
  };

  useEffect(() => {
    if (tab !== 'assessment') return;
    if (!assessmentAttemptId) return;
    if (!assessmentPrompt) return;

    let cancelled = false;

    (async () => {
      try {
        setPreviewLoading(true);
        setPreviewError(null);
        setPreviewPdfDoc(null);

        const bytes = await buildWritingAssessmentPdf({
          title: 'Writing Practice',
          prompt: assessmentPrompt,
          promptImageUrl: assessmentPromptImageUrl,
          answerText: studentAnswer || '',
          feedback: { scorePercent: 0, comment: '', assessedAt: null },
        });

        if (cancelled) return;

        // pdfjs transfers the provided ArrayBuffer into the worker (detaching it).
        // Use a copy to keep our bytes intact.
        const doc = await (getDocument({ data: bytes.slice() }) as any).promise;
        if (cancelled) return;

        setPreviewPdfDoc(doc);
      } catch (e: any) {
        if (!cancelled) setPreviewError(String(e?.message ?? 'Failed to build preview'));
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [assessmentAttemptId, assessmentPrompt, assessmentPromptImageUrl, studentAnswer, tab]);

  useEffect(() => {
    if (tab !== 'assessment') return;
    if (!previewPdfDoc) return;
    if (!previewCanvasRef.current) return;
    if (!previewWidth) return;

    let cancelled = false;

    (async () => {
      try {
        const canvas = previewCanvasRef.current!;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const page1 = await previewPdfDoc.getPage(1);
        if (cancelled) return;
        const page2 = await previewPdfDoc.getPage(2);
        if (cancelled) return;

        const dpr = window.devicePixelRatio || 1;
        const gapCss = 14;
        const gapDevice = Math.floor(gapCss * dpr);

        const vp1 = page1.getViewport({ scale: 1 });
        const scale = Math.max(0.1, previewWidth / vp1.width);
        const svp1 = page1.getViewport({ scale });
        const svp2 = page2.getViewport({ scale });

        const outWidthCss = Math.floor(previewWidth);
        const outHeightCss = Math.floor(svp1.height + gapCss + svp2.height);

        canvas.width = Math.floor(outWidthCss * dpr);
        canvas.height = Math.floor(outHeightCss * dpr);
        canvas.style.width = `${outWidthCss}px`;
        canvas.style.height = `${outHeightCss}px`;

        // Background
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const renderToTemp = async (page: any, viewport: any) => {
          const temp = document.createElement('canvas');
          temp.width = Math.floor(viewport.width * dpr);
          temp.height = Math.floor(viewport.height * dpr);
          const tctx = temp.getContext('2d');
          if (!tctx) return null;
          tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          tctx.clearRect(0, 0, Math.floor(viewport.width), Math.floor(viewport.height));
          const task = page.render({ canvasContext: tctx, viewport });
          await task.promise;
          return temp;
        };

        const temp1 = await renderToTemp(page1, svp1);
        if (cancelled) return;
        const temp2 = await renderToTemp(page2, svp2);
        if (cancelled) return;

        if (temp1) ctx.drawImage(temp1, 0, 0);
        if (temp2) ctx.drawImage(temp2, 0, Math.floor(svp1.height * dpr) + gapDevice);
      } catch (e: any) {
        if (!cancelled) setPreviewError(String(e?.message ?? 'Failed to render preview'));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewPdfDoc, previewWidth, tab]);

  const onSubmitAssessment = async () => {
    if (!canAssess) return;
    if (!assessmentAttemptId) return;
    if (!currentUser?.uid) return;
    if (feedbackMode === 'json' && assessmentCommentJsonError) return;

    setAssessmentBusy(true);
    setAssessmentError(null);

    try {
      const jsonParsed =
        feedbackMode === 'json' ? safeParseJson((assessmentCommentJsonText ?? '').trim()) : ({ ok: false, error: '' } as any);
      const jsonValue = feedbackMode === 'json' && jsonParsed.ok ? jsonParsed.value : null;

      await submitWritingAssessment({
        studentUid: props.studentUid,
        attemptId: assessmentAttemptId,
        assessorUid: currentUser.uid,
        comment:
          feedbackMode === 'json'
            ? JSON.stringify(jsonValue ?? {}, null, 2)
            : assessmentComment,
        commentFormat: feedbackMode,
        commentJson: feedbackMode === 'json' ? jsonValue : null,
        scorePercent,
      });
      setAssessmentSubmitted(true);

      // Refresh answered list so assessed status updates.
      const summaries = await loadWritingAttemptSummaries({ studentUid: props.studentUid, max: 50 });
      const filtered = summaries
        .filter((s) => Boolean(s.answerStoragePath) && Boolean(s.promptId))
        .sort((a, b) => b.createdAtMillis - a.createdAtMillis);
      setAttempts(filtered);
    } catch (e: any) {
      setAssessmentError(String(e?.message ?? 'Failed to submit assessment'));
    } finally {
      setAssessmentBusy(false);
    }
  };

  const onDeleteSelected = async () => {
    if (!canAssess) return;
    if (!assessmentAttemptId) return;
    if (assessmentBusy || assessmentSubmitted || deleteBusy) return;

    const selected = unassessed.find((a) => a.attemptId === assessmentAttemptId) ?? null;
    if (!selected) return;

    const ok = window.confirm('Delete this unassessed writing submission? This cannot be undone.');
    if (!ok) return;

    setDeleteBusy(true);
    setDeleteError(null);
    setAssessmentError(null);

    try {
      await deleteUnassessedWritingAttempt({ studentUid: props.studentUid, attemptId: assessmentAttemptId });

      // Refresh attempts so the deleted submission disappears.
      const summaries = await loadWritingAttemptSummaries({ studentUid: props.studentUid, max: 500 });
      const filtered = summaries
        .filter((s) => Boolean(s.answerStoragePath) && Boolean(s.promptId))
        .sort((a, b) => b.createdAtMillis - a.createdAtMillis);
      setAttempts(filtered);

      // Clear selection so effect chooses the newest remaining unassessed.
      setAssessmentAttemptId(null);
      setStudentAnswer('');
      setAssessmentComment('');
      setScorePercent(0);
      setAssessmentSubmitted(false);
    } catch (e: any) {
      setDeleteError(String(e?.message ?? 'Failed to delete submission'));
    } finally {
      setDeleteBusy(false);
    }
  };

  const points = useMemo(() => toPoints(filteredAssessed), [filteredAssessed]);
  const domain = useMemo(() => computeDomain(points), [points]);

  const viewW = 1000;
  const viewH = 450;
  const pad = { top: 40, right: 30, bottom: 60, left: 60 };
  const plotW = viewW - pad.left - pad.right;
  const plotH = viewH - pad.top - pad.bottom;

  const xToSvg = (xMillis: number) => {
    const t = (xMillis - domain.minX) / (domain.maxX - domain.minX);
    return pad.left + Math.max(0, Math.min(1, t)) * plotW;
  };

  const yToSvg = (yPercent: number) => {
    const t = yPercent / 100;
    return pad.top + (1 - Math.max(0, Math.min(1, t))) * plotH;
  };

  const makePolyline = (pts: Point[]) => pts.map((p) => `${xToSvg(p.xMillis)},${yToSvg(p.yPercent)}`).join(' ');

  const xTicks = useMemo(() => {
    const tickCount = 5;
    const out: Array<{ x: number; label: string }> = [];
    for (let i = 0; i < tickCount; i++) {
      const t = i / (tickCount - 1);
      const ms = domain.minX + t * (domain.maxX - domain.minX);
      out.push({ x: xToSvg(ms), label: formatShortDate(ms) });
    }
    return out;
  }, [domain.maxX, domain.minX]);

  const yTicks = [0, 25, 50, 75, 100].map((v) => ({ v, y: yToSvg(v) }));

  if (!canView) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="text-sm font-semibold text-gray-900">Writing</div>
        <div className="mt-2 text-sm text-red-700">Not authorised.</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      <div className="p-4">
        {!props.hideHeader && (
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm font-semibold text-gray-900">Writing</div>

            <div className="flex flex-col items-end gap-2">
              {(role === 'parent' || role === 'teacher') && (
                <div className="text-xs text-gray-500">Viewing: {props.studentName ?? 'Selected student'}</div>
              )}
              {!props.hideTabs && (
                <div className="inline-flex rounded-lg bg-gray-100 p-1">
                  {!props.hideGraphTab && (
                    <button type="button" className={tabButtonClass(tab === 'graph')} onClick={() => setTab('graph')}>
                      Graph
                    </button>
                  )}
                  <button type="button" className={tabButtonClass(tab === 'list')} onClick={() => setTab('list')}>
                    List
                  </button>
                  {!props.hideAssessmentTab && (
                    <button type="button" className={tabButtonClass(tab === 'assessment')} onClick={() => setTab('assessment')}>
                      Assessment
                    </button>
                  )}
                </div>
              )}

              {canAssess && props.showAssessmentButton && (
                <button
                  type="button"
                  onClick={() => setTab('assessment')}
                  className="px-3 py-1.5 text-sm font-semibold rounded-md bg-purple-600 text-white hover:bg-purple-700"
                >
                  Assessment
                </button>
              )}
            </div>
          </div>
        )}

        {canAssess && tab !== 'assessment' && props.showDateRangeControls !== false && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="text-xs font-semibold text-gray-700">From</div>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2 py-1 rounded-lg border border-gray-300 bg-white text-sm"
            />
            <div className="text-xs font-semibold text-gray-700">To</div>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2 py-1 rounded-lg border border-gray-300 bg-white text-sm"
            />
          </div>
        )}

        <div className="mt-4" style={{ height: 'calc(100dvh - 260px)' }}>
          {tab === 'graph' && (
            <div className="h-full flex flex-col min-h-0">
              <div className="shrink-0">
                <div className="text-xs text-gray-600">Writing scores over time</div>
                {assessedLoading && <div className="mt-1 text-xs text-gray-500">Loading…</div>}
                {!assessedLoading && assessedError && <div className="mt-1 text-xs text-red-700">{assessedError}</div>}
              </div>

              <div className="mt-3 flex-1 min-h-0">
                <div className="h-full min-h-0 flex flex-col">
                  <div className="flex-1 min-h-0 overflow-hidden rounded-xl border border-gray-200 bg-white">
                    <svg className="w-full h-full" viewBox={`0 0 ${viewW} ${viewH}`} preserveAspectRatio="xMidYMid meet">
                      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + plotH} stroke="#111827" strokeWidth={1} />
                      <line
                        x1={pad.left}
                        y1={pad.top + plotH}
                        x2={pad.left + plotW}
                        y2={pad.top + plotH}
                        stroke="#111827"
                        strokeWidth={1}
                      />

                      {yTicks.map((t) => (
                        <g key={t.v}>
                          <line x1={pad.left} y1={t.y} x2={pad.left + plotW} y2={t.y} stroke="#E5E7EB" strokeWidth={1} />
                          <text x={pad.left - 10} y={t.y + 4} textAnchor="end" fontSize={12} fill="#374151">
                            {t.v}%
                          </text>
                        </g>
                      ))}

                      {xTicks.map((t, idx) => (
                        <g key={`${t.label}-${idx}`}>
                          <line x1={t.x} y1={pad.top + plotH} x2={t.x} y2={pad.top + plotH + 6} stroke="#111827" strokeWidth={1} />
                          <text x={t.x} y={pad.top + plotH + 26} textAnchor="middle" fontSize={12} fill="#374151">
                            {t.label}
                          </text>
                        </g>
                      ))}

                      {points.length > 0 && (
                        <polyline fill="none" stroke="#2563EB" strokeWidth={3} strokeLinecap="round" points={makePolyline(points)} />
                      )}

                      {points.map((p) => (
                        <circle key={p.xMillis} cx={xToSvg(p.xMillis)} cy={yToSvg(p.yPercent)} r={4} fill="#2563EB" />
                      ))}
                    </svg>
                  </div>

                  {points.length === 0 && !assessedLoading && !assessedError && (
                    <div className="mt-3 text-sm text-gray-600">No assessed scores yet.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'list' && (
            <div className="h-full min-h-0 overflow-auto space-y-3">
              {assessedLoading && <div className="text-sm text-gray-600">Loading…</div>}
              {!assessedLoading && assessedError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">{assessedError}</div>
              )}

              {!assessedLoading && !assessedError && listActionError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">{listActionError}</div>
              )}

              {!assessedLoading && !assessedError && filteredAssessed.length === 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-600">
                  <div>No sessions for the selected date range</div>
                  <div>Complete a practice session to see it here</div>
                </div>
              )}

              {!assessedLoading &&
                !assessedError &&
                filteredAssessed.map((it) => (
                  <div key={it.attemptId} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900">{formatDateTime(it.assessedAtMillis)}</div>
                        {it.promptTitle && <div className="mt-1 text-xs text-gray-500">Prompt: {it.promptTitle}</div>}
                        <div className="mt-2 text-sm font-semibold text-gray-900">{it.scorePercent ?? 0}%</div>
                      </div>

                      <div className="flex items-center gap-2 justify-end shrink-0">
                        <button
                          type="button"
                          onClick={() => void openAssessedAttempt(it.attemptId)}
                          disabled={listBusy?.action === 'open' && listBusy.id === it.attemptId}
                          className="px-3 py-2 text-sm font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:bg-gray-400 disabled:hover:bg-gray-400"
                        >
                          {listBusy?.action === 'open' && listBusy.id === it.attemptId ? 'Opening' : 'Open'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void downloadAssessedAttemptPdf(it.attemptId)}
                          disabled={
                            (listBusy?.action === 'download' && listBusy.id === it.attemptId) ||
                            !it.answerStoragePath
                          }
                          className="px-3 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {listBusy?.action === 'download' && listBusy.id === it.attemptId ? 'Downloading…' : 'Download'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {tab === 'assessment' && (
            <div className="h-full overflow-auto">
              {!canAssess && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-900">
                  Assessment is only available to teachers/parents.
                </div>
              )}

              {canAssess && (
                <div className="space-y-4">
                  {attemptsLoading && <div className="text-sm text-gray-600">Loading…</div>}
                  {!attemptsLoading && attemptsError && <div className="text-sm text-red-700">{attemptsError}</div>}

                  {!attemptsLoading && !attemptsError && unassessed.length === 0 && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-600">
                      No unassessed writing submissions.
                    </div>
                  )}

                  {!attemptsLoading && !attemptsError && unassessed.length > 0 && (
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="md:w-80 shrink-0 rounded-xl border border-gray-200 bg-white overflow-hidden">
                        <div className="p-3 border-b border-gray-200">
                          <div className="text-sm font-semibold text-gray-900">Submissions</div>
                          <div className="mt-1 text-xs text-gray-500">Select one to assess</div>
                        </div>

                        <div className="max-h-72 md:max-h-[calc(100dvh-520px)] overflow-auto">
                          {unassessed.map((a) => {
                            const active = a.attemptId === assessmentAttemptId;
                            const canCopy = Boolean(attemptCopyCache[a.attemptId]);
                            const copyBusy = copyBusyAttemptId === a.attemptId;
                            const copied = copiedAttemptId === a.attemptId;
                            return (
                              <div
                                key={a.attemptId}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  if (assessmentBusy || assessmentSubmitted || deleteBusy) return;
                                  setAssessmentAttemptId(a.attemptId);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key !== 'Enter' && e.key !== ' ') return;
                                  e.preventDefault();
                                  if (assessmentBusy || assessmentSubmitted || deleteBusy) return;
                                  setAssessmentAttemptId(a.attemptId);
                                }}
                                className={
                                  'w-full px-3 py-3 border-b border-gray-100 hover:bg-gray-50 disabled:opacity-60 ' +
                                  (active ? 'bg-purple-50' : 'bg-white')
                                }
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-gray-900">{formatDateTime(a.createdAtMillis)}</div>
                                    {a.promptTitle && <div className="mt-1 text-xs text-gray-600 truncate">{a.promptTitle}</div>}
                                    <div className="mt-1 text-[11px] text-gray-400 truncate">{a.attemptId}</div>
                                  </div>

                                  <div className="shrink-0 flex flex-col items-end gap-1">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void onCopyAttempt(a.attemptId);
                                      }}
                                      disabled={!canCopy || copyBusy || assessmentBusy || assessmentSubmitted || deleteBusy}
                                      title={
                                        canCopy
                                          ? copied
                                            ? 'Copied'
                                            : 'Copy story + answer JSON'
                                          : 'Select to load story + answer'
                                      }
                                      aria-label="Copy story and answer"
                                      className={
                                        'p-2 rounded-lg border text-gray-700 bg-white hover:bg-gray-50 ' +
                                        (canCopy ? 'border-gray-200' : 'border-gray-100 opacity-40 cursor-not-allowed')
                                      }
                                    >
                                      <svg
                                        className="w-4 h-4"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                      </svg>
                                    </button>

                                    {copied && <div className="text-[11px] font-semibold text-green-700">Copied</div>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0 space-y-4">
                        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                          <div className="p-3 border-b border-gray-200">
                            <div className="text-sm font-semibold text-gray-900">Submission preview</div>
                            <div className="mt-1 text-xs text-gray-500">Prompt + student answer</div>
                            {assessmentAttemptId && <div className="mt-1 text-xs text-gray-500">Attempt: {assessmentAttemptId}</div>}
                          </div>

                          <div className="p-3">
                            <div
                              ref={previewContainerRef}
                              className="w-full rounded-xl border border-gray-200 bg-gray-50 overflow-auto"
                              style={{ height: 'min(520px, calc(100dvh - 560px))', minHeight: 260 }}
                            >
                              <div className="min-w-0 flex justify-center p-3">
                                <canvas ref={previewCanvasRef} className="max-w-full" />
                              </div>
                            </div>
                            {(previewLoading || attemptsLoading) && <div className="mt-2 text-xs text-gray-500">Building preview…</div>}
                            {previewError && <div className="mt-2 text-xs text-red-700">{previewError}</div>}
                            {assessmentError && <div className="mt-2 text-xs text-red-700">{assessmentError}</div>}
                          </div>
                        </div>

                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <label className="block text-sm font-semibold text-gray-900">Teacher feedback</label>

                              <button
                                type="button"
                                onClick={() => void onCopyFeedbackPrompt()}
                                disabled={
                                  !assessmentAttemptId ||
                                  !attemptCopyCache[assessmentAttemptId] ||
                                  feedbackPromptCopyBusy ||
                                  assessmentBusy ||
                                  assessmentSubmitted ||
                                  deleteBusy
                                }
                                title={
                                  assessmentAttemptId && attemptCopyCache[assessmentAttemptId]
                                    ? 'Copy assessor prompt (story + answer)'
                                    : 'Select a submission to load story + answer'
                                }
                                aria-label="Copy assessor prompt"
                                className={
                                  'p-2 rounded-lg border bg-white text-gray-700 hover:bg-gray-50 ' +
                                  (assessmentAttemptId && attemptCopyCache[assessmentAttemptId]
                                    ? 'border-gray-200'
                                    : 'border-gray-100 opacity-40 cursor-not-allowed')
                                }
                              >
                                <svg
                                  className="w-4 h-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                              </button>

                              {feedbackPromptCopied && <div className="text-xs font-semibold text-green-700">Copied</div>}
                            </div>

                            <div className="inline-flex rounded-lg bg-gray-100 p-1">
                              <button
                                type="button"
                                onClick={() => setFeedbackMode('text')}
                                disabled={assessmentBusy || assessmentSubmitted || deleteBusy}
                                className={subTabButtonClass(feedbackMode === 'text')}
                              >
                                Non-json
                              </button>
                              <button
                                type="button"
                                onClick={() => setFeedbackMode('json')}
                                disabled={assessmentBusy || assessmentSubmitted || deleteBusy}
                                className={subTabButtonClass(feedbackMode === 'json')}
                              >
                                JSON
                              </button>
                            </div>
                          </div>

                          {feedbackMode === 'text' && (
                            <textarea
                              className="mt-2 w-full h-32 rounded-xl border border-gray-200 bg-white p-3 text-sm"
                              value={assessmentComment}
                              onChange={(e) => setAssessmentComment(e.target.value)}
                              disabled={!canAssess || assessmentBusy || assessmentSubmitted || deleteBusy}
                              placeholder="Write feedback…"
                            />
                          )}

                          {feedbackMode === 'json' && (
                            <>
                              <textarea
                                className="mt-2 w-full h-32 rounded-xl border border-gray-200 bg-white p-3 text-xs font-mono"
                                value={assessmentCommentJsonText}
                                onChange={(e) => setAssessmentCommentJsonText(e.target.value)}
                                disabled={!canAssess || assessmentBusy || assessmentSubmitted || deleteBusy}
                                placeholder='{"strengths": ["..."], "nextSteps": ["..."], "rubric": {"...": "..."}}'
                              />
                              {assessmentCommentJsonError && (
                                <div className="mt-2 text-xs text-red-700">{assessmentCommentJsonError}</div>
                              )}
                              {!assessmentCommentJsonError && (
                                <div className="mt-2 text-xs text-gray-500">Saved as structured JSON (plus a formatted JSON string for display).</div>
                              )}
                            </>
                          )}

                          <div className="mt-4">
                            <label className="block text-sm font-semibold text-gray-900">Score (%)</label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              className="mt-2 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm"
                              value={Number.isFinite(scorePercent) ? scorePercent : 0}
                              onChange={(e) => setScorePercent(Number(e.target.value))}
                              disabled={!canAssess || assessmentBusy || assessmentSubmitted || deleteBusy}
                            />
                          </div>

                          {deleteError && <div className="mt-3 text-sm text-red-700">{deleteError}</div>}
                          {assessmentSubmitted && (
                            <div className="mt-3 text-sm font-semibold text-green-700">Submitted. This assessment is now locked.</div>
                          )}

                          <div className="mt-4 flex items-center gap-3 flex-wrap">
                            <button
                              type="button"
                              onClick={() => void onSubmitAssessment()}
                              disabled={
                                !canAssess ||
                                assessmentBusy ||
                                assessmentSubmitted ||
                                deleteBusy ||
                                !assessmentAttemptId ||
                                (feedbackMode === 'json' && Boolean(assessmentCommentJsonError))
                              }
                              className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 text-sm font-semibold"
                            >
                              {assessmentBusy ? 'Submitting…' : 'Submit'}
                            </button>

                            <button
                              type="button"
                              onClick={() => void onDeleteSelected()}
                              disabled={!canAssess || !assessmentAttemptId || assessmentBusy || assessmentSubmitted || deleteBusy}
                              className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 text-sm font-semibold"
                            >
                              {deleteBusy ? 'Deleting…' : 'Delete submission'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
