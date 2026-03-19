import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDownloadURL, ref, uploadBytes, uploadString } from 'firebase/storage';
import { useAuth } from '../../auth/AuthProvider';
import { storage } from '../../firebase/firebase';
import { isProjectOwner } from '../../lib/isProjectOwner';
import {
  WRITING_Y3_INDEX_PATH,
  type WritingIndexItemY3,
  type WritingIndexY3,
  type WritingPromptType,
} from '../../lib/writing/storageIndex';
import { validateWritingPromptY3 } from '../../lib/writing/promptLoader';

const PROMPTS_FOLDER = 'writingPrompts/y3/prompts';
const IMAGES_FOLDER = 'writingPrompts/y3/images';

const INFO_TEXT = `You are an expert Australian primary literacy assessor creating a Year 3 NAPLAN Writing stimulus.

TASK
Generate ONE complete writing prompt and output it as VALID JSON ONLY.
Do NOT include explanations, markdown, comments, or formatting outside JSON.

WRITING TYPE
Choose ONE writing type only:
- persuasive
- narrative
- imaginative

DIFFICULTY & STANDARD (STRICT)
- Year level: Year 3 (Australia)
- Vocabulary suitable for ages 7–9
- Simple sentence structures
- Familiar contexts (school, family, imagination, everyday life)
- Tone must match official ACARA NAPLAN writing prompts
- No advanced abstract concepts
- No example answers

JSON SCHEMA (MUST MATCH EXACTLY)

{
  "promptId": "string (unique, lowercase, hyphenated, starts with wp-y3-)",
  "year": 3,
  "type": "persuasive | narrative | imaginative",
  "title": "short clear title",
  "taskIntro": "1–3 short paragraphs explaining the situation or idea",
  "taskStatement": "One clear sentence telling the student what to write",
  "guidance": [
    "3 to 6 bullet-style instructions written as full sentences"
  ],
  "remember": [
    "4 to 7 reminders written in lower case, no punctuation at end"
  ],
  "version": 1
}

CONTENT RULES (STRICT)
- No markdown symbols (**, •, etc.)
- No line breaks inside arrays
- taskIntro may contain paragraph breaks using \\n\\n only
- guidance bullets must begin with a verb (Start, Give, Explain, Finish, etc.)
- remember bullets must match official NAPLAN tone
- Do NOT mention the word “NAPLAN” inside the content

VALIDATION RULES
- guidance array length: 3–6
- remember array length: 4–7
- year must be exactly 3
- version must be 1
- Output must be parseable JSON

FINAL OUTPUT RULE
Return ONLY the JSON object. No extra text before or after.`;

function safeParseJson(text: string): { ok: true; value: any } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

function fileExtLower(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx < 0) return '';
  return name.slice(idx + 1).toLowerCase();
}

function normalizeImageExt(ext: string): 'webp' | 'png' | 'jpg' {
  if (ext === 'webp') return 'webp';
  if (ext === 'png') return 'png';
  return 'jpg';
}

async function writeClipboardText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
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

function buildPromptJsonPath(promptId: string): string {
  return `${PROMPTS_FOLDER}/${promptId}.json`;
}

function buildPromptImagePath(promptId: string, ext: 'webp' | 'png' | 'jpg'): string {
  return `${IMAGES_FOLDER}/${promptId}.${ext}`;
}

async function loadIndex(): Promise<WritingIndexY3> {
  try {
    const url = await getDownloadURL(ref(storage, WRITING_Y3_INDEX_PATH));
    const res = await fetch(url);
    const text = await res.text();
    const parsed = JSON.parse(text) as WritingIndexY3;
    return {
      version: typeof (parsed as any)?.version === 'number' ? (parsed as any).version : 1,
      updatedAt: typeof (parsed as any)?.updatedAt === 'string' ? (parsed as any).updatedAt : new Date().toISOString(),
      items: Array.isArray((parsed as any)?.items) ? ((parsed as any).items as any[]) : [],
    };
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), items: [] };
  }
}

function upsertIndexItem(index: WritingIndexY3, item: WritingIndexItemY3): WritingIndexY3 {
  const list = Array.isArray(index.items) ? (index.items as WritingIndexItemY3[]) : [];
  const without = list.filter((it) => it.promptId !== item.promptId);
  return {
    version: (index.version ?? 1) + 1,
    updatedAt: new Date().toISOString(),
    items: [item, ...without],
  };
}

