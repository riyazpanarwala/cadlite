/**
 * Topological Naming Service (TNS) for CadLite.
 *
 * Provides deterministic, persistent topological identification for OpenCascade
 * B-Rep faces and edges, geometric signature calculation, and entity resolution
 * across modeling operations and parameter edits.
 */

/**
 * Maps OpenCascade SurfaceType enum to human-readable string.
 */
function getSurfaceTypeName(oc, surfaceType) {
  const G = oc.GeomAbs_SurfaceType;
  if (surfaceType === G.GeomAbs_Plane) return 'plane';
  if (surfaceType === G.GeomAbs_Cylinder) return 'cylinder';
  if (surfaceType === G.GeomAbs_Cone) return 'cone';
  if (surfaceType === G.GeomAbs_Sphere) return 'sphere';
  if (surfaceType === G.GeomAbs_Torus) return 'torus';
  if (surfaceType === G.GeomAbs_BezierSurface || surfaceType === G.GeomAbs_BSplineSurface) return 'bspline';
  return 'freeform';
}

/**
 * Maps OpenCascade CurveType enum to human-readable string.
 */
function getCurveTypeName(oc, curveType) {
  const G = oc.GeomAbs_CurveType;
  if (curveType === G.GeomAbs_Line) return 'line';
  if (curveType === G.GeomAbs_Circle) return 'circle';
  if (curveType === G.GeomAbs_Ellipse) return 'ellipse';
  if (curveType === G.GeomAbs_BSplineCurve || curveType === G.GeomAbs_BezierCurve) return 'bspline';
  return 'curve';
}

/**
 * Computes outward normal and centroid for an OpenCascade face.
 */
function computeFaceGeometry(oc, face) {
  let surfaceType = 'other';
  let normal = [0, 0, 1];
  let centroid = [0, 0, 0];
  let area = 0;

  try {
    const gprops = new oc.GProp_GProps_1();
    oc.BRepGProp.SurfaceProperties_1(face, gprops, false, false);
    area = gprops.Mass();
    const cm = gprops.CentreOfMass();
    centroid = [cm.X(), cm.Y(), cm.Z()];
  } catch (_) {}

  try {
    const surf = new oc.BRepAdaptor_Surface_2(face, true);
    surfaceType = getSurfaceTypeName(oc, surf.GetType());

    const uMid = (surf.FirstUParameter() + surf.LastUParameter()) / 2;
    const vMid = (surf.FirstVParameter() + surf.LastVParameter()) / 2;
    const p = new oc.gp_Pnt_1();
    const d1u = new oc.gp_Vec_1();
    const d1v = new oc.gp_Vec_1();
    surf.D1(uMid, vMid, p, d1u, d1v);

    const normVec = d1u.Crossed(d1v);
    if (normVec.Magnitude() > 1e-6) {
      normVec.Normalize();
      if (face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED) {
        normVec.Reverse();
      }
      normal = [normVec.X(), normVec.Y(), normVec.Z()];
    }
  } catch (_) {}

  return { surfaceType, normal, centroid, area };
}

/**
 * Generates a stable deterministic topological ID for a face.
 */
function generateFaceTopoId(faceIndex, geom, context = {}) {
  const { surfaceType, normal, centroid } = geom;
  const [nx, ny, nz] = normal;

  // Planar faces with canonical normals (box caps, extrusion caps)
  if (surfaceType === 'plane') {
    const rnx = Math.round(nx * 100) / 100;
    const rny = Math.round(ny * 100) / 100;
    const rnz = Math.round(nz * 100) / 100;

    if (Math.abs(rnx - 1) < 0.05) return 'Face_+X';
    if (Math.abs(rnx + 1) < 0.05) return 'Face_-X';
    if (Math.abs(rny - 1) < 0.05) return 'Face_+Y';
    if (Math.abs(rny + 1) < 0.05) return 'Face_-Y';
    if (Math.abs(rnz - 1) < 0.05) return 'Face_+Z';
    if (Math.abs(rnz + 1) < 0.05) return 'Face_-Z';

    return `Face_plane_${rnx}_${rny}_${rnz}`;
  }

  // Cylindrical faces (cylinder wall, hole inner wall, revolved wall)
  if (surfaceType === 'cylinder') {
    return `Face_cylindrical_${faceIndex}`;
  }

  // Spherical or conical faces
  if (surfaceType === 'sphere') return `Face_sphere_${faceIndex}`;
  if (surfaceType === 'cone') return `Face_cone_${faceIndex}`;
  if (surfaceType === 'torus') return `Face_torus_${faceIndex}`;

  return `Face_${surfaceType}_${faceIndex}`;
}

/**
 * Extracts and samples 3D points along an edge for viewport rendering and picking.
 */
function sampleEdgePolyline(oc, edge) {
  let curveType = 'line';
  let length = 0;
  let centroid = [0, 0, 0];
  const polyline = [];

  try {
    const cProps = new oc.GProp_GProps_1();
    oc.BRepGProp.LinearProperties(edge, cProps, false, false);
    length = cProps.Mass();
    const cm = cProps.CentreOfMass();
    centroid = [cm.X(), cm.Y(), cm.Z()];
  } catch (_) {}

  try {
    const curveAdaptor = new oc.BRepAdaptor_Curve_2(edge);
    curveType = getCurveTypeName(oc, curveAdaptor.GetType());
    const u1 = curveAdaptor.FirstParameter();
    const u2 = curveAdaptor.LastParameter();

    const isLine = curveType === 'line';
    const samples = isLine ? 2 : 20;

    for (let s = 0; s < samples; s++) {
      const u = u1 + (u2 - u1) * (s / (samples - 1));
      const p = curveAdaptor.Value(u);
      polyline.push([p.X(), p.Y(), p.Z()]);
    }
  } catch (_) {}

  return { curveType, length, centroid, polyline };
}

