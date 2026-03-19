import React from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, OrbitControls, RoundedBox, Sky, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import robotoBodyWoff from 'typeface-roboto/files/roboto-latin-400.woff';
import robotoSlabHeaderWoff from 'typeface-roboto-slab/files/roboto-slab-latin-700.woff';
import { PracticeOverlay, type PracticeSectionKey } from './PracticeOverlay';

type Vec3 = [number, number, number];

const ORIGIN: Vec3 = [0, 0, 0];
const SCHOOL_LABELS = ['Year 3', 'Year 5', 'Year 7', 'Year 9'] as const;
// Rotate the school ring so no building sits directly in front of the gate.
const SCHOOL_ANGLES = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4] as const;

const CURSIVE_FONT_URL = '/fonts/DancingScript-wght.ttf';

// Scene sizing controls
const FIELD_RX = 9.2;
const FIELD_RZ = 6.3;
const SCHOOL_OUTWARD = 8.5;
const FENCE_RX = 38.0;
const FENCE_RZ = 29.5;
const BUILDING_SCALE = 1.35;
const GROUND_SIZE = 220;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type TreeKind = 'bottlebrush' | 'silkyOak' | 'christmas';
type ScatterInstance = { pos: Vec3; rotY: number; scale: number; leanX: number; leanZ: number; tint: number };

