const DIM_FIELDS = {
  box: [
    { key: 'width', label: 'Width' },
    { key: 'height', label: 'Height' },
    { key: 'depth', label: 'Depth' }
  ],
  cylinder: [
    { key: 'radius', label: 'Radius' },
    { key: 'height', label: 'Height' }
  ],
  sphere: [{ key: 'radius', label: 'Radius' }],
  cone: [
    { key: 'radius', label: 'Radius' },
    { key: 'height', label: 'Height' }
  ],
  extrude: [{ key: 'depth', label: 'Depth' }],
  revolve: [{ key: 'angle', label: 'Angle (°)' }]
};

export class PropertiesPanel {
  constructor(rootEl, selection, { onGeometryChange, onTransformChange, onRename, onColorChange } = {}) {
    this.rootEl = rootEl;
    this.selection = selection;
    this.onGeometryChange = onGeometryChange || (() => {});
    this.onTransformChange = onTransformChange || (() => {});
    this.onRename = onRename || (() => {});
    this.onColorChange = onColorChange || (() => {});
  }

  render() {
    this.rootEl.innerHTML = '';

    // If in Face filter mode and a face is selected, show Face Topology Inspector
    if (this.selection.filterMode === 'face') {
      const faceSel = this.selection.primaryFace();
      if (faceSel) {
        this.rootEl.appendChild(this._faceInspectorGroup(faceSel));
        return;
      }
    }

    // If in Edge filter mode and an edge is selected, show Edge Topology Inspector
    if (this.selection.filterMode === 'edge') {
      const edgeSel = this.selection.primaryEdge();
      if (edgeSel) {
        this.rootEl.appendChild(this._edgeInspectorGroup(edgeSel));
        return;
      }
    }

    const part = this.selection.primary();

    if (!part) {
      this.rootEl.innerHTML = '<div class="empty-state">Nothing selected</div>';
      return;
    }

    this.rootEl.appendChild(this._identityGroup(part));
    this.rootEl.appendChild(this._transformGroup(part));

    if (part.topology) {
      this.rootEl.appendChild(this._topologySummaryGroup(part));
    }

    const dims = DIM_FIELDS[part.kind];
    if (dims && dims.length) {
      this.rootEl.appendChild(this._dimensionsGroup(part, dims));
    }

    if (part.kind === 'step' && part.params && part.params.mesh) {
      this.rootEl.appendChild(this._stepDetailsGroup(part));
    } else if (part.kind === 'boolean') {
      this.rootEl.appendChild(this._booleanDetailsGroup(part));
    } else if (part.kind === 'chamfer') {
      this.rootEl.appendChild(this._chamferDetailsGroup(part));
    } else if (part.kind === 'fillet') {
      this.rootEl.appendChild(this._filletDetailsGroup(part));
    } else if (part.kind === 'shell') {
      this.rootEl.appendChild(this._shellDetailsGroup(part));
    }
  }

  _faceInspectorGroup(sel) {
    const { part, faceRange, topoId } = sel;
    const g = this._group('Face Topology (TNS)');

    const rowId = document.createElement('div');
    rowId.className = 'prop-row';
    rowId.innerHTML = `<label>TNS ID</label><span style="font-family:var(--font-mono);font-size:11px;color:#38bdf8;font-weight:bold;">${topoId}</span>`;
    g.appendChild(rowId);

    const rowPart = document.createElement('div');
    rowPart.className = 'prop-row';
    rowPart.innerHTML = `<label>Host Part</label><span style="font-size:11px;">${part.name}</span>`;
    g.appendChild(rowPart);

    const rowType = document.createElement('div');
    rowType.className = 'prop-row';
    rowType.innerHTML = `<label>Type</label><span style="text-transform:capitalize;font-size:11px;color:#a3e635;">${faceRange.surfaceType || 'plane'}</span>`;
    g.appendChild(rowType);

    if (faceRange.area) {
      const rowArea = document.createElement('div');
      rowArea.className = 'prop-row';
      rowArea.innerHTML = `<label>Area</label><span style="font-family:var(--font-mono);font-size:11px;">${faceRange.area.toFixed(1)} mm²</span>`;
      g.appendChild(rowArea);
    }

    if (faceRange.normal) {
      const [nx, ny, nz] = faceRange.normal;
      const rowNorm = document.createElement('div');
      rowNorm.className = 'prop-row';
      rowNorm.innerHTML = `<label>Normal</label><span style="font-family:var(--font-mono);font-size:10px;color:#94a3b8;">[${nx.toFixed(2)}, ${ny.toFixed(2)}, ${nz.toFixed(2)}]</span>`;
      g.appendChild(rowNorm);
    }

    return g;
  }

