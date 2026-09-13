import * as THREE from 'three';
import { ConstraintSolver2D } from './constraint-solver.js';

/**
 * Encapsulates an arbitrary 2D work plane in 3D space.
 * Provides orthonormal basis (uAxis, vAxis, normal) and isometry between
 * 2D sketch coordinates (u, v) and 3D world coordinates.
 */
export class SketchPlane {
  constructor(name, origin, uAxis, vAxis, normal) {
    this.name = name;
    this.origin = origin.clone();
    this.uAxis = uAxis.clone().normalize();
    this.vAxis = vAxis.clone().normalize();
    this.normal = normal.clone().normalize();
    this.threePlane = new THREE.Plane().setFromNormalAndCoplanarPoint(this.normal, this.origin);
  }

  /** Convert 3D world point to 2D local plane coordinates (u, v) */
  to2D(point3D) {
    const diff = new THREE.Vector3().subVectors(point3D, this.origin);
    return {
      u: diff.dot(this.uAxis),
      v: diff.dot(this.vAxis)
    };
  }

  /** Convert 2D local plane coordinates (u, v) to 3D world point */
  to3D(u, v) {
    return new THREE.Vector3()
      .copy(this.origin)
      .addScaledVector(this.uAxis, u)
      .addScaledVector(this.vAxis, v);
  }

  /** Returns the 4x4 transform matrix from local plane space to world space */
  getMatrix() {
    const m = new THREE.Matrix4();
    m.makeBasis(this.uAxis, this.vAxis, this.normal);
    m.setPosition(this.origin);
    return m;
  }
}

/** Factory for standard Inventor origin planes */
export function createStandardPlane(type = 'XY', offset = 0) {
  if (type === 'XZ') {
    // Top / Ground plane
    return new SketchPlane(
      'XZ Plane',
      new THREE.Vector3(0, offset, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 1, 0)
    );
  }
  if (type === 'YZ') {
    // Right / Side plane
    return new SketchPlane(
      'YZ Plane',
      new THREE.Vector3(offset, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(1, 0, 0)
    );
  }
  // Default: XY Plane (Front)
  return new SketchPlane(
    'XY Plane',
    new THREE.Vector3(0, 0, offset),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1)
  );
}

/** Factory for sketch plane from a planar mesh face hit or topological faceRange */
export function createPlaneFromFace(target, faceRange = null) {
  let normal, origin, name, part = null, faceId = null;

  if (target && target.object3D && faceRange) {
    // Called with (part, faceRange)
    part = target;
    faceId = faceRange.faceId || faceRange.topoId;
    part.object3D.updateWorldMatrix(true, false);
    const worldMatrix = part.object3D.matrixWorld;

    const localNormal = new THREE.Vector3(...(faceRange.normal || [0, 1, 0]));
    normal = localNormal.clone().transformDirection(worldMatrix).normalize();

    const localCentroid = new THREE.Vector3(...(faceRange.centroid || [0, 0, 0]));
    origin = localCentroid.clone().applyMatrix4(worldMatrix);
    name = `${part.name || 'Part'} [${faceId}]`;
  } else if (target && target.face) {
    // Called with raycast hit
    const hit = target;
    normal = hit.face.normal.clone();
    hit.object.updateWorldMatrix(true, false);
    normal.transformDirection(hit.object.matrixWorld).normalize();
    origin = hit.point.clone();
    name = 'Face Plane';
  } else {
    return createStandardPlane('XY', 0);
  }

  // Choose an intuitive u-axis orthogonal to normal
  let u = new THREE.Vector3(1, 0, 0);
  if (Math.abs(normal.dot(u)) > 0.85) {
    u = new THREE.Vector3(0, 1, 0);
    if (Math.abs(normal.dot(u)) > 0.85) {
      u = new THREE.Vector3(0, 0, 1);
    }
  }
  const v = new THREE.Vector3().crossVectors(normal, u).normalize();
  u.crossVectors(v, normal).normalize();

  const sp = new SketchPlane(name, origin, u, v, normal);
  sp.targetPart = part;
  sp.targetFaceId = faceId;
  return sp;
}

function makeDimensionSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 72;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  if (ctx.roundRect) ctx.roundRect(6, 6, 244, 60, 10);
  else ctx.rect(6, 6, 244, 60);
  ctx.fill();

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 26px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 36);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(16, 4.5, 1);
  return sprite;
}

function makeGlyphSprite(char, bgColor = '#0284c7') {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(char, 32, 34);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(4, 4, 1);
  return sprite;
}

/**
 * A SketchSession lets the user draw a closed 2D profile on any
 * work plane (XY, XZ, YZ, or custom face plane) by clicking points,
 * and maintains a 2D geometric and dimensional constraint solver.
 */
export class SketchSession {
  constructor(scene, plane = 'XY') {
    this.scene = scene;

    if (typeof plane === 'string') {
      this.sketchPlane = createStandardPlane(plane, 0);
    } else if (plane instanceof SketchPlane) {
      this.sketchPlane = plane;
    } else {
      // Legacy fallback (number planeZ)
      this.sketchPlane = createStandardPlane('XY', typeof plane === 'number' ? plane : 0);
    }

    this.tool = 'line';
    this.points = []; // Committed 3D points on the plane
    this.closed = false;
    this.solver = new ConstraintSolver2D();
    this.lastSolveResult = { dof: 0, status: 'under_constrained', conflictingConstraints: [] };
    this.draggedPointId = null;
    this.targetPart = this.sketchPlane.targetPart || null;
    this.targetFaceId = this.sketchPlane.targetFaceId || null;
    this.referenceGeometry = []; // Array of { id, pAId, pBId, start2D, end2D, pts3D, topoId }

    this.group = new THREE.Group();
    this.group.name = 'sketch-session-visuals';
    this.scene.add(this.group);

    this._createSketchGrid();
  }

  _createSketchGrid() {
    // Localized grid helper oriented to the sketch plane
    const gridHelper = new THREE.GridHelper(200, 20, 0xf59e0b, 0x475569);
    gridHelper.material.opacity = 0.35;
    gridHelper.material.transparent = true;

    // Default GridHelper lies in XZ plane (normal +Y)
    // Rotate to match this.sketchPlane.normal
    const defaultNormal = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(defaultNormal, this.sketchPlane.normal);
    gridHelper.quaternion.copy(q);
    gridHelper.position.copy(this.sketchPlane.origin);

    this.group.add(gridHelper);
  }

  setTool(tool) {
    this.tool = tool;
    if (tool !== 'project' && !this.closed) {
      this.points = [];
      this.solver.clear();
      this.lastSolveResult = { dof: 0, status: 'under_constrained', conflictingConstraints: [] };
      this.draggedPointId = null;
      // Re-register reference points into cleared solver
      for (const ref of this.referenceGeometry) {
        this.solver.addPoint(ref.pAId, ref.start2D.u, ref.start2D.v, true);
        this.solver.addPoint(ref.pBId, ref.end2D.u, ref.end2D.v, true);
      }
    }
    this._redraw();
  }

  /**
   * Projects a 3D model edge onto the active sketch plane ("Convert Entities" / "Project Geometry").
   * Adds fixed reference endpoints to the constraint solver and stores projected segment.
   */
  projectEdge(edgeData, partMatrix = new THREE.Matrix4()) {
    if (!edgeData || !edgeData.polyline || edgeData.polyline.length < 2) return null;
    const pts3D = edgeData.polyline.map((p) => new THREE.Vector3(...p).applyMatrix4(partMatrix));
    const start2D = this.sketchPlane.to2D(pts3D[0]);
    const end2D = this.sketchPlane.to2D(pts3D[pts3D.length - 1]);

    const idx = this.referenceGeometry.length;
    const pAId = `ref_${idx}_A`;
    const pBId = `ref_${idx}_B`;

    this.solver.addPoint(pAId, start2D.u, start2D.v, true);
    this.solver.addPoint(pBId, end2D.u, end2D.v, true);

    const refItem = {
      id: `ref_edge_${idx}`,
      pAId,
      pBId,
      start2D,
      end2D,
      pts3D,
      topoId: edgeData.topoId
    };

    this.referenceGeometry.push(refItem);
    this._redraw();
    return refItem;
  }

