import * as THREE from 'three';

/*
 * How this makes mates "live":
 *
 * When a mate is applied, mates.js snaps partB into position once. Right
 * after that, we now also record the resulting relative transform between
 * partA (driver) and partB (driven) as a 4x4 offset matrix. Every frame,
 * solve() recomputes partB's transform as driver.worldMatrix * offset —
 * so if you drag partA (or anything above it in the tree), partB rigidly
 * follows, exactly like a real mate holding two parts together.
 *
 * Simplification vs. a full CAD solver: this is a rigid lock (all 6 DOF
 * fixed), not a true constraint with remaining freedom (e.g. a real
 * "concentric" mate in SolidWorks still lets the part spin/slide along
 * the shared axis; ours locks that too). Good enough for "these two
 * things move together," which covers most basic assembly needs.
 *
 * If you drag a DRIVEN part directly, the solver will pull it back into
 * place on the next frame, since its transform is derived from the
 * driver rather than being independent. The gizmo is disabled on driven
 * parts for exactly this reason (see renderer.js).
 */
export class MateSolver {
  constructor(assembly) {
    this.assembly = assembly;
    this.records = []; // { id, driverId, drivenId, offset: THREE.Matrix4, type, distance? }
    this._nextId = 1;
  }

  /** Called right after mates.js snaps partB to partA once, to lock it there permanently. */
  registerMate(driverPart, drivenPart, type, extra = {}) {
    driverPart.object3D.updateWorldMatrix(true, false);
    drivenPart.object3D.updateWorldMatrix(true, false);

    const driverWorldInv = new THREE.Matrix4().copy(driverPart.object3D.matrixWorld).invert();
    const offset = new THREE.Matrix4().multiplyMatrices(driverWorldInv, drivenPart.object3D.matrixWorld);

    const record = {
      id: 'mate_' + this._nextId++,
      driverId: driverPart.id,
      drivenId: drivenPart.id,
      offset,
      type,
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

  /** Call once per animation frame. Cheap no-op when there are no mates. */
  solve() {
    if (this.records.length === 0) return;

    for (const rec of this.records) {
      const driver = this.assembly.findById(rec.driverId);
      const driven = this.assembly.findById(rec.drivenId);
      if (!driver || !driven) continue;

      driver.object3D.updateWorldMatrix(true, false);
      const targetWorld = new THREE.Matrix4().multiplyMatrices(driver.object3D.matrixWorld, rec.offset);

      const parent = driven.object3D.parent;
      let targetLocal = targetWorld;
      if (parent) {
        parent.updateWorldMatrix(true, false);
        const parentInv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
        targetLocal = new THREE.Matrix4().multiplyMatrices(parentInv, targetWorld);
      }

      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      targetLocal.decompose(pos, quat, scale);

      driven.object3D.position.copy(pos);
      driven.object3D.quaternion.copy(quat);
      // Scale intentionally left alone so dimension edits on the driven
      // part's own geometry aren't fought by the solver.
    }
  }

  toJSON() {
    return this.records.map((r) => ({
      driverId: r.driverId,
      drivenId: r.drivenId,
      type: r.type,
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
      distance: r.distance,
      offset: new THREE.Matrix4().fromArray(r.offset)
    }));
  }
}
