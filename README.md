# CADLite

A basic Windows desktop CAD application — parts, sketches, extrusion, assemblies,
and mates — built with Electron + Three.js. This is a real, working starting
point inspired by SolidWorks' workflow, **not** a clone of SolidWorks itself
(that's proprietary software built on a commercial geometry kernel by a large
team over decades — see [Design architecture & capabilities](#design-architecture--capabilities) below).

## Setup

```bash
cd cadlite
npm install
npm start
```

This runs the app in a dev Electron window. No build step is required — the
renderer loads Three.js directly via an ES module `<script type="importmap">`
in `src/index.html`, pointing at `node_modules/three`.

## Building a Windows installer

```bash
npm run dist
```

Uses `electron-builder` (configured in `package.json`) to produce an NSIS
installer under `dist/`. You'll want to add a real app icon (`build/icon.ico`)
and set `"icon"` in the `build.win` config before shipping this to anyone else.

## UI Reference Guide

For a complete, button-by-button manual covering every tool, workflow, and dialog, see **[docs/UI_REFERENCE.md](docs/UI_REFERENCE.md)**.

## What it can do

- **Topological Naming Service (TNS)**: True Boundary-Representation (B-Rep) entity tracking with persistent face IDs (`Face_+X`, `Face_+Z`) and deterministic edge IDs (`Edge_Face_+X__Face_+Z`). Upstream parametric changes re-resolve downstream features without breaking models.
- **Selection Filter Modes & HUD Breadcrumb**: Dedicated selection filters for `[◫ Part]`, `[▱ Face]`, and `[╱ Edge]` with interactive hover highlighting and a live breadcrumb HUD showing the active topological path.
- **Targeted Fillets & Chamfers**: Precision edge selection allowing specific edges to be filleted or chamfered independently rather than global heuristics.
- **Parametric Feature Tree & Rollback Bar**: Chronological feature DAG with an interactive drag-and-drop Rollback Bar, feature suppression, and sequential OpenCascade B-Rep re-evaluation.
- **SolveSpace-Grade 2D Constraint Solver**: Damped Levenberg-Marquardt non-linear solver with analytical Jacobians, real-time Solve-on-Drag geometry flexing, numerical Degrees of Freedom (DOF) counter, over-constraint conflict diagnostics, and SolidWorks color coding (Blue = under-constrained, Slate = fully constrained, Red = conflicting).
- **Sketch on 3D Face**: Select any planar face of a 3D solid and start sketching directly on it (`S`) with automatic "Normal To" camera alignment.
- **Project Geometry ("Convert Entities")**: Project 3D model edges or face boundaries into the active sketch plane (`P`) as gold dashed reference lines (`#f59e0b`) with fixed anchor constraints.
- **Extrude Boss & Extrude Cut**: Non-destructive extrusion features that fuse outward (`Extrude Boss`) or cut inward pockets (`Extrude Cut`) into existing parts, fully tracked in the Feature Tree.
- **Advanced 3D Sweeps**: Sweep closed 2D profiles along 3D guide curves and trajectories using OpenCascade's `BRepOffsetAPI_MakePipe_1` (Elbow pipes, S-conduits, U-bends).
- **Advanced Multi-Section Lofts**: Skin and blend solid bodies across multiple cross-sections across offset work planes using OpenCascade's `BRepOffsetAPI_ThruSections` (Duct transitions, Rocket nozzles, Tapered funnels).
- **Primitives**: Box, cylinder, sphere, cone with editable parametric dimensions.
- **Multi-Plane 2D Sketching**: Standard origin planes (XY, XZ, YZ) or custom face planes with aligned grids and view snapping.
- **Hole Tool**: Parametric hole placement with custom diameter and through-all or blind depth cutting.
- **Patterns**: Rectangular grid patterns, circular radial arrays, and principal plane mirroring.
- **Work Features**: Datum planes, 3D coordinate axes, and UCS alignment.
- **Boolean Solids**: True B-Rep Union, Cut (Subtract), and Intersect powered by OpenCascade.
- **STEP CAD Interoperability**: Full import and export of standard ISO-10303 AP214 STEP files (`.step`, `.stp`).
- **2D Engineering Drawing Sheets**: Automated 4-view orthographic blueprint sheets (Top, Front, Right, Isometric) with dimensions, title block, and direct export to AutoCAD DXF (`.dxf`), SVG (`.svg`), and Print/PDF.
- **Live Assembly Mates**: Coincident, concentric (2-DOF kinematic sliding & spinning), and distance mates with continuous real-time frame locking.
- **3D Gizmo & ViewCube**: Interactive 3D translation/rotation/scale gizmos and a synchronized 3D navigation cube and triad.
- **Save / Load**: Full project serialization to `.cadlite.json` via native OS dialogs.
- **Export STL**: Triangulated mesh export for 3D printing.

## Automated Verification Suite

CadLite includes 25 comprehensive automated regression and integration tests covering the complete CAD pipeline:

```bash
npm test
```

- **Phase 1 (`test-tns.js`)**: Deterministic topological naming, B-Rep entity extraction, targeted edge fillets/chamfers, and upstream parameter edit resilience.
- **Phase 2 (`test-feature-tree.js`)**: Parametric feature tree DAG, rollback bar slicing, feature suppression/unsuppression, JSON serialization, and sequential OpenCascade re-evaluation.
- **Phase 3 (`test-constraint-solver.js`)**: Levenberg-Marquardt solver, non-linear distance equations, coupled perpendicular/parallel constraints, numerical rank DOF counter, over-constraint conflict detection, and solve-on-drag soft targets.
- **Phase 4 (`test-face-sketch.js`)**: Dynamic 3D face work planes, project geometry (Convert Entities) 3D-to-2D mapping, OpenCascade extrude boss fusion, extrude cut pocketing, and feature tree rollback with face features.
- **Phase 5 (`test-sweep-loft.js`)**: OpenCascade `BRepOffsetAPI_MakePipe_1` 3D sweeps, `BRepOffsetAPI_ThruSections` multi-section lofts, rocket nozzle transitions, and feature tree history integration.

## Design architecture & capabilities

1. **Topological Naming Service (TNS)**: Every face and edge generated by OpenCascade is classified with persistent geometric signatures ($n_x, n_y, n_z$, surface type, centroid) and assigned deterministic IDs (e.g. `Face_+Z`, `Edge_Face_+X__Face_+Z`), solving the classic CAD topological naming problem.
2. **Parametric Feature Tree (DAG)**: Parts maintain a directed history graph. Moving the Rollback Bar or toggling feature suppression recomputes only the active features sequentially in OpenCascade.
3. **Levenberg-Marquardt 2D Constraint Solver**: Solves coupled non-linear geometric and dimensional constraints via damped least-squares with complete pivoting QR matrix rank estimation for real-time DOF feedback.
4. **Exact B-Rep Display & Kernel**: Dual representation combining Three.js rendering with exact OpenCascade B-Rep solids in the background process.
5. **Multi-DOF Articulating Mates**: Concentric mates support 2-DOF kinematic articulation (sliding along and spinning around shared cylinder axes).

## Project structure

```
main.js                    Electron main process (window, file dialogs, boolean IPC)
main/
  occ-service.js             OpenCascade kernel service (B-Rep booleans, sweeps, lofts, fillets, TNS)
  topology-naming.js         Deterministic Topological Naming Service (TNS) engine
preload.js                 Secure IPC bridge (contextIsolation)
src/
  index.html                UI shell + import map for three.js
  renderer.js                Entry point — wires ribbon, viewport, solver, and tree
  styles/main.css            Dark, instrument-panel UI theme
  core/
    viewport.js               Scene, camera, renderer, controls, lighting
    selection.js               Selection filter modes (part, face, edge) + highlights
    gizmo.js                    Drag-to-transform (TransformControls wrapper)
  geometry/
    primitives.js              Box/cylinder/sphere/cone builders
    sketch.js                  2D sketch session, face work planes, project geometry
    constraint-solver.js       SolveSpace-grade Levenberg-Marquardt constraint solver
    extrude.js                 Sketch profile -> solid extrusion
    sweep.js                   3D trajectory pipe & sweep generator
    loft.js                    Multi-section skinning & loft generator
    boolean.js                 Renderer-side boolean op client
  history/
    FeatureTree.js             Parametric feature tree DAG data model
    feature-evaluator.js       Sequential OpenCascade history re-evaluation pipeline
  assembly/
    Part.js                    Core node type (part or sub-assembly, featureTree owner)
    Assembly.js                 Tree container, grouping, lookup
    mates.js                    One-time coincident/concentric/distance snap
    mate-solver.js              Keeps mated parts rigidly locked every frame
  ui/
    tree-panel.js               Feature tree & rollback bar UI
    properties-panel.js          Name/color/transform/dimension/topology inspector
    viewcube.js                 3D navigation ViewCube and triad
  project/
    save-load.js                 JSON project (de)serialization, incl. TNS & feature trees
```
