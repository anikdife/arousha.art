import React from 'react';
import * as THREE from 'three';
import { useNavigate } from 'react-router-dom';
import './practiceOverlay.css';

import { generateAdditionPage } from '../../lib/additionGenerator';
import { generateMultiplicationPage } from '../../lib/generators/multiplicationGenerator';
import { formatForDisplay, generatePracticePage } from '../../lib/y3SubtractionGen';

export type PracticeSectionKey =
  | 'addition'
  | 'subtraction'
  | 'multiplication'
  | 'measurement'
  | 'geometry'
  | 'dataProbability'
  | 'languageConventions'
  | 'readingMagazine'
  | 'writing';

type PracticeSectionRoute = {
  key: PracticeSectionKey;
  label: string;
  practicePath: string;
  historyPath: string;
};

const Y3_PRACTICE_ROUTES: PracticeSectionRoute[] = [
  { key: 'addition', label: 'Addition', practicePath: '/y3/numeracy/addition', historyPath: '/y3/numeracy/addition/history' },
  { key: 'subtraction', label: 'Subtraction', practicePath: '/y3/numeracy/subtraction', historyPath: '/y3/numeracy/subtraction/history' },
  { key: 'multiplication', label: 'Multiplication', practicePath: '/y3/numeracy/multiplication', historyPath: '/y3/numeracy/multiplication/history' },
  { key: 'measurement', label: 'Measurement', practicePath: '/y3/numeracy/measurement', historyPath: '/y3/numeracy/measurement/history' },
  { key: 'geometry', label: 'Geometry', practicePath: '/y3/numeracy/geometry', historyPath: '/y3/numeracy/geometry/history' },
  {
    key: 'dataProbability',
    label: 'Data & Probability',
    practicePath: '/y3/numeracy/data-probability',
    historyPath: '/y3/numeracy/data-probability/history',
  },
  {
    key: 'languageConventions',
    label: 'Language Conventions',
    practicePath: '/y3/language-conventions',
    historyPath: '/y3/language-conventions/history',
  },
  {
    key: 'readingMagazine',
    label: 'Reading Magazine',
    practicePath: '/y3/reading-magazine/practice',
    historyPath: '/y3/reading-magazine/history',
  },
  { key: 'writing', label: 'Writing', practicePath: '/y3/writing/practice', historyPath: '/y3/writing/history' },
];

function getPracticeRoute(key: PracticeSectionKey): PracticeSectionRoute {
  const found = Y3_PRACTICE_ROUTES.find((r) => r.key === key);
  if (!found) throw new Error(`Unknown practice section: ${key}`);
  return found;
}

type QuestionCardModel = {
  id: string;
  title: string;
  prompt: string;
  answerPlaceholder?: string;
  choices?: string[];
};

