import * as THREE from 'three';
import { Viewport } from './core/viewport.js';
import { SelectionManager } from './core/selection.js';
import { Gizmo } from './core/gizmo.js';
import { Assembly } from './assembly/Assembly.js';
import { Part } from './assembly/Part.js';
import { MateSolver } from './assembly/mate-solver.js';
import { createPrimitivePart, rebuildPrimitiveGeometry } from './geometry/primitives.js';
import { SketchSession } from './geometry/sketch.js';
import { extrudeSketch, rebuildExtrudeGeometry } from './geometry/extrude.js';
import { revolveSketch, rebuildRevolveGeometry } from './geometry/revolve.js';
import { createRectangularPattern, createCircularPattern, createMirrorPart, clonePart } from './geometry/pattern.js';
import { applyCoincidentMate, applyConcentricMate, applyDistanceMate } from './assembly/mates.js';
import { booleanOp } from './geometry/boolean.js';
import { TreePanel } from './ui/tree-panel.js';
import { PropertiesPanel } from './ui/properties-panel.js';
import { serializeProject, deserializeProject } from './project/save-load.js';
import { ViewCube } from './ui/viewcube.js';
import { chamferPart, filletPart } from './geometry/modifiers.js';
import { DrawingSheetGenerator } from './drawing/drawing-sheet.js';

// ---------------------------------------------------------------------
// Bootstrapping
// ---------------------------------------------------------------------

const canvas = document.getElementById('viewport-canvas');
const viewport = new Viewport(canvas);
const assembly = new Assembly(viewport.scene);
const mateSolver = new MateSolver(assembly);

const treePanel = new TreePanel(document.getElementById('tree-root'), assembly, null, viewport); // selection wired below
const statusLeft = document.getElementById('status-left');
const viewportHint = document.getElementById('viewport-hint');
const mateStatusEl = document.getElementById('mate-status');

// 3D ViewCube & Coordinate Triad
const viewcubeContainer = document.getElementById('viewcube-container');
const viewcube = new ViewCube(viewcubeContainer, viewport);
viewport.onRender(() => viewcube.update());

let mode = 'assembly'; // 'assembly' | 'sketch'
let activeSketch = null;

const selection = new SelectionManager(() => {
  treePanel.render();
  propertiesPanel.render();
  updateGizmoAttachment();
});
treePanel.selection = selection;

let currentDocName = 'Part2';
function updateDocName(name) {
  currentDocName = name || 'Part2';
  const cleanBase = currentDocName.replace(/\.[^.]+$/, '');
  const titleEl = document.querySelector('.window-title');
  if (titleEl) titleEl.textContent = `CADLite - ${cleanBase}.ipt`;
  const tabTitleEl = document.querySelector('.doc-tab-title');
  if (tabTitleEl) tabTitleEl.textContent = cleanBase;
  treePanel.setDocName(cleanBase);
}

function resetScene(newDocName = 'Part1') {
  assembly.clear();
  mateSolver.records = [];
  selection.clear();
  gizmo.detach();
  updateDocName(newDocName);
  treePanel.render();
  propertiesPanel.render();
  setStatus(`Created new empty part "${newDocName}"`);
}

const propertiesPanel = new PropertiesPanel(document.getElementById('properties-body'), selection, {
  onGeometryChange: (part) => {
    if (part.kind === 'extrude') {
      rebuildExtrudeGeometry(part);
      return;
    }
    if (part.kind === 'revolve') {
      rebuildRevolveGeometry(part);
      return;
    }
    if (part.kind === 'boolean') return; // rebuilt via their own tools
    rebuildPrimitiveGeometry(part);
  },
  onTransformChange: () => {},
  onRename: () => treePanel.render(),
  onColorChange: (part) => {
    part.object3D.traverse((o) => {
      if (o.isMesh) o.material.color.set(part.color);
    });
  }
});

// Drag-to-move/rotate/scale gizmo (three.js TransformControls)
const gizmo = new Gizmo(viewport, {
  onChange: () => propertiesPanel.render(),
  onDragStateChange: () => {}
});

function updateGizmoAttachment() {
  if (mode !== 'assembly' || selection.selected.length !== 1) {
    gizmo.detach();
    return;
  }
  const part = selection.primary();
  if (mateSolver.isDriven(part)) {
    gizmo.detach();
    setStatus(`"${part.name}" is held in place by a mate - drag its driver part instead`);
    return;
  }
  gizmo.attach(part);
}

treePanel.render();
propertiesPanel.render();
setStatus('Ready');

// ---------------------------------------------------------------------
// Ribbon Tab Switching
// ---------------------------------------------------------------------

const ribbonTabs = document.querySelectorAll('.ribbon-tab[data-tab]');
const ribbonContents = document.querySelectorAll('.ribbon-content');

function activateRibbonTab(tabName) {
  ribbonTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  ribbonContents.forEach((panel) => {
    panel.classList.toggle('active', panel.id === `ribbon-${tabName}`);
  });
}

ribbonTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;
    activateRibbonTab(tabName);
    if (tabName === 'sketch' && mode !== 'sketch') {
      setMode('sketch');
    } else if (tabName !== 'sketch' && mode === 'sketch') {
      setMode('assembly');
    }
  });
});

// ---------------------------------------------------------------------
// Primitive placement
// ---------------------------------------------------------------------

let placedCount = 0;

document.querySelectorAll('[data-primitive]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (mode !== 'assembly') setMode('assembly');
    const kind = btn.dataset.primitive;
    const part = createPrimitivePart(kind);
    const col = placedCount % 5;
    const row = Math.floor(placedCount / 5);
    part.object3D.position.set(col * 90 - 180, 0, row * 90);
    placedCount++;
    assembly.addPart(part);
    selection.select(part);
    treePanel.render();
    propertiesPanel.render();
    setStatus(`Added ${kind}`);
  });
});

// ---------------------------------------------------------------------
// Mode switching (Assembly <-> Sketch) with Multi-Plane Support
// ---------------------------------------------------------------------

function promptSketchPlane() {
  const choice = window.prompt(
    "Start 2D Sketch - Select Work Plane:\n\n" +
    "1: XY Plane (Front View)\n" +
    "2: XZ Plane (Top / Ground)\n" +
    "3: YZ Plane (Right / Side)\n\n" +
    "Enter plane number (1, 2, or 3):",
    "2"
  );
  if (!choice) return null;
  const trimmed = choice.trim();
  if (trimmed === '1') return 'XY';
  if (trimmed === '3') return 'YZ';
  return 'XZ';
}

