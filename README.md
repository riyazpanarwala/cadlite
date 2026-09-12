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

- **Primitives**: Box, cylinder, sphere, cone — click to place, then edit exact parametric dimensions in the Properties panel.
- **Multi-Plane 2D Sketching**: Start a 2D sketch (`S`) on XY, XZ, or YZ planes with aligned grid helpers and perpendicular view snapping.
- **2D Constraints & Dimensioning**: Numerical constraint solver supporting distance dimensions (`D`), horizontal (`H`), vertical (`V`), coincident, perpendicular, parallel, equal, and fixed anchor constraints.
- **Extrude & Revolve**: Extrude profiles with custom depth and normal/symmetric directions; Revolve profiles around axes up to 360°.
- **Fillet & Chamfer**: OpenCascade B-Rep edge rounding and chamfering with selective edge filtering.
- **Hole Tool**: Parametric hole placement with custom diameter and through-all/custom depth cutting.
- **Patterns**: Rectangular grid patterns, circular radial arrays, and principal plane mirroring.
- **Work Features**: Datum planes, 3D coordinate axes, and UCS alignment.
- **Boolean Solids**: True B-Rep Union, Cut (Subtract), and Intersect powered by OpenCascade.
- **STEP CAD Interoperability**: Full import and export of standard ISO-10303 AP214 STEP files (`.step`, `.stp`).
- **2D Engineering Drawing Sheets**: Automated 4-view orthographic blueprint sheets (Top, Front, Right, Isometric) with dimensions, title block, and direct export to AutoCAD DXF (`.dxf`), SVG (`.svg`), and Print/PDF.
- **Live Assembly Mates**: Coincident, concentric, and distance mates with continuous real-time frame locking.
- **3D Gizmo & ViewCube**: Interactive 3D translation/rotation/scale gizmos and a synchronized 3D navigation cube and triad.
- **Save / Load**: Full project serialization to `.cadlite.json` via native OS dialogs.
- **Export STL**: Triangulated mesh export for 3D printing.

## What's been tested vs. what hasn't

I don't have a way to click through a live GUI in the environment I built
this in, so I verified as much as I could without one:

- **Verified by automated test**: the app boots in a real Electron window
  with no JS errors (headless smoke test); the boolean pipeline (box,
  cylinder, cone, sphere, extrude shape construction, world-transform
  application, and union/cut/intersect) was run end-to-end in the actual
  `main/occ-service.js` code against a real OpenCascade WASM build, and
  produced correct triangle meshes with correctly-applied transforms.
- **Not manually clicked through**: the gizmo drag interaction, sketch
  drawing, mate solver, and general UI polish are implemented against the
  documented three.js APIs and internally consistent, but I haven't been
  able to literally click and drag in a browser to confirm the feel of it.
  If something's off, it's most likely to be in this bucket — the geometry
  math has already had its assumptions checked against real output.

## Design architecture & capabilities

This is an open-source parametric CAD scaffold built on Electron, Three.js, and OpenCascade WASM:

1. **Recursive / Chained Booleans**: Booleans (Union, Cut, Intersect) operate on all solid primitives, extrusions, revolves, and recursively on previously booleaned, filleted, chamfered, and shelled parts via nested OpenCascade CSG trees.

2. **Fillets, Chamfers & Shells**: Fully wired into the UI and OpenCascade kernel (`BRepFilletAPI_MakeFillet`, `BRepFilletAPI_MakeChamfer`, and `BRepOffsetAPI_MakeThickSolid`). Supports parametric radius, distance, edge filtering (all vs. vertical), and open-top vs. hollow-cavity shelling.

3. **Multi-DOF Articulating Mates**: Concentric mates support 2-DOF kinematic articulation (allowing free translation/sliding along and rotation/spinning around the shared cylinder centerline while rigidly enforcing radial alignment). Coincident and Distance mates provide rigid assembly locks.

4. **Patterns & Work Features**: Rectangular grid arrays, circular radial patterns, and principal plane mirroring are fully supported and serialized.

## Project structure

```
main.js                    Electron main process (window, file dialogs, boolean IPC)
main/
  occ-service.js             OpenCascade boolean ops (runs in Node, not the renderer)
preload.js                 Secure IPC bridge (contextIsolation)
src/
  index.html                UI shell + import map for three.js
  renderer.js                Entry point — wires everything together
  styles/main.css            Dark, instrument-panel UI theme
  core/
    viewport.js               Scene, camera, renderer, controls, lighting
    selection.js               Selection state + highlight
    gizmo.js                    Drag-to-transform (TransformControls wrapper)
  geometry/
    primitives.js              Box/cylinder/sphere/cone builders
    sketch.js                  2D sketch session (line/rect/circle on a plane)
    extrude.js                 Sketch profile -> solid extrusion
    boolean.js                 Renderer-side boolean op client (calls main process)
  assembly/
    Part.js                    Core node type (part or sub-assembly)
    Assembly.js                 Tree container, grouping, lookup
    mates.js                    One-time coincident/concentric/distance snap
    mate-solver.js              Keeps mated parts rigidly locked every frame
  ui/
    tree-panel.js               Assembly tree UI
    properties-panel.js          Name/color/transform/dimension editor
  project/
    save-load.js                 JSON project (de)serialization, incl. mates

```

## Future enhancements
 
1. Full parametric Undo/Redo command history stack.
2. Direct face picking for sketch planes (sketch directly on any selected planar face of a solid).
3. Additional constraint types in 2D solver (tangent to arc, symmetry line).
4. Physical properties calculator (mass, volume, center of mass, moment of inertia via OCC `GProp_GProps`).
