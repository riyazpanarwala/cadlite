/*
 * Boolean solid operations via OpenCascade (opencascade.js).
 *
 * WHY THIS RUNS IN THE MAIN PROCESS, NOT THE RENDERER:
 * opencascade.js ships a large WASM binary. In a bundler-free renderer
 * (this app loads three.js via a plain <script type="importmap">, no
 * webpack/vite) getting that WASM asset loaded correctly in the browser
 * context is a real headache. But the Electron main process is just
 * Node.js — and opencascade.js publishes a ready-to-use Node build at
 * `opencascade.js/dist/node.js` that needs zero bundler config. So this
 * file runs there, and the renderer talks to it over IPC (see main.js /
 * preload.js / renderer.js "geometry:boolean" channel).
 *
 * OpenCascade API bindings are verified against the installed opencascade.js
 * release, supporting booleans (union, cut, intersect), edge fillets,
 * chamfers, and thin/thick solid shells.
 */

const { analyzeTopology, resolveEdgesByTopoIds } = require('./topology-naming.js');

let ocPromise = null;

async function getOC() {
  if (!ocPromise) {
    ocPromise = import('opencascade.js/dist/node.js').then((mod) => {
      const initOpenCascade = mod.default;
      return initOpenCascade();
    });
  }
  return ocPromise;
}

// ---- Building OCC shapes that match this app's Three.js conventions ----
//
// Three.js primitives are centered at the local origin with axes:
//   Box:      spans [-w/2,w/2] x [-h/2,h/2] x [-d/2,d/2]
//   Cylinder/Cone: axis along Y, spans [-h/2,h/2] along Y
// OpenCascade primitives are corner/base anchored with axes:
//   Box:      spans [0,w] x [0,h] x [0,d]
//   Cylinder/Cone: base at origin, axis along +Z, spans [0,h] along Z
// So each builder below applies a small local correction transform
// before the part's actual world transform, to line the two conventions up.

function makeBoxShape(oc, params) {
  const { width, height, depth } = params;
  const box = new oc.BRepPrimAPI_MakeBox_2(width, height, depth).Shape();
  const trsf = new oc.gp_Trsf_1();
  trsf.SetTranslation_1(new oc.gp_Vec_4(-width / 2, -height / 2, -depth / 2));
  return new oc.BRepBuilderAPI_Transform_2(box, trsf, true).Shape();
}

function makeCylinderShape(oc, params) {
  const { radius, height } = params;
  const axis = new oc.gp_Ax2_3(new oc.gp_Pnt_3(0, 0, 0), new oc.gp_Dir_4(0, 0, 1));
  const cyl = new oc.BRepPrimAPI_MakeCylinder_3(axis, radius, height).Shape();
  return centerZAndMapToY(oc, cyl, height);
}

function makeConeShape(oc, params) {
  const { radius, height } = params;
  const axis = new oc.gp_Ax2_3(new oc.gp_Pnt_3(0, 0, 0), new oc.gp_Dir_4(0, 0, 1));
  const cone = new oc.BRepPrimAPI_MakeCone_3(axis, radius, 0, height).Shape();
  return centerZAndMapToY(oc, cone, height);
}

function makeSphereShape(oc, params) {
  const { radius } = params;
  return new oc.BRepPrimAPI_MakeSphere_5(new oc.gp_Pnt_3(0, 0, 0), radius).Shape();
}

/** Shared correction for cylinder/cone: center along their extrusion axis, then rotate Z-axis onto Y-axis (three.js convention). */
function centerZAndMapToY(oc, shape, height) {
  const toCentered = new oc.gp_Trsf_1();
  toCentered.SetTranslation_1(new oc.gp_Vec_4(0, 0, -height / 2));
  const centered = new oc.BRepBuilderAPI_Transform_2(shape, toCentered, true).Shape();

  const rot = new oc.gp_Trsf_1();
  rot.SetRotation_1(new oc.gp_Ax1_2(new oc.gp_Pnt_3(0, 0, 0), new oc.gp_Dir_4(1, 0, 0)), -Math.PI / 2);
  return new oc.BRepBuilderAPI_Transform_2(centered, rot, true).Shape();
}

