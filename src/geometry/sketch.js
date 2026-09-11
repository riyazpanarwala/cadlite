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

/** Factory for sketch plane from a planar mesh face hit */
export function createPlaneFromFace(hit) {
  const normal = hit.face.normal.clone();
  hit.object.updateWorldMatrix(true, false);
  normal.transformDirection(hit.object.matrixWorld).normalize();

  const origin = hit.point.clone();

  // Pick an arbitrary non-parallel vector to form basis
  let u = new THREE.Vector3(0, 1, 0);
  if (Math.abs(normal.dot(u)) > 0.9) {
    u = new THREE.Vector3(1, 0, 0);
  }
  const v = new THREE.Vector3().crossVectors(normal, u).normalize();
  u.crossVectors(v, normal).normalize();

  return new SketchPlane('Face Plane', origin, u, v, normal);
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

function makeGlyphSprite(char) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0284c7';
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px sans-serif';
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
    this.points = [];
    this.closed = false;
    this.solver.clear();
    this._redraw();
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

          this.solver.solve();
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
    this.solver.solve();
    this.syncPointsFromSolver();
    this._redraw();
  }

  /** Apply a geometric constraint to the active sketch */
  addGeometricConstraint(type, targetPoints = null) {
    if (this.solver.points.length < 2) return;
    const pA = targetPoints ? targetPoints[0] : 'p0';
    const pB = targetPoints ? targetPoints[1] : 'p1';

    if (type === 'horizontal') this.solver.addHorizontalConstraint(pA, pB);
    else if (type === 'vertical') this.solver.addVerticalConstraint(pA, pB);
    else if (type === 'coincident' && targetPoints && targetPoints.length >= 2) {
      this.solver.addCoincidentConstraint(targetPoints[0], targetPoints[1]);
    } else if (type === 'fix') {
      this.solver.setPointFixed(pA, true);
    } else if (type === 'perpendicular' && this.solver.points.length >= 4) {
      this.solver.addPerpendicularConstraint('p0', 'p1', 'p1', 'p2');
    } else if (type === 'parallel' && this.solver.points.length >= 4) {
      this.solver.addParallelConstraint('p0', 'p1', 'p2', 'p3');
    } else if (type === 'equal' && this.solver.points.length >= 4) {
      this.solver.addEqualLengthConstraint('p0', 'p1', 'p2', 'p3');
    }

    this.solver.solve();
    this.syncPointsFromSolver();
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
    if (this.points.length === 0) return;

    const material = new THREE.LineBasicMaterial({ color: 0xffb454, linewidth: 2.5 });
    const pts = this.closed ? [...this.points, this.points[0]] : this.points;
    const geometry = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geometry, material);
    this.group.add(line);

    // Vertex dots
    const dotGeo = new THREE.SphereGeometry(1.6, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffb454 });
    for (const p of this.points) {
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.copy(p);
      this.group.add(dot);
    }

    if (!this.closed) return;

    // Draw constraint glyphs (H, V)
    for (const c of this.solver.constraints) {
      if (c.type === 'horizontal' || c.type === 'vertical') {
        const ptA = this.solver.getPoint(c.pA);
        const ptB = this.solver.getPoint(c.pB);
        if (!ptA || !ptB) continue;
        const mid3D = this.sketchPlane.to3D((ptA.u + ptB.u) / 2, (ptA.v + ptB.v) / 2);
        const glyph = makeGlyphSprite(c.type === 'horizontal' ? 'H' : 'V');
        glyph.position.copy(mid3D);
        this.group.add(glyph);
      }
    }

    // Draw dimension badges and leader lines
    for (const c of this.solver.constraints) {
      if (c.type === 'distance') {
        const ptA = this.solver.getPoint(c.pA);
        const ptB = this.solver.getPoint(c.pB);
        if (!ptA || !ptB) continue;

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
          distance: c.distance
        };
        this.group.add(sprite);

        // Leader line connecting segment midpoint to dimension badge
        const leaderGeo = new THREE.BufferGeometry().setFromPoints([midPos, badgePos]);
        const leaderMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, opacity: 0.6, transparent: true });
        const leaderLine = new THREE.Line(leaderGeo, leaderMat);
        this.group.add(leaderLine);
      }
    }
  }
}


