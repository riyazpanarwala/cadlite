/**
 * CADLite 3D Measurement Engine
 *
 * Inspired by Dassault Systèmes SolidWorks eDrawings Measurement Tool.
 * Provides high-precision mathematical dimensioning and geometric calculation
 * across 3D CAD entities: vertices, linear edges, circular arcs, planar faces,
 * cylindrical faces, and solid bodies.
 */

export const UNITS = {
  mm: { name: 'Millimeters', symbol: 'mm', toBase: 1, fromBase: 1 },
  cm: { name: 'Centimeters', symbol: 'cm', toBase: 10, fromBase: 0.1 },
  m:  { name: 'Meters', symbol: 'm', toBase: 1000, fromBase: 0.001 },
  in: { name: 'Inches', symbol: 'in', toBase: 25.4, fromBase: 1 / 25.4 }
};

/** Clamps a scalar to [min, max] range. */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/** Vector dot product. */
export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Vector cross product. */
export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

/** Vector Euclidean length. */
export function vecLen(v) {
  return Math.hypot(v[0], v[1], v[2]);
}

/** Normalized vector. */
export function normalize(v) {
  const len = vecLen(v);
  if (len < 1e-12) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

/** Vector subtraction a - b. */
export function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** Vector addition a + b. */
export function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/** Vector scalar multiplication v * s. */
export function mul(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s];
}

/** Transforms a 3D point [x, y, z] by a 4x4 matrix (16-element array, column-major). */
export function transformPoint(p, matrix) {
  if (!matrix || matrix.length !== 16) return [...p];
  const m = matrix;
  const x = p[0], y = p[1], z = p[2];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1.0;
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w
  ];
}

/** Transforms a direction vector [x, y, z] by a 4x4 matrix (ignores translation). */
export function transformDirection(v, matrix) {
  if (!matrix || matrix.length !== 16) return [...v];
  const m = matrix;
  const x = v[0], y = v[1], z = v[2];
  return normalize([
    m[0] * x + m[4] * y + m[8] * z,
    m[1] * x + m[5] * y + m[9] * z,
    m[2] * x + m[6] * y + m[10] * z
  ]);
}

/**
 * 3D Euclidean distance and delta decomposition between two points P1 and P2.
 */
export function distancePointToPoint(p1, p2) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dz = p2[2] - p1[2];
  const distance = Math.hypot(dx, dy, dz);
  return {
    distance,
    deltaX: Math.abs(dx),
    deltaY: Math.abs(dy),
    deltaZ: Math.abs(dz),
    signedDelta: [dx, dy, dz],
    point1: [...p1],
    point2: [...p2],
    midpoint: [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2]
  };
}

/**
 * Minimum distance from point P to line segment AB.
 */
export function distancePointToSegment(p, a, b) {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const abLenSq = dot(ab, ab);

  let t = abLenSq > 1e-12 ? dot(ap, ab) / abLenSq : 0;
  t = clamp(t, 0, 1);
  const closest = add(a, mul(ab, t));
  const res = distancePointToPoint(p, closest);
  return {
    ...res,
    t,
    closestOnSegment: closest
  };
}

/**
 * Perpendicular distance from point P to plane defined by point C and normal N.
 */
export function distancePointToPlane(p, planePoint, planeNormal) {
  const n = normalize(planeNormal);
  const diff = sub(p, planePoint);
  const signedDist = dot(diff, n);
  const normalDistance = Math.abs(signedDist);
  const projectedPoint = sub(p, mul(n, signedDist));
  const res = distancePointToPoint(p, projectedPoint);

  return {
    ...res,
    normalDistance,
    signedDistance: signedDist,
    projectedPoint
  };
}

/**
 * Angle in degrees between two 3D vectors (0° to 180°).
 */
export function angleBetweenVectors(v1, v2) {
  const u1 = normalize(v1);
  const u2 = normalize(v2);
  const cosTheta = clamp(dot(u1, u2), -1, 1);
  return (Math.acos(cosTheta) * 180) / Math.PI;
}

/**
 * Acute/unsigned angle in degrees between two line directions (0° to 90°).
 */
