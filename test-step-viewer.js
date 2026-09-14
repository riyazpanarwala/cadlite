import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Worker } from 'node:worker_threads';
import * as THREE from 'three';
import { buildImportedTree, isVisibleHit } from './src/ui/step-viewer.js';
import { Assembly } from './src/assembly/Assembly.js';
import { serializeProject, deserializeProject } from './src/project/save-load.js';
import occ from './main/occ-service.js';

const source = fs.readFileSync('samples/sample_box.step', 'utf8');
const result = await new Promise((resolve, reject) => {
  const worker = new Worker(new URL('./main/step-worker.js', import.meta.url), { workerData: { stepContent: source, fileName: 'box.step' } });
  worker.on('error', reject);
  worker.on('message', message => {
    if (message.progress) return;
    worker.terminate();
    if (message.error) reject(new Error(message.error)); else resolve(message.result);
  });
});
assert.equal(result.bodyCount, 1);
const assembly = new Assembly(new THREE.Scene());
assembly.addPart(buildImportedTree(result.tree));
const leaf = assembly.allParts().find(p => p.mesh);
const bounds = new THREE.Box3().setFromObject(leaf.mesh).getSize(new THREE.Vector3());
assert.deepEqual(bounds.toArray().sort((a,b) => a-b), [30,40,50]);
deserializeProject(assembly, serializeProject(assembly));
assert.equal(assembly.allParts().filter(p => p.mesh).length, 1);
assert.throws(() => deserializeProject(assembly, '{"formatVersion":999}'));
assert.equal(assembly.allParts().filter(p => p.mesh).length, 1);
const restored = assembly.allParts().find(p => p.mesh);
assert.equal(isVisibleHit({object:restored.mesh,point:new THREE.Vector3()}), true);
restored.parent.setVisible(false);
assert.equal(isVisibleHit({object:restored.mesh,point:new THREE.Vector3()}), false);
restored.parent.setVisible(true);
assert.equal(isVisibleHit({object:restored.mesh,point:new THREE.Vector3(-1,0,0)},new THREE.Plane(new THREE.Vector3(1,0,0),0)),false);
const two = await occ.exportToStep({ parts: [
  {kind:'box',params:{width:10,height:20,depth:30}},
  {kind:'box',params:{width:10,height:20,depth:30},matrix:new THREE.Matrix4().makeTranslation(100,0,0).toArray()}
] });
const multi = await occ.importFromStep({stepContent:two.stepContent,withAssembly:true});
assert.equal(multi.bodyCount, 2);
console.log('STEP viewer checks passed: worker import, dimensions, save/reopen, safe failed load, hidden/clipped picking, multiple components.');
