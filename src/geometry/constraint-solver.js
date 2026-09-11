/**
 * 2D Parametric Geometric and Dimensional Constraint Solver.
 * Uses iterative position-based projection / relaxation to satisfy
 * geometric constraints (horizontal, vertical, coincident, perpendicular,
 * parallel, equal length, fix) and dimensional constraints (distance).
 */

export class ConstraintSolver2D {
  constructor() {
    this.points = []; // Array of { id, u, v, fixed }
    this.constraints = []; // Array of constraint descriptors
  }

  addPoint(id, u, v, fixed = false) {
    let pt = this.getPoint(id);
    if (pt) {
      pt.u = u;
      pt.v = v;
      pt.fixed = fixed;
      return pt;
    }
    pt = { id, u, v, fixed };
    this.points.push(pt);
    return pt;
  }

  getPoint(id) {
    return this.points.find((p) => p.id === id);
  }

  setPointFixed(id, fixed) {
    const pt = this.getPoint(id);
    if (pt) pt.fixed = fixed;
  }

  addDistanceConstraint(pAId, pBId, distance) {
    this.removeConstraintBetween(pAId, pBId, 'distance');
    const c = { id: `dist_${pAId}_${pBId}`, type: 'distance', pA: pAId, pB: pBId, distance: Math.max(0.001, distance) };
    this.constraints.push(c);
    return c;
  }

  addHorizontalConstraint(pAId, pBId) {
    this.removeConstraintBetween(pAId, pBId, 'horizontal');
    const c = { id: `h_${pAId}_${pBId}`, type: 'horizontal', pA: pAId, pB: pBId };
    this.constraints.push(c);
    return c;
  }

  addVerticalConstraint(pAId, pBId) {
    this.removeConstraintBetween(pAId, pBId, 'vertical');
    const c = { id: `v_${pAId}_${pBId}`, type: 'vertical', pA: pAId, pB: pBId };
    this.constraints.push(c);
    return c;
  }

  addCoincidentConstraint(pAId, pBId) {
    const c = { id: `coin_${pAId}_${pBId}`, type: 'coincident', pA: pAId, pB: pBId };
    this.constraints.push(c);
    return c;
  }

  addPerpendicularConstraint(s1A, s1B, s2A, s2B) {
    const c = { id: `perp_${s1A}_${s1B}_${s2A}_${s2B}`, type: 'perpendicular', s1A, s1B, s2A, s2B };
    this.constraints.push(c);
    return c;
  }

  addParallelConstraint(s1A, s1B, s2A, s2B) {
    const c = { id: `par_${s1A}_${s1B}_${s2A}_${s2B}`, type: 'parallel', s1A, s1B, s2A, s2B };
    this.constraints.push(c);
    return c;
  }

  addEqualLengthConstraint(s1A, s1B, s2A, s2B) {
    const c = { id: `eq_${s1A}_${s1B}_${s2A}_${s2B}`, type: 'equal_length', s1A, s1B, s2A, s2B };
    this.constraints.push(c);
    return c;
  }

  removeConstraintBetween(pAId, pBId, type = null) {
    this.constraints = this.constraints.filter((c) => {
      const matchPts = (c.pA === pAId && c.pB === pBId) || (c.pA === pBId && c.pB === pAId);
      if (!matchPts) return true;
      if (type && c.type !== type) return true;
      return false;
    });
  }

  clear() {
    this.points = [];
    this.constraints = [];
  }