  /**
   * Projects all perimeter boundary edges of a 3D face into the active sketch plane.
   */
  projectFace(faceRange, part) {
    if (!part || !part.topology || !part.topology.edges) return [];
    part.object3D.updateWorldMatrix(true, false);
    const partMatrix = part.object3D.matrixWorld;
    const faceId = faceRange.faceId || faceRange.topoId;
    const adjEdges = part.topology.edges.filter(
      (e) => e.adjacentFaceIds && e.adjacentFaceIds.includes(faceId)
    );
    const projected = [];
    for (const edge of adjEdges) {
      const item = this.projectEdge(edge, partMatrix);
      if (item) projected.push(item);
    }
    return projected;
  }

  /** Project raycaster to sketch plane */
  raycastToPlane(raycaster) {
    const target = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(this.sketchPlane.threePlane, target);
    return hit;
  }

  addPoint(point) {
    if (this.tool === 'line') {
      if (this.points.length >= 3) {
        const start = this.points[0];
        if (start.distanceTo(point) < 6) {
          // Close profile and register in solver
          this.solver.clear();
          const n = this.points.length;
          for (let i = 0; i < n; i++) {
            const { u, v } = this.sketchPlane.to2D(this.points[i]);
            this.solver.addPoint('p' + i, u, v, i === 0);
          }

          for (let i = 0; i < n; i++) {
            const next = (i + 1) % n;
            const pA = this.solver.getPoint('p' + i);
            const pB = this.solver.getPoint('p' + next);
            const dist = Math.hypot(pB.u - pA.u, pB.v - pA.v);
            this.solver.addDistanceConstraint('p' + i, 'p' + next, dist);

            // Auto-detect horizontal / vertical if nearly aligned
            if (Math.abs(pB.v - pA.v) < 2) {
              this.solver.addHorizontalConstraint('p' + i, 'p' + next);
            } else if (Math.abs(pB.u - pA.u) < 2) {
              this.solver.addVerticalConstraint('p' + i, 'p' + next);
            }
          }

          this.lastSolveResult = this.solver.solve();
          this.syncPointsFromSolver();
          this.closed = true;
          this._redraw();
          return true; // Profile closed
        }
      }
      this.points.push(point);
      this._redraw();
      return false;
    }

    if (this.tool === 'rect') {
      this.points.push(point);
      if (this.points.length === 2) {
        const [pA, pB] = this.points;
        const a2D = this.sketchPlane.to2D(pA);
        const b2D = this.sketchPlane.to2D(pB);

        this.solver.clear();
        this.solver.addPoint('p0', a2D.u, a2D.v, true); // Origin anchor
        this.solver.addPoint('p1', b2D.u, a2D.v);
        this.solver.addPoint('p2', b2D.u, b2D.v);
        this.solver.addPoint('p3', a2D.u, b2D.v);

        // Parametric geometric constraints
        this.solver.addHorizontalConstraint('p0', 'p1');
        this.solver.addVerticalConstraint('p1', 'p2');
        this.solver.addHorizontalConstraint('p3', 'p2');
        this.solver.addVerticalConstraint('p0', 'p3');

        // Parametric dimensional constraints (Width & Height)
        const width = Math.max(1, Math.abs(b2D.u - a2D.u));
        const height = Math.max(1, Math.abs(b2D.v - a2D.v));
        this.solver.addDistanceConstraint('p0', 'p1', width);
        this.solver.addDistanceConstraint('p0', 'p3', height);

        this.lastSolveResult = this.solver.solve();
        this.syncPointsFromSolver();
        this.closed = true;
        this._redraw();
        return true;
      }
      this._redraw();
      return false;
    }

    if (this.tool === 'circle') {
      this.points.push(point);
      if (this.points.length === 2) {
        const [center, edge] = this.points;
        const radius = Math.max(1, center.distanceTo(edge));
        const center2D = this.sketchPlane.to2D(center);

        this.solver.clear();
        this.solver.addPoint('center', center2D.u, center2D.v, true);
        this.solver.addPoint('rim', center2D.u + radius, center2D.v);
        this.solver.addDistanceConstraint('center', 'rim', radius);

        this.lastSolveResult = this.solver.solve();
        this._rebuildCirclePoints(center2D.u, center2D.v, radius);
        this.closed = true;
        this._redraw();
        return true;
      }
      this._redraw();
      return false;
    }

    return false;
  }

