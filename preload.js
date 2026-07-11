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

  // ✅ Real IndexedDB → disk safety backup (patients.json etc. ab genuinely likhi jaati hain)
  writeBackupSnapshot: (tables) => ipcRenderer.invoke('backup:writeSnapshot', tables),
  readBackupSnapshot:  ()       => ipcRenderer.invoke('backup:readSnapshot'),

  // ── Offline Store (SQLite — IndexedDB replacement) ───────────
  offline: {
    cacheGetAll:       (table)                        => ipcRenderer.invoke('offline:cacheGetAll', table),
    cacheGetRow:        (table, rowId)                 => ipcRenderer.invoke('offline:cacheGetRow', { table, rowId }),
    cacheSetRows:       (table, rows, idField)         => ipcRenderer.invoke('offline:cacheSetRows', { table, rows, idField }),
    cacheReplaceTable:  (table, rows, idField)         => ipcRenderer.invoke('offline:cacheReplaceTable', { table, rows, idField }),
    cacheUpsertRow:     (table, row, idField)          => ipcRenderer.invoke('offline:cacheUpsertRow', { table, row, idField }),
    cacheDeleteRow:     (table, rowId)                 => ipcRenderer.invoke('offline:cacheDeleteRow', { table, rowId }),
    cacheReplaceRowKey: (table, oldId, newRow, idField)=> ipcRenderer.invoke('offline:cacheReplaceRowKey', { table, oldId, newRow, idField }),
    queueAdd:           (mutation)                     => ipcRenderer.invoke('offline:queueAdd', mutation),
    queueGetAll:        ()                             => ipcRenderer.invoke('offline:queueGetAll'),
    queueRemove:        (id)                            => ipcRenderer.invoke('offline:queueRemove', id),
    queueUpdate:        (id, patch)                     => ipcRenderer.invoke('offline:queueUpdate', { id, patch }),
    metaGet:            (key)                           => ipcRenderer.invoke('offline:metaGet', key),
    metaSet:            (key, value)                    => ipcRenderer.invoke('offline:metaSet', { key, value }),
    isLegacyMigrated:   ()                              => ipcRenderer.invoke('offline:isLegacyMigrated'),
    importLegacyDump:   (dump)                          => ipcRenderer.invoke('offline:importLegacyDump', dump),
  },

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
  // ── Diagnostics ──────────────────────────────────────────────────────────
  runDiagnostics:        () => ipcRenderer.invoke('app:runDiagnostics'),
  nuclearIndexedDBReset: () => ipcRenderer.invoke('app:nuclearIndexedDBReset'),

  // ── App Version & Update ─────────────────────────────────────────────────
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
      'bug-detected',
    ];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  // ✅ Bug-detection toast ke "View More" button se call hota hai
  openBugDetail: (detailPath) => ipcRenderer.invoke('bug:openDetail', detailPath),
});

// Legacy ipcRenderer
contextBridge.exposeInMainWorld('ipcRenderer', {
  send:   (channel, ...args) => ipcRenderer.send(channel, ...args),
  on:     (channel, cb)      => ipcRenderer.on(channel, cb),
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  removeAllListeners: (ch)   => ipcRenderer.removeAllListeners(ch),
});

contextBridge.exposeInMainWorld('__ELECTRON__', true);
