import * as THREE from 'three';
import { measureEntities, formatDistance, formatAngle } from './measure-engine.js';

/**
 * CADLite 3D Interactive Measure Tool
 *
 * Modeled after Dassault Systèmes SolidWorks eDrawings measurement workflow:
 * - Smart snapping to B-Rep vertices, edges (linear & circular), and planar/cylindrical faces
 * - Dual-entity measurement with real-time 3D dimension line
 * - Signature eDrawings RGB orthogonal Delta X (Red), Delta Y (Green), Delta Z (Blue) bounding lines
 * - Dynamic 3D-to-2D floating callout badge on the viewport
 */
export class MeasureTool {
  constructor(viewport, assembly, options = {}) {
    this.viewport = viewport;
    this.assembly = assembly;
    this.active = false;
    this.filterMode = 'all'; // 'all' | 'vertex' | 'edge' | 'face'
    this.units = 'mm';
    this.showDeltaLines = true;
    this.decimals = 2;

    this.entity1 = null;
    this.entity2 = null;
    this.currentResult = null;
    this.hoverCandidate = null;

    this.onMeasureChange = options.onMeasureChange || (() => {});
    this.onStateChange = options.onStateChange || (() => {});

    // Floating callout DOM element
    this.calloutEl = options.calloutEl || null;

    // Three.js visual overlays
    this.group = new THREE.Group();
    this.group.name = 'measure_overlays';
    this.group.visible = false;
    this.viewport.scene.add(this.group);

    this._initVisuals();

    // Attach to viewport render loop to update screen coordinates of 3D callout
    this.viewport.onRender(() => this._updateCalloutPosition());
  }

