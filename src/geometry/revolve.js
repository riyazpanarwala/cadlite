import * as THREE from 'three';
import { Part } from '../assembly/Part.js';

const DEFAULT_COLOR = '#4fa1d8';

/**
 * Revolves a completed SketchSession around an axis into a 3D solid Part.
 * @param {SketchSession} sketchSession
 * @param {Object} options - { angle: 360, segments: 36, axis: 'Y', name: 'Revolve 1', color: string }
 */
export function revolveSketch(sketchSession, options = {}) {
  const angleDeg = typeof options === 'number' ? options : (options.angle || 360);
  const segments = options.segments || 36;
  const axis = options.axis || 'Y';
  const name = options.name || 'Revolve 1';
  const color = options.color || DEFAULT_COLOR;

  const matrix = sketchSession.sketchPlane ? sketchSession.sketchPlane.getMatrix() : new THREE.Matrix4();
  const rawPoints2D = sketchSession.toPoints2D();

  const params = {
    points2D: rawPoints2D,
    planeName: sketchSession.sketchPlane ? sketchSession.sketchPlane.name : 'XY Plane',
    planeMatrix: matrix.toArray(),
    angle: angleDeg,
    segments,
    axis
  };

  const geometry = buildRevolveGeometry(params);
  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.2,
    roughness: 0.5,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Orient to work plane
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(matrix);
  mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
  mesh.matrixAutoUpdate = true;

  const part = new Part({ name, type: 'part', mesh, kind: 'revolve', color, params });
  return part;
}

/**
 * Builds revolve geometry using Three.js Lathe or custom rotational mesh generator.
 */
export function buildRevolveGeometry(params) {
  const { points2D, angle = 360, segments = 36 } = params;
  if (!points2D || points2D.length < 2) {
    return new THREE.BufferGeometry();
  }

  const phiLength = (angle * Math.PI) / 180;

  // Determine bounds of u to ensure radius >= 0
  const uValues = points2D.map(p => p[0]);
  const minU = Math.min(...uValues);
  const offsetU = minU < 0 ? -minU : 0;

  // Convert points to Vector2: (radius, height)
  // Ensure profile loop is traversed in order
  const lathePoints = points2D.map(([u, v]) => new THREE.Vector2(Math.max(0.01, u + offsetU), v));

  // If closed profile, ensure last point connects to first
  if (lathePoints.length > 2) {
    const first = lathePoints[0];
    const last = lathePoints[lathePoints.length - 1];
    if (first.distanceTo(last) > 1e-4) {
      lathePoints.push(first.clone());
    }
  }

  const geometry = new THREE.LatheGeometry(lathePoints, segments, 0, phiLength);
  geometry.computeVertexNormals();

  return geometry;
}

export function rebuildRevolveGeometry(part) {
  if (!part.object3D || !part.params) return;
  part.object3D.geometry.dispose();
  part.object3D.geometry = buildRevolveGeometry(part.params);
}
