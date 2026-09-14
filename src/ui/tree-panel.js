import * as THREE from 'three';
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const KIND_ICON = {
  box: '📦',
  cylinder: '◯',
  sphere: '●',
  cone: '▲',
  extrude: '⬒',
  chamfer: '◢',
  fillet: '⌒',
  boolean: '∪',
  revolve: '↻',
  hole: '🕳',
  shell: '⛶',
  step: '📦',
  group: '📁'
};

export class TreePanel {
  constructor(rootEl, assembly, selection, viewport = null, { onRecompute } = {}) {
    this.rootEl = rootEl;
    this.assembly = assembly;
    this.selection = selection;
    this.viewport = viewport;
    this.onRecompute = onRecompute || (() => {});
    this.docName = 'Part2';
    this.filterText = '';
    this.originExpanded = true;
    this.bodiesExpanded = true;
    this.originVisibility = {
      'YZ Plane': false,
      'XZ Plane': false,
      'XY Plane': false,
      'X Axis': false,
      'Y Axis': false,
      'Z Axis': false,
      'Center Point': false
    };

    this.datumVisuals = {};
    if (this.viewport && this.viewport.scene) {
      this._initDatumVisuals();
    }
  }

  _initDatumVisuals() {
    const makePlaneHelper = (color, rotX, rotY, rotZ) => {
      const group = new THREE.Group();
      const planeGeo = new THREE.PlaneGeometry(160, 160);
      const planeMat = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.15,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(planeGeo, planeMat);
      group.add(mesh);

      const edges = new THREE.EdgesGeometry(planeGeo);
      const edgeMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 });
      group.add(new THREE.LineSegments(edges, edgeMat));