export const WritingPromptsDashboard: React.FC = () => {
  const { currentUser, userProfile } = useAuth();

  const isOwner = useMemo(() => isProjectOwner(currentUser, userProfile), [currentUser, userProfile]);

  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [jsonText, setJsonText] = useState<string>('');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [validatedPrompt, setValidatedPrompt] = useState<null | {
    promptId: string;
    title: string;
    type: WritingPromptType;
  }>(null);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [index, setIndex] = useState<WritingIndexY3 | null>(null);
  const [indexLoading, setIndexLoading] = useState(false);

  const [tab, setTab] = useState<'upload' | 'info'>('upload');

  const [copyInfoBusy, setCopyInfoBusy] = useState(false);
  const [infoCopied, setInfoCopied] = useState(false);

  const onCopyInfo = async () => {
    if (copyInfoBusy) return;
    setCopyInfoBusy(true);
    try {
      await writeClipboardText(INFO_TEXT);
      setInfoCopied(true);
      window.setTimeout(() => setInfoCopied(false), 1200);
    } finally {
      setCopyInfoBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!currentUser || !isOwner) return;
      setIndexLoading(true);
      try {
        const idx = await loadIndex();
        if (!cancelled) setIndex(idx);
      } finally {
        if (!cancelled) setIndexLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [currentUser, isOwner]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setPreviewError(null);
      setValidatedPrompt(null);

      if (!jsonFile) return;

      try {
        const text = await jsonFile.text();
        if (cancelled) return;
        setJsonText(text);
      } catch (e: any) {
        setPreviewError(String(e?.message ?? 'Failed to read JSON file'));
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [jsonFile]);

  useEffect(() => {
    // Validate JSON text whenever it changes (supports paste/type workflows)
    setPreviewError(null);
    setValidatedPrompt(null);

    const text = (jsonText ?? '').trim();
    if (!text) return;

    const parsed = safeParseJson(text);
    if (!parsed.ok) {
      setPreviewError(`Invalid JSON: ${parsed.error}`);
      return;
    }

    const validated = validateWritingPromptY3(parsed.value);
    if (!validated.ok) {
      setPreviewError(validated.error);
      return;
    }

    // If a JSON file is provided, enforce filename promptId match.
    if (jsonFile) {
      const ext = fileExtLower(jsonFile.name);
      const base = ext ? jsonFile.name.slice(0, -(ext.length + 1)) : jsonFile.name;
      if (base !== validated.prompt.promptId) {
        setPreviewError('promptId must match the JSON filename (without extension).');
        return;
      }
    }

    setValidatedPrompt({
      promptId: validated.prompt.promptId,
      title: validated.prompt.title,
      type: validated.prompt.type,
    });
  }, [jsonFile, jsonText]);

  const canUpload = Boolean(currentUser && isOwner && validatedPrompt && imageFile && !busy);

  const onUpload = async () => {
    if (!currentUser || !isOwner || !validatedPrompt || !imageFile) return;

    setBusy(true);
    setStatus(null);
    setError(null);

    try {
      const promptId = validatedPrompt.promptId;

      const rawImageExt = fileExtLower(imageFile.name);
      if (rawImageExt !== 'webp' && rawImageExt !== 'png' && rawImageExt !== 'jpg' && rawImageExt !== 'jpeg') {
        throw new Error('Image must be .webp, .png, .jpg, or .jpeg');
      }
      const imageExt = normalizeImageExt(rawImageExt);

      const jsonPath = buildPromptJsonPath(promptId);
      const imagePath = buildPromptImagePath(promptId, imageExt);

      // Validate JSON content again right before upload
      const parsed = safeParseJson(jsonText);
      if (!parsed.ok) throw new Error(`Invalid JSON: ${parsed.error}`);
      const validated = validateWritingPromptY3(parsed.value);
      if (!validated.ok) throw new Error(validated.error);
      if (validated.prompt.promptId !== promptId) throw new Error('promptId mismatch');

      if (jsonFile) {
        const ext = fileExtLower(jsonFile.name);
        const base = ext ? jsonFile.name.slice(0, -(ext.length + 1)) : jsonFile.name;
        if (base !== promptId) throw new Error('promptId must match the JSON filename (without extension).');
      }

      // Upload prompt JSON
      await uploadString(ref(storage, jsonPath), JSON.stringify(validated.prompt, null, 2), 'raw', {
        contentType: 'application/json; charset=utf-8',
      });

      // Upload image
      await uploadBytes(ref(storage, imagePath), imageFile, {
        contentType: imageFile.type || (imageExt === 'png' ? 'image/png' : imageExt === 'webp' ? 'image/webp' : 'image/jpeg'),
      });

      // Update index.json
      const currentIndex = await loadIndex();
      const nextItem: WritingIndexItemY3 = {
        promptId,
        title: validated.prompt.title,
        type: validated.prompt.type,
        jsonPath,
        imagePath,
      };

      const nextIndex = upsertIndexItem(currentIndex, nextItem);
      await uploadString(ref(storage, WRITING_Y3_INDEX_PATH), JSON.stringify(nextIndex, null, 2), 'raw', {
        contentType: 'application/json; charset=utf-8',
      });

      setIndex(nextIndex);
      setStatus(`Uploaded prompt ${promptId} and updated index.json.`);
    } catch (e: any) {
      console.error('Failed to upload writing prompt:', e);
      setError(String(e?.message ?? 'Failed to upload'));
    } finally {
      setBusy(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white border border-gray-200 rounded-xl p-6">Please sign in.</div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="text-sm font-semibold text-gray-900">Not authorised</div>
          <div className="text-sm text-gray-600 mt-2">Owner access required.</div>
          <div className="mt-4">
            <Link to="/dashboard" className="px-3 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300">
              Back
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Owner • Writing Prompts (Year 3)</h1>
            <div className="text-sm text-gray-600">Upload prompt JSON + stimulus image to Firebase Storage.</div>
          </div>
          <Link to="/owner" className="px-3 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300">
            Back
          </Link>
        </div>

        <div className="mt-6">
          <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setTab('upload')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === 'upload' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Upload
            </button>
            <button
              type="button"
              onClick={() => setTab('info')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === 'info' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Info
            </button>
          </div>
        </div>

        {tab === 'info' && (
          <div className="mt-6 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">Information</div>
                <div className="text-xs text-gray-600 mt-1">Copy/paste this prompt into your generator.</div>
              </div>

              <div className="flex items-center gap-2">
                {infoCopied && <div className="text-xs font-semibold text-green-700">Copied</div>}
                <button
                  type="button"
                  onClick={() => void onCopyInfo()}
                  disabled={copyInfoBusy}
                  className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  title="Copy info text"
                  aria-label="Copy info text"
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
              </div>
            </div>
            <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-900">
              {INFO_TEXT}
            </pre>
          </div>
        )}

        {tab === 'upload' && (
          <>

            <div className="mt-6 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="text-sm font-semibold text-gray-900">Upload</div>
              <div className="text-xs text-gray-600 mt-1">Storage: {WRITING_Y3_INDEX_PATH}</div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-sm font-semibold text-gray-900">Prompt JSON</div>
              <div className="mt-2">
                <input
                  type="file"
                  accept="application/json"
                  onChange={(e) => setJsonFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm"
                />
              </div>

              <div className="mt-3">
                <label className="block text-xs font-semibold text-gray-700">Prompt JSON content</label>
                <textarea
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  rows={14}
                  className="mt-2 w-full rounded-lg border border-gray-200 bg-white p-3 text-xs font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Paste or type the prompt JSON here."
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setJsonFile(null);
                      setJsonText('');
                      setPreviewError(null);
                      setValidatedPrompt(null);
                    }}
                    className="px-3 py-2 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 text-xs font-semibold"
                  >
                    Clear
                  </button>
                </div>
              </div>
              {validatedPrompt && (
                <div className="mt-3 text-xs text-gray-600">
                  <div><span className="font-semibold">promptId:</span> {validatedPrompt.promptId}</div>
                  <div><span className="font-semibold">title:</span> {validatedPrompt.title}</div>
                  <div><span className="font-semibold">type:</span> {validatedPrompt.type}</div>
                </div>
              )}
              {previewError && <div className="mt-3 text-xs text-red-700">{previewError}</div>}
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-sm font-semibold text-gray-900">Stimulus Image</div>
              <div className="mt-2">
                <input
                  type="file"
                  accept="image/webp,image/png,image/jpeg"
                  onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm"
                />
              </div>
              <div className="mt-3 text-xs text-gray-600">Accepted: .webp, .png, .jpg/.jpeg</div>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void onUpload()}
              disabled={!canUpload}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 text-sm font-semibold"
            >
              {busy ? 'Uploading…' : 'Upload'}
            </button>

            {status && <div className="text-sm text-green-700">{status}</div>}
            {error && <div className="text-sm text-red-700">{error}</div>}
          </div>
            </div>

            <div className="mt-6 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="text-sm font-semibold text-gray-900">Index</div>
              <div className="text-xs text-gray-600 mt-1">Current published items from index.json</div>

          {indexLoading && <div className="mt-4 text-sm text-gray-600">Loading…</div>}

          {!indexLoading && index && (
            <div className="mt-4 space-y-2">
              <div className="text-xs text-gray-500">Version: {index.version} • Updated: {index.updatedAt}</div>
              {(index.items ?? []).length === 0 ? (
                <div className="text-sm text-gray-600">No prompts yet.</div>
              ) : (
                <div className="space-y-2">
                  {(index.items ?? []).slice(0, 20).map((it: any) => (
                    <div key={it.promptId} className="border border-gray-100 rounded-lg p-3">
                      <div className="text-sm font-semibold text-gray-900">{it.title}</div>
                      <div className="mt-1 text-xs text-gray-600">{it.promptId} • {it.type}</div>
                      <div className="mt-1 text-xs text-gray-500">{it.jsonPath}</div>
                      <div className="mt-1 text-xs text-gray-500">{it.imagePath}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
