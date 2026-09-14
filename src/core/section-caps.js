import * as THREE from 'three';

// Intersect the display mesh with a plane, assemble closed contours, then
// triangulate with even/odd nesting. These are display-only caps, not CAD faces.
export function buildSectionCap(geometry, localPlane) {
  const position = geometry.getAttribute('position');
  if (!position) return new THREE.BufferGeometry();
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const tolerance = Math.max(geometry.boundingBox.getSize(new THREE.Vector3()).length() * 1e-7, 1e-8);
  const points = [], adjacency = [], buckets = new Map(), segments = new Set();
  const identify = point => {
    const cell = point.toArray().map(v => Math.floor(v / tolerance));
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      const key = `${cell[0]+x},${cell[1]+y},${cell[2]+z}`;
      for (const id of buckets.get(key) || []) if (points[id].distanceToSquared(point) <= tolerance * tolerance) return id;
    }
    const id = points.length, key = cell.join(',');
    points.push(point.clone()); adjacency.push(new Set());
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(id);
    return id;
  };
  const count = geometry.index ? geometry.index.count : position.count;
  const vertices = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i + 2 < count; i += 3) {
    vertices.forEach((v, j) => v.fromBufferAttribute(position, geometry.index ? geometry.index.getX(i+j) : i+j));
    const distances = vertices.map(v => localPlane.distanceToPoint(v));
    if (distances.every(d => Math.abs(d) <= tolerance)) continue; // existing coplanar face
    if (distances.every(d => d > tolerance) || distances.every(d => d < -tolerance)) continue;
    const intersections = [];
    for (let j = 0; j < 3; j++) {
      const k = (j+1)%3, a = distances[j], b = distances[k];
      if (Math.abs(a) <= tolerance) intersections.push(localPlane.projectPoint(vertices[j], new THREE.Vector3()));
      if ((a > tolerance && b < -tolerance) || (a < -tolerance && b > tolerance)) {
        intersections.push(vertices[j].clone().lerp(vertices[k], a/(a-b)));
      }
    }
    const ids = [...new Set(intersections.map(identify))];
    if (ids.length !== 2) continue;
    const [a,b] = ids, key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (segments.has(key)) continue;
    segments.add(key); adjacency[a].add(b); adjacency[b].add(a);
  }
  const normal = localPlane.normal.clone().normalize();
  const helper = Math.abs(normal.z) < 0.9 ? new THREE.Vector3(0,0,1) : new THREE.Vector3(0,1,0);
  const u = helper.cross(normal).normalize(), v = normal.clone().cross(u);
  const origin = localPlane.coplanarPoint(new THREE.Vector3());
  const project = p => { const d = p.clone().sub(origin); return new THREE.Vector2(d.dot(u),d.dot(v)); };
  const visited = new Set(), rings = [];
  for (let start = 0; start < points.length; start++) {
    if (visited.has(start) || adjacency[start].size !== 2) continue;
    const loop = [];
    let previous = -1, current = start;
    do {
      if (visited.has(current) || adjacency[current].size !== 2) break;
      visited.add(current); loop.push(current);
      const next = [...adjacency[current]].find(id => id !== previous);
      previous = current; current = next;
    } while (current !== start);
    if (current === start && loop.length >= 3) {
      const polygon = loop.map(id => project(points[id]));
      if (Math.abs(THREE.ShapeUtils.area(polygon)) > tolerance*tolerance) rings.push(polygon);
    }
  }
  const inside = (p, ring) => {
    let result = false;
    for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
      const a=ring[i],b=ring[j];
      if ((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) result=!result;
    }
    return result;
  };
  const depths = rings.map((ring,i) => rings.reduce((n,outer,j) => n+(i!==j && inside(ring[0],outer)?1:0),0));
  const positions = [];
  rings.forEach((outer,i) => {
    if (depths[i]%2) return;
    const holes = rings.filter((ring,j) => depths[j]===depths[i]+1 && inside(ring[0],outer));
    const flat = [outer,...holes].flat();
    for (const triangle of THREE.ShapeUtils.triangulateShape(outer,holes)) {
      const corners = triangle.map(index => origin.clone().addScaledVector(u,flat[index].x).addScaledVector(v,flat[index].y));
      if (corners[1].clone().sub(corners[0]).cross(corners[2].clone().sub(corners[0])).dot(normal)>0) [corners[1],corners[2]]=[corners[2],corners[1]];
      for (const corner of corners) positions.push(...corner.toArray());
    }
  });
  const cap = new THREE.BufferGeometry();
  cap.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  cap.computeVertexNormals();
  return cap;
}

export class SectionCaps {
  constructor(viewport, assembly) {
    this.viewport=viewport; this.assembly=assembly; this.entries=new Map(); this.enabled=true;
    this.group=new THREE.Group(); this.group.name='Section caps'; viewport.scene.add(this.group);
    viewport.onRender(() => this.update());
  }
  update() {
    const plane=this.viewport.sectionPlane;
    const parts=plane && this.enabled ? this.assembly.allParts().filter(p=>p.mesh) : [];
    const active=new Set(parts);
    for (const [part,entry] of this.entries) if (!active.has(part)) {
      entry.mesh.geometry.dispose(); entry.mesh.material.dispose(); this.group.remove(entry.mesh); this.entries.delete(part);
    }
    for (const part of parts) {
      part.mesh.updateWorldMatrix(true,false);
      const world=part.mesh.matrixWorld;
      const signature=[...world.elements,...plane.normal.toArray(),plane.constant].join(',');
      let entry=this.entries.get(part);
      if (!entry) {
        const mesh=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:0xf0b75b,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
        mesh.matrixAutoUpdate=false; mesh.raycast=()=>{}; mesh.userData.isSectionCap=true;
        entry={mesh}; this.entries.set(part,entry); this.group.add(mesh);
      }
      entry.mesh.visible=true;
      for(let object=part.mesh;object;object=object.parent) if(!object.visible) entry.mesh.visible=false;
      if (!entry.mesh.visible) continue;
      if(entry.signature!==signature || entry.source!==part.mesh.geometry) {
        const localPlane=plane.clone().applyMatrix4(world.clone().invert());
        entry.mesh.geometry.dispose(); entry.mesh.geometry=buildSectionCap(part.mesh.geometry,localPlane);
        entry.mesh.matrix.copy(world); entry.mesh.matrixWorldNeedsUpdate=true;
        entry.signature=signature; entry.source=part.mesh.geometry;
      }
      entry.mesh.material.transparent=part.mesh.material.transparent;
      entry.mesh.material.opacity=part.mesh.material.opacity;
      entry.mesh.material.depthWrite=part.mesh.material.depthWrite;
    }
  }
}
