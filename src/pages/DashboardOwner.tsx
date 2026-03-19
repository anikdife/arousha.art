import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ref, uploadString, getBytes } from 'firebase/storage';
import { useAuth } from '../auth/AuthProvider';
import { storage } from '../firebase/firebase';
import { isProjectOwner } from '../lib/isProjectOwner';
import rawLcBankData from '../lib/languageConventions/bank.data.json';
import { LC_BANK_STORAGE_PATH } from '../lib/languageConventions/bankStorage';

function asPrettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

function decodeUtf8(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder('utf-8').decode(view);
  } catch {
    // Old browsers fallback
    let out = '';
    for (let i = 0; i < view.length; i++) out += String.fromCharCode(view[i]);
    return out;
  }
}

export const DashboardOwner: React.FC = () => {
  const { currentUser, userProfile } = useAuth();

  const isOwner = useMemo(() => isProjectOwner(currentUser, userProfile), [currentUser, userProfile]);

  const [activeTab, setActiveTab] = useState<'lcBank' | 'instruction'>('lcBank');

  const bundledJson = useMemo(() => asPrettyJson(rawLcBankData), []);
  const [text, setText] = useState<string>(bundledJson);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const instructionText = useMemo(
    () =>
      `You are an assessment content generator specialising in Australian NAPLAN tests.

TASK
Generate a complete question bank for:
- Year Level: Year 3
- Test Section: LANGUAGE CONVENTIONS
- Curriculum: Australian NAPLAN style (2012–2019)
- Difficulty: Year 3 appropriate (simple vocabulary, short sentences, concrete contexts)

DO NOT explain your reasoning.
DO NOT include answers outside the structured fields.
DO NOT invent advanced grammar beyond Year 3.

STRICT OUTPUT FORMAT
Return a single TypeScript-compatible array named LANGUAGE_CONVENTIONS_BANK.
Each item MUST conform exactly to ONE of the following schemas.

────────────────────────────────────────
QUESTION TYPES (ONLY THESE)
────────────────────────────────────────

A) SPELLING – Correct the spelling
{
  id: string,
  type: "spell",
  skill: "spelling",
  prompt: "Write the correct spelling.",
  sentenceWithError: string,
  errorToken: string,
  correctToken: string
}

B) SPELLING – Select incorrect word
{
  id: string,
  type: "selectIncorrect",
  skill: "spelling",
  prompt: "Shade the incorrect word.",
  sentence: string,
  tokens: string[],
  incorrectIndex: number,
  correctToken: string
}

C) MULTIPLE CHOICE (Grammar / Punctuation / Capitalisation / Sentence / Word Choice)
{
  id: string,
  type: "mcq",
  skill: "grammar" | "punctuation" | "capitalisation" | "sentence" | "wordChoice",
  prompt: string,
  sentence?: string,
  choices: [string, string, string, string],
  correctIndex: number
}

────────────────────────────────────────
CONTENT RULES (MANDATORY)
────────────────────────────────────────

1. QUESTION MIX (approximate balance):
- 40% spelling (split between A and B)
- 25% grammar & word choice
- 15% punctuation
- 10% capital letters
- 10% sentence structure

2. SPELLING RULES:
- Use common Year 3 vocabulary only
- One error per sentence
- Errors must reflect realistic child mistakes:
  - double letters (cupp, buss)
  - phonetic spelling (sed, bloo, chanse)
  - suffix errors (playes, lookt)
- Never use absurd wording (e.g. “pencils were eaten”)

3. GRAMMAR & PUNCTUATION:
- Focus on:
  - pronouns (we/us/they)
  - prepositions (to, on, in)
  - verb tense (past vs present)
  - full stops, question marks
  - capital letters for days, names
- Exactly ONE correct answer per MCQ
- Distractors must be plausible but clearly incorrect

4. SENTENCE STRUCTURE:
- Identify complete sentences
- Avoid compound or complex clauses
- Keep sentence length short (≤ 10 words where possible)

5. LANGUAGE STYLE:
- Australian English spelling
- Child-friendly, everyday contexts:
  - school, family, animals, food, sport, weather
- No slang, no idioms, no advanced grammar terms

6. IDs:
- Use sequential stable IDs: lc-q001, lc-q002, …
- Do NOT skip numbers

7. OUTPUT SIZE:
- Generate 40–50 questions total
- Return ONLY the array definition
- No markdown, no commentary, no headings

────────────────────────────────────────
EXAMPLE STYLE (DO NOT COPY EXACTLY)
Sentence: "I go to school on a buss."
Correct: bus

Sentence: "On thursday we went to the park."
Correct: Thursday

────────────────────────────────────────
FINAL OUTPUT
────────────────────────────────────────
Return ONLY valid TypeScript code:

export const LANGUAGE_CONVENTIONS_BANK = [ ... ];

Do not include imports or exports other than the constant itself.
`,
    []
  );

  const storagePath = useMemo(() => {
    if (!currentUser) return '';
    return LC_BANK_STORAGE_PATH;
  }, [currentUser]);

  const validateJson = (s: string): { ok: true } | { ok: false; message: string } => {
    try {
      const parsed = JSON.parse(s);
      if (!Array.isArray(parsed)) return { ok: false, message: 'JSON must be an array of questions.' };
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: `Invalid JSON: ${String(e?.message ?? e)}` };
    }
  };

  const loadFromStorage = async () => {
    if (!currentUser || !storagePath) return;

    setBusy(true);
    setStatus(null);
    setError(null);

    try {
      const bytes = await getBytes(ref(storage, storagePath));
      const s = decodeUtf8(bytes);
      setText(s);
      setStatus(`Loaded from Storage: ${storagePath}`);
    } catch (e) {
      console.error('Failed to load bank from Storage:', e);
      setError('Failed to load from Storage. (File may not exist yet.)');
    } finally {
      setBusy(false);
    }
  };

  const uploadToStorage = async () => {
    if (!currentUser || !storagePath) return;

    const v = validateJson(text);
    if (!v.ok) {
      setError(v.message);
      return;
    }

    setBusy(true);
    setStatus(null);
    setError(null);

    try {
      await uploadString(ref(storage, storagePath), text, 'raw', {
        contentType: 'application/json; charset=utf-8',
      });
      setStatus(`Uploaded to Storage: ${storagePath}`);
    } catch (e) {
      console.error('Failed to upload bank to Storage:', e);
      setError('Failed to upload to Storage. Check Storage rules/permissions.');
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
        <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-lg">
          <div className="text-lg font-semibold text-gray-900">Owner access required</div>
          <div className="text-sm text-gray-600 mt-2">This page is only available to the project owner.</div>
          <div className="mt-4">
            <Link to="/dashboard" className="text-blue-600 hover:text-blue-700">Back to Dashboard</Link>
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
            <h1 className="text-2xl font-bold text-gray-900">Owner Dashboard</h1>
            <div className="text-sm text-gray-600">Admin tools (Firestore/Storage)</div>
          </div>
          <Link to="/dashboard" className="px-3 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300">
            Back
          </Link>
        </div>

        <div className="mt-6">
          <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveTab('lcBank')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                activeTab === 'lcBank'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              aria-current={activeTab === 'lcBank' ? 'page' : undefined}
            >
              LC Bank
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('instruction')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                activeTab === 'instruction'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              aria-current={activeTab === 'instruction' ? 'page' : undefined}
            >
              Instruction
            </button>
          </div>
        </div>

        {activeTab === 'lcBank' ? (
          <>
            <div className="mt-6 bg-white border border-gray-200 rounded-xl p-6">
              <div className="text-lg font-semibold text-gray-900">Language Conventions Bank</div>
              <div className="text-sm text-gray-600 mt-1">
                Upload/download the question bank JSON to Firebase Storage.
              </div>

              <div className="mt-3 text-xs text-gray-500">
                Storage path: <span className="font-mono">{storagePath}</span>
              </div>

              {(status || error) && (
                <div
                  className={`mt-4 rounded-lg border p-3 text-sm ${
                    error
                      ? 'bg-red-50 border-red-200 text-red-800'
                      : 'bg-green-50 border-green-200 text-green-800'
                  }`}
                >
                  {error ?? status}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void loadFromStorage()}
                >
                  {busy ? 'Working…' : 'Load from Storage'}
                </button>

                <button
                  type="button"
                  className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-black disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void uploadToStorage()}
                >
                  {busy ? 'Working…' : 'Upload to Storage'}
                </button>

                <button
                  type="button"
                  className="px-3 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-300 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    setStatus('Loaded bundled bank.data.json into the editor.');
                    setText(bundledJson);
                  }}
                >
                  Use bundled file
                </button>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-semibold text-gray-700">Bank JSON</label>
                <textarea
                  className="mt-2 w-full h-[520px] font-mono text-xs px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={text}
                  onChange={(e) => {
                    setStatus(null);
                    setError(null);
                    setText(e.target.value);
                  }}
                  spellCheck={false}
                />
                <div className="mt-2 text-xs text-gray-500">Tip: paste/modify JSON here, then click Upload.</div>
              </div>
            </div>

            <div className="mt-6 bg-white border border-gray-200 rounded-xl p-6">
              <div className="text-lg font-semibold text-gray-900">Firestore/Storage Tools (coming soon)</div>
              <div className="text-sm text-gray-600 mt-1">
                This section will host owner-only admin actions (ACID-style workflows).
              </div>
            </div>
          </>
        ) : (
          <div className="mt-6 bg-white border border-gray-200 rounded-xl p-6">
            <div className="text-lg font-semibold text-gray-900">Instruction</div>
            <div className="text-sm text-gray-600 mt-1">Copy/paste this prompt into your content generator.</div>
            <pre className="mt-4 whitespace-pre-wrap text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg p-4 overflow-auto max-h-[70vh]">
              {instructionText}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
