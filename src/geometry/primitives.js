import * as THREE from 'three';
import { Part } from '../assembly/Part.js';

const DEFAULT_COLORS = ['#4fb0ff', '#ffb454', '#8fff9e', '#ff8f8f', '#c9a7ff', '#7de3ff'];
let colorCursor = 0;
function nextColor() {
  const c = DEFAULT_COLORS[colorCursor % DEFAULT_COLORS.length];
  colorCursor++;
  return c;
}

function makeMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.15,
    roughness: 0.55
  });
}

export const DEFAULT_PARAMS = {
  box: { width: 50, height: 50, depth: 50 },
  cylinder: { radius: 25, height: 60, segments: 32 },
  sphere: { radius: 30, segments: 32 },
  cone: { radius: 25, height: 60, segments: 32 }
};

/** Pure geometry builder shared by create / rebuild / load-from-file. */
export function geometryForPrimitive(kind, params) {
  const p = params;
  switch (kind) {
    case 'box':
      return new THREE.BoxGeometry(p.width, p.height, p.depth);
    case 'cylinder':
      return new THREE.CylinderGeometry(p.radius, p.radius, p.height, p.segments || 32);
    case 'sphere':
      return new THREE.SphereGeometry(p.radius, p.segments || 32, (p.segments || 32) / 2);
    case 'cone':
      return new THREE.ConeGeometry(p.radius, p.height, p.segments || 32);
    default:
      throw new Error(`Unknown primitive kind: ${kind}`);
  }
}

