import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

type TabKey = 'bank' | 'instruction';

export const OwnerBanksY3ReadingMagazine: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('bank');

  const instructionText = useMemo(
    () =>
      `You are an Australian primary-literacy content writer.

TASK
Generate original reading texts suitable for:
- Year level: Year 3
- Assessment style: NAPLAN Reading Magazine
- Audience: 8–9 year old students
- Language: Australian English

IMPORTANT
- Generate READING TEXTS ONLY.
- Do NOT generate questions.
- Do NOT generate answers.
- Do NOT generate PDFs or page layout.
- Do NOT copy or paraphrase real NAPLAN texts.
- Text must be fully original.

────────────────────────────────────────
TEXT TYPES TO GENERATE (ONE OF THESE)
────────────────────────────────────────

Choose ONE text type at a time (randomly or as instructed):

1) Narrative (short story)
2) Informative report (animals, materials, places, nature)
3) Personal letter or email
4) Informative article with headings
5) Imaginative story with light fantasy

────────────────────────────────────────
DIFFICULTY CONSTRAINTS (STRICT)
────────────────────────────────────────

- Sentence length: maximum 12 words
- Paragraph length: 2–5 sentences
- Total word count:
  - Narrative: 180–300 words
  - Informative text: 150–280 words
  - Letter/email: 120–200 words
- Vocabulary:
  - Use common, concrete words
  - Avoid abstract nouns (e.g. freedom, responsibility)
  - Avoid idioms and figurative expressions
- Grammar:
  - Mostly simple and compound sentences
  - Avoid subordinate clauses
  - Avoid passive voice
- Tone:
  - Clear, friendly, neutral
  - No sarcasm
  - No complex emotions

────────────────────────────────────────
CONTENT RULES (MANDATORY)
────────────────────────────────────────

- Contexts must be familiar to Year 3 children:
  - school
  - family
  - animals
  - food
  - nature
  - hobbies
  - sports
- Avoid:
  - danger, violence, fear
  - adult themes
  - commercial brands
- If informative:
  - Explain facts clearly
  - Use headings if appropriate
  - Include simple explanations of new words
- If narrative:
  - Clear beginning, middle, end
  - One main character
  - One main event

────────────────────────────────────────
OUTPUT FORMAT (STRICT)
────────────────────────────────────────

Return ONLY valid JSON.

Use this exact schema:

{
  "id": "read-src-001",
  "year": 3,
  "type": "narrative" | "informative" | "letter" | "article" | "fantasy",
  "title": "string",
  "wordCount": number,
  "text": "string",
  "headings": [
    { "heading": "string", "text": "string" }
  ],
  "captions": [
    { "caption": "string" }
  ]
}

RULES:
- For narratives and letters:
  - headings MUST be an empty array
- For informative articles:
  - headings MUST be used
- captions:
  - May be empty
  - If included, must describe a helpful image (animal, object, place)
- text must NOT include bullet points or numbering
- text must be plain paragraphs separated by line breaks

────────────────────────────────────────
QUALITY CHECK (DO BEFORE OUTPUT)
────────────────────────────────────────

Before returning:
- Confirm reading level is Year 3
- Confirm sentence length limits are met
- Confirm vocabulary is child-appropriate
- Confirm content is original
- Confirm JSON is valid

────────────────────────────────────────
FINAL OUTPUT
────────────────────────────────────────

Return ONLY the JSON object.
No markdown.
No explanations.
No extra text.
`,
    []
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Owner • Reading Magazine</h1>
            <div className="text-sm text-gray-600">Year 3 bank editor (UI only)</div>
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
              onClick={() => setActiveTab('bank')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                activeTab === 'bank' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Reading Magazine
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
            <div className="text-sm text-gray-600 mt-1">UI only (no functionality yet).</div>
            <pre className="mt-4 whitespace-pre-wrap text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg p-4 overflow-auto max-h-[70vh]">
              {instructionText}
            </pre>
          </div>
        ) : (
          <div className="mt-6 bg-white border border-gray-200 rounded-xl p-6">
            <div className="text-lg font-semibold text-gray-900">Reading Magazine</div>
            <div className="text-sm text-gray-600 mt-1">UI only (no functionality yet).</div>
          </div>
        )}
      </div>
    </div>
  );
};