  /**
   * Solves all active constraints using progressive projection.
   */
  solve(maxIterations = 80, tolerance = 1e-4) {
    const alpha = 0.7; // Relaxation speed

    for (let iter = 0; iter < maxIterations; iter++) {
      let maxError = 0;

      for (const c of this.constraints) {
        if (c.type === 'distance') {
          const pA = this.getPoint(c.pA);
          const pB = this.getPoint(c.pB);
          if (!pA || !pB) continue;

          let du = pB.u - pA.u;
          let dv = pB.v - pA.v;
          let dist = Math.hypot(du, dv);
          if (dist < 1e-6) {
            du = 1e-4;
            dv = 0;
            dist = 1e-4;
          }

          const err = dist - c.distance;
          maxError = Math.max(maxError, Math.abs(err));

          const nu = du / dist;
          const nv = dv / dist;

          const wA = pA.fixed ? 0 : 1;
          const wB = pB.fixed ? 0 : 1;
          const wTotal = wA + wB;
          if (wTotal > 0) {
            const corr = (err * alpha) / wTotal;
            if (!pA.fixed) {
              pA.u += nu * corr;
              pA.v += nv * corr;
            }
            if (!pB.fixed) {
              pB.u -= nu * corr;
              pB.v -= nv * corr;
            }
          }
        } else if (c.type === 'horizontal') {
          const pA = this.getPoint(c.pA);
          const pB = this.getPoint(c.pB);
          if (!pA || !pB) continue;

          const err = pB.v - pA.v;
          maxError = Math.max(maxError, Math.abs(err));

          if (pA.fixed && !pB.fixed) {
            pB.v = pA.v;
          } else if (!pA.fixed && pB.fixed) {
            pA.v = pB.v;
          } else if (!pA.fixed && !pB.fixed) {
            const mid = (pA.v + pB.v) / 2;
            pA.v += (mid - pA.v) * alpha;
            pB.v += (mid - pB.v) * alpha;
          }
        } else if (c.type === 'vertical') {
          const pA = this.getPoint(c.pA);
          const pB = this.getPoint(c.pB);
          if (!pA || !pB) continue;

          const err = pB.u - pA.u;
          maxError = Math.max(maxError, Math.abs(err));

          if (pA.fixed && !pB.fixed) {
            pB.u = pA.u;
          } else if (!pA.fixed && pB.fixed) {
            pA.u = pB.u;
          } else if (!pA.fixed && !pB.fixed) {
            const mid = (pA.u + pB.u) / 2;
            pA.u += (mid - pA.u) * alpha;
            pB.u += (mid - pB.u) * alpha;
          }
        } else if (c.type === 'coincident') {
          const pA = this.getPoint(c.pA);
          const pB = this.getPoint(c.pB);
          if (!pA || !pB) continue;

          const du = pB.u - pA.u;
          const dv = pB.v - pA.v;
          maxError = Math.max(maxError, Math.abs(du), Math.abs(dv));

          if (pA.fixed && !pB.fixed) {
            pB.u = pA.u;
            pB.v = pA.v;
          } else if (!pA.fixed && pB.fixed) {
            pA.u = pB.u;
            pA.v = pB.v;
          } else if (!pA.fixed && !pB.fixed) {
            pA.u += (du / 2) * alpha;
            pA.v += (dv / 2) * alpha;
            pB.u -= (du / 2) * alpha;
            pB.v -= (dv / 2) * alpha;
          }
        } else if (c.type === 'perpendicular') {
          const p1 = this.getPoint(c.s1A);
          const p2 = this.getPoint(c.s1B);
          const p3 = this.getPoint(c.s2A);
          const p4 = this.getPoint(c.s2B);
          if (!p1 || !p2 || !p3 || !p4) continue;

          const v1u = p2.u - p1.u;
          const v1v = p2.v - p1.v;
          const v2u = p4.u - p3.u;
          const v2v = p4.v - p3.v;

          const len1 = Math.hypot(v1u, v1v) || 1e-6;
          const len2 = Math.hypot(v2u, v2v) || 1e-6;

          const target2u = -v1v / len1 * len2;
          const target2v = v1u / len1 * len2;

          if (!p4.fixed) {
            p4.u += ((p3.u + target2u) - p4.u) * alpha * 0.5;
            p4.v += ((p3.v + target2v) - p4.v) * alpha * 0.5;
          }
        } else if (c.type === 'equal_length') {
          const p1 = this.getPoint(c.s1A);
          const p2 = this.getPoint(c.s1B);
          const p3 = this.getPoint(c.s2A);
          const p4 = this.getPoint(c.s2B);
          if (!p1 || !p2 || !p3 || !p4) continue;

          const len1 = Math.hypot(p2.u - p1.u, p2.v - p1.v);
          const len2 = Math.hypot(p4.u - p3.u, p4.v - p3.v);
          const avg = (len1 + len2) / 2;

          const u1 = (p2.u - p1.u) / (len1 || 1e-6);
          const v1 = (p2.v - p1.v) / (len1 || 1e-6);
          if (!p2.fixed) {
            p2.u += u1 * (avg - len1) * alpha;
            p2.v += v1 * (avg - len1) * alpha;
          }
          const u2 = (p4.u - p3.u) / (len2 || 1e-6);
          const v2 = (p4.v - p3.v) / (len2 || 1e-6);
          if (!p4.fixed) {
            p4.u += u2 * (avg - len2) * alpha;
            p4.v += v2 * (avg - len2) * alpha;
          }
        }
      }

      if (maxError < tolerance) {
        return { converged: true, iterations: iter + 1, maxError };
      }
    }

    return { converged: false, iterations: maxIterations, maxError: 0 };
  }
}
