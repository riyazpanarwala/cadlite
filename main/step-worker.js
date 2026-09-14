const { parentPort, workerData } = require('node:worker_threads');
const { importFromStep } = require('./occ-service');

importFromStep({ ...workerData, withAssembly: true, report: (message) => parentPort.postMessage({ progress: message }) })
  .then(result => parentPort.postMessage({ result }))
  .catch(error => parentPort.postMessage({ error: error.message || String(error) }));
