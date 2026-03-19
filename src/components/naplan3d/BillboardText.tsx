import React from 'react';
import { Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export function BillboardText(props: {
  position: [number, number, number];
  fontSize?: number;
  color?: string;
  anchorX?: 'left' | 'center' | 'right' | number;
  anchorY?: 'top' | 'middle' | 'bottom' | number;
  children: React.ReactNode;
}) {
  const ref = React.useRef<THREE.Object3D | null>(null);
  const { camera } = useThree();

  useFrame(() => {
    if (!ref.current) return;
    ref.current.quaternion.copy(camera.quaternion);
  });

  return (
    <Text
      ref={ref as any}
      position={props.position}
      fontSize={props.fontSize ?? 0.14}
      color={props.color ?? '#e5e7eb'}
      anchorX={props.anchorX ?? 'center'}
      anchorY={props.anchorY ?? 'middle'}
      outlineWidth={0.006}
      outlineColor={'#020617'}
    >
      {props.children}
    </Text>
  );
}