export function angleBetweenLines(v1, v2) {
  const u1 = normalize(v1);
  const u2 = normalize(v2);
  const cosTheta = clamp(Math.abs(dot(u1, u2)), 0, 1);
  return (Math.acos(cosTheta) * 180) / Math.PI;
}

/**
 * Minimum distance between two 3D line segments (P1-Q1) and (P2-Q2).
 * Returns the closest points on both segments, the distance, and the angle.
 */
export function distanceSegmentToSegment(p1, q1, p2, q2) {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);

  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);

  let s = 0, t = 0;

  if (a <= 1e-12 && e <= 1e-12) {
    s = 0;
    t = 0;
  } else if (a <= 1e-12) {
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    const c = dot(d1, r);
    if (e <= 1e-12) {
      t = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;

      if (Math.abs(denom) > 1e-12) {
        s = clamp((b * f - c * e) / denom, 0, 1);
      } else {
        s = 0; // segments are parallel
      }

      t = (b * s + f) / e;

      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }

  const cp1 = add(p1, mul(d1, s));
  const cp2 = add(p2, mul(d2, t));

  const res = distancePointToPoint(cp1, cp2);
  const angle = angleBetweenLines(d1, d2);
  const isParallel = angle < 0.1;

  return {
    ...res,
    point1: cp1,
    point2: cp2,
    angle,
    isParallel
  };
}

/**
 * Measures two entities (vertices, edges, faces, parts) according to their types.
 */
