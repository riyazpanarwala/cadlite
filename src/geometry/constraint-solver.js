/**
 * Robust 2D Geometric and Dimensional Constraint Solver for Parametric CAD.
 * Powered by a damped Levenberg-Marquardt (LM) / Gauss-Newton numerical solver
 * with analytical Jacobian matrices, true Degrees of Freedom (DOF) rank analysis,
 * real-time solve-on-drag soft targets, and over-constraint conflict diagnostics.
 */

export class ConstraintSolver2D {
  constructor() {
    this.points = []; // Array of { id, u, v, fixed }
    this.constraints = []; // Array of constraint descriptors
    this.dragGoals = new Map(); // pointId -> { u, v, weight }
  }

  // ---------------------------------------------------------------------------
  // Point Management
  // ---------------------------------------------------------------------------

  addPoint(id, u, v, fixed = false) {
    let pt = this.getPoint(id);
    if (pt) {
      pt.u = u;
      pt.v = v;
      pt.fixed = Boolean(fixed);
      return pt;
    }
    pt = { id, u, v, fixed: Boolean(fixed) };
    this.points.push(pt);
    return pt;
  }

  getPoint(id) {
    return this.points.find((p) => p.id === id);
  }

  setPointFixed(id, fixed) {
    const pt = this.getPoint(id);
    if (pt) pt.fixed = Boolean(fixed);
  }

