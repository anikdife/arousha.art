import { PDFDocument, rgb, PDFPage, PDFFont } from 'pdf-lib';
import type { GeometryPage, GeometryProblem } from './geometry/models';
import {
  applyNumeracyContentTheme,
  drawNumeracyCoverPage,
  formatDateLine as themeFormatDateLine,
  loadNumeracyThemeAssets,
  loadNumeracyThemeFonts,
} from './pdf/y3NumeracyTheme';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

const COVER_MARGINS = {
  top: 60,
  bottom: 60,
  left: 50,
  right: 50,
};

type GeometrySession = {
  topic?: string;
  sessionId?: string;
  setNo?: number;
  createdAt?: string;
  submittedAt?: string;
  score?: { correct: number; total: number; percentage: number };
  page?: GeometryPage;
  answers?: Record<string, string>;
};

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
    margins: COVER_MARGINS,
  });
}

function sanitizeForWinAnsi(text: string): string {
  const normalized = String(text)
    .replace(/\u2192/g, '->')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ');

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

function safeText(value: unknown): string {
  if (value == null) return '';
  return sanitizeForWinAnsi(String(value));
}

function formatDate(isoOrAny: unknown): string {
  return themeFormatDateLine(safeText(isoOrAny));
}


function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const safe = safeText(text);
  const words = safe.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    const width = font.widthOfTextAtSize(candidate, size);
    if (width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = w;
  }

  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function drawHeading(page: PDFPage, x: number, y: number, text: string, font: PDFFont): void {
  page.drawText(safeText(text), { x, y, size: 12, font, color: rgb(0.1, 0.1, 0.1) });
}

function regularPolygonPoints(cx: number, cy: number, r: number, sides: number, rotationRad: number): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < sides; i++) {
    const a = rotationRad + (i * 2 * Math.PI) / sides;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

function drawDashedLine(page: PDFPage, x1: number, y1: number, x2: number, y2: number, dash = 6, gap = 4, thickness = 1.5) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len <= 0.0001) return;

  const ux = dx / len;
  const uy = dy / len;
  let t = 0;
  while (t < len) {
    const seg = Math.min(dash, len - t);
    const sx = x1 + ux * t;
    const sy = y1 + uy * t;
    const ex = x1 + ux * (t + seg);
    const ey = y1 + uy * (t + seg);
    page.drawLine({ start: { x: sx, y: sy }, end: { x: ex, y: ey }, thickness, color: rgb(0.3, 0.3, 0.3) });
    t += dash + gap;
  }
}

