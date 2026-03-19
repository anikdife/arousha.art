// src/lib/dataProbabilityPdf.ts

import { PDFDocument, rgb, PDFPage, PDFFont } from 'pdf-lib';
import type { DataProbabilitySession, Page, Question, Visual } from './dataProbability/types';
import {
  applyNumeracyContentTheme,
  drawNumeracyCoverPage,
  formatDateLine,
  loadNumeracyThemeAssets,
  loadNumeracyThemeFonts,
} from './pdf/y3NumeracyTheme';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const M = { top: 54, bottom: 54, left: 46, right: 46 };

function safeText(v: any): string {
  if (v == null) return '';
  return String(v);
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    const width = font.widthOfTextAtSize(next, size);
    if (width <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = w;
  }
  if (line) lines.push(line);
  return lines;
}

function visualSummary(visual: Visual): string {
  if (visual.type === 'table') {
    return `${visual.title}: ${visual.headers.join(' | ')}`;
  }
  if (visual.type === 'barChart') {
    return `${visual.title}: ${visual.categories.join(', ')}`;
  }
  if (visual.type === 'lineGraph') {
    return `${visual.title}: ${visual.xCategories.join(', ')}`;
  }
  if (visual.type === 'pictureGraph') {
    return `${visual.title}: ${visual.categories.join(', ')} (key: ${visual.keyLabel})`;
  }
  if (visual.type === 'spinner') {
    return `${visual.title}: ${visual.sectors.map((s) => s.label).join(', ')}`;
  }
  return `${visual.title}: ${visual.items.map((i) => `${i.label} x${i.count}`).join(', ')}`;
}

function expectedAnswerText(q: Question): string {
  if (q.core.kind === 'mcq') {
    const ans: any = q.answer;
    const idx = ans.correctIndex as number;
    const choice = Array.isArray(ans.choices) ? ans.choices[idx] : '';
    return `${idx + 1}. ${safeText(choice)}`;
  }
  const ans: any = q.answer;
  return safeText(ans.correctValue);
}

function userAnswerText(q: Question, raw: string | undefined): string {
  if (q.core.kind === 'mcq') {
    const idx = Number.parseInt(raw ?? '', 10);
    if (!Number.isFinite(idx)) return '(blank)';
    const ans: any = q.answer;
    const choice = Array.isArray(ans.choices) ? ans.choices[idx] : '';
    return `${idx + 1}. ${safeText(choice)}`;
  }
  const n = safeText(raw).trim();
  return n ? n : '(blank)';
}

function drawHeader(page: PDFPage, title: string, subtitle: string, fontBold: PDFFont, font: PDFFont) {
  page.drawText(title, {
    x: M.left,
    y: PAGE_HEIGHT - M.top,
    size: 18,
    font: fontBold,
    color: rgb(0.11, 0.11, 0.11),
  });
  page.drawText(subtitle, {
    x: M.left,
    y: PAGE_HEIGHT - M.top - 22,
    size: 10,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });

  page.drawLine({
    start: { x: M.left, y: PAGE_HEIGHT - M.top - 32 },
    end: { x: PAGE_WIDTH - M.right, y: PAGE_HEIGHT - M.top - 32 },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  });
}

export async function buildDataProbabilityPdf(params: {
  title: string;
  session: DataProbabilitySession;
  studentName?: string;
}): Promise<Uint8Array> {
  const { title, session } = params;

  const pdfDoc = await PDFDocument.create();
  const { regular: font, bold: fontBold } = await loadNumeracyThemeFonts(pdfDoc);
  const themeAssets = await loadNumeracyThemeAssets(pdfDoc);

  const createdAt = session.submittedAt ?? session.createdAt;
  const summary = session.summary;
  const subtitle = `${createdAt ? `Created: ${createdAt}` : ''}${summary ? `   Score: ${summary.correct}/${summary.total} (${summary.percentage}%)` : ''}`.trim();

  // Cover page (consistent with other numeracy sections)
  {
    const cover = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const marksLine = summary
      ? `${summary.correct} / ${summary.total} (${summary.percentage}%)`
      : '';
    drawNumeracyCoverPage({
      page: cover,
      title,
      studentName: String(params.studentName ?? 'Student'),
      dateLine: formatDateLine(createdAt),
      marksLine,
      sessionId: session.sessionId,
      font,
      fontBold,
      logoImage: themeAssets.logoImage,
      sectionLabel: 'YEAR 3 • NUMERACY',
      margins: { top: M.top, bottom: M.bottom, left: M.left, right: M.right },
    });
  }

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  applyNumeracyContentTheme(page, themeAssets, { top: M.top, bottom: M.bottom, left: M.left, right: M.right });
  drawHeader(page, title, subtitle, fontBold, font);

  const maxWidth = PAGE_WIDTH - M.left - M.right;
  let y = PAGE_HEIGHT - M.top - 52;

  const pages: Page[] = (session.pages ?? []) as any;
  let qNum = 1;

  for (let pIndex = 0; pIndex < pages.length; pIndex++) {
    const p = pages[pIndex];
    const qs: Question[] = (p.questions ?? []) as any;

    const sectionTitle = `Page ${pIndex + 1}`;
    const titleLines = wrapText(fontBold, sectionTitle, 12, maxWidth);
    for (const line of titleLines) {
      if (y < M.bottom + 60) {
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        applyNumeracyContentTheme(page, themeAssets, { top: M.top, bottom: M.bottom, left: M.left, right: M.right });
        drawHeader(page, title, subtitle, fontBold, font);
        y = PAGE_HEIGHT - M.top - 52;
      }
      page.drawText(line, { x: M.left, y, size: 12, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      y -= 16;
    }

    for (const q of qs) {
      const graded = (p.graded ?? {}) as any;
      const ok = Boolean(graded[q.core.id]);

      const prompt = `${qNum}. ${q.core.prompt}`;
      const vis = visualSummary(q.visual);
      const ua = userAnswerText(q, p.userAnswers?.[q.core.id]);
      const ea = expectedAnswerText(q);

      const block = [prompt, `Visual: ${vis}`, `Your answer: ${ua}`, `Correct answer: ${ea}`];

      const needSpace = 12 * 6;
      if (y < M.bottom + needSpace) {
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        applyNumeracyContentTheme(page, themeAssets, { top: M.top, bottom: M.bottom, left: M.left, right: M.right });
        drawHeader(page, title, subtitle, fontBold, font);
        y = PAGE_HEIGHT - M.top - 52;
      }

      page.drawText(ok ? 'C' : 'X', {
        x: PAGE_WIDTH - M.right - 10,
        y,
        size: 14,
        font: fontBold,
        color: ok ? rgb(0.0, 0.55, 0.0) : rgb(0.75, 0.0, 0.0),
      });

      for (const line of block) {
        const lines = wrapText(font, line, 10, maxWidth - 18);
        for (const l of lines) {
          page.drawText(l, { x: M.left, y, size: 10, font, color: rgb(0.15, 0.15, 0.15) });
          y -= 14;
        }
      }

      y -= 8;
      qNum++;
    }

    y -= 6;
  }

  return await pdfDoc.save();
}