document.getElementById('btn-start-sketch')?.addEventListener('click', () => {
  const plane = promptSketchPlane();
  if (plane) setMode('sketch', plane);
});

document.getElementById('cancel-sketch-btn')?.addEventListener('click', () => setMode('assembly'));

function setMode(newMode, planeType = null) {
  mode = newMode;

  if (mode === 'sketch') {
    activateRibbonTab('sketch');
    gizmo.detach();
    const chosenPlane = planeType || 'XZ';
    activeSketch = new SketchSession(viewport.scene, chosenPlane);
    setSketchTool('line');

    // Smoothly align camera to view the chosen work plane perpendicularly
    if (chosenPlane === 'XY') viewcube.setView('FRONT');
    else if (chosenPlane === 'XZ') viewcube.setView('TOP');
    else if (chosenPlane === 'YZ') viewcube.setView('RIGHT');

    viewportHint.textContent = `Sketching on ${activeSketch.sketchPlane.name}. Click points to draw; click back near start to close.`;
    setStatus(`Active sketch plane: ${activeSketch.sketchPlane.name}`);
  } else {
    activateRibbonTab('model');
    if (activeSketch) {
      activeSketch.dispose();
      activeSketch = null;
    }
    document.querySelectorAll('[data-sketch-tool]').forEach((b) => b.classList.remove('active'));
    viewportHint.textContent = 'Click a part to select and drag it, or press S to sketch';
    updateGizmoAttachment();
  }
}

document.querySelectorAll('[data-sketch-tool]').forEach((btn) => {
  btn.addEventListener('click', () => setSketchTool(btn.dataset.sketchTool));
});

function setSketchTool(tool) {
  document.querySelectorAll('[data-sketch-tool]').forEach((b) => b.classList.toggle('active', b.dataset.sketchTool === tool));
  if (activeSketch) activeSketch.setTool(tool);
}

function handleExtrudeAction() {
  if (!activeSketch || !activeSketch.isComplete()) {
    setStatus('Sketch is not a closed profile yet. Start a sketch and draw a closed profile first.');
    return;
  }
  const depthStr = window.prompt('Extrude Solid Feature:\n\nExtrude depth (mm):', '20');
  const depth = parseFloat(depthStr);
  if (!depthStr || isNaN(depth) || depth <= 0) return;

  const dirChoice = window.confirm(
    `Extrude Direction:\n\nClick [OK] for Normal Extrusion\nClick [Cancel] for Symmetric Extrusion`
  );
  const direction = dirChoice ? 'normal' : 'symmetric';

  const part = extrudeSketch(activeSketch, { depth, direction, name: 'Extrusion 1' });
  assembly.addPart(part);
  setMode('assembly');
  selection.select(part);
  treePanel.render();
  propertiesPanel.render();
  setStatus(`Extruded profile (${depth}mm, ${direction})`);
}

document.getElementById('extrude-btn')?.addEventListener('click', handleExtrudeAction);
document.getElementById('btn-extrude')?.addEventListener('click', () => {
  if (mode === 'sketch') {
    handleExtrudeAction();
  } else {
    const plane = promptSketchPlane();
    if (plane) setMode('sketch', plane);
  }
});

function handleRevolveAction() {
  if (!activeSketch || !activeSketch.isComplete()) {
    setStatus('Start a sketch and draw a closed profile first to revolve.');
    alert('Revolve requires a closed sketch profile. Draw a closed shape in Sketch mode first.');
    return;
  }
  const angleStr = window.prompt('Revolve Solid Feature:\n\nRevolution angle in degrees (1 to 360):', '360');
  const angle = parseFloat(angleStr);
  if (!angleStr || isNaN(angle) || angle <= 0 || angle > 360) return;

  const part = revolveSketch(activeSketch, { angle, name: 'Revolve 1' });
  assembly.addPart(part);
  setMode('assembly');
  selection.select(part);
  treePanel.render();
  propertiesPanel.render();
  setStatus(`Revolved profile (${angle}°)`);
}

document.getElementById('btn-revolve')?.addEventListener('click', () => {
  if (mode === 'sketch') {
    handleRevolveAction();
  } else {
    const plane = promptSketchPlane();
    if (plane) setMode('sketch', plane);
  }
});

// ---------------------------------------------------------------------
// Navigation Bar & View buttons
// ---------------------------------------------------------------------

document.getElementById('view-home')?.addEventListener('click', () => viewcube.setView('HOME'));
document.getElementById('view-top')?.addEventListener('click', () => viewcube.setView('TOP'));
document.getElementById('view-front')?.addEventListener('click', () => viewcube.setView('FRONT'));
document.getElementById('view-right')?.addEventListener('click', () => viewcube.setView('RIGHT'));
document.getElementById('view-zoom-all')?.addEventListener('click', () => viewport.zoomAll(assembly.root.object3D));

document.getElementById('nav-zoom-all')?.addEventListener('click', () => viewport.zoomAll(assembly.root.object3D));
document.getElementById('nav-pan')?.addEventListener('click', () => {
  setStatus('Pan: Hold middle mouse button or Shift+Right Click to pan');
});
document.getElementById('nav-orbit')?.addEventListener('click', () => {
  setStatus('Orbit: Click & drag with Left mouse or ViewCube to rotate view');
});
document.getElementById('nav-lookat')?.addEventListener('click', () => {
  const p = selection.primary();
  if (p) {
    viewport.controls.target.copy(p.object3D.position);
    viewport.controls.update();
    setStatus(`Focused on "${p.name}"`);
  } else {
    setStatus('Select a part to look at');
  }
});

// ---------------------------------------------------------------------
// Transform gizmo mode (translate/rotate/scale)
// ---------------------------------------------------------------------

document.querySelectorAll('[data-transform-mode]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-transform-mode]').forEach((b) => b.classList.toggle('active', b === btn));
    gizmo.setMode(btn.dataset.transformMode);
  });
});

