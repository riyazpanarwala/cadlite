import * as THREE from 'three';

/** Temporary inspection positions. Always reset before model edits or export. */
export class ExplodedView {
  constructor(assembly) {
    this.assembly = assembly;
    this.entries = [];
    this.amount = 0;
    this.axis = 'radial';
  }

  get active() { return this.amount > 0; }

  capture() {
    this.assembly.root.object3D.updateWorldMatrix(true, true);
    const parts = this.assembly.allParts().filter(part => part.mesh);
    if (parts.length < 2) return false;
    const bounds = new THREE.Box3();
    this.entries = parts.map(part => {
      const box = new THREE.Box3().setFromObject(part.mesh);
      bounds.union(box);
      return { part, position: part.object3D.position.clone(), center: box.getCenter(new THREE.Vector3()),
        parentInverse: part.object3D.parent.matrixWorld.clone().invert() };
    });
    this.center = bounds.getCenter(new THREE.Vector3());
    this.spacing = Math.max(bounds.getSize(new THREE.Vector3()).length() * 0.65, 1);
    return true;
  }

  setAmount(value, axis = this.axis) {
    const amount = Math.min(100, Math.max(0, Number(value) || 0));
    if (!amount) { this.reset(); return true; }
    if (!['radial', 'x', 'y', 'z'].includes(axis)) throw new Error('Unknown explode direction.');
    if (!this.entries.length && !this.capture()) return false;
    this.axis = axis;
    this.amount = amount;
    this.entries.forEach((entry, index) => {
      const offset = entry.center.clone().sub(this.center);
      if (axis !== 'radial') {
        offset.set(0, 0, 0);
        offset[axis] = (index - (this.entries.length - 1) / 2) * this.spacing;
      } else if (offset.lengthSq() < 1e-12) {
        // Concentric components still separate in a deterministic arrangement.
        const angle = index * Math.PI * 2 / this.entries.length;
        offset.set(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(this.spacing);
      } else {
        offset.addScaledVector(offset.clone().normalize(), this.spacing);
      }
      offset.multiplyScalar(amount / 100);
      const localOffset = offset.applyMatrix4(entry.parentInverse)
        .sub(new THREE.Vector3().applyMatrix4(entry.parentInverse));
      entry.part.object3D.position.copy(entry.position).add(localOffset);
      entry.part.object3D.updateWorldMatrix(true, true);
    });
    return true;
  }

  reset() {
    for (const entry of this.entries) {
      entry.part.object3D.position.copy(entry.position);
      entry.part.object3D.updateWorldMatrix(true, true);
    }
    this.entries = [];
    this.amount = 0;
  }
}
