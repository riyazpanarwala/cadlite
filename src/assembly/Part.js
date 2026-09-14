import * as THREE from 'three';
import { FeatureTree, FeatureNode } from '../history/FeatureTree.js';

let nextId = 1;
export function reservePartId(id) {
  const match = /^part_(\d+)$/.exec(id);
  if (match) nextId = Math.max(nextId, Number(match[1]) + 1);
}

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
  constructor({ name, type = 'part', mesh = null, kind = 'box', color = '#4fb0ff', params = {}, topology = null, featureTree = null }) {
    this.id = 'part_' + nextId++;
    this.name = name || `${kind}_${this.id}`;
    this.type = type; // 'part' | 'assembly'
    this.kind = kind; // 'box' | 'cylinder' | 'sphere' | 'cone' | 'extrude' | 'group'
    this.color = color;
    this.params = params; // geometry-defining parameters (dimensions, sketch points, extrude depth...)
    this.topology = topology || params.topology || null;
    this.children = [];
    this.parent = null;
    this.visible = true;
    this.mates = []; // mate definitions applied that reference this part

    // Initialize Parametric Feature Tree (DAG)
    if (featureTree) {
      this.featureTree = featureTree instanceof FeatureTree ? featureTree : FeatureTree.fromJSON(featureTree);
    } else if (type === 'part') {
      this.featureTree = new FeatureTree([
        new FeatureNode({
          id: `feat_${this.id}_base`,
          name: `${this.name} Base`,
          type: this.kind,
          params: { ...this.params }
        })
      ]);
    } else {
      this.featureTree = null;
    }

    if (type === 'assembly') {
      this.object3D = new THREE.Group();
      this.mesh = null;
    } else {
      this.object3D = mesh;
      this.mesh = mesh;
    }
    this.object3D.name = this.id;
    this.object3D.userData.partId = this.id;
    this.edgeGroup = null;

    if (this.topology) {
      this.buildEdgeVisualizer();
    }
  }

  setTopology(topo) {
    this.topology = topo;
    if (this.params) this.params.topology = topo;
    this.buildEdgeVisualizer();
  }

  getFaceByTriangleIndex(triangleIndex) {
    if (!this.topology || !this.topology.faceRanges) return null;
    for (const fr of this.topology.faceRanges) {
      if (triangleIndex >= fr.startTriangle && triangleIndex < fr.startTriangle + fr.triangleCount) {
        return fr;
      }
    }
    return null;
  }

  getFaceById(faceId) {
    if (!this.topology) return null;
    if (this.topology.faces) {
      const f = this.topology.faces.find((x) => x.topoId === faceId);
      if (f) return f;
    }
    if (this.topology.faceRanges) {
      return this.topology.faceRanges.find((x) => x.faceId === faceId) || null;
    }
    return null;
  }

  getEdgeById(edgeId) {
    if (!this.topology || !this.topology.edges) return null;
    return this.topology.edges.find((e) => e.topoId === edgeId) || null;
  }

  getVertices() {
    if (this.topology && this.topology.vertices && this.topology.vertices.length > 0) {
      return this.topology.vertices;
    }
    if (this.topology && this.topology.edges && this.topology.edges.length > 0) {
      const vertMap = new Map();
      let vIndex = 1;
      for (const e of this.topology.edges) {
        if (!e.polyline || e.polyline.length < 2) continue;
        const p1 = e.polyline[0];
        const p2 = e.polyline[e.polyline.length - 1];
        for (const p of [p1, p2]) {
          const key = `${Math.round(p[0] * 100) / 100}_${Math.round(p[1] * 100) / 100}_${Math.round(p[2] * 100) / 100}`;
          if (!vertMap.has(key)) {
            vertMap.set(key, {
              index: vIndex - 1,
              topoId: `Vertex_${vIndex++}`,
              point: [...p]
            });
          }
        }
      }
      return Array.from(vertMap.values());
    }
    return [];
  }

  getVertexById(vertexId) {
    const list = this.getVertices();
    return list.find((v) => v.topoId === vertexId) || null;
  }

  buildEdgeVisualizer() {
    if (!this.mesh || !this.topology || !this.topology.edges || this.topology.edges.length === 0) return;

    if (this.edgeGroup) {
      this.object3D.remove(this.edgeGroup);
      this.edgeGroup = null;
    }

    const group = new THREE.Group();
    group.name = `${this.id}_edges`;

    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x1e293b,
      linewidth: 1,
      transparent: true,
      opacity: 0.8
    });

    for (const edge of this.topology.edges) {
      if (!edge.polyline || edge.polyline.length < 2) continue;
      const pts = edge.polyline.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, edgeMat);
      line.userData = {
        isCadEdge: true,
        edgeId: edge.topoId,
        partId: this.id,
        edgeData: edge
      };
      group.add(line);
    }

    this.edgeGroup = group;
    this.object3D.add(group);
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
      topology: this.topology,
      featureTree: this.featureTree ? this.featureTree.toJSON() : null,
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
