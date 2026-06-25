'use strict';

const fs   = require('fs');
const path = require('path');

// Log folder: C:\Balaji_Health_Backup\logs\
const BACKUP_DIR     = 'C:\\Balaji_Health_Backup';
const LOG_DIR        = path.join(BACKUP_DIR, 'logs');
const MAX_LOG_DAYS   = 14;
const SEPARATOR      = '─'.repeat(80);

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
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return path.join(LOG_DIR, `app-${stamp}.log`);
}

// ── Full detail extract karna ─────────────────────────────────────────────
function extractDetail(val) {
  if (!val) return '';
  if (val instanceof Error) {
    let out = `${val.name}: ${val.message}`;
    if (val.stack) {
      const stackLines = val.stack.split('\n').map(l => '    ' + l.trim()).join('\n');
      out += `\n    Stack Trace:\n${stackLines}`;
    }
    if (val.code)    out += `\n    Code: ${val.code}`;
    if (val.details) out += `\n    Details: ${val.details}`;
    if (val.hint)    out += `\n    Hint: ${val.hint}`;
    return out;
  }
  if (typeof val === 'string') return val;
  try { return JSON.stringify(val, null, 2); } catch { return String(val); }
}

// ── Main write function ───────────────────────────────────────────────────
function writeLine(level, source, message, detail) {
  try {
    ensureLogDir();
    const time = new Date().toLocaleString('en-IN', { hour12: false });
    const detailStr = detail ? `\n    Detail: ${extractDetail(detail)}` : '';
    const line =
      `[${time}] [${level}] [${source}]\n` +
      `    ${message}${detailStr}\n` +
      `${SEPARATOR}\n`;
    fs.appendFileSync(todayLogFile(), line, 'utf-8');
  } catch (e) {
    console.error('[LOGGER] Write fail:', e.message);
  }
}

// ── React renderer se aaya full log message likhna ───────────────────────
// (clientLogger.ts already format kar ke bhejta hai)
function writeRendererLog(level, source, formattedMessage) {
  try {
    ensureLogDir();
    const line = formattedMessage.endsWith('\n') ? formattedMessage : formattedMessage + '\n';
    fs.appendFileSync(todayLogFile(), line, 'utf-8');
  } catch (e) {
    console.error('[LOGGER] Renderer log write fail:', e.message);
  }
}

function logInfo(source, message, detail)  {
  writeLine('INFO',  source, message, detail);
  console.log(`[INFO] [${source}]`, message);
}
function logWarn(source, message, detail)  {
  writeLine('WARN',  source, message, detail);
  console.warn(`[WARN] [${source}]`, message);
}
function logError(source, message, detail) {
  writeLine('ERROR', source, message, detail);
  console.error(`[ERROR] [${source}]`, message);
}

// ── 14 din purani log files delete karna ─────────────────────────────────
function cleanOldLogs() {
  try {
    ensureLogDir();
    const cutoff = Date.now() - MAX_LOG_DAYS * 24 * 60 * 60 * 1000;
    for (const f of fs.readdirSync(LOG_DIR)) {
      const full = path.join(LOG_DIR, f);
      if (f.endsWith('.log') && fs.statSync(full).mtimeMs < cutoff) {
        fs.unlinkSync(full);
        console.log('[LOGGER] Purani log delete hui:', f);
      }
    }
  } catch (_) {}
}

// ── Process level crash handlers ─────────────────────────────────────────
function setupGlobalHandlers() {
  process.on('uncaughtException', (err) => {
    writeLine('ERROR', 'main-process', `UNCAUGHT EXCEPTION: ${err.message}`, err);
    console.error('[FATAL]', err);
  });
  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    writeLine('ERROR', 'main-process', `UNHANDLED REJECTION: ${msg}`, reason);
    console.error('[FATAL REJECTION]', reason);
  });
}

module.exports = {
  logInfo,
  logWarn,
  logError,
  writeRendererLog,
  cleanOldLogs,
  setupGlobalHandlers,
  getLogDir,
};