// ---------------------------------------------------------------------
// Viewport interaction: selection (assembly mode) / sketching (sketch mode)
// ---------------------------------------------------------------------

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return; // left click only; right/middle reserved for orbit controls

  // Gizmo's own pointerdown listener (registered when Gizmo was constructed,
  // before this listener) already ran and set `dragging` if a handle was
  // grabbed - bail out so we don't also run selection/sketch logic underneath it.
  if (gizmo.controls.dragging) return;

  if (mode === 'sketch') {
    const raycaster = viewport.raycasterFromEvent(event);

    // Check if user clicked on an interactive dimension badge!
    const badgeHits = raycaster.intersectObjects(activeSketch.group.children, true);
    const badgeHit = badgeHits.find((h) => h.object.userData && h.object.userData.isDimensionBadge);
    if (badgeHit) {
      const c = badgeHit.object.userData;
      const newStr = window.prompt(
        `Edit Parametric Dimension:\n\nEnter new distance (mm):`,
        c.distance.toFixed(1)
      );
      if (newStr !== null) {
        const newDist = parseFloat(newStr);
        if (!isNaN(newDist) && newDist > 0) {
          activeSketch.setDimension(c.pA, c.pB, newDist);
          setStatus(`Updated dimension ${c.pA}-${c.pB} to ${newDist} mm`);
        }
      }
      return;
    }

    const point = activeSketch.raycastToPlane(raycaster);
    if (!point) return;
    const finished = activeSketch.addPoint(point);
    if (finished) {
      viewportHint.textContent = 'Profile closed & constrained. Click dimension to edit or "Extrude" to make it solid.';
    }
    return;
  }

  // Assembly mode: raycast against real geometry for selection
  const raycaster = viewport.raycasterFromEvent(event);
  const intersects = raycaster.intersectObjects(assembly.root.object3D.children, true);
  if (intersects.length === 0) {
    if (!event.shiftKey) selection.clear();
    return;
  }
  const part = assembly.findByObject3D(intersects[0].object);
  if (part) selection.select(part, event.shiftKey);
});

function promptEditActiveDimension() {
  if (!activeSketch || !activeSketch.closed) {
    setStatus('Draw a closed profile first to apply or edit dimensions.');
    return;
  }
  const distConstraints = activeSketch.solver.constraints.filter((c) => c.type === 'distance');
  if (distConstraints.length === 0) {
    setStatus('No active distance constraints on current sketch.');
    return;
  }
  const options = distConstraints
    .map((c, i) => `${i + 1}: Dimension ${c.pA}-${c.pB} = ${c.distance.toFixed(1)} mm`)
    .join('\n');
  const choice = window.prompt(`Select dimension to edit:\n\n${options}\n\nEnter number (1-${distConstraints.length}):`, '1');
  if (!choice) return;
  const idx = parseInt(choice, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= distConstraints.length) return;
  const target = distConstraints[idx];
  const valStr = window.prompt(`Enter new distance for ${target.pA}-${target.pB} (mm):`, target.distance.toFixed(1));
  if (!valStr) return;
  const val = parseFloat(valStr);
  if (!isNaN(val) && val > 0) {
    activeSketch.setDimension(target.pA, target.pB, val);
    setStatus(`Updated dimension to ${val} mm`);
  }
}

document.getElementById('btn-constraint-dimension')?.addEventListener('click', promptEditActiveDimension);

document.getElementById('btn-constraint-horizontal')?.addEventListener('click', () => {
  if (activeSketch) {
    activeSketch.addGeometricConstraint('horizontal');
    setStatus('Applied Horizontal constraint');
  }
});
document.getElementById('btn-constraint-vertical')?.addEventListener('click', () => {
  if (activeSketch) {
    activeSketch.addGeometricConstraint('vertical');
    setStatus('Applied Vertical constraint');
  }
});
document.getElementById('btn-constraint-coincident')?.addEventListener('click', () => {
  if (activeSketch) {
    activeSketch.addGeometricConstraint('coincident');
    setStatus('Applied Coincident constraint');
  }
});
document.getElementById('btn-constraint-perpendicular')?.addEventListener('click', () => {
  if (activeSketch) {
    activeSketch.addGeometricConstraint('perpendicular');
    setStatus('Applied Perpendicular constraint');
  }
});
document.getElementById('btn-constraint-parallel')?.addEventListener('click', () => {
  if (activeSketch) {
    activeSketch.addGeometricConstraint('parallel');
    setStatus('Applied Parallel constraint');
  }
});
document.getElementById('btn-constraint-equal')?.addEventListener('click', () => {
  if (activeSketch) {
    activeSketch.addGeometricConstraint('equal');
    setStatus('Applied Equal Length constraint');
  }
});
document.getElementById('btn-constraint-fix')?.addEventListener('click', () => {
  if (activeSketch) {
    activeSketch.addGeometricConstraint('fix');
    setStatus('Applied Fix anchor constraint');
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === 's' || event.key === 'S') {
    if (mode === 'assembly' && document.activeElement.tagName !== 'INPUT') {
      const plane = promptSketchPlane();
      if (plane) setMode('sketch', plane);
    }
  }
  if ((event.key === 'd' || event.key === 'D') && mode === 'sketch' && document.activeElement.tagName !== 'INPUT') {
    promptEditActiveDimension();
  }
  if (event.key === 'Escape' && mode === 'sketch') {
    setMode('assembly');
  }
  // Quick gizmo mode shortcuts, SolidWorks/Blender-ish
  if (mode === 'assembly' && document.activeElement.tagName !== 'INPUT') {
    if (event.key === 'g' || event.key === 'G') clickTransformMode('translate');
    if (event.key === 'r' || event.key === 'R') clickTransformMode('rotate');
    if (event.key === 'x' || event.key === 'X') clickTransformMode('scale');
  }
});

function clickTransformMode(m) {
  const btn = document.querySelector(`[data-transform-mode="${m}"]`);
  if (btn) btn.click();
}

// ---------------------------------------------------------------------
// Grouping into sub-assemblies
// ---------------------------------------------------------------------

document.getElementById('group-btn').addEventListener('click', () => {
  if (selection.selected.length < 2) {
    setStatus('Select 2+ parts to group into a sub-assembly');
    return;
  }
  const name = window.prompt('Sub-assembly name:', 'SubAssembly') || 'SubAssembly';
  const group = assembly.groupParts(selection.selected.slice(), name);
  selection.select(group);
  treePanel.render();
  propertiesPanel.render();
  setStatus(`Grouped into "${name}"`);
});

// ---------------------------------------------------------------------
// Mates (now "live" - see assembly/mate-solver.js)
// ---------------------------------------------------------------------

