import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildSectionCap, SectionCaps } from './src/core/section-caps.js';
import { Assembly } from './src/assembly/Assembly.js';
import { Part } from './src/assembly/Part.js';

function area(geometry) {
  const p=geometry.getAttribute('position'); let total=0;
  for(let i=0;i<p.count;i+=3) {
    const a=new THREE.Vector3().fromBufferAttribute(p,i);
    const b=new THREE.Vector3().fromBufferAttribute(p,i+1);
    const c=new THREE.Vector3().fromBufferAttribute(p,i+2);
    total+=b.sub(a).cross(c.sub(a)).length()/2;
  }
  return total;
}
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-4, `${actual} differs from ${expected}`);
const box=new THREE.BoxGeometry(10,20,30);
close(area(buildSectionCap(box,new THREE.Plane(new THREE.Vector3(1,0,0),0))),600);
close(area(buildSectionCap(box,new THREE.Plane(new THREE.Vector3(0,0,1),0))),200);
close(area(buildSectionCap(box,new THREE.Plane(new THREE.Vector3(1,0,0),-100))),0);
const shape=new THREE.Shape();shape.moveTo(-5,-5);shape.lineTo(5,-5);shape.lineTo(5,5);shape.lineTo(-5,5);shape.closePath();
const hole=new THREE.Path();hole.moveTo(-2,-2);hole.lineTo(-2,2);hole.lineTo(2,2);hole.lineTo(2,-2);hole.closePath();shape.holes.push(hole);
const tube=new THREE.ExtrudeGeometry(shape,{depth:10,bevelEnabled:false});
for(const sign of [1,-1]) {
  const plane=new THREE.Plane(new THREE.Vector3(0,0,sign),-5*sign);
  const cap=buildSectionCap(tube,plane);close(area(cap),84);
  const p=cap.getAttribute('position'),n=cap.getAttribute('normal');
  for(let i=0;i<p.count;i++) {close(p.getZ(i),5); assert.ok(n.getZ(i)*sign < -0.99);}
  const mesh=new THREE.Mesh(cap,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  mesh.updateMatrixWorld();
  assert.equal(new THREE.Raycaster(new THREE.Vector3(0,0,20),new THREE.Vector3(0,0,-1)).intersectObject(mesh).length,0,'Hole must stay open');
  assert.ok(new THREE.Raycaster(new THREE.Vector3(4,0,20),new THREE.Vector3(0,0,-1)).intersectObject(mesh).length>0,'Solid wall must be filled');
}
// A plane through a vertex/diagonal should also close without duplicate segments.
const diagonal=new THREE.Plane(new THREE.Vector3(1,1,0).normalize(),0);
close(area(buildSectionCap(new THREE.BoxGeometry(10,10,10),diagonal)),100*Math.sqrt(2));
// Scene integration: nested placement, hide/show, source removal, and teardown.
const viewport={scene:new THREE.Scene(),onRender(callback){this.tick=callback;},sectionPlane:new THREE.Plane(new THREE.Vector3(0,0,1),-105)};
const assembly=new Assembly(viewport.scene);
const group=new Part({name:'Group',type:'assembly'});group.object3D.position.z=100;assembly.addPart(group);
const part=new Part({name:'Tube',mesh:new THREE.Mesh(tube,new THREE.MeshStandardMaterial())});group.addChild(part);
const caps=new SectionCaps(viewport,assembly);viewport.tick();
assert.equal(caps.entries.size,1);close(area(caps.entries.get(part).mesh.geometry),84);
assert.equal(caps.entries.get(part).mesh.matrix.elements[14],100);
assert.equal(assembly.allParts().length,2,'Caps are not part of saved/exported assembly');
group.setVisible(false);viewport.tick();assert.equal(caps.entries.get(part).mesh.visible,false);
group.setVisible(true);viewport.tick();assert.equal(caps.entries.get(part).mesh.visible,true);
viewport.sectionPlane=null;viewport.tick();assert.equal(caps.entries.size,0);assert.equal(caps.group.children.length,0);
console.log('Section caps passed: box, hollow section, flipped normals, diagonal cut, placements, visibility, and cleanup.');