export function measureEntities(entity1, entity2) {
  if (!entity1) return null;

  // Single-entity inspection mode:
  if (!entity2) {
    return inspectSingleEntity(entity1);
  }

  const t1 = entity1.type;
  const t2 = entity2.type;

  // 1. Point to Point (Vertex to Vertex)
  if (t1 === 'vertex' && t2 === 'vertex') {
    const p1 = entity1.worldPoint;
    const p2 = entity2.worldPoint;
    const res = distancePointToPoint(p1, p2);
    return {
      type: 'point_to_point',
      title: 'Point to Point',
      entity1,
      entity2,
      ...res
    };
  }

  // 2. Point to Edge / Edge to Point
  if ((t1 === 'vertex' && t2 === 'edge') || (t1 === 'edge' && t2 === 'vertex')) {
    const vEnt = t1 === 'vertex' ? entity1 : entity2;
    const eEnt = t1 === 'edge' ? entity1 : entity2;
    const p = vEnt.worldPoint;
    const [a, b] = getEdgeWorldEndpoints(eEnt);
    const res = distancePointToSegment(p, a, b);
    return {
      type: 'point_to_edge',
      title: 'Point to Edge',
      entity1,
      entity2,
      ...res,
      normalDistance: res.distance
    };
  }

  // 3. Point to Face / Face to Point
  if ((t1 === 'vertex' && t2 === 'face') || (t1 === 'face' && t2 === 'vertex')) {
    const vEnt = t1 === 'vertex' ? entity1 : entity2;
    const fEnt = t1 === 'face' ? entity1 : entity2;
    const p = vEnt.worldPoint;
    const { centroid, normal } = getFaceWorldGeometry(fEnt);
    const res = distancePointToPlane(p, centroid, normal);
    return {
      type: 'point_to_face',
      title: 'Point to Face',
      entity1,
      entity2,
      ...res
    };
  }

  // 4. Edge to Edge
  if (t1 === 'edge' && t2 === 'edge') {
    // Check if both are circular/arcs (e.g. hole edges, cylinder rims)
    if (isCircularEdge(entity1) && isCircularEdge(entity2)) {
      return measureCircleToCircle(entity1, entity2);
    }

    const [a1, b1] = getEdgeWorldEndpoints(entity1);
    const [a2, b2] = getEdgeWorldEndpoints(entity2);
    const res = distanceSegmentToSegment(a1, b1, a2, b2);
    return {
      type: 'edge_to_edge',
      title: res.isParallel ? 'Parallel Edges' : 'Edge to Edge',
      entity1,
      entity2,
      ...res,
      normalDistance: res.isParallel ? res.distance : undefined
    };
  }

  // 5. Edge to Face / Face to Edge
  if ((t1 === 'edge' && t2 === 'face') || (t1 === 'face' && t2 === 'edge')) {
    const eEnt = t1 === 'edge' ? entity1 : entity2;
    const fEnt = t1 === 'face' ? entity1 : entity2;
    const [a, b] = getEdgeWorldEndpoints(eEnt);
    const { centroid, normal } = getFaceWorldGeometry(fEnt);

    const edgeDir = normalize(sub(b, a));
    const angleWithNormal = angleBetweenVectors(edgeDir, normal);
    const angleWithFace = Math.abs(90 - angleWithNormal);
    const isParallel = angleWithFace < 0.1;

    // Perpendicular distance from midpoint of edge to plane
    const midEdge = mul(add(a, b), 0.5);
    const planeDist = distancePointToPlane(midEdge, centroid, normal);

    return {
      type: 'edge_to_face',
      title: isParallel ? 'Edge Parallel to Face' : 'Edge to Face',
      entity1,
      entity2,
      distance: planeDist.normalDistance,
      normalDistance: planeDist.normalDistance,
      deltaX: planeDist.deltaX,
      deltaY: planeDist.deltaY,
      deltaZ: planeDist.deltaZ,
      point1: midEdge,
      point2: planeDist.projectedPoint,
      midpoint: [(midEdge[0] + planeDist.projectedPoint[0]) / 2, (midEdge[1] + planeDist.projectedPoint[1]) / 2, (midEdge[2] + planeDist.projectedPoint[2]) / 2],
      angle: angleWithFace,
      isParallel
    };
  }

  // 6. Face to Face
  if (t1 === 'face' && t2 === 'face') {
    // Check if both are cylindrical (e.g. hole to hole, shaft to hole)
    if (isCylindricalFace(entity1) && isCylindricalFace(entity2)) {
      return measureCylinderToCylinder(entity1, entity2);
    }

    const fg1 = getFaceWorldGeometry(entity1);
    const fg2 = getFaceWorldGeometry(entity2);

    const normalAngle = angleBetweenVectors(fg1.normal, fg2.normal);
    const isParallel = normalAngle < 0.2 || Math.abs(normalAngle - 180) < 0.2;

    if (isParallel) {
      // Parallel planes: compute normal distance
      const signedDist = dot(sub(fg2.centroid, fg1.centroid), fg1.normal);
      const normalDistance = Math.abs(signedDist);
      const projPoint2 = sub(fg2.centroid, mul(fg1.normal, signedDist));
      const res = distancePointToPoint(fg1.centroid, projPoint2);

      return {
        type: 'face_to_face',
        title: 'Parallel Faces',
        entity1,
        entity2,
        distance: normalDistance,
        normalDistance,
        deltaX: Math.abs(fg1.centroid[0] - projPoint2[0]),
        deltaY: Math.abs(fg1.centroid[1] - projPoint2[1]),
        deltaZ: Math.abs(fg1.centroid[2] - projPoint2[2]),
        point1: fg1.centroid,
        point2: projPoint2,
        midpoint: [(fg1.centroid[0] + projPoint2[0]) / 2, (fg1.centroid[1] + projPoint2[1]) / 2, (fg1.centroid[2] + projPoint2[2]) / 2],
        angle: normalAngle > 90 ? 180 - normalAngle : normalAngle,
        isParallel: true
      };
    } else {
      // Angular faces: report angle between face normals
      const angle = normalAngle > 90 ? 180 - normalAngle : normalAngle;
      const res = distancePointToPoint(fg1.centroid, fg2.centroid);

      return {
        type: 'face_to_face',
        title: 'Angular Faces',
        entity1,
        entity2,
        ...res,
        angle,
        isParallel: false
      };
    }
  }

  // Fallback: measure between centroids/anchor points
  const p1 = getEntityWorldPoint(entity1);
  const p2 = getEntityWorldPoint(entity2);
  const res = distancePointToPoint(p1, p2);
  return {
    type: 'generic',
    title: `${entity1.type} to ${entity2.type}`,
    entity1,
    entity2,
    ...res
  };
}

