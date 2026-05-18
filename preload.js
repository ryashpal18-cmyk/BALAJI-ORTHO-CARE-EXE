/**
 * preload.js — Secure Context Bridge
 * Exposes safe Electron APIs to the React renderer
 * Uses contextIsolation: true for security
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// ── Expose window.electron to React app ──────────────────────────────────────
contextBridge.exposeInMainWorld('electron', {

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
  copyXrayImage:   (srcPath)=> ipcRenderer.invoke('db:copyXrayImage', srcPath),

  // ── Settings ────────────────────────────────────────────────
  getSettings:     ()       => ipcRenderer.invoke('db:getSettings'),
  saveSettings:    (data)   => ipcRenderer.invoke('db:saveSettings', data),

  // ── Sync Queue ──────────────────────────────────────────────
  getPending:      ()       => ipcRenderer.invoke('db:getPending'),
  clearPending:    (ids)    => ipcRenderer.invoke('db:clearPending', ids),
  markSynced:      (data)   => ipcRenderer.invoke('db:markSynced', data),

  // ── Dashboard Stats ─────────────────────────────────────────
  getStats:        ()       => ipcRenderer.invoke('db:getStats'),

  // ── Shell ────────────────────────────────────────────────────
  openFolder:      (dir)    => ipcRenderer.invoke('shell:openFolder', dir),
  print:           (html)   => ipcRenderer.invoke('shell:print', html),

  // ── App info ─────────────────────────────────────────────────
  getBackupDir:    ()       => ipcRenderer.invoke('app:getBackupDir'),
  getXraysDir:     ()       => ipcRenderer.invoke('app:getXraysDir'),

  // ── Event Listeners (for X-ray capture, etc.) ────────────────
  on: (channel, callback) => {
    const allowed = ['printer-capture-received', 'sync-complete', 'sync-error'];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});

// ── Legacy: keep window.ipcRenderer for backward compatibility ───────────────
contextBridge.exposeInMainWorld('ipcRenderer', {
  send:    (channel, ...args) => ipcRenderer.send(channel, ...args),
  on:      (channel, callback) => ipcRenderer.on(channel, callback),
  invoke:  (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});

// ── Flag: running inside Electron ────────────────────────────────────────────
contextBridge.exposeInMainWorld('__ELECTRON__', true);
