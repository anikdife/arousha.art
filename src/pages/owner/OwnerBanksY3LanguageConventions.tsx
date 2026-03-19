import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import type { LCQuestion } from '../../lib/languageConventions/types';
import {
  addLanguageConventionsBank,
  getLanguageConventionsBankPaths,
  invalidateLanguageConventionsBanksCache,
  loadLanguageConventionsBank,
  loadLanguageConventionsMeta,
  saveLanguageConventionsBank,
  saveLanguageConventionsMeta,
} from '../../lib/languageConventions/bankStorageService';
import { summarizeBank } from '../../lib/languageConventions/pageGenerator';

type TabKey = 'lcBank' | 'instruction';

function asPrettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

function parseQuestionsJson(text: string): { ok: true; questions: LCQuestion[] } | { ok: false; message: string } {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return { ok: false, message: 'JSON must be an array of questions.' };
    return { ok: true, questions: parsed as LCQuestion[] };
  } catch (e: any) {
    return { ok: false, message: `Invalid JSON: ${String(e?.message ?? e)}` };
  }
}

async function copyTextToClipboard(text: string): Promise<void> {
  const safe = String(text ?? '');

  // Preferred modern API.
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(safe);
    return;
  }

  // Fallback for older browsers / non-secure contexts.
  if (typeof document === 'undefined') throw new Error('Clipboard unavailable');

  const ta = document.createElement('textarea');
  ta.value = safe;
  ta.setAttribute('readonly', 'true');
  ta.style.position = 'fixed';
  ta.style.top = '-9999px';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);

  try {
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    if (!ok) throw new Error('Copy command failed');
  } finally {
    document.body.removeChild(ta);
  }
}