function makeExtrudeShape(oc, params) {
  const { points2D, planeZ, depth = 20, direction = 'normal', planeMatrix } = params;

  const polygon = new oc.BRepBuilderAPI_MakePolygon_1();
  for (const [x, y] of points2D) {
    polygon.Add_1(new oc.gp_Pnt_3(x, y, 0));
  }
  polygon.Close();
  const wire = polygon.Wire();
  const face = new oc.BRepBuilderAPI_MakeFace_15(wire, false).Face();

  // Direction handling:
  // 'cut' or 'flip' extrudes into -Z (inward into the face)
  // 'boss' or 'normal' extrudes along +Z (outward from the face)
  // 'symmetric' extrudes from -depth/2 to +depth/2
  let extrudeZ = depth;
  let offsetZ = 0;
  if (direction === 'cut' || direction === 'flip') {
    extrudeZ = -depth;
  } else if (direction === 'symmetric') {
    extrudeZ = depth;
    offsetZ = -depth / 2;
  }

  const prismVec = new oc.gp_Vec_4(0, 0, extrudeZ);
  let solid = new oc.BRepPrimAPI_MakePrism_1(face, prismVec, false, true).Shape();

  if (offsetZ !== 0) {
    const symTrsf = new oc.gp_Trsf_1();
    symTrsf.SetTranslation_1(new oc.gp_Vec_4(0, 0, offsetZ));
    solid = new oc.BRepBuilderAPI_Transform_2(solid, symTrsf, true).Shape();
  }

  // If a 4x4 planeMatrix is provided (arbitrary 3D face plane), apply it!
  if (Array.isArray(planeMatrix) && planeMatrix.length === 16) {
    const m = planeMatrix; // Three.js column-major 16-length array
    const trsf = new oc.gp_Trsf_1();
    trsf.SetValues(
      m[0], m[4], m[8], m[12],
      m[1], m[5], m[9], m[13],
      m[2], m[6], m[10], m[14]
    );
    return new oc.BRepBuilderAPI_Transform_2(solid, trsf, true).Shape();
  }

  if (planeZ) {
    const trsf = new oc.gp_Trsf_1();
    trsf.SetTranslation_1(new oc.gp_Vec_4(0, 0, planeZ));
    return new oc.BRepBuilderAPI_Transform_2(solid, trsf, true).Shape();
  }

  return solid;
}

function makeRevolShape(oc, params) {
  const { points2D, angle = 360 } = params;
  const polygon = new oc.BRepBuilderAPI_MakePolygon_1();
  const uValues = points2D.map(p => p[0]);
  const minU = Math.min(...uValues);
  const offsetU = minU < 0 ? -minU : 0;

  for (const [x, y] of points2D) {
    polygon.Add_1(new oc.gp_Pnt_3(Math.max(0.01, x + offsetU), y, 0));
  }
  polygon.Close();
  const wire = polygon.Wire();
  const face = new oc.BRepBuilderAPI_MakeFace_15(wire, false).Face();

  const axis = new oc.gp_Ax1_2(new oc.gp_Pnt_3(0, 0, 0), new oc.gp_Dir_4(0, 1, 0));
  const angleRad = (angle * Math.PI) / 180;
  const revol = new oc.BRepPrimAPI_MakeRevol_1(face, axis, angleRad, false);
  return revol.Shape();
}

