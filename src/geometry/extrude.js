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

  const topology = buildExtrudeTopology(params);
  params.topology = topology;

  const part = new Part({ name, type: 'part', mesh, kind: 'extrude', color, params, topology });
  return part;
}

export function buildExtrudeTopology(params) {
  const pts = params.points2D || [];
  const depth = params.depth || 20;
  const n = pts.length;
  if (n < 3) return { faces: [], edges: [], faceRanges: [] };

  const z0 = params.direction === 'symmetric' ? -depth / 2 : (params.direction === 'flip' ? -depth : 0);
  const z1 = z0 + depth;

  const faces = [
    { topoId: 'Face_start_cap', surfaceType: 'plane', normal: [0, 0, -1], centroid: [0, 0, z0], area: 0, startTriangle: 0, triangleCount: n - 2 },
    { topoId: 'Face_end_cap', surfaceType: 'plane', normal: [0, 0, 1], centroid: [0, 0, z1], area: 0, startTriangle: n - 2, triangleCount: n - 2 }
  ];

  const edges = [];

  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const p1 = pts[i];
    const p2 = pts[next];

    // Side face i
    const midX = (p1[0] + p2[0]) / 2;
    const midY = (p1[1] + p2[1]) / 2;
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.hypot(dx, dy);
    const nx = dy / len;
    const ny = -dx / len;

    faces.push({
      topoId: `Face_side_${i}`,
      surfaceType: 'plane',
      normal: [nx, ny, 0],
      centroid: [midX, midY, (z0 + z1) / 2],
      area: len * depth,
      startTriangle: 2 * (n - 2) + i * 2,
      triangleCount: 2
    });

    // Start cap edge
    edges.push({
      topoId: `Edge_Face_start_cap__Face_side_${i}`,
      curveType: 'line',
      length: len,
      adjacentFaceIds: ['Face_start_cap', `Face_side_${i}`],
      polyline: [[p1[0], p1[1], z0], [p2[0], p2[1], z0]]
    });

    // End cap edge
    edges.push({
      topoId: `Edge_Face_end_cap__Face_side_${i}`,
      curveType: 'line',
      length: len,
      adjacentFaceIds: ['Face_end_cap', `Face_side_${i}`],
      polyline: [[p1[0], p1[1], z1], [p2[0], p2[1], z1]]
    });

    // Lateral vertical edge
    const prev = (i - 1 + n) % n;
    edges.push({
      topoId: `Edge_Face_side_${prev}__Face_side_${i}`,
      curveType: 'line',
      length: depth,
      adjacentFaceIds: [`Face_side_${prev}`, `Face_side_${i}`],
      polyline: [[p1[0], p1[1], z0], [p1[0], p1[1], z1]]
    });
  }

  const faceRanges = faces.map((f) => ({
    ...f,
    faceId: f.topoId,
    startIndex: f.startTriangle * 3,
    indexCount: f.triangleCount * 3
  }));

  return { faces, edges, faceRanges };
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
  const topology = buildExtrudeTopology(part.params);
  part.setTopology(topology);
}

