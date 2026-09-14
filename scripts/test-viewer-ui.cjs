// Hidden Electron smoke test of the actual viewer UI and rendered section caps.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const assert = require('node:assert/strict');

app.whenReady().then(async () => {
  let window;
  const timeout = setTimeout(() => { console.error('Viewer UI test timed out'); app.exit(1); }, 30000);
  try {
    const THREE = await import('three');
    const outline = new THREE.Shape();
    outline.moveTo(-30,-30); outline.lineTo(30,-30); outline.lineTo(30,30); outline.lineTo(-30,30); outline.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-12,-12); hole.lineTo(-12,12); hole.lineTo(12,12); hole.lineTo(12,-12); hole.closePath();
    outline.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(outline,{depth:40,bevelEnabled:false});
    const meshData = { positions:Array.from(geometry.attributes.position.array), index:Array.from({length:geometry.attributes.position.count},(_,i)=>i), edges:[],faces:[],faceRanges:[] };
    ipcMain.handle('step:import', () => ({ok:true,fileName:'Section test.step',bodyCount:1,tree:{type:'assembly',name:'Section test',children:[{type:'part',name:'Hollow part',color:'#a8b8ca',meshData,stepContent:'UI fixture'}]}}));
    window = new BrowserWindow({show:false,width:1400,height:950,webPreferences:{preload:path.join(__dirname,'..','preload.js'),contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
    const errors=[];
    window.webContents.on('console-message',(_event,level,message)=>{if(level===3)errors.push(message);});
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
    assert.equal(errors.length,0,errors.join('\n'));
    console.log(`Viewer UI passed: import, filled cut rendering, and cap toggle (${filled-open} cap pixels).`);
    clearTimeout(timeout);window.destroy();app.exit(0);
  } catch(error) {clearTimeout(timeout);console.error(error);if(window)window.destroy();app.exit(1);}
});