/** Generates canonical topological metadata and edge representations for primitive shapes. */
export function buildPrimitiveTopology(kind, params) {
  if (kind === 'box') {
    const w = params.width || 50;
    const h = params.height || 50;
    const d = params.depth || 50;
    const hw = w / 2, hh = h / 2, hd = d / 2;

    const faces = [
      { topoId: 'Face_+X', surfaceType: 'plane', normal: [1, 0, 0], centroid: [hw, 0, 0], area: h * d, startTriangle: 0, triangleCount: 2 },
      { topoId: 'Face_-X', surfaceType: 'plane', normal: [-1, 0, 0], centroid: [-hw, 0, 0], area: h * d, startTriangle: 2, triangleCount: 2 },
      { topoId: 'Face_+Y', surfaceType: 'plane', normal: [0, 1, 0], centroid: [0, hh, 0], area: w * d, startTriangle: 4, triangleCount: 2 },
      { topoId: 'Face_-Y', surfaceType: 'plane', normal: [0, -1, 0], centroid: [0, -hh, 0], area: w * d, startTriangle: 6, triangleCount: 2 },
      { topoId: 'Face_+Z', surfaceType: 'plane', normal: [0, 0, 1], centroid: [0, 0, hd], area: w * h, startTriangle: 8, triangleCount: 2 },
      { topoId: 'Face_-Z', surfaceType: 'plane', normal: [0, 0, -1], centroid: [0, 0, -hd], area: w * h, startTriangle: 10, triangleCount: 2 }
    ];

    const edges = [
      // Top 4 edges (+Y)
      { topoId: 'Edge_Face_+X__Face_+Y', curveType: 'line', length: d, adjacentFaceIds: ['Face_+X', 'Face_+Y'], polyline: [[hw, hh, -hd], [hw, hh, hd]] },
      { topoId: 'Edge_Face_-X__Face_+Y', curveType: 'line', length: d, adjacentFaceIds: ['Face_-X', 'Face_+Y'], polyline: [[-hw, hh, -hd], [-hw, hh, hd]] },
      { topoId: 'Edge_Face_+Y__Face_+Z', curveType: 'line', length: w, adjacentFaceIds: ['Face_+Y', 'Face_+Z'], polyline: [[-hw, hh, hd], [hw, hh, hd]] },
      { topoId: 'Edge_Face_+Y__Face_-Z', curveType: 'line', length: w, adjacentFaceIds: ['Face_+Y', 'Face_-Z'], polyline: [[-hw, hh, -hd], [hw, hh, -hd]] },
      // Bottom 4 edges (-Y)
      { topoId: 'Edge_Face_+X__Face_-Y', curveType: 'line', length: d, adjacentFaceIds: ['Face_+X', 'Face_-Y'], polyline: [[hw, -hh, -hd], [hw, -hh, hd]] },
      { topoId: 'Edge_Face_-X__Face_-Y', curveType: 'line', length: d, adjacentFaceIds: ['Face_-X', 'Face_-Y'], polyline: [[-hw, -hh, -hd], [-hw, -hh, hd]] },
      { topoId: 'Edge_Face_-Y__Face_+Z', curveType: 'line', length: w, adjacentFaceIds: ['Face_-Y', 'Face_+Z'], polyline: [[-hw, -hh, hd], [hw, -hh, hd]] },
      { topoId: 'Edge_Face_-Y__Face_-Z', curveType: 'line', length: w, adjacentFaceIds: ['Face_-Y', 'Face_-Z'], polyline: [[-hw, -hh, -hd], [hw, -hh, -hd]] },
      // Vertical 4 edges
      { topoId: 'Edge_Face_+X__Face_+Z', curveType: 'line', length: h, adjacentFaceIds: ['Face_+X', 'Face_+Z'], polyline: [[hw, -hh, hd], [hw, hh, hd]] },
      { topoId: 'Edge_Face_+X__Face_-Z', curveType: 'line', length: h, adjacentFaceIds: ['Face_+X', 'Face_-Z'], polyline: [[hw, -hh, -hd], [hw, hh, -hd]] },
      { topoId: 'Edge_Face_-X__Face_+Z', curveType: 'line', length: h, adjacentFaceIds: ['Face_-X', 'Face_+Z'], polyline: [[-hw, -hh, hd], [-hw, hh, hd]] },
      { topoId: 'Edge_Face_-X__Face_-Z', curveType: 'line', length: h, adjacentFaceIds: ['Face_-X', 'Face_-Z'], polyline: [[-hw, -hh, -hd], [-hw, hh, -hd]] }
    ];

    const faceRanges = faces.map((f, i) => ({
      ...f,
      faceId: f.topoId,
      startIndex: i * 6,
      indexCount: 6
    }));

    return { faces, edges, faceRanges };
  }

  if (kind === 'cylinder') {
    const r = params.radius || 25;
    const h = params.height || 60;
    const segs = params.segments || 32;
    const hh = h / 2;

    const faces = [
      { topoId: 'Face_lateral', surfaceType: 'cylinder', normal: [0, 0, 1], centroid: [0, 0, 0], area: 2 * Math.PI * r * h, startTriangle: 0, triangleCount: segs * 2 },
      { topoId: 'Face_+Y', surfaceType: 'plane', normal: [0, 1, 0], centroid: [0, hh, 0], area: Math.PI * r * r, startTriangle: segs * 2, triangleCount: segs },
      { topoId: 'Face_-Y', surfaceType: 'plane', normal: [0, -1, 0], centroid: [0, -hh, 0], area: Math.PI * r * r, startTriangle: segs * 3, triangleCount: segs }
    ];

    const topPoly = [];
    const botPoly = [];
    for (let s = 0; s <= segs; s++) {
      const theta = (s / segs) * Math.PI * 2;
      const x = r * Math.sin(theta);
      const z = r * Math.cos(theta);
      topPoly.push([x, hh, z]);
      botPoly.push([x, -hh, z]);
    }

    const edges = [
      { topoId: 'Edge_Face_lateral__Face_+Y', curveType: 'circle', length: 2 * Math.PI * r, adjacentFaceIds: ['Face_lateral', 'Face_+Y'], polyline: topPoly },
      { topoId: 'Edge_Face_lateral__Face_-Y', curveType: 'circle', length: 2 * Math.PI * r, adjacentFaceIds: ['Face_lateral', 'Face_-Y'], polyline: botPoly }
    ];

    const faceRanges = [
      { ...faces[0], faceId: faces[0].topoId, startIndex: 0, indexCount: segs * 2 * 3 },
      { ...faces[1], faceId: faces[1].topoId, startIndex: segs * 2 * 3, indexCount: segs * 3 },
      { ...faces[2], faceId: faces[2].topoId, startIndex: segs * 3 * 3, indexCount: segs * 3 }
    ];

    return { faces, edges, faceRanges };
  }

  return { faces: [], edges: [], faceRanges: [] };
}

/**
 * Builds a Part for a given primitive kind with sane default dimensions (mm).
 * params holds the dimensions so the properties panel can edit + rebuild geometry.
 */
export function createPrimitivePart(kind) {
  const color = nextColor();
  const params = { ...DEFAULT_PARAMS[kind] };
  const geometry = geometryForPrimitive(kind, params);
  const topology = buildPrimitiveTopology(kind, params);

  const mesh = new THREE.Mesh(geometry, makeMaterial(color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const part = new Part({ name: kind, type: 'part', mesh, kind, color, params: { ...params, topology }, topology });
  return part;
}

/** Rebuilds a primitive's geometry after its params were edited in the properties panel. */
export function rebuildPrimitiveGeometry(part) {
  const geometry = geometryForPrimitive(part.kind, part.params);
  part.object3D.geometry.dispose();
  part.object3D.geometry = geometry;
  const topology = buildPrimitiveTopology(part.kind, part.params);
  part.setTopology(topology);
}