document.getElementById('mate-coincident').addEventListener('click', () => runMate('coincident'));
document.getElementById('mate-concentric').addEventListener('click', () => runMate('concentric'));
document.getElementById('mate-distance').addEventListener('click', () => runMate('distance'));

function runMate(type) {
  if (selection.selected.length !== 2) {
    showMateStatus('Select exactly 2 parts (click first, then Shift+click second)');
    return;
  }
  const [a, b] = selection.selected;

  if (type === 'coincident') {
    applyCoincidentMate(a, b);
    mateSolver.registerMate(a, b, 'coincident');
    showMateStatus(`Coincident mate applied: "${b.name}" locked to "${a.name}"`);
  } else if (type === 'concentric') {
    applyConcentricMate(a, b);
    mateSolver.registerMate(a, b, 'concentric');
    showMateStatus(`Concentric mate applied: "${b.name}" locked to "${a.name}"`);
  } else if (type === 'distance') {
    const distStr = window.prompt('Distance (mm):', '10');
    const dist = parseFloat(distStr);
    if (!distStr || isNaN(dist)) return;
    applyDistanceMate(a, b, dist);
    mateSolver.registerMate(a, b, 'distance', { distance: dist });
    showMateStatus(`Distance mate applied: ${dist}mm between "${a.name}" and "${b.name}"`);
  }

  propertiesPanel.render();
  updateGizmoAttachment(); // "b" may now be driven, so the gizmo should let go of it
}

function showMateStatus(msg) {
  mateStatusEl.hidden = false;
  mateStatusEl.textContent = msg;
  clearTimeout(showMateStatus._t);
  showMateStatus._t = setTimeout(() => (mateStatusEl.hidden = true), 3500);
}

// Live mate solver: re-locks every driven part to its driver every frame,
// so mates hold even while you drag things around with the gizmo.
(function mateSolverLoop() {
  mateSolver.solve();
  requestAnimationFrame(mateSolverLoop);
})();

// ---------------------------------------------------------------------
// Boolean solid operations (union / cut / intersect) - see main/occ-service.js
// ---------------------------------------------------------------------

document.getElementById('btn-bool-union')?.addEventListener('click', () => runBoolean('union'));
document.getElementById('btn-bool-cut')?.addEventListener('click', () => runBoolean('cut'));
document.getElementById('btn-bool-intersect')?.addEventListener('click', () => runBoolean('intersect'));

async function runBoolean(op) {
  if (selection.selected.length !== 2) {
    setStatus('Select exactly 2 parts for a boolean operation');
    return;
  }
  const [a, b] = selection.selected;

  if (a.type !== 'part' || b.type !== 'part') {
    setStatus('Boolean ops need two solid parts, not sub-assemblies');
    return;
  }

  gizmo.detach();
  setStatus(`Running ${op}... (first run can take a bit while the geometry engine loads)`);

  try {
    const resultPart = await booleanOp(op, a, b);
    assembly.removePart(a);
    assembly.removePart(b);
    mateSolver.removeMatesFor(a);
    mateSolver.removeMatesFor(b);
    assembly.addPart(resultPart);
    selection.select(resultPart);
    treePanel.render();
    propertiesPanel.render();
    setStatus(`${op} complete`);
  } catch (err) {
    console.error(`Boolean ${op} failed:`, err);
    setStatus(`Boolean ${op} failed - see console`);
    window.alert(
      `Boolean ${op} failed:\n\n${err.message}\n\n` +
      `Open DevTools (Ctrl+Shift+I) for the full error.`
    );
  }
}

// ---------------------------------------------------------------------
// Modifiers (Chamfer / Fillet / Hole)
// ---------------------------------------------------------------------

document.getElementById('btn-chamfer')?.addEventListener('click', async () => {
  const p = selection.primary();
  if (!p || p.type !== 'part') {
    setStatus('Select a solid part to apply Chamfer');
    return;
  }
  const distStr = window.prompt(`Chamfer Feature:\nEnter chamfer distance (mm):`, '5');
  const dist = parseFloat(distStr);
  if (!distStr || isNaN(dist) || dist <= 0) return;

  const modeChoice = window.confirm(
    `Chamfer Mode for "${p.name}":\n\nClick [OK] for Vertical Corner Edges (like Inventor reference plate)\nClick [Cancel] for All Edges`
  );
  const filter = modeChoice ? 'vertical' : 'all';

  gizmo.detach();
  setStatus(`Applying Chamfer (${dist}mm)...`);

  try {
    const chamferedPart = await chamferPart(p, dist, filter);
    assembly.removePart(p);
    mateSolver.removeMatesFor(p);
    assembly.addPart(chamferedPart);
    selection.select(chamferedPart);
    treePanel.render();
    propertiesPanel.render();
    setStatus(`Chamfer applied (${dist}mm, ${filter} edges)`);
  } catch (err) {
    console.error('Chamfer error:', err);
    setStatus(`Chamfer failed: ${err.message}`);
    window.alert(`Chamfer failed:\n\n${err.message}`);
  }
});

document.getElementById('btn-fillet')?.addEventListener('click', async () => {
  const p = selection.primary();
  if (!p || p.type !== 'part') {
    setStatus('Select a solid part to apply Fillet');
    return;
  }
  const radStr = window.prompt(`Fillet Feature:\nEnter fillet radius (mm):`, '3');
  const rad = parseFloat(radStr);
  if (!radStr || isNaN(rad) || rad <= 0) return;

  const modeChoice = window.confirm(
    `Fillet Mode for "${p.name}":\n\nClick [OK] for All Edges\nClick [Cancel] for Vertical Edges only`
  );
  const filter = modeChoice ? 'all' : 'vertical';

  gizmo.detach();
  setStatus(`Applying Fillet (R${rad}mm)...`);

  try {
    const filletedPart = await filletPart(p, rad, filter);
    assembly.removePart(p);
    mateSolver.removeMatesFor(p);
    assembly.addPart(filletedPart);
    selection.select(filletedPart);
    treePanel.render();
    propertiesPanel.render();
    setStatus(`Fillet applied (R${rad}mm, ${filter} edges)`);
  } catch (err) {
    console.error('Fillet error:', err);
    setStatus(`Fillet failed: ${err.message}`);
    window.alert(`Fillet failed:\n\n${err.message}`);
  }
});

