import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';
import type { RMStory } from './readingMagazine/adminTypes';
import { loadRmImagesManifest, loadRmStory } from './readingMagazine/adminStorageService';
import { getImagePreviewUrl } from './readingMagazine/adminImageService';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGINS = { top: 56, bottom: 56, left: 52, right: 52 };

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

function drawVerticalGradient(page: PDFPage, top: [number, number, number], bottom: [number, number, number], steps = 28): void {
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

function formatDateLine(value?: string): string {
  const v = String(value ?? '').trim();
  if (!v) return '';
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return v;
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return v;
  }
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

  // Match Addition PDF theme (deep teal + aqua + gold accent)
  const deepTeal: [number, number, number] = [0.0, 0.31, 0.44];
  const softAqua: [number, number, number] = [0.96, 0.99, 0.99];
  const accentGold: [number, number, number] = [0.95, 0.66, 0.18];
  const inkOnDark: [number, number, number] = [1, 1, 1];
  const inkMuted: [number, number, number] = [0.93, 0.98, 0.98];

  drawVerticalGradient(page, deepTeal, softAqua, 30);

  // Soft decorative circles
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

  // Title block
  const x = MARGINS.left;
  const titleY = PAGE_HEIGHT - 170;
  page.drawText(normalizeText('YEAR 3 • READING MAGAZINE'), {
    x,
    y: titleY + 46,
    size: 12,
    font: fontBold,
    color: rgb(inkMuted[0], inkMuted[1], inkMuted[2]),
  });
  page.drawText(normalizeText(title), {
    x,
    y: titleY,
    size: 34,
    font: fontBold,
    color: rgb(inkOnDark[0], inkOnDark[1], inkOnDark[2]),
  });
  page.drawLine({
    start: { x, y: titleY - 14 },
    end: { x: x + 300, y: titleY - 14 },
    thickness: 2,
    color: rgb(accentGold[0], accentGold[1], accentGold[2]),
    opacity: 0.95,
  } as any);
  page.drawText(normalizeText('Practice Workbook'), {
    x,
    y: titleY - 40,
    size: 16,
    font,
    color: rgb(inkMuted[0], inkMuted[1], inkMuted[2]),
  });

  // Student + metadata
  const metaY = titleY - 100;
  page.drawText(normalizeText(`Student: ${studentName}`), {
    x,
    y: metaY,
    size: 16,
    font: fontBold,
    color: rgb(inkOnDark[0], inkOnDark[1], inkOnDark[2]),
  });
  if (dateLine) {
    page.drawText(normalizeText(`Date: ${dateLine}`), {
      x,
      y: metaY - 22,
      size: 11,
      font,
      color: rgb(inkMuted[0], inkMuted[1], inkMuted[2]),
    });
  }
  if (marksLine) {
    page.drawText(normalizeText(`Marks: ${marksLine}`), {
      x,
      y: metaY - 44,
      size: 12,
      font: fontBold,
      color: rgb(accentGold[0], accentGold[1], accentGold[2]),
    });
  }
  if (sessionId) {
    page.drawText(normalizeText(`Session: ${sessionId}`), {
      x,
      y: metaY - 62,
      size: 9,
      font,
      color: rgb(inkMuted[0], inkMuted[1], inkMuted[2]),
    });
  }

  // Large logo near bottom
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

type ReadingPracticeSession = {
  topic?: string;
  year?: number;
  isoDate?: string;
  submittedAt?: string;
  score?: { correct: number; total: number; percentage: number };
  story?: { storyId?: string; title?: string; type?: string; updatedAt?: string };
  questions?: Array<{ id: string; prompt: string; choices: string[]; correctIndex: number }>;
  answers?: Array<{ questionId: string; selectedIndex: number; correctIndex: number; ok: boolean }>;
};

type StoryBlock =
  | { kind: 'heading'; heading: string; text: string }
  | { kind: 'paragraph'; text: string };

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

function drawLogoWatermark(page: PDFPage, logoImage: any): void {
  const { width: pageWidth, height: pageHeight } = page.getSize();

  const maxWidth = pageWidth - MARGINS.left - MARGINS.right;
  const maxHeight = pageHeight - MARGINS.top - MARGINS.bottom;

  const widthScale = maxWidth / logoImage.width;
  const heightScale = maxHeight / logoImage.height;
  const scale = Math.min(widthScale, heightScale) * 0.8;

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

function normalizeText(text: string): string {
  // pdf-lib StandardFonts are WinAnsi encoded. Normalize common Unicode punctuation.
  return text
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2014/g, '-')
    .replace(/\u2026/g, '...');
}

function wrapText(font: PDFFont, text: string, fontSize: number, maxWidth: number): string[] {
  const words = normalizeText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    const width = font.widthOfTextAtSize(next, fontSize);
    if (width <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function buildStoryBlocks(story: RMStory | null): StoryBlock[] {
  if (!story) return [];

  const paragraphs = String(story.text ?? '')
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean);

  const headingBlocks: StoryBlock[] = (story.headings ?? []).map((h) => ({
    kind: 'heading',
    heading: h.heading,
    text: h.text,
  }));

  const normalize = (s: string) => String(s ?? '').trim().replace(/\s+/g, ' ');
  const headingTextSet = new Set((story.headings ?? []).map((h) => normalize(h.text)).filter(Boolean));

  const paragraphBlocks: StoryBlock[] = paragraphs
    .filter((p) => !headingTextSet.has(normalize(p)))
    .map((p) => ({ kind: 'paragraph', text: p }));

  return headingBlocks.length > 0 ? [...headingBlocks, ...paragraphBlocks] : paragraphBlocks;
}

function splitInHalf<T>(items: T[]): [T[], T[]] {
  const list = items ?? [];
  const mid = Math.ceil(list.length / 2);
  return [list.slice(0, mid), list.slice(mid)];
}

async function tryEmbedRemoteImage(pdfDoc: PDFDocument, url: string): Promise<any | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    if (contentType.includes('webp')) return null;

    if (contentType.includes('png')) return await pdfDoc.embedPng(bytes);
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return await pdfDoc.embedJpg(bytes);

    // Best-effort fallback
    try {
      return await pdfDoc.embedJpg(bytes);
    } catch {
      try {
        return await pdfDoc.embedPng(bytes);
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
}

async function loadReadingMaterialAssets(pdfDoc: PDFDocument, storyId?: string): Promise<{
  story: RMStory | null;
  image1: any | null;
  image2: any | null;
}> {
  if (!storyId) return { story: null, image1: null, image2: null };

  try {
    const [story, manifest] = await Promise.all([loadRmStory(storyId), loadRmImagesManifest(storyId)]);

    const urlEntries = await Promise.all(
      (manifest.images ?? []).map(async (img) => {
        const url = img?.storagePath ? await getImagePreviewUrl(img.storagePath) : null;
        return url ? ([img.captionIndex, url] as const) : null;
      })
    );

    const urlMap: Record<number, string> = {};
    for (const entry of urlEntries) {
      if (!entry) continue;
      const [captionIndex, url] = entry;
      urlMap[captionIndex] = url;
    }

    const captionsCount = Array.isArray(story.captions) ? story.captions.length : 0;
    const urls: string[] = [];
    for (let i = 0; i < captionsCount; i++) {
      const u = urlMap[i];
      if (u) urls.push(u);
    }
    if (urls.length === 0) {
      const u0 = urlMap[0];
      const u1 = urlMap[1];
      if (u0) urls.push(u0);
      if (u1) urls.push(u1);
    }

    const [image1, image2] = await Promise.all([
      urls[0] ? tryEmbedRemoteImage(pdfDoc, urls[0]) : Promise.resolve(null),
      urls[1] ? tryEmbedRemoteImage(pdfDoc, urls[1]) : Promise.resolve(null),
    ]);

    return { story, image1, image2 };
  } catch {
    return { story: null, image1: null, image2: null };
  }
}

function drawImageContain(params: {
  page: PDFPage;
  image: any;
  x: number;
  y: number;
  width: number;
  height: number;
}): void {
  const { page, image, x, y, width, height } = params;
  const scale = Math.min(width / image.width, height / image.height);
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  const dx = x + (width - drawW) / 2;
  const dy = y + (height - drawH) / 2;
  page.drawImage(image, { x: dx, y: dy, width: drawW, height: drawH } as any);
}

function drawStoryBlocksInBox(params: {
  page: PDFPage;
  blocks: StoryBlock[];
  x: number;
  yTop: number;
  width: number;
  height: number;
  helvetica: PDFFont;
  helveticaBold: PDFFont;
}): void {
  const { page, blocks, x, yTop, width, height, helvetica, helveticaBold } = params;
  const yBottom = yTop - height;
  let y = yTop;
  const lineH = 12.5;

  for (const b of blocks) {
    if (y - lineH < yBottom) break;
    if (b.kind === 'heading') {
      const headingLines = wrapText(helveticaBold, b.heading ?? '', 11, width);
      for (const line of headingLines) {
        if (y - lineH < yBottom) return;
        page.drawText(normalizeText(line), {
          x,
          y,
          size: 11,
          font: helveticaBold,
          color: rgb(0.11, 0.12, 0.14),
        });
        y -= lineH;
      }

      const bodyLines = wrapText(helvetica, b.text ?? '', 10.5, width);
      for (const line of bodyLines) {
        if (y - lineH < yBottom) return;
        page.drawText(normalizeText(line), {
          x,
          y,
          size: 10.5,
          font: helvetica,
          color: rgb(0.18, 0.2, 0.23),
        });
        y -= lineH;
      }
      y -= 6;
    } else {
      const paraLines = wrapText(helvetica, b.text ?? '', 10.5, width);
      for (const line of paraLines) {
        if (y - lineH < yBottom) return;
        page.drawText(normalizeText(line), {
          x,
          y,
          size: 10.5,
          font: helvetica,
          color: rgb(0.18, 0.2, 0.23),
        });
        y -= lineH;
      }
      y -= 6;
    }
  }
}

function drawHeader(params: {
  page: PDFPage;
  title: string;
  subTitle: string;
  helvetica: PDFFont;
  helveticaBold: PDFFont;
}): number {
  const { page, title, subTitle, helvetica, helveticaBold } = params;

  const yTop = PAGE_HEIGHT - MARGINS.top;

  page.drawText(title, {
    x: MARGINS.left,
    y: yTop,
    size: 18,
    font: helveticaBold,
    color: rgb(0.11, 0.12, 0.14),
  });

  page.drawText(subTitle, {
    x: MARGINS.left,
    y: yTop - 22,
    size: 11,
    font: helvetica,
    color: rgb(0.35, 0.38, 0.42),
  });

  page.drawLine({
    start: { x: MARGINS.left, y: yTop - 34 },
    end: { x: PAGE_WIDTH - MARGINS.right, y: yTop - 34 },
    thickness: 1,
    color: rgb(0.9, 0.91, 0.92),
  });

  return 46;
}

export async function buildReadingMagazinePdf(params: {
  title: string;
  session: ReadingPracticeSession;
  createdAtIso?: string;
  studentName?: string;
  score?: { correct: number; total: number; percentage: number };
  sessionId?: string;
}): Promise<Uint8Array> {
  const { title, session } = params;

  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const logoBytes = await tryFetchLogoPngBytes();
  const logoImage = logoBytes ? await pdfDoc.embedPng(logoBytes) : null;

  const createdAtIso =
    params.createdAtIso ??
    session.submittedAt ??
    session.isoDate ??
    '';

  const dateLine = formatDateLine(createdAtIso);
  const score = params.score ?? session.score;
  const marksLine = score && Number.isFinite(score.total) && score.total > 0
    ? `${score.correct} / ${score.total} (${score.percentage}%)`
    : '';

  const studentName = normalizeText(String(params.studentName ?? 'Student'));
  const sessionId = params.sessionId;

  // Preload story + images so we can insert Reading material as Page 2.
  const storyId = session.story?.storyId;
  const readingAssets = await loadReadingMaterialAssets(pdfDoc, storyId);

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
      font: helvetica,
      fontBold: helveticaBold,
      logoImage,
    });
  }

  const createPage = (headerSubTitle: string) => {
    const p = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    if (logoImage) drawLogoWatermark(p, logoImage);
    drawGoldenPageBorder(p);
    let yCursor = PAGE_HEIGHT - MARGINS.top;
    yCursor -= drawHeader({ page: p, title, subTitle: headerSubTitle, helvetica, helveticaBold });
    return { page: p, y: yCursor };
  };

  const storyTitle = session.story?.title ?? 'Story';
  const isoDate = session.isoDate ?? (session.submittedAt ? session.submittedAt.slice(0, 10) : '');
  const scoreLine = score ? `Score: ${score.correct}/${score.total} (${score.percentage}%)` : '';

  const firstHeader = [isoDate ? `Date: ${isoDate}` : '', scoreLine].filter(Boolean).join('   •   ');

  const questions = Array.isArray(session.questions) ? session.questions : [];
  const answers = Array.isArray(session.answers) ? session.answers : [];

  const contentWidth = PAGE_WIDTH - MARGINS.left - MARGINS.right;
  const lineH = 13;

  let readingPageInserted = false;
  const insertReadingPageOnce = () => {
    if (readingPageInserted) return;
    readingPageInserted = true;

    const sub = `Reading • ${readingAssets.story?.title ?? storyTitle}`;
    const next = createPage(sub);
    const page = next.page;

    const s = readingAssets.story;
    const blocks = buildStoryBlocks(s);
    const [topBlocks, bottomBlocks] = splitInHalf(blocks);

    // Title line
    let yCursor = next.y;
    const typeLine = s?.type ? String(s.type).toUpperCase() : (session.story?.type ?? '').toUpperCase();
    if (typeLine) {
      page.drawText(normalizeText(typeLine), {
        x: MARGINS.left,
        y: yCursor,
        size: 10,
        font: helveticaBold,
        color: rgb(0.35, 0.38, 0.42),
      });
      yCursor -= 14;
    }

    page.drawText(normalizeText(s?.title ?? storyTitle), {
      x: MARGINS.left,
      y: yCursor,
      size: 16,
      font: helveticaBold,
      color: rgb(0.12, 0.16, 0.23),
    });
    yCursor -= 18;

    const gap = 14;
    const availableHeight = yCursor - MARGINS.bottom;
    const halfH = Math.max(220, (availableHeight - gap) / 2);
    const colGap = 14;
    const colW = (contentWidth - colGap) / 2;

    const yTopHalfTop = yCursor;
    const yTopHalfBottom = yTopHalfTop - halfH;
    const yBottomHalfTop = yTopHalfBottom - gap;
    const yBottomHalfBottom = yBottomHalfTop - halfH;

    const drawImageBox = (x: number, yBottom: number, w: number, h: number, img: any | null) => {
      if (img) {
        drawImageContain({ page, image: img, x: x + 6, y: yBottom + 6, width: w - 12, height: h - 12 });
      } else {
        page.drawText('Image unavailable', { x: x + 10, y: yBottom + h / 2, size: 10, font: helvetica, color: rgb(0.55, 0.57, 0.6) });
      }
    };

    // If we have images, mimic the Reading tab's split layout.
    // Otherwise, show text in the right column and a simple cover block on the left.
    const hasImages = Boolean(readingAssets.image1 || readingAssets.image2);
    if (hasImages) {
      // Upper half: text left, image right
      drawStoryBlocksInBox({
        page,
        blocks: topBlocks,
        x: MARGINS.left,
        yTop: yTopHalfTop,
        width: colW,
        height: halfH,
        helvetica,
        helveticaBold,
      });
      drawImageBox(MARGINS.left + colW + colGap, yTopHalfBottom, colW, halfH, readingAssets.image1);

      // Lower half: image left, text right
      drawImageBox(MARGINS.left, yBottomHalfBottom, colW, halfH, readingAssets.image2);
      drawStoryBlocksInBox({
        page,
        blocks: bottomBlocks,
        x: MARGINS.left + colW + colGap,
        yTop: yBottomHalfTop,
        width: colW,
        height: halfH,
        helvetica,
        helveticaBold,
      });
    } else {
      // Cover-ish left block
      const coverH = Math.min(halfH * 2 + gap, availableHeight);
      page.drawRectangle({
        x: MARGINS.left,
        y: MARGINS.bottom,
        width: colW,
        height: coverH,
        color: rgb(0.95, 0.96, 0.98),
      });
      page.drawText('Reading Magazine', { x: MARGINS.left + 14, y: MARGINS.bottom + coverH - 28, size: 12, font: helveticaBold, color: rgb(0.2, 0.22, 0.25) });
      page.drawText(normalizeText(s?.title ?? storyTitle), { x: MARGINS.left + 14, y: MARGINS.bottom + coverH - 48, size: 11, font: helvetica, color: rgb(0.25, 0.27, 0.3) });

      // Full text on the right
      drawStoryBlocksInBox({
        page,
        blocks,
        x: MARGINS.left + colW + colGap,
        yTop: yCursor,
        width: colW,
        height: availableHeight,
        helvetica,
        helveticaBold,
      });
    }
  };

  // Ensure Page 2 is always the Reading material page (cover is Page 1).
  insertReadingPageOnce();

  // Questions start after the cover + reading material.
  let { page: currentPage, y } = createPage(firstHeader);

  currentPage.drawText(normalizeText(storyTitle), {
    x: MARGINS.left,
    y,
    size: 14,
    font: helveticaBold,
    color: rgb(0.12, 0.16, 0.23),
  });
  y -= 22;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const a = answers.find((x) => x.questionId === q.id);

    const questionLabel = `Q${i + 1}. ${q.prompt ?? ''}`;
    const qLines = wrapText(helveticaBold, questionLabel, 11, contentWidth);

    // Simple pagination
    const estimatedHeight = qLines.length * lineH + 6 + 4 * lineH + 18;
    if (y - estimatedHeight < MARGINS.bottom) {
      // Ensure Page 2 is always the Reading material page.
      // Any overflow question pages start from Page 3.
      insertReadingPageOnce();

      const next = createPage(storyTitle);
      currentPage = next.page;
      y = next.y;
    }

    for (const line of qLines) {
      currentPage.drawText(normalizeText(line), {
        x: MARGINS.left,
        y,
        size: 11,
        font: helveticaBold,
        color: rgb(0.11, 0.12, 0.14),
      });
      y -= lineH;
    }

    y -= 4;

    const choices: string[] = Array.isArray(q.choices) ? q.choices : [];
    for (let c = 0; c < choices.length; c++) {
      const prefix = String.fromCharCode(65 + c);
      const selected = typeof a?.selectedIndex === 'number' && a.selectedIndex === c;
      const correct = typeof q.correctIndex === 'number' && q.correctIndex === c;

      // pdf-lib's built-in WinAnsi fonts can't encode glyphs like ✓/✗.
      // Use plain ASCII markers so PDF generation is robust.
      const tag = selected ? (correct ? '[selected, correct]' : '[selected]') : correct ? '[correct]' : '';

      const line = `${prefix}. ${choices[c]}${tag ? `   ${tag}` : ''}`;
      const color = correct ? rgb(0.09, 0.64, 0.33) : selected ? rgb(0.86, 0.15, 0.15) : rgb(0.18, 0.2, 0.23);

      const lines = wrapText(helvetica, line, 11, contentWidth);
      for (const l of lines) {
        currentPage.drawText(normalizeText(l), {
          x: MARGINS.left + 14,
          y,
          size: 11,
          font: helvetica,
          color,
        });
        y -= lineH;
      }
    }

    y -= 12;
  }

  // If questions fit on Page 1, add Reading material as Page 2.
  insertReadingPageOnce();

  return await pdfDoc.save();
}