  _edgeInspectorGroup(sel) {
    const { part, edgeData, topoId } = sel;
    const g = this._group('Edge Topology (TNS)');

    const rowId = document.createElement('div');
    rowId.className = 'prop-row';
    rowId.innerHTML = `<label>TNS ID</label><span style="font-family:var(--font-mono);font-size:11px;color:#facc15;font-weight:bold;">${topoId}</span>`;
    g.appendChild(rowId);

    const rowPart = document.createElement('div');
    rowPart.className = 'prop-row';
    rowPart.innerHTML = `<label>Host Part</label><span style="font-size:11px;">${part.name}</span>`;
    g.appendChild(rowPart);

    const rowType = document.createElement('div');
    rowType.className = 'prop-row';
    rowType.innerHTML = `<label>Curve</label><span style="text-transform:capitalize;font-size:11px;color:#a3e635;">${edgeData.curveType || 'line'}</span>`;
    g.appendChild(rowType);

    if (edgeData.length) {
      const rowLen = document.createElement('div');
      rowLen.className = 'prop-row';
      rowLen.innerHTML = `<label>Length</label><span style="font-family:var(--font-mono);font-size:11px;color:#38bdf8;">${edgeData.length.toFixed(1)} mm</span>`;
      g.appendChild(rowLen);
    }

    if (edgeData.adjacentFaceIds && edgeData.adjacentFaceIds.length > 0) {
      const rowAdj = document.createElement('div');
      rowAdj.className = 'prop-row';
      rowAdj.innerHTML = `<label>Faces</label><span style="font-family:var(--font-mono);font-size:10px;color:#94a3b8;">${edgeData.adjacentFaceIds.join(', ')}</span>`;
      g.appendChild(rowAdj);
    }

    return g;
  }

  _topologySummaryGroup(part) {
    const g = this._group('B-Rep Topology (TNS)');
    const faceCount = (part.topology.faces && part.topology.faces.length) || (part.topology.faceRanges && part.topology.faceRanges.length) || 0;
    const edgeCount = (part.topology.edges && part.topology.edges.length) || 0;

    const row1 = document.createElement('div');
    row1.className = 'prop-row';
    row1.innerHTML = `<label>Faces</label><span style="font-family:var(--font-mono);font-size:11px;color:#38bdf8;">${faceCount} B-Rep Faces</span>`;
    g.appendChild(row1);

    const row2 = document.createElement('div');
    row2.className = 'prop-row';
    row2.innerHTML = `<label>Edges</label><span style="font-family:var(--font-mono);font-size:11px;color:#facc15;">${edgeCount} B-Rep Edges</span>`;
    g.appendChild(row2);

    return g;
  }

  _booleanDetailsGroup(part) {
    const g = this._group('Boolean CSG Solid');
    const op = (part.params && (part.params.sourceOp || part.params.op)) || 'boolean';
    const triCount = part.params && part.params.mesh ? (part.params.mesh.index.length / 3) : 0;

    const row1 = document.createElement('div');
    row1.className = 'prop-row';
    row1.innerHTML = `<label>Operation</label><span style="font-family:var(--font-mono);font-size:11px;color:#c084fc;text-transform:uppercase;font-weight:bold;">${op}</span>`;
    g.appendChild(row1);

    const row2 = document.createElement('div');
    row2.className = 'prop-row';
    row2.innerHTML = `<label>Chainable</label><span style="font-family:var(--font-mono);font-size:11px;color:#38bdf8;">True (Recursive OCC)</span>`;
    g.appendChild(row2);

    const row3 = document.createElement('div');
    row3.className = 'prop-row';
    row3.innerHTML = `<label>Triangles</label><span style="font-family:var(--font-mono);font-size:11px;">${triCount}</span>`;
    g.appendChild(row3);

    return g;
  }

  _chamferDetailsGroup(part) {
    const g = this._group('Chamfer Feature');
    const dist = (part.params && (part.params.chamferDistance || part.params.distance)) || 5;
    const filter = (part.params && part.params.filter) || 'all';

    const row1 = document.createElement('div');
    row1.className = 'prop-row';
    row1.innerHTML = `<label>Distance</label><span style="font-family:var(--font-mono);font-size:11px;color:#38bdf8;">${dist} mm</span>`;
    g.appendChild(row1);

    const row2 = document.createElement('div');
    row2.className = 'prop-row';
    row2.innerHTML = `<label>Edge Filter</label><span style="font-family:var(--font-mono);font-size:11px;">${filter}</span>`;
    g.appendChild(row2);

    return g;
  }

