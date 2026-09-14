import * as THREE from 'three';
import { Part } from '../assembly/Part.js';
import { SectionCaps } from '../core/section-caps.js';
import { ExplodedView } from '../core/exploded-view.js';

export function buildImportedTree(data) {
  if (!data || !Array.isArray(data.children) && data.type === 'assembly') throw new Error('Invalid STEP component tree.');
  let part;
  if (data.type === 'assembly') {
    part = new Part({ name: data.name, type: 'assembly', kind: 'group' });
    if (data.matrix) part.object3D.applyMatrix4(new THREE.Matrix4().fromArray(data.matrix));
    for (const child of data.children) part.addChild(buildImportedTree(child));
  } else {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.meshData.positions, 3));
    geometry.setIndex(data.meshData.index);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: data.color, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide }));
    part = new Part({ name: data.name, kind: 'step', color: data.color, mesh, topology: data.meshData,
      params: { mesh: data.meshData, stepContent: data.stepContent, fileName: data.name + '.step' } });
  }
  return part;
}

export function isVisibleHit(hit, plane = null) {
  for (let object = hit.object; object; object = object.parent) if (!object.visible) return false;
  return !plane || plane.distanceToPoint(hit.point) >= -1e-6;
}

export function installStepViewer({ viewport, assembly, selection, refresh, open, measure, status, setInspection, onExplode }) {
  const caps = new SectionCaps(viewport, assembly);
  const explode = new ExplodedView(assembly);
  const bar = document.createElement('div');
  bar.id = 'step-viewer-toolbar';
  bar.innerHTML = `<strong>STEP Viewer</strong>
    <button data-action="open">Open STEP</button><button data-action="cancel" hidden>Cancel import</button>
    <button data-action="fit">Fit</button><button data-action="measure">Measure</button>
    <button data-action="hide">Hide selected</button><button data-action="isolate">Isolate</button><button data-action="show">Show all</button>
    <label>Display <select aria-label="Display mode"><option value="edges">Shaded + edges</option><option value="shaded">Shaded</option><option value="wire">Wireframe</option><option value="transparent">Transparent</option></select></label>
    <label>Section <select aria-label="Section plane"><option value="off">Off</option><option value="x">X</option><option value="y">Y</option><option value="z">Z</option></select></label>
    <input aria-label="Section position" type="range" min="0" max="100" value="50" disabled><button data-action="flip" disabled>Flip</button>
    <label><input type="checkbox" checked aria-label="Fill section cuts"> Fill cuts</label>
    <label>Explode <select aria-label="Explode direction"><option value="radial">Radial</option><option value="x">X</option><option value="y">Y</option><option value="z">Z</option></select></label>
    <input aria-label="Explode amount" type="range" min="0" max="100" value="0"><output aria-label="Explode percentage">0%</output><button data-action="reset-explode">Reset assembly</button>
    <label><input type="checkbox" checked aria-label="Inspection mode"> Inspect only</label>`;
  document.getElementById('workspace').before(bar);
  const display = bar.querySelector('[aria-label="Display mode"]');
  const section = bar.querySelector('[aria-label="Section plane"]');
  const slider = bar.querySelector('[aria-label="Section position"]');
  const explodeSlider = bar.querySelector('[aria-label="Explode amount"]');
  const explodeAxis = bar.querySelector('[aria-label="Explode direction"]');
  const explodeOutput = bar.querySelector('[aria-label="Explode percentage"]');
  let sign = 1;
  viewport.renderer.localClippingEnabled = true;
  const apply = () => {
    const bounds = new THREE.Box3().setFromObject(assembly.root.object3D);
    const axis = section.value;
    slider.disabled = axis === 'off';
    bar.querySelector('[data-action="flip"]').disabled = axis === 'off';
    viewport.sectionPlane = null;
    if (axis !== 'off' && !bounds.isEmpty()) {
      const normal = new THREE.Vector3(); normal[axis] = sign;
      const coordinate = THREE.MathUtils.lerp(bounds.min[axis], bounds.max[axis], Number(slider.value) / 100);
      viewport.sectionPlane = new THREE.Plane(normal, -sign * coordinate);
      slider.title = `${coordinate.toFixed(2)} mm`;
    }
    const planes = viewport.sectionPlane ? [viewport.sectionPlane] : [];
    // Apply clipping to selection/measurement overlays too, without clipping the grid.
    viewport.scene.traverse(object => {
      if (!object.material || !(object.isMesh || object.isLine)) return;
      if (!assembly.findByObject3D(object) && !object.userData.isOverlay) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material.clippingPlanes = planes; material.clipShadows = true; material.needsUpdate = true;
      }
    });
    for (const part of assembly.allParts()) {
      if (!part.mesh) continue;
      const material = part.mesh.material;
      material.wireframe = display.value === 'wire';
      material.transparent = display.value === 'transparent';
      material.opacity = material.transparent ? 0.3 : 1;
      material.depthWrite = !material.transparent;
      material.side = THREE.DoubleSide;
      if (part.edgeGroup) part.edgeGroup.visible = display.value === 'edges';
    }
    selection.clearSubSelections();
    caps.enabled = bar.querySelector('[aria-label="Fill section cuts"]').checked && display.value !== 'wire';
  };
  const resetExplode = () => {
    if (!explode.active) return;
    explode.reset();
    viewport.explodedPreviewActive = false;
    explodeSlider.value = '0'; explodeOutput.textContent = '0%';
    selection.clearSubSelections(); apply(); refresh();
  };
  const updateExplode = () => {
    if (Number(explodeSlider.value) === 0) { resetExplode(); return; }
    if (!explode.setAmount(explodeSlider.value, explodeAxis.value)) {
      explodeSlider.value = '0'; status('Explode requires at least two components.'); return;
    }
    viewport.explodedPreviewActive = true;
    onExplode?.();
    bar.querySelector('[aria-label="Inspection mode"]').checked = true;
    setInspection(true);
    explodeOutput.textContent = `${explode.amount}%`;
    selection.clearSubSelections(); apply(); refresh();
    status('Exploded inspection preview. Reset assembly restores positions; measuring, editing, saving, or exporting also resets it.');
  };
  bar.addEventListener('click', event => {
    const action = event.target.dataset.action;
    if (!action) return;
    if (action === 'open') { open(); return; }
    if (action === 'cancel') { window.cadlite.cancelStepImport(); return; }
    if (action === 'fit') { viewport.zoomAll(selection.primary()?.object3D || assembly.root.object3D); return; }
    if (action === 'measure') { measure(); return; }
    if (action === 'flip') { sign *= -1; apply(); return; }
    if (action === 'reset-explode') { resetExplode(); status('Restored assembled positions.'); return; }
    const selected = [...selection.selected];
    if (action !== 'show' && !selected.length) { status('Select a component in the tree or viewport first.'); return; }
    if (action === 'hide') selected.forEach(part => part.setVisible(false));
    if (action === 'show') assembly.allParts().forEach(part => part.setVisible(true));
    if (action === 'isolate') {
      const keep = new Set();
      for (const part of selected) {
        for (const child of part.walk()) keep.add(child);
        for (let parent = part.parent; parent; parent = parent.parent) keep.add(parent);
      }
      assembly.allParts().forEach(part => part.setVisible(keep.has(part)));
    }
    selection.clear(); refresh();
  });
  display.addEventListener('change', apply);
  section.addEventListener('change', () => { apply(); status(section.value === 'off' ? 'Section disabled' : 'Section enabled. Fill cuts closes sliced solid display meshes; holes remain open.'); });
  slider.addEventListener('input', apply);
  explodeSlider.addEventListener('input', updateExplode);
  explodeAxis.addEventListener('change', () => { if (explode.active) updateExplode(); });
  bar.querySelector('[aria-label="Fill section cuts"]').addEventListener('change', apply);
  bar.querySelector('[aria-label="Inspection mode"]').addEventListener('change', event => { resetExplode(); setInspection(event.target.checked); });
  // Restore before modeling callbacks receive clicks or keyboard shortcuts.
  document.addEventListener('click', event => {
    if (!explode.active || !(event.target instanceof Element)) return;
    if (event.target.closest('#ribbon-view, #viewcube-container, [data-tab="view"]')) return;
    if (event.target.closest('#ribbon, #properties-panel, #file-menu-dropdown, #quick-access-bar')) resetExplode();
  }, true);
  document.addEventListener('focusin', event => { if (event.target.closest?.('#properties-panel')) resetExplode(); }, true);
  window.addEventListener('keydown', event => {
    if (!explode.active) return;
    if (event.key === 'Escape' || event.key === 'Delete' || /^[sgrxmdp]$/i.test(event.key) || event.ctrlKey || event.metaKey) resetExplode();
  }, true);
  return { apply, resetExplode, busy(value) {
    bar.querySelector('[data-action="open"]').disabled = value;
    bar.querySelector('[data-action="cancel"]').hidden = !value;
  } };
}
