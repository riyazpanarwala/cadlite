import * as THREE from 'three';

/**
 * 2D Drafting and Engineering Drawing Sheet Generator.
 * Creates standard multiview orthographic projections (Front, Top, Right, Isometric)
 * with engineering title block, border, and dimension callouts.
 * Outputs to DXF (for CNC/AutoCAD) and SVG (for blueprint printing).
 */
export class DrawingSheetGenerator {
  constructor(modelSource, options = {}) {
    this.modelSource = modelSource;
    this.docName = options.docName || (options.title ? options.title.replace(/\s+Production\s+Drawing/i, '') : 'Part2');
    this.partNumber = options.partNumber || `${this.docName.toUpperCase()}-001`;
    this.author = options.author || 'CADLite Engineer';
    this.sheetWidth = 840;
    this.sheetHeight = 594;
    this.margin = 20;

    this.segments3D = [];
    this.bounds3D = null;
    this._extractModelGeometry();
  }

  get scaleLabel() {
    return this.generateViews().scaleText;
  }

  _extractModelGeometry() {
    const rawSegments = [];
    const box = new THREE.Box3();

    const traverseMesh = (obj) => {
      if (!obj) return;
      if (obj.isMesh && obj.geometry) {
        obj.updateMatrixWorld(true);
        box.expandByObject(obj);

        const edgesGeo = new THREE.EdgesGeometry(obj.geometry, 22);
        const pos = edgesGeo.attributes.position.array;
        const mw = obj.matrixWorld;

        for (let i = 0; i < pos.length; i += 6) {
          const p1 = new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(mw);
          const p2 = new THREE.Vector3(pos[i + 3], pos[i + 4], pos[i + 5]).applyMatrix4(mw);
          rawSegments.push({ p1, p2 });
        }
      }
    };

    if (Array.isArray(this.modelSource)) {
      for (const item of this.modelSource) {
        if (item && item.traverse) item.traverse(traverseMesh);
        else traverseMesh(item);
      }
    } else if (this.modelSource?.root?.object3D) {
      this.modelSource.root.object3D.traverse(traverseMesh);
    } else if (this.modelSource?.traverse) {
      this.modelSource.traverse(traverseMesh);
    } else if (this.modelSource?.isMesh) {
      traverseMesh(this.modelSource);
    }

    this.segments3D = rawSegments;
    if (box.isEmpty()) {
      box.set(new THREE.Vector3(-25, -25, -25), new THREE.Vector3(25, 25, 25));
    }
    this.bounds3D = box;
  }

