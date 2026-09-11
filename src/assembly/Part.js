import * as THREE from 'three';

let nextId = 1;

/**
 * A Part is either:
 *  - a leaf: owns a THREE.Mesh (geometry + material)
 *  - a sub-assembly: owns children Parts, no geometry of its own
 *
 * Position/rotation/scale are stored on the underlying THREE.Object3D
 * (mesh for leaves, THREE.Group for assemblies), which is the single
 * source of truth for transforms.
 */
export class Part {
  constructor({ name, type = 'part', mesh = null, kind = 'box', color = '#4fb0ff', params = {} }) {
    this.id = 'part_' + nextId++;
    this.name = name || `${kind}_${this.id}`;
    this.type = type; // 'part' | 'assembly'
    this.kind = kind; // 'box' | 'cylinder' | 'sphere' | 'cone' | 'extrude' | 'group'
    this.color = color;
    this.params = params; // geometry-defining parameters (dimensions, sketch points, extrude depth...)
    this.children = [];
    this.parent = null;
    this.visible = true;
    this.mates = []; // mate definitions applied that reference this part

    if (type === 'assembly') {
      this.object3D = new THREE.Group();
      this.mesh = null;
    } else {
      this.object3D = mesh;
      this.mesh = mesh;
    }
    this.object3D.name = this.id;
    this.object3D.userData.partId = this.id;
  }

  addChild(childPart) {
    if (childPart.parent) childPart.parent.removeChild(childPart);
    childPart.parent = this;
    this.children.push(childPart);
    this.object3D.add(childPart.object3D);
  }

  removeChild(childPart) {
    const idx = this.children.indexOf(childPart);
    if (idx !== -1) this.children.splice(idx, 1);
    this.object3D.remove(childPart.object3D);
    childPart.parent = null;
  }

  setVisible(v) {
    this.visible = v;
    this.object3D.visible = v;
  }

  // Walk this part and all descendants (including self)
  *walk() {
    yield this;
    for (const child of this.children) {
      yield* child.walk();
    }
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      kind: this.kind,
      color: this.color,
      params: this.params,
      visible: this.visible,
      transform: {
        position: this.object3D.position.toArray(),
        rotation: [this.object3D.rotation.x, this.object3D.rotation.y, this.object3D.rotation.z],
        scale: this.object3D.scale.toArray()
      },
      children: this.children.map((c) => c.toJSON())
    };
  }
}
