// src/lib/languageConventions/pdfExport.ts

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';
import type { LCAnswer, LCQuestion, LCSession } from './types';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

const MARGINS = {
  top: 60,
  bottom: 60,
  left: 50,
  right: 50,
};

function sanitizeForWinAnsi(text: string): string {
  // pdf-lib StandardFonts are WinAnsi encoded. Normalize common Unicode punctuation
  // and replace any remaining non-encodable characters.
  const normalized = text
    .replace(/\u2192/g, '->') // →
    .replace(/[\u201C\u201D]/g, '"') // “ ”
    .replace(/[\u2018\u2019]/g, "'") // ‘ ’
    .replace(/[\u2013\u2014]/g, '-') // – —
    .replace(/\u2026/g, '...') // …
    .replace(/\u00A0/g, ' '); // nbsp

  // pdf-lib StandardFonts are WinAnsi encoded. As a conservative guard, replace
  // non-ASCII characters with '?', while allowing TAB/LF/CR.
  let out = '';
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    const ch = normalized[i];
    const ok = code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126);
    out += ok ? ch : '?';
  }
  return out;
}

function safeText(v: any): string {
  if (v == null) return '';
  return sanitizeForWinAnsi(String(v));
}

function formatDate(isoOrAny: unknown): string {
  const s = safeText(isoOrAny);
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return '';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '';
  }
}

