'use strict';
// Parses + joins the Excel files off the main thread so the window never freezes on large sheets.
const { parentPort, workerData } = require('worker_threads');
const { loadAll } = require('./node');

try {
  parentPort.postMessage({ ok: true, result: loadAll(workerData.filePaths, workerData.opts) });
} catch (err) {
  parentPort.postMessage({ ok: false, error: err.message });
}
