import * as THREE from 'three';
import { Part } from './Part.js';

export class Assembly {
  constructor(scene) {
    this.scene = scene;
    this.reviewViews = [];
    this.root = new Part({ name: 'Assembly', type: 'assembly', kind: 'group' });
    this.scene.add(this.root.object3D);
  }

  addPart(part, parent = null) {
    (parent || this.root).addChild(part);
    return part;
  }

  removePart(part) {
    if (part.parent) part.parent.removeChild(part);
    else this.root.removeChild(part);
  }

  findById(id) {
    for (const p of this.root.walk()) {
      if (p.id === id) return p;
    }
    return null;
  }

  findByObject3D(obj3D) {
    // Walk up until we find an object with a partId in userData
    let o = obj3D;
    while (o) {
      if (o.userData && o.userData.partId) return this.findById(o.userData.partId);
      o = o.parent;
    }
    return null;
  }

  allParts() {
    const list = [];
    for (const p of this.root.walk()) {
      if (p !== this.root) list.push(p);
    }
    return list;
  }

  /** Groups the given parts into a new sub-assembly, preserving world transforms. */
  groupParts(parts, name = 'SubAssembly') {
    if (parts.length === 0) return null;

    // Determine a common parent (use the root for simplicity in this basic version)
    const group = new Part({ name, type: 'assembly', kind: 'group' });
    this.root.addChild(group);

    for (const part of parts) {
      // Preserve world position by re-parenting through world matrix math
      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      const worldScale = new THREE.Vector3();
      part.object3D.updateWorldMatrix(true, false);
      part.object3D.matrixWorld.decompose(worldPos, worldQuat, worldScale);

      this.removePart(part);
      group.addChild(part);

      part.object3D.position.copy(worldPos);
      part.object3D.quaternion.copy(worldQuat);
      part.object3D.scale.copy(worldScale);
    }

    return group;
  }

  clear() {
    this.reviewViews = [];
    this.root.children.slice().forEach((c) => this.removePart(c));
  }
}
