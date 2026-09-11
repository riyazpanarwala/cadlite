import * as THREE from 'three';

/**
 * ViewCube & Coordinate Triad for CADLite.
 * Provides an interactive 3D navigation cube in the top-right corner
 * and a synchronized XYZ triad in the bottom-left corner.
 */
export class ViewCube {
  constructor(container, viewport) {
    this.container = container;
    this.viewport = viewport;
    this.camera = viewport.camera;
    this.controls = viewport.controls;

    this.size = 110;
    this.animating = false;

    this._setupCubeRenderer();
    this._setupTriadRenderer();
    this._setupEvents();
  }

  _setupCubeRenderer() {
    this.cubeCanvas = document.createElement('canvas');
    this.cubeCanvas.className = 'viewcube-canvas';
    this.cubeCanvas.width = this.size * window.devicePixelRatio;
    this.cubeCanvas.height = this.size * window.devicePixelRatio;
    this.cubeCanvas.style.width = `${this.size}px`;
    this.cubeCanvas.style.height = `${this.size}px`;
    this.container.appendChild(this.cubeCanvas);

    // Mini scene & orthographic camera
    this.cubeScene = new THREE.Scene();
    const half = 36;
    this.cubeCam = new THREE.OrthographicCamera(-half, half, half, -half, 1, 500);
    this.cubeCam.position.set(0, 0, 100);

    this.cubeRenderer = new THREE.WebGLRenderer({
      canvas: this.cubeCanvas,
      alpha: true,
      antialias: true
    });
    this.cubeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.cubeRenderer.setSize(this.size, this.size);

    // Lights
    const ambLight = new THREE.AmbientLight(0xffffff, 0.9);
    this.cubeScene.add(ambLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(40, 60, 50);
    this.cubeScene.add(dirLight);

    // Cube materials with face text
    this.faceNames = ['RIGHT', 'LEFT', 'TOP', 'BOTTOM', 'FRONT', 'BACK'];
    this.faceMaterials = this.faceNames.map((name) => {
      return new THREE.MeshLambertMaterial({
        map: this._createFaceTexture(name, false),
        color: 0xffffff
      });
    });

    const cubeGeo = new THREE.BoxGeometry(38, 38, 38);
    this.cubeMesh = new THREE.Mesh(cubeGeo, this.faceMaterials);
    this.cubeScene.add(this.cubeMesh);

    // Wireframe edges outline
    const edges = new THREE.EdgesGeometry(cubeGeo);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x64748b, linewidth: 1.5 });
    this.cubeMesh.add(new THREE.LineSegments(edges, lineMat));

