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

/**
 * Builds a Part for a given primitive kind with sane default dimensions (mm).
 * params holds the dimensions so the properties panel can edit + rebuild geometry.
 */
export function createPrimitivePart(kind) {
  const color = nextColor();
  const params = { ...DEFAULT_PARAMS[kind] };
  const geometry = geometryForPrimitive(kind, params);

  const mesh = new THREE.Mesh(geometry, makeMaterial(color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const part = new Part({ name: kind, type: 'part', mesh, kind, color, params });
  return part;
}

/** Rebuilds a primitive's geometry after its params were edited in the properties panel. */
export function rebuildPrimitiveGeometry(part) {
  const geometry = geometryForPrimitive(part.kind, part.params);
  part.object3D.geometry.dispose();
  part.object3D.geometry = geometry;
}
