# CADLite - UI Reference & Functionality Guide

A comprehensive, button-by-button documentation of every menu item, ribbon panel, viewport tool, sidebar, and dialog in **CADLite**.

---

## Table of Contents
1. [Quick Access Bar (Top Header)](#1-quick-access-bar-top-header)
2. [Application Menu (File Dropdown)](#2-application-menu-file-dropdown)
3. [Ribbon Tab Navigation](#3-ribbon-tab-navigation)
4. [3D Model Tab](#4-3d-model-tab)
   - [Sketch Panel](#sketch-panel)
   - [Create Panel](#create-panel)
   - [Modify Panel](#modify-panel)
   - [Work Features Panel](#work-features-panel)
   - [Pattern Panel](#pattern-panel)
   - [Gizmo / Transform Panel](#gizmo--transform-panel)
   - [STEP CAD Panel](#step-cad-panel)
   - [Drawing Panel](#drawing-panel)
5. [Sketch Tab](#5-sketch-tab)
   - [Draw Panel](#draw-panel)
   - [Constrain Panel](#constrain-panel)
   - [Exit Panel](#exit-panel)
6. [Assemble Tab](#6-assemble-tab)
   - [Mates Panel](#mates-panel)
   - [Components Panel](#components-panel)
7. [View Tab & Viewport Controls](#7-view-tab--viewport-controls)
   - [View Ribbon Panel](#view-ribbon-panel)
   - [ViewCube & Coordinate Triad](#viewcube--coordinate-triad)
   - [Vertical Navigation Bar](#vertical-navigation-bar)
   - [Document Tabs Bar](#document-tabs-bar)
8. [Left Model Browser Tree](#8-left-model-browser-tree)
9. [Right Properties Panel](#9-right-properties-panel)
10. [2D Engineering Drawing Sheet Modal](#10-2d-engineering-drawing-sheet-modal)
11. [Keyboard Shortcuts Cheat Sheet](#11-keyboard-shortcuts-cheat-sheet)

---

## 1. Quick Access Bar (Top Header)

Located at the very top of the window, providing immediate one-click access to core file operations.

| Button | Icon / ID | Description & How It Works |
| :--- | :---: | :--- |
| **Application Menu** | `◆`<br>`#app-menu-btn` | **Opens the CADLite File Operations menu.**<br>• Click to toggle the dropdown menu containing New, Open, Save, Import/Export, and 2D Drawing tools.<br>• Click outside or click `×` to dismiss. |
| **New Part** | File `<svg>`<br>`#qa-new` | **Creates a new empty part document.**<br>• Prompts confirmation to prevent accidental data loss.<br>• Instantly clears current assembly, mates, and history, resetting the document to `Part1`. |
| **Open Project** | Folder `<svg>`<br>`#qa-open` | **Opens an existing project.**<br>• Launches the native Windows file picker filtering for `.cadlite.json`.<br>• Restores the full hierarchy, custom names, colors, exact geometry, and live mate relationships. |
| **Save Project** | Floppy `<svg>`<br>`#qa-save` | **Saves current project.**<br>• Prompts native save dialog to store project as `.cadlite.json`.<br>• Dynamically updates the window title and document tab to the chosen filename. |
| **Import STEP** | Tray In `<svg>`<br>`#qa-import-step` | **Imports standard STEP CAD models (`.step`, `.stp`).**<br>• Launches native open dialog for STEP files.<br>• OpenCascade WASM engine parses the B-Rep topology and triangulates into real 3D solid geometry.<br>• Adds the imported part to the scene and tree with metadata. |
| **Export STEP** | Tray Out `<svg>`<br>`#qa-export-step` | **Exports scene solid bodies as ISO-10303 AP214 STEP.**<br>• Converts all solid bodies into true mathematical CAD solids (not mesh approximations).<br>• Prompts native save dialog to export `.step` compatible with SolidWorks, Inventor, Fusion 360, FreeCAD, and CNC software. |
| **2D Drawing Sheet** | Grid Sheet `<svg>`<br>`#qa-drawing-sheet` | **Generates a 2D engineering drawing blueprint.**<br>• Automatically computes 4 orthographic views (Front, Top, Right, Isometric).<br>• Adds bounding dimensions, scale badge, and engineering title block in a printable vector modal. |
| **Export DXF** | Vector `<svg>`<br>`#qa-export-dxf` | **Directly exports 2D drawing to AutoCAD DXF (`.dxf`).**<br>• Converts orthographic silhouette projections into standard AutoCAD DXF vector format for laser cutting, waterjet, and CNC milling. |
| **Export STL** | Mesh `<svg>`<br>`#qa-export-stl` | **Exports 3D mesh as STL (`.stl`).**<br>• Generates standard ASCII STL format for 3D printing (Cura, PrusaSlicer, Bambu Studio). |
| **Window Title** | Text | **Displays active document name and file extension (e.g. `CADLite - bracket.ipt`).** Automatically synchronizes when saving, loading, or importing models. |

---

## 2. Application Menu (File Dropdown)

Accessed by clicking the top-left `◆` menu icon or the `File` ribbon tab.

| Item | Icon / ID | Functionality & Workflow |
| :--- | :---: | :--- |
| **New Part** | `📄`<br>`#fm-new` | Clears the workspace and initializes a fresh parametric part after confirmation. |
| **Open Project...** | `📂`<br>`#fm-open` | Opens a native dialog to load a `.cadlite.json` project. |
| **Save Project...** | `💾`<br>`#fm-save` | Saves the assembly tree, transforms, parametric definitions, and mates into `.cadlite.json`. |
| **Import STEP** | `📥`<br>`#fm-import-step` | Imports external B-Rep CAD geometry from `.step` or `.stp` format. |
| **Export STEP** | `📤`<br>`#fm-export-step` | Exports all current bodies as an AP214 STEP CAD model. |
| **Export STL** | `🔺`<br>`#fm-export-stl` | Exports current scene meshes as an STL file for 3D slicing and printing. |
| **2D Engineering Drawing** | `📐`<br>`#fm-drawing-sheet` | Opens the 4-view orthographic drawing sheet viewer with automatic dimensions. |
| **Export DXF Drawing** | `📏`<br>`#fm-export-dxf` | Exports 2D engineering views directly to AutoCAD DXF. |

---

## 3. Ribbon Tab Navigation

The tab bar beneath the header organizes tools into contextual ribbons:
- **File**: Toggles the Application Menu dropdown.
- **3D Model**: Main parametric modeling environment (primitives, sketch, extrude, revolve, modifiers, booleans, patterns, work features).
- **Sketch**: Active when creating 2D sketches; provides drawing tools, geometric constraints, and dimensional constraints.
- **Assemble**: Tools for assembling multiple parts, applying mates, and organizing sub-assemblies.
- **View**: Camera perspectives, orthographic projections, and scene fitting.

---

## 4. 3D Model Tab

### Sketch Panel
- **Start 2D Sketch (`#btn-start-sketch`) [Hotkey: `S`]**:
  - **Sketch on 3D Face**: If a planar face of any solid part is selected (via `[▱ Face]` filter mode), clicking **Start 2D Sketch** automatically attaches the sketch coplanar to that 3D face and smoothly aligns the camera perpendicularly to view it ("Normal To" view).
  - **Standard Origin Planes**: If no face is selected, prompts you to pick an origin work plane: `1` for XY (Front), `2` for XZ (Top/Ground), or `3` for YZ (Right/Side).
  - Switches the workspace to Sketch mode, displays an aligned orange grid, and activates the 2D constraint solver.

---

### Create Panel
- **Extrude (`#btn-extrude`)**:
  - **In Sketch Mode**: Triggers **Extrude Boss** to create a new solid body or fuse material onto the active base part.
  - **In 3D Assembly Mode**: Prompts you to pick a plane or starts a sketch on the selected face.
- **Revolve (`#btn-revolve`)**:
  - **How it works**: Takes the closed sketch profile and rotates it around the vertical axis.
  - **Workflow**: Enter revolution angle in degrees (e.g. `360` for full rotation, `180` for half, `90` for quarter).
  - Produces a smooth rotational solid body that is fully editable in Properties and exportable to STEP.
- **Box (`[data-primitive="box"]`)**:
  - Drops a parametric Box (`50 × 50 × 50 mm`) into the scene with full TNS topological entity tracking (`Face_+X`, `Face_+Z`, etc.).
- **Cylinder (`[data-primitive="cylinder"]`)**:
  - Drops a parametric Cylinder (`radius: 25 mm`, `height: 60 mm`).
- **Sphere (`[data-primitive="sphere"]`)**:
  - Drops a parametric Sphere (`radius: 30 mm`).
- **Cone (`[data-primitive="cone"]`)**:
  - Drops a parametric Cone (`base radius: 25 mm`, `height: 60 mm`).
- **Sweep (`#btn-sweep`)**:
  - **How it works**: Sweeps a closed 2D profile (active sketch or circular pipe) along an arbitrary 3D guide curve / spline trajectory using OpenCascade's `BRepOffsetAPI_MakePipe_1`.
  - **Presets Available**:
    1. **90° Elbow Pipe**: Standard industrial curved elbow conduit.
    2. **S-Curve Conduit**: Smooth dual-bend transition pipe.
    3. **180° U-Bend Loop**: Full return bend trajectory.
  - **Custom Sketches**: If launched while in Sketch mode, sweeps the current active closed profile along the chosen 3D trajectory.
- **Loft (`#btn-loft`)**:
  - **How it works**: Skins and interpolates a solid body across two or more closed wire cross-sections across offset work planes using OpenCascade's `BRepOffsetAPI_ThruSections`.
  - **Presets Available**:
    1. **Circular-to-Square Duct Transition**: Smooth transition from circle ($\varnothing 48\text{ mm}$) to square ($36\times 36\text{ mm}$).
    2. **De Laval Rocket Nozzle (3 Sections)**: Wide chamber inlet $\rightarrow$ constricted throat constriction $\rightarrow$ expanded bell exhaust.
    3. **Tapered Rectangular Funnel**: Transition from large $60\times 40\text{ mm}$ rectangle to $24\times 16\text{ mm}$ outlet.
  - Fully integrated into the parametric Feature Tree with rollback bar support.

---

### Modify Panel
- **Fillet (`#btn-fillet`)**:
  - **Targeted Edge Fillets (TNS)**: In `[╱ Edge]` selection mode, select one or more specific model edges and click **Fillet**. OpenCascade fillets *only* those selected edges, leaving the rest of the solid sharp!
  - **Global Fallback**: If a whole part is selected, prompts for fillet radius and edge filter (`all` vs. `vertical`).
- **Chamfer (`#btn-chamfer`)**:
  - **Targeted Edge Chamfers (TNS)**: In `[╱ Edge]` selection mode, select specific model edges and click **Chamfer** to bevel only the selected edges.
  - **Global Fallback**: If a whole part is selected, prompts for chamfer distance and edge filter.
- **Hole (`#btn-hole`)**:
  - **How it works**: Cuts a parametric cylindrical hole through the selected solid body.
  - **Workflow**:
    1. Select a part.
    2. Click **Hole** → enter hole diameter in mm (e.g. `12 mm`).
    3. Enter depth: type `through` for Through-All, or enter a distance in mm (e.g. `25 mm`).
    4. Automatically generates a cutter cylinder and executes a boolean cut.
- **Join / Union (`#btn-bool-union`)**:
  - Combines two selected solid parts into one continuous volume using OpenCascade `BRepAlgoAPI_Fuse`.
  - **Recursive & Chainable**: Supports boolean operations on previously booleaned, filleted, chamfered, and shelled parts via nested OpenCascade CSG trees.
- **Cut / Subtract (`#btn-bool-cut`)**:
  - Subtracts the second selected part from the first selected part using OpenCascade `BRepAlgoAPI_Cut`.
  - **Recursive & Chainable**: Allows multi-stage boolean cuts into compound geometry.
- **Intersect (`#btn-bool-intersect`)**:
  - Computes the intersection volume between two selected solid bodies using OpenCascade `BRepAlgoAPI_Common`.
- **Shell (`#btn-shell`)**:
  - **How it works**: Hollows out a solid body with a uniform wall thickness using OpenCascade's native `BRepOffsetAPI_MakeThickSolid`.
  - **Workflow**:
    1. Select a solid part in the scene.
    2. Click **Shell** → enter wall thickness in mm (e.g. `2 mm`).
    3. Choose mode: `[OK]` for Open Container (automatically removes top face), `[Cancel]` for Enclosed Hollow Cavity.
    4. Computes true offset B-Rep solid geometry and replaces the part in the assembly.
- **Split (`#btn-split`)**:
  - Divides a solid body across a selected plane (`XY`, `XZ`, or `YZ`).
- **Thread (`#btn-thread`)**:
  - Applies a standard ISO or Unified thread specification (e.g. `M10x1.5`, `M12x1.75`, `1/4-20 UNC`) to a cylinder or hole, updating its metadata and model browser label.

---

### Work Features Panel
- **Work Plane (`#btn-work-plane`)**:
  - Interactive menu to toggle `XY`, `XZ`, or `YZ` datum plane visuals, or immediately launch a 2D sketch on that plane.
- **Work Axis (`#btn-work-axis`)**:
  - Toggles 3D dashed coordinate axes (`X`, `Y`, `Z`) across the viewport.
- **Work Point (`#btn-work-point`)**:
  - Toggles the center origin datum sphere in the viewport.
- **UCS (`#btn-work-ucs`)**:
  - Aligns view and centers the coordinate system at the selected part's origin.

---

### Pattern Panel
- **Rectangular Pattern (`#btn-pattern-rect`)**:
  - **Workflow**:
    1. Select a solid part.
    2. Enter count along X (e.g. `3`) and spacing along X (e.g. `50 mm`).
    3. Enter count along Z (e.g. `2`) and spacing along Z (e.g. `40 mm`).
    4. Generates an array grid of cloned parts with identical geometry and adds them to the assembly tree.
- **Circular Pattern (`#btn-pattern-circ`)**:
  - **Workflow**:
    1. Select a solid part offset from center.
    2. Enter total instance count (e.g. `6`).
    3. Enter angular span in degrees (default `360°`).
    4. Duplicates the part evenly rotated around the center axis.
- **Mirror (`#btn-pattern-mirror`)**:
  - **Workflow**:
    1. Select a solid part.
    2. Choose mirror reflection plane: `1` for YZ ($X=0$), `2` for XZ ($Y=0$), or `3` for XY ($Z=0$).
    3. Creates a reflected twin of the solid across the chosen plane.

---

### Gizmo / Transform Panel
- **Move (`[data-transform-mode="translate"]`) [Hotkey: `G`]**:
  - Attaches 3D XYZ translation arrows to the selected part for drag-to-move manipulation.
- **Rotate (`[data-transform-mode="rotate"]`) [Hotkey: `R`]**:
  - Attaches XYZ rotation rings to rotate the part around its center.
- **Scale (`[data-transform-mode="scale"]`) [Hotkey: `X`]**:
  - Attaches scale handles to adjust part scale along axes.

---

### STEP CAD Panel
- **Import STEP (`#btn-import-step`)**: Selects and loads a `.step` or `.stp` model.
- **Export STEP (`#btn-export-step`)**: Exports all active solid parts to an ISO-10303 AP214 `.step` file.

---

### Drawing Panel
- **Drawing Sheet (`#btn-drawing-sheet`)**: Opens the 2D orthographic drawing blueprint modal.
- **Export DXF (`#btn-export-dxf`)**: Exports the multi-view drawing to an AutoCAD `.dxf` file.

---

## 5. Sketch Tab

*Automatically activated during a 2D sketch session.*

### Draw Panel
- **Line (`[data-sketch-tool="line"]`)**:
  - Left-click on the sketch plane to place vertices.
  - Clicking close to the starting point closes the profile and automatically adds geometric and dimensional constraints.
- **Rectangle (`[data-sketch-tool="rect"]`)**:
  - Click corner 1, then click corner 2 to generate a 2-point rectangle.
  - Automatically adds 4 geometric constraints (Horizontal/Vertical) and 2 dimensional constraints (Width/Height).
- **Circle (`[data-sketch-tool="circle"]`)**:
  - Click point 1 for center, click point 2 to define radius.
  - Automatically adds a radial distance constraint.
- **Project Geometry / Convert Entities (`[data-sketch-tool="project"]` / `#btn-project-geometry`) [Hotkey: `P`]**:
  - Click any 3D model edge or face in the scene to project its boundary geometry directly onto the active sketch plane.
  - Projected entities render as **gold dashed reference lines** (`#f59e0b`) with fixed anchor vertices in the solver that new sketch geometry can snap and constrain to.

---

### Constrain Panel
Powered by a **SolveSpace-grade Damped Levenberg-Marquardt Non-Linear Solver**:
- **Real-Time Solve-on-Drag**: Once a sketch profile is closed, click and drag any vertex to dynamically flex the geometry live while all constraints remain mathematically locked!
- **Degrees of Freedom (DOF) Counter**: Live HUD pill badge in the viewport computing true mathematical rank:
  - `○ Under-constrained (N DOF)`: Free dimensions remaining (rendered in SolidWorks electric blue `#38bdf8`).
  - `✓ Fully Constrained (0 DOF)`: Exactly locked (rendered in dark slate/black `#1e293b`).
  - `⚠️ Over-constrained (N Conflicts)`: Conflicting constraints flagged (rendered in crimson red `#ef4444`).
- **Interactive Constraint Glyphs**: Click any on-screen glyph (`H`, `V`, `⊥`, `∥`, `=`, `•`, `🔒`) to inspect its details or delete it.
- **Dimension (`#btn-constraint-dimension`) [Hotkey: `D`]**:
  - Edit any distance or radius dimension live; click directly on any dimension badge in the viewport to change it.
- **Horizontal (`#btn-constraint-horizontal`) [Hotkey: `H`]**: Constrains selected segments to horizontal ($V = \text{const}$).
- **Vertical (`#btn-constraint-vertical`) [Hotkey: `V`]**: Constrains selected segments to vertical ($U = \text{const}$).
- **Coincident (`#btn-constraint-coincident`)**: Locks two points to the same coordinate.
- **Perpendicular (`#btn-constraint-perpendicular`)**: Constrains segments to a $90^\circ$ angle.
- **Parallel (`#btn-constraint-parallel`)**: Constrains segments to equal slopes.
- **Equal (`#btn-constraint-equal`)**: Constrains two lines to equal length.
- **Fix (`#btn-constraint-fix`)**: Locks a vertex in place as a fixed reference anchor.

---

### Exit Panel
- **Extrude Boss (`#extrude-btn`)**:
  - **Standalone**: Creates a new extruded solid body in the assembly.
  - **On Face**: Fuses new material outward from the face (`BRepAlgoAPI_Fuse`) and appends an `extrude_boss` node to the part's Parametric Feature Tree.
- **Extrude Cut (`#btn-extrude-cut`)**:
  - Cuts a pocket into the solid body (`BRepAlgoAPI_Cut`) and appends an `extrude_cut` node to the part's Parametric Feature Tree.
- **Cancel Sketch (`#cancel-sketch-btn`) [Hotkey: `Esc`]**:
  - Aborts the sketch session without saving and returns to assembly mode.

---

## 6. Assemble Tab

### Mates Panel
*Requires selecting exactly 2 parts: click the first (driver), then Shift+click the second (driven).*

- **Coincident (`#mate-coincident`)**:
  - Snaps Part B's origin onto Part A's origin and rigidly locks them together.
  - A continuous real-time solver keeps Part B locked to Part A whenever Part A is moved with the gizmo.
- **Concentric (`#mate-concentric`)**:
  - **Multi-DOF Kinematic Articulation**: Aligns the cylindrical centerlines of Part B and Part A.
  - **Allowed Degrees of Freedom (2 DOFs)**:
    1. **Axial Slide**: Part B is free to translate smoothly along the shared cylinder centerline.
    2. **Axial Spin**: Part B is free to rotate around the shared cylinder axis.
  - **Interaction**: The 3D Gizmo attaches directly to the driven part, allowing interactive sliding and spinning. Any off-axis radial displacement or tilting is continuously projected back into collinear alignment. Moving the driver part moves the driven part while preserving its current slide and spin offsets.
- **Distance (`#mate-distance`)**:
  - Prompts for separation distance in mm (e.g. `20 mm`) and locks Part B at that exact distance along the offset axis.

---

### Components Panel
- **Group Selected (`#group-btn`)**:
  - Select 2 or more parts, click **Group Selected**, and enter a sub-assembly name (e.g. `Carriage_Assembly`).
  - Nests the parts into an assembly folder in the model tree while preserving their world positions.

---

## 7. View Tab & Viewport Controls

### View Ribbon Panel
- **Home View (`#view-home`)**: Smoothly animates the camera to an isometric angle.
- **Top View (`#view-top`)**: Aligns camera directly above looking down on the XZ plane.
- **Front View (`#view-front`)**: Aligns camera looking directly at the XY plane.
- **Right View (`#view-right`)**: Aligns camera looking directly at the YZ plane.
- **Zoom All (`#view-zoom-all`)**: Calculates the bounding box of all objects in the scene and fits the view.

---

### ViewCube & Coordinate Triad
Located in the top-right and bottom-left of the 3D canvas:
- **Interactive Faces**: Click any face (`TOP`, `FRONT`, `RIGHT`, `LEFT`, `BACK`, `BOTTOM`) to smoothly orbit the camera to that face.
- **Home Icon (`⌂`)**: Returns to isometric home view.
- **Coordinate Triad**: Synchronized orientation triad in the bottom-left showing `X` (Red), `Y` (Green), and `Z` (Blue).

---

### Vertical Navigation Bar
Located on the right edge of the viewport:
- **Pan (`#nav-pan`)**: Displays middle-click pan instructions.
- **Zoom All (`#nav-zoom-all`)**: One-click fit scene to screen.
- **Free Orbit (`#nav-orbit`)**: Displays right-click / drag orbit instructions.
- **Look At (`#nav-lookat`)**: Re-centers camera orbit target directly on the selected part.

---

### Document Tabs & Selection Filter Bar
Located directly above the 3D canvas:
- **Document Tab**: Displays the active part name (e.g. `Part2`).
- **`+` (New Part)**: Clean in-memory reset to start a fresh part.
- **`×` (Close Part)**: Prompts confirmation and resets the document.
- **Selection Filters Toolbar (`[◫ Part] [▱ Face] [╱ Edge]`)**:
  - **`[◫ Part]`**: Standard selection mode; selects entire solid bodies and attaches the 3D transform gizmo.
  - **`[▱ Face]`**: Face selection filter mode; hovers over 3D model faces with a translucent blue highlight. Clicking selects the face, displays its persistent Topological ID (`Face_+Z`), surface area, and normal vector, and enables **Start 2D Sketch** directly on that face!
  - **`[╱ Edge]`**: Edge selection filter mode; hovers over CAD boundary curves with a glowing cyan line. Clicking selects the edge (Shift+click for multi-selection) for **Targeted Fillet** and **Targeted Chamfer** operations.
- **Topological Breadcrumb HUD**:
  - Persistent HUD badge in the top-left of the viewport displaying the active topological path (e.g. `Box_1 / Face_+Z` or `Bracket / Edge_Face_+X__Face_+Z`).

---

## 8. Left Model Browser Tree & Parametric History

The Inventor/SolidWorks-style hierarchical tree on the left sidebar:
- **Filter Search (`🔍` / `#browser-filter-btn`)**:
  - Dynamically filters all solid bodies and feature nodes; leave empty to clear.
- **Solid Bodies Folder (`📂 Solid Bodies (N)`)**:
  - Shows count of solid parts in the scene.
  - Click `▼`/`▶` to expand or collapse.
  - Click any solid item to select it in the 3D viewport; click `👁` to toggle visibility.
- **Parametric Feature Tree DAG**:
  - Every part maintains a complete chronological history graph of operations: `Base Feature` $\rightarrow$ `Extrude Cut` $\rightarrow$ `Fillet` $\rightarrow$ `Extrude Boss` $\rightarrow$ `Loft` $\rightarrow$ `Sweep`.
  - Expand any part to view its individual feature nodes.
- **Interactive Rollback Bar (Orange Bar)**:
  - Drag the horizontal orange rollback bar up and down the feature tree.
  - OpenCascade sequentially re-evaluates the geometry up to the rollback index, allowing you to inspect past states or insert new features earlier in history!
- **Feature Suppression & Unsuppression**:
  - Right-click any feature node or click its suppression toggle to suppress it (`strikethrough` styling).
  - OpenCascade recomputes the solid skipping the suppressed feature without losing any of its parameters.

---

## 9. Right Properties Panel

When a part is selected, the right sidebar displays editable properties:

- **Identity**:
  - **Name**: Text input to rename the part live (updates model browser tree immediately).
  - **Color**: Native color picker to change the part's material color in real-time.
- **Position (mm)**:
  - Numeric inputs for `X`, `Y`, and `Z` with live two-way synchronization with the 3D gizmo.
- **Dimensions & Parameters**:
  - Automatically adapts to part type:
    - **Box**: `Width`, `Height`, `Depth`
    - **Cylinder**: `Radius`, `Height`
    - **Sphere**: `Radius`
    - **Cone**: `Radius`, `Height`
    - **Extrusion**: `Depth`, Direction
    - **Sweep**: Spine path, radius, profile
    - **Loft**: Multi-section profiles and heights
    - **Revolve**: `Angle (°)`
- **Topological & B-Rep Inspector**:
  - Displays selected face or edge properties: persistent TNS ID, surface type (plane, cylinder, cone, bspline), normal vector, centroid, surface area, and adjacent face links.

---

## 10. 2D Engineering Drawing Sheet Modal

Opened via **Drawing Sheet** (`#qa-drawing-sheet` or `#btn-drawing-sheet`):

- **4-View Orthographic Layout**:
  - **Top View** (Upper-Left): Orthogonal projection onto XZ plane.
  - **Front View** (Lower-Left): Primary projection onto XY plane with overall Width and Height dimensions.
  - **Right View** (Lower-Right): Orthogonal projection onto YZ plane with Depth dimension.
  - **Isometric View** (Upper-Right): $30^\circ$ axonometric 3D projection.
- **Title Block**: Displays Document Name, Part Number, Author, Date, and dynamic scale badge (e.g. `SCALE 1:2`).
- **Action Buttons (Header)**:
  - **Export DXF (`#dm-export-dxf`)**: Saves AutoCAD `.dxf` vector file.
  - **Export SVG (`#dm-export-svg`)**: Saves `.svg` blueprint graphic.
  - **Print / PDF (`#dm-print`)**: Opens the system print dialog to print or save as PDF.
  - **Close (`×` / `#dm-close`)**: Closes the modal (or press `Escape`).

---

## 11. Keyboard Shortcuts Cheat Sheet

| Shortcut | Action | Scope |
| :---: | :--- | :--- |
| **`S`** | Start 2D Sketch (on Selected Face or Plane) | 3D Assembly Mode |
| **`P`** | Project 3D Geometry / Convert Entities | 2D Sketch Mode |
| **`D`** | Edit Dimensions (Prompt / Live Input) | 2D Sketch Mode |
| **`H`** | Apply Horizontal Constraint | 2D Sketch Mode |
| **`V`** | Apply Vertical Constraint | 2D Sketch Mode |
| **`G`** | Gizmo Move Mode (Translate) | 3D Assembly Mode |
| **`R`** | Gizmo Rotate Mode | 3D Assembly Mode |
| **`X`** | Gizmo Scale Mode | 3D Assembly Mode |
| **`Esc`** | Cancel / Exit Active Mode | Sketch Mode or Drawing Modal |
| **Middle Click + Drag** | Pan Camera | Viewport |
| **Right Click + Drag** | Orbit Camera | Viewport |
| **Scroll Wheel** | Zoom In / Out | Viewport |
| **Shift + Left Click** | Multi-Select Parts or Edges | Viewport & Tree |

