import { TransformControls } from 'three/addons/controls/TransformControls.js';

/**
 * Wraps three.js TransformControls to let the user drag-move, rotate, or
 * scale the currently selected part directly in the viewport, instead of
 * typing numbers into the Properties panel.
 */
export class Gizmo {
  constructor(viewport, { onChange, onDragStateChange } = {}) {
    this.viewport = viewport;
    this.controls = new TransformControls(viewport.camera, viewport.renderer.domElement);
    this.controls.setSize(0.85);
    this.controls.setMode('translate');
    this.attached = null;

    // Prevent orbit-drag and gizmo-drag from fighting each other
    this.controls.addEventListener('dragging-changed', (event) => {
      viewport.controls.enabled = !event.value;
      if (onDragStateChange) onDragStateChange(event.value);
    });

    this.controls.addEventListener('objectChange', () => {
      if (onChange) onChange(this.attached);
    });

    // In this three.js version TransformControls IS an Object3D itself
    viewport.scene.add(this.controls);
  }

  attach(part) {
    if (!part) {
      this.detach();
      return;
    }
    this.controls.attach(part.object3D);
    this.attached = part;
  }

  detach() {
    this.controls.detach();
    this.attached = null;
  }

  setMode(mode) {
    // 'translate' | 'rotate' | 'scale'
    this.controls.setMode(mode);
  }

  setEnabled(enabled) {
    this.controls.enabled = enabled;
    this.controls.visible = enabled;
  }
}
