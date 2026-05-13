"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { CITY_OUTER_RADIUS } from "@/lib/layout";

// Background life: a swarm of small cars circling the city at street level + a
// scatter of slow-moving drone lights above the rooftops. Both are instanced meshes
// for cheap rendering, animated via per-instance state held on the CPU.

const NUM_CARS = 120;
const NUM_DRONES = 60;
const PLAZA_INNER = 280;
const STREET_OUTER = CITY_OUTER_RADIUS - 40;

interface Car {
  radius: number;
  angle: number;
  speed: number; // rad/s
  y: number;
  size: number;
}
interface Drone {
  x: number;
  z: number;
  baseY: number;
  driftPhase: number;
  blinkPhase: number;
  blinkRate: number;
}

const tmpMat = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const upY = new THREE.Vector3(0, 1, 0);

export default function CityLife() {
  const carsRef = useRef<THREE.InstancedMesh>(null);
  const dronesRef = useRef<THREE.InstancedMesh>(null);

  const cars: Car[] = useMemo(() => {
    const out: Car[] = [];
    for (let i = 0; i < NUM_CARS; i++) {
      const r = PLAZA_INNER + Math.random() * (STREET_OUTER - PLAZA_INNER);
      out.push({
        radius: r,
        angle: Math.random() * Math.PI * 2,
        // Speed inversely proportional to radius — outer rings rotate slower.
        speed: ((Math.random() < 0.5 ? 1 : -1) * (0.04 + Math.random() * 0.05)) / Math.sqrt(r / 400),
        y: 4,
        size: 6 + Math.random() * 4,
      });
    }
    return out;
  }, []);

  const drones: Drone[] = useMemo(() => {
    const out: Drone[] = [];
    for (let i = 0; i < NUM_DRONES; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = PLAZA_INNER + Math.random() * (STREET_OUTER - PLAZA_INNER);
      out.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        baseY: 240 + Math.random() * 320,
        driftPhase: Math.random() * Math.PI * 2,
        blinkPhase: Math.random() * Math.PI * 2,
        blinkRate: 1.5 + Math.random() * 2.5,
      });
    }
    return out;
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const carsMesh = carsRef.current;
    if (carsMesh) {
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        c.angle += c.speed * 0.016;
        const x = Math.cos(c.angle) * c.radius;
        const z = Math.sin(c.angle) * c.radius;
        // Car points along the tangent of its orbit.
        const heading = c.angle + (c.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
        tmpQ.setFromAxisAngle(upY, heading);
        tmpScale.set(c.size, 3, c.size * 0.6);
        tmpMat.compose(new THREE.Vector3(x, c.y, z), tmpQ, tmpScale);
        carsMesh.setMatrixAt(i, tmpMat);
      }
      carsMesh.instanceMatrix.needsUpdate = true;
    }

    const dronesMesh = dronesRef.current;
    if (dronesMesh) {
      for (let i = 0; i < drones.length; i++) {
        const d = drones[i];
        const y = d.baseY + Math.sin(t * 0.4 + d.driftPhase) * 30;
        const blink = 0.4 + 0.6 * Math.max(0, Math.sin(t * d.blinkRate + d.blinkPhase));
        tmpQ.identity();
        tmpScale.setScalar(2.4 * blink);
        tmpMat.compose(new THREE.Vector3(d.x, y, d.z), tmpQ, tmpScale);
        dronesMesh.setMatrixAt(i, tmpMat);
      }
      dronesMesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* Cars — tiny brand-off cubes scuttling along orbits. */}
      <instancedMesh ref={carsRef} args={[undefined, undefined, NUM_CARS]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#e3e5e4" />
      </instancedMesh>
      {/* Drones — bright sparkles floating above the rooftops. */}
      <instancedMesh ref={dronesRef} args={[undefined, undefined, NUM_DRONES]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#e3e5e4" />
      </instancedMesh>
    </group>
  );
}
