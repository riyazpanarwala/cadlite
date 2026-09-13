import * as THREE from 'three';
import { Part } from '../assembly/Part.js';

const DEFAULT_COLOR = '#a855f7';

function samplePolygon(pts, targetCount = 32) {
  if (!pts || pts.length === 0) return [];
  const result = [];
  const n = pts.length;
  for (let i = 0; i < targetCount; i++) {
    const t = (i / targetCount) * n;
    const idx = Math.floor(t) % n;
    const nextIdx = (idx + 1) % n;
    const frac = t - Math.floor(t);
    const pA = pts[idx];
    const pB = pts[nextIdx];
    result.push([
      pA[0] + (pB[0] - pA[0]) * frac,
      pA[1] + (pB[1] - pA[1]) * frac
    ]);
  }
  return result;
}

function makeCirclePoints(r, count = 32) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

function makeRectPoints(w, h, count = 32) {
  const hw = w / 2;
  const hh = h / 2;
  const corners = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh]
  ];
  return samplePolygon(corners, count);
}

/**
 * Builds preview Three.js skinned mesh for a multi-section loft.
 */
export function buildLoftGeometry(params) {
  const { sections = [] } = params;
  if (sections.length < 2) return new THREE.BoxGeometry(10, 10, 10);

  const numSamplePoints = 32;
  const sampledSections = sections.map((sec) => {
    let pts2D = sec.points2D;
    if (!pts2D && sec.points3D) {
      return sec.points3D.map((p) => new THREE.Vector3(...p));
    }
    const sampled = samplePolygon(pts2D, numSamplePoints);
    const z = sec.z || 0;
    return sampled.map(([u, v]) => new THREE.Vector3(u, v, z));
  });

  const positions = [];
  const indices = [];

  // 1. Loft side quad strips between adjacent section rings
  for (let s = 0; s < sampledSections.length - 1; s++) {
    const ringA = sampledSections[s];
    const ringB = sampledSections[s + 1];
    const baseA = positions.length / 3;

    for (let i = 0; i < numSamplePoints; i++) {
      positions.push(ringA[i].x, ringA[i].y, ringA[i].z);
    }
    const baseB = positions.length / 3;
    for (let i = 0; i < numSamplePoints; i++) {
      positions.push(ringB[i].x, ringB[i].y, ringB[i].z);
    }

    for (let i = 0; i < numSamplePoints; i++) {
      const next = (i + 1) % numSamplePoints;
      const a1 = baseA + i;
      const a2 = baseA + next;
      const b1 = baseB + i;
      const b2 = baseB + next;

      indices.push(a1, b1, a2);
      indices.push(b1, b2, a2);
    }
  }

  // 2. Cap bottom and top
  const bottomRing = sampledSections[0];
  const topRing = sampledSections[sampledSections.length - 1];

  // Bottom cap
  const botCenterIdx = positions.length / 3;
  let botCenter = new THREE.Vector3();
  bottomRing.forEach((p) => botCenter.add(p));
  botCenter.divideScalar(numSamplePoints);
  positions.push(botCenter.x, botCenter.y, botCenter.z);
  const botBase = positions.length / 3;
  bottomRing.forEach((p) => positions.push(p.x, p.y, p.z));
  for (let i = 0; i < numSamplePoints; i++) {
    const next = (i + 1) % numSamplePoints;
    indices.push(botCenterIdx, botBase + next, botBase + i);
  }

  // Top cap
  const topCenterIdx = positions.length / 3;
  let topCenter = new THREE.Vector3();
  topRing.forEach((p) => topCenter.add(p));
  topCenter.divideScalar(numSamplePoints);
  positions.push(topCenter.x, topCenter.y, topCenter.z);
  const topBase = positions.length / 3;
  topRing.forEach((p) => positions.push(p.x, p.y, p.z));
  for (let i = 0; i < numSamplePoints; i++) {
    const next = (i + 1) % numSamplePoints;
    indices.push(topCenterIdx, topBase + i, topBase + next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Standard Loft design presets
 */
export const LOFT_PRESETS = {
  circleToSquare: {
    name: 'Circular-to-Square Duct Transition',
    sections: [
      { points2D: makeCirclePoints(24, 32), z: 0 },
      { points2D: makeRectPoints(36, 36, 32), z: 60 }
    ]
  },
  rocketNozzle: {
    name: 'De Laval Rocket Nozzle (3 Sections)',
    sections: [
      { points2D: makeCirclePoints(28, 32), z: 0 },
      { points2D: makeCirclePoints(12, 32), z: 35 },
      { points2D: makeCirclePoints(22, 32), z: 75 }
    ]
  },
  taperedChamber: {
    name: 'Tapered Rectangular Funnel',
    sections: [
      { points2D: makeRectPoints(60, 40, 32), z: 0 },
      { points2D: makeRectPoints(24, 16, 32), z: 50 }
    ]
  }
};

/**
 * Factory for creating a lofted Part.
 */
export function createLoftPart(options = {}) {
  const name = options.name || 'Loft 1';
  const color = options.color || DEFAULT_COLOR;
  const sections = options.sections || LOFT_PRESETS.circleToSquare.sections;
  const ruled = options.ruled || false;

  const params = {
    sections,
    ruled
  };

  const geometry = buildLoftGeometry(params);
  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.25,
    roughness: 0.45
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const part = new Part({
    name,
    type: 'part',
    mesh,
    kind: 'loft',
    color,
    params,
    topology: { faces: [], edges: [], faceRanges: [] }
  });

  return part;
}
