import * as THREE from 'three';

/*
 * IMPORTANT / HONEST LIMITATION:
 * These are ONE-TIME alignment snaps, not a live geometric constraint
 * solver like SolidWorks' mate engine. Applying a mate moves the second
 * selected part into alignment with the first, once. If you move either
 * part afterward, the mate does not re-solve automatically. A true mate
 * solver needs a constraint graph + numerical solver (e.g. sequential
 * Newton iterations over a system of alignment equations), which is a
 * natural "phase 2" addition on top of this data model — each mate is
 * already recorded in part.mates so a solver could be layered in later.
 */

function worldPosition(part) {
  const v = new THREE.Vector3();
  part.object3D.getWorldPosition(v);
  return v;
}

function worldToLocalPosition(part, worldPos) {
  // Convert a desired world position into the local position needed,
  // given the part's parent's world matrix.
  const parent = part.object3D.parent;
  const local = worldPos.clone();
  if (parent) {
    parent.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
    local.applyMatrix4(inv);
  }
  return local;
}

/** Coincident: snaps part B's origin exactly onto part A's origin. */
export function applyCoincidentMate(partA, partB) {
  const targetWorld = worldPosition(partA);
  const localTarget = worldToLocalPosition(partB, targetWorld);
  partB.object3D.position.copy(localTarget);
  recordMate(partA, partB, 'coincident', {});
}

/** Concentric: aligns B's X/Y (centerline) to A's, assuming both are Z-axis aligned solids. */
export function applyConcentricMate(partA, partB) {
  const aWorld = worldPosition(partA);
  const bWorld = worldPosition(partB);
  const targetWorld = new THREE.Vector3(aWorld.x, aWorld.y, bWorld.z);
  const localTarget = worldToLocalPosition(partB, targetWorld);
  partB.object3D.position.copy(localTarget);
  recordMate(partA, partB, 'concentric', {});
}

/** Distance: moves B along the A->B direction so the origins are exactly `distance` apart. */
export function applyDistanceMate(partA, partB, distance = 10) {
  const aWorld = worldPosition(partA);
  const bWorld = worldPosition(partB);
  let dir = new THREE.Vector3().subVectors(bWorld, aWorld);
  if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
  dir.normalize();
  const targetWorld = new THREE.Vector3().copy(aWorld).addScaledVector(dir, distance);
  const localTarget = worldToLocalPosition(partB, targetWorld);
  partB.object3D.position.copy(localTarget);
  recordMate(partA, partB, 'distance', { distance });
}

function recordMate(partA, partB, type, extra) {
  const record = { type, partA: partA.id, partB: partB.id, ...extra, appliedAt: Date.now() };
  partA.mates.push(record);
  partB.mates.push(record);
}
