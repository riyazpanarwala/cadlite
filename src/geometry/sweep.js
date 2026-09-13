import * as THREE from 'three';
import { Part } from '../assembly/Part.js';

const DEFAULT_COLOR = '#38bdf8';

/**
 * Builds preview Three.js geometry for a sweep feature along a 3D curve.
 */
export function buildSweepGeometry(params) {
  const { profilePoints2D, pathPoints3D, radius = 8 } = params;

  if (!pathPoints3D || pathPoints3D.length < 2) {
    return new THREE.BoxGeometry(10, 10, 10);
  }

  const vPoints = pathPoints3D.map((p) => new THREE.Vector3(...p));
  const curve = new THREE.CatmullRomCurve3(vPoints, false, 'catmullrom', 0.1);

  if (profilePoints2D && profilePoints2D.length >= 3) {
    const shape = new THREE.Shape();
    profilePoints2D.forEach(([u, v], i) => {
      if (i === 0) shape.moveTo(u, v);
      else shape.lineTo(u, v);
    });
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, {
      extrudePath: curve,
      steps: 48,
      bevelEnabled: false
    });
  }

  // Circular tube fallback
  return new THREE.TubeGeometry(curve, 48, radius, 16, false);
}

/**
 * Preset 3D sweep path generators
 */
export const SWEEP_PRESETS = {
  elbow: {
    name: '90° Elbow Pipe',
    path: [
      [0, 0, 0],
      [0, 0, 35],
      [5, 0, 48],
      [15, 0, 58],
      [35, 0, 60],
      [70, 0, 60]
    ]
  },
  sCurve: {
    name: 'S-Curve Conduit',
    path: [
      [0, 0, 0],
      [0, 0, 25],
      [15, 0, 45],
      [30, 0, 65],
      [45, 0, 85],
      [45, 0, 110]
    ]
  },
  uBend: {
    name: '180° U-Bend Loop',
    path: [
      [0, 0, 0],
      [0, 0, 40],
      [10, 0, 60],
      [30, 0, 70],
      [50, 0, 60],
      [60, 0, 40],
      [60, 0, 0]
    ]
  }
};

/**
 * Factory for creating a swept Part.
 */
export function createSweepPart(options = {}) {
  const name = options.name || 'Sweep 1';
  const color = options.color || DEFAULT_COLOR;
  const radius = options.radius || 8;
  const pathPoints3D = options.pathPoints3D || SWEEP_PRESETS.elbow.path;
  const profilePoints2D = options.profilePoints2D || null;

  const params = {
    profilePoints2D,
    pathPoints3D,
    radius
  };

  const geometry = buildSweepGeometry(params);
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
    kind: 'sweep',
    color,
    params,
    topology: { faces: [], edges: [], faceRanges: [] }
  });

  return part;
}
