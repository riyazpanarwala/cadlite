import assert from 'assert';
import {
  distancePointToPoint,
  distancePointToSegment,
  distancePointToPlane,
  distanceSegmentToSegment,
  angleBetweenVectors,
  angleBetweenLines,
  measureEntities,
  measureCircleToCircle,
  formatDistance,
  formatArea,
  formatAngle
} from './src/core/measure-engine.js';

console.log('=== Running CADLite 3D Measurement Engine Test Suite ===\n');

// 1. Point to Point distance and Delta XYZ
console.log('Test 1: Point to Point & Delta XYZ calculation...');
const p1 = [10, 20, 30];
const p2 = [40, 60, 30];
const res1 = distancePointToPoint(p1, p2);
assert.strictEqual(res1.distance, 50, '3-4-5 triangle should yield distance 50');
assert.strictEqual(res1.deltaX, 30, 'Delta X should be 30');
assert.strictEqual(res1.deltaY, 40, 'Delta Y should be 40');
assert.strictEqual(res1.deltaZ, 0, 'Delta Z should be 0');
assert.deepStrictEqual(res1.midpoint, [25, 40, 30], 'Midpoint should be [25, 40, 30]');
console.log('  -> Test 1 PASSED!\n');

// 2. Point to Segment distance
console.log('Test 2: Point to Line Segment...');
const segA = [0, 0, 0];
const segB = [100, 0, 0];
const pointP = [50, 25, 0];
const res2 = distancePointToSegment(pointP, segA, segB);
assert.strictEqual(res2.distance, 25, 'Perpendicular distance to segment should be 25');
assert.deepStrictEqual(res2.closestOnSegment, [50, 0, 0], 'Closest point on segment should be [50, 0, 0]');
console.log('  -> Test 2 PASSED!\n');

// 3. Point to Plane perpendicular distance
console.log('Test 3: Point to Plane Perpendicular Distance...');
const planePt = [0, 50, 0];
const planeNorm = [0, 1, 0];
const testPt = [12, 85, 34];
const res3 = distancePointToPlane(testPt, planePt, planeNorm);
assert.strictEqual(res3.normalDistance, 35, 'Normal distance should be 85 - 50 = 35');
assert.deepStrictEqual(res3.projectedPoint, [12, 50, 34], 'Projected point should be [12, 50, 34]');
console.log('  -> Test 3 PASSED!\n');

// 4. Parallel Edges distance and Angle
console.log('Test 4: Parallel and Angular Edges...');
const e1a = [0, 0, 0], e1b = [100, 0, 0];
const e2a = [0, 40, 0], e2b = [100, 40, 0];
const res4 = distanceSegmentToSegment(e1a, e1b, e2a, e2b);
assert(res4.isParallel, 'Edges along X axis must be parallel');
assert.strictEqual(res4.distance, 40, 'Distance between parallel edges should be 40');
assert.strictEqual(res4.angle, 0, 'Angle between parallel edges should be 0 deg');

// Perpendicular edges
const e3a = [0, 0, 0], e3b = [0, 100, 0];
const resPerp = distanceSegmentToSegment(e1a, e1b, e3a, e3b);
assert.strictEqual(resPerp.angle, 90, 'Angle between X and Y edges should be 90 deg');
console.log('  -> Test 4 PASSED!\n');

// 5. Circle to Circle clearance and center distance
console.log('Test 5: Circle to Circle (Holes) Clearance...');
const circ1 = {
  type: 'edge',
  edgeData: { curveType: 'circle', radius: 10, center: [0, 0, 0] }
};
const circ2 = {
  type: 'edge',
  edgeData: { curveType: 'circle', radius: 15, center: [65, 0, 0] }
};
const res5 = measureEntities(circ1, circ2);
assert.strictEqual(res5.centerDistance, 65, 'Center distance should be 65');
assert.strictEqual(res5.minDistance, 40, 'Min clearance should be 65 - 10 - 15 = 40');
assert.strictEqual(res5.maxDistance, 90, 'Max span should be 65 + 10 + 15 = 90');
assert.strictEqual(res5.diameter1, 20, 'Circle 1 diameter should be 20');
assert.strictEqual(res5.diameter2, 30, 'Circle 2 diameter should be 30');
console.log('  -> Test 5 PASSED!\n');

// 6. Parallel Faces measurement (e.g. box wall thickness)
console.log('Test 6: Parallel Faces (Plate Thickness)...');
const faceTop = {
  type: 'face',
  faceRange: { surfaceType: 'plane', normal: [0, 1, 0], centroid: [0, 30, 0], area: 1200 }
};
const faceBottom = {
  type: 'face',
  faceRange: { surfaceType: 'plane', normal: [0, -1, 0], centroid: [0, 0, 0], area: 1200 }
};
const res6 = measureEntities(faceTop, faceBottom);
assert(res6.isParallel, 'Faces with [0,1,0] and [0,-1,0] must be parallel');
assert.strictEqual(res6.normalDistance, 30, 'Wall thickness should be exactly 30');
console.log('  -> Test 6 PASSED!\n');

// 7. Unit Formatting
console.log('Test 7: Unit Formatting (mm, in, cm)...');
assert.strictEqual(formatDistance(25.4, 'in', 2), '1.00 in', '25.4 mm should format to 1.00 in');
assert.strictEqual(formatDistance(100, 'mm', 1), '100.0 mm', '100 mm formatting');
assert.strictEqual(formatDistance(100, 'cm', 1), '10.0 cm', '100 mm = 10.0 cm');
assert.strictEqual(formatAngle(90.0, 1), '90.0°', 'Angle formatting');
assert.strictEqual(formatArea(1000, 'mm', 1), '1000.0 mm²', 'Area formatting');
console.log('  -> Test 7 PASSED!\n');

console.log('=== All 7 Measurement Engine Tests PASSED Successfully! ===\n');
