import * as THREE from 'three';

const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const percent = value => Number.isFinite(value) && value >= 0 && value <= 100;

/** Validate metadata before a project replaces the open assembly. */
export function normalizeReviewViews(data = []) {
  if (!Array.isArray(data)) throw new Error('Invalid saved review views.');
  const ids = new Set();
  return data.map(view => {
    const camera = view?.camera, settings = view?.settings;
    if (!view || typeof view.id !== 'string' || !view.id || ids.has(view.id) ||
        typeof view.name !== 'string' || !view.name.trim() || !camera || !settings ||
        !vector(camera.position) || !vector(camera.target) || !vector(camera.up) ||
        new THREE.Vector3(...camera.up).lengthSq() < 1e-12 ||
        new THREE.Vector3(...camera.position).distanceToSquared(new THREE.Vector3(...camera.target)) < 1e-12 ||
        !Number.isFinite(camera.fov) || camera.fov <= 0 || camera.fov >= 180 ||
        !Number.isFinite(camera.zoom) || camera.zoom <= 0 ||
        !Number.isFinite(camera.near) || camera.near <= 0 || !Number.isFinite(camera.far) || camera.far <= camera.near ||
        !['edges','shaded','wire','transparent'].includes(settings.display) ||
        !['off','x','y','z'].includes(settings.section) || !percent(settings.sectionPosition) ||
        ![-1,1].includes(settings.sectionSign) || typeof settings.fillCuts !== 'boolean' ||
        !['radial','x','y','z'].includes(settings.explodeAxis) || !percent(settings.explodeAmount) ||
        !Array.isArray(view.visibility) || !view.visibility.every(item => typeof item?.id === 'string' && typeof item.visible === 'boolean')) {
      throw new Error('Invalid saved review view.');
    }
    ids.add(view.id);
    return {
      id: view.id, name: view.name.trim(),
      camera: { position:[...camera.position], target:[...camera.target], up:[...camera.up], fov:camera.fov, zoom:camera.zoom, near:camera.near, far:camera.far },
      settings: { display:settings.display, section:settings.section, sectionPosition:settings.sectionPosition, sectionSign:settings.sectionSign,
        fillCuts:settings.fillCuts, explodeAxis:settings.explodeAxis, explodeAmount:settings.explodeAmount },
      visibility: view.visibility.map(item => ({id:item.id,visible:item.visible}))
    };
  });
}

export function captureReviewView(viewport, assembly, settings, name, id = THREE.MathUtils.generateUUID()) {
  const camera = viewport.camera;
  return normalizeReviewViews([{
    id, name,
    camera: { position:camera.position.toArray(), target:viewport.controls.target.toArray(), up:camera.up.toArray(),
      fov:camera.fov, zoom:camera.zoom, near:camera.near, far:camera.far },
    settings,
    visibility: assembly.allParts().map(part => ({id:part.id,visible:part.visible}))
  }])[0];
}

export function restoreReviewCamera(viewport, data) {
  const { camera, controls } = viewport;
  // Drain the previous orbit's damping so it cannot move the recalled camera.
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update();
  camera.position.fromArray(data.position);
  camera.up.fromArray(data.up).normalize();
  camera.fov = data.fov; camera.zoom = data.zoom; camera.near = data.near; camera.far = data.far;
  controls.target.fromArray(data.target);
  camera.lookAt(controls.target);
  camera.updateProjectionMatrix();
  controls.update();
  controls.enableDamping = damping;
}
