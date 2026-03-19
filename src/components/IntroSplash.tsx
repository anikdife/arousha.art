import React, { useEffect, useMemo, useState } from 'react';
import './IntroSplash.css';

type TileTransform = {
  dx: number;
  dy: number;
  r: number;
  s: number;
  o: number;
  floatDelayMs: number;
};

type TileSprite = {
  id: string;
  row: number;
  col: number;
  clipId: string;
  scatter: TileTransform;
};

type Props = {
  onDone: () => void;
  durationMs?: number;
};

const INTRO_SEED_KEY = 'introLogoTilesSeedV1';

function safeGetSessionItem(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetSessionItem(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function cyrb128(str: string) {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0, k: number; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0] as const;
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

export const IntroSplash: React.FC<Props> = ({ onDone, durationMs = 3000 }) => {
  const reduced = prefersReducedMotion();

  const [step, setStep] = useState<'scatter' | 'assemble-overshoot' | 'assemble'>(() => (reduced ? 'assemble' : 'scatter'));
  const [showText, setShowText] = useState<boolean>(() => false);
  const [shineActive, setShineActive] = useState<boolean>(() => false);
  const [fadingOut, setFadingOut] = useState<boolean>(() => false);
  const [merged, setMerged] = useState<boolean>(() => reduced);

  const viewW = 1000;
  const viewH = 1000;

  const logoBox = useMemo(() => {
    return {
      x: 200,
      y: 260,
      w: 600,
      h: 320,
    };
  }, []);

  const grid = useMemo(() => {
    const cols = 20;
    const rows = 16;
    const tileW = logoBox.w / cols;
    const tileH = logoBox.h / rows;
    return { cols, rows, tileW, tileH };
  }, [logoBox.h, logoBox.w]);

  const logoHref = useMemo(() => {
    const base = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
    return `${base}/logo%20of%20arousha.art.png`;
  }, []);

  const tiles = useMemo<TileSprite[]>(() => {
    const existing = safeGetSessionItem(INTRO_SEED_KEY);
    const seedStr = existing ?? `introLogoTiles-v1-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    if (!existing) safeSetSessionItem(INTRO_SEED_KEY, seedStr);

    const [seed] = cyrb128(seedStr);
    const rand = mulberry32(seed);

    const maxOffset = Math.round(viewW * 0.35); // 35% of screen

    const out: TileSprite[] = [];
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const id = `tile-${r}-${c}`;
        const dx = lerp(-maxOffset, maxOffset, rand());
        const dy = lerp(-maxOffset, maxOffset, rand());
        const rot = lerp(-35, 35, rand());
        const sc = lerp(0.85, 1.15, rand());
        const op = lerp(0.4, 1.0, rand());
        const floatDelayMs = Math.floor(rand() * 700);

        out.push({
          id,
          row: r,
          col: c,
          clipId: `introTileClip-${r}-${c}`,
          scatter: { dx, dy, r: rot, s: sc, o: op, floatDelayMs },
        });
      }
    }
    return out;
  }, [grid.cols, grid.rows, viewW]);

  useEffect(() => {
    const scale = durationMs / 3000;

    // Strict phase boundaries (3.0s total)
    const tAssembleStart = Math.round(800 * scale);
    const tAssembleSettle = Math.round(1500 * scale);
    const tShineStart = Math.round(1600 * scale);
    const tTagline = Math.round(2000 * scale);
    const tFade = Math.round(2850 * scale);
    const tDone = Math.round(3000 * scale);

    const reducedTotal = Math.max(800, Math.min(1000, durationMs));
    const tAssembleStartFinal = reduced ? 10 : tAssembleStart;
    const tAssembleSettleFinal = reduced ? 20 : tAssembleSettle;
    const tShineStartFinal = reduced ? Math.round(reducedTotal * 0.25) : tShineStart;
    const tTaglineFinal = reduced ? Math.round(reducedTotal * 0.35) : tTagline;
    const tFadeFinal = reduced ? Math.round(reducedTotal * 0.7) : tFade;
    const tDoneFinal = reduced ? reducedTotal : tDone;

    const tMergeFinal = reduced ? 30 : Math.round(tAssembleSettleFinal + 120);

    const timers: number[] = [];

    timers.push(
      window.setTimeout(() => {
        setStep('assemble-overshoot');
      }, tAssembleStartFinal)
    );

    timers.push(
      window.setTimeout(() => {
        setStep('assemble');
      }, tAssembleSettleFinal)
    );

    timers.push(
      window.setTimeout(() => {
        setMerged(true);
      }, tMergeFinal)
    );

    timers.push(
      window.setTimeout(() => {
        setShineActive(true);
      }, tShineStartFinal)
    );

    timers.push(
      window.setTimeout(() => {
        setShowText(true);
      }, tTaglineFinal)
    );

    timers.push(
      window.setTimeout(() => {
        setFadingOut(true);
      }, tFadeFinal)
    );

    timers.push(
      window.setTimeout(() => {
        onDone();
      }, tDoneFinal)
    );

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [durationMs, onDone, reduced]);

  return (
    <div
      className={`intro-splash fixed inset-0 z-[9999] ${fadingOut ? 'intro-splash--fade' : ''}`}
      aria-label="Loading"
      role="status"
      data-step={step}
    >
      <svg className="w-full h-full" viewBox={`0 0 ${viewW} ${viewH}`} preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="introBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#eff6ff" />
            <stop offset="55%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f0fdf4" />
          </linearGradient>

          <linearGradient id="introShineGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="40%" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="60%" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          <clipPath id="introLogoClip" clipPathUnits="userSpaceOnUse">
            <rect x={logoBox.x} y={logoBox.y} width={logoBox.w} height={logoBox.h} rx={18} />
          </clipPath>

          {Array.from({ length: grid.rows }).map((_, r) =>
            Array.from({ length: grid.cols }).map((__, c) => {
              const x = logoBox.x + c * grid.tileW;
              const y = logoBox.y + r * grid.tileH;
              const eps = 0.8;
              return (
                <clipPath key={`clip-${r}-${c}`} id={`introTileClip-${r}-${c}`} clipPathUnits="userSpaceOnUse">
                  <rect x={x - eps} y={y - eps} width={grid.tileW + eps * 2} height={grid.tileH + eps * 2} />
                </clipPath>
              );
            })
          )}

          <image
            id="introLogoImage"
            href={logoHref}
            xlinkHref={logoHref}
            x={logoBox.x}
            y={logoBox.y}
            width={logoBox.w}
            height={logoBox.h}
            preserveAspectRatio="none"
          />
        </defs>

        <rect x={0} y={0} width={viewW} height={viewH} fill="url(#introBg)" />

        <g id="introStage" clipPath="url(#introLogoClip)">
          <g className={`intro-tiles ${merged ? 'intro-tiles--hide' : 'intro-tiles--show'}`}>
            {tiles.map((t) => {
              const scatter = t.scatter;

              const isScatter = step === 'scatter';
              const isOver = step === 'assemble-overshoot';

              const dx = isScatter ? scatter.dx : 0;
              const dy = isScatter ? scatter.dy : isOver ? -4 : 0;
              const rot = isScatter ? scatter.r : 0;
              const sc = isScatter ? scatter.s : isOver ? 1.02 : 1;
              const op = isScatter ? scatter.o : 1;

              const floatDelay = `${scatter.floatDelayMs}ms`;

              return (
                <g
                  key={t.id}
                  className={`intro-tile ${isScatter ? 'intro-tile--scatter' : isOver ? 'intro-tile--assemble-overshoot' : 'intro-tile--assemble'}`}
                  style={{
                    opacity: op,
                    transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${sc})`,
                  }}
                >
                  <g
                    className={isScatter ? 'intro-tile__float' : undefined}
                    style={isScatter ? { animationDelay: floatDelay } : undefined}
                  >
                    <g clipPath={`url(#${t.clipId})`}>
                      <use href="#introLogoImage" xlinkHref="#introLogoImage" />
                    </g>
                  </g>
                </g>
              );
            })}
          </g>

          <g className={`intro-merged ${merged ? 'intro-merged--show' : 'intro-merged--hide'}`}>
            <use href="#introLogoImage" xlinkHref="#introLogoImage" />
          </g>

          <g
            className={`intro-shine ${shineActive ? 'intro-shine--active' : ''}`}
            style={{ opacity: shineActive ? 1 : 0 }}
          >
            <g transform={`rotate(-18 ${viewW / 2} ${viewH / 2})`}>
              <rect
                x={-500}
                y={logoBox.y - 300}
                width={450}
                height={logoBox.h + 600}
                fill="url(#introShineGrad)" 
              />
            </g>
          </g>
        </g>

        <g className={`intro-tagline ${showText ? 'intro-tagline--show' : ''}`}>
          <text
            x={viewW / 2}
            y={logoBox.y + logoBox.h + 85}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#1e3a8a"
            fontSize={40}
            fontWeight={600}
            letterSpacing={1.2}
          >
            The art of learning
          </text>
        </g>
      </svg>

      <div className="sr-only">Loading</div>
    </div>
  );
};
