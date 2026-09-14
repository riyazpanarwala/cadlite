const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cadlite', {
  saveProject: (jsonString) => ipcRenderer.invoke('project:save', jsonString),
  loadProject: () => ipcRenderer.invoke('project:load'),
  exportStl: (stlString) => ipcRenderer.invoke('project:exportStl', stlString),
  booleanOp: (request) => ipcRenderer.invoke('geometry:boolean', request),
  chamferOp: (request) => ipcRenderer.invoke('geometry:chamfer', request),
  filletOp: (request) => ipcRenderer.invoke('geometry:fillet', request),
  shellOp: (request) => ipcRenderer.invoke('geometry:shell', request),
  sweepOp: (request) => ipcRenderer.invoke('geometry:sweep', request),
  loftOp: (request) => ipcRenderer.invoke('geometry:loft', request),
  getTopology: (shapeDef) => ipcRenderer.invoke('geometry:getTopology', shapeDef),
  exportStep: (parts) => ipcRenderer.invoke('step:export', parts),
  importStep: () => ipcRenderer.invoke('step:import'),
  cancelStepImport: () => ipcRenderer.invoke('step:cancel'),
  onStepProgress: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('step:progress', listener);
    return () => ipcRenderer.removeListener('step:progress', listener);
  },
  exportDxf: (dxfString) => ipcRenderer.invoke('drawing:exportDxf', dxfString),
  exportSvg: (svgString) => ipcRenderer.invoke('drawing:exportSvg', svgString)
});

