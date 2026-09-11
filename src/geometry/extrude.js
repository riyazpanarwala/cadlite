import * as THREE from 'three';
import { Part } from '../assembly/Part.js';

const DEFAULT_COLOR = '#8da4c4';

/**
 * Extrudes a completed SketchSession into a solid Part.
 * Supports depth, symmetric/flip directions, and arbitrary work plane orientations.
 */
export function extrudeSketch(sketchSession, options = 20) {
  const depth = typeof options === 'number' ? options : (options.depth || 20);
  const direction = typeof options === 'object' ? (options.direction || 'normal') : 'normal';
  const name = typeof options === 'object' && options.name ? options.name : 'Extrusion 1';
  const color = typeof options === 'object' && options.color ? options.color : DEFAULT_COLOR;

  const matrix = sketchSession.sketchPlane ? sketchSession.sketchPlane.getMatrix() : new THREE.Matrix4();

  const params = {
    points2D: sketchSession.toPoints2D(),
    planeName: sketchSession.sketchPlane ? sketchSession.sketchPlane.name : 'XY Plane',
    planeMatrix: matrix.toArray(),
    depth,
    direction
  };

  const geometry = buildExtrudeGeometry(params);
  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.2,
    roughness: 0.5
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Apply work plane orientation
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(matrix);
  mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
  mesh.matrixAutoUpdate = true;

  const part = new Part({ name, type: 'part', mesh, kind: 'extrude', color, params });
  return part;
}

/** Rebuilds extrude geometry from stored 2D points + depth + direction */
export function buildExtrudeGeometry(params) {
  const shape = new THREE.Shape();
  params.points2D.forEach(([x, y], i) => {
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: params.depth,
    bevelEnabled: false,
    steps: 1
  });

  // Handle extrusion direction
  if (params.direction === 'symmetric') {
    geometry.translate(0, 0, -params.depth / 2);
  } else if (params.direction === 'flip') {
    geometry.translate(0, 0, -params.depth);
  }

  return geometry;
}

export function rebuildExtrudeGeometry(part) {
  part.object3D.geometry.dispose();
  part.object3D.geometry = buildExtrudeGeometry(part.params);
}