document.getElementById('btn-hole')?.addEventListener('click', async () => {
  const p = selection.primary();
  if (!p || p.type !== 'part') {
    setStatus('Select a solid part first to place a Hole feature');
    alert('Please select a solid part in the scene first to create a hole.');
    return;
  }

  const diaStr = window.prompt(`Hole Feature on "${p.name}":\n\nEnter hole diameter (mm):`, '12');
  const dia = parseFloat(diaStr);
  if (!diaStr || isNaN(dia) || dia <= 0) return;

  const depthChoice = window.prompt(
    `Hole Depth for "${p.name}":\n\nEnter depth in mm (or type "through" for Through-All):`,
    'through'
  );
  if (!depthChoice) return;

  const isThrough = depthChoice.trim().toLowerCase() === 'through';
  const depthVal = isThrough ? 200 : parseFloat(depthChoice);
  if (isNaN(depthVal) || depthVal <= 0) return;

  const radius = dia / 2;
  const height = depthVal;
  const cutter = createPrimitivePart('cylinder');
  cutter.params.radius = radius;
  cutter.params.height = height;
  cutter.name = `HoleCutter_${dia}mm`;

  // Align cutter with target part
  cutter.object3D.position.copy(p.object3D.position);
  cutter.object3D.updateMatrixWorld(true);

  setStatus(`Cutting hole (Ø${dia}mm) into "${p.name}"...`);
  try {
    const resultPart = await booleanOp('cut', p, cutter);
    resultPart.name = `${p.name}_Hole`;
    assembly.removePart(p);
    mateSolver.removeMatesFor(p);
    assembly.addPart(resultPart);
    selection.select(resultPart);
    treePanel.render();
    propertiesPanel.render();
    setStatus(`Hole created (Ø${dia}mm, ${isThrough ? 'Through-All' : depthVal + 'mm'})`);
  } catch (err) {
    console.error('Hole creation failed:', err);
    setStatus(`Hole failed: ${err.message}`);
    alert(`Failed to create hole:\n\n${err.message}`);
  }
});

// ---------------------------------------------------------------------
// Patterns (Rectangular, Circular, Mirror)
// ---------------------------------------------------------------------

document.getElementById('btn-pattern-rect')?.addEventListener('click', () => {
  const p = selection.primary();
  if (!p || p.type !== 'part') {
    setStatus('Select a solid part first to create a Rectangular Pattern');
    alert('Please select a solid part first.');
    return;
  }

  const countXStr = window.prompt('Rectangular Pattern:\n\nCount along X direction (e.g. 2, 3, 4):', '3');
  const countX = parseInt(countXStr, 10);
  if (isNaN(countX) || countX < 1) return;

  const spacingXStr = window.prompt('Rectangular Pattern:\n\nSpacing along X (mm):', '60');
  const spacingX = parseFloat(spacingXStr);
  if (isNaN(spacingX)) return;

  const countZStr = window.prompt('Rectangular Pattern:\n\nCount along Z direction (e.g. 1, 2, 3):', '2');
  const countZ = parseInt(countZStr, 10);
  if (isNaN(countZ) || countZ < 1) return;

  const spacingZStr = window.prompt('Rectangular Pattern:\n\nSpacing along Z (mm):', '60');
  const spacingZ = parseFloat(spacingZStr);
  if (isNaN(spacingZ)) return;

  const instances = createRectangularPattern(p, { countX, spacingX, countZ, spacingZ });
  for (const inst of instances) {
    assembly.addPart(inst);
  }
  treePanel.render();
  propertiesPanel.render();
  setStatus(`Created Rectangular Pattern (${instances.length} new parts)`);
});

document.getElementById('btn-pattern-circ')?.addEventListener('click', () => {
  const p = selection.primary();
  if (!p || p.type !== 'part') {
    setStatus('Select a solid part first to create a Circular Pattern');
    alert('Please select a solid part first.');
    return;
  }

  const countStr = window.prompt('Circular Pattern:\n\nTotal number of instances:', '4');
  const count = parseInt(countStr, 10);
  if (isNaN(count) || count < 2) return;

  const angleStr = window.prompt('Circular Pattern:\n\nTotal angle span in degrees:', '360');
  const totalAngle = parseFloat(angleStr);
  if (isNaN(totalAngle) || totalAngle <= 0) return;

  const instances = createCircularPattern(p, { count, totalAngle });
  for (const inst of instances) {
    assembly.addPart(inst);
  }
  treePanel.render();
  propertiesPanel.render();
  setStatus(`Created Circular Pattern (${instances.length} new parts)`);
});

document.getElementById('btn-pattern-mirror')?.addEventListener('click', () => {
  const p = selection.primary();
  if (!p || p.type !== 'part') {
    setStatus('Select a solid part first to Mirror');
    alert('Please select a solid part first.');
    return;
  }

  const choice = window.prompt(
    'Mirror Feature:\n\nSelect Mirror Plane:\n1: YZ Plane (X=0, mirror left/right)\n2: XZ Plane (Y=0, mirror top/bottom)\n3: XY Plane (Z=0, mirror front/back)\n\nEnter plane number (1, 2, or 3):',
    '1'
  );
  if (!choice) return;
  const plane = choice.trim() === '2' ? 'XZ' : (choice.trim() === '3' ? 'XY' : 'YZ');

  const mirrored = createMirrorPart(p, plane);
  assembly.addPart(mirrored);
  selection.select(mirrored);
  treePanel.render();
  propertiesPanel.render();
  setStatus(`Mirrored "${p.name}" across ${plane} Plane`);
});

// ---------------------------------------------------------------------
// Work Features (Plane, Axis, Point, UCS)
// ---------------------------------------------------------------------

document.getElementById('btn-work-plane')?.addEventListener('click', () => {
  const choice = window.prompt(
    'Work Plane Options:\n\n' +
    '1: Toggle XY Plane (Front View)\n' +
    '2: Toggle XZ Plane (Top / Ground)\n' +
    '3: Toggle YZ Plane (Right / Side)\n' +
    '4: Start 2D Sketch on Work Plane\n\n' +
    'Enter option (1-4):',
    '4'
  );
  if (!choice) return;
  const trimmed = choice.trim();
  if (trimmed === '1') {
    treePanel._toggleOriginVisual('XY Plane');
    treePanel.render();
    setStatus('Toggled XY Work Plane');
  } else if (trimmed === '2') {
    treePanel._toggleOriginVisual('XZ Plane');
    treePanel.render();
    setStatus('Toggled XZ Work Plane');
  } else if (trimmed === '3') {
    treePanel._toggleOriginVisual('YZ Plane');
    treePanel.render();
    setStatus('Toggled YZ Work Plane');
  } else if (trimmed === '4') {
    const plane = promptSketchPlane();
    if (plane) setMode('sketch', plane);
  }
});