function drawGeometryDiagram(page: PDFPage, diagram: any, x: number, topY: number, boxW: number, boxH: number, font: PDFFont): void {
  const pad = 10;
  const innerW = Math.max(1, boxW - pad * 2);
  const innerH = Math.max(1, boxH - pad * 2);

  const w = Number(diagram?.width ?? 180);
  const h = Number(diagram?.height ?? 140);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;

  const scale = Math.min(innerW / w, innerH / h);
  const ox = x + pad;
  const bottomY = topY - boxH;
  const oy = bottomY + pad;

  const toPdf = (sx: number, sy: number) => {
    const px = ox + sx * scale;
    const py = oy + (h - sy) * scale;
    return { x: px, y: py };
  };

  const stroke = rgb(0.1, 0.1, 0.1);
  const lw = 2;

  const shapeType = String(diagram?.shapeType ?? '');
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.28;

  const drawPolygon = (pts: Array<{ x: number; y: number }>) => {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const p1 = toPdf(a.x, a.y);
      const p2 = toPdf(b.x, b.y);
      page.drawLine({ start: p1, end: p2, thickness: lw, color: stroke });
    }
  };

  if (shapeType === 'circle') {
    const c = toPdf(cx, cy);
    page.drawCircle({ x: c.x, y: c.y, size: r * scale, borderColor: stroke, borderWidth: lw, color: undefined as any });
  } else if (shapeType === 'square') {
    const s = r * 2;
    const x0 = cx - s / 2;
    const y0 = cy - s / 2;
    const tl = toPdf(x0, y0);
    page.drawRectangle({ x: tl.x, y: tl.y - s * scale, width: s * scale, height: s * scale, borderColor: stroke, borderWidth: lw, color: undefined as any });
  } else if (shapeType === 'rectangle') {
    const rw = r * 2.4;
    const rh = r * 1.6;
    const x0 = cx - rw / 2;
    const y0 = cy - rh / 2;
    const tl = toPdf(x0, y0);
    page.drawRectangle({ x: tl.x, y: tl.y - rh * scale, width: rw * scale, height: rh * scale, borderColor: stroke, borderWidth: lw, color: undefined as any });
  } else if (shapeType === 'triangle') {
    const pts = [
      { x: cx, y: cy - r },
      { x: cx - r, y: cy + r },
      { x: cx + r, y: cy + r },
    ];
    drawPolygon(pts);
  } else if (shapeType === 'pentagon') {
    drawPolygon(regularPolygonPoints(cx, cy, r, 5, -Math.PI / 2));
  } else if (shapeType === 'hexagon') {
    drawPolygon(regularPolygonPoints(cx, cy, r, 6, -Math.PI / 2));
  } else if (shapeType === 'right-angle-corner') {
    const kindRaw = (diagram?.data?.cornerKind as string | undefined) ?? 'right';
    const kind = kindRaw === 'right' ? 'right' : 'small';
    const x0 = w * 0.35;
    const y0 = h * 0.65;
    const len = Math.min(w, h) * 0.25;
    const a1 = 0;
    const a2 = kind === 'right' ? -Math.PI / 2 : -Math.PI / 4;
    const p0 = toPdf(x0, y0);
    const p1 = toPdf(x0 + len * Math.cos(a1), y0 + len * Math.sin(a1));
    const p2 = toPdf(x0 + len * Math.cos(a2), y0 + len * Math.sin(a2));
    page.drawLine({ start: p0, end: p1, thickness: 3, color: stroke });
    page.drawLine({ start: p0, end: p2, thickness: 3, color: stroke });
    if (kind === 'right') {
      const rectX = x0 + 6;
      const rectY = y0 - 22;
      const tl = toPdf(rectX, rectY);
      page.drawRectangle({ x: tl.x, y: tl.y - 16 * scale, width: 16 * scale, height: 16 * scale, borderColor: stroke, borderWidth: 1.5, color: undefined as any });
    }
  } else if (shapeType === 'angle-compare') {
    const a = (diagram?.data?.angleA as 'small' | 'right' | undefined) ?? 'small';
    const b = (diagram?.data?.angleB as 'small' | 'right' | undefined) ?? 'right';

    const drawAngle = (kind: 'small' | 'right', ax: number, ay: number) => {
      const len = Math.min(w, h) * 0.25;
      const a1 = 0;
      const a2 = kind === 'right' ? -Math.PI / 2 : -Math.PI / 4;
      const p0 = toPdf(ax, ay);
      const p1 = toPdf(ax + len * Math.cos(a1), ay + len * Math.sin(a1));
      const p2 = toPdf(ax + len * Math.cos(a2), ay + len * Math.sin(a2));
      page.drawLine({ start: p0, end: p1, thickness: 3, color: stroke });
      page.drawLine({ start: p0, end: p2, thickness: 3, color: stroke });
      if (kind === 'right') {
        const rectX = ax + 6;
        const rectY = ay - 22;
        const tl = toPdf(rectX, rectY);
        page.drawRectangle({ x: tl.x, y: tl.y - 16 * scale, width: 16 * scale, height: 16 * scale, borderColor: stroke, borderWidth: 1.5, color: undefined as any });
      }
    };

    drawAngle(a, w * 0.25, h * 0.7);
    drawAngle(b, w * 0.65, h * 0.7);

    const aLabel = toPdf(w * 0.22, h * 0.9);
    const bLabel = toPdf(w * 0.62, h * 0.9);
    page.drawText('A', { x: aLabel.x, y: aLabel.y, size: 12, font, color: stroke });
    page.drawText('B', { x: bLabel.x, y: bLabel.y, size: 12, font, color: stroke });
  }

  // Symmetry lines (dashed)
  const symmetryLines = Array.isArray(diagram?.symmetryLines) ? diagram.symmetryLines : [];
  for (const ln of symmetryLines) {
    const orientation = String(ln?.orientation ?? '');
    const at = Number(ln?.at ?? 0.5);
    if (!Number.isFinite(at)) continue;
    if (orientation === 'vertical') {
      const sx = at * w;
      const p1 = toPdf(sx, 10);
      const p2 = toPdf(sx, h - 10);
      drawDashedLine(page, p1.x, p1.y, p2.x, p2.y, 6 * scale, 4 * scale, 1.5);
    } else if (orientation === 'horizontal') {
      const sy = at * h;
      const p1 = toPdf(10, sy);
      const p2 = toPdf(w - 10, sy);
      drawDashedLine(page, p1.x, p1.y, p2.x, p2.y, 6 * scale, 4 * scale, 1.5);
    }
  }
}

function formatProblemAnswer(p: GeometryProblem, userValue: string | undefined): { user: string; correct: string; ok: boolean } {
  const user = safeText(userValue ?? '');
  const correct = safeText(p.correctAnswer.value);
  const ok = userValue === p.correctAnswer.value;

  if (p.type === 'multiple-choice') {
    const userLabel = p.options?.find((o) => o.id === userValue)?.text;
    const correctLabel = p.options?.find((o) => o.id === p.correctAnswer.value)?.text;
    return {
      user: userLabel ? safeText(userLabel) : '(blank)',
      correct: correctLabel ? safeText(correctLabel) : '(unknown)',
      ok,
    };
  }

  return {
    user: user || '(blank)',
    correct,
    ok,
  };
}

