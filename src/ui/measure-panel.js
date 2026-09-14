import { formatDistance, formatArea, formatAngle, UNITS } from '../core/measure-engine.js';

/**
 * eDrawings-Style Measurement HUD Panel
 *
 * Provides a floating, draggable heads-up display panel with:
 * - Entity filter buttons (All, Vertex, Edge, Face)
 * - Unit selector (mm, cm, m, in) and precision controls
 * - Selection summary chips for Item 1 and Item 2
 * - Comprehensive measurement metrics: True 3D Distance, Normal Distance,
 *   orthogonal Delta X / Delta Y / Delta Z, Angular orientation, and
 *   hole / cylinder clearances.
 */
export class MeasurePanel {
  constructor(containerEl, measureTool, options = {}) {
    this.containerEl = containerEl;
    this.measureTool = measureTool;
    this.onClose = options.onClose || (() => {});

    this._buildDOM();
    this._wireEvents();
    this._makeDraggable();

    // Hook up measure tool callbacks
    this.measureTool.onMeasureChange = (res) => this.render(res);
    this.measureTool.onStateChange = (state) => this.syncState(state);
  }

  _buildDOM() {
    this.containerEl.classList.add('measure-hud', 'hidden');
    this.containerEl.innerHTML = `
      <div class="measure-hud-header" id="measure-hud-drag-handle">
        <div class="measure-hud-title">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21.3 15.3l-6.6-6.6a2 2 0 0 0-2.8 0L2.7 17.9a2 2 0 0 0 0 2.8l.6.6a2 2 0 0 0 2.8 0l9.2-9.2 1.4 1.4-2.8 2.8 1.4 1.4 2.8-2.8 1.4 1.4-2.8 2.8 1.4 1.4 2.8-2.8 1.4 1.4z"/>
          </svg>
          <span>Measure (eDrawings)</span>
        </div>
        <div class="measure-hud-actions">
          <button class="measure-hud-btn" id="mhud-clear" title="Clear selection (Esc)">Clear</button>
          <button class="measure-hud-close" id="mhud-close" title="Close Measure tool">×</button>
        </div>
      </div>

      <!-- Filter Controls Bar -->
      <div class="measure-filter-bar">
        <span class="mfilter-label">Filter:</span>
        <button class="mfilter-btn active" data-mfilter="all" title="Smart filter: snap to any element">All</button>
        <button class="mfilter-btn" data-mfilter="vertex" title="Snap to Vertices only">Vertex</button>
        <button class="mfilter-btn" data-mfilter="edge" title="Snap to Edges only">Edge</button>
        <button class="mfilter-btn" data-mfilter="face" title="Snap to Faces only">Face</button>
      </div>

      <!-- Settings Bar (Units & Precision) -->
      <div class="measure-settings-bar">
        <div class="msetting-item">
          <label>Units:</label>
          <select id="mhud-units">
            <option value="mm" selected>mm</option>
            <option value="cm">cm</option>
            <option value="m">m</option>
            <option value="in">inch</option>
          </select>
        </div>
        <div class="msetting-item">
          <label>Decimals:</label>
          <select id="mhud-precision">
            <option value="1">0.1</option>
            <option value="2" selected>0.01</option>
            <option value="3">0.001</option>
          </select>
        </div>
        <div class="msetting-item checkbox">
          <label title="Show 3D RGB dashed projection lines between points in viewport">
            <input type="checkbox" id="mhud-show-deltas" checked />
            XYZ Lines
          </label>
        </div>
      </div>

      <!-- Active Selection Items -->
      <div class="measure-selections-container">
        <div class="mselection-card" id="mhud-card1">
          <div class="mselection-tag cyan">Item 1</div>
          <div class="mselection-desc" id="mhud-item1-desc">Click entity in 3D viewport...</div>
        </div>
        <div class="mselection-card" id="mhud-card2">
          <div class="mselection-tag amber">Item 2</div>
          <div class="mselection-desc" id="mhud-item2-desc">Click second entity...</div>
        </div>
      </div>

      <!-- Results Grid -->
      <div class="measure-results-container" id="mhud-results">
        <div class="measure-empty-prompt">
          Select any vertex, edge, or face to inspect, or select 2 items to measure distance.
        </div>
      </div>
    `;

    this.card1El = this.containerEl.querySelector('#mhud-item1-desc');
    this.card2El = this.containerEl.querySelector('#mhud-item2-desc');
    this.resultsEl = this.containerEl.querySelector('#mhud-results');
    this.unitsSelect = this.containerEl.querySelector('#mhud-units');
    this.precisionSelect = this.containerEl.querySelector('#mhud-precision');
    this.showDeltasCheck = this.containerEl.querySelector('#mhud-show-deltas');
    this.filterBtns = this.containerEl.querySelectorAll('[data-mfilter]');
  }