export const OwnerBanksY3LanguageConventions: React.FC = () => {
  const { currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<TabKey>('lcBank');
  const [loading, setLoading] = useState(true);
  const [bundleVersion, setBundleVersion] = useState<number>(1);
  const [bankCount, setBankCount] = useState<number>(3);
  const [bankIndex, setBankIndex] = useState<number>(1);
  const [text, setText] = useState('[]');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  const paths = useMemo(() => getLanguageConventionsBankPaths(), []);

  const [summary, setSummary] = useState<ReturnType<typeof summarizeBank> | null>(null);

  const load = async () => {
    setLoading(true);
    setStatus(null);
    setError(null);
    try {
      const meta = await loadLanguageConventionsMeta();
      setBundleVersion(meta.version);
      setBankCount(meta.bankCount);

      const resolvedBankIndex = Math.min(Math.max(1, bankIndex), meta.bankCount);
      if (resolvedBankIndex !== bankIndex) setBankIndex(resolvedBankIndex);

      const bank = await loadLanguageConventionsBank(resolvedBankIndex);
      const questions = bank.questions;
      setText(asPrettyJson(questions));
      setSummary(summarizeBank(questions));
      setStatus(`Loaded bank ${resolvedBankIndex}. Version: ${meta.version}`);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      // If the object doesn't exist yet, keep the editor usable so the owner can paste JSON and Save to create it.
      if (msg.toLowerCase().includes('missing file in firebase storage')) {
        setText('[]');
        setSummary(null);
        setError(msg);
        setStatus('This bank file does not exist yet. Paste JSON and click Save to create it.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankIndex]);

  const save = async (bumpVersion: boolean) => {
    setStatus(null);
    setError(null);
    if (!currentUser) return;

    const parsed = parseQuestionsJson(text);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }

    setLoading(true);
    try {
      await saveLanguageConventionsBank(bankIndex, parsed.questions);

      if (bumpVersion) {
        const nextVersion = bundleVersion + 1;
        await saveLanguageConventionsMeta({
          version: nextVersion,
          updatedAt: new Date().toISOString(),
          updatedByUid: currentUser.uid,
        });
        setBundleVersion(nextVersion);
      }

      invalidateLanguageConventionsBanksCache();
      await load();
      setStatus(bumpVersion ? `Saved bank ${bankIndex} and bumped version.` : `Saved bank ${bankIndex}.`);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  const addBank = async () => {
    setStatus(null);
    setError(null);
    if (!currentUser) return;

    setLoading(true);
    try {
      const res = await addLanguageConventionsBank({
        updatedAt: new Date().toISOString(),
        updatedByUid: currentUser.uid,
      });
      setBankCount(res.bankCount);
      setBankIndex(res.newBankIndex);
      setStatus(`Added bank ${res.newBankIndex}.`);
      await load();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Owner • LC Banks</h1>
            <div className="text-sm text-gray-600">adminBanks/y3/language-conventions</div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/owner" className="px-3 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300">
              Back
            </Link>
          </div>
        </div>

        <div className="mt-6">
          <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveTab('lcBank')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                activeTab === 'lcBank' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              LC Bank
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('instruction')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                activeTab === 'instruction' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Instruction
            </button>
          </div>
        </div>

        {activeTab === 'instruction' ? (
          <div className="mt-6 bg-white border border-gray-200 rounded-xl p-6">
            <div className="text-lg font-semibold text-gray-900">Instruction</div>
            <div className="text-sm text-gray-600 mt-1">Copy/paste this prompt into your content generator.</div>
            <pre className="mt-4 whitespace-pre-wrap text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg p-4 overflow-auto max-h-[70vh]">
              {instructionText}
            </pre>
          </div>
        ) : (
          <>
            <div className="mt-6 bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-gray-900">Year 3 • Language Conventions</div>
                  <div className="text-xs text-gray-500 mt-1">Meta version: {bundleVersion}</div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    className="px-3 py-2 rounded-lg border border-gray-300 text-sm"
                    value={bankIndex}
                    onChange={(e) => setBankIndex(Number(e.target.value))}
                    disabled={loading}
                  >
                    {Array.from({ length: Math.max(1, bankCount) }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        Bank {n}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                    disabled={loading || !currentUser}
                    onClick={() => void addBank()}
                    title="Create a new empty bank file and add it to meta"
                  >
                    Add bank
                  </button>

                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-300 disabled:opacity-50"
                    disabled={loading}
                    onClick={() => void load()}
                  >
                    Reload
                  </button>
                </div>
              </div>

              <div className="mt-4 text-xs text-gray-500 space-y-1">
                <div>Bank path: <span className="font-mono">{paths.bankPath(bankIndex)}</span></div>
                <div>Meta path: <span className="font-mono">{paths.meta}</span></div>
              </div>

              {(status || error) && (
                <div
                  className={`mt-4 rounded-lg border p-3 text-sm ${
                    error ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'
                  }`}
                >
                  {error ?? status}
                </div>
              )}

              {summary && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="text-sm font-semibold text-gray-900">Counts by type</div>
                    <div className="mt-2 text-xs font-mono text-gray-700 whitespace-pre-wrap">
                      {asPrettyJson(summary.byType)}
                    </div>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="text-sm font-semibold text-gray-900">Counts by skill</div>
                    <div className="mt-2 text-xs font-mono text-gray-700 whitespace-pre-wrap">
                      {asPrettyJson(summary.bySkill)}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-6">
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-sm font-semibold text-gray-700">Bank JSON (array of questions)</label>
                  <button
                    type="button"
                    className={
                      copied
                        ? 'inline-flex items-center justify-center w-9 h-9 rounded-lg bg-green-50 border border-green-200 text-green-700'
                        : 'inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100'
                    }
                    title={copied ? 'Copied' : 'Copy JSON to clipboard'}
                    aria-label="Copy bank JSON to clipboard"
                    onClick={() => {
                      setCopied(false);
                      void copyTextToClipboard(text)
                        .then(() => {
                          setCopied(true);
                          window.setTimeout(() => setCopied(false), 1200);
                        })
                        .catch((e) => {
                          console.error('Failed to copy JSON:', e);
                          setStatus('Failed to copy to clipboard');
                        });
                    }}
                  >
                    {copied ? (
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5" aria-hidden="true">
                        <path
                          fillRule="evenodd"
                          d="M16.704 5.293a1 1 0 010 1.414l-7.5 7.5a1 1 0 01-1.414 0l-3.5-3.5a1 1 0 011.414-1.414l2.793 2.793 6.793-6.793a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5" aria-hidden="true">
                        <path d="M6 2a2 2 0 00-2 2v9a2 2 0 002 2h6a2 2 0 002-2V7.414A2 2 0 0013.414 6L11 3.586A2 2 0 009.586 3H6z" />
                        <path d="M4 6a2 2 0 00-2 2v8a2 2 0 002 2h7a2 2 0 002-2v-1h-2v1H4V8h1V6H4z" />
                      </svg>
                    )}
                  </button>
                </div>
                <textarea
                  className="mt-2 w-full h-[520px] font-mono text-xs px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={text}
                  onChange={(e) => {
                    setStatus(null);
                    setError(null);
                    setCopied(false);
                    setText(e.target.value);
                    const parsed = parseQuestionsJson(e.target.value);
                    if (parsed.ok) setSummary(summarizeBank(parsed.questions));
                  }}
                  spellCheck={false}
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-black disabled:opacity-50"
                  disabled={loading}
                  onClick={() => void save(false)}
                >
                  Save bank {bankIndex}
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                  disabled={loading}
                  onClick={() => void save(true)}
                >
                  Save + bump version
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