/**
 * Measures two circular edges / arcs (e.g. hole rims).
 * Computes center distance, min clearance, max span, and diameters.
 */
export function measureCircleToCircle(e1, e2) {
  const c1 = getCircleWorldGeometry(e1);
  const c2 = getCircleWorldGeometry(e2);

  const centerDist = Math.hypot(c2.center[0] - c1.center[0], c2.center[1] - c1.center[1], c2.center[2] - c1.center[2]);
  const r1 = c1.radius;
  const r2 = c2.radius;

  const minDistance = Math.max(0, centerDist - r1 - r2);
  const maxDistance = centerDist + r1 + r2;

  // Vector connecting centers
  const dir = normalize(sub(c2.center, c1.center));
  const innerPoint1 = add(c1.center, mul(dir, r1));
  const innerPoint2 = sub(c2.center, mul(dir, r2));

  const res = distancePointToPoint(c1.center, c2.center);

  return {
    type: 'circle_to_circle',
    title: 'Circle to Circle (Holes/Arcs)',
    entity1: e1,
    entity2: e2,
    distance: centerDist,
    centerDistance: centerDist,
    minDistance,
    maxDistance,
    radius1: r1,
    radius2: r2,
    diameter1: r1 * 2,
    diameter2: r2 * 2,
    deltaX: res.deltaX,
    deltaY: res.deltaY,
    deltaZ: res.deltaZ,
    point1: c1.center,
    point2: c2.center,
    innerPoint1,
    innerPoint2,
    midpoint: res.midpoint
  };
}

/**
 * Measures two cylindrical faces (e.g. shaft to hole, hole to hole).
 */
export function measureCylinderToCylinder(f1, f2) {
  const c1 = getCylinderWorldGeometry(f1);
  const c2 = getCylinderWorldGeometry(f2);

  const centerDist = Math.hypot(c2.centroid[0] - c1.centroid[0], c2.centroid[1] - c1.centroid[1], c2.centroid[2] - c1.centroid[2]);
  const r1 = c1.radius;
  const r2 = c2.radius;

  const minDistance = Math.max(0, centerDist - r1 - r2);
  const maxDistance = centerDist + r1 + r2;

  const axisAngle = angleBetweenLines(c1.axis, c2.axis);
  const isParallel = axisAngle < 0.2;

  const res = distancePointToPoint(c1.centroid, c2.centroid);

  return {
    type: 'cylinder_to_cylinder',
    title: isParallel ? 'Parallel Cylinders / Holes' : 'Cylinders',
    entity1: f1,
    entity2: f2,
    distance: centerDist,
    centerDistance: centerDist,
    minDistance,
    maxDistance,
    radius1: r1,
    radius2: r2,
    diameter1: r1 * 2,
    diameter2: r2 * 2,
    axisAngle,
    isParallel,
    deltaX: res.deltaX,
    deltaY: res.deltaY,
    deltaZ: res.deltaZ,
    point1: c1.centroid,
    point2: c2.centroid,
    midpoint: res.midpoint
  };
}

/**
 * Inspects a single CAD entity (vertex, edge, face, or part).
 */
