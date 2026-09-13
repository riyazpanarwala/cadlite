const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#1b1e23',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.webContents.on('console-message', (_event, _level, message, line, sourceId) => {
    console.log(`[renderer] ${message}  (${sourceId}:${line})`);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- Project save / load (native file dialogs) ----

ipcMain.handle('project:save', async (_evt, jsonString) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save CADLite Project',
    defaultPath: 'project.cadlite.json',
    filters: [{ name: 'CADLite Project', extensions: ['json'] }]
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, jsonString, 'utf-8');
  return { ok: true, filePath };
});

ipcMain.handle('project:load', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open CADLite Project',
    properties: ['openFile'],
    filters: [{ name: 'CADLite Project', extensions: ['json'] }]
  });
  if (canceled || filePaths.length === 0) return { ok: false };
  const contents = fs.readFileSync(filePaths[0], 'utf-8');
  return { ok: true, contents, filePath: filePaths[0] };
});

ipcMain.handle('project:exportStl', async (_evt, stlString) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export STL',
    defaultPath: 'model.stl',
    filters: [{ name: 'STL', extensions: ['stl'] }]
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, stlString, 'utf-8');
  return { ok: true, filePath };
});

// ---- Boolean solid ops (union/cut/intersect) via OpenCascade, run here in
// the main process since it's plain Node and needs no WASM bundler config.
// See main/occ-service.js for OpenCascade solid kernel implementation details.
ipcMain.handle('geometry:boolean', async (_evt, request) => {
  try {
    const { performBoolean } = require('./main/occ-service.js');
    const meshData = await performBoolean(request);
    return { ok: true, meshData };
  } catch (err) {
    console.error('Boolean op failed:', err);
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('geometry:chamfer', async (_evt, request) => {
  try {
    const { performChamfer } = require('./main/occ-service.js');
    const meshData = await performChamfer(request);
    return { ok: true, meshData };
  } catch (err) {
    console.error('Chamfer op failed:', err);
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('geometry:fillet', async (_evt, request) => {
  try {
    const { performFillet } = require('./main/occ-service.js');
    const meshData = await performFillet(request);
    return { ok: true, meshData };
  } catch (err) {
    console.error('Fillet op failed:', err);
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('geometry:shell', async (_evt, request) => {
  try {
    const { performShell } = require('./main/occ-service.js');
    const meshData = await performShell(request);
    return { ok: true, meshData };
  } catch (err) {
    console.error('Shell op failed:', err);
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('geometry:sweep', async (_evt, request) => {
  try {
    const { performSweep } = require('./main/occ-service.js');
    const meshData = await performSweep(request);
    return { ok: true, meshData };
  } catch (err) {
    console.error('Sweep op failed:', err);
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('geometry:loft', async (_evt, request) => {
  try {
    const { performLoft } = require('./main/occ-service.js');
    const meshData = await performLoft(request);
    return { ok: true, meshData };
  } catch (err) {
    console.error('Loft op failed:', err);
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('geometry:getTopology', async (_evt, shapeDef) => {
  try {
    const { getShapeMeshAndTopology } = require('./main/occ-service.js');
    const result = await getShapeMeshAndTopology(shapeDef);
    return { ok: true, ...result };
  } catch (err) {
    console.error('Topology extraction failed:', err);
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('step:export', async (_evt, parts) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export STEP Model',
      defaultPath: 'model.step',
      filters: [
        { name: 'STEP CAD Files (*.step, *.stp)', extensions: ['step', 'stp'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (canceled || !filePath) return { ok: false };

    const { exportToStep } = require('./main/occ-service.js');
    const result = await exportToStep({ parts });
    fs.writeFileSync(filePath, result.stepContent, 'utf-8');
    return { ok: true, filePath };
  } catch (err) {
    console.error('STEP export failed:', err);
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('step:import', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Import STEP Model',
      filters: [
        { name: 'STEP CAD Files (*.step, *.stp)', extensions: ['step', 'stp'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    if (canceled || filePaths.length === 0) return { ok: false };

    const filePath = filePaths[0];
    const fileName = path.basename(filePath);
    const stepContent = fs.readFileSync(filePath, 'utf-8');

    const { importFromStep } = require('./main/occ-service.js');
    const result = await importFromStep({ stepContent, fileName });
    return {
      ok: true,
      meshData: result.meshData,
      stepContent: result.stepContent,
      fileName,
      filePath
    };
  } catch (err) {
    console.error('STEP import failed:', err);
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('drawing:exportDxf', async (_evt, dxfString) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export 2D Engineering Drawing (DXF)',
      defaultPath: 'Part2_drawing.dxf',
      filters: [
        { name: 'AutoCAD DXF Drawing (*.dxf)', extensions: ['dxf'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (canceled || !filePath) return { ok: false };
    fs.writeFileSync(filePath, dxfString, 'utf-8');
    return { ok: true, filePath };
  } catch (err) {
    console.error('DXF export failed:', err);
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('drawing:exportSvg', async (_evt, svgString) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export 2D Blueprint Vector Drawing (SVG)',
      defaultPath: 'Part2_drawing.svg',
      filters: [
        { name: 'Scalable Vector Graphics (*.svg)', extensions: ['svg'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (canceled || !filePath) return { ok: false };
    fs.writeFileSync(filePath, svgString, 'utf-8');
    return { ok: true, filePath };
  } catch (err) {
    console.error('SVG export failed:', err);
    return { ok: false, error: err.message || String(err) };
  }
});



