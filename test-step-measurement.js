import assert from 'assert';
import fs from 'fs';
import { createRequire } from 'module';
import { distancePointToPoint, distanceSegmentToSegment, measureEntities, formatDistance } from './src/core/measure-engine.js';

const require = createRequire(import.meta.url);
const { importFromStep } = require('./main/occ-service.js');

async function runStepMeasurementTest() {
  console.log('=== Starting STEP File Import & 3D Measurement Integration Test ===\n');

  // 1. Read sample_box.step
  console.log('Test 1: Reading and parsing samples/sample_box.step with OpenCascade...');
  const stepContent = fs.readFileSync('./samples/sample_box.step', 'utf-8');
  const result = await importFromStep({ stepContent, fileName: 'sample_box.step' });

  assert(result.ok, 'STEP import must succeed');
  assert(result.meshData, 'Must return meshData');
  const { meshData } = result;

  console.log(`  STEP Model Loaded:`);
  console.log(`  - Vertices count (mesh positions): ${meshData.positions.length / 3}`);
  console.log(`  - Triangles count: ${meshData.index.length / 3}`);
  console.log(`  - B-Rep Faces count: ${meshData.faces ? meshData.faces.length : meshData.faceRanges.length}`);
  console.log(`  - B-Rep Edges count: ${meshData.edges.length}`);
  console.log(`  - B-Rep Vertices count: ${meshData.vertices ? meshData.vertices.length : 0}`);

  assert(meshData.faces.length >= 6, 'Sample box must have at least 6 B-Rep faces');
  assert(meshData.edges.length >= 12, 'Sample box must have at least 12 B-Rep edges');
  assert(meshData.vertices.length >= 8, 'Sample box must have at least 8 B-Rep vertices');
  console.log('  -> Test 1 PASSED!\n');

  // 2. Measure Box Edges (eDrawings linear edge measurement)
  console.log('Test 2: Edge Lengths and Dimensions on Imported STEP model...');
  const edgeLengths = meshData.edges.map((e) => Math.round(e.length)).sort((a, b) => a - b);
  console.log('  Sample edge lengths:', [...new Set(edgeLengths)]);

  // 3. Measure Parallel Planar Faces (eDrawings thickness / wall measurement)
  console.log('Test 3: Measuring Distance between Parallel Faces...');
  // Find two parallel faces with opposing normals (e.g. [0,1,0] and [0,-1,0] or similar)
  const face1 = meshData.faces[0];
  let oppositeFace = null;
  for (let i = 1; i < meshData.faces.length; i++) {
    const f = meshData.faces[i];
    const dotProduct = face1.normal[0] * f.normal[0] + face1.normal[1] * f.normal[1] + face1.normal[2] * f.normal[2];
    if (dotProduct < -0.98) {
      oppositeFace = f;
      break;
    }
  }

  assert(oppositeFace, 'Must find an opposing parallel face on the STEP solid');
  const faceEnt1 = { type: 'face', faceRange: face1 };
  const faceEnt2 = { type: 'face', faceRange: oppositeFace };
  const faceMeasure = measureEntities(faceEnt1, faceEnt2);

  console.log(`  Measured parallel faces: "${face1.topoId}" <-> "${oppositeFace.topoId}"`);
  console.log(`  - Normal Distance: ${formatDistance(faceMeasure.normalDistance, 'mm', 2)}`);
  console.log(`  - Delta X: ${formatDistance(faceMeasure.deltaX, 'mm', 2)}`);
  console.log(`  - Delta Y: ${formatDistance(faceMeasure.deltaY, 'mm', 2)}`);
  console.log(`  - Delta Z: ${formatDistance(faceMeasure.deltaZ, 'mm', 2)}`);
  assert(faceMeasure.isParallel, 'Opposing faces must be recognized as parallel');
  assert(faceMeasure.normalDistance > 0, 'Wall thickness must be greater than 0');
  console.log('  -> Test 3 PASSED!\n');

  // 4. Measure B-Rep Vertices (eDrawings point-to-point distance and delta XYZ)
  console.log('Test 4: Measuring Distance and Delta XYZ between B-Rep Corner Vertices...');
  const v1 = meshData.vertices[0];
  const v2 = meshData.vertices[1];
  const vertEnt1 = { type: 'vertex', worldPoint: v1.point, topoId: v1.topoId };
  const vertEnt2 = { type: 'vertex', worldPoint: v2.point, topoId: v2.topoId };
  const vertMeasure = measureEntities(vertEnt1, vertEnt2);

  console.log(`  Measured vertices: "${v1.topoId}" [${v1.point.map(n=>n.toFixed(1)).join(', ')}] to "${v2.topoId}" [${v2.point.map(n=>n.toFixed(1)).join(', ')}]`);
  console.log(`  - 3D Distance: ${formatDistance(vertMeasure.distance, 'mm', 2)}`);
  console.log(`  - Delta X: ${formatDistance(vertMeasure.deltaX, 'mm', 2)}`);
  console.log(`  - Delta Y: ${formatDistance(vertMeasure.deltaY, 'mm', 2)}`);
  console.log(`  - Delta Z: ${formatDistance(vertMeasure.deltaZ, 'mm', 2)}`);
  assert(vertMeasure.distance > 0, 'Distance between distinct corners must be positive');
  console.log('  -> Test 4 PASSED!\n');

  console.log('=== All STEP Measurement Integration Tests PASSED Successfully! ===\n');
}

runStepMeasurementTest().catch((err) => {
  console.error('STEP measurement test failed:', err);
  process.exit(1);
});
