export const NAPLAN_BAND_SPECTRUM = [
  '#d73027', // red
  '#fc8d59', // orange
  '#fee08b', // yellow
  '#d9ef8b', // yellow-green
  '#1a9850', // green
] as const;

export function naplanSpectrumColor(t: number): string {
  const clamped = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  const n = NAPLAN_BAND_SPECTRUM.length;
  const scaled = clamped * (n - 1);
  const i = Math.floor(scaled);
  const f = scaled - i;

  const a = hexToRgb(NAPLAN_BAND_SPECTRUM[i]);
  const b = hexToRgb(NAPLAN_BAND_SPECTRUM[Math.min(n - 1, i + 1)]);

  const r = Math.round(a.r + (b.r - a.r) * f);
  const g = Math.round(a.g + (b.g - a.g) * f);
  const bl = Math.round(a.b + (b.b - a.b) * f);

  return `rgb(${r}, ${g}, ${bl})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '').trim();
  const full = cleaned.length === 3 ? cleaned.split('').map((c) => c + c).join('') : cleaned;
  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}