function createBarkTexture(size = 512, repeat = 6) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Base bark tone
  ctx.fillStyle = '#6b4f3a';
  ctx.fillRect(0, 0, size, size);

  // Vertical grain
  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const h = 8 + Math.random() * 70;
    const w = 1 + Math.random() * 2.5;
    const a = 0.02 + Math.random() * 0.08;
    const dark = Math.random() > 0.5;
    ctx.fillStyle = dark ? `rgba(10,6,4,${a})` : `rgba(255,245,235,${a * 0.7})`;
    ctx.fillRect(x, y, w, h);
  }

  // Knots
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 6 + Math.random() * 22;
    ctx.fillStyle = `rgba(20,12,8,${0.06 + Math.random() * 0.1})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createLeafTexture(size = 512, repeat = 4, base = '#2f7d32') {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Blotchy color variation
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1 + Math.random() * 6;
    const a = 0.02 + Math.random() * 0.06;
    const light = Math.random() > 0.5;
    ctx.fillStyle = light ? `rgba(210,255,210,${a})` : `rgba(0,0,0,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Leaf veins (subtle)
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 250; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 16 + Math.random() * 55;
    const ang = Math.random() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createBroadleafCardTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Transparent background
  ctx.clearRect(0, 0, size, size);

  // Draw stylized broadleaf silhouettes with veins (looks better than blobs for cards).
  const drawLeaf = (x: number, y: number, w: number, h: number, rot: number, base: string, a: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    // Leaf outline (pointed ellipse-ish)
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.5);
    ctx.quadraticCurveTo(w * 0.55, -h * 0.25, w * 0.45, 0);
    ctx.quadraticCurveTo(w * 0.35, h * 0.35, 0, h * 0.5);
    ctx.quadraticCurveTo(-w * 0.35, h * 0.35, -w * 0.45, 0);
    ctx.quadraticCurveTo(-w * 0.55, -h * 0.25, 0, -h * 0.5);
    ctx.closePath();

    // Gradient fill (tip highlight)
    const g = ctx.createLinearGradient(0, -h * 0.5, 0, h * 0.5);
    g.addColorStop(0, `rgba(220,255,220,${0.12 * a})`);
    g.addColorStop(0.35, `rgba(0,0,0,0)`);
    g.addColorStop(1, `rgba(0,0,0,${0.12 * a})`);

    ctx.fillStyle = base;
    ctx.globalAlpha = a;
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fill();

    // Midrib + a few veins
    ctx.strokeStyle = `rgba(255,255,255,${0.10 * a})`;
    ctx.lineWidth = Math.max(1, w * 0.04);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.46);
    ctx.lineTo(0, h * 0.46);
    ctx.stroke();

    ctx.strokeStyle = `rgba(255,255,255,${0.06 * a})`;
    ctx.lineWidth = Math.max(1, w * 0.025);
    for (let i = 0; i < 3; i++) {
      const ty = (-0.18 + i * 0.18) * h;
      ctx.beginPath();
      ctx.moveTo(0, ty);
      ctx.quadraticCurveTo(w * 0.22, ty + h * 0.1, w * 0.35, ty + h * 0.18);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, ty);
      ctx.quadraticCurveTo(-w * 0.22, ty + h * 0.1, -w * 0.35, ty + h * 0.18);
      ctx.stroke();
    }

    ctx.restore();
  };

  // Background clusters
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const w = 10 + Math.random() * 30;
    const h = w * (1.4 + Math.random() * 0.8);
    const rot = Math.random() * Math.PI * 2;
    const shade = Math.random();
    const a = 0.15 + Math.random() * 0.35;
    const base = shade > 0.5 ? 'rgba(55,170,85,1)' : 'rgba(35,145,70,1)';
    drawLeaf(x, y, w, h, rot, base, a);
  }

  // Soft alpha vignette to reduce harsh edges when tiled.
  const g = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.15, size * 0.5, size * 0.5, size * 0.62);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createNeedleCardTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);

  // Many thin needle strokes in small tufts.
  const tuftCount = 120;
  for (let t = 0; t < tuftCount; t++) {
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const baseAng = Math.random() * Math.PI * 2;
    const needles = 18 + Math.floor(Math.random() * 26);
    const tuftR = 10 + Math.random() * 40;

    for (let i = 0; i < needles; i++) {
      const a = baseAng + (Math.random() - 0.5) * 1.8;
      const r = Math.random() * tuftR;
      const x = cx + (Math.random() - 0.5) * r;
      const y = cy + (Math.random() - 0.5) * r;
      const len = 18 + Math.random() * 60;
      const w = 0.8 + Math.random() * 1.4;
      const alpha = 0.08 + Math.random() * 0.14;

      const g = 120 + Math.floor(Math.random() * 110);
      ctx.strokeStyle = Math.random() > 0.5 ? `rgba(60, ${g}, 90, ${alpha})` : `rgba(30, 150, 70, ${alpha})`;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
  }

  // Vignette alpha
  const g = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.18, size * 0.5, size * 0.5, size * 0.65);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createGateOrnamentTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Base
  ctx.fillStyle = '#d9e2ef';
  ctx.fillRect(0, 0, size, size);

  // Subtle gradient
  const g = ctx.createLinearGradient(0, 0, size, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.22)');
  g.addColorStop(0.5, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // Decorative scroll-like pattern (stylized, not literal cutouts)
  ctx.strokeStyle = 'rgba(30,41,59,0.22)';
  ctx.lineWidth = Math.max(2, size * 0.006);
  for (let i = 0; i < 8; i++) {
    const x = (i + 0.5) * (size / 8);
    ctx.beginPath();
    ctx.arc(x, size * 0.45, size * 0.12, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, size * 0.55, size * 0.12, Math.PI * 0.05, Math.PI * 0.95);
    ctx.stroke();
  }

  // Fine dotted border
  ctx.fillStyle = 'rgba(30,41,59,0.22)';
  const dotR = Math.max(2, size * 0.007);
  for (let i = 0; i < 22; i++) {
    const x = (i + 0.5) * (size / 22);
    ctx.beginPath();
    ctx.arc(x, size * 0.18, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, size * 0.82, dotR, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function TreeScatter({ groundSize = GROUND_SIZE }: { groundSize?: number }) {
  const half = groundSize / 2;

  const barkMap = React.useMemo(() => createBarkTexture(512, 5), []);
  const leafMap = React.useMemo(() => createLeafTexture(512, 4, '#3dbb58'), []);
  const coniferMap = React.useMemo(() => createLeafTexture(512, 5, '#2c9a49'), []);
  const oakLeafCardMap = React.useMemo(() => createBroadleafCardTexture(768), []);
  const bottleLeafCardMap = React.useMemo(() => createNeedleCardTexture(768), []);

  const buildingCenters = React.useMemo(() => {
    return SCHOOL_ANGLES.map((a) => {
      const x = Math.cos(a) * (FIELD_RX + SCHOOL_OUTWARD);
      const z = Math.sin(a) * (FIELD_RZ + SCHOOL_OUTWARD);
      return [x, 0, z] as Vec3;
    });
  }, []);

  const isBlocked = React.useCallback(
    (x: number, z: number) => {
      // Keep the field clear.
      const nx = x / (FIELD_RX * 1.25);
      const nz = z / (FIELD_RZ * 1.25);
      if (nx * nx + nz * nz < 1) return true;

      // Keep building areas clear.
      for (const b of buildingCenters) {
        const dx = x - b[0];
        const dz = z - b[2];
        if (dx * dx + dz * dz < 14 * 14) return true;
      }

      // Keep the gate area clear-ish so the entrance reads.
      const gx = Math.cos(Math.PI / 2) * FENCE_RX;
      const gz = Math.sin(Math.PI / 2) * FENCE_RZ;
      const gdx = x - gx;
      const gdz = z - gz;
      if (gdx * gdx + gdz * gdz < 10 * 10) return true;

      return false;
    },
    [buildingCenters]
  );

  const instancesByKind = React.useMemo(() => {
    const rng = mulberry32(20260124);

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const smoothstep = (edge0: number, edge1: number, x: number) => {
      const t = clamp01((x - edge0) / Math.max(1e-6, edge1 - edge0));
      return t * t * (3 - 2 * t);
    };

    const make = (count: number, tries = 20000) => {
      const out: ScatterInstance[] = [];
      for (let i = 0; i < tries && out.length < count; i++) {
        const x = (rng() * 2 - 1) * half;
        const z = (rng() * 2 - 1) * half;
        if (isBlocked(x, z)) continue;

        // Avoid near-duplicates.
        let ok = true;
        for (let j = 0; j < out.length; j++) {
          const dx = x - out[j].pos[0];
          const dz = z - out[j].pos[2];
          if (dx * dx + dz * dz < 3.2 * 3.2) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;

        // Density falloff: fewer trees near the campus center and near buildings.
        const dCenter = Math.sqrt(x * x + z * z);
        const wCenter = smoothstep(FIELD_RX * 2.0, half * 0.82, dCenter);
        let minDb = Infinity;
        for (const b of buildingCenters) {
          const dx = x - b[0];
          const dz = z - b[2];
          minDb = Math.min(minDb, Math.sqrt(dx * dx + dz * dz));
        }
        const wBuildings = smoothstep(18, 42, minDb);
        const acceptProb = 0.04 + 0.96 * (wCenter * wBuildings);
        if (rng() > acceptProb) continue;

        out.push({
          pos: [x, 0, z],
          rotY: rng() * Math.PI * 2,
          scale: 0.85 + rng() * 0.9,
          leanX: (rng() - 0.5) * 0.16,
          leanZ: (rng() - 0.5) * 0.16,
          tint: 0.85 + rng() * 0.3,
        });
      }
      return out;
    };

    return {
      christmas: make(90),
      bottlebrush: make(70),
      silkyOak: make(70),
    } satisfies Record<TreeKind, ScatterInstance[]>;
  }, [half, isBlocked]);

  const setInstances = React.useCallback(
    (
      mesh: THREE.InstancedMesh | null,
      inst: ScatterInstance[],
      makeLocal: (i: ScatterInstance) => THREE.Matrix4,
      colorFor?: (i: ScatterInstance) => THREE.Color
    ) => {
      if (!mesh) return;

      if (colorFor && !mesh.instanceColor) {
        const max = mesh.instanceMatrix.count;
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      }

      for (let i = 0; i < inst.length; i++) {
        mesh.setMatrixAt(i, makeLocal(inst[i]));
        if (colorFor) mesh.setColorAt(i, colorFor(inst[i]));
      }
      mesh.count = inst.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    []
  );

  // Christmas tree parts
  const xmasTrunkRef = React.useRef<THREE.InstancedMesh | null>(null);
  const xmasCone1Ref = React.useRef<THREE.InstancedMesh | null>(null);
  const xmasCone2Ref = React.useRef<THREE.InstancedMesh | null>(null);
  const xmasCone3Ref = React.useRef<THREE.InstancedMesh | null>(null);

  // Bottlebrush parts
  const bottleTrunkRef = React.useRef<THREE.InstancedMesh | null>(null);
  const bottleCrownRef = React.useRef<THREE.InstancedMesh | null>(null);
  const bottleBrushRef = React.useRef<THREE.InstancedMesh | null>(null);

  // Silky oak parts
  const oakTrunkRef = React.useRef<THREE.InstancedMesh | null>(null);
  const oakCanopyRef = React.useRef<THREE.InstancedMesh | null>(null);
  const oakCanopy2Ref = React.useRef<THREE.InstancedMesh | null>(null);

  // Leaf cards (extra realism) for bottlebrush + silky oak
  const bottleLeafCardsRef = React.useRef<THREE.InstancedMesh | null>(null);
  const oakLeafCardsRef = React.useRef<THREE.InstancedMesh | null>(null);

  React.useLayoutEffect(() => {
    const mk = (pos: Vec3, rotY: number, leanX: number, leanZ: number, sx: number, sy: number, sz: number) => {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(leanX, rotY, leanZ));
      const s = new THREE.Vector3(sx, sy, sz);
      const p = new THREE.Vector3(pos[0], pos[1], pos[2]);
      m.compose(p, q, s);
      return m;
    };

    const mkEuler = (pos: Vec3, e: THREE.Euler, sx: number, sy: number, sz: number) => {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(e);
      const s = new THREE.Vector3(sx, sy, sz);
      const p = new THREE.Vector3(pos[0], pos[1], pos[2]);
      m.compose(p, q, s);
      return m;
    };

    const trunkColor = (base: string) => (t: ScatterInstance) => {
      const c = new THREE.Color(base);
      c.multiplyScalar(0.95 + t.tint * 0.18);
      return c;
    };
    const leafColor = (base: string) => (t: ScatterInstance) => {
      const c = new THREE.Color(base);
      c.multiplyScalar(0.95 + t.tint * 0.35);
      return c;
    };
    const flowerColor = (base: string) => (t: ScatterInstance) => {
      const c = new THREE.Color(base);
      c.multiplyScalar(0.85 + t.tint * 0.25);
      return c;
    };

    const xmas = instancesByKind.christmas;
    setInstances(
      xmasTrunkRef.current,
      xmas,
      (t) => mk([t.pos[0], 0.62 * t.scale, t.pos[2]], t.rotY, t.leanX, t.leanZ, 0.26 * t.scale, 1.25 * t.scale, 0.26 * t.scale),
      trunkColor('#6b4f3a')
    );
    setInstances(
      xmasCone1Ref.current,
      xmas,
      (t) => mk([t.pos[0], 1.55 * t.scale, t.pos[2]], t.rotY, t.leanX * 0.6, t.leanZ * 0.6, 1.55 * t.scale, 1.35 * t.scale, 1.55 * t.scale),
      leafColor('#14532d')
    );
    setInstances(
      xmasCone2Ref.current,
      xmas,
      (t) => mk([t.pos[0], 2.35 * t.scale, t.pos[2]], t.rotY, t.leanX * 0.5, t.leanZ * 0.5, 1.18 * t.scale, 1.15 * t.scale, 1.18 * t.scale),
      leafColor('#166534')
    );
    setInstances(
      xmasCone3Ref.current,
      xmas,
      (t) => mk([t.pos[0], 3.05 * t.scale, t.pos[2]], t.rotY, t.leanX * 0.45, t.leanZ * 0.45, 0.82 * t.scale, 1.05 * t.scale, 0.82 * t.scale),
      leafColor('#15803d')
    );

    const bottle = instancesByKind.bottlebrush;
    setInstances(
      bottleTrunkRef.current,
      bottle,
      (t) => mk([t.pos[0], 0.72 * t.scale, t.pos[2]], t.rotY, t.leanX, t.leanZ, 0.24 * t.scale, 1.45 * t.scale, 0.24 * t.scale),
      trunkColor('#5b3a29')
    );
    setInstances(
      bottleCrownRef.current,
      bottle,
      (t) => mk([t.pos[0], 2.35 * t.scale, t.pos[2]], t.rotY, t.leanX * 0.6, t.leanZ * 0.6, 1.15 * t.scale, 1.05 * t.scale, 1.15 * t.scale),
      leafColor('#1b5e20')
    );
    setInstances(
      bottleBrushRef.current,
      bottle,
      (t) => mk([t.pos[0], 2.75 * t.scale, t.pos[2]], t.rotY, t.leanX * 0.35, t.leanZ * 0.35, 0.28 * t.scale, 1.05 * t.scale, 0.28 * t.scale),
      flowerColor('#b91c1c')
    );

    const oak = instancesByKind.silkyOak;
    setInstances(
      oakTrunkRef.current,
      oak,
      (t) => mk([t.pos[0], 0.95 * t.scale, t.pos[2]], t.rotY, t.leanX, t.leanZ, 0.28 * t.scale, 1.9 * t.scale, 0.28 * t.scale),
      trunkColor('#6b4f3a')
    );
    setInstances(
      oakCanopyRef.current,
      oak,
      (t) => mk([t.pos[0], 3.25 * t.scale, t.pos[2]], t.rotY, t.leanX * 0.55, t.leanZ * 0.55, 1.75 * t.scale, 1.15 * t.scale, 1.75 * t.scale),
      leafColor('#2e7d32')
    );
    setInstances(
      oakCanopy2Ref.current,
      oak,
      (t) => mk([t.pos[0], 3.95 * t.scale, t.pos[2]], t.rotY, t.leanX * 0.45, t.leanZ * 0.45, 1.25 * t.scale, 0.95 * t.scale, 1.25 * t.scale),
      leafColor('#388e3c')
    );

    // Leaf cards (billboard-ish planes) for extra realism.
    const setLeafCards = (mesh: THREE.InstancedMesh | null, trees: ScatterInstance[], cardsPerTree: number, base: string) => {
      if (!mesh) return;

      if (!mesh.instanceColor) {
        const max = mesh.instanceMatrix.count;
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      }

      let idx = 0;
      for (let ti = 0; ti < trees.length; ti++) {
        const t = trees[ti];
        const rng = mulberry32(91000 + ti * 31 + Math.floor(t.pos[0] * 3) + Math.floor(t.pos[2] * 7));

        for (let ci = 0; ci < cardsPerTree; ci++) {
          const a = rng() * Math.PI * 2;
          const r = (0.25 + rng() * 0.85) * (1.35 * t.scale);
          const y = (2.9 + rng() * 1.2) * t.scale;
          const x = t.pos[0] + Math.cos(a) * r;
          const z = t.pos[2] + Math.sin(a) * r;

          const yaw = t.rotY + a + (rng() - 0.5) * 0.7;
          const pitch = (rng() - 0.5) * 0.7;
          const roll = (rng() - 0.5) * 0.9;

          const w = (0.65 + rng() * 0.75) * t.scale;
          const h = w * (0.75 + rng() * 0.6);

          const e = new THREE.Euler(pitch + t.leanX * 0.4, yaw, roll + t.leanZ * 0.25);
          mesh.setMatrixAt(idx, mkEuler([x, y, z], e, w, h, 1));

          const c = new THREE.Color(base);
          c.multiplyScalar(0.98 + t.tint * 0.35);
          mesh.setColorAt(idx, c);

          idx++;
          if (idx >= mesh.instanceMatrix.count) break;
        }
        if (idx >= mesh.instanceMatrix.count) break;
      }

      mesh.count = idx;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };

    // More cards for oaks, fewer for bottlebrush.
    setLeafCards(oakLeafCardsRef.current, oak, 10, '#3dbb58');
    setLeafCards(bottleLeafCardsRef.current, bottle, 8, '#2c9a49');
  }, [instancesByKind, setInstances]);

  return (
    <group>
      {/* Christmas trees */}
      <instancedMesh ref={xmasTrunkRef} args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, 120]} castShadow receiveShadow>
        <cylinderGeometry args={[0.55, 0.75, 1, 14, 4]} />
        <meshStandardMaterial map={barkMap ?? undefined} color={barkMap ? '#ffffff' : '#6b4f3a'} roughness={1} vertexColors />
      </instancedMesh>
      <instancedMesh ref={xmasCone1Ref} args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, 120]} castShadow receiveShadow>
        <coneGeometry args={[1, 1, 18, 6]} />
        <meshStandardMaterial
          map={coniferMap ?? undefined}
          color={coniferMap ? '#ffffff' : '#2c9a49'}
          roughness={0.92}
          emissive="#2f8f3c"
          emissiveIntensity={0.12}
          vertexColors
        />
      </instancedMesh>
      <instancedMesh ref={xmasCone2Ref} args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, 120]} castShadow receiveShadow>
        <coneGeometry args={[1, 1, 18, 6]} />
        <meshStandardMaterial
          map={coniferMap ?? undefined}
          color={coniferMap ? '#ffffff' : '#2fae52'}
          roughness={0.92}
          emissive="#2f8f3c"
          emissiveIntensity={0.12}
          vertexColors
        />
      </instancedMesh>
      <instancedMesh ref={xmasCone3Ref} args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, 120]} castShadow receiveShadow>
        <coneGeometry args={[1, 1, 18, 6]} />
        <meshStandardMaterial
          map={coniferMap ?? undefined}
          color={coniferMap ? '#ffffff' : '#3dbb58'}
          roughness={0.92}
          emissive="#2f8f3c"
          emissiveIntensity={0.12}
          vertexColors
        />
      </instancedMesh>

      {/* Bottlebrush trees */}
      <instancedMesh ref={bottleTrunkRef} args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, 100]} castShadow receiveShadow>
        <cylinderGeometry args={[0.55, 0.8, 1, 14, 4]} />
        <meshStandardMaterial map={barkMap ?? undefined} color={barkMap ? '#ffffff' : '#5b3a29'} roughness={1} vertexColors />
      </instancedMesh>
      <instancedMesh ref={bottleCrownRef} args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, 100]} castShadow receiveShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial
          map={leafMap ?? undefined}
          color={leafMap ? '#ffffff' : '#3dbb58'}
          roughness={0.92}
          emissive="#2f8f3c"
          emissiveIntensity={0.14}
          vertexColors
        />
      </instancedMesh>
      <instancedMesh ref={bottleBrushRef} args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, 100]} castShadow receiveShadow>
        <cylinderGeometry args={[0.8, 0.7, 1, 14, 6]} />
        <meshStandardMaterial color="#b91c1c" roughness={0.85} metalness={0.02} emissive="#7f1d1d" emissiveIntensity={0.35} vertexColors />
      </instancedMesh>

      {/* Bottlebrush leaf cards */}
      <instancedMesh
        ref={bottleLeafCardsRef}
        args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, 1500]}
        castShadow
        receiveShadow
      >
        <planeGeometry args={[1, 1, 1, 1]} />
        <meshStandardMaterial
          map={bottleLeafCardMap ?? undefined}
          color={bottleLeafCardMap ? '#ffffff' : '#2c9a49'}
          roughness={0.92}
          metalness={0}
          emissive="#2f8f3c"
          emissiveIntensity={0.18}
          transparent
          alphaTest={0.5}
          depthWrite={false}
          side={THREE.DoubleSide}
          vertexColors
        />
      </instancedMesh>

      {/* Silky oaks */}
      <instancedMesh ref={oakTrunkRef} args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, 100]} castShadow receiveShadow>
        <cylinderGeometry args={[0.55, 0.85, 1, 14, 5]} />
        <meshStandardMaterial map={barkMap ?? undefined} color={barkMap ? '#ffffff' : '#6b4f3a'} roughness={1} vertexColors />
      </instancedMesh>
      <instancedMesh ref={oakCanopyRef} args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, 100]} castShadow receiveShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial
          map={leafMap ?? undefined}
          color={leafMap ? '#ffffff' : '#3dbb58'}
          roughness={0.92}
          emissive="#2f8f3c"
          emissiveIntensity={0.14}
          vertexColors
        />
      </instancedMesh>
      <instancedMesh ref={oakCanopy2Ref} args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, 100]} castShadow receiveShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial
          map={leafMap ?? undefined}
          color={leafMap ? '#ffffff' : '#4fd36f'}
          roughness={0.92}
          emissive="#2f8f3c"
          emissiveIntensity={0.14}
          vertexColors
        />
      </instancedMesh>

      {/* Silky oak leaf cards */}
      <instancedMesh ref={oakLeafCardsRef} args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, 2000]} castShadow receiveShadow>
        <planeGeometry args={[1, 1, 1, 1]} />
        <meshStandardMaterial
          map={oakLeafCardMap ?? undefined}
          color={oakLeafCardMap ? '#ffffff' : '#3dbb58'}
          roughness={0.92}
          metalness={0}
          emissive="#2f8f3c"
          emissiveIntensity={0.18}
          transparent
          alphaTest={0.5}
          depthWrite={false}
          side={THREE.DoubleSide}
          vertexColors
        />
      </instancedMesh>
    </group>
  );
}

