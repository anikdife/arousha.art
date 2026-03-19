import { PDFDocument, rgb, PDFPage, PDFFont } from 'pdf-lib';
import { evaluateMultiplicationAnswer, formatMultiplicationPrompt, MultiplicationProblem } from './generators/multiplicationGenerator';
import {
  applyNumeracyContentTheme,
  drawNumeracyCoverPage,
  formatDateLine as themeFormatDateLine,
  loadNumeracyThemeAssets,
  loadNumeracyThemeFonts,
} from './pdf/y3NumeracyTheme';

type MultiplicationSession = {
  topic?: string;
  submittedAt?: string;
  createdAt?: string;
  score?: { correct: number; total: number; percentage: number };
  pages?: Array<{
    pageId: string;
    problems: MultiplicationProblem[];
    userAnswers?: Record<string, string>;
  }>;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

const MARGINS = {
  top: 60,
  bottom: 60,
  left: 50,
  right: 50,
};

function safeText(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

function formatDate(isoOrAny: unknown): string {
  return themeFormatDateLine(safeText(isoOrAny));
}

function drawCoverPage(params: {
  page: PDFPage;
  title: string;
  studentName: string;
  dateLine: string;
  marksLine: string;
  sessionId?: string;
  font: PDFFont;
  fontBold: PDFFont;
  logoImage: any | null;
}): void {
  drawNumeracyCoverPage({
    ...params,
    sectionLabel: 'YEAR 3 • NUMERACY',
    margins: MARGINS,
  });
}

export async function buildMultiplicationPdf(params: {
  title: string;
  session: MultiplicationSession;
  createdAtIso?: string;
  studentName?: string;
  score?: { correct: number; total: number; percentage: number };
  sessionId?: string;
}): Promise<Uint8Array> {
  const { title, session } = params;

  const pdfDoc = await PDFDocument.create();
  const { regular: font, bold } = await loadNumeracyThemeFonts(pdfDoc);
  const themeAssets = await loadNumeracyThemeAssets(pdfDoc);
  const logoImage = themeAssets.logoImage;
  const lineH = 16;

  const pages = session.pages ?? [];
  const createdAtIso = params.createdAtIso ?? session.submittedAt ?? session.createdAt;
  const dateLine = createdAtIso ? formatDate(createdAtIso) : '';
  const score = params.score ?? session.score;
  const marksLine = score && Number.isFinite(score.total) && score.total > 0 ? `${score.correct} / ${score.total} (${score.percentage}%)` : '';
  const studentName = String(params.studentName ?? 'Student');

  // Cover page (no Q/A content)
  {
    const cover = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawCoverPage({
      page: cover,
      title,
      studentName,
      dateLine,
      marksLine,
      sessionId: params.sessionId,
      font,
      fontBold: bold,
      logoImage,
    });
  }

  // Content pages
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  applyNumeracyContentTheme(page, themeAssets, MARGINS);
  let cursorY = PAGE_HEIGHT - MARGINS.top;

  const newPage = () => {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    applyNumeracyContentTheme(page, themeAssets, MARGINS);
    cursorY = PAGE_HEIGHT - MARGINS.top;
  };

  const drawLineText = (text: string, opts?: { bold?: boolean; size?: number; color?: { r: number; g: number; b: number } }) => {
    const size = opts?.size ?? 11;
    const usedFont = opts?.bold ? bold : font;
    const c = opts?.color ?? { r: 0.15, g: 0.15, b: 0.15 };

    if (cursorY < MARGINS.bottom + 3 * lineH) newPage();

    page.drawText(text, {
      x: MARGINS.left,
      y: cursorY,
      size,
      font: usedFont,
      color: rgb(c.r, c.g, c.b),
    });
    cursorY -= lineH;
  };

  const drawWrapped = (label: string) => {
    const maxWidth = PAGE_WIDTH - MARGINS.left - MARGINS.right;
    const size = 11;
    const words = label.split(/\s+/g);
    let line = '';

    const flush = (l: string) => drawLineText(l, { size });

    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      const width = font.widthOfTextAtSize(next, size);
      if (width > maxWidth && line) {
        flush(line);
        line = w;
      } else {
        line = next;
      }
    }
    if (line) flush(line);
  };

  let qNumber = 1;
  for (const p of pages) {
    drawLineText(`Page: ${p.pageId}`, { bold: true, size: 13, color: { r: 0.2, g: 0.1, b: 0.4 } });
    cursorY -= 6;

    for (const prob of p.problems) {
      const prompt = formatMultiplicationPrompt(prob);
      const userAnswer = p.userAnswers?.[prob.id] ?? '';
      const grade = evaluateMultiplicationAnswer(prob, userAnswer);

      drawLineText(`Q${qNumber}.`, { bold: true });
      drawWrapped(prompt);

      const mark = grade.ok ? 'OK' : 'X';
      const answerLine = `Answer: ${userAnswer || '(blank)'}   Expected: ${grade.expected}   ${mark}`;
      drawLineText(answerLine, { color: grade.ok ? { r: 0.1, g: 0.5, b: 0.2 } : { r: 0.75, g: 0.1, b: 0.1 } });

      cursorY -= 6;
      qNumber += 1;
    }

    cursorY -= 10;
  }

  return await pdfDoc.save();
}
