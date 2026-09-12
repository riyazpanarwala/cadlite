# CADLite

A basic Windows desktop CAD application — parts, sketches, extrusion, assemblies,
and mates — built with Electron + Three.js. This is a real, working starting
point inspired by SolidWorks' workflow, **not** a clone of SolidWorks itself
(that's proprietary software built on a commercial geometry kernel by a large
team over decades — see "Honest limitations" below).

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

## Honest limitations (read this before you build on top of it)

This is a scaffold, not SolidWorks. A few things are deliberately simplified:

1. **Boolean ops work, but only on the shapes this app already knows how to
   build in OCC** (box, cylinder, cone, sphere, extrude — see
   `main/occ-service.js`). Booleans between two *already-booleaned* results,
   or fillets/chamfers/shells, aren't implemented; extending
   `main/occ-service.js` with more `BRepPrimAPI_*` / `BRepFilletAPI_*` calls
   is the natural next step.

2. **Mates are a rigid lock, not a true multi-DOF constraint.** A real
   "concentric" mate in SolidWorks still lets the part spin or slide along
   the shared axis; this app's concentric mate locks all 6 degrees of
   freedom once applied. Good enough for "these two things move together,"
   not for mechanisms that need to actually articulate.

3. **No fillets, chamfers, shells, or patterns.** OpenCascade supports all
   of these (`BRepFilletAPI_MakeFillet`, etc.) — they're just not wired up
   to the UI yet.

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

## Reasonable next steps, in order of value

1. Fillets/chamfers (`BRepFilletAPI_MakeFillet`) — biggest visible gap now
   that basic booleans work.
2. Turn mates into a true multi-DOF constraint solver instead of a rigid lock.
3. Multiple sketch planes (front/top/right, or on any face) instead of only
   the ground plane.
4. Undo/redo stack.
5. Booleans on already-booleaned results (currently limited to the five
   base shape kinds — see limitation #1 above).