  removePoint(id) {
    this.points = this.points.filter((p) => p.id !== id);
    this.constraints = this.constraints.filter((c) => {
      return (
        c.pA !== id &&
        c.pB !== id &&
        c.s1A !== id &&
        c.s1B !== id &&
        c.s2A !== id &&
        c.s2B !== id &&
        c.pM !== id &&
        c.pP !== id
      );
    });
    this.dragGoals.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Constraint Definitions
  // ---------------------------------------------------------------------------

  addDistanceConstraint(pAId, pBId, distance) {
    this.removeConstraintBetween(pAId, pBId, 'distance');
    const c = {
      id: `dist_${pAId}_${pBId}`,
      type: 'distance',
      name: `Distance (${pAId}-${pBId})`,
      pA: pAId,
      pB: pBId,
      distance: Math.max(0.001, distance)
    };
    this.constraints.push(c);
    return c;
  }

  addHorizontalConstraint(pAId, pBId) {
    this.removeConstraintBetween(pAId, pBId, 'horizontal');
    const c = {
      id: `h_${pAId}_${pBId}`,
      type: 'horizontal',
      name: `Horizontal (${pAId}-${pBId})`,
      pA: pAId,
      pB: pBId
    };
    this.constraints.push(c);
    return c;
  }

  addVerticalConstraint(pAId, pBId) {
    this.removeConstraintBetween(pAId, pBId, 'vertical');
    const c = {
      id: `v_${pAId}_${pBId}`,
      type: 'vertical',
      name: `Vertical (${pAId}-${pBId})`,
      pA: pAId,
      pB: pBId
    };
    this.constraints.push(c);
    return c;
  }

  addCoincidentConstraint(pAId, pBId) {
    this.removeConstraintBetween(pAId, pBId, 'coincident');
    const c = {
      id: `coin_${pAId}_${pBId}`,
      type: 'coincident',
      name: `Coincident (${pAId}-${pBId})`,
      pA: pAId,
      pB: pBId
    };
    this.constraints.push(c);
    return c;
  }

  addPerpendicularConstraint(s1A, s1B, s2A, s2B) {
    const c = {
      id: `perp_${s1A}_${s1B}_${s2A}_${s2B}`,
      type: 'perpendicular',
      name: `Perpendicular (${s1A}-${s1B} ⊥ ${s2A}-${s2B})`,
      s1A,
      s1B,
      s2A,
      s2B
    };
    this.constraints.push(c);
    return c;
  }

  addParallelConstraint(s1A, s1B, s2A, s2B) {
    const c = {
      id: `par_${s1A}_${s1B}_${s2A}_${s2B}`,
      type: 'parallel',
      name: `Parallel (${s1A}-${s1B} ∥ ${s2A}-${s2B})`,
      s1A,
      s1B,
      s2A,
      s2B
    };
    this.constraints.push(c);
    return c;
  }

  addEqualLengthConstraint(s1A, s1B, s2A, s2B) {
    const c = {
      id: `eq_${s1A}_${s1B}_${s2A}_${s2B}`,
      type: 'equal_length',
      name: `Equal Length (${s1A}-${s1B} = ${s2A}-${s2B})`,
      s1A,
      s1B,
      s2A,
      s2B
    };
    this.constraints.push(c);
    return c;
  }

  addMidpointConstraint(pMId, pAId, pBId) {
    const c = {
      id: `mid_${pMId}_${pAId}_${pBId}`,
      type: 'midpoint',
      name: `Midpoint (${pMId} on ${pAId}-${pBId})`,
      pM: pMId,
      pA: pAId,
      pB: pBId
    };
    this.constraints.push(c);
    return c;
  }

  addPointOnLineConstraint(pPId, pAId, pBId) {
    const c = {
      id: `pol_${pPId}_${pAId}_${pBId}`,
      type: 'point_on_line',
      name: `Point on Line (${pPId} on ${pAId}-${pBId})`,
      pP: pPId,
      pA: pAId,
      pB: pBId
    };
    this.constraints.push(c);
    return c;
  }

  addFixConstraint(pId, u = null, v = null) {
    const pt = this.getPoint(pId);
    if (!pt) return null;
    const targetU = u !== null ? u : pt.u;
    const targetV = v !== null ? v : pt.v;
    this.removeConstraint(`fix_${pId}`);
    const c = {
      id: `fix_${pId}`,
      type: 'fix',
      name: `Fix (${pId})`,
      pA: pId,
      targetU,
      targetV
    };
    this.constraints.push(c);
    return c;
  }

  removeConstraint(id) {
    this.constraints = this.constraints.filter((c) => c.id !== id);
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
    this.dragGoals.clear();
  }

  // ---------------------------------------------------------------------------
  // Live Dragging / Soft Target Goals
  // ---------------------------------------------------------------------------

  setDragGoal(pointId, u, v, weight = 0.08) {
    this.dragGoals.set(pointId, { u, v, weight });
  }

  clearDragGoals() {
    this.dragGoals.clear();
  }

  // ---------------------------------------------------------------------------
  // Levenberg-Marquardt Numerical Solver Engine
  // ---------------------------------------------------------------------------

  /**
   * Solves the 2D constraint system using Levenberg-Marquardt optimization.
   * Computes exact analytical Jacobian derivatives, evaluates residual convergence,
   * performs DOF rank calculation, and pinpoints conflicting over-constraints.
   */
  solve(maxIterations = 60, tolerance = 1e-4) {
    const freePoints = this.points.filter((p) => !p.fixed);
    const nFree = freePoints.length;
    const nVars = nFree * 2;

    // Map point id -> variable index [2*i, 2*i + 1]
    const varMap = new Map();
    freePoints.forEach((p, idx) => {
      varMap.set(p.id, idx * 2);
    });

    if (nVars === 0 && this.constraints.length === 0) {
      return { converged: true, iterations: 0, maxError: 0, dof: 0, status: 'fully_constrained' };
    }

    // Helper: evaluate residuals F and analytical Jacobian J
    const evaluateSystem = () => {
      const rows = []; // array of { residual, grad: Map(varIdx -> val), constraint }

      for (const c of this.constraints) {
        if (c.type === 'distance') {
          const pA = this.getPoint(c.pA);
          const pB = this.getPoint(c.pB);
          if (!pA || !pB) continue;

          const du = pB.u - pA.u;
          const dv = pB.v - pA.v;
          const len = Math.hypot(du, dv) || 1e-6;
          const r = len - c.distance;

          const grad = new Map();
          const uAIdx = varMap.get(pA.id);
          const uBIdx = varMap.get(pB.id);

          const nu = du / len;
          const nv = dv / len;

          if (uAIdx !== undefined) {
            grad.set(uAIdx, -nu);
            grad.set(uAIdx + 1, -nv);
          }
          if (uBIdx !== undefined) {
            grad.set(uBIdx, nu);
            grad.set(uBIdx + 1, nv);
          }

          rows.push({ residual: r, grad, constraint: c });
        } else if (c.type === 'horizontal') {
          const pA = this.getPoint(c.pA);
          const pB = this.getPoint(c.pB);
          if (!pA || !pB) continue;

          const r = pB.v - pA.v;
          const grad = new Map();
          const uAIdx = varMap.get(pA.id);
          const uBIdx = varMap.get(pB.id);

          if (uAIdx !== undefined) grad.set(uAIdx + 1, -1);
          if (uBIdx !== undefined) grad.set(uBIdx + 1, 1);

          rows.push({ residual: r, grad, constraint: c });
        } else if (c.type === 'vertical') {
          const pA = this.getPoint(c.pA);
          const pB = this.getPoint(c.pB);
          if (!pA || !pB) continue;

          const r = pB.u - pA.u;
          const grad = new Map();
          const uAIdx = varMap.get(pA.id);
          const uBIdx = varMap.get(pB.id);

          if (uAIdx !== undefined) grad.set(uAIdx, -1);
          if (uBIdx !== undefined) grad.set(uBIdx, 1);

          rows.push({ residual: r, grad, constraint: c });
        } else if (c.type === 'coincident') {
          const pA = this.getPoint(c.pA);
          const pB = this.getPoint(c.pB);
          if (!pA || !pB) continue;

          const uAIdx = varMap.get(pA.id);
          const uBIdx = varMap.get(pB.id);

          // u equation
          const gradU = new Map();
          if (uAIdx !== undefined) gradU.set(uAIdx, -1);
          if (uBIdx !== undefined) gradU.set(uBIdx, 1);
          rows.push({ residual: pB.u - pA.u, grad: gradU, constraint: c });

          // v equation
          const gradV = new Map();
          if (uAIdx !== undefined) gradV.set(uAIdx + 1, -1);
          if (uBIdx !== undefined) gradV.set(uBIdx + 1, 1);
          rows.push({ residual: pB.v - pA.v, grad: gradV, constraint: c });
        } else if (c.type === 'fix') {
          const pA = this.getPoint(c.pA);
          if (!pA) continue;
          const uAIdx = varMap.get(pA.id);
          if (uAIdx !== undefined) {
            const gradU = new Map([[uAIdx, 1]]);
            rows.push({ residual: pA.u - c.targetU, grad: gradU, constraint: c });
            const gradV = new Map([[uAIdx + 1, 1]]);
            rows.push({ residual: pA.v - c.targetV, grad: gradV, constraint: c });
          }
        } else if (c.type === 'perpendicular') {
          const p1 = this.getPoint(c.s1A);
          const p2 = this.getPoint(c.s1B);
          const p3 = this.getPoint(c.s2A);
          const p4 = this.getPoint(c.s2B);
          if (!p1 || !p2 || !p3 || !p4) continue;

          const d1u = p2.u - p1.u;
          const d1v = p2.v - p1.v;
          const d2u = p4.u - p3.u;
          const d2v = p4.v - p3.v;

          const len1 = Math.hypot(d1u, d1v) || 1;
          const len2 = Math.hypot(d2u, d2v) || 1;
          const scale = len1 * len2;

          // Normalized dot product
          const r = (d1u * d2u + d1v * d2v) / scale;
          const grad = new Map();

          const addGrad = (pId, duVal, dvVal) => {
            const idx = varMap.get(pId);
            if (idx !== undefined) {
              grad.set(idx, (grad.get(idx) || 0) + duVal / scale);
              grad.set(idx + 1, (grad.get(idx + 1) || 0) + dvVal / scale);
            }
          };

          addGrad(p1.id, -d2u, -d2v);
          addGrad(p2.id, d2u, d2v);
          addGrad(p3.id, -d1u, -d1v);
          addGrad(p4.id, d1u, d1v);

          rows.push({ residual: r, grad, constraint: c });
        } else if (c.type === 'parallel') {
          const p1 = this.getPoint(c.s1A);
          const p2 = this.getPoint(c.s1B);
          const p3 = this.getPoint(c.s2A);
          const p4 = this.getPoint(c.s2B);
          if (!p1 || !p2 || !p3 || !p4) continue;

          const d1u = p2.u - p1.u;
          const d1v = p2.v - p1.v;
          const d2u = p4.u - p3.u;
          const d2v = p4.v - p3.v;

          const len1 = Math.hypot(d1u, d1v) || 1;
          const len2 = Math.hypot(d2u, d2v) || 1;
          const scale = len1 * len2;

          // 2D cross product: d1u*d2v - d1v*d2u
          const r = (d1u * d2v - d1v * d2u) / scale;
          const grad = new Map();

          const addGrad = (pId, duVal, dvVal) => {
            const idx = varMap.get(pId);
            if (idx !== undefined) {
              grad.set(idx, (grad.get(idx) || 0) + duVal / scale);
              grad.set(idx + 1, (grad.get(idx + 1) || 0) + dvVal / scale);
            }
          };

          addGrad(p1.id, -d2v, d2u);
          addGrad(p2.id, d2v, -d2u);
          addGrad(p3.id, d1v, -d1u);
          addGrad(p4.id, -d1v, d1u);

          rows.push({ residual: r, grad, constraint: c });
        } else if (c.type === 'equal_length') {
          const p1 = this.getPoint(c.s1A);
          const p2 = this.getPoint(c.s1B);
          const p3 = this.getPoint(c.s2A);
          const p4 = this.getPoint(c.s2B);
          if (!p1 || !p2 || !p3 || !p4) continue;

          const len1 = Math.hypot(p2.u - p1.u, p2.v - p1.v) || 1e-6;
          const len2 = Math.hypot(p4.u - p3.u, p4.v - p3.v) || 1e-6;

          const r = len1 - len2;
          const grad = new Map();

          const addGrad = (pId, duVal, dvVal) => {
            const idx = varMap.get(pId);
            if (idx !== undefined) {
              grad.set(idx, (grad.get(idx) || 0) + duVal);
              grad.set(idx + 1, (grad.get(idx + 1) || 0) + dvVal);
            }
          };

          addGrad(p1.id, -(p2.u - p1.u) / len1, -(p2.v - p1.v) / len1);
          addGrad(p2.id, (p2.u - p1.u) / len1, (p2.v - p1.v) / len1);
          addGrad(p3.id, (p4.u - p3.u) / len2, (p4.v - p3.v) / len2);
          addGrad(p4.id, -(p4.u - p3.u) / len2, -(p4.v - p3.v) / len2);

          rows.push({ residual: r, grad, constraint: c });
        } else if (c.type === 'midpoint') {
          const pM = this.getPoint(c.pM);
          const pA = this.getPoint(c.pA);
          const pB = this.getPoint(c.pB);
          if (!pM || !pA || !pB) continue;

          const uMIdx = varMap.get(pM.id);
          const uAIdx = varMap.get(pA.id);
          const uBIdx = varMap.get(pB.id);

          const gradU = new Map();
          if (uMIdx !== undefined) gradU.set(uMIdx, 2);
          if (uAIdx !== undefined) gradU.set(uAIdx, -1);
          if (uBIdx !== undefined) gradU.set(uBIdx, -1);
          rows.push({ residual: 2 * pM.u - (pA.u + pB.u), grad: gradU, constraint: c });

          const gradV = new Map();
          if (uMIdx !== undefined) gradV.set(uMIdx + 1, 2);
          if (uAIdx !== undefined) gradV.set(uAIdx + 1, -1);
          if (uBIdx !== undefined) gradV.set(uBIdx + 1, -1);
          rows.push({ residual: 2 * pM.v - (pA.v + pB.v), grad: gradV, constraint: c });
        } else if (c.type === 'point_on_line') {
          const pP = this.getPoint(c.pP);
          const pA = this.getPoint(c.pA);
          const pB = this.getPoint(c.pB);
          if (!pP || !pA || !pB) continue;

          const dABu = pB.u - pA.u;
          const dABv = pB.v - pA.v;
          const dAPu = pP.u - pA.u;
          const dAPv = pP.v - pA.v;

          const lenAB = Math.hypot(dABu, dABv) || 1;
          const r = (dAPu * dABv - dAPv * dABu) / lenAB;
          const grad = new Map();

          const addGrad = (pId, duVal, dvVal) => {
            const idx = varMap.get(pId);
            if (idx !== undefined) {
              grad.set(idx, (grad.get(idx) || 0) + duVal / lenAB);
              grad.set(idx + 1, (grad.get(idx + 1) || 0) + dvVal / lenAB);
            }
          };

          addGrad(pP.id, dABv, -dABu);
          addGrad(pA.id, -dABv + dAPv, dABu - dAPu);
          addGrad(pB.id, -dAPv, dAPu);

          rows.push({ residual: r, grad, constraint: c });
        }
      }

      // Add soft drag goal targets (least-squares penalty attracting free vertices)
      for (const [pId, goal] of this.dragGoals) {
        const pt = this.getPoint(pId);
        if (!pt) continue;
        const uIdx = varMap.get(pId);
        if (uIdx !== undefined) {
          const w = goal.weight || 0.1;
          rows.push({
            residual: (pt.u - goal.u) * w,
            grad: new Map([[uIdx, w]]),
            constraint: { id: `drag_${pId}`, type: 'drag', isSoft: true }
          });
          rows.push({
            residual: (pt.v - goal.v) * w,
            grad: new Map([[uIdx + 1, w]]),
            constraint: { id: `drag_${pId}`, type: 'drag', isSoft: true }
          });
        }
      }

      return rows;
    };

    let lambda = 1e-3;
    let bestResiduals = evaluateSystem();
    let maxError = Math.max(0, ...bestResiduals.filter((r) => !r.constraint.isSoft).map((r) => Math.abs(r.residual)));

    if (maxError < tolerance && this.dragGoals.size === 0) {
      const dofInfo = this.analyzeDOF(bestResiduals, nVars);
      return {
        converged: true,
        iterations: 0,
        maxError,
        dof: dofInfo.dof,
        rank: dofInfo.rank,
        status: dofInfo.dof === 0 ? 'fully_constrained' : 'under_constrained'
      };
    }

    // Levenberg-Marquardt Iteration Loop
    for (let iter = 0; iter < maxIterations; iter++) {
      const rows = evaluateSystem();
      const hardRows = rows.filter((r) => !r.constraint.isSoft);
      maxError = Math.max(0, ...hardRows.map((r) => Math.abs(r.residual)));

      if (maxError < tolerance && iter > 0 && this.dragGoals.size === 0) {
        const dofInfo = this.analyzeDOF(rows, nVars);
        return {
          converged: true,
          iterations: iter,
          maxError,
          dof: dofInfo.dof,
          rank: dofInfo.rank,
          status: dofInfo.dof === 0 ? 'fully_constrained' : 'under_constrained'
        };
      }

      // Build Normal Equations: A = J^T J, g = -J^T F
      const A = Array.from({ length: nVars }, () => new Float64Array(nVars));
      const g = new Float64Array(nVars);

      for (const row of rows) {
        const r = row.residual;
        for (const [varI, valI] of row.grad) {
          g[varI] -= valI * r;
          for (const [varJ, valJ] of row.grad) {
            A[varI][varJ] += valI * valJ;
          }
        }
      }

      // Apply Levenberg-Marquardt damping + Tikhonov regularization
      for (let i = 0; i < nVars; i++) {
        A[i][i] += lambda * Math.max(A[i][i], 1e-4) + 1e-5;
      }

      // Solve A * delta = g using Gaussian elimination with partial pivoting
      const delta = solveLinearSystem(A, g, nVars);
      if (!delta) {
        lambda *= 5;
        continue;
      }

      // Store previous state for step acceptance test
      const prevCoords = freePoints.map((p) => ({ u: p.u, v: p.v }));
      const prevCost = rows.reduce((acc, row) => acc + row.residual * row.residual, 0);

      // Apply trial step
      for (let i = 0; i < nFree; i++) {
        freePoints[i].u += delta[i * 2];
        freePoints[i].v += delta[i * 2 + 1];
      }

      const trialRows = evaluateSystem();
      const trialCost = trialRows.reduce((acc, row) => acc + row.residual * row.residual, 0);

      if (trialCost < prevCost) {
        // Step accepted!
        lambda = Math.max(lambda / 5, 1e-7);
        bestResiduals = trialRows;
      } else {
        // Step rejected: restore coordinates and increase damping
        for (let i = 0; i < nFree; i++) {
          freePoints[i].u = prevCoords[i].u;
          freePoints[i].v = prevCoords[i].v;
        }
        lambda = Math.min(lambda * 5, 1e5);
      }
    }

    const finalRows = evaluateSystem();
    const hardFinalRows = finalRows.filter((r) => !r.constraint.isSoft);
    const finalMaxError = Math.max(0, ...hardFinalRows.map((r) => Math.abs(r.residual)));
    const dofInfo = this.analyzeDOF(finalRows, nVars);

    const isConverged = finalMaxError < tolerance * 10;
    let status = 'under_constrained';
    let conflicting = [];

    if (!isConverged) {
      status = 'over_constrained';
      // Identify conflicting constraints with large residual errors
      conflicting = hardFinalRows
        .filter((r) => Math.abs(r.residual) > tolerance * 5)
        .map((r) => r.constraint);
    } else if (dofInfo.dof === 0) {
      status = 'fully_constrained';
    }

    return {
      converged: isConverged,
      iterations: maxIterations,
      maxError: finalMaxError,
      dof: dofInfo.dof,
      rank: dofInfo.rank,
      status,
      conflictingConstraints: conflicting
    };
  }

  // ---------------------------------------------------------------------------
  // Degrees of Freedom (DOF) Analysis via Numerical Matrix Rank
  // ---------------------------------------------------------------------------

  analyzeDOF(rows, nVars) {
    if (nVars === 0) return { dof: 0, rank: 0 };
    const hardRows = rows.filter((r) => !r.constraint.isSoft);
    if (hardRows.length === 0) return { dof: nVars, rank: 0 };

    // Compute J^T J
    const JTJ = Array.from({ length: nVars }, () => new Float64Array(nVars));
    for (const row of hardRows) {
      for (const [varI, valI] of row.grad) {
        for (const [varJ, valJ] of row.grad) {
          JTJ[varI][varJ] += valI * valJ;
        }
      }
    }

    // Gaussian elimination with complete pivoting to compute numerical rank
    let rank = 0;
    const tol = 1e-4;
    const M = JTJ.map((row) => Float64Array.from(row));

    for (let step = 0; step < nVars; step++) {
      let maxVal = 0;
      let pivotRow = step;
      let pivotCol = step;

      for (let r = step; r < nVars; r++) {
        for (let c = step; c < nVars; c++) {
          const absVal = Math.abs(M[r][c]);
          if (absVal > maxVal) {
            maxVal = absVal;
            pivotRow = r;
            pivotCol = c;
          }
        }
      }

      if (maxVal < tol) break;

      // Swap rows
      if (pivotRow !== step) {
        const tmp = M[step];
        M[step] = M[pivotRow];
        M[pivotRow] = tmp;
      }
      // Swap columns
      if (pivotCol !== step) {
        for (let r = 0; r < nVars; r++) {
          const tmp = M[r][step];
          M[r][step] = M[r][pivotCol];
          M[r][pivotCol] = tmp;
        }
      }

      rank++;

      const pivot = M[step][step];
      for (let r = step + 1; r < nVars; r++) {
        const factor = M[r][step] / pivot;
        for (let c = step; c < nVars; c++) {
          M[r][c] -= factor * M[step][c];
        }
      }
    }

    const dof = Math.max(0, nVars - rank);
    return { dof, rank };
  }
}

// ---------------------------------------------------------------------------
// Linear Solver: Gaussian Elimination with Partial Pivoting
// ---------------------------------------------------------------------------

function solveLinearSystem(A, b, n) {
  const M = Array.from({ length: n }, (_, i) => {
    const row = new Float64Array(n + 1);
    row.set(A[i]);
    row[n] = b[i];
    return row;
  });

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    let maxVal = Math.abs(M[i][i]);
    for (let r = i + 1; r < n; r++) {
      const v = Math.abs(M[r][i]);
      if (v > maxVal) {
        maxVal = v;
        maxRow = r;
      }
    }

    if (maxVal < 1e-12) continue; // Singular or damped rank deficient

    if (maxRow !== i) {
      const temp = M[i];
      M[i] = M[maxRow];
      M[maxRow] = temp;
    }

    const pivot = M[i][i];
    for (let r = i + 1; r < n; r++) {
      const factor = M[r][i] / pivot;
      for (let c = i; c <= n; c++) {
        M[r][c] -= factor * M[i][c];
      }
    }
  }

  // Back substitution
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let c = i + 1; c < n; c++) {
      sum -= M[i][c] * x[c];
    }
    const pivot = M[i][i];
    x[i] = Math.abs(pivot) > 1e-12 ? sum / pivot : 0;
  }

  return x;
}