function makeSweepShape(oc, params) {
  const { profilePoints2D, pathPoints3D, radius } = params;

  if (!Array.isArray(pathPoints3D) || pathPoints3D.length < 2) {
    throw new Error('Sweep requires at least 2 path points in 3D');
  }

  // 1. Build spine wire from 3D path polyline
  const spinePoly = new oc.BRepBuilderAPI_MakePolygon_1();
  for (const p of pathPoints3D) {
    spinePoly.Add_1(new oc.gp_Pnt_3(p[0], p[1], p[2]));
  }
  const spineWire = spinePoly.Wire();

  // 2. Establish local orthonormal frame at start of spine
  const p0 = pathPoints3D[0];
  const p1 = pathPoints3D[1];
  const tangent = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const tanLen = Math.hypot(tangent[0], tangent[1], tangent[2]) || 1;
  const dirZ = [tangent[0] / tanLen, tangent[1] / tanLen, tangent[2] / tanLen];

  let dirX = [1, 0, 0];
  if (Math.abs(dirZ[0] * dirX[0] + dirZ[1] * dirX[1] + dirZ[2] * dirX[2]) > 0.85) {
    dirX = [0, 1, 0];
  }
  let dirY = [
    dirZ[1] * dirX[2] - dirZ[2] * dirX[1],
    dirZ[2] * dirX[0] - dirZ[0] * dirX[2],
    dirZ[0] * dirX[1] - dirZ[1] * dirX[0]
  ];
  const yLen = Math.hypot(dirY[0], dirY[1], dirY[2]) || 1;
  dirY[0] /= yLen; dirY[1] /= yLen; dirY[2] /= yLen;

  dirX = [
    dirY[1] * dirZ[2] - dirY[2] * dirZ[1],
    dirY[2] * dirZ[0] - dirY[0] * dirZ[2],
    dirY[0] * dirZ[1] - dirY[1] * dirZ[0]
  ];

  let pts2D = profilePoints2D;
  if (!pts2D || pts2D.length < 3) {
    const r = radius || 8;
    const segs = 24;
    pts2D = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts2D.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  const profPoly = new oc.BRepBuilderAPI_MakePolygon_1();
  for (const [u, v] of pts2D) {
    const px = p0[0] + dirX[0] * u + dirY[0] * v;
    const py = p0[1] + dirX[1] * u + dirY[1] * v;
    const pz = p0[2] + dirX[2] * u + dirY[2] * v;
    profPoly.Add_1(new oc.gp_Pnt_3(px, py, pz));
  }
  profPoly.Close();
  const profileFace = new oc.BRepBuilderAPI_MakeFace_15(profPoly.Wire(), false).Face();

  const pipe = new oc.BRepOffsetAPI_MakePipe_1(spineWire, profileFace);
  pipe.Build(new oc.Message_ProgressRange_1());
  if (!pipe.IsDone() || pipe.Shape().IsNull()) {
    throw new Error('Sweep operation failed in OpenCascade');
  }
  return pipe.Shape();
}

function makeLoftShape(oc, params) {
  const { sections, ruled = false } = params;
  if (!Array.isArray(sections) || sections.length < 2) {
    throw new Error('Loft requires at least 2 cross-section profiles');
  }

  const thru = new oc.BRepOffsetAPI_ThruSections(true, ruled, 1.0e-6);

  for (const sec of sections) {
    let pts3D = sec.points3D;
    if (!pts3D && sec.points2D) {
      const z = sec.z || 0;
      const m = sec.planeMatrix;
      if (Array.isArray(m) && m.length === 16) {
        pts3D = sec.points2D.map(([u, v]) => [
          m[0] * u + m[4] * v + m[12],
          m[1] * u + m[5] * v + m[13],
          m[2] * u + m[6] * v + m[14]
        ]);
      } else {
        pts3D = sec.points2D.map(([u, v]) => [u, v, z]);
      }
    }

    if (!pts3D || pts3D.length < 3) continue;

    const poly = new oc.BRepBuilderAPI_MakePolygon_1();
    for (const p of pts3D) {
      poly.Add_1(new oc.gp_Pnt_3(p[0], p[1], p[2]));
    }
    poly.Close();
    thru.AddWire(poly.Wire());
  }

  thru.Build(new oc.Message_ProgressRange_1());
  if (!thru.IsDone() || thru.Shape().IsNull()) {
    throw new Error('Loft operation failed in OpenCascade');
  }
  return thru.Shape();
}

function applyChamferToShape(oc, shape, distance = 5, filter = 'all', targetEdgeIds = []) {
  const chamfer = new oc.BRepFilletAPI_MakeChamfer(shape);
  let edgesToChamfer = [];
  if (Array.isArray(targetEdgeIds) && targetEdgeIds.length > 0) {
    edgesToChamfer = resolveEdgesByTopoIds(oc, shape, targetEdgeIds);
  }
  if (edgesToChamfer.length === 0) {
    const exp = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    while (exp.More()) {
      const edge = oc.TopoDS.Edge_1(exp.Current());
      if (edgeMatchesFilter(oc, edge, filter)) {
        edgesToChamfer.push(edge);
      }
      exp.Next();
    }
  }
  let count = 0;
  for (const edge of edgesToChamfer) {
    try {
      chamfer.Add_2(distance, edge);
      count++;
    } catch (err) {}
  }
  if (count === 0) return shape;
  chamfer.Build(new oc.Message_ProgressRange_1());
  return chamfer.IsDone() ? chamfer.Shape() : shape;
}

function applyFilletToShape(oc, shape, radius = 3, filter = 'all', targetEdgeIds = []) {
  const fillet = new oc.BRepFilletAPI_MakeFillet(shape, oc.ChFi3d_FilletShape.ChFi3d_Rational);
  let edgesToFillet = [];
  if (Array.isArray(targetEdgeIds) && targetEdgeIds.length > 0) {
    edgesToFillet = resolveEdgesByTopoIds(oc, shape, targetEdgeIds);
  }
  if (edgesToFillet.length === 0) {
    const exp = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    while (exp.More()) {
      const edge = oc.TopoDS.Edge_1(exp.Current());
      if (edgeMatchesFilter(oc, edge, filter)) {
        edgesToFillet.push(edge);
      }
      exp.Next();
    }
  }
  let count = 0;
  for (const edge of edgesToFillet) {
    try {
      fillet.Add_2(radius, edge);
      count++;
    } catch (err) {}
  }
  if (count === 0) return shape;
  fillet.Build(new oc.Message_ProgressRange_1());
  return fillet.IsDone() ? fillet.Shape() : shape;
}

function findTopFace(oc, shape) {
  let bestFace = null;
  let maxCoord = -Infinity;
  const exp = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  while (exp.More()) {
    const face = oc.TopoDS.Face_1(exp.Current());
    try {
      const gprops = new oc.GProp_GProps_1();
      oc.BRepGProp.SurfaceProperties_1(face, gprops, false, false);
      const center = gprops.CentreOfMass();
      const coord = Math.max(center.Y(), center.Z());
      if (coord > maxCoord) {
        maxCoord = coord;
        bestFace = face;
      }
    } catch (_) {}
    exp.Next();
  }
  return bestFace;
}

function applyShellToShape(oc, shape, thickness = 2, openFace = true) {
  const closingFaces = new oc.TopTools_ListOfShape_1();
  if (openFace) {
    const topFace = findTopFace(oc, shape);
    if (topFace) {
      closingFaces.Append_1(topFace);
    }
  }

  const thickSolid = new oc.BRepOffsetAPI_MakeThickSolid();
  const offsetVal = -Math.abs(thickness);
  thickSolid.MakeThickSolidByJoin(
    shape,
    closingFaces,
    offsetVal,
    1.0e-3,
    oc.BRepOffset_Mode.BRepOffset_Skin,
    false,
    false,
    oc.GeomAbs_JoinType.GeomAbs_Arc,
    false,
    new oc.Message_ProgressRange_1()
  );
  thickSolid.Build(new oc.Message_ProgressRange_1());
  if (!thickSolid.IsDone()) {
    throw new Error(`Shell failed. Wall thickness (${thickness}mm) may exceed geometry limits.`);
  }
  return thickSolid.Shape();
}

function buildShape(oc, def) {
  if (!def) throw new Error('Cannot build null shape definition');
  let shape;
  switch (def.kind) {
    case 'box': shape = makeBoxShape(oc, def.params); break;
    case 'cylinder': shape = makeCylinderShape(oc, def.params); break;
    case 'cone': shape = makeConeShape(oc, def.params); break;
    case 'sphere': shape = makeSphereShape(oc, def.params); break;
    case 'extrude': shape = makeExtrudeShape(oc, def.params); break;
    case 'revolve': shape = makeRevolShape(oc, def.params); break;
    case 'chamfer': {
      const base = buildShape(oc, def.params.basePart);
      shape = applyChamferToShape(
        oc,
        base,
        def.params.distance || def.params.chamferDistance || 5,
        def.params.filter,
        def.params.targetEdgeIds
      );
      break;
    }
    case 'fillet': {
      const base = buildShape(oc, def.params.basePart);
      shape = applyFilletToShape(
        oc,
        base,
        def.params.radius || def.params.filletRadius || 3,
        def.params.filter,
        def.params.targetEdgeIds
      );
      break;
    }
    case 'shell': {
      const base = buildShape(oc, def.params.basePart);
      shape = applyShellToShape(oc, base, def.params.thickness || 2, def.params.openFace !== false);
      break;
    }
    case 'extrude_boss': {
      const base = buildShape(oc, def.params.basePart);
      const prism = makeExtrudeShape(oc, { ...def.params, direction: 'boss' });
      const fuse = new oc.BRepAlgoAPI_Fuse_3(base, prism, new oc.Message_ProgressRange_1());
      fuse.Build(new oc.Message_ProgressRange_1());
      shape = fuse.Shape();
      break;
    }
    case 'extrude_cut': {
      const base = buildShape(oc, def.params.basePart);
      const prism = makeExtrudeShape(oc, { ...def.params, direction: 'cut' });
      const cut = new oc.BRepAlgoAPI_Cut_3(base, prism, new oc.Message_ProgressRange_1());
      cut.Build(new oc.Message_ProgressRange_1());
      shape = cut.Shape();
      break;
    }
    case 'sweep': {
      const swept = makeSweepShape(oc, def.params);
      if (def.params.basePart) {
        const base = buildShape(oc, def.params.basePart);
        const fuse = new oc.BRepAlgoAPI_Fuse_3(base, swept, new oc.Message_ProgressRange_1());
        fuse.Build(new oc.Message_ProgressRange_1());
        shape = fuse.Shape();
      } else {
        shape = swept;
      }
      break;
    }
    case 'loft': {
      const lofted = makeLoftShape(oc, def.params);
      if (def.params.basePart) {
        const base = buildShape(oc, def.params.basePart);
        const fuse = new oc.BRepAlgoAPI_Fuse_3(base, lofted, new oc.Message_ProgressRange_1());
        fuse.Build(new oc.Message_ProgressRange_1());
        shape = fuse.Shape();
      } else {
        shape = lofted;
      }
      break;
    }
    case 'boolean': {
      const a = buildShape(oc, def.params.shapeA);
      const b = buildShape(oc, def.params.shapeB);
      const progress = () => new oc.Message_ProgressRange_1();
      const op = def.params.sourceOp || def.params.op;
      if (op === 'union') {
        const fuse = new oc.BRepAlgoAPI_Fuse_3(a, b, progress());
        fuse.Build(progress());
        shape = fuse.Shape();
      } else if (op === 'cut') {
        const cut = new oc.BRepAlgoAPI_Cut_3(a, b, progress());
        cut.Build(progress());
        shape = cut.Shape();
      } else if (op === 'intersect') {
        const common = new oc.BRepAlgoAPI_Common_3(a, b, progress());
        common.Build(progress());
        shape = common.Shape();
      } else {
        throw new Error(`Unknown boolean operation: ${op}`);
      }
      break;
    }
    case 'step': {
      if (def.params && def.params.stepContent) {
        const tmpName = `/tmp_step_${Date.now()}_${Math.floor(Math.random() * 10000)}.step`;
        oc.FS.writeFile(tmpName, def.params.stepContent);
        const reader = new oc.STEPControl_Reader_1();
        reader.ReadFile(tmpName);
        reader.TransferRoots(new oc.Message_ProgressRange_1());
        shape = reader.OneShape();
        try { oc.FS.unlink(tmpName); } catch (_) {}
      } else {
        throw new Error('STEP part missing stepContent');
      }
      break;
    }
    default: throw new Error(`Shape builder not supported for part kind "${def.kind}" yet`);
  }

  // Apply the part's actual world transform (position/rotation/scale) on top.
  if (def.matrix) {
    const m = def.matrix; // 16-length column-major array (three.js Matrix4.elements)
    const trsf = new oc.gp_Trsf_1();
    trsf.SetValues(
      m[0], m[4], m[8], m[12],
      m[1], m[5], m[9], m[13],
      m[2], m[6], m[10], m[14]
    );
    return new oc.BRepBuilderAPI_Transform_2(shape, trsf, true).Shape();
  }
  return shape;
}

/** Walks all faces of a shape, flattens their triangulation into indexed mesh data, and embeds topological entity maps. */
function shapeToMeshData(oc, shape, deflection = 0.5) {
  new oc.BRepMesh_IncrementalMesh_2(shape, deflection, false, 0.5, false);

  const positions = [];
  const normals = [];
  const indices = [];
  const faceRanges = [];

  const topology = analyzeTopology(oc, shape);
  const faceMap = new oc.TopTools_IndexedMapOfShape_1();
  oc.TopExp.MapShapes_1(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, faceMap);
  const numFaces = faceMap.Extent();

  for (let i = 1; i <= numFaces; i++) {
    const face = oc.TopoDS.Face_1(faceMap.FindKey(i));
    const location = new oc.TopLoc_Location_1();
    const triHandle = oc.BRep_Tool.Triangulation(face, location, 0);
    if (triHandle.IsNull()) continue;
    const tri = triHandle.get();

    const trsf = location.Transformation();
    const reversed = face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;

    const nbNodes = tri.NbNodes();
    const baseIndex = positions.length / 3;
    const startIndex = indices.length;
    const startTriangle = startIndex / 3;

    for (let n = 1; n <= nbNodes; n++) {
      const p = tri.Node(n).Transformed(trsf);
      positions.push(p.X(), p.Y(), p.Z());
      normals.push(0, 0, 0); // computed below
    }

    const nbTriangles = tri.NbTriangles();
    for (let t = 1; t <= nbTriangles; t++) {
      const triangle = tri.Triangle(t);
      let n1 = triangle.Value(1);
      let n2 = triangle.Value(2);
      let n3 = triangle.Value(3);
      if (reversed) { const tmp = n2; n2 = n3; n3 = tmp; }
      indices.push(baseIndex + n1 - 1, baseIndex + n2 - 1, baseIndex + n3 - 1);
    }

    const topoFace = (topology && topology.faces && topology.faces[i - 1]) || {
      topoId: `Face_${i}`,
      surfaceType: 'plane',
      normal: [0, 0, 1],
      centroid: [0, 0, 0],
      area: 0
    };

    faceRanges.push({
      faceId: topoFace.topoId,
      surfaceType: topoFace.surfaceType,
      normal: topoFace.normal,
      centroid: topoFace.centroid,
      area: topoFace.area,
      radius: topoFace.radius,
      diameter: topoFace.diameter,
      axis: topoFace.axis,
      startTriangle,
      triangleCount: nbTriangles,
      startIndex,
      indexCount: nbTriangles * 3
    });
  }

  return {
    positions,
    normals,
    index: indices,
    faceRanges,
    edges: (topology && topology.edges) || [],
    faces: (topology && topology.faces) || [],
    vertices: (topology && topology.vertices) || []
  };
}

/**
 * Main entry point: performs a boolean op between two part definitions and
 * returns flat mesh arrays ready to become a THREE.BufferGeometry.
 * op: 'union' | 'cut' | 'intersect'
 */
async function performBoolean({ op, shapeA, shapeB }) {
  const oc = await getOC();

  const a = buildShape(oc, shapeA);
  const b = buildShape(oc, shapeB);

  let result;
  const progress = () => new oc.Message_ProgressRange_1();

  if (op === 'union') {
    const fuse = new oc.BRepAlgoAPI_Fuse_3(a, b, progress());
    fuse.Build(progress());
    result = fuse.Shape();
  } else if (op === 'cut') {
    const cut = new oc.BRepAlgoAPI_Cut_3(a, b, progress());
    cut.Build(progress());
    result = cut.Shape();
  } else if (op === 'intersect') {
    const common = new oc.BRepAlgoAPI_Common_3(a, b, progress());
    common.Build(progress());
    result = common.Shape();
  } else {
    throw new Error(`Unknown boolean op: ${op}`);
  }

  return shapeToMeshData(oc, result);
}

function edgeMatchesFilter(oc, edge, filter) {
  if (!filter || filter === 'all') return true;
  try {
    const curve = new oc.BRepAdaptor_Curve_2(edge);
    const p1 = curve.Value(curve.FirstParameter());
    const p2 = curve.Value(curve.LastParameter());
    const dx = Math.abs(p1.X() - p2.X());
    const dy = Math.abs(p1.Y() - p2.Y());
    const dz = Math.abs(p1.Z() - p2.Z());

    if (filter === 'vertical') {
      return (dz > 0.05 && dx < 0.01 && dy < 0.01) || (dy > 0.05 && dx < 0.01 && dz < 0.01);
    }
    if (filter === 'horizontal') {
      return (dz < 0.01) || (dy < 0.01);
    }
  } catch (e) {
    return true;
  }
  return true;
}

/**
 * Performs a Chamfer (bevel) on the edges of a shape.
 * Supports targeted edge selection via targetEdgeIds or legacy filter.
 */
async function performChamfer({ shapeDef, distance = 5, filter = 'all', targetEdgeIds = [] }) {
  const oc = await getOC();
  const shape = buildShape(oc, shapeDef);
  const chamfer = new oc.BRepFilletAPI_MakeChamfer(shape);

  let edgesToChamfer = [];
  if (Array.isArray(targetEdgeIds) && targetEdgeIds.length > 0) {
    edgesToChamfer = resolveEdgesByTopoIds(oc, shape, targetEdgeIds);
  }

  if (edgesToChamfer.length === 0) {
    const exp = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    while (exp.More()) {
      const edge = oc.TopoDS.Edge_1(exp.Current());
      if (edgeMatchesFilter(oc, edge, filter)) {
        edgesToChamfer.push(edge);
      }
      exp.Next();
    }
  }

  let count = 0;
  for (const edge of edgesToChamfer) {
    try {
      chamfer.Add_2(distance, edge);
      count++;
    } catch (err) {
      // Skip edges where chamfer cannot be bound
    }
  }

  if (count === 0) {
    throw new Error('No matching edges found for chamfer');
  }
  chamfer.Build(new oc.Message_ProgressRange_1());
  if (!chamfer.IsDone()) {
    throw new Error(`Chamfer failed. Distance (${distance}mm) may be too large for the model's dimensions.`);
  }
  return shapeToMeshData(oc, chamfer.Shape());
}

/**
 * Performs a Fillet (rounding) on the edges of a shape.
 * Supports targeted edge selection via targetEdgeIds or legacy filter.
 */
async function performFillet({ shapeDef, radius = 3, filter = 'all', targetEdgeIds = [] }) {
  const oc = await getOC();
  const shape = buildShape(oc, shapeDef);
  const fillet = new oc.BRepFilletAPI_MakeFillet(shape, oc.ChFi3d_FilletShape.ChFi3d_Rational);

  let edgesToFillet = [];
  if (Array.isArray(targetEdgeIds) && targetEdgeIds.length > 0) {
    edgesToFillet = resolveEdgesByTopoIds(oc, shape, targetEdgeIds);
  }

  if (edgesToFillet.length === 0) {
    const exp = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    while (exp.More()) {
      const edge = oc.TopoDS.Edge_1(exp.Current());
      if (edgeMatchesFilter(oc, edge, filter)) {
        edgesToFillet.push(edge);
      }
      exp.Next();
    }
  }

  let count = 0;
  for (const edge of edgesToFillet) {
    try {
      fillet.Add_2(radius, edge);
      count++;
    } catch (err) {
      // Skip edges
    }
  }

  if (count === 0) {
    throw new Error('No matching edges found for fillet');
  }
  fillet.Build(new oc.Message_ProgressRange_1());
  if (!fillet.IsDone()) {
    throw new Error(`Fillet failed. Radius (${radius}mm) may be too large for the model's dimensions.`);
  }
  return shapeToMeshData(oc, fillet.Shape());
}

/**
 * Exports one or more parts to a standard ISO-10303-21 STEP string.
 */
async function exportToStep({ parts }) {
  const oc = await getOC();
  if (!parts || parts.length === 0) {
    throw new Error('No parts to export');
  }

  const shapes = [];
  for (const part of parts) {
    try {
      const sh = buildShape(oc, part);
      if (sh && !sh.IsNull()) {
        shapes.push(sh);
      }
    } catch (err) {
      console.warn(`Skipping part ${part.name || part.kind} during STEP export:`, err);
    }
  }

  if (shapes.length === 0) {
    throw new Error('No valid 3D solids could be prepared for STEP export.');
  }

  let exportShape;
  if (shapes.length === 1) {
    exportShape = shapes[0];
  } else {
    const compound = new oc.TopoDS_Compound();
    const builder = new oc.BRep_Builder();
    builder.MakeCompound(compound);
    for (const s of shapes) {
      builder.Add(compound, s);
    }
    exportShape = compound;
  }

  const writer = new oc.STEPControl_Writer_1();
  const progress = new oc.Message_ProgressRange_1();
  writer.Transfer(exportShape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, progress);

  const tmpName = `/export_${Date.now()}_${Math.floor(Math.random() * 10000)}.step`;
  const writeStatus = writer.Write(tmpName);
  if (writeStatus !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
    try { oc.FS.unlink(tmpName); } catch (_) {}
    throw new Error('STEP writer failed to generate file data.');
  }

  const stepContent = oc.FS.readFile(tmpName, { encoding: 'utf8' });
  try { oc.FS.unlink(tmpName); } catch (_) {}

  return { ok: true, stepContent };
}

/**
 * Imports a STEP file from its string content, extracts B-Rep solid(s), and triangulates.
 */
async function importFromStep({ stepContent, fileName = 'ImportedPart.step' }) {
  const oc = await getOC();
  if (!stepContent || typeof stepContent !== 'string') {
    throw new Error('Invalid or empty STEP file content');
  }

  const tmpName = `/import_${Date.now()}_${Math.floor(Math.random() * 10000)}.step`;
  oc.FS.writeFile(tmpName, stepContent);

  const reader = new oc.STEPControl_Reader_1();
  const readStatus = reader.ReadFile(tmpName);
  if (readStatus !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
    try { oc.FS.unlink(tmpName); } catch (_) {}
    throw new Error('Failed to read STEP file (invalid format or damaged structure)');
  }

  const progress = new oc.Message_ProgressRange_1();
  reader.TransferRoots(progress);
  const shape = reader.OneShape();
  try { oc.FS.unlink(tmpName); } catch (_) {}

  if (!shape || shape.IsNull()) {
    throw new Error('No 3D solid or shell could be found in the STEP file');
  }

  const meshData = shapeToMeshData(oc, shape, 0.2);
  return {
    ok: true,
    meshData,
    stepContent,
    fileName
  };
}

/**
 * Performs a Shell operation (hollows out a solid Part with uniform wall thickness).
 */
async function performShell({ shapeDef, thickness = 2, openFace = true }) {
  const oc = await getOC();
  const shape = buildShape(oc, shapeDef);
  const shelledShape = applyShellToShape(oc, shape, thickness, openFace);
  return shapeToMeshData(oc, shelledShape);
}

/**
 * Builds OpenCascade solid shape and extracts full mesh geometry + topological graph.
 */
async function getShapeMeshAndTopology(shapeDef) {
  const oc = await getOC();
  const shape = buildShape(oc, shapeDef);
  const meshData = shapeToMeshData(oc, shape);
  return { meshData, topology: { faces: meshData.faces, edges: meshData.edges } };
}

/**
 * Performs a Sweep operation along a 3D path.
 */
async function performSweep(params) {
  const oc = await getOC();
  const shape = makeSweepShape(oc, params);
  return shapeToMeshData(oc, shape);
}

/**
 * Performs a Loft operation through multiple cross-sections.
 */
async function performLoft(params) {
  const oc = await getOC();
  const shape = makeLoftShape(oc, params);
  return shapeToMeshData(oc, shape);
}

module.exports = {
  performBoolean,
  performChamfer,
  performFillet,
  performShell,
  performSweep,
  performLoft,
  exportToStep,
  importFromStep,
  getShapeMeshAndTopology
};
