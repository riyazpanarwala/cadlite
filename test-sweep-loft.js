const assert = require('assert');
const occ = require('./main/occ-service.js');
const { FeatureTree, FeatureNode } = require('./src/history/FeatureTree.js');

async function runSweepLoftTests() {
  console.log('=== Starting Phase 5 Advanced Sweeps & Lofts Verification Suite ===\n');

  // Test 1: OpenCascade 3D Sweep along elbow path
  console.log('Test 1: OpenCascade B-Rep Sweep along 3D Guide Trajectory...');
  const elbowPath = [
    [0, 0, 0],
    [0, 0, 35],
    [5, 0, 48],
    [15, 0, 58],
    [35, 0, 60],
    [70, 0, 60]
  ];

  const sweepDef = {
    kind: 'sweep',
    params: {
      pathPoints3D: elbowPath,
      radius: 10
    }
  };

  const sweepRes = await occ.getShapeMeshAndTopology(sweepDef);
  assert(sweepRes && sweepRes.meshData, 'Sweep must produce valid mesh data');
  assert(sweepRes.topology.faces.length >= 2, `Swept pipe must have lateral + cap faces, got ${sweepRes.topology.faces.length}`);
  assert(sweepRes.topology.edges.length >= 2, `Swept pipe must have boundary edges, got ${sweepRes.topology.edges.length}`);
  console.log(`  Swept Elbow Pipe: ${sweepRes.topology.faces.length} faces, ${sweepRes.topology.edges.length} edges, ${sweepRes.meshData.index.length / 3} triangles`);
  console.log('  -> Test 1 PASSED!\n');

  // Test 2: OpenCascade Loft (Circle-to-Square Transition)
  console.log('Test 2: OpenCascade B-Rep Loft (Circular to Square Duct)...');
  function makeCircle(r, n = 24) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
  }

  function makeSquare(s, n = 24) {
    const hs = s / 2;
    const corners = [[-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs]];
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * 4;
      const c = Math.floor(t) % 4;
      const next = (c + 1) % 4;
      const f = t - Math.floor(t);
      pts.push([
        corners[c][0] + (corners[next][0] - corners[c][0]) * f,
        corners[c][1] + (corners[next][1] - corners[c][1]) * f
      ]);
    }
    return pts;
  }

  const loftDuctDef = {
    kind: 'loft',
    params: {
      sections: [
        { points2D: makeCircle(25, 24), z: 0 },
        { points2D: makeSquare(36, 24), z: 60 }
      ]
    }
  };

  const loftRes = await occ.getShapeMeshAndTopology(loftDuctDef);
  assert(loftRes && loftRes.meshData, 'Loft must produce valid mesh data');
  assert(loftRes.topology.faces.length >= 3, `Lofted duct must have side faces and caps, got ${loftRes.topology.faces.length}`);
  console.log(`  Lofted Duct Transition: ${loftRes.topology.faces.length} faces, ${loftRes.topology.edges.length} edges, ${loftRes.meshData.index.length / 3} triangles`);
  console.log('  -> Test 2 PASSED!\n');

  // Test 3: Complex 3-Section Loft (Rocket Nozzle)
  console.log('Test 3: Complex 3-Section Loft (Converging-Diverging Nozzle)...');
  const nozzleDef = {
    kind: 'loft',
    params: {
      sections: [
        { points2D: makeCircle(28, 24), z: 0 },   // inlet
        { points2D: makeCircle(12, 24), z: 35 },  // throat constriction
        { points2D: makeCircle(22, 24), z: 75 }   // bell expansion
      ]
    }
  };

  const nozzleRes = await occ.getShapeMeshAndTopology(nozzleDef);
  assert(nozzleRes && nozzleRes.meshData, 'Multi-section loft must produce valid mesh data');
  assert(nozzleRes.topology.faces.length >= 3, `Nozzle must have side surfaces and caps, got ${nozzleRes.topology.faces.length}`);
  console.log(`  Rocket Nozzle: ${nozzleRes.topology.faces.length} faces, ${nozzleRes.topology.edges.length} edges, ${nozzleRes.meshData.index.length / 3} triangles`);
  console.log('  -> Test 3 PASSED!\n');

  // Test 4: Feature Tree History & Rollback with Sweep & Loft
  console.log('Test 4: Parametric Feature Tree History with Sweep & Loft...');
  const tree = new FeatureTree([
    new FeatureNode({
      id: 'f_sweep',
      name: 'Pipe Sweep',
      type: 'sweep',
      params: sweepDef.params
    }),
    new FeatureNode({
      id: 'f_loft',
      name: 'Transition Loft',
      type: 'loft',
      params: loftDuctDef.params
    })
  ]);

  assert.strictEqual(tree.features.length, 2);
  assert.strictEqual(tree.rollbackIndex, 1);

  // Rollback to sweep only
  tree.setRollbackIndex(0);
  const activeFeatures = tree.getActiveFeatures();
  assert.strictEqual(activeFeatures.length, 1);
  assert.strictEqual(activeFeatures[0].id, 'f_sweep');
  assert(tree.isRolledBack('f_loft'), 'Loft should be rolled back');
  console.log('  Rolled back to base sweep:', activeFeatures.map(f => f.name));

  // Suppress sweep
  tree.setRollbackIndex(1);
  tree.setSuppressed('f_sweep', true);
  const activeWithoutSweep = tree.getActiveFeatures();
  assert.strictEqual(activeWithoutSweep.length, 1);
  assert.strictEqual(activeWithoutSweep[0].id, 'f_loft');
  console.log('  Suppressed sweep, active features:', activeWithoutSweep.map(f => f.name));
  console.log('  -> Test 4 PASSED!\n');

  console.log('=== All 4 Phase 5 Advanced Sweep & Loft Tests PASSED Successfully! ===');
}

runSweepLoftTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