  generateViews() {
    const min = this.bounds3D.min;
    const max = this.bounds3D.max;
    const size = new THREE.Vector3();
    this.bounds3D.getSize(size);
    const center = new THREE.Vector3();
    this.bounds3D.getCenter(center);

    // Max model span for scaling
    const maxSpan = Math.max(size.x, size.y, size.z, 10);
    const targetSpan = 130;
    const scale = targetSpan / maxSpan;

    // View Centers in Sheet coordinates (840 x 594)
    const topCenter = { x: 240, y: 145 };
    const frontCenter = { x: 240, y: 360 };
    const rightCenter = { x: 500, y: 360 };
    const isoCenter = { x: 610, y: 160 };

    // 1. FRONT VIEW: (X, Y)
    const frontLines = this.segments3D.map((s) => ({
      x1: frontCenter.x + (s.p1.x - center.x) * scale,
      y1: frontCenter.y - (s.p1.y - center.y) * scale,
      x2: frontCenter.x + (s.p2.x - center.x) * scale,
      y2: frontCenter.y - (s.p2.y - center.y) * scale
    }));

    // 2. TOP VIEW: (X, -Z)
    const topLines = this.segments3D.map((s) => ({
      x1: topCenter.x + (s.p1.x - center.x) * scale,
      y1: topCenter.y + (s.p1.z - center.z) * scale,
      x2: topCenter.x + (s.p2.x - center.x) * scale,
      y2: topCenter.y + (s.p2.z - center.z) * scale
    }));

    // 3. RIGHT SIDE VIEW: (Z, Y)
    const rightLines = this.segments3D.map((s) => ({
      x1: rightCenter.x + (s.p1.z - center.z) * scale,
      y1: rightCenter.y - (s.p1.y - center.y) * scale,
      x2: rightCenter.x + (s.p2.z - center.z) * scale,
      y2: rightCenter.y - (s.p2.y - center.y) * scale
    }));

    // 4. ISOMETRIC VIEW: 30-deg axonometric
    const cos30 = Math.cos(Math.PI / 6);
    const sin30 = Math.sin(Math.PI / 6);
    const isoX = (p) => (p.x - p.z) * cos30;
    const isoY = (p) => p.y + (p.x + p.z) * sin30;
    const isoCenterRawX = (center.x - center.z) * cos30;
    const isoCenterRawY = center.y + (center.x + center.z) * sin30;

    const isoLines = this.segments3D.map((s) => ({
      x1: isoCenter.x + (isoX(s.p1) - isoCenterRawX) * scale * 0.75,
      y1: isoCenter.y - (isoY(s.p1) - isoCenterRawY) * scale * 0.75,
      x2: isoCenter.x + (isoX(s.p2) - isoCenterRawX) * scale * 0.75,
      y2: isoCenter.y - (isoY(s.p2) - isoCenterRawY) * scale * 0.75
    }));

    // Model Dimensions
    const halfW = (size.x * scale) / 2;
    const halfH = (size.y * scale) / 2;
    const halfD = (size.z * scale) / 2;

    const dimensions = [
      // Width Dimension (Front View bottom)
      {
        text: `${size.x.toFixed(1)} mm`,
        x1: frontCenter.x - halfW,
        y1: frontCenter.y + halfH + 20,
        x2: frontCenter.x + halfW,
        y2: frontCenter.y + halfH + 20,
        wit1: { x1: frontCenter.x - halfW, y1: frontCenter.y + halfH + 5, x2: frontCenter.x - halfW, y2: frontCenter.y + halfH + 25 },
        wit2: { x1: frontCenter.x + halfW, y1: frontCenter.y + halfH + 5, x2: frontCenter.x + halfW, y2: frontCenter.y + halfH + 25 }
      },
      // Height Dimension (Front View left)
      {
        text: `${size.y.toFixed(1)} mm`,
        x1: frontCenter.x - halfW - 20,
        y1: frontCenter.y - halfH,
        x2: frontCenter.x - halfW - 20,
        y2: frontCenter.y + halfH,
        wit1: { x1: frontCenter.x - halfW - 25, y1: frontCenter.y - halfH, x2: frontCenter.x - halfW - 5, y2: frontCenter.y - halfH },
        wit2: { x1: frontCenter.x - halfW - 25, y1: frontCenter.y + halfH, x2: frontCenter.x - halfW - 5, y2: frontCenter.y + halfH }
      },
      // Depth Dimension (Top View right)
      {
        text: `${size.z.toFixed(1)} mm`,
        x1: topCenter.x + halfW + 20,
        y1: topCenter.y - halfD,
        x2: topCenter.x + halfW + 20,
        y2: topCenter.y + halfD,
        wit1: { x1: topCenter.x + halfW + 5, y1: topCenter.y - halfD, x2: topCenter.x + halfW + 25, y2: topCenter.y - halfD },
        wit2: { x1: topCenter.x + halfW + 5, y1: topCenter.y + halfD, x2: topCenter.x + halfW + 25, y2: topCenter.y + halfD }
      }
    ];

    let scaleText = '1:1';
    if (Math.abs(scale - 1) < 0.05) {
      scaleText = '1:1';
    } else if (scale > 1) {
      scaleText = `${scale.toFixed(1)} : 1`;
    } else {
      scaleText = `1 : ${(1 / scale).toFixed(1)}`;
    }

    return {
      scale,
      scaleText,
      size,
      frontLines,
      topLines,
      rightLines,
      isoLines,
      dimensions,
      labels: [
        { text: 'TOP VIEW', x: topCenter.x, y: topCenter.y - halfD - 16 },
        { text: 'FRONT VIEW', x: frontCenter.x, y: frontCenter.y - halfH - 16 },
        { text: 'RIGHT SIDE VIEW', x: rightCenter.x, y: rightCenter.y - halfH - 16 },
        { text: 'ISOMETRIC (3D)', x: isoCenter.x, y: isoCenter.y - targetSpan * 0.45 - 16 }
      ]
    };
  }

