import * as THREE from 'three';
import { Part } from '../assembly/Part.js';
import { geometryForPrimitive } from './primitives.js';
import { buildExtrudeGeometry } from './extrude.js';
import { buildRevolveGeometry } from './revolve.js';

function buildBooleanGeometry(params) {
  const { positions, normals, index } = params.mesh;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  if (normals && normals.some((n) => n !== 0)) {
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  } else {
    geometry.computeVertexNormals();
  }
  return geometry;
}

/**
 * Deep clones a Part and its 3D mesh geometry.
 */
export function clonePart(sourcePart, newName) {
  let geometry;
  if (sourcePart.kind === 'extrude') {
    geometry = buildExtrudeGeometry(sourcePart.params);
  } else if (sourcePart.kind === 'revolve') {
    geometry = buildRevolveGeometry(sourcePart.params);
  } else if (sourcePart.params && sourcePart.params.mesh) {
    geometry = buildBooleanGeometry(sourcePart.params);
  } else if (sourcePart.mesh && sourcePart.mesh.geometry) {
    geometry = sourcePart.mesh.geometry.clone();
  } else {
    geometry = geometryForPrimitive(sourcePart.kind, sourcePart.params);
  }

  const material = new THREE.MeshStandardMaterial({
    color: sourcePart.color,
    metalness: 0.15,
    roughness: 0.55
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  mesh.position.copy(sourcePart.object3D.position);
  mesh.rotation.copy(sourcePart.object3D.rotation);
  mesh.scale.copy(sourcePart.object3D.scale);

  const cloned = new Part({
    name: newName || `${sourcePart.name}_copy`,
    type: 'part',
    mesh,
    kind: sourcePart.kind,
    color: sourcePart.color,
    params: JSON.parse(JSON.stringify(sourcePart.params || {}))
  });

  return cloned;
}

/**
 * Creates a 2D rectangular array pattern of parts.
 */
export function createRectangularPattern(sourcePart, { countX = 2, spacingX = 60, countZ = 1, spacingZ = 60 }) {
  const instances = [];
  const basePos = sourcePart.object3D.position.clone();

  let index = 1;
  for (let z = 0; z < countZ; z++) {
    for (let x = 0; x < countX; x++) {
      if (x === 0 && z === 0) continue; // skip the original root part

      const name = `${sourcePart.name}_Rect${index++}`;
      const clone = clonePart(sourcePart, name);
      clone.object3D.position.set(
        basePos.x + x * spacingX,
        basePos.y,
        basePos.z + z * spacingZ
      );
      instances.push(clone);
    }
  }

  return instances;
}

/**
 * Creates a circular pattern of parts around the world Y-axis (or center point).
 */
export function createCircularPattern(sourcePart, { count = 4, totalAngle = 360, center = new THREE.Vector3(0, 0, 0) }) {
  const instances = [];
  const basePos = sourcePart.object3D.position.clone();
  const radiusVec = new THREE.Vector3().subVectors(basePos, center);
  radiusVec.y = 0;
  const radius = radiusVec.length();
  const startAngle = Math.atan2(radiusVec.z, radiusVec.x);

  const angleStep = ((totalAngle * Math.PI) / 180) / count;

  for (let i = 1; i < count; i++) {
    const angle = startAngle + i * angleStep;
    const name = `${sourcePart.name}_Circ${i}`;
    const clone = clonePart(sourcePart, name);

    clone.object3D.position.set(
      center.x + Math.cos(angle) * radius,
      basePos.y,
      center.z + Math.sin(angle) * radius
    );
    clone.object3D.rotation.y = sourcePart.object3D.rotation.y + i * angleStep;
    instances.push(clone);
  }

  return instances;
}

/**
 * Mirrors a part across a principal plane (XY, XZ, or YZ).
 */
export function createMirrorPart(sourcePart, plane = 'YZ') {
  const name = `${sourcePart.name}_Mirror`;
  const clone = clonePart(sourcePart, name);
  const pos = clone.object3D.position;

  if (plane === 'YZ') {
    // Mirror across X=0 plane: negate X
    pos.x = -pos.x;
  } else if (plane === 'XZ') {
    // Mirror across Y=0 plane: negate Y
    pos.y = -pos.y;
  } else if (plane === 'XY') {
    // Mirror across Z=0 plane: negate Z
    pos.z = -pos.z;
  }

  return clone;
}
