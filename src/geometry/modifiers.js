import * as THREE from 'three';
import { Part } from '../assembly/Part.js';

function partToShapeDef(part) {
  part.object3D.updateWorldMatrix(true, false);
  return {
    kind: part.kind,
    params: part.params,
    matrix: part.object3D.matrixWorld.toArray()
  };
}

function buildMeshFromData(meshData, color) {
  const { positions, normals, index } = meshData;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);

  if (normals && normals.some((n) => n !== 0)) {
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  } else {
    geometry.computeVertexNormals();
  }

  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.2,
    roughness: 0.5
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, meshData };
}

/**
 * Applies a Chamfer (bevel) to the edges of a solid Part.
 * @param {Part} part - The solid part to chamfer
 * @param {number} distance - Chamfer distance in mm
 * @param {string} filter - 'all' | 'vertical' | 'horizontal'
 */
export async function chamferPart(part, distance = 5, filter = 'all') {
  const request = {
    shapeDef: partToShapeDef(part),
    distance,
    filter
  };

  const result = await window.cadlite.chamferOp(request);
  if (!result.ok) {
    throw new Error(result.error || 'Chamfer operation failed');
  }

  const { mesh, meshData } = buildMeshFromData(result.meshData, part.color);
  const newPart = new Part({
    name: 'Chamfer 1',
    type: 'part',
    mesh,
    kind: 'chamfer',
    color: part.color,
    params: { ...part.params, mesh: meshData, chamferDistance: distance, filter }
  });

  return newPart;
}

/**
 * Applies a Fillet (rounding) to the edges of a solid Part.
 * @param {Part} part - The solid part to fillet
 * @param {number} radius - Fillet radius in mm
 * @param {string} filter - 'all' | 'vertical' | 'horizontal'
 */
export async function filletPart(part, radius = 3, filter = 'all') {
  const request = {
    shapeDef: partToShapeDef(part),
    radius,
    filter
  };

  const result = await window.cadlite.filletOp(request);
  if (!result.ok) {
    throw new Error(result.error || 'Fillet operation failed');
  }

  const { mesh, meshData } = buildMeshFromData(result.meshData, part.color);
  const newPart = new Part({
    name: 'Fillet 1',
    type: 'part',
    mesh,
    kind: 'fillet',
    color: part.color,
    params: { ...part.params, mesh: meshData, filletRadius: radius, filter }
  });

  return newPart;
}
