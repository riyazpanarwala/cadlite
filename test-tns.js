const assert = require('assert');
const { analyzeTopology, resolveEdgesByTopoIds } = require('./main/topology-naming.js');
const occ = require('./main/occ-service.js');

async function runTests() {
  console.log('=== Starting Phase 1 TNS Verification Suite ===\n');

  // Test 1: Topology analysis on OpenCascade Box
  console.log('Test 1: Box Topology Extraction & Deterministic Naming...');
  const mod = await import('opencascade.js/dist/node.js');
  const oc = await mod.default();
  const box = new oc.BRepPrimAPI_MakeBox_2(60, 40, 20).Shape();

  const topoBox = analyzeTopology(oc, box);
  assert.strictEqual(topoBox.faces.length, 6, 'Box should have exactly 6 faces');
  assert.strictEqual(topoBox.edges.length, 12, 'Box should have exactly 12 edges');

  const faceIds = topoBox.faces.map((f) => f.topoId).sort();
  console.log('  Found Faces:', faceIds);
  assert(faceIds.includes('Face_+X'), 'Must have Face_+X');
  assert(faceIds.includes('Face_-X'), 'Must have Face_-X');
  assert(faceIds.includes('Face_+Y'), 'Must have Face_+Y');
  assert(faceIds.includes('Face_-Y'), 'Must have Face_-Y');
  assert(faceIds.includes('Face_+Z'), 'Must have Face_+Z');
  assert(faceIds.includes('Face_-Z'), 'Must have Face_-Z');

  const edgeSample = topoBox.edges[0];
  console.log(`  Sample Edge ID: ${edgeSample.topoId}, Adjacent: [${edgeSample.adjacentFaceIds.join(', ')}]`);
  assert(edgeSample.topoId.startsWith('Edge_Face_'), 'Edge topoId must be derived from adjacent faces');
  assert.strictEqual(edgeSample.adjacentFaceIds.length, 2, 'Edge must be adjacent to 2 faces');
  console.log('  -> Test 1 PASSED!\n');

  // Test 2: getShapeMeshAndTopology service API
  console.log('Test 2: getShapeMeshAndTopology Service IPC API...');
  const res = await occ.getShapeMeshAndTopology({
    kind: 'box',
    params: { width: 50, height: 50, depth: 50 }
  });
  assert(res.meshData, 'Must return meshData');
  assert(res.meshData.faceRanges.length === 6, 'Must return 6 faceRanges');
  assert(res.meshData.edges.length === 12, 'Must return 12 edges with polyline');
  assert(res.meshData.positions.length > 0, 'Positions must be populated');
  assert(res.meshData.index.length > 0, 'Indices must be populated');
  console.log(`  FaceRanges: ${res.meshData.faceRanges.length}, Edges: ${res.meshData.edges.length}, Triangles: ${res.meshData.index.length / 3}`);
  console.log('  -> Test 2 PASSED!\n');

  // Test 3: Targeted Edge Fillet using TNS ID
  console.log('Test 3: Targeted Fillet on Specific TNS Edge...');
  const targetEdgeId = topoBox.edges.find((e) => e.adjacentFaceIds.includes('Face_+X') && e.adjacentFaceIds.includes('Face_+Z')).topoId;
  console.log(`  Selected Target Edge: "${targetEdgeId}"`);

  const filletRes = await occ.performFillet({
    shapeDef: { kind: 'box', params: { width: 60, height: 40, depth: 20 } },
    radius: 3,
    targetEdgeIds: [targetEdgeId]
  });

  assert(filletRes.faces.length === 7, 'Targeted fillet should produce 7 faces (6 base + 1 blend face)');
  console.log('  Post-fillet faces count:', filletRes.faces.length);
  const blendFace = filletRes.faces.find((f) => f.surfaceType === 'cylinder');
  assert(blendFace, 'Fillet must generate a cylindrical blend face');
  console.log('  Identified blend face:', blendFace.topoId, `(${blendFace.surfaceType})`);
  console.log('  -> Test 3 PASSED!\n');

  // Test 4: Targeted Edge Chamfer using TNS ID
  console.log('Test 4: Targeted Chamfer on Specific TNS Edge...');
  const chamferRes = await occ.performChamfer({
    shapeDef: { kind: 'box', params: { width: 60, height: 40, depth: 20 } },
    distance: 4,
    targetEdgeIds: [targetEdgeId]
  });

  assert(chamferRes.faces.length === 7, 'Targeted chamfer should produce 7 faces');
  console.log('  Post-chamfer faces count:', chamferRes.faces.length);
  console.log('  -> Test 4 PASSED!\n');

  // Test 5: Upstream dimension change resilience
  console.log('Test 5: Upstream Parameter Edit Resilience...');
  console.log('  Modifying Box dimensions from (60x40x20) to (120x80x50)...');
  const resizedBox = new oc.BRepPrimAPI_MakeBox_2(120, 80, 50).Shape();
  const reResolved = resolveEdgesByTopoIds(oc, resizedBox, [targetEdgeId]);
  assert.strictEqual(reResolved.length, 1, 'Target edge must still be uniquely resolved on resized model');
  console.log(`  Target Edge "${targetEdgeId}" successfully re-resolved on modified solid geometry!`);
  console.log('  -> Test 5 PASSED!\n');

  console.log('=== All 5 Verification Tests PASSED Successfully! ===');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