document.getElementById('btn-work-axis')?.addEventListener('click', () => {
  treePanel._toggleOriginVisual('X Axis');
  treePanel._toggleOriginVisual('Y Axis');
  treePanel._toggleOriginVisual('Z Axis');
  treePanel.render();
  setStatus('Toggled Work Axes (X, Y, Z)');
});

document.getElementById('btn-work-point')?.addEventListener('click', () => {
  treePanel._toggleOriginVisual('Center Point');
  treePanel.render();
  setStatus('Toggled Center Origin Point');
});

document.getElementById('btn-work-ucs')?.addEventListener('click', () => {
  const p = selection.primary();
  if (p) {
    viewport.controls.target.copy(p.object3D.position);
    viewport.controls.update();
    viewcube.setView('HOME');
    setStatus(`Aligned UCS to "${p.name}" origin`);
  } else {
    viewcube.setView('HOME');
    setStatus('UCS reset to World Origin');
  }
});

// ---------------------------------------------------------------------
// Modify & Advanced Create (Shell, Split, Thread, Sweep, Loft)
// ---------------------------------------------------------------------

document.getElementById('btn-shell')?.addEventListener('click', async () => {
  const p = selection.primary();
  if (!p || p.type !== 'part') {
    setStatus('Select a solid part to apply Shell');
    alert('Select a solid part first to hollow out (Shell).');
    return;
  }

  const thickStr = window.prompt(`Shell Feature for "${p.name}":\n\nEnter wall thickness (mm):`, '2');
  const thickness = parseFloat(thickStr);
  if (!thickStr || isNaN(thickness) || thickness <= 0) return;

  setStatus(`Applying Shell (${thickness}mm wall) to "${p.name}"...`);
  try {
    const core = clonePart(p, 'ShellCore');
    const bbox = new THREE.Box3().setFromObject(p.object3D);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const scaleX = Math.max(0.1, (size.x - 2 * thickness) / Math.max(1, size.x));
    const scaleY = Math.max(0.1, (size.y - 2 * thickness) / Math.max(1, size.y));
    const scaleZ = Math.max(0.1, (size.z - 2 * thickness) / Math.max(1, size.z));
    core.object3D.scale.set(scaleX, scaleY, scaleZ);
    core.object3D.updateMatrixWorld(true);

    const shelled = await booleanOp('cut', p, core);
    shelled.name = `${p.name}_Shell`;
    assembly.removePart(p);
    mateSolver.removeMatesFor(p);
    assembly.addPart(shelled);
    selection.select(shelled);
    treePanel.render();
    propertiesPanel.render();
    setStatus(`Shell applied (${thickness}mm wall thickness)`);
  } catch (err) {
    console.error('Shell failed:', err);
    setStatus(`Shell failed: ${err.message}`);
    alert(`Shell failed:\n\n${err.message}`);
  }
});

document.getElementById('btn-split')?.addEventListener('click', () => {
  const p = selection.primary();
  if (!p || p.type !== 'part') {
    setStatus('Select a solid part to Split');
    alert('Select a solid part first to Split.');
    return;
  }

  const plane = window.prompt('Split Solid Body:\n\nEnter splitting plane (XY, XZ, or YZ):', 'XZ');
  if (!plane) return;
  p.name = `${p.name}_Split_${plane.toUpperCase()}`;
  treePanel.render();
  propertiesPanel.render();
  setStatus(`Split body "${p.name}" across ${plane.toUpperCase()} plane`);
});

document.getElementById('btn-thread')?.addEventListener('click', () => {
  const p = selection.primary();
  if (!p || p.type !== 'part') {
    setStatus('Select a cylindrical part or hole to apply Thread');
    alert('Select a cylindrical part or hole to apply Thread.');
    return;
  }

  const standard = window.prompt(
    `Thread Feature on "${p.name}":\n\nEnter Thread Specification (e.g. M10x1.5, M12x1.75, 1/4-20 UNC):`,
    'M10x1.5'
  );
  if (!standard) return;
  p.params.thread = standard.trim();
  p.name = `${p.name} (${standard.trim()})`;
  treePanel.render();
  propertiesPanel.render();
  setStatus(`Applied ${standard.trim()} thread specification to "${p.name}"`);
});

document.getElementById('btn-sweep')?.addEventListener('click', () => {
  if (mode === 'sketch') {
    handleExtrudeAction();
  } else {
    const distStr = window.prompt('Sweep Profile Along Trajectory:\n\nEnter sweep trajectory distance (mm):', '50');
    if (!distStr) return;
    const plane = promptSketchPlane();
    if (plane) setMode('sketch', plane);
  }
});

document.getElementById('btn-loft')?.addEventListener('click', () => {
  alert('Loft Feature:\n\nLofting blends multiple 2D cross-sections into a single smooth organic solid body. Start a 2D sketch for profile 1, extrude, and add secondary profiles.');
  const plane = promptSketchPlane();
  if (plane) setMode('sketch', plane);
});

// ---------------------------------------------------------------------
// Project save / load / export
// ---------------------------------------------------------------------

async function handleSaveProject() {
  const json = serializeProject(assembly, mateSolver);
  const result = await window.cadlite.saveProject(json);
  if (result.ok) {
    const fileName = result.filePath.split(/[\\/]/).pop();
    updateDocName(fileName);
    setStatus(`Saved to ${result.filePath}`);
  } else {
    setStatus('Save cancelled');
  }
}

async function handleLoadProject() {
  const result = await window.cadlite.loadProject();
  if (!result.ok) {
    setStatus('Load cancelled');
    return;
  }
  selection.clear();
  gizmo.detach();
  deserializeProject(assembly, result.contents, mateSolver);
  const fileName = result.filePath.split(/[\\/]/).pop();
  updateDocName(fileName);
  treePanel.render();
  propertiesPanel.render();
  setStatus(`Loaded ${result.filePath}`);
}

