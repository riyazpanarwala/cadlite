import * as THREE from 'three';
import { Part } from '../assembly/Part.js';

const BOOLEAN_COLOR = '#c9a7ff';

function partToShapeDef(part) {
  part.object3D.updateWorldMatrix(true, false);
  return {
    kind: part.kind,
    params: part.params,
    matrix: part.object3D.matrixWorld.toArray()
  };
}

/**
 * Runs a boolean operation (union/cut/intersect) between two parts in the
 * main process (see main/occ-service.js), then builds a new Part from the
 * resulting mesh. On success, the two source parts are left untouched in
 * the tree — the caller (renderer.js) decides whether to remove them.
 *
 * Throws on failure (missing OCC install, unsupported part kind, etc.) —
 * callers should catch and show the message, since this is the most
 * likely piece to need debugging on a fresh machine (see occ-service.js
 * comments for why).
 */
export async function booleanOp(op, partA, partB) {
  const shapeA = partToShapeDef(partA);
  const shapeB = partToShapeDef(partB);
  const request = { op, shapeA, shapeB };
  const result = await window.cadlite.booleanOp(request);

  if (!result.ok) {
    throw new Error(result.error || 'Boolean operation failed');
  }

  const { positions, normals, index } = result.meshData;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);

  if (normals && normals.some((n) => n !== 0)) {
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  } else {
    geometry.computeVertexNormals();
  }

  const material = new THREE.MeshStandardMaterial({ color: BOOLEAN_COLOR, metalness: 0.15, roughness: 0.55 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Store raw mesh arrays so save/load can rebuild without needing OCC again,
  // AND store shapeA, shapeB, op so chained booleans/fillets/chamfers can reconstruct the solid.
  const topology = {
    faces: result.meshData.faces || [],
    edges: result.meshData.edges || [],
    faceRanges: result.meshData.faceRanges || []
  };

  const params = {
    mesh: { positions, normals, index },
    sourceOp: op,
    op,
    shapeA,
    shapeB,
    topology
  };
  const part = new Part({ name: `${op}_result`, type: 'part', mesh, kind: 'boolean', color: BOOLEAN_COLOR, params, topology });
  return part;
}