    // Home button in corner
    this.homeBtn = document.createElement('button');
    this.homeBtn.className = 'viewcube-home-btn';
    this.homeBtn.title = 'Home View (Isometric)';
    this.homeBtn.innerHTML = '⌂';
    this.container.appendChild(this.homeBtn);
    this.homeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setView('HOME');
    });

    this.hoveredFaceIndex = -1;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
  }

  _createFaceTexture(text, isHovered) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = isHovered ? '#70b5ff' : '#e2e8f0';
    ctx.fillRect(0, 0, 128, 128);

    // Bevel border
    ctx.lineWidth = 4;
    ctx.strokeStyle = isHovered ? '#005fb8' : '#94a3b8';
    ctx.strokeRect(2, 2, 124, 124);

    // Label
    ctx.font = 'bold 24px -apple-system, Segoe UI, sans-serif';
    ctx.fillStyle = isHovered ? '#003366' : '#1e293b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  _setupTriadRenderer() {
    this.triadCanvas = document.createElement('canvas');
    this.triadCanvas.className = 'triad-canvas';
    this.triadSize = 85;
    this.triadCanvas.width = this.triadSize * window.devicePixelRatio;
    this.triadCanvas.height = this.triadSize * window.devicePixelRatio;
    this.triadCanvas.style.width = `${this.triadSize}px`;
    this.triadCanvas.style.height = `${this.triadSize}px`;

    const triadContainer = document.createElement('div');
    triadContainer.className = 'triad-container';
    triadContainer.appendChild(this.triadCanvas);
    this.container.parentElement.appendChild(triadContainer);

    this.triadScene = new THREE.Scene();
    const half = 24;
    this.triadCam = new THREE.OrthographicCamera(-half, half, half, -half, 1, 500);
    this.triadCam.position.set(0, 0, 80);

    this.triadRenderer = new THREE.WebGLRenderer({
      canvas: this.triadCanvas,
      alpha: true,
      antialias: true
    });
    this.triadRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.triadRenderer.setSize(this.triadSize, this.triadSize);

    this.triadGroup = new THREE.Group();
    this.triadScene.add(this.triadGroup);

    // Colored arrows: X = Red, Y = Green, Z = Blue
    const makeArrow = (dir, color, labelText) => {
      const arrowGroup = new THREE.Group();
      const length = 18;
      const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0, 0), length, color, 4, 3);
      arrowGroup.add(arrow);

      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.font = 'bold 40px -apple-system, Segoe UI, sans-serif';
      ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, 32, 32);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(7, 7, 1);
      const endPos = dir.clone().multiplyScalar(length + 5);
      sprite.position.copy(endPos);
      arrowGroup.add(sprite);

      return arrowGroup;
    };

    this.triadGroup.add(makeArrow(new THREE.Vector3(1, 0, 0), 0xd32f2f, 'X'));
    this.triadGroup.add(makeArrow(new THREE.Vector3(0, 1, 0), 0x2e7d32, 'Y'));
    this.triadGroup.add(makeArrow(new THREE.Vector3(0, 0, 1), 0x1565c0, 'Z'));
  }

  _setupEvents() {
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };

    this.cubeCanvas.addEventListener('pointermove', (e) => {
      const rect = this.cubeCanvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (isDragging) {
        const deltaX = (e.clientX - prevMouse.x) * 0.01;
        const deltaY = (e.clientY - prevMouse.y) * 0.01;
        prevMouse = { x: e.clientX, y: e.clientY };

        const offset = this.camera.position.clone().sub(this.controls.target);
        const radius = offset.length();
        let theta = Math.atan2(offset.x, offset.z);
        let phi = Math.acos(Math.max(-1, Math.min(1, offset.y / radius)));

        theta -= deltaX * 2;
        phi = Math.max(0.01, Math.min(Math.PI - 0.01, phi - deltaY * 2));

        offset.x = radius * Math.sin(phi) * Math.sin(theta);
        offset.y = radius * Math.cos(phi);
        offset.z = radius * Math.sin(phi) * Math.cos(theta);

        this.camera.position.copy(this.controls.target).add(offset);
        this.camera.lookAt(this.controls.target);
        this.controls.update();
        return;
      }

      this.raycaster.setFromCamera(this.mouse, this.cubeCam);
      const hits = this.raycaster.intersectObject(this.cubeMesh);
      let hitFace = -1;
      if (hits.length > 0 && hits[0].face) {
        hitFace = hits[0].face.materialIndex;
      }

      if (hitFace !== this.hoveredFaceIndex) {
        if (this.hoveredFaceIndex >= 0) {
          this.faceMaterials[this.hoveredFaceIndex].map = this._createFaceTexture(
            this.faceNames[this.hoveredFaceIndex],
            false
          );
        }
        if (hitFace >= 0) {
          this.faceMaterials[hitFace].map = this._createFaceTexture(this.faceNames[hitFace], true);
        }
        this.hoveredFaceIndex = hitFace;
      }
    });

    this.cubeCanvas.addEventListener('pointerdown', (e) => {
      isDragging = true;
      prevMouse = { x: e.clientX, y: e.clientY };
      this.cubeCanvas.setPointerCapture(e.pointerId);
    });

    this.cubeCanvas.addEventListener('pointerup', (e) => {
      this.cubeCanvas.releasePointerCapture(e.pointerId);
      const moved = Math.hypot(e.clientX - prevMouse.x, e.clientY - prevMouse.y);
      isDragging = false;

      if (moved < 4 && this.hoveredFaceIndex >= 0) {
        const faceName = this.faceNames[this.hoveredFaceIndex];
        this.setView(faceName);
      }
    });

    this.cubeCanvas.addEventListener('pointerleave', () => {
      if (this.hoveredFaceIndex >= 0) {
        this.faceMaterials[this.hoveredFaceIndex].map = this._createFaceTexture(
          this.faceNames[this.hoveredFaceIndex],
          false
        );
        this.hoveredFaceIndex = -1;
      }
    });
  }

  /**
   * Snaps the camera smoothly to predefined standard views
   */
  setView(view) {
    if (this.animating) return;

    const target = this.controls.target.clone();
    const currentDist = this.camera.position.distanceTo(target) || 300;
    const startPos = this.camera.position.clone();
    const startUp = this.camera.up.clone();

    let endPos = new THREE.Vector3();
    let endUp = new THREE.Vector3(0, 1, 0);

    switch (view) {
      case 'TOP':
        endPos.set(0, currentDist, 0.0001);
        endUp.set(0, 0, -1);
        break;
      case 'BOTTOM':
        endPos.set(0, -currentDist, 0.0001);
        endUp.set(0, 0, 1);
        break;
      case 'FRONT':
        endPos.set(0, 0, currentDist);
        endUp.set(0, 1, 0);
        break;
      case 'BACK':
        endPos.set(0, 0, -currentDist);
        endUp.set(0, 1, 0);
        break;
      case 'RIGHT':
        endPos.set(currentDist, 0, 0);
        endUp.set(0, 1, 0);
        break;
      case 'LEFT':
        endPos.set(-currentDist, 0, 0);
        endUp.set(0, 1, 0);
        break;
      case 'HOME':
      default:
        endPos.set(currentDist * 0.65, currentDist * 0.55, currentDist * 0.65);
        endUp.set(0, 1, 0);
        break;
    }

    endPos.add(target);

    this.animating = true;
    const startTime = performance.now();
    const duration = 300;

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const t = 1 - Math.pow(1 - progress, 3); // Ease out cubic

      this.camera.position.lerpVectors(startPos, endPos, t);
      this.camera.up.lerpVectors(startUp, endUp, t);
      this.camera.lookAt(target);
      this.controls.update();

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.camera.position.copy(endPos);
        this.camera.up.copy(endUp);
        this.controls.update();
        this.animating = false;
      }
    };
    requestAnimationFrame(animate);
  }

  update() {
    this.cubeMesh.quaternion.copy(this.camera.quaternion).invert();
    this.cubeRenderer.render(this.cubeScene, this.cubeCam);

    this.triadGroup.quaternion.copy(this.camera.quaternion).invert();
    this.triadRenderer.render(this.triadScene, this.triadCam);
  }
}
