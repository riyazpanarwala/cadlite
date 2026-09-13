import * as THREE from 'three';

/**
 * Enhanced Selection Manager supporting CAD Selection Filters:
 * - 'part': Selects entire solid Part / Sub-assembly (for gizmo transform / mates)
 * - 'face': Selects individual topological B-Rep Face (for TNS inspection / planar reference)
 * - 'edge': Selects individual topological B-Rep Edge (for targeted Fillets / Chamfers)
 */
export class SelectionManager {
  constructor(onChange) {
    this.selected = []; // array of Part
    this.filterMode = 'part'; // 'part' | 'face' | 'edge'
    this.selectedFaces = []; // [{ part, faceRange, topoId }]
    this.selectedEdges = []; // [{ part, edgeData, topoId }]
    this.hoveredFace = null;
    this.hoveredEdge = null;
    this.onChange = onChange || (() => {});

    this.scene = null;
    this.overlayGroup = new THREE.Group();
    this.overlayGroup.name = 'selection_overlays';

    // Face highlight materials
    this.faceSelectMat = new THREE.MeshBasicMaterial({
      color: 0x00b4d8,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });

    this.faceHoverMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    this.edgeSelectMat = new THREE.LineBasicMaterial({
      color: 0xffea00,
      linewidth: 3,
      depthTest: false
    });

    this.edgeHoverMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      linewidth: 2,
      depthTest: false
    });

    this.faceSelectMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.faceSelectMat);
    this.faceSelectMesh.visible = false;
    this.overlayGroup.add(this.faceSelectMesh);

    this.faceHoverMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.faceHoverMat);
    this.faceHoverMesh.visible = false;
    this.overlayGroup.add(this.faceHoverMesh);

    this.edgeSelectLine = new THREE.Line(new THREE.BufferGeometry(), this.edgeSelectMat);
    this.edgeSelectLine.visible = false;
    this.overlayGroup.add(this.edgeSelectLine);

    this.edgeHoverLine = new THREE.Line(new THREE.BufferGeometry(), this.edgeHoverMat);
    this.edgeHoverLine.visible = false;
    this.overlayGroup.add(this.edgeHoverLine);
  }

  attachScene(scene) {
    this.scene = scene;
    if (this.scene) {
      this.scene.add(this.overlayGroup);
    }
  }

  setFilterMode(mode) {
    if (this.filterMode === mode) return;
    this.filterMode = mode;
    this.clearSubSelections(false);
    this.onChange(this.selected);
  }

  // ---- Whole Part Selection ----

  select(part, additive = false) {
    if (!additive) this.clear(false);
    if (part && !this.selected.includes(part)) {
      this.selected.push(part);
      this._highlight(part, true);
    }
    this.onChange(this.selected);
  }

  toggle(part) {
    if (this.selected.includes(part)) {
      this.deselect(part);
    } else {
      this.select(part, true);
    }
  }

  deselect(part) {
    const idx = this.selected.indexOf(part);
    if (idx !== -1) {
      this.selected.splice(idx, 1);
      this._highlight(part, false);
    }
    this.onChange(this.selected);
  }

  clear(notify = true) {
    for (const p of this.selected) this._highlight(p, false);
    this.selected = [];
    this.clearSubSelections(false);
    if (notify) this.onChange(this.selected);
  }

  isSelected(part) {
    return this.selected.includes(part);
  }

  primary() {
    return this.selected[0] || null;
  }

  // ---- Sub-element: Face Selection ----

  selectFace(part, faceRange, additive = false) {
    if (!additive) {
      this.selectedFaces = [];
    }

    const existingIdx = this.selectedFaces.findIndex(
      (f) => f.part === part && f.topoId === faceRange.faceId
    );

    if (existingIdx !== -1) {
      if (additive) this.selectedFaces.splice(existingIdx, 1);
    } else {
      this.selectedFaces.push({
        part,
        faceRange,
        topoId: faceRange.faceId,
        metadata: faceRange
      });
      // Also ensure part is selected for context
      if (!this.selected.includes(part)) {
        this.select(part, false);
      }
    }

    this._updateFaceVisuals();
    this.onChange(this.selected);
  }

  hoverFace(part, faceRange) {
    if (!part || !faceRange) {
      this.hoveredFace = null;
      this.faceHoverMesh.visible = false;
      return;
    }
    this.hoveredFace = { part, faceRange };
    this._renderFaceOverlay(part, faceRange, this.faceHoverMesh);
  }

  primaryFace() {
    return this.selectedFaces[0] || null;
  }

  // ---- Sub-element: Edge Selection ----

  selectEdge(part, edgeData, additive = false) {
    if (!additive) {
      this.selectedEdges = [];
    }

    const existingIdx = this.selectedEdges.findIndex(
      (e) => e.part === part && e.topoId === edgeData.topoId
    );

    if (existingIdx !== -1) {
      if (additive) this.selectedEdges.splice(existingIdx, 1);
    } else {
      this.selectedEdges.push({
        part,
        edgeData,
        topoId: edgeData.topoId,
        metadata: edgeData
      });
      if (!this.selected.includes(part)) {
        this.select(part, false);
      }
    }

    this._updateEdgeVisuals();
    this.onChange(this.selected);
  }

  hoverEdge(part, edgeData) {
    if (!part || !edgeData) {
      this.hoveredEdge = null;
      this.edgeHoverLine.visible = false;
      return;
    }
    this.hoveredEdge = { part, edgeData };
    this._renderEdgeOverlay(part, edgeData, this.edgeHoverLine);
  }

  primaryEdge() {
    return this.selectedEdges[0] || null;
  }

  clearSubSelections(notify = true) {
    this.selectedFaces = [];
    this.selectedEdges = [];
    this.hoveredFace = null;
    this.hoveredEdge = null;
    this.faceSelectMesh.visible = false;
    this.faceHoverMesh.visible = false;
    this.edgeSelectLine.visible = false;
    this.edgeHoverLine.visible = false;
    if (notify) this.onChange(this.selected);
  }

  // ---- Overlay Mesh Builders ----

  _updateFaceVisuals() {
    const primary = this.primaryFace();
    if (!primary) {
      this.faceSelectMesh.visible = false;
      return;
    }
    this._renderFaceOverlay(primary.part, primary.faceRange, this.faceSelectMesh);
  }

  _renderFaceOverlay(part, faceRange, targetMesh) {
    if (!part || !part.mesh || !part.mesh.geometry) {
      targetMesh.visible = false;
      return;
    }

    const geo = part.mesh.geometry;
    const posAttr = geo.attributes.position;
    const indexAttr = geo.index;
    if (!posAttr) {
      targetMesh.visible = false;
      return;
    }

    const vertices = [];
    part.object3D.updateWorldMatrix(true, false);
    const mw = part.object3D.matrixWorld;

    const start = faceRange.startIndex || (faceRange.startTriangle * 3) || 0;
    const count = faceRange.indexCount || (faceRange.triangleCount * 3) || 0;

    const v = new THREE.Vector3();

    if (indexAttr) {
      for (let i = start; i < start + count; i++) {
        const vi = indexAttr.getX(i);
        v.fromBufferAttribute(posAttr, vi).applyMatrix4(mw);
        vertices.push(v.x, v.y, v.z);
      }
    } else {
      for (let i = start; i < start + count; i++) {
        v.fromBufferAttribute(posAttr, i).applyMatrix4(mw);
        vertices.push(v.x, v.y, v.z);
      }
    }

    if (vertices.length === 0) {
      targetMesh.visible = false;
      return;
    }

    targetMesh.geometry.dispose();
    const highlightGeo = new THREE.BufferGeometry();
    highlightGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    highlightGeo.computeVertexNormals();

    targetMesh.geometry = highlightGeo;
    targetMesh.position.set(0, 0, 0);
    targetMesh.rotation.set(0, 0, 0);
    targetMesh.scale.set(1, 1, 1);
    targetMesh.visible = true;
  }

  _updateEdgeVisuals() {
    const primary = this.primaryEdge();
    if (!primary) {
      this.edgeSelectLine.visible = false;
      return;
    }
    this._renderEdgeOverlay(primary.part, primary.edgeData, this.edgeSelectLine);
  }

  _renderEdgeOverlay(part, edgeData, targetLine) {
    if (!part || !edgeData || !edgeData.polyline || edgeData.polyline.length < 2) {
      targetLine.visible = false;
      return;
    }

    part.object3D.updateWorldMatrix(true, false);
    const mw = part.object3D.matrixWorld;

    const pts = edgeData.polyline.map(([x, y, z]) => {
      const v = new THREE.Vector3(x, y, z);
      v.applyMatrix4(mw);
      return v;
    });

    targetLine.geometry.dispose();
    targetLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    targetLine.position.set(0, 0, 0);
    targetLine.rotation.set(0, 0, 0);
    targetLine.scale.set(1, 1, 1);
    targetLine.visible = true;
  }

  _highlight(part, on) {
    part.object3D.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        if (on) {
          obj.userData._prevEmissive = obj.material.emissive ? obj.material.emissive.getHex() : null;
          if (obj.material.emissive) obj.material.emissive.setHex(0x2c72a8);
        } else if (obj.material.emissive) {
          obj.material.emissive.setHex(obj.userData._prevEmissive ?? 0x000000);
        }
      }
    });
  }
}