async function tryFetchLogoPngBytes(): Promise<Uint8Array | null> {
  try {
    const publicUrl = process.env.PUBLIC_URL || '';
    const logoPath = '/logo%20of%20arousha.art.png';
    const res = await fetch(`${publicUrl}${logoPath}`);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

function drawLogoWatermark(page: PDFPage, logoImage: any, margin: number): void {
  const { width: pageWidth, height: pageHeight } = page.getSize();

  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;

  const widthScale = maxWidth / logoImage.width;
  const heightScale = maxHeight / logoImage.height;
  const scale = Math.min(widthScale, heightScale) * 0.75;

  const drawWidth = logoImage.width * scale;
  const drawHeight = logoImage.height * scale;

  page.drawImage(logoImage, {
    x: (pageWidth - drawWidth) / 2,
    y: (pageHeight - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
    opacity: 0.06,
  } as any);
}

function drawGoldenPageBorder(page: PDFPage): void {
  const inset = 18;
  const borderWidth = 2;
  const gold = rgb(0.95, 0.66, 0.18);

  page.drawRectangle({
    x: inset,
    y: inset,
    width: PAGE_WIDTH - inset * 2,
    height: PAGE_HEIGHT - inset * 2,
    borderColor: gold,
    borderWidth,
    opacity: 0.9,
  } as any);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function drawVerticalGradient(
  page: PDFPage,
  top: [number, number, number],
  bottom: [number, number, number],
  steps = 28
): void {
  const sliceH = PAGE_HEIGHT / steps;
  for (let i = 0; i < steps; i++) {
    const t = i / Math.max(1, steps - 1);
    const r = lerp(bottom[0], top[0], t);
    const g = lerp(bottom[1], top[1], t);
    const b = lerp(bottom[2], top[2], t);
    page.drawRectangle({
      x: 0,
      y: i * sliceH,
      width: PAGE_WIDTH,
      height: sliceH + 1,
      color: rgb(r, g, b),
    });
  }
}

function drawText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, color = rgb(0, 0, 0)) {
  page.drawText(safeText(text), { x, y, size, font, color });
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
  const { page, title, studentName, dateLine, marksLine, sessionId, font, fontBold, logoImage } = params;

  const deepTeal: [number, number, number] = [0.0, 0.31, 0.44];
  const softAqua: [number, number, number] = [0.96, 0.99, 0.99];
  const accentGold: [number, number, number] = [0.95, 0.66, 0.18];
  const inkOnDark: [number, number, number] = [1, 1, 1];
  const inkMuted: [number, number, number] = [0.93, 0.98, 0.98];

  drawVerticalGradient(page, deepTeal, softAqua, 30);

  page.drawCircle({
    x: PAGE_WIDTH - 70,
    y: PAGE_HEIGHT - 110,
    size: 160,
    color: rgb(1, 1, 1),
    opacity: 0.10,
  } as any);
  page.drawCircle({
    x: 90,
    y: 150,
    size: 210,
    color: rgb(0.12, 0.70, 0.64),
    opacity: 0.10,
  } as any);
  page.drawCircle({
    x: PAGE_WIDTH - 170,
    y: 250,
    size: 110,
    color: rgb(accentGold[0], accentGold[1], accentGold[2]),
    opacity: 0.10,
  } as any);

  const x = MARGINS.left;
  const titleY = PAGE_HEIGHT - 170;
  drawText(page, 'YEAR 3 • LANGUAGE CONVENTIONS', x, titleY + 46, fontBold, 12, rgb(inkMuted[0], inkMuted[1], inkMuted[2]));
  drawText(page, title, x, titleY, fontBold, 34, rgb(inkOnDark[0], inkOnDark[1], inkOnDark[2]));
  page.drawLine({
    start: { x, y: titleY - 14 },
    end: { x: x + 320, y: titleY - 14 },
    thickness: 2,
    color: rgb(accentGold[0], accentGold[1], accentGold[2]),
    opacity: 0.95,
  } as any);
  drawText(page, 'Practice Workbook', x, titleY - 40, font, 16, rgb(inkMuted[0], inkMuted[1], inkMuted[2]));

  const metaY = titleY - 100;
  drawText(page, `Student: ${studentName}`, x, metaY, fontBold, 16, rgb(inkOnDark[0], inkOnDark[1], inkOnDark[2]));
  if (dateLine) {
    drawText(page, `Date: ${dateLine}`, x, metaY - 22, font, 11, rgb(inkMuted[0], inkMuted[1], inkMuted[2]));
  }
  if (marksLine) {
    drawText(page, `Marks: ${marksLine}`, x, metaY - 44, fontBold, 12, rgb(accentGold[0], accentGold[1], accentGold[2]));
  }
  if (sessionId) {
    drawText(page, `Session: ${sessionId}`, x, metaY - 62, font, 9, rgb(inkMuted[0], inkMuted[1], inkMuted[2]));
  }

  if (logoImage) {
    const maxLogoWidth = 320;
    const maxLogoHeight = 140;

    const widthScale = maxLogoWidth / logoImage.width;
    const heightScale = maxLogoHeight / logoImage.height;
    const scale = Math.min(widthScale, heightScale);

    const drawWidth = logoImage.width * scale;
    const drawHeight = logoImage.height * scale;

    const lx = (PAGE_WIDTH - drawWidth) / 2;
    const ly = 70;

    page.drawRectangle({
      x: lx - 10,
      y: ly - 8,
      width: drawWidth + 20,
      height: drawHeight + 16,
      color: rgb(0, 0, 0),
      opacity: 0.08,
    } as any);

    page.drawImage(logoImage, {
      x: lx,
      y: ly,
      width: drawWidth,
      height: drawHeight,
      opacity: 1,
    } as any);
  }
}

function answerText(q: LCQuestion, a: LCAnswer | undefined): string {
  if (!a) return '(blank)';
  if (q.type === 'mcq') {
    if (a.type !== 'mcq') return '(blank)';
    const idx = a.selectedIndex;
    const label = q.choices[idx] != null ? q.choices[idx] : '';
    return `${idx + 1}. ${safeText(label)}`;
  }
  if (q.type === 'spell') {
    if (a.type !== 'spell') return '(blank)';
    const t = safeText(a.text).trim();
    return t ? t : '(blank)';
  }
  if (q.type === 'selectIncorrect') {
    if (a.type !== 'selectIncorrect') return '(blank)';
    const idx = a.selectedIndex;
    const tok = q.tokens[idx] != null ? q.tokens[idx] : '';
    return `${idx + 1}. ${safeText(tok)}`;
  }
  return '(blank)';
}

function correctText(q: LCQuestion): string {
  if (q.type === 'mcq') {
    return `${q.correctIndex + 1}. ${safeText(q.choices[q.correctIndex])}`;
  }
  if (q.type === 'spell') {
    return safeText(q.correctToken);
  }
  return `${q.incorrectIndex + 1}. ${safeText(q.tokens[q.incorrectIndex])} -> ${safeText(q.correctToken)}`;
}

function promptBlockLines(qNum: number, q: LCQuestion, ua: string, ca: string): string[] {
  const lines: string[] = [];
  lines.push(`Q${qNum}. ${safeText(q.prompt)}`);

  if (q.type === 'mcq') {
    if (q.sentence) lines.push(`Sentence: ${safeText(q.sentence)}`);
    const choices = q.choices.map((c) => safeText(c));
    lines.push(`Choices: 1) ${choices[0]}  2) ${choices[1]}  3) ${choices[2]}  4) ${choices[3]}`);
  } else if (q.type === 'spell') {
    lines.push(`Sentence: ${safeText(q.sentenceWithError)}`);
  } else {
    lines.push(`Sentence: ${safeText(q.sentence)}`);
  }

  lines.push(`Answer: ${ua}`);
  lines.push(`Expected: ${ca}`);
  return lines;
}

export async function buildLanguageConventionsPdf(params: {
  title?: string;
  session: LCSession;
  createdAtIso?: string;
  studentName?: string;
  score?: { correct: number; total: number; percentage: number };
  sessionId?: string;
}): Promise<Uint8Array> {
  const { session } = params;
  const title = params.title ?? 'Language Conventions Practice';

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const logoBytes = await tryFetchLogoPngBytes();
  const logoImage = logoBytes ? await pdfDoc.embedPng(logoBytes) : null;

  const margin = MARGINS.left;
  const lineH = 16;
  const pages = session.pages ?? [];

  const createdAtIso = params.createdAtIso ?? session.submittedAt ?? session.createdAt;
  const dateLine = createdAtIso ? formatDate(createdAtIso) : '';
  const score = session.summary ?? params.score;
  const marksLine = score && Number.isFinite(score.total) && score.total > 0
    ? `${score.correct} / ${score.total} (${score.percentage}%)`
    : '';
  const studentName = safeText(params.studentName ?? 'Student');
  const sessionId = params.sessionId;

  // Cover page (match Addition PDF styling)
  {
    const cover = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawCoverPage({
      page: cover,
      title,
      studentName,
      dateLine,
      marksLine,
      sessionId,
      font,
      fontBold,
      logoImage,
    });
  }

  // Content pages (match Addition PDF styling)
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  if (logoImage) drawLogoWatermark(page, logoImage, margin);
  drawGoldenPageBorder(page);
  let cursorY = page.getHeight() - MARGINS.top;

  const newPage = () => {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    if (logoImage) drawLogoWatermark(page, logoImage, margin);
    drawGoldenPageBorder(page);
    cursorY = page.getHeight() - MARGINS.top;
  };

  const drawLineText = (
    text: string,
    opts?: { bold?: boolean; size?: number; color?: { r: number; g: number; b: number } }
  ) => {
    const size = opts?.size ?? 11;
    const usedFont = opts?.bold ? fontBold : font;
    const c = opts?.color ?? { r: 0.15, g: 0.15, b: 0.15 };

    if (cursorY < margin + 3 * lineH) newPage();

    page.drawText(safeText(text), {
      x: margin,
      y: cursorY,
      size,
      font: usedFont,
      color: rgb(c.r, c.g, c.b),
    });
    cursorY -= lineH;
  };

  const drawWrapped = (text: string) => {
    const maxWidth = page.getWidth() - MARGINS.left - MARGINS.right;
    const size = 11;
    const words = safeText(text).split(/\s+/g).filter(Boolean);
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

  let qNum = 1;
  for (const p of pages) {
    drawLineText(`Page: ${p.pageId}`, { bold: true, size: 13, color: { r: 0.2, g: 0.1, b: 0.4 } });
    cursorY -= 6;

    for (const q of p.questions ?? []) {
      const ok = Boolean(p.graded?.[q.id]);
      const ua = answerText(q, p.userAnswers?.[q.id]);
      const ca = correctText(q);

      const lines = promptBlockLines(qNum, q, ua, ca);

      // First line is usually the longest; wrap it like Numeracy PDFs.
      if (lines.length > 0) {
        drawWrapped(lines[0]);
        for (let i = 1; i < lines.length; i++) {
          drawWrapped(lines[i]);
        }
      }

      const mark = ok ? 'OK' : 'X';
      drawLineText(mark, {
        bold: true,
        color: ok ? { r: 0.1, g: 0.5, b: 0.2 } : { r: 0.75, g: 0.1, b: 0.1 },
      });

      cursorY -= 10;
      qNum += 1;
    }

    cursorY -= 10;
  }

  return await pdfDoc.save();
}
