'use strict';
// Node/Electron-only I/O around the pure engine (never bundled into the mobile app).
const fs = require('fs');
const { loadFiles } = require('./excel');

function readInput(filePath) {
  try {
    return { name: filePath, filePath, data: fs.readFileSync(filePath) };
  } catch (err) {
    const msg = err.code === 'EBUSY' || err.code === 'EPERM' ? 'Датотеката е заклучена (отворена во Excel?)'
      : err.code === 'ENOENT' ? 'Датотеката не постои' : err.message;
    return { name: filePath, filePath, error: msg };
  }
}

/** Reads the given paths from disk and loads them (same result shape as loadFiles). */
function loadAll(filePaths) {
  return loadFiles(filePaths.map(readInput));
}

module.exports = { loadAll, readInput };

// Template.load(filePath) for Node callers
const { Template } = require('./docx');
Template.load = async function load(filePath) {
  return Template.fromData(fs.readFileSync(filePath), filePath, filePath);
};
module.exports.Template = Template;
