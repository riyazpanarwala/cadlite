import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Viewport {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x12151a);

    const rect = canvas.parentElement.getBoundingClientRect();
    this.camera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.1, 10000);
    this.camera.position.set(180, 150, 220);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(rect.width, rect.height);
    this.renderer.shadowMap.enabled = true;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);

    this._setupLights();
    this._setupGrid();

    window.addEventListener('resize', () => this._onResize());
    this._renderCallbacks = [];
    this._animate();
  }

  onRender(cb) {
    this._renderCallbacks.push(cb);
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight(0x8fb8ff, 0x1a1d22, 0.55);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(150, 220, 120);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -300;
    key.shadow.camera.right = 300;
    key.shadow.camera.top = 300;
    key.shadow.camera.bottom = -300;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x4fb0ff, 0.25);
    fill.position.set(-200, 80, -150);
    this.scene.add(fill);
  }

  _setupGrid() {
    const grid = new THREE.GridHelper(1000, 50, 0x2c72a8, 0x232833);
    grid.material.opacity = 0.4;
    grid.material.transparent = true;
    this.scene.add(grid);

    // Subtle axes
    const axes = new THREE.AxesHelper(60);
    this.scene.add(axes);

    // Ground plane to receive shadows subtly
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1000, 1000),
      new THREE.ShadowMaterial({ opacity: 0.18 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  _onResize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(rect.width, rect.height);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    for (let i = 0; i < this._renderCallbacks.length; i++) {
      this._renderCallbacks[i]();
    }
  }

  /** Centers the camera on all objects in the scene */
  zoomAll(rootGroup) {
    const box = new THREE.Box3();
    if (rootGroup && rootGroup.children.length > 0) {
      box.setFromObject(rootGroup);
    }
    if (box.isEmpty()) {
      box.set(new THREE.Vector3(-50, -50, -50), new THREE.Vector3(50, 50, 50));
    }
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 50);
    const dist = maxDim * 2.2;

    const offset = this.camera.position.clone().sub(this.controls.target).normalize();
    if (offset.lengthSq() < 0.001) offset.set(1, 1, 1).normalize();

    this.controls.target.copy(center);
    this.camera.position.copy(center).add(offset.multiplyScalar(dist));
    this.camera.lookAt(center);
    this.controls.update();
  }

  /** Builds a raycaster from a mouse event, in normalized device coords. */
  raycasterFromEvent(event) {
    const rect = this.canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);
    return raycaster;
  }
}
