import { PDFDocument, rgb, PDFFont, PDFPage } from 'pdf-lib';
import type { WritingPromptY3 } from './promptLoader';
import {
  NUMERACY_DEFAULT_MARGINS,
  NUMERACY_PAGE_HEIGHT,
  NUMERACY_PAGE_WIDTH,
  applyNumeracyContentTheme,
  drawNumeracyCoverPage,
  loadNumeracyThemeAssets,
  loadNumeracyThemeFonts,
} from '../pdf/y3NumeracyTheme';

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeTitleCaseFromKey(k: string): string {
  return String(k)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function tryParseJson(text: string): any | null {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

type AssessorJsonFeedback = {
  studentPerformance?: { totalScoreEstimate?: any; level?: any; summary?: any };
  criteriaAnalysis?: Record<string, any>;
  strengths?: any;
  areasForImprovement?: any;
  evidence?: any;
};

function pickAssessorJsonFeedback(comment: string): AssessorJsonFeedback | null {
  const parsed = tryParseJson(comment);
  if (!isPlainObject(parsed)) return null;
  const hasAny =
    'studentPerformance' in parsed ||
    'criteriaAnalysis' in parsed ||
    'strengths' in parsed ||
    'areasForImprovement' in parsed ||
    'evidence' in parsed;
  return hasAny ? (parsed as AssessorJsonFeedback) : null;
}

function normalizeWinAnsiText(s: string): string {
  return String(s ?? '')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\u2026/g, '...');
}

const ICON_REPLACEMENTS: Record<string, string> = {
  '✏': '(pencil)',
  '🖊': '(pen)',
  '📝': '(notes)',
  '✅': '(tick)',
  '☑': '(tick)',
  '✔': '(tick)',
  '❌': '(cross)',
  '✖': '(cross)',
  '⭐': '*',
  '🌟': '*',
};

function sanitizeForFont(text: string, font: PDFFont, fontSize: number): string {
  const input = normalizeWinAnsiText(text)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const cache = new Map<string, boolean>();
  let out = '';

  // Iterate by Unicode code points (handles surrogate pairs).
  for (const ch of input) {
    if (ch === '\n' || ch === '\t') {
      out += ch;
      continue;
    }

    const cached = cache.get(ch);
    if (cached === true) {
      out += ch;
      continue;
    }
    if (cached === false) {
      out += ICON_REPLACEMENTS[ch] ?? '';
      continue;
    }

    try {
      // Any encoding error will throw here for standard fonts.
      font.widthOfTextAtSize(ch, fontSize);
      cache.set(ch, true);
      out += ch;
    } catch {
      cache.set(ch, false);
      out += ICON_REPLACEMENTS[ch] ?? '';
    }
  }

  return out;
}

function formatIsoOrMillis(value: string | number | null | undefined): string {
  if (value == null) return '';
  try {
    const d = typeof value === 'number' ? new Date(value) : new Date(String(value));
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString();
  } catch {
    return '';
  }
}

function splitToLines(params: { text: string; font: PDFFont; fontSize: number; maxWidth: number }): string[] {
  const { text, font, fontSize, maxWidth } = params;
  const cleaned = sanitizeForFont(text, font, fontSize);

  const paragraphs = cleaned.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

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
  }

  return lines;
}

async function tryFetchImage(url: string): Promise<{ bytes: Uint8Array; kind: 'png' | 'jpg' } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);

    // Very small sniff: PNG starts with 89 50 4E 47, JPEG with FF D8
    if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return { bytes, kind: 'png' };
    }
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      return { bytes, kind: 'jpg' };
    }

    // Fallback: try png first.
    return { bytes, kind: 'png' };
  } catch {
    return null;
  }
}

function drawSectionTitle(page: PDFPage, font: PDFFont, text: string, x: number, y: number) {
  page.drawText(sanitizeForFont(text, font, 16), { x, y, size: 16, font, color: rgb(0.1, 0.1, 0.1) });
}

function drawWrappedText(params: {
  page: PDFPage;
  font: PDFFont;
  fontSize: number;
  text: string;
  x: number;
  yTop: number;
  maxWidth: number;
  lineHeight: number;
  maxLines?: number;
}): number {
  const { page, font, fontSize, text, x, yTop, maxWidth, lineHeight, maxLines } = params;
  const lines = splitToLines({ text, font, fontSize, maxWidth });
  const capped = typeof maxLines === 'number' ? lines.slice(0, Math.max(0, maxLines)) : lines;

  let y = yTop;
  for (const line of capped) {
    page.drawText(sanitizeForFont(line, font, fontSize), { x, y, size: fontSize, font, color: rgb(0.15, 0.15, 0.15) });
    y -= lineHeight;
  }

  return y;
}

