import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from 'pdf-lib';

export const NUMERACY_PAGE_WIDTH = 595.28;
export const NUMERACY_PAGE_HEIGHT = 841.89;

export const NUMERACY_DEFAULT_MARGINS = {
  top: 60,
  bottom: 60,
  left: 50,
  right: 50,
};

export type NumeracyThemeFonts = {
  regular: PDFFont;
  bold: PDFFont;
};

export type NumeracyThemeAssets = {
  logoImage: any | null;
};

export function safeText(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

export function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? 0 : t;
  }
  if (typeof value?.toDate === 'function') {
    try {
      return value.toDate().getTime();
    } catch {
      return 0;
    }
  }
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'number') return value;
  return 0;
}

export function formatDateLine(createdAtIso?: string): string {
  const ms = toMillis(createdAtIso);
  if (!ms) return '';
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

export async function loadNumeracyThemeFonts(pdfDoc: PDFDocument): Promise<NumeracyThemeFonts> {
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  return { regular, bold };
}

export async function loadNumeracyThemeAssets(pdfDoc: PDFDocument): Promise<NumeracyThemeAssets> {
  const logoPng = await tryFetchLogoPngBytes();
  const logoImage = logoPng ? await pdfDoc.embedPng(logoPng) : null;
  return { logoImage };
}

export function drawText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, color = rgb(0, 0, 0)) {
  page.drawText(safeText(text), { x, y, size, font, color });
}