export function inspectSingleEntity(entity) {
  if (entity.type === 'vertex') {
    const wp = entity.worldPoint;
    return {
      type: 'single_vertex',
      title: 'Vertex',
      entity1: entity,
      point1: wp,
      midpoint: wp,
      coordinates: wp,
      deltaX: Math.abs(wp[0]),
      deltaY: Math.abs(wp[1]),
      deltaZ: Math.abs(wp[2]),
      distance: 0
    };
  }

  if (entity.type === 'edge') {
    const [a, b] = getEdgeWorldEndpoints(entity);
    const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const res = distancePointToPoint(a, b);
    const isCirc = isCircularEdge(entity);
    let circData = null;

    if (isCirc) {
      const c = getCircleWorldGeometry(entity);
      circData = {
        radius: c.radius,
        diameter: c.radius * 2,
        center: c.center
      };
    }

    return {
      type: 'single_edge',
      title: isCirc ? 'Circular Edge / Arc' : 'Linear Edge',
      entity1: entity,
      length,
      distance: length,
      point1: a,
      point2: b,
      midpoint: res.midpoint,
      deltaX: res.deltaX,
      deltaY: res.deltaY,
      deltaZ: res.deltaZ,
      isCircular: isCirc,
      ...circData
    };
  }

  if (entity.type === 'face') {
    const fg = getFaceWorldGeometry(entity);
    const isCyl = isCylindricalFace(entity);
    let cylData = null;

    if (isCyl) {
      const c = getCylinderWorldGeometry(entity);
      cylData = {
        radius: c.radius,
        diameter: c.radius * 2,
        axis: c.axis
      };
    }

    return {
      type: 'single_face',
      title: `${fg.surfaceType.toUpperCase()} Face`,
      entity1: entity,
      area: fg.area,
      surfaceType: fg.surfaceType,
      normal: fg.normal,
      point1: fg.centroid,
      midpoint: fg.centroid,
      isCylindrical: isCyl,
      ...cylData
    };
  }

  if (entity.type === 'part') {
    return {
      type: 'single_part',
      title: `Part "${entity.part.name}"`,
      entity1: entity
    };
  }

  return null;
}

// ---------------------------------------------------------------------
// Geometry Extraction Helpers
// ---------------------------------------------------------------------

function isCircularEdge(edgeEnt) {
  const ed = edgeEnt.edgeData;
  if (!ed) return false;
  if (ed.curveType === 'circle' || ed.curveType === 'arc') return true;
  if (ed.radius && ed.radius > 0) return true;
  return false;
}

function getCircleWorldGeometry(edgeEnt) {
  const ed = edgeEnt.edgeData;
  const mat = edgeEnt.part ? edgeEnt.part.object3D.matrixWorld.elements : null;

  let radius = ed.radius || 10;
  let center = ed.center ? [...ed.center] : (ed.centroid ? [...ed.centroid] : [0, 0, 0]);

  // If OpenCascade didn't give explicit radius, fit circle through polyline points
  if ((!ed.radius || ed.radius <= 0) && ed.polyline && ed.polyline.length >= 3) {
    const fit = fitCircle3D(ed.polyline);
    if (fit) {
      radius = fit.radius;
      center = fit.center;
    }
  }

  if (mat) {
    center = transformPoint(center, mat);
    // Scale radius by matrix scale if non-uniform
    const scaleX = Math.hypot(mat[0], mat[1], mat[2]);
    radius *= scaleX;
  }

  return { radius, center };
}

function isCylindricalFace(faceEnt) {
  const fr = faceEnt.faceRange;
  return fr && (fr.surfaceType === 'cylinder' || fr.surfaceType === 'cone');
}

function getCylinderWorldGeometry(faceEnt) {
  const fr = faceEnt.faceRange;
  const mat = faceEnt.part ? faceEnt.part.object3D.matrixWorld.elements : null;

  let radius = fr.radius || 10;
  let centroid = fr.centroid ? [...fr.centroid] : [0, 0, 0];
  let axis = fr.axis ? [...fr.axis] : [0, 1, 0];

  if (mat) {
    centroid = transformPoint(centroid, mat);
    axis = transformDirection(axis, mat);
    const scaleX = Math.hypot(mat[0], mat[1], mat[2]);
    radius *= scaleX;
  }

  return { radius, centroid, axis };
}

function getEdgeWorldEndpoints(edgeEnt) {
  const ed = edgeEnt.edgeData;
  const mat = edgeEnt.part ? edgeEnt.part.object3D.matrixWorld.elements : null;

  let a = [0, 0, 0];
  let b = [0, 0, 0];

  if (ed && ed.polyline && ed.polyline.length >= 2) {
    a = [...ed.polyline[0]];
    b = [...ed.polyline[ed.polyline.length - 1]];
  } else if (ed && ed.centroid) {
    a = [...ed.centroid];
    b = [...ed.centroid];
  }

  if (mat) {
    a = transformPoint(a, mat);
    b = transformPoint(b, mat);
  }

  return [a, b];
}

