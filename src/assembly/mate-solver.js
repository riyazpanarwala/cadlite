import * as THREE from 'three';

/*
 * Live Assembly Mate Solver:
 *
 * Supports both rigid locks and multi-DOF articulating constraints:
 * - Concentric Mates: Default to articulated multi-DOF constraints.
 *   The driven part is constrained to remain collinear with the driver's
 *   longitudinal axis. The driven part has 2 degrees of freedom:
 *     1. Free translation (sliding) along the shared axis line.
 *     2. Free rotation (spinning) around the shared axis.
 *   Any radial offset perpendicular to the axis or tilt away from the axis
 *   is projected back into alignment every frame.
 * - Rigid Mates (Coincident / Distance / Locked Concentric):
 *   Rigidly lock all 6 degrees of freedom relative to the driver.
 */
export class MateSolver {
  constructor(assembly) {
    this.assembly = assembly;
    this.records = []; // { id, driverId, drivenId, offset: THREE.Matrix4, type, articulated, distance? }
    this._nextId = 1;
  }

  /** Called right after mates.js snaps partB to partA once, to lock or constrain it. */
  registerMate(driverPart, drivenPart, type, extra = {}) {
    driverPart.object3D.updateWorldMatrix(true, false);
    drivenPart.object3D.updateWorldMatrix(true, false);

    const driverWorldInv = new THREE.Matrix4().copy(driverPart.object3D.matrixWorld).invert();
    const offset = new THREE.Matrix4().multiplyMatrices(driverWorldInv, drivenPart.object3D.matrixWorld);

    const articulated = extra.articulated !== undefined ? extra.articulated : (type === 'concentric');

    const record = {
      id: 'mate_' + this._nextId++,
      driverId: driverPart.id,
      drivenId: drivenPart.id,
      offset,
      type,
      articulated,
      lastDriverElements: driverPart.object3D.matrixWorld.elements.slice(),
      lastDrivenElements: drivenPart.object3D.matrixWorld.elements.slice(),
      ...extra
    };
    this.records.push(record);
    return record;
  }

  matesInvolving(part) {
    return this.records.filter((r) => r.driverId === part.id || r.drivenId === part.id);
  }

  removeMatesFor(part) {
    this.records = this.records.filter((r) => r.driverId !== part.id && r.drivenId !== part.id);
  }

  isDriven(part) {
    return this.records.some((r) => r.drivenId === part.id);
  }

  isArticulated(part) {
    return this.records.some((r) => r.drivenId === part.id && r.articulated);
  }

  isRigidlyLocked(part) {
    return this.records.some((r) => r.drivenId === part.id && !r.articulated);
  }

  getArticulatedMate(part) {
    return this.records.find((r) => r.drivenId === part.id && r.articulated) || null;
  }

  /** Call once per animation frame. Cheap no-op when there are no mates. */
  solve() {
    if (this.records.length === 0) return;

    for (const rec of this.records) {
      const driver = this.assembly.findById(rec.driverId);
      const driven = this.assembly.findById(rec.drivenId);
      if (!driver || !driven) continue;

      driver.object3D.updateWorldMatrix(true, false);
      driven.object3D.updateWorldMatrix(true, false);

      const driverChanged = !rec.lastDriverElements ||
        !elementsEqual(driver.object3D.matrixWorld.elements, rec.lastDriverElements);
      const drivenChanged = !rec.lastDrivenElements ||
        !elementsEqual(driven.object3D.matrixWorld.elements, rec.lastDrivenElements);

      if (rec.articulated && rec.type === 'concentric') {
        if (drivenChanged && !driverChanged) {
          // Driven part was moved/rotated by user with gizmo -> project onto concentric DOF
          this._constrainConcentric(driver, driven, rec);
        } else {
          // Driver moved (or initial sync) -> driven follows driver preserving current relative offset
          this._applyRelativeTransform(driver, driven, rec.offset);
        }
      } else {
        // Rigid constraint: driven strictly follows driver's relative offset
        this._applyRelativeTransform(driver, driven, rec.offset);
      }

      driver.object3D.updateWorldMatrix(true, false);
      driven.object3D.updateWorldMatrix(true, false);
      rec.lastDriverElements = driver.object3D.matrixWorld.elements.slice();
      rec.lastDrivenElements = driven.object3D.matrixWorld.elements.slice();
    }
  }

