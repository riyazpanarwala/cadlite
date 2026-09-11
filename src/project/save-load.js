import * as THREE from 'three';
import { Part } from '../assembly/Part.js';
import { geometryForPrimitive } from '../geometry/primitives.js';
import { buildExtrudeGeometry } from '../geometry/extrude.js';

const FORMAT_VERSION = 1;

export function serializeProject(assembly, mateSolver) {
  return JSON.stringify(
    {
      formatVersion: FORMAT_VERSION,
      savedAt: new Date().toISOString(),
      tree: assembly.root.toJSON(),
      mates: mateSolver ? mateSolver.toJSON() : []
    },
    null,
    2
  );
}

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

function makeMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.15, roughness: 0.55 });
}

function buildPartFromData(data) {
  let part;

  if (data.type === 'assembly') {
    part = new Part({ name: data.name, type: 'assembly', kind: 'group' });
  } else {
    let geometry;
    if (data.kind === 'extrude') {
      geometry = buildExtrudeGeometry(data.params);
    } else if (data.kind === 'boolean' || data.kind === 'chamfer' || data.kind === 'fillet' || data.kind === 'step') {
      geometry = buildBooleanGeometry(data.params);
    } else {
      geometry = geometryForPrimitive(data.kind, data.params);
    }
    const mesh = new THREE.Mesh(geometry, makeMaterial(data.color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    part = new Part({ name: data.name, type: 'part', mesh, kind: data.kind, color: data.color, params: data.params });
  }

  part.id = data.id; // preserve original ids so mate records / references stay valid
  part.object3D.name = part.id;
  part.object3D.userData.partId = part.id;
  part.setVisible(data.visible !== false);

  const t = data.transform;
  if (t) {
    part.object3D.position.set(...t.position);
    part.object3D.rotation.set(...t.rotation);
    part.object3D.scale.set(...t.scale);
  }

  for (const childData of data.children || []) {
    part.addChild(buildPartFromData(childData));
  }

  return part;
}

/** Rebuilds the assembly's tree (and mate solver state) in-place from a parsed project JSON object. */
export function deserializeProject(assembly, jsonString, mateSolver) {
  const data = JSON.parse(jsonString);
  assembly.clear();

  for (const childData of data.tree.children || []) {
    assembly.root.addChild(buildPartFromData(childData));
  }

  if (mateSolver) mateSolver.loadJSON(data.mates || []);
}