export function drawLogoWatermark(
  page: PDFPage,
  logoImage: any,
  margins = NUMERACY_DEFAULT_MARGINS,
  options?: { opacity?: number; scaleMultiplier?: number }
): void {
  const { width: pageWidth, height: pageHeight } = page.getSize();

  const maxWidth = pageWidth - margins.left - margins.right;
  const maxHeight = pageHeight - margins.top - margins.bottom;

  const widthScale = maxWidth / logoImage.width;
  const heightScale = maxHeight / logoImage.height;
  const scale = Math.min(widthScale, heightScale) * (options?.scaleMultiplier ?? 0.75);

  const drawWidth = logoImage.width * scale;
  const drawHeight = logoImage.height * scale;

  page.drawImage(logoImage, {
    x: (pageWidth - drawWidth) / 2,
    y: (pageHeight - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
    opacity: options?.opacity ?? 0.06,
  } as any);
}

export function drawGoldenPageBorder(page: PDFPage, pageWidth = NUMERACY_PAGE_WIDTH, pageHeight = NUMERACY_PAGE_HEIGHT): void {
  const inset = 18;
  const borderWidth = 2;
  const gold = rgb(0.95, 0.66, 0.18);

  page.drawRectangle({
    x: inset,
    y: inset,
    width: pageWidth - inset * 2,
    height: pageHeight - inset * 2,
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
  pageWidth = NUMERACY_PAGE_WIDTH,
  pageHeight = NUMERACY_PAGE_HEIGHT,
  steps = 28
): void {
  const sliceH = pageHeight / steps;
  for (let i = 0; i < steps; i++) {
    const t = i / Math.max(1, steps - 1);
    const r = lerp(bottom[0], top[0], t);
    const g = lerp(bottom[1], top[1], t);
    const b = lerp(bottom[2], top[2], t);
    page.drawRectangle({
      x: 0,
      y: i * sliceH,
      width: pageWidth,
      height: sliceH + 1,
      color: rgb(r, g, b),
    });
  }
}

export function drawNumeracyCoverPage(params: {
  page: PDFPage;
  title: string;
  studentName: string;
  dateLine: string;
  marksLine: string;
  sessionId?: string;
  sectionLabel?: string;
  font: PDFFont;
  fontBold: PDFFont;
  logoImage: any | null;
  margins?: typeof NUMERACY_DEFAULT_MARGINS;
}): void {
  const {
    page,
    title,
    studentName,
    dateLine,
    marksLine,
    sessionId,
    sectionLabel,
    font,
    fontBold,
    logoImage,
    margins,
  } = params;

  const m = margins ?? NUMERACY_DEFAULT_MARGINS;

  const deepTeal: [number, number, number] = [0.0, 0.31, 0.44];
  const softAqua: [number, number, number] = [0.96, 0.99, 0.99];
  const accentGold: [number, number, number] = [0.95, 0.66, 0.18];
  const inkOnDark: [number, number, number] = [1, 1, 1];
  const inkMuted: [number, number, number] = [0.93, 0.98, 0.98];

  drawVerticalGradient(page, deepTeal, softAqua, NUMERACY_PAGE_WIDTH, NUMERACY_PAGE_HEIGHT, 30);

  page.drawCircle({ x: NUMERACY_PAGE_WIDTH - 70, y: NUMERACY_PAGE_HEIGHT - 110, size: 160, color: rgb(1, 1, 1), opacity: 0.1 } as any);
  page.drawCircle({ x: 90, y: 150, size: 210, color: rgb(0.12, 0.7, 0.64), opacity: 0.1 } as any);
  page.drawCircle({
    x: NUMERACY_PAGE_WIDTH - 170,
    y: 250,
    size: 110,
    color: rgb(accentGold[0], accentGold[1], accentGold[2]),
    opacity: 0.1,
  } as any);

  const x = m.left;
  const titleY = NUMERACY_PAGE_HEIGHT - 170;

  drawText(page, sectionLabel ?? 'YEAR 3 • NUMERACY', x, titleY + 46, fontBold, 12, rgb(inkMuted[0], inkMuted[1], inkMuted[2]));
  drawText(page, title, x, titleY, fontBold, 34, rgb(inkOnDark[0], inkOnDark[1], inkOnDark[2]));
  page.drawLine({
    start: { x, y: titleY - 14 },
    end: { x: x + 260, y: titleY - 14 },
    thickness: 2,
    color: rgb(accentGold[0], accentGold[1], accentGold[2]),
    opacity: 0.95,
  } as any);
  drawText(page, 'Practice Workbook', x, titleY - 40, font, 16, rgb(inkMuted[0], inkMuted[1], inkMuted[2]));

  const metaY = titleY - 100;
  drawText(page, `Student: ${studentName}`, x, metaY, fontBold, 16, rgb(inkOnDark[0], inkOnDark[1], inkOnDark[2]));
  if (dateLine) drawText(page, `Date: ${dateLine}`, x, metaY - 22, font, 11, rgb(inkMuted[0], inkMuted[1], inkMuted[2]));
  if (marksLine) drawText(page, `Marks: ${marksLine}`, x, metaY - 44, fontBold, 12, rgb(accentGold[0], accentGold[1], accentGold[2]));
  if (sessionId) drawText(page, `Session: ${sessionId}`, x, metaY - 62, font, 9, rgb(inkMuted[0], inkMuted[1], inkMuted[2]));

  if (logoImage) {
    const maxLogoWidth = 320;
    const maxLogoHeight = 140;

    const widthScale = maxLogoWidth / logoImage.width;
    const heightScale = maxLogoHeight / logoImage.height;
    const scale = Math.min(widthScale, heightScale);

    const drawWidth = logoImage.width * scale;
    const drawHeight = logoImage.height * scale;

    const lx = (NUMERACY_PAGE_WIDTH - drawWidth) / 2;
    const ly = 70;

    page.drawRectangle({
      x: lx - 10,
      y: ly - 8,
      width: drawWidth + 20,
      height: drawHeight + 16,
      color: rgb(0, 0, 0),
      opacity: 0.08,
    } as any);

    page.drawImage(logoImage, { x: lx, y: ly, width: drawWidth, height: drawHeight, opacity: 1 } as any);
  }
}

export function applyNumeracyContentTheme(page: PDFPage, assets: NumeracyThemeAssets, margins = NUMERACY_DEFAULT_MARGINS): void {
  if (assets.logoImage) drawLogoWatermark(page, assets.logoImage, margins);
  drawGoldenPageBorder(page, NUMERACY_PAGE_WIDTH, NUMERACY_PAGE_HEIGHT);
}