  _wireEvents() {
    // Close button
    this.containerEl.querySelector('#mhud-close')?.addEventListener('click', () => {
      this.measureTool.deactivate();
      this.onClose();
    });

    // Clear button
    this.containerEl.querySelector('#mhud-clear')?.addEventListener('click', () => {
      this.measureTool.clear();
    });

    // Filter mode buttons
    this.filterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mfilter;
        this.filterBtns.forEach((b) => b.classList.toggle('active', b === btn));
        this.measureTool.setFilterMode(mode);
      });
    });

    // Units selector
    this.unitsSelect?.addEventListener('change', (e) => {
      this.measureTool.setUnits(e.target.value);
    });

    // Precision selector
    this.precisionSelect?.addEventListener('change', (e) => {
      this.measureTool.decimals = parseInt(e.target.value, 10) || 2;
      this.render(this.measureTool.currentResult);
    });

    // Delta lines toggle
    this.showDeltasCheck?.addEventListener('change', (e) => {
      this.measureTool.setShowDeltaLines(e.target.checked);
    });
  }

  show() {
    this.containerEl.classList.remove('hidden');
    this.render(this.measureTool.currentResult);
  }

  hide() {
    this.containerEl.classList.add('hidden');
  }

  syncState(state) {
    if (state.active) {
      this.show();
    } else {
      this.hide();
    }

    if (state.filterMode) {
      this.filterBtns.forEach((b) => b.classList.toggle('active', b.dataset.mfilter === state.filterMode));
    }
    if (state.units && this.unitsSelect) {
      this.unitsSelect.value = state.units;
    }
  }

  render(res) {
    const e1 = this.measureTool.entity1;
    const e2 = this.measureTool.entity2;
    const units = this.measureTool.units;
    const dec = this.measureTool.decimals;

    // 1. Update Selection Cards
    if (e1) {
      this.card1El.innerHTML = this._formatEntityDesc(e1, units, dec);
    } else {
      this.card1El.innerHTML = '<span class="mplaceholder">Click entity in 3D viewport...</span>';
    }

    if (e2) {
      this.card2El.innerHTML = this._formatEntityDesc(e2, units, dec);
    } else if (e1) {
      this.card2El.innerHTML = '<span class="mplaceholder">Click second entity to measure...</span>';
    } else {
      this.card2El.innerHTML = '<span class="mplaceholder">Waiting for selection...</span>';
    }

    // 2. Update Results
    if (!res) {
      this.resultsEl.innerHTML = `
        <div class="measure-empty-prompt">
          Select any vertex, edge, or face to inspect, or select 2 items to measure distance.
        </div>
      `;
      return;
    }

    let html = '';

    // Hero Main Measurement
    if (res.distance !== undefined && res.type !== 'single_vertex') {
      const distFormatted = formatDistance(res.distance, units, dec);
      html += `
        <div class="measure-hero-result">
          <div class="measure-hero-label">${res.title || 'Distance'}</div>
          <div class="measure-hero-value">${distFormatted}</div>
        </div>
      `;
    }

    // Detailed metrics table
    html += '<table class="measure-metrics-table"><tbody>';

    if (res.normalDistance !== undefined) {
      html += `
        <tr>
          <th>Normal Distance</th>
          <td><strong>${formatDistance(res.normalDistance, units, dec)}</strong></td>
        </tr>
      `;
    }

    if (res.angle !== undefined) {
      html += `
        <tr>
          <th>Angle</th>
          <td><strong>${formatAngle(res.angle, 1)}</strong></td>
        </tr>
      `;
    }

    // Orthogonal Deltas
    if (res.deltaX !== undefined || res.deltaY !== undefined || res.deltaZ !== undefined) {
      html += `
        <tr class="delta-row">
          <th><span class="delta-badge dx">ΔX</span></th>
          <td>${formatDistance(res.deltaX, units, dec)}</td>
        </tr>
        <tr class="delta-row">
          <th><span class="delta-badge dy">ΔY</span></th>
          <td>${formatDistance(res.deltaY, units, dec)}</td>
        </tr>
        <tr class="delta-row">
          <th><span class="delta-badge dz">ΔZ</span></th>
          <td>${formatDistance(res.deltaZ, units, dec)}</td>
        </tr>
      `;
    }

    // Circular / Cylindrical metrics (Diameters, Clearance)
    if (res.minDistance !== undefined && res.maxDistance !== undefined) {
      html += `
        <tr>
          <th>Min Clearance</th>
          <td>${formatDistance(res.minDistance, units, dec)}</td>
        </tr>
        <tr>
          <th>Max Span</th>
          <td>${formatDistance(res.maxDistance, units, dec)}</td>
        </tr>
      `;
    }

    if (res.diameter1 !== undefined) {
      html += `
        <tr>
          <th>Ø Item 1</th>
          <td>${formatDistance(res.diameter1, units, dec)} (R: ${formatDistance(res.radius1, units, dec)})</td>
        </tr>
      `;
    }
    if (res.diameter2 !== undefined) {
      html += `
        <tr>
          <th>Ø Item 2</th>
          <td>${formatDistance(res.diameter2, units, dec)} (R: ${formatDistance(res.radius2, units, dec)})</td>
        </tr>
      `;
    }

    // Single-entity specific rows
    if (res.type === 'single_vertex') {
      const c = res.coordinates;
      html += `
        <tr><th>X</th><td>${formatDistance(c[0], units, dec)}</td></tr>
        <tr><th>Y</th><td>${formatDistance(c[1], units, dec)}</td></tr>
        <tr><th>Z</th><td>${formatDistance(c[2], units, dec)}</td></tr>
      `;
    } else if (res.type === 'single_edge') {
      if (res.isCircular) {
        html += `
          <tr><th>Radius (R)</th><td>${formatDistance(res.radius, units, dec)}</td></tr>
          <tr><th>Diameter (Ø)</th><td>${formatDistance(res.diameter, units, dec)}</td></tr>
          <tr><th>Arc Length</th><td>${formatDistance(res.length, units, dec)}</td></tr>
        `;
      } else {
        html += `<tr><th>Length</th><td>${formatDistance(res.length, units, dec)}</td></tr>`;
      }
    } else if (res.type === 'single_face') {
      html += `
        <tr><th>Surface Type</th><td style="text-transform:capitalize;">${res.surfaceType}</td></tr>
        <tr><th>Area</th><td>${formatArea(res.area, units, dec)}</td></tr>
      `;
      if (res.normal) {
        const [nx, ny, nz] = res.normal;
        html += `<tr><th>Normal</th><td class="mono">[${nx.toFixed(2)}, ${ny.toFixed(2)}, ${nz.toFixed(2)}]</td></tr>`;
      }
      if (res.radius) {
        html += `
          <tr><th>Cylinder Radius (R)</th><td>${formatDistance(res.radius, units, dec)}</td></tr>
          <tr><th>Diameter (Ø)</th><td>${formatDistance(res.diameter, units, dec)}</td></tr>
        `;
      }
    }

    html += '</tbody></table>';
    this.resultsEl.innerHTML = html;
  }

  _formatEntityDesc(ent, units, dec) {
    if (!ent) return '';
    const partName = ent.part ? ent.part.name : 'Part';

    if (ent.type === 'vertex') {
      const c = ent.worldPoint;
      return `<strong>${ent.topoId || 'Vertex'}</strong> <small>(${partName})</small><br/>
        <span class="mono" style="font-size:10px;color:#94a3b8;">X: ${c[0].toFixed(1)}, Y: ${c[1].toFixed(1)}, Z: ${c[2].toFixed(1)}</span>`;
    }

    if (ent.type === 'edge') {
      const ed = ent.edgeData;
      const isCirc = ed && (ed.curveType === 'circle' || (ed.radius && ed.radius > 0));
      const kind = isCirc ? 'Circular Edge' : 'Linear Edge';
      return `<strong>${ent.topoId || kind}</strong> <small>(${partName})</small><br/>
        <span style="font-size:11px;color:#38bdf8;">${kind}</span>`;
    }

    if (ent.type === 'face') {
      const fr = ent.faceRange;
      const sType = (fr && fr.surfaceType) || 'Planar';
      return `<strong>${ent.topoId || 'Face'}</strong> <small>(${partName})</small><br/>
        <span style="text-transform:capitalize;font-size:11px;color:#a3e635;">${sType} Face</span>`;
    }

    return `<strong>${ent.type}</strong> <small>(${partName})</small>`;
  }

  _makeDraggable() {
    const handle = this.containerEl.querySelector('#measure-hud-drag-handle');
    if (!handle) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = this.containerEl.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      handle.setPointerCapture(e.pointerId);
      this.containerEl.style.right = 'auto'; // Break CSS right-anchoring
    });

    handle.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      this.containerEl.style.left = `${Math.max(10, initialLeft + dx)}px`;
      this.containerEl.style.top = `${Math.max(40, initialTop + dy)}px`;
    });

    const stopDrag = (e) => {
      if (isDragging) {
        isDragging = false;
        try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    };

    handle.addEventListener('pointerup', stopDrag);
    handle.addEventListener('pointercancel', stopDrag);
  }
}
