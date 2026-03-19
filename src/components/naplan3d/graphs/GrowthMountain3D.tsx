import React from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import type { NaplanAttempt } from '../types';
import { naplanSpectrumColor } from '../../../constants/naplanBandColors';
import { BillboardText } from '../BillboardText';

type DomainRow = { domain: string; points: NaplanAttempt[] };

function uniqSorted<T>(items: T[], key: (x: T) => number): number[] {
  const set = new Set<number>();
  for (const item of items) set.add(key(item));
  return Array.from(set).sort((a, b) => a - b);
}

function formatShortDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function GrowthMountain3D(props: {
  attempts: NaplanAttempt[];
  scoreRange?: { min: number; max: number };
}) {
  const scoreMin = props.scoreRange?.min ?? 300;
  const scoreMax = props.scoreRange?.max ?? 700;

  const prepared = React.useMemo(() => {
    const attempts = props.attempts
      .filter((a) => Number.isFinite(a.score) && a.dateMs)
      .slice()
      .sort((a, b) => a.dateMs - b.dateMs);

    const domains = Array.from(new Set(attempts.map((a) => a.domain))).sort((a, b) => a.localeCompare(b));
    const datesMs = uniqSorted(attempts, (a) => a.dateMs);

    const rows: DomainRow[] = domains.map((d) => ({
      domain: d,
      points: attempts.filter((a) => a.domain === d),
    }));

    return { attempts, domains, datesMs, rows };
  }, [props.attempts]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div>
          <div className="font-semibold">Growth Mountain</div>
          <div className="text-xs text-slate-300">X: test date · Y: domain · Z: scaled score</div>
        </div>
        <div className="text-xs text-slate-300">Drag to rotate · Scroll to zoom</div>
      </div>

      <div className="h-[520px]">
        <Canvas
          camera={{ position: [3.2, 2.6, 4.2], fov: 55, near: 0.1, far: 200 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        >
          <color attach="background" args={['#020617']} />
          <ambientLight intensity={0.55} />
          <directionalLight position={[6, 10, 6]} intensity={1.0} />

          <OrbitControls enableDamping dampingFactor={0.08} rotateSpeed={0.75} />

          <GrowthMountainScene
            attempts={prepared.attempts}
            domains={prepared.domains}
            datesMs={prepared.datesMs}
            scoreMin={scoreMin}
            scoreMax={scoreMax}
          />
        </Canvas>
      </div>
    </div>
  );
}

function GrowthMountainScene(props: {
  attempts: NaplanAttempt[];
  domains: string[];
  datesMs: number[];
  scoreMin: number;
  scoreMax: number;
}) {
  const stepX = 0.5;
  const stepY = 0.6;
  const height = 2.6;

  const nx = Math.max(2, Math.min(32, props.datesMs.length));
  const ny = Math.max(1, Math.min(10, props.domains.length));

  const sampledDates = React.useMemo(() => {
    if (props.datesMs.length <= nx) return props.datesMs;
    const out: number[] = [];
    for (let i = 0; i < nx; i++) {
      const t = i / (nx - 1);
      out.push(props.datesMs[Math.round(t * (props.datesMs.length - 1))]);
    }
    return out;
  }, [props.datesMs, nx]);

  const sampledDomains = React.useMemo(() => props.domains.slice(0, ny), [props.domains, ny]);

  // Ensure the surface always has at least 2 samples along each axis.
  // Without this, a narrow filter (e.g., one day) can create a degenerate plane.
  const effectiveDates = React.useMemo(() => {
    if (sampledDates.length >= 2) return sampledDates;
    const ms = sampledDates[0] ?? Date.now();
    return [ms, ms + 24 * 60 * 60 * 1000];
  }, [sampledDates]);

  const effectiveDomains = React.useMemo(() => {
    if (sampledDomains.length >= 2) return sampledDomains;
    const d = sampledDomains[0] ?? 'Domain';
    return [d, d];
  }, [sampledDomains]);

  const grid = React.useMemo(() => {
    const map = new Map<string, NaplanAttempt[]>();
    for (const a of props.attempts) {
      const k = a.domain;
      const arr = map.get(k) ?? [];
      arr.push(a);
      map.set(k, arr);
    }
    map.forEach((arr, k) => {
      arr.sort((a: NaplanAttempt, b: NaplanAttempt) => a.dateMs - b.dateMs);
      map.set(k, arr);
    });

    const scoreAt = (domain: string, dateMs: number): number | null => {
      const arr = map.get(domain);
      if (!arr || arr.length === 0) return null;
      // pick closest in time (cheap and stable)
      let best = arr[0];
      let bestD = Math.abs(arr[0].dateMs - dateMs);
      for (let i = 1; i < arr.length; i++) {
        const d = Math.abs(arr[i].dateMs - dateMs);
        if (d < bestD) {
          best = arr[i];
          bestD = d;
        }
      }
      return best.score;
    };

    const values: number[] = [];
    for (let y = 0; y < effectiveDomains.length; y++) {
      for (let x = 0; x < effectiveDates.length; x++) {
        const s = scoreAt(effectiveDomains[y], effectiveDates[x]);
        values.push(s ?? props.scoreMin);
      }
    }

    return { values };
  }, [effectiveDates, effectiveDomains, props.attempts, props.scoreMin]);

  const surface = React.useMemo(() => {
    const width = (effectiveDates.length - 1) * stepX;
    const heightY = Math.max(0.001, (effectiveDomains.length - 1) * stepY);

    const geom = new THREE.PlaneGeometry(
      width || stepX,
      heightY,
      Math.max(1, effectiveDates.length - 1),
      Math.max(1, effectiveDomains.length - 1)
    );

    const pos = geom.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);

    const scoreToZ = (score: number) => {
      const t = (score - props.scoreMin) / Math.max(1e-6, props.scoreMax - props.scoreMin);
      return Math.max(0, Math.min(1, t)) * height;
    };

    const scoreToColor = (score: number) => {
      const t = (score - props.scoreMin) / Math.max(1e-6, props.scoreMax - props.scoreMin);
      return new THREE.Color(naplanSpectrumColor(t));
    };

    for (let i = 0; i < pos.count; i++) {
      // PlaneGeometry is row-major: x changes fastest.
      const x = i % effectiveDates.length;
      const y = Math.floor(i / effectiveDates.length);
      const score = grid.values[y * effectiveDates.length + x] ?? props.scoreMin;

      pos.setZ(i, scoreToZ(score));
      const c = scoreToColor(score);
      colors[i * 3 + 0] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.computeVertexNormals();

    const edges = new THREE.EdgesGeometry(geom, 18);

    return { geom, edges };
  }, [effectiveDates.length, effectiveDomains.length, grid.values, props.scoreMax, props.scoreMin]);

  React.useEffect(() => {
    return () => {
      surface.edges.dispose();
      surface.geom.dispose();
    };
  }, [surface]);

  const axisLenX = (effectiveDates.length - 1) * stepX;
  const axisLenY = Math.max(0.001, (effectiveDomains.length - 1) * stepY);
  const planeCenterX = axisLenX / 2;
  const planeCenterY = axisLenY / 2;

  const labelLastByDomain = React.useMemo(() => {
    const out: Array<{ domain: string; a: NaplanAttempt } | null> = [];
    for (const domain of sampledDomains) {
      const attempts = props.attempts.filter((a) => a.domain === domain).slice().sort((a, b) => a.dateMs - b.dateMs);
      out.push(attempts.length ? { domain, a: attempts[attempts.length - 1] } : null);
    }
    return out;
  }, [props.attempts, sampledDomains]);

  return (
    <group position={[-planeCenterX, -planeCenterY, 0]}>
      {/* Axes */}
      <Line points={[[0, 0, 0], [axisLenX, 0, 0]]} color={'#334155'} transparent opacity={0.9} />
      <Line points={[[0, 0, 0], [0, axisLenY, 0]]} color={'#334155'} transparent opacity={0.9} />
      <Line points={[[0, 0, 0], [0, 0, 2.8]]} color={'#334155'} transparent opacity={0.9} />

      {/* Surface */}
      <mesh geometry={surface.geom}>
        <meshStandardMaterial
          vertexColors
          roughness={0.55}
          metalness={0.05}
          transparent
          opacity={0.92}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Topographical edges */}
      <lineSegments geometry={surface.edges}>
        <lineBasicMaterial color={'#0f172a'} transparent opacity={0.55} />
      </lineSegments>

      {/* Domain labels (billboard) */}
      {sampledDomains.map((d, i) => (
        <BillboardText key={d} position={[-0.25, i * stepY, 0.08]} fontSize={0.14} anchorX={'right'}>
          {d}
        </BillboardText>
      ))}

      {/* Date labels (billboard, sparse) */}
      {sampledDates.map((ms, i) => {
        const show = i === 0 || i === sampledDates.length - 1 || i % 4 === 0;
        if (!show) return null;
        return (
          <BillboardText key={ms} position={[i * stepX, -0.32, 0.08]} fontSize={0.12} anchorY={'top'}>
            {formatShortDate(ms)}
          </BillboardText>
        );
      })}

      {/* Last score per domain */}
      {labelLastByDomain.map((item, i) => {
        if (!item) return null;
        const score = Math.round(item.a.score);
        return (
          <BillboardText
            key={item.domain}
            position={[axisLenX + 0.15, i * stepY, Math.min(2.6, 0.2 + (score - props.scoreMin) / Math.max(1e-6, props.scoreMax - props.scoreMin) * 2.6)]}
            fontSize={0.12}
            anchorX={'left'}
          >
            {score}
          </BillboardText>
        );
      })}

      {/* Ground grid */}
      <gridHelper args={[12, 24, '#0b1220', '#0b1220']} position={[axisLenX / 2, axisLenY / 2, -0.02]} rotation={[0, 0, 0]} />
    </group>
  );
}