export async function buildWritingAssessmentPdf(params: {
  title?: string;
  prompt: WritingPromptY3;
  promptImageUrl?: string;
  answerText: string;
  feedback: { scorePercent: number; comment: string; assessedAt?: string | number | null };
  includeCoverPage?: boolean;
  cover?: {
    studentName?: string;
    dateLine?: string;
    marksLine?: string;
    sessionId?: string;
  };
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const { regular: fontRegular, bold: fontBold } = await loadNumeracyThemeFonts(pdfDoc);
  const themeAssets = await loadNumeracyThemeAssets(pdfDoc);

  const pageW = NUMERACY_PAGE_WIDTH; // A4
  const pageH = NUMERACY_PAGE_HEIGHT;
  const margin = 48;

  if (params.includeCoverPage) {
    const cover = pdfDoc.addPage([pageW, pageH]);
    drawNumeracyCoverPage({
      page: cover,
      title: params.title ?? 'Writing Practice',
      studentName: String(params.cover?.studentName ?? 'Student'),
      dateLine: String(params.cover?.dateLine ?? ''),
      marksLine: String(params.cover?.marksLine ?? ''),
      sessionId: params.cover?.sessionId,
      sectionLabel: 'YEAR 3 • WRITING',
      font: fontRegular,
      fontBold,
      logoImage: themeAssets.logoImage,
      margins: NUMERACY_DEFAULT_MARGINS,
    });
  }

  // Page 1: Prompt
  {
    const page = pdfDoc.addPage([pageW, pageH]);

    applyNumeracyContentTheme(page, themeAssets, { top: margin, bottom: margin, left: margin, right: margin });

    drawSectionTitle(page, fontBold, params.title ?? 'Writing Practice', margin, pageH - margin - 10);

    const prompt = params.prompt;
    const metaLine = `${prompt.type.toUpperCase()} • Year ${prompt.year}`;
    page.drawText(normalizeWinAnsiText(metaLine), { x: margin, y: pageH - margin - 34, size: 10, font: fontRegular, color: rgb(0.35, 0.35, 0.35) });

    page.drawText(normalizeWinAnsiText(prompt.title), { x: margin, y: pageH - margin - 60, size: 14, font: fontBold, color: rgb(0.1, 0.1, 0.1) });

    let y = pageH - margin - 86;

    // Optional stimulus image
    if (params.promptImageUrl) {
      const img = await tryFetchImage(params.promptImageUrl);
      if (img) {
        try {
          const embedded = img.kind === 'jpg' ? await pdfDoc.embedJpg(img.bytes) : await pdfDoc.embedPng(img.bytes);
          const maxW = pageW - margin * 2;
          const maxH = 220;
          const scale = Math.min(maxW / embedded.width, maxH / embedded.height);
          const w = embedded.width * scale;
          const h = embedded.height * scale;
          page.drawImage(embedded, { x: margin, y: y - h, width: w, height: h });
          y = y - h - 18;
        } catch {
          // ignore image failure
        }
      }
    }

    // Task intro
    y = drawWrappedText({
      page,
      font: fontRegular,
      fontSize: 11,
      text: prompt.taskIntro,
      x: margin,
      yTop: y,
      maxWidth: pageW - margin * 2,
      lineHeight: 14,
    });

    y -= 12;
    page.drawText('Guidance', { x: margin, y, size: 12, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
    y -= 16;

    for (const g of prompt.guidance ?? []) {
      y = drawWrappedText({
        page,
        font: fontRegular,
        fontSize: 11,
        text: `• ${g}`,
        x: margin,
        yTop: y,
        maxWidth: pageW - margin * 2,
        lineHeight: 14,
      });
      y -= 4;
    }

    y -= 10;
    page.drawText('Remember', { x: margin, y, size: 12, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
    y -= 16;

    for (const r of prompt.remember ?? []) {
      y = drawWrappedText({
        page,
        font: fontRegular,
        fontSize: 11,
        text: `• ${r}`,
        x: margin,
        yTop: y,
        maxWidth: pageW - margin * 2,
        lineHeight: 14,
      });
      y -= 4;
    }
  }

  // Page 2: Answer
  {
    const page = pdfDoc.addPage([pageW, pageH]);

    applyNumeracyContentTheme(page, themeAssets, { top: margin, bottom: margin, left: margin, right: margin });
    drawSectionTitle(page, fontBold, 'Student Answer', margin, pageH - margin - 10);

    const boxX = margin;
    const boxY = margin;
    const boxW = pageW - margin * 2;
    const boxH = pageH - margin * 2 - 40;

    // Simple border
    page.drawRectangle({ x: boxX, y: boxY, width: boxW, height: boxH, borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 1 });

    const yTop = pageH - margin - 60;
    drawWrappedText({
      page,
      font: fontRegular,
      fontSize: 11,
      text: params.answerText || '(No answer text saved)',
      x: boxX + 12,
      yTop,
      maxWidth: boxW - 24,
      lineHeight: 14,
      maxLines: Math.floor((boxH - 24) / 14),
    });
  }

  // Page 3: Feedback
  {
    let page = pdfDoc.addPage([pageW, pageH]);

    applyNumeracyContentTheme(page, themeAssets, { top: margin, bottom: margin, left: margin, right: margin });
    drawSectionTitle(page, fontBold, 'Teacher Feedback', margin, pageH - margin - 10);

    // Accent line under header (match numeracy theme)
    page.drawLine({
      start: { x: margin, y: pageH - margin - 20 },
      end: { x: margin + 220, y: pageH - margin - 20 },
      thickness: 2,
      color: rgb(0.95, 0.66, 0.18),
      opacity: 0.95,
    } as any);

    const assessedAtText = formatIsoOrMillis(params.feedback.assessedAt);

    // Score panel
    const panelX = margin;
    const panelTop = pageH - margin - 46;
    const panelW = pageW - margin * 2;
    const panelH = 54;
    page.drawRectangle({
      x: panelX,
      y: panelTop - panelH,
      width: panelW,
      height: panelH,
      color: rgb(0.96, 0.99, 0.99),
      borderColor: rgb(0.0, 0.31, 0.44),
      borderWidth: 1,
      opacity: 1,
    } as any);

    page.drawText(sanitizeForFont(`Score: ${Math.round(params.feedback.scorePercent)}%`, fontBold, 14), {
      x: panelX + 12,
      y: panelTop - 22,
      size: 14,
      font: fontBold,
      color: rgb(0.0, 0.31, 0.44),
    });

    if (assessedAtText) {
      page.drawText(sanitizeForFont(`Assessed: ${assessedAtText}`, fontRegular, 10), {
        x: panelX + 12,
        y: panelTop - 42,
        size: 10,
        font: fontRegular,
        color: rgb(0.35, 0.35, 0.35),
      });
    }

    const contentX = margin;
    const contentW = pageW - margin * 2;
    const yTopStart = panelTop - panelH - 18;
    const bottomLimit = margin;
    const lineH = 14;

    const newFeedbackPage = (continued: boolean) => {
      page = pdfDoc.addPage([pageW, pageH]);
      applyNumeracyContentTheme(page, themeAssets, { top: margin, bottom: margin, left: margin, right: margin });
      drawSectionTitle(page, fontBold, continued ? 'Teacher Feedback (continued)' : 'Teacher Feedback', margin, pageH - margin - 10);
      page.drawLine({
        start: { x: margin, y: pageH - margin - 20 },
        end: { x: margin + 260, y: pageH - margin - 20 },
        thickness: 2,
        color: rgb(0.95, 0.66, 0.18),
        opacity: 0.95,
      } as any);
      return pageH - margin - 46;
    };

    let y = yTopStart;
    const ensureSpace = (needed: number) => {
      if (y - needed >= bottomLimit) return;
      y = newFeedbackPage(true);
    };

    const drawHeading = (label: string) => {
      ensureSpace(22);
      page.drawText(sanitizeForFont(label, fontBold, 12), { x: contentX, y, size: 12, font: fontBold, color: rgb(0.0, 0.31, 0.44) });
      y -= 8;
      page.drawLine({
        start: { x: contentX, y },
        end: { x: contentX + Math.min(220, contentW), y },
        thickness: 1,
        color: rgb(0.95, 0.66, 0.18),
        opacity: 0.9,
      } as any);
      y -= 12;
    };

    const drawLabelValue = (label: string, value: any) => {
      const text = `${label}: ${value == null ? '' : String(value)}`;
      ensureSpace(lineH + 2);
      page.drawText(sanitizeForFont(text, fontRegular, 11), { x: contentX, y, size: 11, font: fontRegular, color: rgb(0.15, 0.15, 0.15) });
      y -= lineH;
    };

    const drawBullets = (items: any[]) => {
      for (const it of items) {
        const t = String(it ?? '').trim();
        if (!t) continue;
        ensureSpace(lineH * 2);
        const before = y;
        y = drawWrappedText({
          page,
          font: fontRegular,
          fontSize: 11,
          text: `• ${t}`,
          x: contentX,
          yTop: y,
          maxWidth: contentW,
          lineHeight: lineH,
        });
        if (y === before) y -= lineH;
        y -= 2;
      }
    };

    const json = pickAssessorJsonFeedback(params.feedback.comment);
    if (json) {
      const sp = isPlainObject(json.studentPerformance) ? json.studentPerformance : null;
      const ca = isPlainObject(json.criteriaAnalysis) ? (json.criteriaAnalysis as Record<string, any>) : null;
      const strengths = Array.isArray(json.strengths) ? (json.strengths as any[]) : null;
      const areas = Array.isArray(json.areasForImprovement) ? (json.areasForImprovement as any[]) : null;
      const evidence = Array.isArray(json.evidence) ? (json.evidence as any[]) : null;

      if (sp) {
        drawHeading('Student performance');
        if ('totalScoreEstimate' in sp) drawLabelValue('Total score estimate', sp.totalScoreEstimate);
        if ('level' in sp) drawLabelValue('Level', sp.level);
        if ('summary' in sp) {
          ensureSpace(lineH * 3);
          y = drawWrappedText({
            page,
            font: fontRegular,
            fontSize: 11,
            text: `Summary: ${sp.summary == null ? '' : String(sp.summary)}`,
            x: contentX,
            yTop: y,
            maxWidth: contentW,
            lineHeight: lineH,
            maxLines: 8,
          });
          y -= 6;
        }
      }

      if (ca) {
        drawHeading('Criteria analysis');
        for (const [k, v] of Object.entries(ca)) {
          const crit = safeTitleCaseFromKey(k);
          const score = isPlainObject(v) ? v.score : undefined;
          const fb = isPlainObject(v) ? v.feedback : v;

          ensureSpace(lineH * 3);
          page.drawText(sanitizeForFont(crit, fontBold, 11), { x: contentX, y, size: 11, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
          if (score != null) {
            const s = String(score);
            page.drawText(sanitizeForFont(`(${s})`, fontRegular, 10), {
              x: contentX + 260,
              y: y + 1,
              size: 10,
              font: fontRegular,
              color: rgb(0.35, 0.35, 0.35),
            });
          }
          y -= lineH;

          y = drawWrappedText({
            page,
            font: fontRegular,
            fontSize: 11,
            text: String(fb ?? ''),
            x: contentX,
            yTop: y,
            maxWidth: contentW,
            lineHeight: lineH,
            maxLines: 10,
          });
          y -= 10;
        }
      }

      if (strengths && strengths.length) {
        drawHeading('Strengths');
        drawBullets(strengths);
        y -= 6;
      }

      if (areas && areas.length) {
        drawHeading('Areas for improvement');
        drawBullets(areas);
        y -= 6;
      }

      if (evidence && evidence.length) {
        drawHeading('Evidence');
        drawBullets(evidence);
        y -= 6;
      }
    } else {
      // Fallback: pretty comment box
      const boxX = margin;
      const boxY = margin;
      const boxW = pageW - margin * 2;
      const boxH = pageH - margin * 2 - 120;

      page.drawRectangle({
        x: boxX,
        y: boxY,
        width: boxW,
        height: boxH,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.95, 0.66, 0.18),
        borderWidth: 1,
        opacity: 1,
      } as any);

      page.drawRectangle({
        x: boxX,
        y: boxY + boxH - 34,
        width: boxW,
        height: 34,
        color: rgb(0.0, 0.31, 0.44),
        opacity: 0.08,
      } as any);

      page.drawText(sanitizeForFont('Teacher comment', fontBold, 11), {
        x: boxX + 12,
        y: boxY + boxH - 22,
        size: 11,
        font: fontBold,
        color: rgb(0.0, 0.31, 0.44),
      });

      drawWrappedText({
        page,
        font: fontRegular,
        fontSize: 11,
        text: params.feedback.comment || '(No feedback provided)',
        x: boxX + 12,
        yTop: boxY + boxH - 54,
        maxWidth: boxW - 24,
        lineHeight: 14,
        maxLines: Math.floor((boxH - 60) / 14),
      });
    }
  }

  const bytes = await pdfDoc.save();
  return bytes;
}