  _initVisuals() {
    // 1. Picked Point Markers
    const sphereGeo = new THREE.SphereGeometry(2.5, 16, 16);

    // Marker 1: Cyan
    const mat1 = new THREE.MeshBasicMaterial({ color: 0x00e5ff, depthTest: false });
    this.marker1 = new THREE.Mesh(sphereGeo, mat1);
    this.marker1.visible = false;
    this.marker1.renderOrder = 999;
    this.group.add(this.marker1);

    // Marker 2: Amber
    const mat2 = new THREE.MeshBasicMaterial({ color: 0xff9100, depthTest: false });
    this.marker2 = new THREE.Mesh(sphereGeo, mat2);
    this.marker2.visible = false;
    this.marker2.renderOrder = 999;
    this.group.add(this.marker2);

    // Hover snap point: Bright Sky Blue
    const hoverMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, depthTest: false });
    this.hoverMarker = new THREE.Mesh(new THREE.SphereGeometry(2.0, 16, 16), hoverMat);
    this.hoverMarker.visible = false;
    this.hoverMarker.renderOrder = 998;
    this.group.add(this.hoverMarker);

    // 2. Main Dimension Leader Line
    const dimMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 3,
      depthTest: false
    });
    this.dimLine = new THREE.Line(new THREE.BufferGeometry(), dimMat);
    this.dimLine.visible = false;
    this.dimLine.renderOrder = 995;
    this.group.add(this.dimLine);

    // 3. Orthogonal Delta Lines (Classic eDrawings RGB coordinate delta box)
    this.deltaLineX = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({
      color: 0xef4444, // Red
      linewidth: 2,
      scale: 1,
      dashSize: 3,
      gapSize: 2,
      depthTest: false
    }));
    this.deltaLineX.visible = false;
    this.deltaLineX.renderOrder = 994;
    this.group.add(this.deltaLineX);

    this.deltaLineY = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({
      color: 0x22c55e, // Green
      linewidth: 2,
      scale: 1,
      dashSize: 3,
      gapSize: 2,
      depthTest: false
    }));
    this.deltaLineY.visible = false;
    this.deltaLineY.renderOrder = 994;
    this.group.add(this.deltaLineY);

    this.deltaLineZ = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({
      color: 0x3b82f6, // Blue
      linewidth: 2,
      scale: 1,
      dashSize: 3,
      gapSize: 2,
      depthTest: false
    }));
    this.deltaLineZ.visible = false;
    this.deltaLineZ.renderOrder = 994;
    this.group.add(this.deltaLineZ);

    // 4. Entity Highlight Lines / Meshes
    this.edgeHighlight1 = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      linewidth: 4,
      depthTest: false
    }));
    this.edgeHighlight1.visible = false;
    this.edgeHighlight1.renderOrder = 996;
    this.group.add(this.edgeHighlight1);

    this.edgeHighlight2 = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
      color: 0xff9100,
      linewidth: 4,
      depthTest: false
    }));
    this.edgeHighlight2.visible = false;
    this.edgeHighlight2.renderOrder = 996;
    this.group.add(this.edgeHighlight2);

    this.faceHighlight1 = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3
    }));
    this.faceHighlight1.visible = false;
    this.group.add(this.faceHighlight1);

    this.faceHighlight2 = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
      color: 0xff9100,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3
    }));
    this.faceHighlight2.visible = false;
    this.group.add(this.faceHighlight2);
  }

  activate() {
    this.active = true;
    this.group.visible = true;
    this.clear();
    this.onStateChange({ active: true, filterMode: this.filterMode, units: this.units });
  }

  deactivate() {
    this.active = false;
    this.group.visible = false;
    this.clear();
    if (this.calloutEl) this.calloutEl.classList.add('hidden');
    this.onStateChange({ active: false, filterMode: this.filterMode, units: this.units });
  }

  toggle() {
    if (this.active) this.deactivate();
    else this.activate();
  }

  setFilterMode(mode) {
    this.filterMode = mode;
    this.clear();
    this.onStateChange({ active: this.active, filterMode: this.filterMode, units: this.units });
  }

  setUnits(units) {
    this.units = units;
    this._recompute();
    this.onStateChange({ active: this.active, filterMode: this.filterMode, units: this.units });
  }

  setShowDeltaLines(show) {
    this.showDeltaLines = !!show;
    this._updateVisualOverlays();
  }

  clear() {
    this.entity1 = null;
    this.entity2 = null;
    this.currentResult = null;
    this.hoverCandidate = null;

    this.marker1.visible = false;
    this.marker2.visible = false;
    this.hoverMarker.visible = false;
    this.dimLine.visible = false;
    this.deltaLineX.visible = false;
    this.deltaLineY.visible = false;
    this.deltaLineZ.visible = false;
    this.edgeHighlight1.visible = false;
    this.edgeHighlight2.visible = false;
    this.faceHighlight1.visible = false;
    this.faceHighlight2.visible = false;

    if (this.calloutEl) {
      this.calloutEl.classList.add('hidden');
    }

    this.onMeasureChange(null);
  }

  // ---------------------------------------------------------------------
  // Raycasting & Snapping
  // ---------------------------------------------------------------------

  handlePointerMove(event) {
    if (!this.active) return;
    const raycaster = this.viewport.raycasterFromEvent(event);
    const candidate = this._findCandidateUnderCursor(raycaster, event);

    this.hoverCandidate = candidate;
    if (candidate && candidate.worldPoint) {
      this.hoverMarker.position.set(...candidate.worldPoint);
      this.hoverMarker.visible = true;
    } else {
      this.hoverMarker.visible = false;
    }
  }

  handlePointerDown(event) {
    if (!this.active || event.button !== 0) return false;

    const raycaster = this.viewport.raycasterFromEvent(event);
    const candidate = this.hoverCandidate || this._findCandidateUnderCursor(raycaster, event);

    if (!candidate) {
      // Clicking empty space clears current measurement
      this.clear();
      return true;
    }

    if (!this.entity1) {
      // Pick Entity 1
      this.entity1 = candidate;
      this._recompute();
      return true;
    } else if (!this.entity2) {
      // Pick Entity 2
      this.entity2 = candidate;
      this._recompute();
      return true;
    } else {
      // Both entities already picked -> start new measurement with this click
      this.clear();
      this.entity1 = candidate;
      this._recompute();
      return true;
    }
  }

  _findCandidateUnderCursor(raycaster, event) {
    const parts = this.assembly.allParts();
    if (!parts || parts.length === 0) return null;

    const filter = this.filterMode;

    // 1. Try Vertex Snapping (Prioritize sharp corners if in 'all' or 'vertex' mode)
    if (filter === 'all' || filter === 'vertex') {
      const vertHit = this._snapToNearestVertex(event, parts);
      if (vertHit) return vertHit;
    }

    // 2. Try Edge Snapping (Linear & Circular)
    if (filter === 'all' || filter === 'edge') {
      raycaster.params.Line = { threshold: 8 };
      const modelHits = raycaster.intersectObjects(this.assembly.root.object3D.children, true);
      const edgeHit = modelHits.find((h) => h.object.userData && h.object.userData.isCadEdge);
      if (edgeHit && edgeHit.object.userData.edgeData) {
        const part = this.assembly.findByObject3D(edgeHit.object.parent);
        if (part) {
          const edgeData = edgeHit.object.userData.edgeData;
          return {
            type: 'edge',
            part,
            edgeData,
            topoId: edgeData.topoId,
            worldPoint: [edgeHit.point.x, edgeHit.point.y, edgeHit.point.z]
          };
        }
      }
    }

    // 3. Try Face Snapping (Planar & Cylindrical)
    if (filter === 'all' || filter === 'face') {
      const modelHits = raycaster.intersectObjects(this.assembly.root.object3D.children, true);
      const faceHit = modelHits.find((h) => h.object.isMesh && h.faceIndex !== undefined && !h.object.userData.isOverlay);
      if (faceHit) {
        const part = this.assembly.findByObject3D(faceHit.object);
        if (part) {
          const faceRange = part.getFaceByTriangleIndex(faceHit.faceIndex);
          if (faceRange) {
            return {
              type: 'face',
              part,
              faceRange,
              topoId: faceRange.faceId,
              worldPoint: [faceHit.point.x, faceHit.point.y, faceHit.point.z]
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Snaps to the nearest B-Rep vertex or edge endpoint within screen pixel threshold.
   */
  _snapToNearestVertex(event, parts) {
    const canvasRect = this.viewport.canvas.getBoundingClientRect();
    const mouseScreenX = event.clientX - canvasRect.left;
    const mouseScreenY = event.clientY - canvasRect.top;
    const camera = this.viewport.camera;
    const width = canvasRect.width;
    const height = canvasRect.height;

    let nearestVert = null;
    let minScreenDistSq = 14 * 14; // 14px snap radius

    for (const part of parts) {
      if (!part.visible || !part.mesh) continue;
      const vertices = part.getVertices();
      if (!vertices || vertices.length === 0) continue;

      part.object3D.updateWorldMatrix(true, false);
      const mw = part.object3D.matrixWorld;

      for (const v of vertices) {
        const wp = new THREE.Vector3(...v.point).applyMatrix4(mw);
        const pCopy = wp.clone().project(camera);

        // Discard behind camera
        if (pCopy.z > 1.0) continue;

        const sx = ((pCopy.x + 1) * width) / 2;
        const sy = ((-pCopy.y + 1) * height) / 2;

        const distSq = (sx - mouseScreenX) ** 2 + (sy - mouseScreenY) ** 2;
        if (distSq < minScreenDistSq) {
          minScreenDistSq = distSq;
          nearestVert = {
            type: 'vertex',
            part,
            vertexData: v,
            topoId: v.topoId,
            worldPoint: [wp.x, wp.y, wp.z]
          };
        }
      }
    }

    return nearestVert;
  }

  // ---------------------------------------------------------------------
  // Measurement Calculation & Viewport Overlay Updates
  // ---------------------------------------------------------------------

  _recompute() {
    if (!this.entity1) {
      this.clear();
      return;
    }

    const res = measureEntities(this.entity1, this.entity2);
    this.currentResult = res;

    this._updateVisualOverlays();
    this.onMeasureChange(res);
  }

  _updateVisualOverlays() {
    const res = this.currentResult;
    if (!res) {
      this.marker1.visible = false;
      this.marker2.visible = false;
      this.dimLine.visible = false;
      this.deltaLineX.visible = false;
      this.deltaLineY.visible = false;
      this.deltaLineZ.visible = false;
      this.edgeHighlight1.visible = false;
      this.edgeHighlight2.visible = false;
      this.faceHighlight1.visible = false;
      this.faceHighlight2.visible = false;
      if (this.calloutEl) this.calloutEl.classList.add('hidden');
      return;
    }

    // 1. Entity 1 Visuals
    if (res.point1) {
      this.marker1.position.set(...res.point1);
      this.marker1.visible = true;
    } else {
      this.marker1.visible = false;
    }
    this._renderEntityHighlight(this.entity1, this.edgeHighlight1, this.faceHighlight1);

    // 2. Entity 2 Visuals
    if (this.entity2 && res.point2) {
      this.marker2.position.set(...res.point2);
      this.marker2.visible = true;
      this._renderEntityHighlight(this.entity2, this.edgeHighlight2, this.faceHighlight2);

      // Dimension Line
      const pts = [
        new THREE.Vector3(...res.point1),
        new THREE.Vector3(...res.point2)
      ];
      this.dimLine.geometry.dispose();
      this.dimLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      this.dimLine.visible = true;

      // SolidWorks / eDrawings Delta XYZ Lines
      if (this.showDeltaLines && (res.deltaX > 0.05 || res.deltaY > 0.05 || res.deltaZ > 0.05)) {
        const p1 = res.point1;
        const p2 = res.point2;

        // Path: P1 -> (P2.x, P1.y, P1.z) -> (P2.x, P2.y, P1.z) -> P2
        const cornerX = [p2[0], p1[1], p1[2]];
        const cornerY = [p2[0], p2[1], p1[2]];

        this._updateDashedLine(this.deltaLineX, p1, cornerX);
        this._updateDashedLine(this.deltaLineY, cornerX, cornerY);
        this._updateDashedLine(this.deltaLineZ, cornerY, p2);
      } else {
        this.deltaLineX.visible = false;
        this.deltaLineY.visible = false;
        this.deltaLineZ.visible = false;
      }

      // Callout Badge
      this._updateCalloutContent(res);
    } else {
      // Single entity selected
      this.marker2.visible = false;
      this.dimLine.visible = false;
      this.deltaLineX.visible = false;
      this.deltaLineY.visible = false;
      this.deltaLineZ.visible = false;
      this.edgeHighlight2.visible = false;
      this.faceHighlight2.visible = false;

      this._updateCalloutContent(res);
    }
  }

  _updateDashedLine(line, fromPt, toPt) {
    const dist = Math.hypot(toPt[0] - fromPt[0], toPt[1] - fromPt[1], toPt[2] - fromPt[2]);
    if (dist < 0.1) {
      line.visible = false;
      return;
    }
    const pts = [new THREE.Vector3(...fromPt), new THREE.Vector3(...toPt)];
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    line.computeLineDistances();
    line.visible = true;
  }

  _renderEntityHighlight(entity, targetLine, targetMesh) {
    targetLine.visible = false;
    targetMesh.visible = false;
    if (!entity || !entity.part) return;

    if (entity.type === 'edge' && entity.edgeData && entity.edgeData.polyline) {
      entity.part.object3D.updateWorldMatrix(true, false);
      const mw = entity.part.object3D.matrixWorld;
      const pts = entity.edgeData.polyline.map(([x, y, z]) => {
        return new THREE.Vector3(x, y, z).applyMatrix4(mw);
      });
      targetLine.geometry.dispose();
      targetLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      targetLine.visible = true;
    } else if (entity.type === 'face' && entity.faceRange && entity.part.mesh) {
      const geo = entity.part.mesh.geometry;
      const posAttr = geo.attributes.position;
      const indexAttr = geo.index;
      if (!posAttr) return;

      entity.part.object3D.updateWorldMatrix(true, false);
      const mw = entity.part.object3D.matrixWorld;

      const start = entity.faceRange.startIndex || (entity.faceRange.startTriangle * 3) || 0;
      const count = entity.faceRange.indexCount || (entity.faceRange.triangleCount * 3) || 0;

      const vertices = [];
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

      if (vertices.length > 0) {
        targetMesh.geometry.dispose();
        const highlightGeo = new THREE.BufferGeometry();
        highlightGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        highlightGeo.computeVertexNormals();
        targetMesh.geometry = highlightGeo;
        targetMesh.visible = true;
      }
    }
  }

  // ---------------------------------------------------------------------
  // Viewport Floating Callout Badge (eDrawings Viewport Tag)
  // ---------------------------------------------------------------------

  _updateCalloutContent(res) {
    if (!this.calloutEl) return;

    let html = '';
    const distStr = formatDistance(res.distance, this.units, this.decimals);

    if (res.type === 'point_to_point' || res.type === 'point_to_edge' || res.type === 'point_to_face' || res.type === 'edge_to_edge' || res.type === 'face_to_face' || res.type === 'circle_to_circle' || res.type === 'cylinder_to_cylinder') {
      html += `<div class="callout-main-val">${distStr}</div>`;
      if (res.normalDistance !== undefined && res.isParallel) {
        html += `<div class="callout-sub-val">Normal: ${formatDistance(res.normalDistance, this.units, this.decimals)}</div>`;
      }
      if (res.angle !== undefined) {
        html += `<div class="callout-sub-val">Angle: ${formatAngle(res.angle, 1)}</div>`;
      }
      if (res.deltaX !== undefined && this.showDeltaLines) {
        html += `<div class="callout-deltas">
          <span class="dx">ΔX ${formatDistance(res.deltaX, this.units, 1)}</span>
          <span class="dy">ΔY ${formatDistance(res.deltaY, this.units, 1)}</span>
          <span class="dz">ΔZ ${formatDistance(res.deltaZ, this.units, 1)}</span>
        </div>`;
      }
    } else if (res.type === 'single_vertex') {
      const c = res.coordinates;
      html += `<div class="callout-main-val">Vertex</div>
        <div class="callout-sub-val">[${c[0].toFixed(1)}, ${c[1].toFixed(1)}, ${c[2].toFixed(1)}]</div>`;
    } else if (res.type === 'single_edge') {
      if (res.isCircular) {
        html += `<div class="callout-main-val">R ${formatDistance(res.radius, this.units, this.decimals)} (Ø ${formatDistance(res.diameter, this.units, this.decimals)})</div>
          <div class="callout-sub-val">Arc Length: ${formatDistance(res.length, this.units, this.decimals)}</div>`;
      } else {
        html += `<div class="callout-main-val">Length: ${distStr}</div>`;
      }
    } else if (res.type === 'single_face') {
      html += `<div class="callout-main-val">${res.surfaceType.toUpperCase()} Face</div>
        <div class="callout-sub-val">Area: ${res.area ? res.area.toFixed(1) + ' mm²' : '-'}</div>`;
      if (res.isCylindrical && res.radius) {
        html += `<div class="callout-sub-val">R ${formatDistance(res.radius, this.units, this.decimals)} (Ø ${formatDistance(res.diameter, this.units, this.decimals)})</div>`;
      }
    }

    this.calloutEl.innerHTML = html;
    this.calloutEl.classList.remove('hidden');
    this._updateCalloutPosition();
  }

  _updateCalloutPosition() {
    if (!this.active || !this.calloutEl || !this.currentResult || !this.currentResult.midpoint) {
      return;
    }

    const canvasRect = this.viewport.canvas.getBoundingClientRect();
    const camera = this.viewport.camera;
    const mp = this.currentResult.midpoint;

    const v = new THREE.Vector3(...mp).project(camera);

    // If behind camera, hide callout
    if (v.z > 1.0) {
      this.calloutEl.style.display = 'none';
      return;
    }
    this.calloutEl.style.display = 'block';

    const sx = ((v.x + 1) * canvasRect.width) / 2;
    const sy = ((-v.y + 1) * canvasRect.height) / 2;

    this.calloutEl.style.left = `${Math.round(sx + 15)}px`;
    this.calloutEl.style.top = `${Math.round(sy - 15)}px`;
  }
}