  _constrainConcentric(driver, driven, rec) {
    const driverPos = new THREE.Vector3();
    const driverQuat = new THREE.Quaternion();
    driver.object3D.getWorldPosition(driverPos);
    driver.object3D.getWorldQuaternion(driverQuat);
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(driverQuat).normalize();

    // Constrain position: project driven onto the axis line through driverPos
    const drivenPos = new THREE.Vector3();
    driven.object3D.getWorldPosition(drivenPos);
    const toDriven = new THREE.Vector3().subVectors(drivenPos, driverPos);
    const t = toDriven.dot(axis);
    const constrainedWorldPos = new THREE.Vector3().copy(driverPos).addScaledVector(axis, t);

    // Constrain orientation: keep driven's local Y parallel to driver's axis, preserving spin
    const drivenQuat = new THREE.Quaternion();
    driven.object3D.getWorldQuaternion(drivenQuat);
    const drivenY = new THREE.Vector3(0, 1, 0).applyQuaternion(drivenQuat).normalize();
    const alignQuat = new THREE.Quaternion().setFromUnitVectors(drivenY, axis);
    const constrainedWorldQuat = alignQuat.multiply(drivenQuat);

    // Apply to driven in its local space
    this._setWorldTransform(driven, constrainedWorldPos, constrainedWorldQuat);

    // Update stored offset so subsequent driver moves carry this new position/spin
    driven.object3D.updateWorldMatrix(true, false);
    const driverWorldInv = new THREE.Matrix4().copy(driver.object3D.matrixWorld).invert();
    rec.offset = new THREE.Matrix4().multiplyMatrices(driverWorldInv, driven.object3D.matrixWorld);
  }

  _applyRelativeTransform(driver, driven, offsetMatrix) {
    const targetWorld = new THREE.Matrix4().multiplyMatrices(driver.object3D.matrixWorld, offsetMatrix);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    targetWorld.decompose(pos, quat, scale);
    this._setWorldTransform(driven, pos, quat);
  }

  _setWorldTransform(part, worldPos, worldQuat) {
    const parent = part.object3D.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      const parentInv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
      const localMat = new THREE.Matrix4().compose(worldPos, worldQuat, new THREE.Vector3(1, 1, 1));
      localMat.premultiply(parentInv);
      const localPos = new THREE.Vector3();
      const localQuat = new THREE.Quaternion();
      const localScale = new THREE.Vector3();
      localMat.decompose(localPos, localQuat, localScale);
      part.object3D.position.copy(localPos);
      part.object3D.quaternion.copy(localQuat);
    } else {
      part.object3D.position.copy(worldPos);
      part.object3D.quaternion.copy(worldQuat);
    }
  }

  toJSON() {
    return this.records.map((r) => ({
      driverId: r.driverId,
      drivenId: r.drivenId,
      type: r.type,
      articulated: r.articulated,
      distance: r.distance,
      offset: r.offset.toArray()
    }));
  }

  loadJSON(list) {
    this.records = (list || []).map((r) => ({
      id: 'mate_' + this._nextId++,
      driverId: r.driverId,
      drivenId: r.drivenId,
      type: r.type,
      articulated: r.articulated !== undefined ? r.articulated : (r.type === 'concentric'),
      distance: r.distance,
      offset: new THREE.Matrix4().fromArray(r.offset)
    }));
  }
}

function elementsEqual(a, b) {
  if (!a || !b) return false;
  for (let i = 0; i < 16; i++) {
    if (Math.abs(a[i] - b[i]) > 1e-5) return false;
  }
  return true;
}