const SCHOOL_VARIANTS = [
  {
    width: 5.6,
    height: 3.1,
    depth: 2.8,
    facade: '#f5f5f4',
    roof: '#b45309',
    accent: '#2563eb',
    wallTexture: 'brick' as const,
    roofStyle: 'flat' as const,
    wing: true,
  },
  {
    width: 4.8,
    height: 3.6,
    depth: 3.2,
    facade: '#e7e5e4',
    roof: '#92400e',
    accent: '#16a34a',
    wallTexture: 'stucco' as const,
    roofStyle: 'gable' as const,
    wing: false,
  },
  {
    width: 6.2,
    height: 3.0,
    depth: 3.0,
    facade: '#fafaf9',
    roof: '#7c2d12',
    accent: '#a855f7',
    wallTexture: 'panels' as const,
    roofStyle: 'flat' as const,
    wing: true,
  },
  {
    width: 5.2,
    height: 3.9,
    depth: 2.6,
    facade: '#f4f4f5',
    roof: '#9a3412',
    accent: '#f59e0b',
    wallTexture: 'brick' as const,
    roofStyle: 'gable' as const,
    wing: false,
  },
];

function getSchoolVariantIndex(label: string) {
  return label === 'Year 3' ? 0 : label === 'Year 5' ? 1 : label === 'Year 7' ? 2 : 3;
}