  _filletDetailsGroup(part) {
    const g = this._group('Fillet Feature');
    const radius = (part.params && (part.params.filletRadius || part.params.radius)) || 3;
    const filter = (part.params && part.params.filter) || 'all';

    const row1 = document.createElement('div');
    row1.className = 'prop-row';
    row1.innerHTML = `<label>Radius</label><span style="font-family:var(--font-mono);font-size:11px;color:#38bdf8;">R${radius} mm</span>`;
    g.appendChild(row1);

    const row2 = document.createElement('div');
    row2.className = 'prop-row';
    row2.innerHTML = `<label>Edge Filter</label><span style="font-family:var(--font-mono);font-size:11px;">${filter}</span>`;
    g.appendChild(row2);

    return g;
  }

  _shellDetailsGroup(part) {
    const g = this._group('Shell Feature');
    const thickness = (part.params && part.params.thickness) || 2;
    const openFace = (part.params && part.params.openFace !== false);

    const row1 = document.createElement('div');
    row1.className = 'prop-row';
    row1.innerHTML = `<label>Wall</label><span style="font-family:var(--font-mono);font-size:11px;color:#38bdf8;">${thickness} mm</span>`;
    g.appendChild(row1);

    const row2 = document.createElement('div');
    row2.className = 'prop-row';
    row2.innerHTML = `<label>Style</label><span style="font-family:var(--font-mono);font-size:11px;">${openFace ? 'Open Top' : 'Closed Cavity'}</span>`;
    g.appendChild(row2);

    return g;
  }

  _stepDetailsGroup(part) {
    const g = this._group('STEP Solid Info');
    const vCount = (part.params.mesh.positions.length / 3);
    const tCount = (part.params.mesh.index.length / 3);

    const row1 = document.createElement('div');
    row1.className = 'prop-row';
    row1.innerHTML = `<label>Standard</label><span style="font-family:var(--font-mono);font-size:11px;color:#38bdf8;">ISO-10303 AP214</span>`;
    g.appendChild(row1);

    const row2 = document.createElement('div');
    row2.className = 'prop-row';
    row2.innerHTML = `<label>Vertices</label><span style="font-family:var(--font-mono);font-size:11px;">${vCount}</span>`;
    g.appendChild(row2);

    const row3 = document.createElement('div');
    row3.className = 'prop-row';
    row3.innerHTML = `<label>Triangles</label><span style="font-family:var(--font-mono);font-size:11px;">${tCount}</span>`;
    g.appendChild(row3);

    return g;
  }

  _group(title) {
    const g = document.createElement('div');
    g.className = 'prop-group';
    const h = document.createElement('div');
    h.className = 'prop-group-title';
    h.textContent = title;
    g.appendChild(h);
    return g;
  }

  _identityGroup(part) {
    const g = this._group('Identity');

    const nameRow = document.createElement('div');
    nameRow.className = 'prop-row';
    nameRow.innerHTML = `<label>Name</label>`;
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = part.name;
    nameInput.addEventListener('change', () => {
      part.name = nameInput.value;
      this.onRename(part);
    });
    nameRow.appendChild(nameInput);
    g.appendChild(nameRow);

    if (part.type === 'part') {
      const colorRow = document.createElement('div');
      colorRow.className = 'prop-row';
      colorRow.innerHTML = `<label>Color</label>`;
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = part.color;
      colorInput.addEventListener('input', () => {
        part.color = colorInput.value;
        this.onColorChange(part);
      });
      colorRow.appendChild(colorInput);
      g.appendChild(colorRow);
    }

    return g;
  }

  _transformGroup(part) {
    const g = this._group('Position (mm)');
    const obj = part.object3D;
    ['x', 'y', 'z'].forEach((axis) => {
      const row = document.createElement('div');
      row.className = 'xyz-row';
      row.innerHTML = `<span class="axis-label ${axis}">${axis.toUpperCase()}</span>`;
      const input = document.createElement('input');
      input.type = 'number';
      input.step = '1';
      input.value = Math.round(obj.position[axis] * 100) / 100;
      input.addEventListener('input', () => {
        obj.position[axis] = parseFloat(input.value) || 0;
        this.onTransformChange(part);
      });
      row.appendChild(input);
      g.appendChild(row);
    });
    return g;
  }

  _dimensionsGroup(part, dims) {
    const g = this._group('Dimensions (mm)');
    dims.forEach(({ key, label }) => {
      const row = document.createElement('div');
      row.className = 'prop-row';
      row.innerHTML = `<label>${label}</label>`;
      const input = document.createElement('input');
      input.type = 'number';
      input.step = '1';
      input.min = '0.1';
      input.value = part.params[key];
      input.addEventListener('change', () => {
        const v = parseFloat(input.value);
        if (!isNaN(v) && v > 0) {
          part.params[key] = v;
          this.onGeometryChange(part);
        }
      });
      row.appendChild(input);
      g.appendChild(row);
    });
    return g;
  }
}