      group.rotation.set(rotX, rotY, rotZ);
      group.visible = false;
      this.viewport.scene.add(group);
      return group;
    };

    const makeAxisHelper = (dir, color) => {
      const group = new THREE.Group();
      const points = [
        dir.clone().multiplyScalar(-180),
        dir.clone().multiplyScalar(180)
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineDashedMaterial({
        color,
        dashSize: 6,
        gapSize: 4,
        linewidth: 1.5
      });
      const line = new THREE.Line(geo, mat);
      line.computeLineDistances();
      group.add(line);
      group.visible = false;
      this.viewport.scene.add(group);
      return group;
    };

    this.datumVisuals['XY Plane'] = makePlaneHelper(0xf59e0b, 0, 0, 0);
    this.datumVisuals['XZ Plane'] = makePlaneHelper(0x3b82f6, -Math.PI / 2, 0, 0);
    this.datumVisuals['YZ Plane'] = makePlaneHelper(0x10b981, 0, Math.PI / 2, 0);

    this.datumVisuals['X Axis'] = makeAxisHelper(new THREE.Vector3(1, 0, 0), 0xef4444);
    this.datumVisuals['Y Axis'] = makeAxisHelper(new THREE.Vector3(0, 1, 0), 0x22c55e);
    this.datumVisuals['Z Axis'] = makeAxisHelper(new THREE.Vector3(0, 0, 1), 0x3b82f6);

    const ptGroup = new THREE.Group();
    const ptGeo = new THREE.SphereGeometry(2.5, 16, 16);
    const ptMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    ptGroup.add(new THREE.Mesh(ptGeo, ptMat));
    ptGroup.visible = false;
    this.viewport.scene.add(ptGroup);
    this.datumVisuals['Center Point'] = ptGroup;
  }

  _toggleOriginVisual(name) {
    this.originVisibility[name] = !this.originVisibility[name];
    if (this.datumVisuals[name]) {
      this.datumVisuals[name].visible = this.originVisibility[name];
    }
  }

  setDocName(name) {
    this.docName = name || 'Part2';
    this.render();
  }

  setFilter(text) {
    this.filterText = (text || '').trim().toLowerCase();
    this.render();
  }

  render() {
    this.rootEl.innerHTML = '';

    // Document Root Node: dynamic docName
    const docNode = document.createElement('div');
    docNode.className = 'tree-doc-node';
    docNode.innerHTML = `
      <div class="tree-node doc-header">
        <span class="icon">📦</span>
        <span class="label doc-title">${escapeText(this.docName)}</span>
      </div>
    `;

    const docChildren = document.createElement('div');
    docChildren.className = 'tree-children';

    // 1. Solid Bodies folder
    let bodies = this.assembly.root.children.filter((c) => c.type === 'part');
    if (this.filterText) {
      bodies = bodies.filter((b) => (b.name || '').toLowerCase().includes(this.filterText));
    }
    const bodiesFolder = document.createElement('div');
    bodiesFolder.className = 'tree-folder';
    bodiesFolder.innerHTML = `
      <div class="tree-node folder-node">
        <span class="expander">${this.bodiesExpanded ? '▼' : '▶'}</span>
        <span class="icon">📂</span>
        <span class="label">Solid Bodies(${bodies.length})</span>
      </div>
    `;
    bodiesFolder.querySelector('.expander').addEventListener('click', (e) => {
      e.stopPropagation();
      this.bodiesExpanded = !this.bodiesExpanded;
      this.render();
    });
    if (this.bodiesExpanded && bodies.length > 0) {
      const bodiesList = document.createElement('div');
      bodiesList.className = 'tree-children';
      bodies.forEach((b, i) => {
        const bodyItem = document.createElement('div');
        bodyItem.className = 'tree-node' + (this.selection.isSelected(b) ? ' selected' : '');
        bodyItem.innerHTML = `
          <span class="icon">🧊</span>
          <span class="label">Solid${i + 1} (${escapeText(b.name)})</span>
          <span class="vis-toggle" title="Toggle visibility">${b.visible ? '👁' : '—'}</span>
        `;
        bodyItem.querySelector('.label').addEventListener('click', (e) => {
          this.selection.select(b, e.shiftKey);
          this.render();
        });
        bodyItem.querySelector('.vis-toggle').addEventListener('click', (e) => {
          e.stopPropagation();
          b.setVisible(!b.visible);
          this.render();
        });
        bodiesList.appendChild(bodyItem);
      });
      bodiesFolder.appendChild(bodiesList);
    }
    docChildren.appendChild(bodiesFolder);

    // 2. View: Master node
    const viewNode = document.createElement('div');
    viewNode.className = 'tree-node folder-node';
    viewNode.innerHTML = `
      <span class="icon" style="margin-left:14px;">👓</span>
      <span class="label">View: Master</span>
    `;
    docChildren.appendChild(viewNode);

    // 3. Origin folder (XY, XZ, YZ planes & axes)
    const originFolder = document.createElement('div');
    originFolder.className = 'tree-folder';
    originFolder.innerHTML = `
      <div class="tree-node folder-node">
        <span class="expander">${this.originExpanded ? '▼' : '▶'}</span>
        <span class="icon">📐</span>
        <span class="label">Origin</span>
      </div>
    `;
    originFolder.querySelector('.expander').addEventListener('click', (e) => {
      e.stopPropagation();
      this.originExpanded = !this.originExpanded;
      this.render();
    });

    if (this.originExpanded) {
      const originChildren = document.createElement('div');
      originChildren.className = 'tree-children';

      const originItems = [
        { name: 'YZ Plane', icon: '◫' },
        { name: 'XZ Plane', icon: '◫' },
        { name: 'XY Plane', icon: '◫' },
        { name: 'X Axis', icon: '→' },
        { name: 'Y Axis', icon: '↑' },
        { name: 'Z Axis', icon: '↗' },
        { name: 'Center Point', icon: '•' }
      ];

      originItems.forEach((item) => {
        const itemRow = document.createElement('div');
        itemRow.className = 'tree-node origin-item';
        const isVis = !!this.originVisibility[item.name];
        itemRow.innerHTML = `
          <span class="icon">${item.icon}</span>
          <span class="label">${item.name}</span>
          <span class="vis-toggle" title="Toggle visibility">${isVis ? '👁' : '—'}</span>
        `;
        itemRow.querySelector('.vis-toggle').addEventListener('click', (e) => {
          e.stopPropagation();
          this._toggleOriginVisual(item.name);
          this.render();
        });
        itemRow.querySelector('.label').addEventListener('click', () => {
          this._toggleOriginVisual(item.name);
          this.render();
        });
        originChildren.appendChild(itemRow);
      });
      originFolder.appendChild(originChildren);
    }
    docChildren.appendChild(originFolder);

    // 4. Feature Tree History Nodes (Extrusion 1, Chamfer 1, etc.)
    for (const child of this.assembly.root.children) {
      if (this.filterText && ![...child.walk()].some(node => (node.name || '').toLowerCase().includes(this.filterText))) continue;
      docChildren.appendChild(this._buildNode(child));
    }

    // 5. End of Part Marker (Inventor specific)
    const endPartRow = document.createElement('div');
    endPartRow.className = 'tree-node end-of-part-node';
    endPartRow.innerHTML = `
      <span class="icon" style="color:#ef4444;">🛑</span>
      <span class="label" style="color:var(--text-2); font-style:italic;">End of Part</span>
    `;
    docChildren.appendChild(endPartRow);

    docNode.appendChild(docChildren);
    this.rootEl.appendChild(docNode);
  }

  _buildNode(part) {
    const wrapper = document.createElement('div');

    const row = document.createElement('div');
    row.className = 'tree-node feature-node' + (this.selection.isSelected(part) ? ' selected' : '');
    
    // Format name to match Inventor style if generic (e.g. Extrusion 1, Chamfer 1)
    const displayName = part.name === 'extrude' ? 'Extrusion 1' : part.name;
    const icon = KIND_ICON[part.kind] || '•';

    row.innerHTML = `
      <span class="icon">${icon}</span>
      <span class="label">${escapeText(displayName)}</span>
      <span class="vis-toggle" title="Toggle visibility">${part.visible ? '👁' : '—'}</span>
    `;

    row.querySelector('.label').addEventListener('click', (e) => {
      this.selection.select(part, e.shiftKey);
      this.render();
    });

    row.querySelector('.vis-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      part.setVisible(!part.visible);
      this.render();
    });

    wrapper.appendChild(row);

    // Parametric Feature Tree History & Rollback Bar
    if (part.kind !== 'step' && part.featureTree && part.featureTree.features && part.featureTree.features.length > 0) {
      this._renderFeatureList(part, wrapper);
    } else if (part.kind === 'extrude') {
      // Nested sketch under extrude if applicable
      const sub = document.createElement('div');
      sub.className = 'tree-children';
      const sketchRow = document.createElement('div');
      sketchRow.className = 'tree-node sketch-child';
      sketchRow.innerHTML = `
        <span class="icon" style="color:#f59e0b;">✎</span>
        <span class="label" style="font-size:11px; opacity:0.85;">Sketch1</span>
      `;
      sub.appendChild(sketchRow);
      wrapper.appendChild(sub);
    }

    if (part.children.length > 0) {
      const childrenEl = document.createElement('div');
      childrenEl.className = 'tree-children';
      for (const child of part.children) {
        childrenEl.appendChild(this._buildNode(child));
      }
      wrapper.appendChild(childrenEl);
    }

    return wrapper;
  }

  _renderFeatureList(part, wrapper) {
    const ft = part.featureTree;
    if (!ft || ft.features.length === 0) return;

    const listEl = document.createElement('div');
    listEl.className = 'tree-children feature-list';

    // If rolled back to top (before index 0)
    if (ft.rollbackIndex === -1) {
      listEl.appendChild(this._createRollbackBar(part, -1));
    }

    ft.features.forEach((feat, idx) => {
      const isRolledBack = ft.isRolledBack(feat.id);
      const isSuppressed = feat.suppressed;

      const featRow = document.createElement('div');
      featRow.className = 'tree-node feature-history-item' +
        (isRolledBack ? ' rolled-back' : '') +
        (isSuppressed ? ' suppressed' : '');

      const icon = KIND_ICON[feat.type] || '•';

      featRow.innerHTML = `
        <span class="icon" style="margin-left:6px;">${icon}</span>
        <span class="label" title="${feat.name} (${feat.type})">${feat.name}</span>
        <div class="feat-actions">
          <button class="feat-action-btn ${isSuppressed ? 'active' : ''}" data-act="suppress" title="${isSuppressed ? 'Unsuppress feature' : 'Suppress feature'}">
            ${isSuppressed ? '⊚' : '⊘'}
          </button>
          <button class="feat-action-btn" data-act="roll" title="Roll history to this feature">
            ⏬
          </button>
          ${idx > 0 ? `<button class="feat-action-btn del" data-act="delete" title="Delete feature">✕</button>` : ''}
        </div>
      `;

      featRow.querySelector('[data-act="suppress"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        ft.toggleSuppression(feat.id);
        await this.onRecompute(part);
        this.render();
      });

      featRow.querySelector('[data-act="roll"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        ft.rollToFeature(feat.id);
        await this.onRecompute(part);
        this.render();
      });

      featRow.querySelector('[data-act="delete"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (window.confirm(`Delete feature "${feat.name}"?`)) {
          ft.removeFeature(feat.id);
          await this.onRecompute(part);
          this.render();
        }
      });

      listEl.appendChild(featRow);

      // Place Rollback Bar immediately below the active rollback index
      if (idx === ft.rollbackIndex) {
        listEl.appendChild(this._createRollbackBar(part, idx));
      }
    });

    wrapper.appendChild(listEl);
  }

  _createRollbackBar(part, currentIdx) {
    const bar = document.createElement('div');
    bar.className = 'rollback-bar-container';
    bar.title = 'Rollback Bar (End of Evaluated Features) — Click to roll to end';
    bar.innerHTML = `
      <div class="rollback-bar-line"></div>
      <div class="rollback-bar-pill">
        <span class="pill-icon">⏸</span>
        <span class="pill-text">ROLLBACK BAR</span>
      </div>
    `;

    bar.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (part.featureTree.rollbackIndex < part.featureTree.features.length - 1) {
        part.featureTree.rollToEnd();
        await this.onRecompute(part);
        this.render();
      }
    });

    return bar;
  }
}