function createGrassTexture(size = 512, repeat = 8) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Base fill
  ctx.fillStyle = '#2f8f3c';
  ctx.fillRect(0, 0, size, size);

  // Soft mottled noise
  for (let i = 0; i < 18000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 1.8;
    const g = 120 + Math.floor(Math.random() * 90);
    const b = 60 + Math.floor(Math.random() * 55);
    const a = 0.03 + Math.random() * 0.06;
    ctx.fillStyle = `rgba(30, ${g}, ${b}, ${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Grass blade strokes
  ctx.lineCap = 'round';
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 4 + Math.random() * 10;
    const ang = (Math.random() - 0.5) * 0.9;
    const x2 = x + Math.sin(ang) * len;
    const y2 = y - Math.cos(ang) * len;

    const light = Math.random();
    const a = 0.06 + Math.random() * 0.10;
    ctx.strokeStyle = light > 0.5 ? `rgba(210, 255, 210, ${a})` : `rgba(10, 60, 18, ${a})`;
    ctx.lineWidth = 0.6 + Math.random() * 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createSoilTexture(size = 512, repeat = 24) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Base dirt tone
  ctx.fillStyle = '#6b4f3a';
  ctx.fillRect(0, 0, size, size);

  // Speckled pebbles / grains
  for (let i = 0; i < 24000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 0.6 + Math.random() * 2.2;
    const a = 0.03 + Math.random() * 0.10;
    const shade = Math.random();
    const c = shade > 0.55 ? 'rgba(255,255,255,' : 'rgba(0,0,0,';
    ctx.fillStyle = `${c}${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Subtle organic blotches
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 10 + Math.random() * 34;
    const a = 0.03 + Math.random() * 0.05;
    ctx.fillStyle = `rgba(40, 25, 15, ${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // A few fine cracks
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 20 + Math.random() * 80;
    const ang = Math.random() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

type FacadeTextureKind = 'brick' | 'stucco' | 'panels';

function createFacadeTexture(kind: FacadeTextureKind, size = 768, seed = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Tiny deterministic-ish RNG (so textures stay stable across renders)
  let s = seed >>> 0;
  const rnd = () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0xffffffff;
  };

  if (kind === 'brick') {
    // Mortar base
    ctx.fillStyle = '#e8e4df';
    ctx.fillRect(0, 0, size, size);

    const brickH = Math.round(size / 16);
    const brickW = Math.round(brickH * 2.1);
    const mortar = Math.max(2, Math.round(brickH * 0.12));

    for (let y = -brickH; y < size + brickH; y += brickH + mortar) {
      const odd = Math.floor(y / (brickH + mortar)) % 2 !== 0;
      const xOffset = odd ? Math.round((brickW + mortar) / 2) : 0;
      for (let x = -brickW; x < size + brickW; x += brickW + mortar) {
        const px = x + xOffset;
        const hue = rnd() > 0.5 ? 14 : 10;
        const sat = 35 + Math.floor(rnd() * 18);
        const light = 34 + Math.floor(rnd() * 14);
        ctx.fillStyle = `hsl(${hue} ${sat}% ${light}%)`;
        ctx.fillRect(px + mortar, y + mortar, brickW, brickH);

        // Subtle speckle
        const specks = 12;
        for (let i = 0; i < specks; i++) {
          const sx = px + mortar + rnd() * brickW;
          const sy = y + mortar + rnd() * brickH;
          ctx.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.04})`;
          ctx.fillRect(sx, sy, 1, 1);
        }
      }
    }

    // Light grime pass
    for (let i = 0; i < 7000; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const a = 0.015 + rnd() * 0.03;
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.fillRect(x, y, 2, 2);
    }
  } else if (kind === 'stucco') {
    // Warm plaster base
    ctx.fillStyle = '#f1efe9';
    ctx.fillRect(0, 0, size, size);

    // Blotchy texture
    for (let i = 0; i < 26000; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 0.8 + rnd() * 2.2;
      const a = 0.02 + rnd() * 0.05;
      const shade = rnd() > 0.5 ? 0 : 12;
      ctx.fillStyle = `rgba(${220 - shade},${220 - shade},${220 - shade},${a})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hairline cracks
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 120; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const len = 30 + rnd() * 90;
      const ang = rnd() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      ctx.stroke();
    }
  } else {
    // Painted panel cladding
    ctx.fillStyle = '#eef2f7';
    ctx.fillRect(0, 0, size, size);

    // Vertical panels
    const panelW = Math.round(size / 12);
    for (let x = 0; x < size; x += panelW) {
      const t = x / size;
      const shade = 8 + Math.floor((Math.sin(t * Math.PI * 6) * 0.5 + 0.5) * 18);
      ctx.fillStyle = `rgb(${235 - shade},${240 - shade},${248 - shade})`;
      ctx.fillRect(x, 0, panelW - 2, size);
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(x + panelW - 2, 0, 2, size);
    }

    // A few subtle horizontal seams
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    for (let i = 1; i < 6; i++) {
      const y = Math.round((i * size) / 6);
      ctx.fillRect(0, y, size, 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createStoneTexture(size = 768, seed = 4242) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Deterministic-ish RNG
  let s = seed >>> 0;
  const rnd = () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0xffffffff;
  };

  ctx.fillStyle = '#d6d3d1';
  ctx.fillRect(0, 0, size, size);

  // Block pattern
  const rowH = Math.round(size / 10);
  const mortar = Math.max(2, Math.round(rowH * 0.08));
  for (let y = 0; y < size; y += rowH + mortar) {
    const odd = Math.floor(y / (rowH + mortar)) % 2 !== 0;
    const baseW = Math.round(size / 6);
    let x = odd ? Math.round(baseW * 0.5) : 0;
    while (x < size) {
      const w = baseW * (0.75 + rnd() * 0.75);
      const h = rowH * (0.75 + rnd() * 0.65);
      const hue = 30 + Math.floor(rnd() * 8);
      const sat = 6 + Math.floor(rnd() * 10);
      const light = 72 + Math.floor(rnd() * 10);
      ctx.fillStyle = `hsl(${hue} ${sat}% ${light}%)`;
      ctx.fillRect(x + mortar, y + mortar, w - mortar * 1.5, h - mortar * 1.5);

      // Stone noise
      for (let i = 0; i < 180; i++) {
        const sx = x + mortar + rnd() * Math.max(1, w - mortar * 2);
        const sy = y + mortar + rnd() * Math.max(1, h - mortar * 2);
        ctx.fillStyle = `rgba(0,0,0,${0.015 + rnd() * 0.03})`;
        ctx.fillRect(sx, sy, 1, 1);
      }

      x += w;
    }
  }

  // Grime/vignette
  const g = ctx.createRadialGradient(size * 0.5, size * 0.45, size * 0.05, size * 0.5, size * 0.5, size * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function OvalField({ position = [0, 0, 0] }: { position?: Vec3 }) {
  // A flat circle scaled in X/Z to become an oval.
  const rx = FIELD_RX;
  const rz = FIELD_RZ;

  const grassMap = React.useMemo(() => createGrassTexture(512, 8), []);

  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[rx, 1, rz]} receiveShadow>
        <circleGeometry args={[1, 96]} />
        <meshStandardMaterial map={grassMap ?? undefined} color={grassMap ? '#ffffff' : '#2f8f3c'} roughness={1} />
      </mesh>

      {/* Slightly darker rim to make the oval read better */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[rx * 1.03, 1, rz * 1.03]} position={[0, 0.001, 0]}>
        <ringGeometry args={[0.98, 1, 96]} />
        <meshStandardMaterial color="#256f30" roughness={1} metalness={0} />
      </mesh>
    </group>
  );
}

function SchoolBuilding({
  position,
  label,
  onBoardSectionClick,
}: {
  position: Vec3;
  label: string;
  onBoardSectionClick?: (key: PracticeSectionKey) => void;
}) {
  const variant = getSchoolVariantIndex(label);
  const cfg = SCHOOL_VARIANTS[variant];
  const s = BUILDING_SCALE;
  const width = cfg.width * s;
  const height = cfg.height * s;
  const depth = cfg.depth * s;

  // Use locally bundled fonts (avoids runtime failures when external URLs are blocked).
  // Troika supports .woff (not .woff2).
  const boardFontHeader = robotoSlabHeaderWoff;
  const boardFontBody = robotoBodyWoff;

  const year3BoardItems = React.useMemo(
    () => ({
      numeracy: [
        { key: 'addition' as const, label: 'Addition' },
        { key: 'subtraction' as const, label: 'Subtraction' },
        { key: 'multiplication' as const, label: 'Multiplication' },
        { key: 'measurement' as const, label: 'Measurement' },
        { key: 'geometry' as const, label: 'Geometry' },
        { key: 'dataProbability' as const, label: 'Data & Probability' },
      ],
      literacy: [
        { key: 'languageConventions' as const, label: 'Language Conventions' },
        { key: 'readingMagazine' as const, label: 'Reading Magazine' },
        { key: 'writing' as const, label: 'Writing' },
      ],
    }),
    []
  );

  const wallMap = React.useMemo(() => {
    const map = createFacadeTexture(cfg.wallTexture, 768, 1337 + variant * 97);
    if (!map) return null;
    // Repeat so it looks like bricks/panels rather than a single giant print.
    const repeatX = cfg.wallTexture === 'panels' ? 2.5 : 3.5;
    const repeatY = cfg.wallTexture === 'panels' ? 1.8 : 2.4;
    map.repeat.set(repeatX, repeatY);
    return map;
  }, [cfg.wallTexture, variant]);

  // Rotate so the building "front" faces the field center (origin).
  // Our front face is +Z.
  const rotY = Math.atan2(position[0], position[2]) + Math.PI;

  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {/* Main block */}
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          map={wallMap ?? undefined}
          color={wallMap ? '#ffffff' : cfg.facade}
          roughness={0.93}
        />
      </mesh>

      {/* Optional side wing */}
      {cfg.wing && (
        <mesh position={[width * 0.42, (height * 0.55) / 2, -depth * 0.18]} castShadow receiveShadow>
          <boxGeometry args={[width * 0.52, height * 0.55, depth * 0.72]} />
          <meshStandardMaterial
            map={wallMap ?? undefined}
            color={wallMap ? '#ffffff' : cfg.facade}
            roughness={0.93}
          />
        </mesh>
      )}

      {/* Roof */}
      {cfg.roofStyle === 'flat' ? (
        <mesh position={[0, height + 0.22, 0]} castShadow>
          <boxGeometry args={[width * 1.02, 0.25, depth * 1.06]} />
          <meshStandardMaterial color={cfg.roof} roughness={0.8} />
        </mesh>
      ) : (
        <>
          {/* Gable roof as a long, low triangular-ish prism using a cone with 4 radial segments */}
          <mesh position={[0, height + 0.55, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
            <cylinderGeometry args={[0.001, depth * 0.75, width * 1.06, 4, 1]} />
            <meshStandardMaterial color={cfg.roof} roughness={0.82} />
          </mesh>
          <mesh position={[0, height + 0.12, 0]} castShadow>
            <boxGeometry args={[width * 1.01, 0.18, depth * 1.04]} />
            <meshStandardMaterial color={cfg.roof} roughness={0.82} />
          </mesh>
        </>
      )}

      {/* Accent band */}
      <mesh position={[0, height * 0.62, depth / 2 + 0.01]}>
        <boxGeometry args={[width * 0.98, height * 0.08, 0.02]} />
        <meshStandardMaterial color={cfg.accent} roughness={0.9} />
      </mesh>

      {/* Windows grid (simple emissive panes) */}
      {Array.from({ length: 6 }).map((_, i) => {
        const cols = 3;
        const row = Math.floor(i / cols);
        const col = i % cols;
        const wx = (col - 1) * (width * 0.22);
        const wy = height * (0.58 + row * 0.16);
        return (
          <mesh key={i} position={[wx, wy, depth / 2 + 0.012]}>
            <boxGeometry args={[width * 0.14, height * 0.09, 0.03]} />
            <meshStandardMaterial color="#0b1220" emissive="#0b1220" emissiveIntensity={0.25} roughness={0.4} />
          </mesh>
        );
      })}

      {/* Entrance canopy + doorway */}
      <mesh position={[0, 0.95, depth / 2 + 0.18]} castShadow>
        <boxGeometry args={[width * 0.32, 0.12, 0.55]} />
        <meshStandardMaterial color={cfg.roof} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.6, depth / 2 + 0.02]} castShadow>
        <boxGeometry args={[0.9 * s, 1.2 * s, 0.06]} />
        <meshStandardMaterial color="#111827" roughness={1} />
      </mesh>

      {/* Practice board (Year 3): framed frosted glass, wall-mounted */}
      {label === 'Year 3' && (
        <group position={[width * 0.38, 1.08, depth / 2 + 0.06]}>
          {/* Backplate / frame */}
          <RoundedBox args={[2.32, 1.62, 0.07]} radius={0.12} smoothness={8} castShadow receiveShadow>
            <meshStandardMaterial
              color="#111827"
              roughness={0.38}
              metalness={0.55}
              emissive="#0b1220"
              emissiveIntensity={0.22}
            />
          </RoundedBox>

          {/* Shadow gap + mounting standoffs (gives the "hung" look on brick) */}
          {([
            [-1.03, 0.69],
            [1.03, 0.69],
            [-1.03, -0.69],
            [1.03, -0.69],
          ] as Array<[number, number]>).map(([x, y], i) => (
            <group key={i} position={[x, y, -0.07]}>
              {/* Standoff */}
              <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[0.055, 0.055, 0.14, 18]} />
                <meshStandardMaterial color="#cbd5e1" roughness={0.32} metalness={0.9} />
              </mesh>
              {/* Bolt head */}
              <mesh position={[0, 0, 0.08]} castShadow>
                <cylinderGeometry args={[0.055, 0.055, 0.02, 6]} />
                <meshStandardMaterial color="#d4b26a" roughness={0.28} metalness={0.85} />
              </mesh>
            </group>
          ))}

          {/* Inner bezel */}
          <RoundedBox args={[2.18, 1.48, 0.03]} radius={0.1} smoothness={8} position={[0, 0, 0.03]}>
            <meshStandardMaterial color="#d4b26a" roughness={0.28} metalness={0.78} />
          </RoundedBox>

          {/* Bright backing so text is readable (matte panel behind glass) */}
          <RoundedBox args={[2.08, 1.38, 0.02]} radius={0.095} smoothness={10} position={[0, 0, 0.045]}>
            <meshStandardMaterial color="#f1f5f9" roughness={0.98} metalness={0} />
          </RoundedBox>

          {/* Frosted glass face */}
          <RoundedBox args={[2.12, 1.42, 0.035]} radius={0.1} smoothness={10} position={[0, 0, 0.055]}>
            <meshPhysicalMaterial
              color="#dbeafe"
              transmission={0.72}
              thickness={0.14}
              roughness={0.28}
              ior={1.45}
              transparent
              opacity={0.68}
              clearcoat={1}
              clearcoatRoughness={0.12}
              attenuationColor="#93c5fd"
              attenuationDistance={2.2}
            />
          </RoundedBox>

          {/* Header */}
          <Text
            position={[0, 0.59, 0.085]}
            font={boardFontHeader}
            fontSize={0.155}
            color="#0b1220"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.008}
            outlineColor="rgba(255,255,255,0.85)"
            letterSpacing={0.04}
          >
            YEAR 3 PRACTICE
          </Text>

          {/* Divider */}
          <mesh position={[0, 0.42, 0.085]}>
            <boxGeometry args={[1.9, 0.02, 0.01]} />
            <meshStandardMaterial color="rgba(15,23,42,0.35)" transparent opacity={0.3} />
          </mesh>

          {/* Columns (clickable items) */}
          <group position={[-0.95, 0.29, 0.085]}>
            <Text
              position={[0, 0, 0]}
              font={boardFontHeader}
              fontSize={0.125}
              color="#0b1220"
              anchorX="left"
              anchorY="top"
              outlineWidth={0.006}
              outlineColor="rgba(255,255,255,0.75)"
              letterSpacing={0.04}
            >
              NUMERACY
            </Text>
            {year3BoardItems.numeracy.map((it, idx) => (
              <Text
                key={it.key}
                position={[0, -0.14 - idx * 0.135, 0]}
                font={boardFontBody}
                fontSize={0.112}
                color="#0b1220"
                anchorX="left"
                anchorY="top"
                outlineWidth={0.006}
                outlineColor="rgba(255,255,255,0.8)"
                onPointerOver={(e) => {
                  e.stopPropagation();
                  document.body.style.cursor = 'pointer';
                }}
                onPointerOut={(e) => {
                  e.stopPropagation();
                  document.body.style.cursor = 'auto';
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onBoardSectionClick?.(it.key);
                }}
              >
                {`• ${it.label}`}
              </Text>
            ))}
          </group>

          <group position={[0.15, 0.29, 0.085]}>
            <Text
              position={[0, 0, 0]}
              font={boardFontHeader}
              fontSize={0.125}
              color="#0b1220"
              anchorX="left"
              anchorY="top"
              outlineWidth={0.006}
              outlineColor="rgba(255,255,255,0.75)"
              letterSpacing={0.04}
            >
              LITERACY
            </Text>
            {year3BoardItems.literacy.map((it, idx) => (
              <Text
                key={it.key}
                position={[0, -0.14 - idx * 0.135, 0]}
                font={boardFontBody}
                fontSize={0.112}
                color="#0b1220"
                anchorX="left"
                anchorY="top"
                outlineWidth={0.006}
                outlineColor="rgba(255,255,255,0.8)"
                onPointerOver={(e) => {
                  e.stopPropagation();
                  document.body.style.cursor = 'pointer';
                }}
                onPointerOut={(e) => {
                  e.stopPropagation();
                  document.body.style.cursor = 'auto';
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onBoardSectionClick?.(it.key);
                }}
              >
                {`• ${it.label}`}
              </Text>
            ))}
          </group>

          {/* Subtle sheen */}
          <mesh position={[0.55, 0.15, 0.092]} rotation={[0, 0, -0.38]}>
            <planeGeometry args={[1.35, 0.55]} />
            <meshStandardMaterial
              color="rgba(255,255,255,0.85)"
              transparent
              opacity={0.18}
              roughness={1}
              metalness={0}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {/* Label at the entry */}
      <Text
        position={[0, 1.55, depth / 2 + 0.32]}
        rotation={[0, 0, 0]}
        fontSize={0.38}
        color="#111827"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.01}
        outlineColor="rgba(255,255,255,0.65)"
      >
        {label}
      </Text>
    </group>
  );
}

function PathSegment({
  start,
  end,
  width = 1.8,
  thickness = 0.06,
  y = 0.004,
  map,
}: {
  start: Vec3;
  end: Vec3;
  width?: number;
  thickness?: number;
  y?: number;
  map: THREE.Texture | null;
}) {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const len = Math.max(0.001, Math.sqrt(dx * dx + dz * dz));
  const yaw = Math.atan2(dx, dz);

  const segMap = React.useMemo(() => {
    if (!map) return null;
    const m = map.clone();
    m.wrapS = THREE.RepeatWrapping;
    m.wrapT = THREE.RepeatWrapping;
    // BoxGeometry top face uses U across X (width) and V across Z (length).
    m.repeat.set(Math.max(1, width / 1.6), Math.max(1, len / 2.2));
    m.needsUpdate = true;
    return m;
  }, [len, map, width]);

  return (
    <mesh
      position={[(start[0] + end[0]) / 2, y + thickness / 2, (start[2] + end[2]) / 2]}
      rotation={[0, yaw, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[width, thickness, len]} />
      <meshStandardMaterial map={segMap ?? undefined} color={segMap ? '#ffffff' : '#6b4f3a'} roughness={1} />
    </mesh>
  );
}

function Walkways({
  fenceRx,
  fenceRz,
  gateAngle,
  soilMap,
}: {
  fenceRx: number;
  fenceRz: number;
  gateAngle: number;
  soilMap: THREE.Texture | null;
}) {
  // Keep in sync with SchoolsAroundField placement.
  const fieldRx = FIELD_RX;
  const fieldRz = FIELD_RZ;
  const outward = SCHOOL_OUTWARD;

  const buildingPositions = React.useMemo(() => {
    return SCHOOL_ANGLES.map((a) => {
      const x = Math.cos(a) * (fieldRx + outward);
      const z = Math.sin(a) * (fieldRz + outward);
      return [x, 0, z] as Vec3;
    });
  }, [fieldRx, fieldRz, outward]);

  const entrancePoints = React.useMemo(() => {
    return buildingPositions.map((pos, i) => {
      const cfg = SCHOOL_VARIANTS[getSchoolVariantIndex(SCHOOL_LABELS[i])];
      const depth = cfg.depth * BUILDING_SCALE;
      const v = new THREE.Vector3(-pos[0], 0, -pos[2]);
      if (v.lengthSq() < 1e-6) v.set(0, 0, -1);
      v.normalize();
      // Move from building center toward origin to reach the entrance face.
      const offset = depth / 2 + 1.0;
      return [pos[0] + v.x * offset, 0, pos[2] + v.z * offset] as Vec3;
    });
  }, [buildingPositions]);

  const gateInside = React.useMemo(() => {
    // A point slightly inside the fence at the gate.
    const center = new THREE.Vector3(Math.cos(gateAngle) * fenceRx, 0, Math.sin(gateAngle) * fenceRz);
    const radial = new THREE.Vector3(center.x, 0, center.z).normalize();
    const inset = 1.9;
    return [center.x - radial.x * inset, 0, center.z - radial.z * inset] as Vec3;
  }, [fenceRx, fenceRz, gateAngle]);

  const gateOutside = React.useMemo(() => {
    // Extend the walkway out beyond the fence.
    const center = new THREE.Vector3(Math.cos(gateAngle) * fenceRx, 0, Math.sin(gateAngle) * fenceRz);
    const radial = new THREE.Vector3(center.x, 0, center.z).normalize();
    const out = 28;
    return [center.x + radial.x * out, 0, center.z + radial.z * out] as Vec3;
  }, [fenceRx, fenceRz, gateAngle]);

  const segments = React.useMemo(() => {
    const segs: Array<{ a: Vec3; b: Vec3; w?: number }> = [];

    // Gate path: inside -> outside.
    segs.push({ a: gateInside, b: gateOutside, w: 2.1 });

    // Main spine from gate to the center.
    segs.push({ a: gateInside, b: ORIGIN, w: 2.3 });

    // Branches from center to each building entrance.
    for (const e of entrancePoints) {
      segs.push({ a: ORIGIN, b: e, w: 1.9 });
    }

    // Loop connecting buildings to each other (entrances).
    for (let i = 0; i < entrancePoints.length; i++) {
      const a = entrancePoints[i];
      const b = entrancePoints[(i + 1) % entrancePoints.length];
      segs.push({ a, b, w: 1.7 });
    }

    return segs;
  }, [entrancePoints, gateInside, gateOutside]);

  return (
    <group>
      {segments.map((s, i) => (
        <PathSegment key={i} start={s.a} end={s.b} width={s.w ?? 1.8} thickness={0.04} y={-0.03} map={soilMap} />
      ))}
    </group>
  );
}

function smoothstep(t: number) {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

type TourKeyframe = { pos: THREE.Vector3; target: THREE.Vector3; seconds: number };
type ActiveTour = {
  keys: TourKeyframe[];
  keyIndex: number;
  segStartTime: number;
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  segSeconds: number;
};

function CameraTour({
  requestId,
  onStarted,
  onFinished,
  lockAfterFinish = false,
}: {
  requestId: number;
  onStarted?: () => void;
  onFinished?: () => void;
  lockAfterFinish?: boolean;
}) {
  const { camera, controls } = useThree();
  const tourRef = React.useRef<ActiveTour | null>(null);
  const lastRequestRef = React.useRef(0);
  const onStartedRef = React.useRef<typeof onStarted>(onStarted);
  const onFinishedRef = React.useRef<typeof onFinished>(onFinished);

  React.useEffect(() => {
    onStartedRef.current = onStarted;
    onFinishedRef.current = onFinished;
  }, [onFinished, onStarted]);

  const beginSegment = React.useCallback((now: number, keys: TourKeyframe[], keyIndex: number) => {
    const from = keys[keyIndex];
    const to = keys[keyIndex + 1];

    tourRef.current = {
      keys,
      keyIndex,
      segStartTime: now,
      fromPos: from.pos.clone(),
      toPos: to.pos.clone(),
      fromTarget: from.target.clone(),
      toTarget: to.target.clone(),
      segSeconds: Math.max(0.01, to.seconds),
    };
  }, []);

  React.useEffect(() => {
    if (requestId === 0 || requestId === lastRequestRef.current) return;
    lastRequestRef.current = requestId;

    const orbit = controls as any;
    if (orbit) orbit.enabled = false;

    onStartedRef.current?.();

    // Compute the Year 3 entrance point (match Walkways/SchoolsAroundField placement).
    const idx = 0; // Year 3
    const a = SCHOOL_ANGLES[idx];
    const bx = Math.cos(a) * (FIELD_RX + SCHOOL_OUTWARD);
    const bz = Math.sin(a) * (FIELD_RZ + SCHOOL_OUTWARD);
    const cfg = SCHOOL_VARIANTS[getSchoolVariantIndex(SCHOOL_LABELS[idx])];
    const depth = cfg.depth * BUILDING_SCALE;

    const vToOrigin = new THREE.Vector3(-bx, 0, -bz);
    if (vToOrigin.lengthSq() < 1e-6) vToOrigin.set(0, 0, -1);
    vToOrigin.normalize();

    // Door plane center (on the building face toward the field).
    const doorCenter = new THREE.Vector3(bx, 0, bz).addScaledVector(vToOrigin, depth / 2 + 1.0);
    const doorTarget = doorCenter.clone().setY(1.35);

    // Camera stop position in front of the door, from inside the field.
    const stopAtDoor = doorCenter.clone().addScaledVector(vToOrigin, 3.6);

    // Gate points (match Walkways).
    const gateAngle = Math.PI / 2;
    const gateCenter = new THREE.Vector3(Math.cos(gateAngle) * FENCE_RX, 0, Math.sin(gateAngle) * FENCE_RZ);
    const radial = new THREE.Vector3(gateCenter.x, 0, gateCenter.z).normalize();
    const gateInside = gateCenter.clone().addScaledVector(radial, -1.9);
    const gateOutside = gateCenter.clone().addScaledVector(radial, 28);

    // Low, "walkway-level" camera.
    const eyeH = 0.85;
    const gateOutsideEye = gateOutside.clone().setY(eyeH);
    const gateInsideEye = gateInside.clone().setY(eyeH);
    const originEye = new THREE.Vector3(0, eyeH, 0);
    const doorEye = stopAtDoor.clone().setY(0.95);
    const midToDoorEye = originEye.clone().lerp(doorEye, 0.62);

    const lookLow = (p: THREE.Vector3) => p.clone().setY(0.7);
    const originVec = new THREE.Vector3(0, 0, 0);

    // Always start the tour from a known point OUTSIDE the gate.
    // If we start from the current OrbitControls camera pose, the first segment can look like
    // the camera moves "backward" (e.g. if the user is already inside/near the gate).
    const startPos = gateOutsideEye.clone();
    const startTarget = lookLow(gateInside);

    // Snap immediately so there is no 1-frame backward lerp.
    camera.position.copy(startPos);
    camera.lookAt(startTarget);
    if (orbit?.target) orbit.target.copy(startTarget);

    const keys: TourKeyframe[] = [
      { pos: startPos, target: startTarget, seconds: 0 },
      // Pause briefly so the gate can finish opening.
      { pos: startPos, target: startTarget, seconds: 1.0 },
      // User is definitely outside the gate: move forward through the fully-open gate.
      { pos: gateOutsideEye, target: lookLow(gateInside), seconds: 2.8 },
      { pos: gateInsideEye, target: lookLow(originVec), seconds: 2.8 },
      // Arrive at the center of the field.
      { pos: originEye, target: lookLow(originVec), seconds: 4.4 },
      // Turn at the center to face Year 3.
      { pos: originEye, target: doorTarget, seconds: 2.2 },
      // Walk from inside the field toward the Year 3 door and stop there.
      { pos: midToDoorEye, target: doorTarget, seconds: 4.8 },
      { pos: doorEye, target: doorTarget, seconds: 4.6 },
    ];

    // Start on next frame.
    tourRef.current = {
      keys,
      keyIndex: 0,
      segStartTime: -1,
      fromPos: keys[0].pos.clone(),
      toPos: keys[1].pos.clone(),
      fromTarget: keys[0].target.clone(),
      toTarget: keys[1].target.clone(),
      segSeconds: Math.max(0.01, keys[1].seconds),
    };
  }, [camera, controls, requestId]);

  useFrame((state) => {
    const tour = tourRef.current;
    if (!tour) return;

    const orbit = controls as any;
    const now = state.clock.elapsedTime;

    if (tour.segStartTime < 0) {
      beginSegment(now, tour.keys, 0);
      return;
    }

    const t = (now - tour.segStartTime) / tour.segSeconds;
    const eased = smoothstep(t);

    camera.position.lerpVectors(tour.fromPos, tour.toPos, eased);
    const newTarget = new THREE.Vector3().lerpVectors(tour.fromTarget, tour.toTarget, eased);

    // Drive the camera directly during the tour.
    // Avoid calling OrbitControls.update() here: it can clamp angles and override our position,
    // which looks like the camera drifting upward (+Y) instead of moving forward.
    camera.lookAt(newTarget);

    if (t >= 1) {
      const nextIndex = tour.keyIndex + 1;
      if (nextIndex >= tour.keys.length - 1) {
        // Snap to the exact final keyframe pose.
        camera.position.copy(tour.toPos);
        camera.lookAt(tour.toTarget);

        // If we're locking at the door, do NOT call orbit.update() here.
        // OrbitControls can enforce min/max distance + polar angle limits and move the camera
        // away from the door (the "jump" you're seeing).
        if (!lockAfterFinish && orbit?.target) {
          orbit.target.copy(tour.toTarget);
          orbit.update?.();
        }
        tourRef.current = null;
        if (orbit) orbit.enabled = !lockAfterFinish;
        onFinishedRef.current?.();
        return;
      }
      beginSegment(now, tour.keys, nextIndex);
    }
  });

  return null;
}

function SchoolsAroundField({
  onBoardSectionClick,
}: {
  onBoardSectionClick?: (key: PracticeSectionKey) => void;
}) {
  // Match the oval field radii, then push the buildings slightly outward.
  const fieldRx = FIELD_RX;
  const fieldRz = FIELD_RZ;
  const outward = SCHOOL_OUTWARD;

  return (
    <group>
      {SCHOOL_ANGLES.map((a, i) => {
        const x = Math.cos(a) * (fieldRx + outward);
        const z = Math.sin(a) * (fieldRz + outward);
        return (
          <SchoolBuilding
            key={SCHOOL_LABELS[i]}
            position={[x, 0, z]}
            label={SCHOOL_LABELS[i]}
            onBoardSectionClick={onBoardSectionClick}
          />
        );
      })}
    </group>
  );
}

function FenceOval({
  rx,
  rz,
  postCount = 88,
  y = 0,
  gateAngle = Math.PI / 2,
  gateWidth = 7.5,
}: {
  rx: number;
  rz: number;
  postCount?: number;
  y?: number;
  gateAngle?: number;
  gateWidth?: number;
}) {
  const postsRef = React.useRef<THREE.InstancedMesh | null>(null);
  const railsTopRef = React.useRef<THREE.InstancedMesh | null>(null);
  const railsMidRef = React.useRef<THREE.InstancedMesh | null>(null);

  const points = React.useMemo(() => {
    const pts: Array<{ p: THREE.Vector3; a: number }> = [];
    for (let i = 0; i < postCount; i++) {
      const a = (i / postCount) * Math.PI * 2;
      pts.push({ p: new THREE.Vector3(Math.cos(a) * rx, y, Math.sin(a) * rz), a });
    }
    return pts;
  }, [postCount, rx, rz, y]);

  const isInGate = React.useCallback(
    (a: number) => {
      // Compute an angular span for the gap based on desired gateWidth.
      // Arc length per radian for ellipse param: |dP/da| = sqrt((rx sin a)^2 + (rz cos a)^2)
      const dMag = Math.sqrt((rx * Math.sin(gateAngle)) ** 2 + (rz * Math.cos(gateAngle)) ** 2);
      const span = Math.min(0.75, Math.max(0.16, gateWidth / Math.max(6, dMag)));
      const half = span / 2;

      const wrap = (t: number) => {
        let v = t % (Math.PI * 2);
        if (v < 0) v += Math.PI * 2;
        return v;
      };

      const aa = wrap(a);
      const ga = wrap(gateAngle);
      // Shortest signed angular difference in (-pi, pi]
      let diff = aa - ga;
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff <= -Math.PI) diff += Math.PI * 2;
      return Math.abs(diff) <= half;
    },
    [gateAngle, gateWidth, rx, rz]
  );

  React.useLayoutEffect(() => {
    const posts = postsRef.current;
    const railsTop = railsTopRef.current;
    const railsMid = railsMidRef.current;
    if (!posts || !railsTop || !railsMid) return;

    const dummy = new THREE.Object3D();
    const xAxis = new THREE.Vector3(1, 0, 0);
    const dir = new THREE.Vector3();

    const include = points.map((pt) => !isInGate(pt.a));
    const includedPoints = points.filter((_, idx) => include[idx]);

    // Posts
    for (let i = 0; i < includedPoints.length; i++) {
      const p = includedPoints[i].p;
      dummy.position.set(p.x, y + 0.9, p.z);
      dummy.quaternion.identity();
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      posts.setMatrixAt(i, dummy.matrix);
    }
    posts.instanceMatrix.needsUpdate = true;
    posts.count = includedPoints.length;

    // Rails: one segment per edge between posts
    let railIdx = 0;
    for (let i = 0; i < postCount; i++) {
      if (!include[i] || !include[(i + 1) % postCount]) continue;
      const a = points[i].p;
      const b = points[(i + 1) % postCount].p;
      const midX = (a.x + b.x) * 0.5;
      const midZ = (a.z + b.z) * 0.5;
      dir.set(b.x - a.x, 0, b.z - a.z);
      const len = dir.length();
      if (len <= 0.0001) continue;
      dir.normalize();
      dummy.quaternion.setFromUnitVectors(xAxis, dir);
      dummy.scale.set(len, 1, 1);

      dummy.position.set(midX, y + 1.32, midZ);
      dummy.updateMatrix();
      railsTop.setMatrixAt(railIdx, dummy.matrix);

      dummy.position.set(midX, y + 0.95, midZ);
      dummy.updateMatrix();
      railsMid.setMatrixAt(railIdx, dummy.matrix);
      railIdx++;
    }
    railsTop.instanceMatrix.needsUpdate = true;
    railsMid.instanceMatrix.needsUpdate = true;
    railsTop.count = railIdx;
    railsMid.count = railIdx;
  }, [isInGate, points, postCount, y]);

  return (
    <group>
      {/* Posts */}
      <instancedMesh ref={postsRef} args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, postCount]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 1.8, 10]} />
        <meshStandardMaterial color="#111827" roughness={0.6} metalness={0.35} />
      </instancedMesh>

      {/* Rails (top + mid) */}
      <instancedMesh
        ref={railsTopRef}
        args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, postCount]}
        castShadow
      >
        <boxGeometry args={[1, 0.08, 0.06]} />
        <meshStandardMaterial color="#111827" roughness={0.55} metalness={0.4} />
      </instancedMesh>
      <instancedMesh
        ref={railsMidRef}
        args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, postCount]}
        castShadow
      >
        <boxGeometry args={[1, 0.07, 0.05]} />
        <meshStandardMaterial color="#111827" roughness={0.55} metalness={0.4} />
      </instancedMesh>
    </group>
  );
}

function BigGate({
  rx,
  rz,
  angle = Math.PI / 2,
  width = 7.5,
  y = 0,
  onLockClick,
  onYear3Click,
  forceOpen = false,
  unlocked = false,
}: {
  rx: number;
  rz: number;
  angle?: number;
  width?: number;
  y?: number;
  onLockClick?: () => void;
  onYear3Click?: () => void;
  forceOpen?: boolean;
  unlocked?: boolean;
}) {
  const center = React.useMemo(() => new THREE.Vector3(Math.cos(angle) * rx, y, Math.sin(angle) * rz), [angle, rx, rz, y]);
  const radial = React.useMemo(() => new THREE.Vector3(center.x, 0, center.z).normalize(), [center.x, center.z]);
  const yaw = React.useMemo(() => Math.atan2(radial.x, radial.z), [radial.x, radial.z]);

  const gateRootRef = React.useRef<THREE.Group | null>(null);

  const [year3Hover, setYear3Hover] = React.useState(false);

  const stoneMap = React.useMemo(() => {
    const m = createStoneTexture(768, 777);
    if (!m) return null;
    m.repeat.set(2.2, 1.6);
    return m;
  }, []);

  const soilMap = React.useMemo(() => {
    const m = createSoilTexture(512, 12);
    if (!m) return null;
    m.repeat.set(2.8, 2.2);
    return m;
  }, []);

  const ornamentMap = React.useMemo(() => createGateOrnamentTexture(512), []);

  const pillarH = 5.2;
  const pillarW = 1.0;
  const pillarD = 1.2;
  const beamH = 0.55;
  const beamD = 1.25;
  const openingH = 3.2;
  const doorH = 2.7;
  const doorD = 0.16;
  const doorW = width / 2 - 0.25;

  const nameplateShape = React.useMemo(() => {
    const w = 1.6;
    const h = 1.3;
    const r = 0.14;
    const x = -w / 2;
    const y = -h / 2;

    const s = new THREE.Shape();
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    s.lineTo(x + w, y + h - r);
    s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    s.lineTo(x + r, y + h);
    s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(x, y + r);
    s.absarc(x + r, y + r, r, Math.PI, (3 * Math.PI) / 2, false);
    s.closePath();
    return s;
  }, []);

  const lockX = -doorW / 2 + 0.08;

  const leftDoorHingeRef = React.useRef<THREE.Group | null>(null);
  const rightDoorHingeRef = React.useRef<THREE.Group | null>(null);
  const lockShackleRef = React.useRef<THREE.Group | null>(null);
  const nameplateMatRef = React.useRef<THREE.MeshPhysicalMaterial | null>(null);
  const nameplateLightRef = React.useRef<THREE.PointLight | null>(null);
  const yearShimmerTextRef = React.useRef<any>(null);

  const openT = React.useRef(0);

  const shimmerMat = React.useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#c8fbff'),
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    m.toneMapped = false;
    return m;
  }, []);

  const renderDoorFace = React.useCallback(
    (zSign: 1 | -1) => {
      const borderZ = zSign * (doorD / 2 - 0.035);
      const bandZ = zSign * (doorD / 2 - 0.06);
      const medallionZ = zSign * (doorD / 2 - 0.05);
      const medallionInsetZ = zSign * (doorD / 2 - 0.065);
      const accentZ = zSign * (doorD / 2 - 0.055);

      return (
        <>
          {/* Subtle raised border */}
          <mesh position={[0, 0, borderZ]} castShadow receiveShadow>
            <boxGeometry args={[doorW * 0.965, doorH * 0.965, 0.07]} />
            <meshStandardMaterial color="#d9e2ef" roughness={0.35} metalness={0.38} />
          </mesh>

          {/* Top decorative band */}
          <mesh position={[0, doorH * 0.40, bandZ]} castShadow receiveShadow>
            <boxGeometry args={[doorW * 0.92, doorH * 0.18, 0.025]} />
            <meshStandardMaterial map={ornamentMap ?? undefined} color={ornamentMap ? '#ffffff' : '#d9e2ef'} roughness={0.42} metalness={0.32} />
          </mesh>

          {/* Bottom decorative band */}
          <mesh position={[0, -doorH * 0.44, bandZ]} castShadow receiveShadow>
            <boxGeometry args={[doorW * 0.92, doorH * 0.16, 0.025]} />
            <meshStandardMaterial map={ornamentMap ?? undefined} color={ornamentMap ? '#ffffff' : '#d9e2ef'} roughness={0.42} metalness={0.32} />
          </mesh>

          {/* Central circular medallion */}
          <mesh position={[0, doorH * 0.02, medallionZ]} castShadow receiveShadow>
            <torusGeometry args={[0.35, 0.03, 14, 48]} />
            <meshStandardMaterial color="#c2ccd9" roughness={0.35} metalness={0.42} />
          </mesh>
          <mesh position={[0, doorH * 0.02, medallionInsetZ]} castShadow receiveShadow>
            <cylinderGeometry args={[0.31, 0.31, 0.02, 40]} />
            <meshStandardMaterial color="#d9e2ef" roughness={0.55} metalness={0.25} />
          </mesh>

          {/* Horizontal accent bars (left + right of medallion) */}
          {[-0.14, 0.0, 0.14].map((yy) => (
            <React.Fragment key={`${zSign}-${yy}`}>
              <mesh position={[-doorW * 0.28, yy, accentZ]} castShadow receiveShadow>
                <boxGeometry args={[doorW * 0.32, 0.03, 0.02]} />
                <meshStandardMaterial color="#b8c3d3" roughness={0.35} metalness={0.4} />
              </mesh>
              <mesh position={[doorW * 0.28, yy, accentZ]} castShadow receiveShadow>
                <boxGeometry args={[doorW * 0.32, 0.03, 0.02]} />
                <meshStandardMaterial color="#b8c3d3" roughness={0.35} metalness={0.4} />
              </mesh>
            </React.Fragment>
          ))}

          {/* Bottom horizontal slats */}
          {Array.from({ length: 4 }).map((_, i) => {
            const yy = -doorH * 0.26 - i * 0.09;
            return (
              <mesh key={`${zSign}-slat-${i}`} position={[0, yy, accentZ]} castShadow receiveShadow>
                <boxGeometry args={[doorW * 0.86, 0.03, 0.02]} />
                <meshStandardMaterial color="#b8c3d3" roughness={0.35} metalness={0.4} />
              </mesh>
            );
          })}
        </>
      );
    },
    [doorD, doorH, doorW, ornamentMap]
  );

  useFrame((state, dt) => {
    const target = forceOpen ? 1 : unlocked ? 0.22 : 0;
    // Smooth approach; stable across frame rates.
    const k = 8.5;
    openT.current = THREE.MathUtils.damp(openT.current, target, k, dt);

    const doorAngle = openT.current * 1.35; // ~77 degrees (fully open)
    // Open inward (toward -Z in local gate coordinates)
    if (leftDoorHingeRef.current) leftDoorHingeRef.current.rotation.y = doorAngle;
    if (rightDoorHingeRef.current) rightDoorHingeRef.current.rotation.y = -doorAngle;

    if (lockShackleRef.current) {
      // Tilt + lift when unlocked.
      const t = openT.current;
      lockShackleRef.current.position.y = 0.19 + 0.09 * t;
      lockShackleRef.current.position.x = 0.0 + 0.07 * t;
      lockShackleRef.current.rotation.z = 0.0 + (Math.PI / 2.8) * t;
      lockShackleRef.current.rotation.x = 0.0 + (Math.PI / 14) * t;
    }

    // Bring the whole gate slightly closer (toward camera/outside) when unlocked.
    if (gateRootRef.current) {
      const approach = openT.current * 6.0;
      gateRootRef.current.position.set(center.x + radial.x * approach, center.y, center.z + radial.z * approach);
    }

    // Shimmer/glow sweeping through the year text when unlocked.
    const t = state.clock.elapsedTime;
    const sweep = target > 0.5 ? (t * 0.55) % 1 : 0;
    const textW = 1.25;
    const textH = 0.85;
    const beamW = 0.28;
    const x = THREE.MathUtils.lerp(-textW / 2 - beamW, textW / 2 + beamW, sweep);

    if (yearShimmerTextRef.current) {
      yearShimmerTextRef.current.clipRect = [x - beamW / 2, -textH / 2, x + beamW / 2, textH / 2];
    }

    if (nameplateMatRef.current) {
      // Keep a subtle constant glow in the plate.
      nameplateMatRef.current.emissive = new THREE.Color('#bfe7ff');
      nameplateMatRef.current.emissiveIntensity = unlocked ? 0.08 : 0;
    }
    if (nameplateLightRef.current) {
      // Small moving highlight light to enhance the shimmer.
      nameplateLightRef.current.position.x = unlocked ? x * 0.55 : 0;
      nameplateLightRef.current.intensity = unlocked ? 0.6 : 0;
    }
  });

  return (
    <group ref={gateRootRef} position={[center.x, center.y, center.z]} rotation={[0, yaw, 0]}>
      {/* Ground pad */}
      <mesh position={[0, 0.02, 0.2]} receiveShadow>
        <boxGeometry args={[width + 2.8, 0.04, 3.2]} />
        <meshStandardMaterial map={soilMap ?? undefined} color={soilMap ? '#ffffff' : '#6b4f3a'} roughness={1} />
      </mesh>

      {/* Pillars */}
      {([-1, 1] as const).map((side) => (
        <group key={side} position={[side * (width / 2), 0, 0]}>
          <mesh position={[0, pillarH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[pillarW, pillarH, pillarD]} />
            <meshStandardMaterial
              map={stoneMap ?? undefined}
              color={stoneMap ? '#ffffff' : '#d6d3d1'}
              roughness={0.95}
            />
          </mesh>

          {/* Glassy nameplate (left pillar) */}
          {side === -1 && (
            <group position={[0, 2.35, pillarD / 2 + 0.16]}>
              <mesh castShadow receiveShadow>
                <shapeGeometry args={[nameplateShape]} />
                <meshPhysicalMaterial
                  ref={nameplateMatRef}
                  color="#bfe7ff"
                  transmission={1}
                  thickness={0.25}
                  roughness={0.08}
                  ior={1.45}
                  transparent
                  opacity={0.9}
                  clearcoat={1}
                  clearcoatRoughness={0.06}
                />
              </mesh>
              <pointLight ref={nameplateLightRef} position={[0.0, 0.0, 0.35]} intensity={0} distance={3.5} color="#bfe7ff" />
              <mesh position={[0, 0, -0.01]}>
                <shapeGeometry args={[nameplateShape]} />
                <meshStandardMaterial color="rgba(17,24,39,0.35)" transparent opacity={0.35} />
              </mesh>
              {/* Base text */}
              <Text
                position={[0, 0, 0.01]}
                font={CURSIVE_FONT_URL}
                fontSize={0.26}
                lineHeight={1.15}
                color="#0b1220"
                anchorX="center"
                anchorY="middle"
                textAlign="center"
                maxWidth={1.25}
              >
                {`Year 3\nYear 5\nYear 7\nYear 9`}
              </Text>

              {/* Clickable overlay for only "Year 3" (top line) */}
              <Text
                position={[0, 0.26 * 1.15 * 1.5, 0.055]}
                font={CURSIVE_FONT_URL}
                fontSize={0.26}
                lineHeight={1.15}
                color={year3Hover ? '#2563eb' : '#0b1220'}
                anchorX="center"
                anchorY="middle"
                textAlign="center"
                renderOrder={3}
                outlineWidth={year3Hover ? 0.012 : 0}
                outlineColor="rgba(255,255,255,0.65)"
                onClick={(e) => {
                  e.stopPropagation();
                  onYear3Click?.();
                }}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  setYear3Hover(true);
                  document.body.style.cursor = 'pointer';
                }}
                onPointerOut={(e) => {
                  e.stopPropagation();
                  setYear3Hover(false);
                  document.body.style.cursor = 'auto';
                }}
              >
                Year 3
              </Text>

              {/* Shimmer overlay (clipped moving beam) */}
              <Text
                ref={yearShimmerTextRef}
                position={[0, 0, 0.03]}
                font={CURSIVE_FONT_URL}
                fontSize={0.26}
                lineHeight={1.15}
                anchorX="center"
                anchorY="middle"
                textAlign="center"
                maxWidth={1.25}
                material={shimmerMat as any}
              >
                {`Year 3\nYear 5\nYear 7\nYear 9`}
              </Text>
            </group>
          )}

          {/* Cap */}
          <mesh position={[0, pillarH + 0.22, 0]} castShadow>
            <boxGeometry args={[pillarW * 1.15, 0.44, pillarD * 1.15]} />
            <meshStandardMaterial color="#bfb8b1" roughness={0.9} />
          </mesh>

          {/* Lantern */}
          <mesh position={[0.0, pillarH - 0.55, pillarD / 2 + 0.18]} castShadow>
            <boxGeometry args={[0.22, 0.32, 0.22]} />
            <meshStandardMaterial color="#111827" roughness={0.6} metalness={0.35} />
          </mesh>
          <mesh position={[0.0, pillarH - 0.55, pillarD / 2 + 0.28]}>
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshStandardMaterial emissive="#ffd08a" emissiveIntensity={1.2} color="#1f2937" />
          </mesh>
          <pointLight position={[0, pillarH - 0.55, pillarD / 2 + 0.28]} intensity={0.7} distance={8} color="#ffd08a" />
        </group>
      ))}

      {/* Top beam + small pediment */}
      <mesh position={[0, pillarH + beamH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width + pillarW * 2.2, beamH, beamD]} />
        <meshStandardMaterial
          map={stoneMap ?? undefined}
          color={stoneMap ? '#ffffff' : '#d6d3d1'}
          roughness={0.95}
        />
      </mesh>
      <mesh position={[0, pillarH + beamH + 0.65, 0]} castShadow>
        <boxGeometry args={[width * 0.7, 0.75, beamD * 0.92]} />
        <meshStandardMaterial color="#cfcac4" roughness={0.95} />
      </mesh>

      {/* Sign */}
      <group position={[0, pillarH + beamH + 0.78, beamD / 2 + 0.14]}>
        {/* Emboss shadow/recess */}
        <Text
          position={[0.02, -0.02, -0.03]}
          fontSize={0.6}
          color="rgba(0,0,0,0.55)"
          anchorX="center"
          anchorY="middle"
          renderOrder={1}
        >
          arousha.art
        </Text>

        {/* Highlight/raised */}
        <Text
          position={[0, 0, 0.02]}
          fontSize={0.6}
          color="#111827"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="rgba(255,255,255,0.75)"
          renderOrder={2}
        >
          arousha.art
        </Text>
      </group>

      <group position={[0, pillarH + beamH + 0.42, beamD / 2 + 0.14]}>
        <Text
          position={[0.012, -0.012, -0.03]}
          fontSize={0.22}
          color="rgba(0,0,0,0.55)"
          anchorX="center"
          anchorY="middle"
          renderOrder={1}
        >
          the art of learning
        </Text>

        <Text
          position={[0, 0, 0.02]}
          fontSize={0.22}
          color="#111827"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.015}
          outlineColor="rgba(255,255,255,0.75)"
          renderOrder={2}
        >
          the art of learning
        </Text>
      </group>

      {/* Door frame */}
      <mesh position={[0, openingH, 0.0]} castShadow>
        <boxGeometry args={[width - 0.25, 0.14, 0.38]} />
        <meshStandardMaterial color="#111827" roughness={0.55} metalness={0.25} />
      </mesh>

      {/* Double doors */}
      {([-1, 1] as const).map((side) => (
        <group key={side} position={[side * (doorW / 2), doorH / 2, 0.0]}>
          {/* Hinge pivot at the outer edge of each leaf; rotate everything (door + bars + lock + handle) */}
          <group ref={side === -1 ? leftDoorHingeRef : rightDoorHingeRef} position={[side * (doorW / 2), 0, 0]}>
            <group position={[-side * (doorW / 2), 0, 0]}>
              {/* Door leaf (style similar to reference photo) */}
              <group>
                {/* Base light metal panel */}
                <mesh castShadow receiveShadow>
                  <boxGeometry args={[doorW, doorH, doorD]} />
                  <meshStandardMaterial color="#cfd9e8" roughness={0.45} metalness={0.35} />
                </mesh>

                {/* Front face details */}
                {renderDoorFace(1)}
                {/* Back face details (so opening doesn't look like a different door) */}
                {renderDoorFace(-1)}
              </group>

          {/* Vertical bars */}
          {Array.from({ length: 6 }).map((_, i) => {
            const t = i / 5;
            const x = (t - 0.5) * (doorW * 0.85);
            return (
              <mesh key={i} position={[x, 0.0, doorD / 2 + 0.02]}>
                <cylinderGeometry args={[0.05, 0.05, doorH * 0.95, 10]} />
                <meshStandardMaterial color="#0b1220" roughness={0.5} metalness={0.45} />
              </mesh>
            );
          })}

          {/* Lock (right door) */}
          {side === 1 && (
            <group
              position={[lockX, -doorH * 0.02, doorD / 2 + 0.10]}
              onClick={(e) => {
                e.stopPropagation();
                onLockClick?.();
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={(e) => {
                e.stopPropagation();
                document.body.style.cursor = 'auto';
              }}
            >
              <mesh castShadow receiveShadow>
                <boxGeometry args={[0.28, 0.34, 0.12]} />
                <meshStandardMaterial color="#d1b36a" roughness={0.35} metalness={0.75} />
              </mesh>

              {/* Shackle (animates open when unlocked) */}
              <group ref={lockShackleRef} position={[0, 0.19, 0]}>
                <mesh castShadow>
                  <torusGeometry args={[0.12, 0.02, 12, 28, Math.PI]} />
                  <meshStandardMaterial color="#9ca3af" roughness={0.35} metalness={0.85} />
                </mesh>
                <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                  <torusGeometry args={[0.12, 0.02, 12, 28, Math.PI]} />
                  <meshStandardMaterial color="#9ca3af" roughness={0.35} metalness={0.85} />
                </mesh>
              </group>
            </group>
          )}

          {/* Handle */}
          <mesh position={[side * (doorW * 0.32), 0.0, doorD / 2 + 0.07]} castShadow>
            <boxGeometry args={[0.1, 0.5, 0.08]} />
            <meshStandardMaterial color="#d1b36a" roughness={0.35} metalness={0.7} />
          </mesh>
            </group>
          </group>
        </group>
      ))}
    </group>
  );
}

export function GlassyHome() {
  const { signInWithStudentIdPin, currentUser, userProfile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const groundGrassMap = React.useMemo(() => createGrassTexture(512, 14), []);
  const walkwaySoilMap = React.useMemo(() => createSoilTexture(512, 18), []);

  const [lockLoginOpen, setLockLoginOpen] = React.useState(false);
  const [studentId, setStudentId] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loginError, setLoginError] = React.useState<string | null>(null);
  const [loginBusy, setLoginBusy] = React.useState(false);
  const [gateUnlocked, setGateUnlocked] = React.useState(false);
  const [year3TourRequest, setYear3TourRequest] = React.useState(0);
  const [forceGateOpen, setForceGateOpen] = React.useState(false);
  const [isTourActive, setIsTourActive] = React.useState(false);

  const [practiceOverlayOpen, setPracticeOverlayOpen] = React.useState(false);
  const [practiceOverlaySection, setPracticeOverlaySection] = React.useState<PracticeSectionKey | null>(null);

  const openPracticeOverlay = React.useCallback(
    (key: PracticeSectionKey) => {
      navigate(`/gh/y3/practice?section=${encodeURIComponent(key)}`);
    },
    [navigate]
  );

  React.useEffect(() => {
    const isGhPractice = location.pathname === '/gh/y3/practice';
    if (!isGhPractice) {
      setPracticeOverlayOpen(false);
      return;
    }

    const params = new URLSearchParams(location.search);
    const s = params.get('section') as PracticeSectionKey | null;
    setPracticeOverlaySection(s);
    setPracticeOverlayOpen(true);
  }, [location.pathname, location.search]);

  React.useEffect(() => {
    if (!currentUser) {
      setGateUnlocked(false);
      return;
    }
    if (userProfile?.role === 'student') {
      setGateUnlocked(true);
    }
  }, [currentUser, userProfile?.role]);

  const closeLockLogin = React.useCallback(() => {
    setLockLoginOpen(false);
    setLoginError(null);
    setPassword('');
  }, []);

  React.useEffect(() => {
    if (!lockLoginOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLockLogin();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeLockLogin, lockLoginOpen]);

  const submitLockLogin = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoginError(null);
      setLoginBusy(true);
      try {
        await signInWithStudentIdPin(studentId.trim(), password);
        setGateUnlocked(true);
        closeLockLogin();
      } catch (err: any) {
        setLoginError(err?.message || 'Login failed');
      } finally {
        setLoginBusy(false);
      }
    },
    [closeLockLogin, password, signInWithStudentIdPin, studentId]
  );

  return (
    <div className="fixed inset-0 w-screen h-screen bg-[#cfe8ff] overflow-hidden">
      <PracticeOverlay
        open={practiceOverlayOpen}
        section={practiceOverlaySection}
        onClose={() => {
          setPracticeOverlayOpen(false);
          navigate('/home1');
        }}
      />

      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 2.75, 68], fov: 52, near: 0.1, far: 650 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.setClearColor('#cfe8ff', 1);
        }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <Sky distance={450000} sunPosition={[50, 25, 10]} turbidity={8} rayleigh={2.2} mieCoefficient={0.005} mieDirectionalG={0.78} />

        <OrbitControls
          makeDefault
          enabled={!isTourActive}
          enableDamping
          dampingFactor={0.08}
          target={[0, 1.05, 0]}
          enablePan={false}
          minDistance={2}
          maxDistance={260}
          // Keep a comfortable viewing band without clamping the tour finish.
          minPolarAngle={0.25}
          maxPolarAngle={1.57}
        />

        <CameraTour
          requestId={year3TourRequest}
          lockAfterFinish={false}
          onStarted={() => {
            setIsTourActive(true);
            setForceGateOpen(true);
          }}
          onFinished={() => {
            setIsTourActive(false);
            setForceGateOpen(false);
          }}
        />

        <ambientLight intensity={0.55} />
        <directionalLight
          position={[8, 14, 10]}
          intensity={1.1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <Environment preset="park" />

        {/* Ground plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
          <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
          <meshStandardMaterial
            map={groundGrassMap ?? undefined}
            color={groundGrassMap ? '#ffffff' : '#2f8f3c'}
            roughness={1}
          />
        </mesh>

        {/* Trees scattered all over the ground */}
        <TreeScatter groundSize={GROUND_SIZE} />

        {/* Walkways: connect gate -> all buildings -> outside fence */}
        <Walkways fenceRx={FENCE_RX} fenceRz={FENCE_RZ} gateAngle={Math.PI / 2} soilMap={walkwaySoilMap} />

        {/* The oval field */}
        <OvalField />

        {/* Four schools around it */}
        <SchoolsAroundField onBoardSectionClick={openPracticeOverlay} />

        {/* Fence around the school area */}
        <FenceOval rx={FENCE_RX} rz={FENCE_RZ} postCount={220} y={0} gateAngle={Math.PI / 2} gateWidth={9.5} />
        <BigGate
          rx={FENCE_RX}
          rz={FENCE_RZ}
          angle={Math.PI / 2}
          width={9.5}
          y={0}
          unlocked={gateUnlocked}
          forceOpen={forceGateOpen}
          onYear3Click={() => {
            setForceGateOpen(true);
            setYear3TourRequest((n) => n + 1);
          }}
          onLockClick={async () => {
            if (!gateUnlocked) {
              setLockLoginOpen(true);
              return;
            }

            const ok = window.confirm('Log out now?');
            if (!ok) return;
            await signOut();
            setGateUnlocked(false);
          }}
        />
      </Canvas>

      {lockLoginOpen && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeLockLogin();
          }}
          style={{ background: 'rgba(15, 23, 42, 0.22)' }}
        >
          <form
            onSubmit={submitLockLogin}
            className="relative w-[92%] max-w-md rounded-2xl bg-white/7 backdrop-blur-[22px] shadow-[0_26px_90px_rgba(0,0,0,0.22)] p-6 text-slate-900 overflow-hidden"
          >
            {/* 3D glass edge */}
            <div className="pointer-events-none absolute -inset-2 rounded-[22px] bg-gradient-to-br from-white/30 via-cyan-100/10 to-transparent blur-[2px] opacity-70" />
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-white/55 via-white/14 to-transparent opacity-65" />
            <div className="pointer-events-none absolute inset-0 rounded-2xl border border-white/20" />
            <div className="pointer-events-none absolute inset-[2px] rounded-[14px] border border-white/14" />
            <div className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-18px_30px_rgba(0,0,0,0.18)]" />
            <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-45 bg-[radial-gradient(120%_80%_at_10%_0%,rgba(255,255,255,0.55)_0%,rgba(255,255,255,0)_55%)]" />

            <div className="relative">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold tracking-tight">Student Login</div>
                <div className="text-sm text-slate-900/80">Enter your student ID and password</div>
              </div>
              <button
                type="button"
                onClick={closeLockLogin}
                className="rounded-lg px-2 py-1 text-slate-900/80 hover:text-slate-900 hover:bg-white/20 transition"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <label className="block">
                <div className="text-xs font-medium text-slate-900/80 mb-1">Student ID</div>
                <input
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  autoFocus
                  className="w-full rounded-xl border border-white/22 bg-white/18 px-4 py-3 outline-none placeholder:text-slate-900/40 focus:ring-2 focus:ring-white/35"
                  placeholder="e.g. 10234"
                />
              </label>
              <label className="block">
                <div className="text-xs font-medium text-slate-900/80 mb-1">Password</div>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  className="w-full rounded-xl border border-white/22 bg-white/18 px-4 py-3 outline-none placeholder:text-slate-900/40 focus:ring-2 focus:ring-white/35"
                  placeholder="••••••••"
                />
              </label>
            </div>

            {loginError && <div className="mt-3 text-sm text-red-900/90">{loginError}</div>}

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeLockLogin}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-900/80 hover:bg-white/20 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loginBusy || studentId.trim().length === 0 || password.length === 0}
                className="rounded-xl px-4 py-2 text-sm font-semibold bg-slate-900/80 text-white hover:bg-slate-900 disabled:opacity-50 disabled:hover:bg-slate-900/80 transition"
              >
                {loginBusy ? 'Logging in…' : 'Log in'}
              </button>
            </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
