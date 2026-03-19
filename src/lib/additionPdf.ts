// src/lib/additionPdf.ts

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib';
import {
  NUMERACY_DEFAULT_MARGINS as MARGINS,
  NUMERACY_PAGE_HEIGHT as PAGE_HEIGHT,
  NUMERACY_PAGE_WIDTH as PAGE_WIDTH,
  applyNumeracyContentTheme,
  drawGoldenPageBorder as themeDrawGoldenPageBorder,
  drawLogoWatermark as themeDrawLogoWatermark,
  drawNumeracyCoverPage,
  drawText as themeDrawText,
  formatDateLine as themeFormatDateLine,
  loadNumeracyThemeAssets,
  loadNumeracyThemeFonts,
} from './pdf/y3NumeracyTheme';

type AdditionPdfInput = {
  title: string;
  pages: any[];
  createdAtIso?: string;
  studentName?: string;
  score?: { correct: number; total: number; percentage: number };
  sessionId?: string;
};

const FIRST_PAGE_LOGO_RESERVED_HEIGHT = 90;
function drawLogoWatermark(page: PDFPage, logoImage: any): void {
  themeDrawLogoWatermark(page, logoImage, MARGINS);
}

function drawGoldenPageBorder(page: PDFPage): void {
  themeDrawGoldenPageBorder(page, PAGE_WIDTH, PAGE_HEIGHT);
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

function formatDateLine(createdAtIso?: string): string {
  return themeFormatDateLine(createdAtIso);
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
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

function ensureSpace(
  pdfDoc: PDFDocument,
  page: PDFPage,
  yCursor: number,
  needed: number,
  options: {
    isFirstPage: boolean;
    onNewPage?: (newPage: PDFPage) => void;
  }
): { page: PDFPage; y: number; isFirstPage: boolean } {
  const bottomLimit = options.isFirstPage ? MARGINS.bottom + FIRST_PAGE_LOGO_RESERVED_HEIGHT : MARGINS.bottom;
  if (yCursor - needed >= bottomLimit) return { page, y: yCursor, isFirstPage: options.isFirstPage };
  const next = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  options.onNewPage?.(next);
  return { page: next, y: PAGE_HEIGHT - MARGINS.top, isFirstPage: false };
}

function drawText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, color = rgb(0, 0, 0)) {
  themeDrawText(page, text, x, y, font, size, color);
}

function isWordProblem(p: any): boolean {
  return p?.kind === 'word-input' || p?.kind === 'word-mcq';
}

function expectedAnswer(p: any): number {
  if (isWordProblem(p)) return Number(p?.total ?? 0);
  return Number(p?.correctAnswer ?? 0);
}

function formatVerticalAddition(p: any): { top: string; bottom: string } | null {
  const operands = p?.operands;
  if (!operands || typeof operands !== 'object') return null;

  // Basic / mental-math: a + b
  if (operands.mode === 'basic' || operands.mode === 'mentalMath') {
    const a = operands.a;
    const b = operands.b;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return { top: String(a), bottom: `+ ${b}` };
  }

  // placeValue: H + T + O
  if (operands.mode === 'placeValue') {
    const parts = operands.parts;
    if (!Array.isArray(parts) || parts.length !== 3) return null;
    const [h, t, o] = parts;
    if (![h, t, o].every((n) => Number.isFinite(n))) return null;
    return { top: String(h + t), bottom: `+ ${o}` };
  }

  // missingAddend doesn't have a single a+b form.
  return null;
}

export async function buildAdditionPdf(input: AdditionPdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const firstPage = page;

  const { regular: font, bold: fontBold } = await loadNumeracyThemeFonts(pdfDoc);
  const mono = await pdfDoc.embedFont(StandardFonts.Courier);

  const themeAssets = await loadNumeracyThemeAssets(pdfDoc);
  const logoImage = themeAssets.logoImage;

  const contentWidth = PAGE_WIDTH - MARGINS.left - MARGINS.right;

  let y = PAGE_HEIGHT - MARGINS.top;

  const studentName = String(input.studentName ?? 'Student');
  const dateLine = formatDateLine(input.createdAtIso);
  const score = input.score;
  const marksLine = score && Number.isFinite(score.total) && score.total > 0
    ? `${score.correct} / ${score.total} (${score.percentage}%)`
    : '';

  // Cover page (no Q/A content)
  drawCoverPage({
    page: firstPage,
    title: input.title,
    studentName,
    dateLine,
    marksLine,
    sessionId: input.sessionId,
    font,
    fontBold,
    logoImage,
  });

  // Body starts on page 2 (cover page has no Q/A content)
  page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  applyNumeracyContentTheme(page, themeAssets, MARGINS);
  y = PAGE_HEIGHT - MARGINS.top;

  const pages = Array.isArray(input.pages) ? input.pages : [];
  let questionIndex = 1;

  let isFirstPage = false;
  const onNewContentPage = (newPage: PDFPage) => {
    if (logoImage) drawLogoWatermark(newPage, logoImage);
    drawGoldenPageBorder(newPage);
  };

  for (const sessionPage of pages) {
    const problems = Array.isArray(sessionPage?.problems) ? sessionPage.problems : [];
    const userAnswers: Record<string, string> = (sessionPage?.userAnswers && typeof sessionPage.userAnswers === 'object') ? sessionPage.userAnswers : {};
    const graded: Record<string, boolean> = (sessionPage?.graded && typeof sessionPage.graded === 'object') ? sessionPage.graded : {};

    for (const p of problems) {
      const id = String(p?.id ?? `q-${questionIndex}`);
      const prompt = String(p?.prompt ?? '');
      const expected = expectedAnswer(p);
      const rawUser = userAnswers[id] ?? '';
      const ok = graded[id] === true;

      const headerNeeded = 16;
      ({ page, y, isFirstPage } = ensureSpace(pdfDoc, page, y, headerNeeded, { isFirstPage, onNewPage: onNewContentPage }));

      drawText(page, `Q${questionIndex}.`, MARGINS.left, y, fontBold, 11, rgb(0.1, 0.1, 0.1));
      y -= 14;

      // Prompt lines
      const promptLines = wrapText(prompt, font, 11, contentWidth);
      for (const line of promptLines) {
        ({ page, y, isFirstPage } = ensureSpace(pdfDoc, page, y, 14, { isFirstPage, onNewPage: onNewContentPage }));
        drawText(page, line, MARGINS.left, y, font, 11, rgb(0.1, 0.1, 0.1));
        y -= 14;
      }

      // Optional vertical layout for numeric problems
      if (!isWordProblem(p)) {
        const v = formatVerticalAddition(p);
        if (v) {
          ({ page, y, isFirstPage } = ensureSpace(pdfDoc, page, y, 48, { isFirstPage, onNewPage: onNewContentPage }));
          const boxWidth = 140;
          const xRight = MARGINS.left + boxWidth;

          // Right-aligned mono text
          const top = v.top;
          const bottom = v.bottom;

          const topW = mono.widthOfTextAtSize(top, 12);
          const bottomW = mono.widthOfTextAtSize(bottom, 12);

          drawText(page, top, xRight - topW, y, mono, 12, rgb(0.1, 0.1, 0.1));
          y -= 14;
          drawText(page, bottom, xRight - bottomW, y, mono, 12, rgb(0.1, 0.1, 0.1));
          y -= 10;
          page.drawLine({
            start: { x: MARGINS.left, y },
            end: { x: xRight, y },
            thickness: 1,
            color: rgb(0.6, 0.6, 0.6),
          });
          y -= 12;
        }
      }

      ({ page, y, isFirstPage } = ensureSpace(pdfDoc, page, y, 18, { isFirstPage, onNewPage: onNewContentPage }));

      const answerLine = `Your answer: ${rawUser === '' ? '—' : rawUser}    Correct: ${expected}`;
      drawText(page, answerLine, MARGINS.left, y, font, 10, rgb(0.25, 0.25, 0.25));
      y -= 14;

      const status = ok ? 'Correct' : 'Incorrect';
      const statusColor = ok ? rgb(0.1, 0.55, 0.2) : rgb(0.75, 0.15, 0.15);
      drawText(page, status, MARGINS.left, y, fontBold, 10, statusColor);
      y -= 18;

      // Divider
      page.drawLine({
        start: { x: MARGINS.left, y },
        end: { x: PAGE_WIDTH - MARGINS.right, y },
        thickness: 0.5,
        color: rgb(0.85, 0.85, 0.85),
      });
      y -= 14;

      questionIndex++;
    }
  }

  return await pdfDoc.save();
}

export function downloadBytes(bytes: Uint8Array, filename: string): void {
  const buf = (() => {
    const start = bytes.byteOffset;
    const end = bytes.byteOffset + bytes.byteLength;
    const backing = bytes.buffer;

    if (backing instanceof ArrayBuffer) {
      return backing.slice(start, end);
    }

    // Fallback for environments/types that expose SharedArrayBuffer.
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    return copy;
  })();
  const blob = new Blob([buf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