/**
 * Analyzes an OpenCascade solid shape and returns its complete topological graph:
 * - Deterministic face metadata + topoIds
 * - Deterministic edge metadata + topoIds (derived from adjacent face lineage)
 * - Map of OpenCascade face & edge objects for downstream targeted operations
 */
function analyzeTopology(oc, shape, context = {}) {
  const faceMap = new oc.TopTools_IndexedMapOfShape_1();
  oc.TopExp.MapShapes_1(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, faceMap);

  const numFaces = faceMap.Extent();
  const faces = [];
  const faceShapeList = [];
  const faceIdCounts = new Map();

  for (let i = 1; i <= numFaces; i++) {
    const faceShape = oc.TopoDS.Face_1(faceMap.FindKey(i));
    faceShapeList.push(faceShape);

    const geom = computeFaceGeometry(oc, faceShape);
    let topoId = generateFaceTopoId(i, geom, context);

    // Ensure uniqueness if multiple faces share the same planar normal or type
    if (faceIdCounts.has(topoId)) {
      const count = faceIdCounts.get(topoId) + 1;
      faceIdCounts.set(topoId, count);
      topoId = `${topoId}_${count}`;
    } else {
      faceIdCounts.set(topoId, 1);
    }

    faces.push({
      index: i - 1, // 0-indexed for JS
      topoId,
      surfaceType: geom.surfaceType,
      normal: geom.normal,
      centroid: geom.centroid,
      area: geom.area
    });
  }

  // Edge to faces adjacency map
  const edgeToFaces = new oc.TopTools_IndexedDataMapOfShapeListOfShape_1();
  oc.TopExp.MapShapesAndAncestors(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_FACE, edgeToFaces);

  const numEdges = edgeToFaces.Extent();
  const edges = [];
  const edgeShapeList = [];
  const edgeIdCounts = new Map();

  for (let i = 1; i <= numEdges; i++) {
    const edgeShape = oc.TopoDS.Edge_1(edgeToFaces.FindKey(i));
    edgeShapeList.push(edgeShape);

    const adjacentFaceIds = [];
    const faceList = edgeToFaces.FindFromIndex(i);
    const sz = faceList.Size();

    if (sz >= 1) {
      const f1 = faceList.First_1();
      const idx1 = faceMap.FindIndex(f1);
      if (idx1 > 0 && idx1 <= faces.length) adjacentFaceIds.push(faces[idx1 - 1].topoId);
    }
    if (sz >= 2) {
      const f2 = faceList.Last_1();
      const idx2 = faceMap.FindIndex(f2);
      if (idx2 > 0 && idx2 <= faces.length && (adjacentFaceIds.length === 0 || adjacentFaceIds[0] !== faces[idx2 - 1].topoId)) {
        adjacentFaceIds.push(faces[idx2 - 1].topoId);
      }
    }

    adjacentFaceIds.sort();

    // Deterministic edge ID based on adjacent faces
    let edgeTopoId = adjacentFaceIds.length > 0 ? `Edge_${adjacentFaceIds.join('__')}` : `Edge_${i}`;

    if (edgeIdCounts.has(edgeTopoId)) {
      const count = edgeIdCounts.get(edgeTopoId) + 1;
      edgeIdCounts.set(edgeTopoId, count);
      edgeTopoId = `${edgeTopoId}_${count}`;
    } else {
      edgeIdCounts.set(edgeTopoId, 1);
    }

    const edgeGeom = sampleEdgePolyline(oc, edgeShape);

    edges.push({
      index: i - 1,
      topoId: edgeTopoId,
      curveType: edgeGeom.curveType,
      length: edgeGeom.length,
      centroid: edgeGeom.centroid,
      adjacentFaceIds,
      polyline: edgeGeom.polyline
    });
  }

  return {
    faces,
    edges,
    faceShapeList,
    edgeShapeList
  };
}

/**
 * Finds specific OpenCascade TopoDS_Edge shapes matching the given target edge topoIds.
 */
function resolveEdgesByTopoIds(oc, shape, targetEdgeIds = []) {
  if (!targetEdgeIds || targetEdgeIds.length === 0) return [];

  const analysis = analyzeTopology(oc, shape);
  const matchedEdges = [];

  for (const targetId of targetEdgeIds) {
    const matchIdx = analysis.edges.findIndex((e) => e.topoId === targetId);
    if (matchIdx !== -1) {
      matchedEdges.push(analysis.edgeShapeList[matchIdx]);
    } else {
      // Fallback: search by substring or adjacent faces
      const fallback = analysis.edges.findIndex((e) => targetId.includes(e.topoId) || e.topoId.includes(targetId));
      if (fallback !== -1) {
        matchedEdges.push(analysis.edgeShapeList[fallback]);
      }
    }
  }

  return matchedEdges;
}

module.exports = {
  analyzeTopology,
  resolveEdgesByTopoIds,
  computeFaceGeometry,
  sampleEdgePolyline
};
