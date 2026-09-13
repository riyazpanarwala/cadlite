import assert from 'assert';
import { ConstraintSolver2D } from './src/geometry/constraint-solver.js';

console.log('=== Starting Phase 3 2D Geometric Constraint Solver Suite ===\n');

async function runTests() {
  // ---------------------------------------------------------------------------
  // Test 1: Linear Geometric Constraints (Horizontal, Vertical, Coincident)
  // ---------------------------------------------------------------------------
  console.log('Test 1: Linear Geometric Constraints (H, V, Coincident)...');
  const solver1 = new ConstraintSolver2D();
  solver1.addPoint('p0', 0, 0, true); // Fixed origin
  solver1.addPoint('p1', 50, 4); // Slanted slightly
  solver1.addPoint('p2', 52, 35); // Slanted slightly

  solver1.addHorizontalConstraint('p0', 'p1');
  solver1.addVerticalConstraint('p1', 'p2');

  const res1 = solver1.solve();
  assert(res1.converged, 'Solver 1 should converge');
  const p0_1 = solver1.getPoint('p0');
  const p1_1 = solver1.getPoint('p1');
  const p2_1 = solver1.getPoint('p2');

  assert(Math.abs(p1_1.v - p0_1.v) < 1e-3, 'p0-p1 must be perfectly horizontal (v equal)');
  assert(Math.abs(p2_1.u - p1_1.u) < 1e-3, 'p1-p2 must be perfectly vertical (u equal)');
  console.log(`  p0: (${p0_1.u.toFixed(2)}, ${p0_1.v.toFixed(2)})`);
  console.log(`  p1: (${p1_1.u.toFixed(2)}, ${p1_1.v.toFixed(2)})`);
  console.log(`  p2: (${p2_1.u.toFixed(2)}, ${p2_1.v.toFixed(2)})`);
  console.log('  -> Test 1 PASSED!\n');

  // ---------------------------------------------------------------------------
  // Test 2: Non-Linear Distance / Dimensional Constraints
  // ---------------------------------------------------------------------------
  console.log('Test 2: Non-Linear Distance / Dimensional Constraints...');
  const solver2 = new ConstraintSolver2D();
  solver2.addPoint('p0', 0, 0, true);
  solver2.addPoint('p1', 30, 20); // Arbitrary start

  solver2.addHorizontalConstraint('p0', 'p1');
  solver2.addDistanceConstraint('p0', 'p1', 75);

  const res2 = solver2.solve();
  assert(res2.converged, 'Solver 2 should converge');
  const p1_2 = solver2.getPoint('p1');
  assert(Math.abs(p1_2.u - 75) < 1e-3, `p1.u should be 75mm, got ${p1_2.u}`);
  assert(Math.abs(p1_2.v - 0) < 1e-3, `p1.v should be 0mm, got ${p1_2.v}`);
  console.log(`  p1 after 75mm distance + horizontal: (${p1_2.u.toFixed(3)}, ${p1_2.v.toFixed(3)})`);
  console.log('  -> Test 2 PASSED!\n');

  // ---------------------------------------------------------------------------
  // Test 3: Coupled Geometric Constraints (Perpendicular, Parallel, Equal Length)
  // ---------------------------------------------------------------------------
  console.log('Test 3: Coupled Geometric Constraints (Perpendicular, Parallel, Equal Length)...');
  const solver3 = new ConstraintSolver2D();
  solver3.addPoint('p0', 0, 0, true);
  solver3.addPoint('p1', 40, 0);
  solver3.addPoint('p2', 40, 30);
  solver3.addPoint('p3', 0, 30);

  // Rectangle constraints
  solver3.addHorizontalConstraint('p0', 'p1');
  solver3.addPerpendicularConstraint('p0', 'p1', 'p1', 'p2');
  solver3.addParallelConstraint('p0', 'p1', 'p3', 'p2');
  solver3.addParallelConstraint('p0', 'p3', 'p1', 'p2');
  solver3.addEqualLengthConstraint('p0', 'p1', 'p1', 'p2'); // Square condition
  solver3.addDistanceConstraint('p0', 'p1', 50);

  const res3 = solver3.solve();
  assert(res3.converged, 'Solver 3 should converge');
  const p0_3 = solver3.getPoint('p0');
  const p1_3 = solver3.getPoint('p1');
  const p2_3 = solver3.getPoint('p2');
  const p3_3 = solver3.getPoint('p3');

  const edge01 = Math.hypot(p1_3.u - p0_3.u, p1_3.v - p0_3.v);
  const edge12 = Math.hypot(p2_3.u - p1_3.u, p2_3.v - p1_3.v);
  assert(Math.abs(edge01 - 50) < 1e-3, `Edge 0-1 should be 50mm, got ${edge01}`);
  assert(Math.abs(edge12 - 50) < 1e-3, `Edge 1-2 should be 50mm, got ${edge12}`);
  console.log(`  Square dimensions: ${edge01.toFixed(2)}mm x ${edge12.toFixed(2)}mm`);
  console.log('  -> Test 3 PASSED!\n');

  // ---------------------------------------------------------------------------
  // Test 4: Degrees of Freedom (DOF) Counter & Rank Analysis
  // ---------------------------------------------------------------------------
  console.log('Test 4: Degrees of Freedom (DOF) Counter & Rank Analysis...');
  const solver4 = new ConstraintSolver2D();
  // 4 free points in a plane = 8 free variables
  solver4.addPoint('p0', 0, 0, false);
  solver4.addPoint('p1', 60, 0, false);
  solver4.addPoint('p2', 60, 40, false);
  solver4.addPoint('p3', 0, 40, false);

  // Before any constraints, 8 free coordinates = 8 DOF
  const res4_init = solver4.solve();
  assert.strictEqual(res4_init.dof, 8, `Initial DOF should be 8, got ${res4_init.dof}`);
  console.log(`  Initial free rectangle: ${res4_init.dof} DOF (Under-constrained)`);

  // Fix origin anchor: removes 2 DOF -> 6 DOF remaining
  solver4.setPointFixed('p0', true);
  const res4_fix = solver4.solve();
  assert.strictEqual(res4_fix.dof, 6, `After fixing p0, DOF should be 6, got ${res4_fix.dof}`);
  console.log(`  After fixing origin p0: ${res4_fix.dof} DOF`);

  // Add H & V constraints: removes 4 DOF -> 2 DOF remaining
  solver4.addHorizontalConstraint('p0', 'p1');
  solver4.addVerticalConstraint('p1', 'p2');
  solver4.addHorizontalConstraint('p3', 'p2');
  solver4.addVerticalConstraint('p0', 'p3');
  const res4_aligned = solver4.solve();
  assert.strictEqual(res4_aligned.dof, 2, `After H & V constraints, DOF should be 2, got ${res4_aligned.dof}`);
  console.log(`  After H & V rectangle constraints: ${res4_aligned.dof} DOF (Width & Height free)`);

  // Add Width & Height dimensions: fully constrained (0 DOF!)
  solver4.addDistanceConstraint('p0', 'p1', 60);
  solver4.addDistanceConstraint('p0', 'p3', 40);
  const res4_full = solver4.solve();
  assert.strictEqual(res4_full.dof, 0, `Fully constrained rectangle should have 0 DOF, got ${res4_full.dof}`);
  assert.strictEqual(res4_full.status, 'fully_constrained');
  console.log(`  After Width & Height dimensions: ${res4_full.dof} DOF (Status: ${res4_full.status})`);
  console.log('  -> Test 4 PASSED!\n');

  // ---------------------------------------------------------------------------
  // Test 5: Over-constraint / Conflict Detection
  // ---------------------------------------------------------------------------
  console.log('Test 5: Over-constraint / Conflict Detection...');
  const solver5 = new ConstraintSolver2D();
  solver5.addPoint('p0', 0, 0, true);
  solver5.addPoint('p1', 50, 0, false);

  solver5.addHorizontalConstraint('p0', 'p1');
  solver5.addDistanceConstraint('p0', 'p1', 50);

  // Now introduce an impossible contradiction:
  // p0-p1 is horizontal, but also vertical!
  solver5.addVerticalConstraint('p0', 'p1');

  const res5 = solver5.solve();
  assert.strictEqual(res5.status, 'over_constrained', 'Solver should detect over-constrained conflict');
  assert(res5.conflictingConstraints.length > 0, 'Should identify conflicting constraints');
  console.log(`  Solver detected status: ${res5.status}`);
  console.log(`  Conflicting constraints flagged:`, res5.conflictingConstraints.map((c) => c.name || c.type));
  console.log('  -> Test 5 PASSED!\n');

  // ---------------------------------------------------------------------------
  // Test 6: Solve-on-Drag Soft Target Optimization
  // ---------------------------------------------------------------------------
  console.log('Test 6: Solve-on-Drag Soft Target Optimization...');
  const solver6 = new ConstraintSolver2D();
  solver6.addPoint('p0', 0, 0, true); // Anchor
  solver6.addPoint('p1', 40, 0, false); // Length constrained, free angle
  solver6.addDistanceConstraint('p0', 'p1', 50);

  solver6.solve();

  // User drags p1 towards (30, 40) - exactly on the circle of radius 50!
  solver6.setDragGoal('p1', 30, 40, 0.2);
  const res6_drag = solver6.solve();
  assert(res6_drag.converged, 'Solve-on-drag should converge');

  const p1_drag = solver6.getPoint('p1');
  const finalDist = Math.hypot(p1_drag.u, p1_drag.v);
  assert(Math.abs(finalDist - 50) < 1e-3, `Hard distance 50 must be preserved, got ${finalDist}`);
  assert(Math.abs(p1_drag.u - 30) < 0.1, `p1.u should follow mouse goal near 30, got ${p1_drag.u}`);
  assert(Math.abs(p1_drag.v - 40) < 0.1, `p1.v should follow mouse goal near 40, got ${p1_drag.v}`);
  console.log(`  Dragged p1 position: (${p1_drag.u.toFixed(2)}, ${p1_drag.v.toFixed(2)}), Distance: ${finalDist.toFixed(2)} mm`);
  console.log('  -> Test 6 PASSED!\n');

  console.log('=== All 6 Phase 3 Constraint Solver Tests PASSED Successfully! ===\n');
}

runTests().catch((err) => {
  console.error('Phase 3 tests failed:', err);
  process.exit(1);
});
