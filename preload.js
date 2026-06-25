'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {

  // ── Auth ────────────────────────────────────────────────────
  login:     (data)   => ipcRenderer.invoke('auth:login',  data),
  checkAuth: ()       => ipcRenderer.invoke('auth:check'),
  logout:    ()       => ipcRenderer.invoke('auth:logout'),

  // ── Patient Operations ──────────────────────────────────────
  savePatient:     (data)   => ipcRenderer.invoke('db:savePatient', data),
  getAllPatients:   ()       => ipcRenderer.invoke('db:getAllPatients'),
  searchPatient:   (mobile) => ipcRenderer.invoke('db:searchPatient', mobile),
  searchPatients:  (query)  => ipcRenderer.invoke('db:searchPatients', query),

  // ── Bill Operations ─────────────────────────────────────────
  saveBill:        (data)   => ipcRenderer.invoke('db:saveBill', data),
  getBills:        (mobile) => ipcRenderer.invoke('db:getBills', mobile),

  // ── Report Operations ───────────────────────────────────────
  saveReport:      (data)   => ipcRenderer.invoke('db:saveReport', data),
  getReports:      (mobile) => ipcRenderer.invoke('db:getReports', mobile),

  // ── X-Ray Operations ────────────────────────────────────────
  saveXray:        (data)   => ipcRenderer.invoke('db:saveXray', data),
  getXrays:        (mobile) => ipcRenderer.invoke('db:getXrays', mobile),
  copyXrayImage:   (path)   => ipcRenderer.invoke('db:copyXrayImage', path),

  // ── Fracture / Ortho ────────────────────────────────────────
  saveFractureCase:   (data) => ipcRenderer.invoke('db:saveFractureCase', data),
  getFractureCases:   ()     => ipcRenderer.invoke('db:getFractureCases'),
  updateFractureCase: (data) => ipcRenderer.invoke('db:updateFractureCase', data),

  // ── Settings ────────────────────────────────────────────────
  getSettings:     ()       => ipcRenderer.invoke('db:getSettings'),
  saveSettings:    (data)   => ipcRenderer.invoke('db:saveSettings', data),

  // ── Sync ────────────────────────────────────────────────────
  getPending:      ()       => ipcRenderer.invoke('db:getPending'),
  clearPending:    (ids)    => ipcRenderer.invoke('db:clearPending', ids),
  markSynced:      (data)   => ipcRenderer.invoke('db:markSynced', data),
  syncNow:         ()       => ipcRenderer.invoke('db:syncNow'),

  // ── Online Check ────────────────────────────────────────────
  isOnline:        ()       => ipcRenderer.invoke('app:isOnline'),

  // ── Stats ───────────────────────────────────────────────────
  getStats:        ()       => ipcRenderer.invoke('db:getStats'),

  // ── Shell ────────────────────────────────────────────────────
  openFolder:      (dir)    => ipcRenderer.invoke('shell:openFolder', dir),
  print:           (html)   => ipcRenderer.invoke('shell:print', html),

  // ── App Paths ─────────────────────────────────────────────────
  getBackupDir:    ()       => ipcRenderer.invoke('app:getBackupDir'),
  getXraysDir:     ()       => ipcRenderer.invoke('app:getXraysDir'),

  // ── Backup ─────────────────────────────────────────────────
  backupGetDir:       ()      => ipcRenderer.invoke('backup:getDir'),
  backupWriteJson:    (data)  => ipcRenderer.invoke('backup:writeJson', data),
  backupWriteBinary:  (data)  => ipcRenderer.invoke('backup:writeBinary', data),
  backupList:         ()      => ipcRenderer.invoke('backup:list'),
  backupOpenFolder:   ()      => ipcRenderer.invoke('backup:openFolder'),

  // ── Logging ─────────────────────────────────────────────────
  logRendererError:     (data) => ipcRenderer.invoke('log:rendererError', data),
  getLogsDir:           ()     => ipcRenderer.invoke('log:getDir'),
  getSafetySnapshotDir: ()     => ipcRenderer.invoke('log:getSnapshotDir'),
  openLogsFolder:       ()     => ipcRenderer.invoke('log:openFolder'),

  // ── SMS — main process se bhejo (CORS fix) ──────────────────
  sendSMS: (data) => ipcRenderer.invoke('app:sendSMS', data),

  // ── App Version & Update ─────────────────────────────────────
  getAppVersion:  () => ipcRenderer.invoke('app:getVersion'),
  checkForUpdate: () => ipcRenderer.invoke('app:checkForUpdate'),
  downloadUpdate: () => ipcRenderer.invoke('app:downloadUpdate'),
  installUpdate:  () => ipcRenderer.invoke('app:installUpdate'),
  openExternal:   (url) => ipcRenderer.invoke('app:openExternal', url),

  // ── Event Listeners ──────────────────────────────────────────
  on: (channel, callback) => {
    const allowed = [
      'printer-capture-received',
      'sync-complete',
      'sync-error',
      'updater:status',
    ];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});

// Legacy ipcRenderer
contextBridge.exposeInMainWorld('ipcRenderer', {
  send:   (channel, ...args) => ipcRenderer.send(channel, ...args),
  on:     (channel, cb)      => ipcRenderer.on(channel, cb),
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  removeAllListeners: (ch)   => ipcRenderer.removeAllListeners(ch),
});

contextBridge.exposeInMainWorld('__ELECTRON__', true);
