export class SelectionManager {
  constructor(onChange) {
    this.selected = []; // array of Part, order matters (first = primary, useful for mates)
    this.onChange = onChange || (() => {});
  }

  select(part, additive = false) {
    if (!additive) this.clear(false);
    if (!this.selected.includes(part)) {
      this.selected.push(part);
      this._highlight(part, true);
    }
    this.onChange(this.selected);
  }

  toggle(part) {
    if (this.selected.includes(part)) {
      this.deselect(part);
    } else {
      this.select(part, true);
    }
  }

  deselect(part) {
    const idx = this.selected.indexOf(part);
    if (idx !== -1) {
      this.selected.splice(idx, 1);
      this._highlight(part, false);
    }
    this.onChange(this.selected);
  }

  clear(notify = true) {
    for (const p of this.selected) this._highlight(p, false);
    this.selected = [];
    if (notify) this.onChange(this.selected);
  }

  isSelected(part) {
    return this.selected.includes(part);
  }

  primary() {
    return this.selected[0] || null;
  }

  _highlight(part, on) {
    part.object3D.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        if (on) {
          obj.userData._prevEmissive = obj.material.emissive ? obj.material.emissive.getHex() : null;
          if (obj.material.emissive) obj.material.emissive.setHex(0x2c72a8);
        } else if (obj.material.emissive) {
          obj.material.emissive.setHex(obj.userData._prevEmissive ?? 0x000000);
        }
      }
    });
  }
}