  _rebuildCirclePoints(cu, cv, r) {
    const segs = 48;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const angle = (i / segs) * Math.PI * 2;
      const u = cu + Math.cos(angle) * r;
      const v = cv + Math.sin(angle) * r;
      pts.push(this.sketchPlane.to3D(u, v));
    }
    this.points = pts;
  }

  syncPointsFromSolver() {
    if (this.solver.points.length >= 3) {
      this.points = this.solver.points.map((p) => this.sketchPlane.to3D(p.u, p.v));
    }
  }

  /** Update an existing dimension constraint and re-solve */
  setDimension(pAId, pBId, newDistance) {
    if (this.tool === 'circle') {
      const c = this.solver.constraints.find((cn) => cn.type === 'distance');
      if (c) {
        c.distance = newDistance;
        const center = this.solver.getPoint('center');
        if (center) {
          this._rebuildCirclePoints(center.u, center.v, newDistance);
          this._redraw();
          return;
        }
      }
    }

    this.solver.addDistanceConstraint(pAId, pBId, newDistance);
    this.lastSolveResult = this.solver.solve();
    this.syncPointsFromSolver();
    this._redraw();
    return this.lastSolveResult;
  }

  /** Apply a geometric constraint to the active sketch */
  addGeometricConstraint(type, targetPoints = null) {
    if (this.solver.points.length < 2) return this.lastSolveResult;
    const pA = targetPoints ? targetPoints[0] : 'p0';
    const pB = targetPoints ? targetPoints[1] : 'p1';

    if (type === 'horizontal') this.solver.addHorizontalConstraint(pA, pB);
    else if (type === 'vertical') this.solver.addVerticalConstraint(pA, pB);
    else if (type === 'coincident' && targetPoints && targetPoints.length >= 2) {
      this.solver.addCoincidentConstraint(targetPoints[0], targetPoints[1]);
    } else if (type === 'fix') {
      this.solver.addFixConstraint(pA);
    } else if (type === 'perpendicular' && this.solver.points.length >= 4) {
      this.solver.addPerpendicularConstraint('p0', 'p1', 'p1', 'p2');
    } else if (type === 'parallel' && this.solver.points.length >= 4) {
      this.solver.addParallelConstraint('p0', 'p1', 'p2', 'p3');
    } else if (type === 'equal' && this.solver.points.length >= 4) {
      this.solver.addEqualLengthConstraint('p0', 'p1', 'p2', 'p3');
    } else if (type === 'midpoint' && targetPoints && targetPoints.length >= 3) {
      this.solver.addMidpointConstraint(targetPoints[0], targetPoints[1], targetPoints[2]);
    }

    this.lastSolveResult = this.solver.solve();
    this.syncPointsFromSolver();
    this._redraw();
    return this.lastSolveResult;
  }

  getDOFInfo() {
    return this.lastSolveResult || { dof: 0, status: 'under_constrained', conflictingConstraints: [] };
  }

  findNearestPoint(u, v, threshold = 8) {
    let bestPt = null;
    let bestDist = threshold;
    for (const p of this.solver.points) {
      const d = Math.hypot(p.u - u, p.v - v);
      if (d < bestDist) {
        bestDist = d;
        bestPt = p;
      }
    }
    return bestPt;
  }

  startDragging(pointId) {
    this.draggedPointId = pointId;
  }

  dragTo(u, v) {
    if (!this.draggedPointId) return;
    this.solver.setDragGoal(this.draggedPointId, u, v, 0.2);
    this.lastSolveResult = this.solver.solve(30, 1e-3);
    this.syncPointsFromSolver();
    this._redraw();
  }

  stopDragging() {
    if (!this.draggedPointId) return;
    this.solver.clearDragGoals();
    this.lastSolveResult = this.solver.solve();
    this.syncPointsFromSolver();
    this.draggedPointId = null;
    this._redraw();
  }

  isComplete() {
    return this.closed && this.points.length >= 3;
  }

  /** Returns 2D points array in local plane coordinates (u, v) */
  toPoints2D() {
    if (this.closed && this.solver.points.length >= 3 && this.tool !== 'circle') {
      return this.solver.points.map((p) => [p.u, p.v]);
    }
    return this.points.map((p) => {
      const { u, v } = this.sketchPlane.to2D(p);
      return [u, v];
    });
  }

  /** Returns a THREE.Shape in local 2D space for ExtrudeGeometry */
  toShape() {
    const shape = new THREE.Shape();
    const pts2D = this.toPoints2D();
    pts2D.forEach(([u, v], i) => {
      if (i === 0) shape.moveTo(u, v);
      else shape.lineTo(u, v);
    });
    shape.closePath();
    return shape;
  }

  clear() {
    this.points = [];
    this.closed = false;
    this.solver.clear();
    this.lastSolveResult = { dof: 0, status: 'under_constrained', conflictingConstraints: [] };
    this.draggedPointId = null;
    this._redraw();
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }

  _redraw() {
    // Remove old sketch lines and points (keep grid at index 0)
    while (this.group.children.length > 1) {
      const c = this.group.children.pop();
      c.geometry?.dispose();
      c.material?.dispose();
    }

    // Render projected reference geometry (Inventor/SolidWorks gold dashed lines)
    if (this.referenceGeometry && this.referenceGeometry.length > 0) {
      for (const ref of this.referenceGeometry) {
        const geo = new THREE.BufferGeometry().setFromPoints(ref.pts3D);
        const mat = new THREE.LineDashedMaterial({
          color: 0xf59e0b,
          dashSize: 3,
          gapSize: 2,
          linewidth: 2.2
        });
        const refLine = new THREE.Line(geo, mat);
        refLine.computeLineDistances();
        refLine.userData = { isReferenceGeometry: true, refItem: ref };
        this.group.add(refLine);

        // Reference end points
        const refDotGeo = new THREE.SphereGeometry(1.6, 8, 8);
        const refDotMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
        for (const pt3D of [ref.pts3D[0], ref.pts3D[ref.pts3D.length - 1]]) {
          const dot = new THREE.Mesh(refDotGeo, refDotMat);
          dot.position.copy(pt3D);
          dot.userData = { isReferenceVertex: true, refItem: ref };
          this.group.add(dot);
        }
      }
    }

    if (this.points.length === 0) return;

    // SolidWorks-style color coding based on constraint status
    let strokeColor = 0x38bdf8; // SolidWorks under-constrained electric blue
    if (this.lastSolveResult?.status === 'over_constrained') {
      strokeColor = 0xef4444; // Warning Red (conflicting)
    } else if (this.lastSolveResult?.status === 'fully_constrained') {
      strokeColor = 0x1e293b; // Fully constrained Dark Slate / Black
    } else if (!this.closed) {
      strokeColor = 0xffb020; // In-progress drawing Amber
    }

    const material = new THREE.LineBasicMaterial({ color: strokeColor, linewidth: 2.8 });
    const pts = this.closed ? [...this.points, this.points[0]] : this.points;
    const geometry = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geometry, material);
    this.group.add(line);

    // Vertex dots (interactive clickable anchor spheres)
    const dotColor = strokeColor === 0x1e293b ? 0x475569 : strokeColor;
    const dotGeo = new THREE.SphereGeometry(2.0, 10, 10);
    const dotMat = new THREE.MeshBasicMaterial({ color: dotColor });
    for (let i = 0; i < this.points.length; i++) {
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.copy(this.points[i]);
      dot.userData = {
        isSketchVertex: true,
        pointId: 'p' + i,
        point: this.points[i]
      };
      this.group.add(dot);
    }

    if (!this.closed) return;

    const conflictingSet = new Set((this.lastSolveResult?.conflictingConstraints || []).map((c) => c.id));

    // Draw constraint glyphs (H, V, ⊥, ∥, =, •, 🔒)
    for (const c of this.solver.constraints) {
      const isConflicted = conflictingSet.has(c.id);
      let char = '';
      let color = isConflicted ? '#ef4444' : '#0284c7';
      let pos3D = null;

      if (c.type === 'horizontal' || c.type === 'vertical') {
        const ptA = this.solver.getPoint(c.pA);
        const ptB = this.solver.getPoint(c.pB);
        if (ptA && ptB) {
          pos3D = this.sketchPlane.to3D((ptA.u + ptB.u) / 2, (ptA.v + ptB.v) / 2);
          char = c.type === 'horizontal' ? 'H' : 'V';
          color = isConflicted ? '#ef4444' : '#0284c7';
        }
      } else if (c.type === 'perpendicular') {
        const ptA = this.solver.getPoint(c.s1A);
        const ptB = this.solver.getPoint(c.s1B);
        if (ptA && ptB) {
          pos3D = this.sketchPlane.to3D((ptA.u + ptB.u) / 2, (ptA.v + ptB.v) / 2);
          char = '⊥';
          color = isConflicted ? '#ef4444' : '#059669';
        }
      } else if (c.type === 'parallel') {
        const ptA = this.solver.getPoint(c.s1A);
        const ptB = this.solver.getPoint(c.s1B);
        if (ptA && ptB) {
          pos3D = this.sketchPlane.to3D((ptA.u + ptB.u) / 2, (ptA.v + ptB.v) / 2);
          char = '∥';
          color = isConflicted ? '#ef4444' : '#d97706';
        }
      } else if (c.type === 'equal_length') {
        const ptA = this.solver.getPoint(c.s1A);
        const ptB = this.solver.getPoint(c.s1B);
        if (ptA && ptB) {
          pos3D = this.sketchPlane.to3D((ptA.u + ptB.u) / 2, (ptA.v + ptB.v) / 2);
          char = '=';
          color = isConflicted ? '#ef4444' : '#7c3aed';
        }
      } else if (c.type === 'coincident') {
        const ptA = this.solver.getPoint(c.pA);
        if (ptA) {
          pos3D = this.sketchPlane.to3D(ptA.u, ptA.v);
          char = '•';
          color = isConflicted ? '#ef4444' : '#0284c7';
        }
      } else if (c.type === 'midpoint') {
        const ptM = this.solver.getPoint(c.pM);
        if (ptM) {
          pos3D = this.sketchPlane.to3D(ptM.u, ptM.v);
          char = 'M';
          color = isConflicted ? '#ef4444' : '#0d9488';
        }
      } else if (c.type === 'fix') {
        const ptA = this.solver.getPoint(c.pA);
        if (ptA) {
          pos3D = this.sketchPlane.to3D(ptA.u, ptA.v);
          char = '🔒';
          color = isConflicted ? '#ef4444' : '#475569';
        }
      }

      if (pos3D && char) {
        const glyph = makeGlyphSprite(isConflicted ? '✕' : char, color);
        glyph.position.copy(pos3D);
        glyph.userData = {
          isConstraintGlyph: true,
          constraint: c,
          isConflicted
        };
        this.group.add(glyph);
      }
    }

    // Draw dimension badges and leader lines
    for (const c of this.solver.constraints) {
      if (c.type === 'distance') {
        const ptA = this.solver.getPoint(c.pA);
        const ptB = this.solver.getPoint(c.pB);
        if (!ptA || !ptB) continue;

        const isConflicted = conflictingSet.has(c.id);
        const midU = (ptA.u + ptB.u) / 2;
        const midV = (ptA.v + ptB.v) / 2;
        const du = ptB.u - ptA.u;
        const dv = ptB.v - ptA.v;
        const len = Math.hypot(du, dv) || 1;
        const offset = 8;
        const badgeU = midU - (dv / len) * offset;
        const badgeV = midV + (du / len) * offset;

        const badgePos = this.sketchPlane.to3D(badgeU, badgeV);
        const midPos = this.sketchPlane.to3D(midU, midV);

        const sprite = makeDimensionSprite(`${c.distance.toFixed(1)} mm`);
        sprite.position.copy(badgePos);
        sprite.userData = {
          isDimensionBadge: true,
          constraint: c,
          pA: c.pA,
          pB: c.pB,
          distance: c.distance,
          isConflicted
        };
        this.group.add(sprite);

        // Leader line connecting segment midpoint to dimension badge
        const leaderColor = isConflicted ? 0xef4444 : 0x38bdf8;
        const leaderGeo = new THREE.BufferGeometry().setFromPoints([midPos, badgePos]);
        const leaderMat = new THREE.LineBasicMaterial({ color: leaderColor, opacity: 0.7, transparent: true });
        const leaderLine = new THREE.Line(leaderGeo, leaderMat);
        this.group.add(leaderLine);
      }
    }
  }
}