function makeSeedKey(): string {
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hashStringToUint32(input: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(rng: () => number, arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function buildOverlayCards(section: PracticeSectionKey, tab: 'practice' | 'history', seedKey: string): QuestionCardModel[] {
  const count = 10;
  const prefix = tab === 'practice' ? 'Question' : 'History';

  if (tab === 'history') {
    return Array.from({ length: count }, (_, i) => {
      const n = i + 1;
      return {
        id: `${section}:${tab}:${n}`,
        title: `${prefix} ${n}`,
        prompt: `Recent attempt ${n} for ${section}.`,
      };
    });
  }

  if (section === 'addition') {
    const problems = generateAdditionPage({
      seed: `overlay:${seedKey}:addition`,
      count,
      difficulty: 'easy',
      // Keep a healthy mix of modes; generator will output both MCQ and input.
      mixWeights: { basic: 5, placeValue: 3, missingAddend: 2, equivalence: 1, mentalMath: 3 },
    });

    return problems.map((p, i) => {
      const n = i + 1;
      return {
        id: p.id,
        title: `${prefix} ${n}`,
        prompt: p.prompt,
        answerPlaceholder: p.kind === 'input' ? 'Type your answer…' : undefined,
        choices: p.kind === 'mcq' ? (p.options ?? []).map((o) => o.label) : undefined,
      };
    });
  }

  if (section === 'multiplication') {
    const page = generateMultiplicationPage({
      difficulty: 'easy',
      count,
      seedKey: `overlay:${seedKey}:multiplication`,
      mcqChoices: 4,
      ensureUniquenessWithinPage: true,
    });

    return page.problems.map((p, i) => {
      const n = i + 1;
      return {
        id: p.id,
        title: `${prefix} ${n}`,
        prompt: p.prompt,
        answerPlaceholder: p.mcq ? undefined : 'Type your answer…',
        choices: p.mcq?.options?.map(String),
      };
    });
  }

  if (section === 'subtraction') {
    // Note: this generator is currently non-seeded; we create the deck once per overlay open.
    // Mix numeric + word problems so students see variety.
    const numericCount = 7;
    const wordCount = Math.max(0, count - numericCount);
    const page = generatePracticePage({ numericCount, wordCount, difficulty: 'easy' });

    const rng = mulberry32(hashStringToUint32(`overlay:${seedKey}:subtraction:shuffle`));
    const mixed = [...page.problems].slice(0, count);
    shuffleInPlace(rng, mixed);

    return mixed.slice(0, count).map((p: any, i: number) => {
      const n = i + 1;

      if (p.kind === 'word') {
        return {
          id: p.id,
          title: `${prefix} ${n}`,
          prompt: (p.text ?? p.prompt ?? '').toString(),
          answerPlaceholder: 'Type your answer…',
        };
      }

      const disp = formatForDisplay(p);
      const bottom = disp.bottom === '?' ? '?' : disp.bottom;
      const top = disp.top === '?' ? '?' : disp.top;
      const rhs = disp.result ? disp.result : '?';
      return {
        id: p.id,
        title: `${prefix} ${n}`,
        prompt: `${top} ${disp.op} ${bottom} = ${rhs}`,
        answerPlaceholder: 'Type your answer…',
      };
    });
  }

  // Fallback scaffold for sections without a generator wired yet.
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      id: `${section}:${tab}:${n}`,
      title: `${prefix} ${n}`,
      prompt: `Practice prompt ${n} for ${section}.`,
      answerPlaceholder: 'Type your answer…',
    };
  });
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M15 19l-7-7 7-7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M9 5l7 7-7 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PracticeOverlay({
  open,
  section,
  onClose,
}: {
  open: boolean;
  section: PracticeSectionKey | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [tab, setTab] = React.useState<'practice' | 'history'>('practice');
  const mountRef = React.useRef<HTMLDivElement | null>(null);
  const rendererRef = React.useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = React.useRef<THREE.Scene | null>(null);
  const cameraRef = React.useRef<THREE.PerspectiveCamera | null>(null);
  const menuGroupRef = React.useRef<THREE.Group | null>(null);
  const practiceMatRef = React.useRef<THREE.MeshBasicMaterial | null>(null);
  const historyMatRef = React.useRef<THREE.MeshBasicMaterial | null>(null);
  const rafRef = React.useRef<number | null>(null);

  const createTextTexture = React.useCallback((text: string, width: number, height: number, bgColor: string, active: boolean) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // Outer glow-ish border
    ctx.strokeStyle = active ? 'rgba(0,242,255,0.95)' : 'rgba(160,210,255,0.55)';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, width - 10, height - 10);

    // Inner line
    ctx.strokeStyle = active ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, width - 36, height - 36);

    // Text
    ctx.fillStyle = active ? 'rgba(235,252,255,1)' : 'rgba(220,235,255,0.92)';
    ctx.font = '800 44px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const prevBody = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevBody;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open]);

  // Three.js scene setup (only when open)
  React.useEffect(() => {
    if (!open) return;
    if (!mountRef.current) return;

    const mount = mountRef.current;
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
    // Pull back a bit to fit the larger panel
    camera.position.z = 11;
    camera.position.y = 0.35;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    // Background: axis-aligned neon lines, biased heavily toward long Z-axis "rails"
    // to make the space feel truly 3D.
    const bgSegments = 260;
    const bgPositions = new Float32Array(bgSegments * 2 * 3);
    const bgColors = new Float32Array(bgSegments * 2 * 3);
    const cA = new THREE.Color('#19e7ff');
    const cB = new THREE.Color('#b54cff');

    const randBetween = (min: number, max: number) => min + Math.random() * (max - min);

    for (let seg = 0; seg < bgSegments; seg++) {
      const base = seg * 2 * 3;

      const x0 = randBetween(-9.5, 9.5);
      const y0 = randBetween(-5.5, 5.5);
      const axisPick = Math.random();

      let z0 = randBetween(-24, -7);
      let x1 = x0;
      let y1 = y0;
      let z1 = z0;

      // 50% Z-axis rails, 25% X, 25% Y
      if (axisPick < 0.25) {
        // X-axis short segment
        const len = randBetween(0.6, 3.2);
        z0 = randBetween(-18, -7);
        z1 = z0;
        x1 = x0 + (Math.random() < 0.5 ? -len : len);
      } else if (axisPick < 0.5) {
        // Y-axis short segment
        const len = randBetween(0.6, 3.2);
        z0 = randBetween(-18, -7);
        z1 = z0;
        y1 = y0 + (Math.random() < 0.5 ? -len : len);
      } else {
        // Z-axis rail (tunnel-like) but finite length (not infinite).
        // Oriented toward the camera to reinforce depth.
        const zLen = randBetween(18, 70);
        z0 = randBetween(-140, -30);
        z1 = Math.min(6, z0 + zLen);
      }

      // Vertex A
      bgPositions[base + 0] = x0;
      bgPositions[base + 1] = y0;
      bgPositions[base + 2] = z0;
      // Vertex B
      bgPositions[base + 3] = x1;
      bgPositions[base + 4] = y1;
      bgPositions[base + 5] = z1;

      // Color per segment (same for both endpoints)
      const mix = Math.random();
      const col = cA.clone().lerp(cB, mix);
      bgColors[base + 0] = col.r;
      bgColors[base + 1] = col.g;
      bgColors[base + 2] = col.b;
      bgColors[base + 3] = col.r;
      bgColors[base + 4] = col.g;
      bgColors[base + 5] = col.b;
    }
    const bgGeom = new THREE.BufferGeometry();
    bgGeom.setAttribute('position', new THREE.BufferAttribute(bgPositions, 3));
    bgGeom.setAttribute('color', new THREE.BufferAttribute(bgColors, 3));
    const bgMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 });
    const bgLines = new THREE.LineSegments(bgGeom, bgMat);
    scene.add(bgLines);

    // Main Menu Group (Perspective Container)
    const menuGroup = new THREE.Group();
    // Subtle inclination (small tilt) for depth
    menuGroup.rotation.y = -0.14;
    menuGroup.rotation.x = 0.08;
    scene.add(menuGroup);
    menuGroupRef.current = menuGroup;

    // Tabs
    const practiceTex = createTextTexture('PRACTICE', 512, 128, 'rgba(20, 40, 60, 0.80)', true);
    const historyTex = createTextTexture('HISTORY', 512, 128, 'rgba(40, 20, 60, 0.80)', false);
    const practiceMat = new THREE.MeshBasicMaterial({ map: practiceTex, transparent: true });
    const historyMat = new THREE.MeshBasicMaterial({ map: historyTex, transparent: true });
    practiceMatRef.current = practiceMat;
    historyMatRef.current = historyMat;
    const practiceTab = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.6), practiceMat);
    const historyTab = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.6), historyMat);
    // Tabs closer to top
    practiceTab.position.set(-1, 4.1, 0);
    historyTab.position.set(1, 4.1, 0);
    menuGroup.add(practiceTab, historyTab);

    // Connecting line
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00f2ff, transparent: true, opacity: 0.85 });
    const points = [new THREE.Vector3(-2.05, 1.55, 0), new THREE.Vector3(2.05, 1.55, 0)];
    const lineGeom = new THREE.BufferGeometry().setFromPoints(points);
    const separatorLine = new THREE.Line(lineGeom, lineMat);
    menuGroup.add(separatorLine);

    const tabBaseY = 4.1;
    const floatAmp = 0.08;

    // Content panel frame (2x)
    const contentGeom = new THREE.PlaneGeometry(10.2, 7.6);
    const contentMat = new THREE.MeshBasicMaterial({ color: 0x07111a, transparent: true, opacity: 0.62, side: THREE.DoubleSide });
    const contentArea = new THREE.Mesh(contentGeom, contentMat);
    contentArea.position.y = -1.95;
    menuGroup.add(contentArea);

    // Content border glow
    const borderGeom = new THREE.PlaneGeometry(10.36, 7.76);
    const borderMat = new THREE.MeshBasicMaterial({ color: 0x00f2ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
    const border = new THREE.Mesh(borderGeom, borderMat);
    border.position.y = -1.95;
    border.position.z = 0.001;
    menuGroup.add(border);

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const t = Date.now() * 0.002;
      // Keep the content panel still (important for typing/writing),
      // but allow the tabs to float a little for visual flair.
      const bob = Math.sin(t) * floatAmp;
      practiceTab.position.y = tabBaseY + bob;
      historyTab.position.y = tabBaseY + bob;
      separatorLine.position.y = bob;
      bgLines.position.y = Math.sin(t * 0.6) * 0.04;
      // Subtle forward scroll to suggest "infinite" depth, without pushing lines behind the camera.
      bgLines.position.z = ((t * 0.22) % 2) - 1;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      menuGroupRef.current = null;
      practiceMatRef.current = null;
      historyMatRef.current = null;
    };
  }, [createTextTexture, open]);

  // Update tab textures on state change
  React.useEffect(() => {
    if (!open) return;
    const pMat = practiceMatRef.current;
    const hMat = historyMatRef.current;
    if (!pMat || !hMat) return;

    const pActive = tab === 'practice';
    const hActive = tab === 'history';
    const pTex = createTextTexture('PRACTICE', 512, 128, 'rgba(20, 40, 60, 0.80)', pActive);
    const hTex = createTextTexture('HISTORY', 512, 128, 'rgba(40, 20, 60, 0.80)', hActive);
    if (pMat.map) (pMat.map as THREE.Texture).dispose();
    if (hMat.map) (hMat.map as THREE.Texture).dispose();
    pMat.map = pTex;
    hMat.map = hTex;
    pMat.needsUpdate = true;
    hMat.needsUpdate = true;
  }, [createTextTexture, open, tab]);

  React.useEffect(() => {
    if (!open) return;
    setTab('practice');
  }, [open, section]);

  const [deckSeed, setDeckSeed] = React.useState<string>('');

  const cards = React.useMemo(() => {
    if (!section) return [];
    return buildOverlayCards(section, tab, deckSeed || 'seed');
  }, [deckSeed, section, tab]);

  const [activeCardIndex, setActiveCardIndex] = React.useState(0);
  const [answersByCardId, setAnswersByCardId] = React.useState<Record<string, string>>({});
  const [submitted, setSubmitted] = React.useState(false);

  const requiredAnswerCardIds = React.useMemo(() => {
    if (tab !== 'practice') return [] as string[];
    return cards
      .filter((c) => Boolean(c.answerPlaceholder) || (Array.isArray(c.choices) && c.choices.length > 0))
      .map((c) => c.id);
  }, [cards, tab]);

  const allQuestionsAnswered = React.useMemo(() => {
    if (tab !== 'practice') return false;
    if (requiredAnswerCardIds.length === 0) return false;
    return requiredAnswerCardIds.every((id) => (answersByCardId[id] ?? '').trim().length > 0);
  }, [answersByCardId, requiredAnswerCardIds, tab]);

  const goNext = React.useCallback(() => {
    setActiveCardIndex((i) => {
      const n = cards.length;
      if (n <= 0) return 0;
      return (i + 1) % n;
    });
  }, [cards.length]);

  const goPrev = React.useCallback(() => {
    setActiveCardIndex((i) => {
      const n = cards.length;
      if (n <= 0) return 0;
      return (i - 1 + n) % n;
    });
  }, [cards.length]);

  React.useEffect(() => {
    if (!open || !section) return;
    setDeckSeed(makeSeedKey());
  }, [open, section, tab]);

  React.useEffect(() => {
    setActiveCardIndex(0);
    setAnswersByCardId({});
    setSubmitted(false);
  }, [deckSeed, section, tab, open]);

  if (!open || !section) return null;

  const route = getPracticeRoute(section);
  const activeCard = cards[activeCardIndex];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center practiceOverlay-backdrop">
      <div
        className="absolute inset-0"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      />

      <div className="practiceOverlay-shell practiceOverlay-neo">
        {/* Three.js hologram */}
        <div className="practiceOverlay-neoCanvas" ref={mountRef} />

        {/* Click hit-areas aligned to the 3D tabs */}
        <button
          type="button"
          className="practiceOverlay-neoHit practiceOverlay-neoHit--practice"
          onClick={() => {
            setTab('practice');
          }}
          aria-label="Practice"
        />
        <button
          type="button"
          className="practiceOverlay-neoHit practiceOverlay-neoHit--history"
          onClick={() => {
            onClose();
            navigate('/gh/history');
          }}
          aria-label="History"
        />

        {/* Title + close */}
        <div className="practiceOverlay-neoHeader">
          <div className="practiceOverlay-neoTitle">
            <div className="practiceOverlay-neoKicker">Year 3</div>
            <div className="practiceOverlay-neoName">{route.label}</div>
          </div>
          <button type="button" onClick={onClose} className="practiceOverlay-neoClose">
            Close
          </button>
        </div>

        {/* Content area (still) with question cards in a carousel ring */}
        <div className="practiceOverlay-contentHost" role="region" aria-label="Practice content">
          <div className="practiceOverlay-cardStack" aria-live="polite">
            {cards.map((card, index) => {
              const total = cards.length;
              const isActive = index === activeCardIndex;

              // Carousel ring layout:
              // - Active card: flat to the screen.
              // - Other cards: arranged around a circle and progressively pushed/tilted into Z.
              const ringCount = Math.max(0, total - 1);
              const forward = (index - activeCardIndex + total) % total; // 0..total-1
              const ringPos = Math.max(0, forward - 1); // 0..ringCount-1 (only meaningful when !isActive)

              // Active card: centered and flat (no extra transform beyond centering).
              const activeYOffset = 0;

              // Ring geometry
              const ringYOffset = -40;
              const radiusX = 460;
              const radiusY = 245;
              const startAngle = -Math.PI / 2;
              const angleStep = ringCount === 0 ? 0 : (Math.PI * 2) / ringCount;
              const angle = startAngle + ringPos * angleStep;

              // Uniform big↔small transition based on angular distance from the bottom
              // (closest to the central card in your sketch).
              const bottomAngle = Math.PI / 2;
              const delta = Math.atan2(Math.sin(angle - bottomAngle), Math.cos(angle - bottomAngle));
              const normDist = Math.min(1, Math.abs(delta) / Math.PI); // 0..1

              const ringX = Math.cos(angle) * radiusX;
              const ringY = Math.sin(angle) * radiusY + ringYOffset;

              const x = isActive ? 0 : ringX;
              const y = isActive ? activeYOffset : ringY;
              const z = isActive ? 0 : -(140 + normDist * 320);

              const maxScale = 0.74;
              const minScale = 0.54;
              const scale = isActive ? 1 : maxScale - normDist * (maxScale - minScale);

              const maxOpacity = 0.92;
              const minOpacity = 0.28;
              const opacity = isActive ? 1 : maxOpacity - normDist * (maxOpacity - minOpacity);

              const baseYaw = isActive ? 0 : (-ringX / radiusX) * 16;
              const basePitch = isActive ? 0 : (ringY / radiusY) * 7;
              const extraTilt = isActive ? 0 : normDist * 32;
              const rotY = baseYaw + Math.sign(ringX || 1) * extraTilt;
              const rotX = basePitch - extraTilt * 0.30;
              const rotZ = isActive ? 0 : (-ringX / radiusX) * 6;

              return (
                <div
                  key={card.id}
                  className={index === activeCardIndex ? 'practiceOverlay-card practiceOverlay-card--active' : 'practiceOverlay-card'}
                  style={{
                    transform: isActive
                      ? `translate(-50%, -50%) translateX(0px) translateY(${activeYOffset}px) translateZ(0px) rotateY(0deg) rotateX(0deg) rotateZ(0deg) scale(1)`
                      : `translate(-50%, -50%) translateX(${x}px) translateY(${y}px) translateZ(${z}px) rotateY(${rotY}deg) rotateX(${rotX}deg) rotateZ(${rotZ}deg) scale(${scale})`,
                    opacity,
                    zIndex: isActive ? 2000 : 1000 - ringPos,
                    pointerEvents: 'auto',
                  }}
                  onClick={() => {
                    if (!isActive) setActiveCardIndex(index);
                  }}
                >
                  <div className="practiceOverlay-cardTop">
                    <div className="practiceOverlay-cardTitle">{card.title}</div>
                    <div className="practiceOverlay-cardCounter">
                      {Math.min(activeCardIndex + 1, cards.length)}/{cards.length}
                    </div>
                  </div>

                  <div className="practiceOverlay-cardPrompt">{card.prompt}</div>

                  {isActive && card.answerPlaceholder && tab === 'practice' && (
                    <div className="practiceOverlay-cardAnswer">
                      <input
                        className="practiceOverlay-cardInput"
                        value={answersByCardId[card.id] ?? ''}
                        onChange={(e) => {
                          const nextVal = e.target.value;
                          setAnswersByCardId((prev) => ({ ...prev, [card.id]: nextVal }));
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          e.stopPropagation();
                          goNext();
                        }}
                        placeholder={card.answerPlaceholder}
                        inputMode="numeric"
                        aria-label="Answer"
                      />
                    </div>
                  )}

                  {isActive && tab === 'practice' && Array.isArray(card.choices) && card.choices.length > 0 && (
                    <div className="practiceOverlay-mcq" aria-label="Multiple choice">
                      <div className="practiceOverlay-mcqGrid">
                        {card.choices.map((choice) => (
                          <button
                            key={choice}
                            type="button"
                            className="practiceOverlay-mcqOption"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAnswersByCardId((prev) => ({ ...prev, [card.id]: choice }));
                              goNext();
                            }}
                            aria-label={`Select ${choice}`}
                          >
                            {choice}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {isActive && (
                    <div className="practiceOverlay-cardNav">
                      <button
                        type="button"
                        className="practiceOverlay-cardBtn practiceOverlay-cardBtn--prev"
                        onClick={(e) => {
                          e.stopPropagation();
                          goPrev();
                        }}
                        aria-label="Previous question"
                      >
                        <ArrowLeftIcon className="practiceOverlay-cardBtnIcon" />
                        Prev
                      </button>

                      {tab === 'practice' && allQuestionsAnswered && (
                        <button
                          type="button"
                          className="practiceOverlay-cardBtn practiceOverlay-cardBtn--submit"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSubmitted(true);
                          }}
                          aria-label="Submit"
                          disabled={submitted}
                        >
                          {submitted ? 'Submitted' : 'Submit'}
                        </button>
                      )}

                      <button
                        type="button"
                        className="practiceOverlay-cardBtn practiceOverlay-cardBtn--next"
                        onClick={(e) => {
                          e.stopPropagation();
                          goNext();
                        }}
                        aria-label="Next question"
                      >
                        Next
                        <ArrowRightIcon className="practiceOverlay-cardBtnIcon" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {!activeCard && (
              <div
                className="practiceOverlay-card practiceOverlay-card--active"
                style={{ transform: 'translate(-50%, -50%) translateX(0px) translateY(0px) translateZ(0px) scale(1)' }}
              >
                <div className="practiceOverlay-cardTitle">No content</div>
                <div className="practiceOverlay-cardPrompt">Choose a section to begin.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