  toDxf() {
    const views = this.generateViews();
    const w = this.sheetWidth;
    const h = this.sheetHeight;
    const m = this.margin;

    let dxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n`;
    const layerNames = ['BORDER', 'TITLE_BLOCK', 'FRONT_VIEW', 'TOP_VIEW', 'RIGHT_VIEW', 'ISO_VIEW', 'DIMENSIONS', 'TEXT'];
    for (const l of layerNames) {
      dxf += `0\nLAYER\n2\n${l}\n70\n0\n62\n7\n6\nCONTINUOUS\n`;
    }
    dxf += `0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;

    const addLine = (layer, x1, y1, x2, y2) => {
      const dy1 = h - y1;
      const dy2 = h - y2;
      dxf += `0\nLINE\n8\n${layer}\n10\n${x1.toFixed(3)}\n20\n${dy1.toFixed(3)}\n30\n0.0\n11\n${x2.toFixed(3)}\n21\n${dy2.toFixed(3)}\n31\n0.0\n`;
    };

    const addText = (layer, text, x, y, height = 4) => {
      const dy = h - y;
      dxf += `0\nTEXT\n8\n${layer}\n10\n${x.toFixed(3)}\n20\n${dy.toFixed(3)}\n30\n0.0\n40\n${height}\n1\n${text}\n`;
    };

    // Border
    addLine('BORDER', m, m, w - m, m);
    addLine('BORDER', w - m, m, w - m, h - m);
    addLine('BORDER', w - m, h - m, m, h - m);
    addLine('BORDER', m, h - m, m, m);

    // Title Block (Bottom-right: 540 to 820 x, 480 to 574 y)
    const tbX = 540;
    const tbY = 480;
    addLine('TITLE_BLOCK', tbX, tbY, w - m, tbY);
    addLine('TITLE_BLOCK', tbX, tbY, tbX, h - m);
    addLine('TITLE_BLOCK', tbX, tbY + 36, w - m, tbY + 36);
    addLine('TITLE_BLOCK', tbX + 170, tbY, tbX + 170, h - m);

    addText('TITLE_BLOCK', `CADLITE ENGINEERING DRAWING`, tbX + 10, tbY + 16, 5);
    addText('TITLE_BLOCK', `PART: ${this.docName}.idw`, tbX + 10, tbY + 30, 4);
    addText('TITLE_BLOCK', `SCALE: ${views.scaleText}`, tbX + 178, tbY + 16, 4);
    addText('TITLE_BLOCK', `DATE: ${new Date().toISOString().split('T')[0]}`, tbX + 178, tbY + 30, 3.5);
    addText('TITLE_BLOCK', `UNITS: mm | 3RD ANGLE PROJECTION`, tbX + 10, tbY + 52, 3.5);

    // Views lines
    for (const l of views.frontLines) addLine('FRONT_VIEW', l.x1, l.y1, l.x2, l.y2);
    for (const l of views.topLines) addLine('TOP_VIEW', l.x1, l.y1, l.x2, l.y2);
    for (const l of views.rightLines) addLine('RIGHT_VIEW', l.x1, l.y1, l.x2, l.y2);
    for (const l of views.isoLines) addLine('ISO_VIEW', l.x1, l.y1, l.x2, l.y2);

    // View labels
    for (const lab of views.labels) {
      addText('TEXT', lab.text, lab.x - 20, lab.y, 4);
    }

    // Dimensions
    for (const d of views.dimensions) {
      addLine('DIMENSIONS', d.x1, d.y1, d.x2, d.y2);
      addLine('DIMENSIONS', d.wit1.x1, d.wit1.y1, d.wit1.x2, d.wit1.y2);
      addLine('DIMENSIONS', d.wit2.x1, d.wit2.y1, d.wit2.x2, d.wit2.y2);
      addText('DIMENSIONS', d.text, (d.x1 + d.x2) / 2 - 12, (d.y1 + d.y2) / 2 - 3, 3.8);
    }

    dxf += `0\nENDSEC\n0\nEOF\n`;
    return dxf;
  }

