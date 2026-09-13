const assert = require('assert');
const { FeatureTree, FeatureNode } = require('./src/history/FeatureTree.js');
const occ = require('./main/occ-service.js');

async function runFeatureTreeTests() {
  console.log('=== Starting Phase 2 Feature Tree & History Verification Suite ===\n');

  // Test 1: FeatureTree data model, addition, and ordering
  console.log('Test 1: FeatureTree Construction and Chronological Appending...');
  const tree = new FeatureTree([
    new FeatureNode({ id: 'f1', name: 'Box 1', type: 'box', params: { width: 50, height: 40, depth: 30 } })
  ]);
  assert.strictEqual(tree.features.length, 1, 'Initial tree should have 1 feature');
  assert.strictEqual(tree.rollbackIndex, 0, 'Rollback index should be at feature 0');

  const filletNode = tree.addFeature({
    id: 'f2',
    name: 'Fillet 1',
    type: 'fillet',
    params: { radius: 3 },
    targetRefs: { targetEdgeIds: ['Edge_Face_+X__Face_+Z'] }
  });
  assert.strictEqual(tree.features.length, 2, 'Tree should now have 2 features');
  assert.strictEqual(tree.rollbackIndex, 1, 'Rollback bar should move to end (index 1)');

  const chamferNode = tree.addFeature({
    id: 'f3',
    name: 'Chamfer 1',
    type: 'chamfer',
    params: { distance: 2 },
    targetRefs: { targetEdgeIds: ['Edge_Face_-X__Face_-Y'] }
  });
  assert.strictEqual(tree.features.length, 3, 'Tree should now have 3 features');
  assert.strictEqual(tree.rollbackIndex, 2, 'Rollback bar should be at index 2');

  const activeAll = tree.getActiveFeatures();
  assert.strictEqual(activeAll.length, 3, 'All 3 features should be active initially');
  console.log('  Active features at end:', activeAll.map((f) => f.name));
  console.log('  -> Test 1 PASSED!\n');

  // Test 2: Rollback Bar functionality
  console.log('Test 2: Rollback Bar Positioning and Slicing...');
  // Roll back to base feature only (index 0)
  tree.setRollbackIndex(0);
  assert.strictEqual(tree.rollbackIndex, 0);
  const activeRolled0 = tree.getActiveFeatures();
  assert.strictEqual(activeRolled0.length, 1, 'Only base feature should be active when rolled back to 0');
  assert.strictEqual(activeRolled0[0].name, 'Box 1');
  assert(tree.isRolledBack('f2'), 'Fillet 1 should report as rolled back');
  assert(tree.isRolledBack('f3'), 'Chamfer 1 should report as rolled back');
  assert(!tree.isRolledBack('f1'), 'Box 1 should not be rolled back');
  console.log('  Active features when rolled back to index 0:', activeRolled0.map((f) => f.name));

  // Roll to feature f2 (Fillet 1)
  tree.rollToFeature('f2');
  assert.strictEqual(tree.rollbackIndex, 1);
  const activeRolled1 = tree.getActiveFeatures();
  assert.strictEqual(activeRolled1.length, 2);
  assert(tree.isRolledBack('f3'), 'Chamfer 1 still rolled back');
  assert(!tree.isRolledBack('f2'), 'Fillet 1 is active');
  console.log('  Active features when rolled to Fillet 1:', activeRolled1.map((f) => f.name));

  // Roll to end
  tree.rollToEnd();
  assert.strictEqual(tree.rollbackIndex, 2);
  assert.strictEqual(tree.getActiveFeatures().length, 3);
  console.log('  -> Test 2 PASSED!\n');

  // Test 3: Feature Suppression
  console.log('Test 3: Feature Suppression and Restoration...');
  // Suppress Fillet 1
  tree.setSuppressed('f2', true);
  assert(tree.features[1].suppressed, 'Fillet 1 must be suppressed');
  const activeSuppressed = tree.getActiveFeatures();
  assert.strictEqual(activeSuppressed.length, 2, 'Should only have 2 active features (Box 1 and Chamfer 1)');
  assert.strictEqual(activeSuppressed[0].name, 'Box 1');
  assert.strictEqual(activeSuppressed[1].name, 'Chamfer 1');
  console.log('  Active features with Fillet 1 suppressed:', activeSuppressed.map((f) => f.name));

  // Unsuppress Fillet 1
  tree.toggleSuppression('f2');
  assert(!tree.features[1].suppressed, 'Fillet 1 must be unsuppressed');
  assert.strictEqual(tree.getActiveFeatures().length, 3);
  console.log('  Active features after unsuppression:', tree.getActiveFeatures().map((f) => f.name));
  console.log('  -> Test 3 PASSED!\n');

  // Test 4: Serialization and Deserialization
  console.log('Test 4: FeatureTree JSON Serialization...');
  const json = tree.toJSON();
  assert(Array.isArray(json.features), 'JSON must contain features array');
  assert.strictEqual(json.rollbackIndex, 2);

  const restored = FeatureTree.fromJSON(json);
  assert.strictEqual(restored.features.length, 3);
  assert.strictEqual(restored.rollbackIndex, 2);
  assert.strictEqual(restored.features[1].name, 'Fillet 1');
  assert.strictEqual(restored.features[2].name, 'Chamfer 1');
  console.log('  Successfully serialized and restored 3-node FeatureTree');
  console.log('  -> Test 4 PASSED!\n');

  // Test 5: End-to-end Sequential Re-evaluation via OpenCascade
  console.log('Test 5: OpenCascade Sequential Re-evaluation Pipeline...');
  const mod = await import('opencascade.js/dist/node.js');
  const oc = await mod.default();

  // Base Box evaluation
  const baseRes = await occ.getShapeMeshAndTopology({
    kind: 'box',
    params: { width: 60, height: 40, depth: 30 }
  });
  assert.strictEqual(baseRes.topology.faces.length, 6, 'Base box should have 6 faces');
  console.log('  Base Box: 6 faces, 12 edges');

  // Cumulative Fillet feature
  const targetFilletEdge = 'Edge_Face_+X__Face_+Z';
  const filletRes = await occ.performFillet({
    shapeDef: { kind: 'box', params: { width: 60, height: 40, depth: 30 } },
    radius: 3,
    targetEdgeIds: [targetFilletEdge]
  });
  assert.strictEqual(filletRes.faces.length, 7, 'After Fillet: should have 7 faces');
  console.log('  After Fillet Feature: 7 faces (1 blend face added)');

  // Cumulative Chamfer on top of Fillet
  const cumulativeShapeDef = {
    kind: 'fillet',
    params: {
      basePart: { kind: 'box', params: { width: 60, height: 40, depth: 30 } },
      radius: 3,
      targetEdgeIds: [targetFilletEdge]
    }
  };
  const chamferRes = await occ.performChamfer({
    shapeDef: cumulativeShapeDef,
    distance: 2,
    targetEdgeIds: ['Edge_Face_-X__Face_-Y']
  });
  assert.strictEqual(chamferRes.faces.length, 8, 'After Fillet + Chamfer: should have 8 faces');
  console.log('  After Cumulative Chamfer Feature: 8 faces (both modifiers cleanly applied in order!)');
  console.log('  -> Test 5 PASSED!\n');

  console.log('=== All 5 Phase 2 Feature Tree Tests PASSED Successfully! ===');
}

runFeatureTreeTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
