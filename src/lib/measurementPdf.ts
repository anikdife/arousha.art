import { PDFDocument, rgb, PDFPage, PDFFont } from 'pdf-lib';
import {
  applyNumeracyContentTheme,
  drawNumeracyCoverPage,
  formatDateLine as themeFormatDateLine,
  loadNumeracyThemeAssets,
  loadNumeracyThemeFonts,
} from './pdf/y3NumeracyTheme';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

const MARGINS = {
  top: 60,
  bottom: 60,
  left: 50,
  right: 50,
};

type MeasurementPdfInput = {
  title: string;
  session: any;
  createdAtIso?: string;
  studentName?: string;
  score?: { correct: number; total: number; percentage: number };
  sessionId?: string;
};

function safeText(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

function formatDateLine(createdAtIso?: string): string {
  return themeFormatDateLine(createdAtIso);
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

function wrapLines(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const next = `${current} ${words[i]}`;
    const w = font.widthOfTextAtSize(next, fontSize);
    if (w <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = words[i];
    }
  }

  lines.push(current);
  return lines;
}

export async function buildMeasurementPdf(input: MeasurementPdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const { regular: font, bold: fontBold } = await loadNumeracyThemeFonts(pdfDoc);
  const themeAssets = await loadNumeracyThemeAssets(pdfDoc);
  const logoImage = themeAssets.logoImage;

  const createdAtIso = input.createdAtIso ?? safeText(input.session?.submittedAt ?? input.session?.createdAt);
  const dateLine = formatDateLine(createdAtIso);

  const score = input.score ?? input.session?.score;
  const marksLine =
    score && Number.isFinite(score.total) && score.total > 0
      ? `${score.correct} / ${score.total} (${score.percentage}%)`
      : '';

  const studentName = String(input.studentName ?? 'Student');

  // Cover page (no Q/A content)
  {
    const cover = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawCoverPage({
      page: cover,
      title: input.title,
      studentName,
      dateLine,
      marksLine,
      sessionId: input.sessionId,
      font,
      fontBold,
      logoImage,
    });
  }

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  applyNumeracyContentTheme(page, themeAssets, MARGINS);

  let cursorY = PAGE_HEIGHT - MARGINS.top;
  const lineH = 16;

  const newPage = () => {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    applyNumeracyContentTheme(page, themeAssets, MARGINS);
    cursorY = PAGE_HEIGHT - MARGINS.top;
  };

  const drawLineText = (text: string, opts?: { bold?: boolean; size?: number; color?: { r: number; g: number; b: number } }) => {
    const size = opts?.size ?? 11;
    const usedFont = opts?.bold ? fontBold : font;
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
    for (const line of wrapLines(label, font, size, maxWidth)) {
      drawLineText(line, { size });
    }
  };

  const pages = (input.session?.pages ?? []) as any[];
  let qNumber = 1;

  for (const p of pages) {
    const pageId = safeText(p?.pageId ?? p?.pageNo ?? '');
    drawLineText(`Page: ${pageId}`, { bold: true, size: 13, color: { r: 0.2, g: 0.1, b: 0.4 } });
    cursorY -= 6;

    const problems = (p?.problems ?? []) as any[];
    for (const prob of problems) {
      const prompt = safeText(prob?.prompt);
      const unitHint = safeText(prob?.meta?.unitHint);
      const expected = safeText(prob?.meta?.expected);
      const userAnswer = safeText(p?.userAnswers?.[prob?.id] ?? '');

      const ok = userAnswer !== '' && userAnswer === expected;
      const mark = ok ? 'OK' : 'X';

      drawLineText(`Q${qNumber}.`, { bold: true });
      drawWrapped(prompt);
      if (unitHint) {
        drawLineText(`Unit: ${unitHint}`, { size: 10, color: { r: 0.35, g: 0.35, b: 0.35 } });
      }

      const answerLine = `Answer: ${userAnswer || '(blank)'}   Expected: ${expected}   ${mark}`;
      drawLineText(answerLine, { color: ok ? { r: 0.1, g: 0.5, b: 0.2 } : { r: 0.75, g: 0.1, b: 0.1 } });

      cursorY -= 6;
      qNumber += 1;
    }

    cursorY -= 10;
  }

  return await pdfDoc.save();
}