function getFaceWorldGeometry(faceEnt) {
  const fr = faceEnt.faceRange;
  const mat = faceEnt.part ? faceEnt.part.object3D.matrixWorld.elements : null;

  let centroid = fr && fr.centroid ? [...fr.centroid] : [0, 0, 0];
  let normal = fr && fr.normal ? [...fr.normal] : [0, 0, 1];
  let area = fr && fr.area ? fr.area : 0;
  let surfaceType = fr && fr.surfaceType ? fr.surfaceType : 'plane';

  if (mat) {
    centroid = transformPoint(centroid, mat);
    normal = transformDirection(normal, mat);
    // Area scales with square of linear scale
    const scaleX = Math.hypot(mat[0], mat[1], mat[2]);
    area *= (scaleX * scaleX);
  }

  return { centroid, normal, area, surfaceType };
}

function getEntityWorldPoint(entity) {
  if (entity.worldPoint) return entity.worldPoint;
  if (entity.type === 'edge') {
    const [a, b] = getEdgeWorldEndpoints(entity);
    return mul(add(a, b), 0.5);
  }
  if (entity.type === 'face') {
    return getFaceWorldGeometry(entity).centroid;
  }
  return [0, 0, 0];
}

/**
 * Numerical 3-point circle fitting through a 3D polyline sample.
 */
function fitCircle3D(polyline) {
  if (!polyline || polyline.length < 3) return null;
  const p1 = polyline[0];
  const p2 = polyline[Math.floor(polyline.length / 2)];
  const p3 = polyline[polyline.length - 1];

  const v1 = sub(p2, p1);
  const v2 = sub(p3, p1);
  const cr = cross(v1, v2);
  const crLen = vecLen(cr);
  if (crLen < 1e-6) return null; // Collinear

  // Circumcircle radius = (a * b * c) / (4 * Area)
  const a = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
  const b = Math.hypot(p3[0] - p2[0], p3[1] - p2[1], p3[2] - p2[2]);
  const c = Math.hypot(p1[0] - p3[0], p1[1] - p3[1], p1[2] - p3[2]);

  const radius = (a * b * c) / (2 * crLen);

  // Circumcenter
  const alpha = (b * b * dot(sub(p1, p3), sub(p2, p3))) / (2 * crLen * crLen);
  const beta  = (c * c * dot(sub(p2, p1), sub(p3, p1))) / (2 * crLen * crLen);
  const gamma = (a * a * dot(sub(p3, p2), sub(p1, p2))) / (2 * crLen * crLen);

  const center = [
    alpha * p1[0] + beta * p2[0] + gamma * p3[0],
    alpha * p1[1] + beta * p2[1] + gamma * p3[1],
    alpha * p1[2] + beta * p2[2] + gamma * p3[2]
  ];

  return { radius, center };
}

// ---------------------------------------------------------------------
// Formatting Utilities
// ---------------------------------------------------------------------

/**
 * Formats a distance value from base (mm) to chosen unit with specified decimals.
 */
export function formatDistance(valMm, unitKey = 'mm', decimals = 2) {
  if (valMm === null || valMm === undefined || isNaN(valMm)) return '-';
  const u = UNITS[unitKey] || UNITS.mm;
  const converted = valMm * u.fromBase;
  return `${converted.toFixed(decimals)} ${u.symbol}`;
}

/**
 * Formats an area value from base (mm²) to chosen unit.
 */
export function formatArea(valMm2, unitKey = 'mm', decimals = 1) {
  if (valMm2 === null || valMm2 === undefined || isNaN(valMm2)) return '-';
  let factor = 1;
  let sym = 'mm²';
  if (unitKey === 'cm') { factor = 0.01; sym = 'cm²'; }
  else if (unitKey === 'm') { factor = 0.000001; sym = 'm²'; }
  else if (unitKey === 'in') { factor = 1 / (25.4 * 25.4); sym = 'in²'; }

  const converted = valMm2 * factor;
  return `${converted.toFixed(decimals)} ${sym}`;
}

/**
 * Formats an angle in degrees.
 */
export function formatAngle(valDeg, decimals = 1) {
  if (valDeg === null || valDeg === undefined || isNaN(valDeg)) return '-';
  return `${valDeg.toFixed(decimals)}°`;
}
