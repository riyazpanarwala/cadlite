// Hidden Electron smoke test of section cuts and exploded assembly inspection.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const assert = require('node:assert/strict');

app.whenReady().then(async () => {
  let window;
  const timeout = setTimeout(() => { console.error('Viewer UI test timed out'); app.exit(1); }, 45000);
  try {
    const THREE = await import('three');
    const outline = new THREE.Shape();
    outline.moveTo(-30,-30); outline.lineTo(30,-30); outline.lineTo(30,30); outline.lineTo(-30,30); outline.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-12,-12); hole.lineTo(-12,12); hole.lineTo(12,12); hole.lineTo(12,-12); hole.closePath();
    outline.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(outline,{depth:40,bevelEnabled:false});
    const meshData = { positions:Array.from(geometry.attributes.position.array), index:Array.from({length:geometry.attributes.position.count},(_,i)=>i), edges:[],faces:[],faceRanges:[] };
    const fixturePart = {type:'part',name:'Hollow part',color:'#a8b8ca',meshData,stepContent:'UI fixture'};
    ipcMain.handle('step:import', () => ({ok:true,fileName:'Section test.step',bodyCount:2,tree:{type:'assembly',name:'Section test',children:[fixturePart,
      {type:'assembly',name:'Nested part',matrix:new THREE.Matrix4().makeTranslation(100,0,0).toArray(),children:[{...fixturePart,name:'Second hollow part'}]}]}}));
    let savedProject;
    ipcMain.handle('project:save', (_event,json) => { savedProject=JSON.parse(json);return {ok:true,filePath:'viewer-test.cadlite.json'}; });
    ipcMain.handle('project:load', () => ({ok:true,filePath:'viewer-test.cadlite.json',contents:JSON.stringify(savedProject)}));
    window = new BrowserWindow({show:false,width:1400,height:950,webPreferences:{preload:path.join(__dirname,'..','preload.js'),contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
    const errors=[];
    window.webContents.on('console-message',(_event,level,message)=>{if(level===3){errors.push(message);console.error(message);}});
    await window.loadFile(path.join(__dirname,'..','src','index.html'));
    await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
      const start=Date.now();
      const check=()=>{
        if(document.querySelector('#step-viewer-toolbar')) return resolve();
        if(Date.now()-start>10000) return reject(new Error('Viewer toolbar did not initialize'));
        setTimeout(check,50);
      };check();
    })`);
    await window.webContents.executeJavaScript(`document.querySelector('[data-action="open"]').click();`);
    await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
      const start=Date.now();
      const check=()=>{
        if(document.getElementById('status-left').textContent.startsWith('Imported')) return resolve();
        if(Date.now()-start>10000) return reject(new Error('Fixture import did not complete'));
        setTimeout(check,50);
      };check();
    })`);
    await window.webContents.executeJavaScript(`
      const section=document.querySelector('[aria-label="Section plane"]'); section.value='z';section.dispatchEvent(new Event('change'));
      document.querySelector('[data-action="flip"]').click();
    `);
    const frames = () => window.webContents.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))`);
    const amberPixels = async () => {
      await frames();
      const bitmap=(await window.webContents.capturePage()).getBitmap();
      let count=0;
      for(let i=0;i<bitmap.length;i+=4) if(bitmap[i+2]>220 && bitmap[i+1]>145 && bitmap[i+1]<205 && bitmap[i]<130) count++;
      return count;
    };
    const filled=await amberPixels();
    await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Fill section cuts"]').click();`);
    const open=await amberPixels();
    assert.ok(filled>open+100,`Cap toggle should change the rendered cut: filled=${filled}, open=${open}`);
    await window.webContents.executeJavaScript(`
      document.querySelector('[aria-label="Section plane"]').value='off';
      document.querySelector('[aria-label="Section plane"]').dispatchEvent(new Event('change'));
    `);
    await frames();
    const beforeExplode=(await window.webContents.capturePage()).getBitmap();
    await window.webContents.executeJavaScript(`
      { const explode=document.querySelector('[aria-label="Explode amount"]');explode.value='50';explode.dispatchEvent(new Event('input')); }
    `);
    await frames();
    const afterExplode=(await window.webContents.capturePage()).getBitmap();
    let changed=0;
    for(let i=0;i<beforeExplode.length;i+=4) if(beforeExplode[i]!==afterExplode[i] || beforeExplode[i+1]!==afterExplode[i+1] || beforeExplode[i+2]!==afterExplode[i+2])changed++;
    assert.ok(changed>1000,'Explode must visibly move components');
    await window.webContents.executeJavaScript(`document.getElementById('qa-save').click();`);
    await frames();
    assert.ok(savedProject,'Save should receive a project');
    const root=savedProject.tree.children[0];
    assert.deepEqual(root.children[0].transform.position,[0,0,0]);
    assert.deepEqual(root.children[1].transform.position,[100,0,0]);
    assert.deepEqual(root.children[1].children[0].transform.position,[0,0,0],'Save restores original component placement');
    assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Explode amount"]').value`),'0');
    await window.webContents.executeJavaScript(`
      { const explode=document.querySelector('[aria-label="Explode amount"]');explode.value='70';explode.dispatchEvent(new Event('input')); }
      document.querySelector('[data-action="reset-explode"]').click();
    `);
    assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Explode percentage"]').textContent`),'0%');
    await window.webContents.executeJavaScript(`{
      const select=document.querySelector('[aria-label="Section plane"]');select.value='x';select.dispatchEvent(new Event('change'));
      const position=document.querySelector('[aria-label="Section position"]');position.value='31';position.dispatchEvent(new Event('input'));
      const explode=document.querySelector('[aria-label="Explode amount"]');explode.value='40';explode.dispatchEvent(new Event('input'));
      const part=[...document.querySelectorAll('.tree-node .label')].find(label=>label.textContent==='Hollow part');part.click();
      document.querySelector('[data-action="hide"]').click();
      document.querySelector('[aria-label="Review view name"]').value='Internal review';
      document.querySelector('[data-review="save"]').click();
      document.getElementById('qa-save').click();
    }`);
    await frames();
    const savedView=structuredClone(savedProject.reviewViews[0]);
    assert.equal(savedView.name,'Internal review');assert.equal(savedView.settings.explodeAmount,40);
    assert.ok(savedView.visibility.some(item=>!item.visible));
    await window.webContents.executeJavaScript(`document.getElementById('qa-open').click();`);
    await frames();
    assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Saved review views"]').selectedOptions[0].textContent`),'Internal review');
    await window.webContents.executeJavaScript(`
      document.getElementById('view-front').click();
      document.querySelector('[data-action="show"]').click();
      document.querySelector('[data-review="restore"]').click();
    `);
    await frames();
    assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Section plane"]').value`),'x');
    assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Section position"]').value`),'31');
    assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Explode amount"]').value`),'40');
    await window.webContents.executeJavaScript(`
      document.querySelector('[aria-label="Review view name"]').value='Recalled snapshot';
      document.querySelector('[data-review="save"]').click();
      document.getElementById('qa-save').click();
    `);
    await frames();
    const recalled=savedProject.reviewViews[1];
    assert.deepEqual(recalled.settings,savedView.settings);assert.deepEqual(recalled.visibility,savedView.visibility);
    for(const key of ['position','target','up']) recalled.camera[key].forEach((value,i)=>assert.ok(Math.abs(value-savedView.camera[key][i])<1e-5,'Recalled camera must match the snapshot'));
    await window.webContents.executeJavaScript(`document.querySelector('[data-review="delete"]').click();`);
    assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Saved review views"]').options.length`),1);
    assert.equal(errors.length,0,errors.join('\n'));
    console.log(`Viewer UI passed: import, filled cuts, explosion/reset, assembled-position saving, and saved-view project reopening, recall, camera/visibility restoration, and deletion.`);
    clearTimeout(timeout);window.destroy();app.exit(0);
  } catch(error) {clearTimeout(timeout);console.error(error);if(window)window.destroy();app.exit(1);}
});