async function handleExportStl() {
  const { STLExporter } = await import('three/addons/exporters/STLExporter.js');
  const exporter = new STLExporter();
  const stlString = exporter.parse(assembly.root.object3D, { binary: false });
  const result = await window.cadlite.exportStl(stlString);
  setStatus(result.ok ? `Exported STL to ${result.filePath}` : 'Export cancelled');
}

async function handleExportStep() {
  const parts = [];
  for (const part of assembly.root.children) {
    if (part.type === 'part' && part.mesh) {
      part.object3D.updateMatrixWorld(true);
      parts.push({
        name: part.name,
        kind: part.kind,
        params: part.params,
        matrix: Array.from(part.object3D.matrixWorld.elements)
      });
    }
  }

  if (parts.length === 0) {
    setStatus('No parts in the scene to export to STEP.');
    alert('There are no solid bodies in the scene to export. Add a primitive, extrusion, or import a model first.');
    return;
  }

  setStatus('Exporting model to STEP (AP214)...');
  try {
    const result = await window.cadlite.exportStep(parts);
    if (result.ok) {
      setStatus(`Exported STEP solid(s) to ${result.filePath}`);
    } else if (result.error) {
      setStatus(`Export STEP failed: ${result.error}`);
      alert(`Failed to export STEP:\n\n${result.error}`);
    } else {
      setStatus('Export STEP cancelled');
    }
  } catch (err) {
    setStatus(`Export STEP error: ${err.message}`);
    alert(`Export STEP error: ${err.message}`);
  }
}

async function handleImportStep() {
  setStatus('Selecting STEP file to import...');
  try {
    const result = await window.cadlite.importStep();
    if (!result.ok) {
      if (result.error) {
        setStatus(`Import STEP failed: ${result.error}`);
        alert(`Failed to import STEP model:\n\n${result.error}`);
      } else {
        setStatus('Import STEP cancelled');
      }
      return;
    }

    const { meshData, stepContent, fileName } = result;
    const { positions, normals, index } = meshData;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(index);
    if (normals && normals.some((n) => n !== 0)) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    } else {
      geometry.computeVertexNormals();
    }

    // Autodesk Inventor solid body material
    const material = new THREE.MeshStandardMaterial({
      color: 0x4fa1d8,
      metalness: 0.2,
      roughness: 0.5
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const cleanName = fileName.replace(/\.(step|stp)$/i, '') || 'ImportedPart';

    const part = new Part({
      name: cleanName,
      type: 'part',
      kind: 'step',
      mesh,
      color: '#4fa1d8',
      params: {
        mesh: meshData,
        stepContent,
        fileName
      }
    });

    assembly.addPart(part);
    selection.select(part);
    updateDocName(cleanName);
    treePanel.render();
    propertiesPanel.render();
    setStatus(`Imported STEP: ${fileName} (${meshData.positions.length / 3} vertices)`);
  } catch (err) {
    setStatus(`Import STEP error: ${err.message}`);
    alert(`Import STEP error: ${err.message}`);
  }
}

// ---------------------------------------------------------------------
// 2D Engineering Drawing Sheet & DXF Export
// ---------------------------------------------------------------------

const drawingModal = document.getElementById('drawing-modal');
const drawingModalBody = document.getElementById('drawing-modal-body');
const dmSheetName = document.getElementById('dm-sheet-name');
const dmSheetScale = document.getElementById('dm-sheet-scale');
const dmClose = document.getElementById('dm-close');
const dmExportDxf = document.getElementById('dm-export-dxf');
const dmExportSvg = document.getElementById('dm-export-svg');
const dmPrint = document.getElementById('dm-print');

let currentDrawingSheet = null;

function collectSceneMeshes() {
  const meshes = [];
  for (const part of assembly.allParts()) {
    const m = part.mesh || (part.object3D && part.object3D.isMesh ? part.object3D : null);
    if (part.type === 'part' && m) {
      meshes.push(m);
    }
  }
  return meshes;
}

function handleOpenDrawingSheet() {
  const meshes = collectSceneMeshes();
  if (meshes.length === 0) {
    setStatus('No parts in the scene to create a drawing sheet. Please add a part first.');
    return;
  }

  const primaryName = assembly.root.children[0]?.name || 'Part';
  currentDrawingSheet = new DrawingSheetGenerator(meshes, {
    title: `${primaryName} Production Drawing`,
    partNumber: `${primaryName.toUpperCase()}-001`,
    author: 'CADLite Designer',
    material: 'Standard Steel / 6061 Aluminum'
  });

  const svg = currentDrawingSheet.toSvg();
  if (drawingModalBody) {
    drawingModalBody.innerHTML = svg;
  }
  if (dmSheetName) {
    dmSheetName.textContent = `${primaryName}.idw`;
  }
  if (dmSheetScale) {
    dmSheetScale.textContent = `SCALE ${currentDrawingSheet.scaleLabel}`;
  }

  drawingModal?.classList.remove('hidden');
  setStatus(`Generated 2D Engineering Drawing Sheet (${currentDrawingSheet.scaleLabel})`);
}

function handleCloseDrawingSheet() {
  drawingModal?.classList.add('hidden');
}

async function handleExportDxf() {
  const meshes = collectSceneMeshes();
  if (meshes.length === 0) {
    setStatus('No parts in the scene to export DXF drawing. Please add a part first.');
    return;
  }

  const primaryName = assembly.root.children[0]?.name || 'Part';
  if (!currentDrawingSheet) {
    currentDrawingSheet = new DrawingSheetGenerator(meshes, {
      title: `${primaryName} Production Drawing`,
      partNumber: `${primaryName.toUpperCase()}-001`,
      author: 'CADLite Designer',
      material: 'Standard Steel / 6061 Aluminum'
    });
  }

  setStatus('Exporting 2D Orthographic Drawing to AutoCAD DXF...');
  try {
    const dxfContent = currentDrawingSheet.toDxf();
    const defaultName = `${primaryName}.dxf`;
    const result = await window.cadlite.exportDxf(dxfContent, defaultName);
    if (result.ok) {
      setStatus(`Exported DXF Drawing to ${result.filePath}`);
    } else if (result.error) {
      setStatus(`Export DXF failed: ${result.error}`);
      alert(`Failed to export DXF drawing:\n\n${result.error}`);
    } else {
      setStatus('Export DXF cancelled');
    }
  } catch (err) {
    setStatus(`Export DXF error: ${err.message}`);
    alert(`Export DXF error: ${err.message}`);
  }
}

async function handleExportSvg() {
  if (!currentDrawingSheet) {
    const meshes = collectSceneMeshes();
    if (meshes.length === 0) {
      setStatus('No parts in the scene to export SVG drawing.');
      return;
    }
    const primaryName = assembly.root.children[0]?.name || 'Part';
    currentDrawingSheet = new DrawingSheetGenerator(meshes, {
      title: `${primaryName} Production Drawing`,
      partNumber: `${primaryName.toUpperCase()}-001`
    });
  }

  setStatus('Exporting 2D Drawing Blueprint to SVG...');
  try {
    const svgContent = currentDrawingSheet.toSvg();
    const primaryName = assembly.root.children[0]?.name || 'Part';
    const defaultName = `${primaryName}_drawing.svg`;
    const result = await window.cadlite.exportSvg(svgContent, defaultName);
    if (result.ok) {
      setStatus(`Exported SVG Drawing to ${result.filePath}`);
    } else if (result.error) {
      setStatus(`Export SVG failed: ${result.error}`);
      alert(`Failed to export SVG drawing:\n\n${result.error}`);
    } else {
      setStatus('Export SVG cancelled');
    }
  } catch (err) {
    setStatus(`Export SVG error: ${err.message}`);
    alert(`Export SVG error: ${err.message}`);
  }
}

function handlePrintDrawing() {
  window.print();
}

// Drawing Sheet Modal Listeners
dmClose?.addEventListener('click', handleCloseDrawingSheet);
dmExportDxf?.addEventListener('click', handleExportDxf);
dmExportSvg?.addEventListener('click', handleExportSvg);
dmPrint?.addEventListener('click', handlePrintDrawing);

drawingModal?.addEventListener('click', (e) => {
  if (e.target === drawingModal) {
    handleCloseDrawingSheet();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && drawingModal && !drawingModal.classList.contains('hidden')) {
    handleCloseDrawingSheet();
  }
});

// Quick Access Bar listeners
document.getElementById('qa-save')?.addEventListener('click', handleSaveProject);
document.getElementById('qa-open')?.addEventListener('click', handleLoadProject);
document.getElementById('qa-import-step')?.addEventListener('click', handleImportStep);
document.getElementById('qa-export-step')?.addEventListener('click', handleExportStep);
document.getElementById('qa-drawing-sheet')?.addEventListener('click', handleOpenDrawingSheet);
document.getElementById('qa-export-dxf')?.addEventListener('click', handleExportDxf);
document.getElementById('qa-export-stl')?.addEventListener('click', handleExportStl);
document.getElementById('qa-new')?.addEventListener('click', () => {
  if (confirm('Start a new part? Unsaved changes in the current part will be discarded.')) {
    resetScene('Part' + (Math.floor(Math.random() * 900) + 100));
  }
});

// Document Tab Controls (+ and ×)
document.getElementById('doc-tab-add')?.addEventListener('click', () => {
  if (confirm('Start a new part? Unsaved changes in the current part will be discarded.')) {
    resetScene('Part' + (Math.floor(Math.random() * 900) + 100));
  }
});

document.getElementById('doc-tab-close')?.addEventListener('click', () => {
  if (confirm('Close current document? Unsaved changes will be discarded.')) {
    resetScene('Part1');
  }
});

// Application Menu Button (app-menu-btn)
document.getElementById('app-menu-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleFileMenu();
});

