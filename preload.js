const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cadlite', {
  saveProject: (jsonString) => ipcRenderer.invoke('project:save', jsonString),
  loadProject: () => ipcRenderer.invoke('project:load'),
  exportStl: (stlString) => ipcRenderer.invoke('project:exportStl', stlString),
  booleanOp: (request) => ipcRenderer.invoke('geometry:boolean', request),
  chamferOp: (request) => ipcRenderer.invoke('geometry:chamfer', request),
  filletOp: (request) => ipcRenderer.invoke('geometry:fillet', request),
  shellOp: (request) => ipcRenderer.invoke('geometry:shell', request),
  getTopology: (shapeDef) => ipcRenderer.invoke('geometry:getTopology', shapeDef),
  exportStep: (parts) => ipcRenderer.invoke('step:export', parts),
  importStep: () => ipcRenderer.invoke('step:import'),
  exportDxf: (dxfString) => ipcRenderer.invoke('drawing:exportDxf', dxfString),
  exportSvg: (svgString) => ipcRenderer.invoke('drawing:exportSvg', svgString)
});


