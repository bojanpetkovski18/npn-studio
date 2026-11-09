'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');
const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('api', {
  init: call('app:init'),
  pdfEngine: call('app:pdfEngine'),
  setTheme: call('theme:set'),
  setSettings: call('settings:set'),
  resetSettings: call('settings:reset'),
  pickExcel: call('dialog:excel'),
  pickFolder: call('dialog:folder'),
  pickTemplate: call('dialog:template'),
  loadTemplate: call('template:load'),
  scanFolder: call('folder:scan'),
  loadData: call('data:load'),
  updateCase: call('case:update'),
  existing: call('out:existing'),
  preview: call('preview'),
  exportView: call('export:view'),
  saveSession: call('session:save'),
  saveProject: call('project:save'),
  openProject: call('project:open'),
  history: call('history:get'),
  generate: call('gen:run'),
  cancel: call('gen:cancel'),
  onProgress: (cb) => ipcRenderer.on('gen:progress', (_e, p) => cb(p)),
  onOpenProject: (cb) => ipcRenderer.on('open-project', (_e, p) => cb(p)),
  open: call('shell:open'),
  show: call('shell:show'),
  pathForFile: (file) => webUtils.getPathForFile(file),
});