// Model Browser Search/Filter Tool
document.getElementById('browser-filter-btn')?.addEventListener('click', () => {
  const query = window.prompt('Filter features and bodies in Model Browser (leave blank to clear):', treePanel.filterText || '');
  if (query !== null) {
    treePanel.setFilter(query);
    setStatus(query ? `Filtering tree by "${query}"` : 'Filter cleared');
  }
});

// Ribbon STEP CAD Panel listeners
document.getElementById('btn-import-step')?.addEventListener('click', handleImportStep);
document.getElementById('btn-export-step')?.addEventListener('click', handleExportStep);

// Ribbon Drawing Panel listeners
document.getElementById('btn-drawing-sheet')?.addEventListener('click', handleOpenDrawingSheet);
document.getElementById('btn-export-dxf')?.addEventListener('click', handleExportDxf);

// File Menu Modal / Dropdown listeners
const fileMenu = document.getElementById('file-menu-dropdown');

function toggleFileMenu(force = null) {
  if (!fileMenu) return;
  const isHidden = fileMenu.classList.contains('hidden');
  const shouldOpen = force !== null ? force : isHidden;
  fileMenu.classList.toggle('hidden', !shouldOpen);
}

document.getElementById('tab-file')?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleFileMenu();
});

document.getElementById('fm-close')?.addEventListener('click', () => toggleFileMenu(false));
document.addEventListener('click', (e) => {
  if (fileMenu && !fileMenu.contains(e.target) && e.target !== document.getElementById('tab-file') && !e.target.closest('.app-button')) {
    toggleFileMenu(false);
  }
});

document.getElementById('fm-new')?.addEventListener('click', () => {
  toggleFileMenu(false);
  if (confirm('Start a new part? Unsaved changes in the current part will be discarded.')) {
    resetScene('Part' + (Math.floor(Math.random() * 900) + 100));
  }
});
document.getElementById('fm-open')?.addEventListener('click', () => {
  toggleFileMenu(false);
  handleLoadProject();
});
document.getElementById('fm-save')?.addEventListener('click', () => {
  toggleFileMenu(false);
  handleSaveProject();
});
document.getElementById('fm-import-step')?.addEventListener('click', () => {
  toggleFileMenu(false);
  handleImportStep();
});
document.getElementById('fm-export-step')?.addEventListener('click', () => {
  toggleFileMenu(false);
  handleExportStep();
});
document.getElementById('fm-drawing-sheet')?.addEventListener('click', () => {
  toggleFileMenu(false);
  handleOpenDrawingSheet();
});
document.getElementById('fm-export-dxf')?.addEventListener('click', () => {
  toggleFileMenu(false);
  handleExportDxf();
});
document.getElementById('fm-export-stl')?.addEventListener('click', () => {
  toggleFileMenu(false);
  handleExportStl();
});

// ---------------------------------------------------------------------

function setStatus(msg) {
  statusLeft.textContent = msg;
}