export async function buildGeometryPdf(params: { title: string; session: GeometrySession; studentName?: string }): Promise<Uint8Array> {
  const { title, session } = params;

  const pdfDoc = await PDFDocument.create();
  const { regular: font, bold } = await loadNumeracyThemeFonts(pdfDoc);
  const themeAssets = await loadNumeracyThemeAssets(pdfDoc);
  const logoImage = themeAssets.logoImage;

  const margin = 48;
  const lineH = 15;
  const bodySize = 11;
  const questionBlockGap = 20;
  const sectionGap = 8;
  const diagramBoxW = 220;
  const diagramBoxH = 140;

  const problems = session.page?.problems ?? [];
  const answers = session.answers ?? {};
  const createdAtIso = session.submittedAt ?? session.createdAt;
  const dateLabel = createdAtIso ? formatDate(createdAtIso) : '';

  // Cover page (branded like Addition)
  {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const score = session.score;
    const marksLine =
      score && Number.isFinite(score.total) && score.total > 0
        ? `${score.correct} / ${score.total} (${score.percentage}%)`
        : '';

    const studentName = safeText(params.studentName ?? 'Student');

    drawCoverPage({
      page,
      title,
      studentName,
      dateLine: dateLabel,
      marksLine,
      sessionId: session.sessionId,
      font,
      fontBold: bold,
      logoImage,
    });
  }

  // Question pages
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let { width: pageW, height: pageH } = page.getSize();
  applyNumeracyContentTheme(page, themeAssets, { top: margin, bottom: margin, left: margin, right: margin });
  let y = pageH - margin;

  const maxW = pageW - margin * 2;

  const startNewPage = () => {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    ({ width: pageW, height: pageH } = page.getSize());
    applyNumeracyContentTheme(page, themeAssets, { top: margin, bottom: margin, left: margin, right: margin });
    y = pageH - margin;
  };

  for (let i = 0; i < problems.length; i++) {
    const p = problems[i];
    const userValue = answers[p.id];
    const { user, correct, ok } = formatProblemAnswer(p, userValue);

    // Space check (rough)
    if (y < margin + 220) startNewPage();

    drawHeading(page, margin, y, `${i + 1}. ${p.metadata.subtopic.toUpperCase()} • Difficulty ${p.metadata.difficulty}`, bold);
    y -= lineH + 2;

    for (const ln of wrapText(font, p.questionText, bodySize, maxW)) {
      page.drawText(safeText(ln), { x: margin, y, size: bodySize, font, color: rgb(0, 0, 0) });
      y -= lineH;
    }

    y -= sectionGap;

    // Diagram (drawn)
    if (p.diagram) {
      const boxW = Math.min(maxW, diagramBoxW);
      const boxH = diagramBoxH;

      if (y < margin + boxH + 90) startNewPage();

      page.drawRectangle({
        x: margin,
        y: y - boxH,
        width: boxW,
        height: boxH,
        borderColor: rgb(0.85, 0.85, 0.85),
        borderWidth: 1,
        color: undefined as any,
      });

      drawGeometryDiagram(page, p.diagram, margin, y, boxW, boxH, font);
      y -= boxH + sectionGap;
    }

    // Options
    if (p.type === 'multiple-choice' && p.options?.length) {
      for (const opt of p.options) {
        const isCorrect = opt.id === p.correctAnswer.value;
        const isUser = opt.id === userValue;

        // Use ASCII-only markers so StandardFonts (WinAnsi) render reliably.
        const prefix = isCorrect ? '[x]' : isUser ? '[*]' : '[ ]';
        const line = `${prefix} ${safeText(opt.text)}`;
        for (const ln of wrapText(font, line, 10, maxW)) {
          page.drawText(safeText(ln), { x: margin + 10, y, size: 10, font, color: rgb(0.15, 0.15, 0.15) });
          y -= lineH;
        }
      }

      y -= sectionGap;
    }

    const userColor = ok ? rgb(0.0, 0.5, 0.1) : rgb(0.7, 0.0, 0.0);

    page.drawText(`Your answer: ${safeText(user)}`, { x: margin, y, size: bodySize, font: bold, color: userColor });
    y -= lineH;
    page.drawText(`Correct: ${safeText(correct)}`, { x: margin, y, size: bodySize, font, color: rgb(0.15, 0.15, 0.15) });
    y -= lineH + 2;

    const expLines = wrapText(font, `Explanation: ${p.explanation}`, 10, maxW);
    for (const ln of expLines) {
      page.drawText(safeText(ln), { x: margin, y, size: 10, font, color: rgb(0.25, 0.25, 0.25) });
      y -= lineH;
      if (y < margin + 60) startNewPage();
    }

    y -= questionBlockGap;
  }

  return pdfDoc.save();
}