  toSvg() {
    const views = this.generateViews();
    const w = this.sheetWidth;
    const h = this.sheetHeight;
    const m = this.margin;

    const renderLines = (lines, color, strokeWidth = 1.4, dash = '') => {
      return lines.map((l) => `<line x1="${l.x1.toFixed(2)}" y1="${l.y1.toFixed(2)}" x2="${l.x2.toFixed(2)}" y2="${l.y2.toFixed(2)}" stroke="${color}" stroke-width="${strokeWidth}" ${dash ? `stroke-dasharray="${dash}"` : ''} stroke-linecap="round"/>`).join('\n');
    };

    const renderDimensions = (dims) => {
      return dims.map((d) => {
        const midX = (d.x1 + d.x2) / 2;
        const midY = (d.y1 + d.y2) / 2;
        return `
          <g class="dim-group">
            <line x1="${d.x1}" y1="${d.y1}" x2="${d.x2}" y2="${d.y2}" stroke="#0284c7" stroke-width="1.2"/>
            <line x1="${d.wit1.x1}" y1="${d.wit1.y1}" x2="${d.wit1.x2}" y2="${d.wit1.y2}" stroke="#0284c7" stroke-width="0.8" opacity="0.7"/>
            <line x1="${d.wit2.x1}" y1="${d.wit2.y1}" x2="${d.wit2.x2}" y2="${d.wit2.y2}" stroke="#0284c7" stroke-width="0.8" opacity="0.7"/>
            <circle cx="${d.x1}" cy="${d.y1}" r="2" fill="#0284c7"/>
            <circle cx="${d.x2}" cy="${d.y2}" r="2" fill="#0284c7"/>
            <rect x="${midX - 24}" y="${midY - 8}" width="48" height="16" fill="#ffffff" rx="2" stroke="#0284c7" stroke-width="0.6"/>
            <text x="${midX}" y="${midY + 3.5}" fill="#0369a1" font-size="9" font-family="monospace" font-weight="bold" text-anchor="middle">${d.text}</text>
          </g>
        `;
      }).join('\n');
    };

    const today = new Date().toISOString().split('T')[0];

    return `<svg class="drawing-sheet-svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff; font-family:'Segoe UI', sans-serif;">
  <defs>
    <pattern id="drawing-grid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" stroke-width="0.5"/>
    </pattern>
  </defs>

  <!-- Sheet Background Grid -->
  <rect x="0" y="0" width="${w}" height="${h}" fill="url(#drawing-grid)"/>

  <!-- Outer Drawing Sheet Border -->
  <rect x="${m}" y="${m}" width="${w - m * 2}" height="${h - m * 2}" fill="none" stroke="#0f172a" stroke-width="2"/>
  <rect x="${m + 4}" y="${m + 4}" width="${w - m * 2 - 8}" height="${h - m * 2 - 8}" fill="none" stroke="#64748b" stroke-width="0.8"/>

  <!-- View Quadrant Centermarks / Divider Cross -->
  <line x1="410" y1="${m}" x2="410" y2="480" stroke="#cbd5e1" stroke-width="0.8" stroke-dasharray="6,4"/>
  <line x1="${m}" y1="270" x2="${w - m}" y2="270" stroke="#cbd5e1" stroke-width="0.8" stroke-dasharray="6,4"/>

  <!-- View 1: Top View -->
  <g id="top-view">
    ${renderLines(views.topLines, '#0f172a', 1.4)}
  </g>

  <!-- View 2: Front View -->
  <g id="front-view">
    ${renderLines(views.frontLines, '#0f172a', 1.6)}
  </g>

  <!-- View 3: Right Side View -->
  <g id="right-view">
    ${renderLines(views.rightLines, '#0f172a', 1.4)}
  </g>

  <!-- View 4: Isometric View (Axonometric 3D) -->
  <g id="iso-view">
    ${renderLines(views.isoLines, '#0369a1', 1.3)}
  </g>

  <!-- Dimensions -->
  ${renderDimensions(views.dimensions)}

  <!-- View Title Labels -->
  ${views.labels.map((l) => `<text x="${l.x}" y="${l.y}" fill="#334155" font-size="11" font-weight="700" letter-spacing="0.5" text-anchor="middle">${l.text}</text>`).join('\n')}

  <!-- Inventor Title Block (Lower-Right) -->
  <g id="title-block" transform="translate(540, 480)">
    <rect x="0" y="0" width="280" height="94" fill="#ffffff" stroke="#0f172a" stroke-width="1.6"/>
    <line x1="0" y1="36" x2="280" y2="36" stroke="#0f172a" stroke-width="1"/>
    <line x1="0" y1="65" x2="280" y2="65" stroke="#0f172a" stroke-width="0.8"/>
    <line x1="170" y1="0" x2="170" y2="94" stroke="#0f172a" stroke-width="0.8"/>

    <text x="12" y="22" fill="#0f172a" font-size="13" font-weight="800">CADLITE ENGINEERING</text>
    <text x="12" y="52" fill="#334155" font-size="9.5" font-weight="600">DWG: <tspan fill="#0f172a" font-weight="700">${this.docName}.idw</tspan></text>
    <text x="12" y="80" fill="#64748b" font-size="8.5">THIRD ANGLE PROJECTION | UNITS: MM</text>

    <text x="178" y="20" fill="#64748b" font-size="8">SCALE</text>
    <text x="178" y="32" fill="#0f172a" font-size="10" font-weight="700">${views.scaleText}</text>

    <text x="178" y="48" fill="#64748b" font-size="8">DATE</text>
    <text x="178" y="59" fill="#0f172a" font-size="9">${today}</text>

    <text x="178" y="76" fill="#64748b" font-size="8">AUTHOR</text>
    <text x="178" y="87" fill="#0f172a" font-size="9">${this.author}</text>
  </g>
</svg>`;
  }
}
