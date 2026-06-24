/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   CRASH / ERROR LOGGER                                           ║
 * ║   Har error ek dated .log file mein save hota hai                ║
 * ║   (userData/logs/app-YYYY-MM-DD.log), taaki field mein app crash  ║
 * ║   ho ya koi error aaye to baad mein "Logs" folder khol kar pata   ║
 * ║   chal sake ki hua kya tha — bina is ke aap sirf andaza lagate.   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

'use strict';

const { app } = require('electron');
const fs   = require('fs');
const path = require('path');

const MAX_LOG_AGE_DAYS = 14; // purani log files itne dino baad auto-delete ho jati hain

function getLogDir() {
  const dir = path.join(app.getPath('userData'), 'logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function todayLogFile() {
  const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(getLogDir(), `app-${stamp}.log`);
}

function writeLine(level, source, message) {
  try {
    const line = `[${new Date().toISOString()}] [${level}] [${source}] ${message}\n`;
    fs.appendFileSync(todayLogFile(), line, 'utf-8');
  } catch (_) {
    // Logging khud kabhi crash ki wajah nahi banni chahiye — silently ignore.
  }
}

function logInfo(source, message)  { writeLine('INFO',  source, message); }
function logWarn(source, message)  { writeLine('WARN',  source, message); console.warn(`[${source}]`, message); }
function logError(source, message) { writeLine('ERROR', source, message); console.error(`[${source}]`, message); }

/** Purani log files (14 din se zyada) hata deta hai, taaki disk space na bhare. */
function cleanOldLogs() {
  try {
    const dir = getLogDir();
    const cutoff = Date.now() - MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000;
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) fs.unlinkSync(full);
    }
  } catch (_) { /* ignore */ }
}

/** Main process ke top-level crash aur unhandled promise rejection pakadta hai. */
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
