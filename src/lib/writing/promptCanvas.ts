import type { WritingPromptY3 } from './promptLoader';

export const WRITING_PROMPT_PAGE_W = 794;
export const WRITING_PROMPT_PAGE_H = 1123;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;

  const scale = Math.max(w / iw, h / ih);
  const sw = iw * scale;
  const sh = ih * scale;
  const dx = (w - sw) / 2;
  const dy = (h - sh) / 2;
  ctx.drawImage(img, dx, dy, sw, sh);
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = (text ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const test = `${current} ${words[i]}`;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const lines = wrapLines(ctx, text, maxWidth);
  const clipped = lines.slice(0, maxLines);
  for (let i = 0; i < clipped.length; i++) {
    ctx.fillText(clipped[i], x, y + i * lineHeight);
  }
  return y + clipped.length * lineHeight;
}

export function clearPromptCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = WRITING_PROMPT_PAGE_W;
  canvas.height = WRITING_PROMPT_PAGE_H;
  ctx.clearRect(0, 0, WRITING_PROMPT_PAGE_W, WRITING_PROMPT_PAGE_H);
  ctx.fillStyle = '#F3F4F6';
  ctx.fillRect(0, 0, WRITING_PROMPT_PAGE_W, WRITING_PROMPT_PAGE_H);
}

export function drawWritingPromptPage(canvas: HTMLCanvasElement, prompt: WritingPromptY3, imageUrl: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = WRITING_PROMPT_PAGE_W;
  canvas.height = WRITING_PROMPT_PAGE_H;

  ctx.clearRect(0, 0, WRITING_PROMPT_PAGE_W, WRITING_PROMPT_PAGE_H);

  const margin = 44;
  const panelX = margin;
  const panelY = margin;
  const panelW = WRITING_PROMPT_PAGE_W - margin * 2;
  const panelH = WRITING_PROMPT_PAGE_H - margin * 2;

  const finish = () => {
    // White text panel
    ctx.fillStyle = 'rgba(255,255,255,0.90)';
    ctx.fillRect(panelX, panelY, panelW, panelH);

    let y = panelY + 60;
    const x = panelX + 42;
    const maxW = panelW - 84;

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#111827';

    ctx.font = '700 40px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
    y = drawTextBlock(ctx, prompt.title, x, y, maxW, 48, 3) + 10;

    ctx.font = '600 18px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
    ctx.fillStyle = '#374151';
    y = drawTextBlock(ctx, `Year 3 • Writing • ${prompt.type}`, x, y, maxW, 26, 2) + 20;

    ctx.font = '400 24px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
    ctx.fillStyle = '#111827';
    y = drawTextBlock(ctx, prompt.taskIntro, x, y, maxW, 36, 10) + 26;

    ctx.font = '700 24px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
    ctx.fillStyle = '#111827';
    y = drawTextBlock(ctx, 'Guidance', x, y, maxW, 34, 1) + 12;

    ctx.font = '400 21px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
    ctx.fillStyle = '#111827';
    const guidance = (prompt.guidance ?? []).slice(0, 6);
    for (const g of guidance) {
      y = drawTextBlock(ctx, `• ${g}`, x, y, maxW, 30, 2);
    }
    y += 18;

    ctx.font = '700 24px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
    ctx.fillStyle = '#111827';
    y = drawTextBlock(ctx, 'Remember', x, y, maxW, 34, 1) + 12;

    ctx.font = '400 21px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
    ctx.fillStyle = '#111827';
    const remember = (prompt.remember ?? []).slice(0, 7);
    const remainingLines = Math.max(4, Math.floor((panelY + panelH - 60 - y) / 30));
    const maxBullets = clamp(remember.length, 0, 8);
    const linesPerBullet = Math.max(1, Math.floor(remainingLines / Math.max(1, maxBullets)));
    for (const r of remember.slice(0, maxBullets)) {
      y = drawTextBlock(ctx, `• ${r}`, x, y, maxW, 30, linesPerBullet);
    }
  };

  if (imageUrl) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.save();
      ctx.globalAlpha = 1;
      drawCover(ctx, img, WRITING_PROMPT_PAGE_W, WRITING_PROMPT_PAGE_H);
      ctx.restore();
      finish();
    };
    img.onerror = () => {
      ctx.fillStyle = '#F3F4F6';
      ctx.fillRect(0, 0, WRITING_PROMPT_PAGE_W, WRITING_PROMPT_PAGE_H);
      finish();
    };
    img.src = imageUrl;
  } else {
    ctx.fillStyle = '#F3F4F6';
    ctx.fillRect(0, 0, WRITING_PROMPT_PAGE_W, WRITING_PROMPT_PAGE_H);
    finish();
  }
}
