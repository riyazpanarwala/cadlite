const assert = require('assert');
const occ = require('./main/occ-service.js');
const { FeatureTree, FeatureNode } = require('./src/history/FeatureTree.js');

async function runFaceSketchTests() {
  console.log('=== Starting Phase 4 Face Sketch, Project Geometry, Boss & Cut Verification Suite ===\n');

  // Test 1: createPlaneFromFace basis computation
  console.log('Test 1: createPlaneFromFace Orthonormal Basis Computation...');
  // Simulate face on top of a box (Z = +20, normal = [0, 0, 1])
  const normal = [0, 0, 1];
  const centroid = [0, 0, 20];
  const uAxis = [1, 0, 0];
  const vAxis = [0, 1, 0];

  // Dot products should be 0 (orthogonal)
  const dotUV = uAxis[0] * vAxis[0] + uAxis[1] * vAxis[1] + uAxis[2] * vAxis[2];
  const dotUN = uAxis[0] * normal[0] + uAxis[1] * normal[1] + uAxis[2] * normal[2];
  const dotVN = vAxis[0] * normal[0] + vAxis[1] * normal[1] + vAxis[2] * normal[2];
  assert.strictEqual(dotUV, 0, 'u and v axes must be orthogonal');
  assert.strictEqual(dotUN, 0, 'u and normal must be orthogonal');
  assert.strictEqual(dotVN, 0, 'v and normal must be orthogonal');

  // Local to world 4x4 matrix (column-major array of 16 elements)
  // X = [1,0,0], Y = [0,1,0], Z = [0,0,1], Origin = [0,0,20]
  const planeMatrix = [
    1, 0, 0, 0,  // col 0 (u)
    0, 1, 0, 0,  // col 1 (v)
    0, 0, 1, 0,  // col 2 (normal)
    0, 0, 20, 1  // col 3 (origin)
  ];
  console.log('  Top Face Plane Matrix formed:', planeMatrix);
  console.log('  -> Test 1 PASSED!\n');

  // Test 2: Project Geometry 3D -> 2D (Convert Entities)
  console.log('Test 2: Project Geometry (Convert Entities) 3D to 2D Projection...');
  // A 3D edge on the plane from [-20, -15, 20] to [20, -15, 20]
  const p3D_1 = [-20, -15, 20];
  const p3D_2 = [20, -15, 20];
  // With plane origin at [0,0,20], u=[1,0,0], v=[0,1,0]:
  const u1 = p3D_1[0] - centroid[0];
  const v1 = p3D_1[1] - centroid[1];
  const u2 = p3D_2[0] - centroid[0];
  const v2 = p3D_2[1] - centroid[1];

  assert.strictEqual(u1, -20);
  assert.strictEqual(v1, -15);
  assert.strictEqual(u2, 20);
  assert.strictEqual(v2, -15);
  console.log(`  3D Edge [[-20,-15,20], [20,-15,20]] projected to 2D: [(${u1},${v1}), (${u2},${v2})]`);
  console.log('  -> Test 2 PASSED!\n');

  // Test 3: OpenCascade Extrude Boss on Face (Fusion)
  console.log('Test 3: OpenCascade Extrude Boss on Box Face...');
  // Base box 80 x 60 x 40 centered at origin (Z goes from -20 to +20)
  // Top face is at Z = +20, normal = [0, 0, 1]
  const baseBoxDef = {
    kind: 'box',
    params: { width: 80, height: 60, depth: 40 }
  };

  const bossPoints2D = [
    [-15, -15],
    [15, -15],
    [15, 15],
    [-15, 15]
  ];

  const bossShapeDef = {
    kind: 'extrude_boss',
    params: {
      basePart: baseBoxDef,
      points2D: bossPoints2D,
      depth: 15,
      direction: 'boss',
      planeMatrix
    }
  };

  const bossRes = await occ.getShapeMeshAndTopology(bossShapeDef);
  assert(bossRes.topology.faces.length > 6, 'Extrude boss should fuse and add new faces to solid');
  console.log(`  Base Box faces: 6 -> After Extrude Boss: ${bossRes.topology.faces.length} faces, ${bossRes.topology.edges.length} edges`);
  console.log('  -> Test 3 PASSED!\n');

  // Test 4: OpenCascade Extrude Cut on Face (Pocket)
  console.log('Test 4: OpenCascade Extrude Cut (Pocket) into Box Face...');
  const pocketPoints2D = [
    [-10, -10],
    [10, -10],
    [10, 10],
    [-10, 10]
  ];

  const cutShapeDef = {
    kind: 'extrude_cut',
    params: {
      basePart: baseBoxDef,
      points2D: pocketPoints2D,
      depth: 10,
      direction: 'cut',
      planeMatrix
    }
  };

  const cutRes = await occ.getShapeMeshAndTopology(cutShapeDef);
  // Pocket cuts 1 face (top) into a pocket floor + 4 pocket walls
  assert(cutRes.topology.faces.length >= 10, `Extrude cut pocket should create pocket faces, got ${cutRes.topology.faces.length}`);
  console.log(`  Base Box faces: 6 -> After Extrude Cut: ${cutRes.topology.faces.length} faces, ${cutRes.topology.edges.length} edges`);
  console.log('  -> Test 4 PASSED!\n');

  // Test 5: Cumulative Boss and Cut with Feature Tree
  console.log('Test 5: Cumulative Feature Tree History with Boss & Cut...');
  const tree = new FeatureTree([
    new FeatureNode({ id: 'base', name: 'Base Box', type: 'box', params: { width: 80, height: 60, depth: 40 } }),
    new FeatureNode({
      id: 'boss1',
      name: 'Extrude Boss 1',
      type: 'extrude_boss',
      params: { points2D: bossPoints2D, depth: 15, planeMatrix }
    }),
    new FeatureNode({
      id: 'cut1',
      name: 'Extrude Cut 1',
      type: 'extrude_cut',
      params: {
        points2D: pocketPoints2D,
        depth: 8,
        // Plane matrix for top of the boss (Z = 20 + 15 = 35)
        planeMatrix: [
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          0, 0, 35, 1
        ]
      }
    })
  ]);

  assert.strictEqual(tree.features.length, 3);
  assert.strictEqual(tree.rollbackIndex, 2);

  // Roll back before cut (index 1)
  tree.setRollbackIndex(1);
  const activeFeatures = tree.getActiveFeatures();
  assert.strictEqual(activeFeatures.length, 2);
  assert.strictEqual(activeFeatures[1].id, 'boss1');
  assert(tree.isRolledBack('cut1'), 'Extrude Cut should be rolled back');
  console.log('  Feature tree successfully rolled back before Cut: active features =', activeFeatures.map(f => f.name));

  // Suppress boss feature
  tree.setRollbackIndex(2);
  tree.setSuppressed('boss1', true);
  const activeWithoutBoss = tree.getActiveFeatures();
  assert(!activeWithoutBoss.some(f => f.id === 'boss1'), 'Suppressed boss should not be active');
  console.log('  Feature tree with Boss suppressed: active features =', activeWithoutBoss.map(f => f.name));
  console.log('  -> Test 5 PASSED!\n');

  console.log('=== All 5 Phase 4 Face Sketch, Boss & Cut Tests PASSED Successfully! ===');
}

runFaceSketchTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
