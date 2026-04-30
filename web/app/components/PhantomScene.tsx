"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial, RoundedBox, Stars } from "@react-three/drei";
import { useRef, Suspense, useMemo } from "react";
import type { Group, Mesh } from "three";
import * as THREE from "three";

// A floating "pane" — a rounded glass-morphism slab with a colored emissive face.
const Pane = ({
  position,
  rotation,
  size,
  color,
  speed = 1,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number, number];
  color: string;
  speed?: number;
}) => {
  const ref = useRef<Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime * speed;
    ref.current.position.y = position[1] + Math.sin(t) * 0.08;
    ref.current.rotation.x = rotation[0] + Math.sin(t * 0.6) * 0.05;
    ref.current.rotation.y = rotation[1] + Math.cos(t * 0.4) * 0.05;
  });

  return (
    <RoundedBox
      ref={ref}
      args={size}
      radius={0.05}
      smoothness={4}
      position={position}
      rotation={rotation}
    >
      <meshPhysicalMaterial
        color={color}
        roughness={0.15}
        metalness={0.4}
        transmission={0.45}
        thickness={0.4}
        ior={1.4}
        clearcoat={1}
        clearcoatRoughness={0.1}
        emissive={color}
        emissiveIntensity={0.15}
      />
    </RoundedBox>
  );
};

// Orbiting "tab" — small accent shapes drifting around the central pane.
const OrbitingShape = ({
  radius,
  speed,
  yOffset,
  size,
  color,
  phase = 0,
}: {
  radius: number;
  speed: number;
  yOffset: number;
  size: number;
  color: string;
  phase?: number;
}) => {
  const ref = useRef<Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime * speed + phase;
    ref.current.position.x = Math.cos(t) * radius;
    ref.current.position.z = Math.sin(t) * radius;
    ref.current.position.y = yOffset + Math.sin(t * 1.3) * 0.2;
    ref.current.rotation.x = t * 0.5;
    ref.current.rotation.y = t * 0.3;
  });

  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[size, 1]} />
      <MeshDistortMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.6}
        roughness={0.2}
        metalness={0.6}
        distort={0.25}
        speed={2}
      />
    </mesh>
  );
};

// Particle field — soft floating dots evoking ambient code/data.
const ParticleField = ({ count = 200 }: { count?: number }) => {
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 12;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 8;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 8 - 2;
    }
    return arr;
  }, [count]);

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = state.clock.elapsedTime * 0.02;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.025}
        color="#88bfff"
        transparent
        opacity={0.55}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
};

// The central "Phantom" — main pane with subtle group-level breathing.
const PhantomCore = () => {
  const group = useRef<Group>(null);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.y = Math.sin(t * 0.2) * 0.15;
    group.current.rotation.x = Math.cos(t * 0.15) * 0.08;
  });

  return (
    <group ref={group}>
      {/* Main central pane (the unified workspace) */}
      <Float speed={1.2} rotationIntensity={0.2} floatIntensity={0.4}>
        <Pane
          position={[0, 0, 0]}
          rotation={[0, 0, 0]}
          size={[3.4, 2.1, 0.12]}
          color="#1a2a44"
          speed={0.6}
        />
        {/* Title bar accent */}
        <mesh position={[-1.4, 0.85, 0.07]}>
          <circleGeometry args={[0.06, 24]} />
          <meshBasicMaterial color="#ff5f57" />
        </mesh>
        <mesh position={[-1.22, 0.85, 0.07]}>
          <circleGeometry args={[0.06, 24]} />
          <meshBasicMaterial color="#febc2e" />
        </mesh>
        <mesh position={[-1.04, 0.85, 0.07]}>
          <circleGeometry args={[0.06, 24]} />
          <meshBasicMaterial color="#28c840" />
        </mesh>
        {/* Code-line stripes inside pane */}
        {[0.4, 0.15, -0.1, -0.35, -0.6].map((y, i) => (
          <mesh key={y} position={[-0.3 - (i % 2) * 0.4, y, 0.07]}>
            <planeGeometry args={[1.6 - (i % 3) * 0.4, 0.06]} />
            <meshBasicMaterial color={i === 1 ? "#7dd3fc" : i === 3 ? "#c4b5fd" : "#3a4a64"} transparent opacity={0.85} />
          </mesh>
        ))}
      </Float>

      {/* Background secondary pane — depth */}
      <Float speed={0.8} rotationIntensity={0.3} floatIntensity={0.3}>
        <Pane
          position={[1.3, -0.4, -1.2]}
          rotation={[0.1, -0.3, 0.05]}
          size={[2.0, 1.3, 0.08]}
          color="#2a1a44"
          speed={0.4}
        />
      </Float>

      {/* Background tertiary pane */}
      <Float speed={0.9} rotationIntensity={0.25} floatIntensity={0.35}>
        <Pane
          position={[-1.6, 0.5, -1.5]}
          rotation={[-0.1, 0.4, -0.05]}
          size={[1.7, 1.1, 0.08]}
          color="#1a3a3a"
          speed={0.5}
        />
      </Float>

      {/* Orbiting tabs — represent terminal / editor / ai chat / git diff */}
      <OrbitingShape radius={3.2} speed={0.35} yOffset={1.1} size={0.18} color="#7dd3fc" phase={0} />
      <OrbitingShape radius={3.0} speed={0.28} yOffset={-0.8} size={0.15} color="#c4b5fd" phase={1.5} />
      <OrbitingShape radius={2.8} speed={0.4} yOffset={0.3} size={0.13} color="#f9a8d4" phase={3} />
      <OrbitingShape radius={3.4} speed={0.32} yOffset={-1.0} size={0.16} color="#86efac" phase={4.5} />
    </group>
  );
};

const PhantomScene = ({ low = false }: { low?: boolean }) => {
  return (
    <Canvas
      camera={{ position: [0, 0, 6.5], fov: 45 }}
      dpr={low ? [1, 1.5] : [1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ background: "transparent" }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} color="#88bfff" />
        <directionalLight position={[-5, -3, 2]} intensity={0.4} color="#c4b5fd" />
        <pointLight position={[0, 0, 3]} intensity={0.6} color="#7dd3fc" />

        {!low && <Stars radius={50} depth={30} count={1500} factor={3} fade speed={0.5} />}
        <ParticleField count={low ? 80 : 220} />
        <PhantomCore />
      </Suspense>
    </Canvas>
  );
};

export default PhantomScene;
