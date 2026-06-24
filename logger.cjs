'use strict';

const fs   = require('fs');
const path = require('path');

// ✅ Log folder: C:\Balaji_Health_Backup\logs\
// Ye folder aasaani se dikh sakta hai
const BACKUP_DIR = 'C:\\Balaji_Health_Backup';
const LOG_DIR    = path.join(BACKUP_DIR, 'logs');

const MAX_LOG_AGE_DAYS = 14;

function ensureLogDir() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    if (!fs.existsSync(LOG_DIR))    fs.mkdirSync(LOG_DIR,    { recursive: true });
  } catch (e) {
    console.error('[LOGGER] Folder nahi bana:', e.message);
  }
}

function getLogDir() {
  ensureLogDir();
  return LOG_DIR;
}

function todayLogFile() {
  const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(LOG_DIR, `app-${stamp}.log`);
}

function writeLine(level, source, message) {
  try {
    ensureLogDir();
    const time = new Date().toLocaleString('en-IN', { hour12: false });
    const line = `[${time}] [${level}] [${source}] ${message}\n`;
    fs.appendFileSync(todayLogFile(), line, 'utf-8');
  } catch (_) {
    // Logging khud kabhi crash nahi karega
  }
}

function logInfo(source, message)  { writeLine('INFO',  source, message); console.log(`[${source}]`, message); }
function logWarn(source, message)  { writeLine('WARN',  source, message); console.warn(`[${source}]`, message); }
function logError(source, message) { writeLine('ERROR', source, message); console.error(`[${source}]`, message); }

function cleanOldLogs() {
  try {
    ensureLogDir();
    const cutoff = Date.now() - MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000;
    for (const f of fs.readdirSync(LOG_DIR)) {
      const full = path.join(LOG_DIR, f);
      if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
    }
  } catch (_) {}
}

function setupGlobalHandlers() {
  process.on('uncaughtException', (err) => {
    logError('main-process', `Uncaught Exception: ${err && err.stack ? err.stack : err}`);
  });
  process.on('unhandledRejection', (reason) => {
    const detail = reason && reason.stack ? reason.stack : String(reason);
    logError('main-process', `Unhandled Rejection: ${detail}`);
  });
}

module.exports = { logInfo, logWarn, logError, cleanOldLogs, setupGlobalHandlers, getLogDir };
