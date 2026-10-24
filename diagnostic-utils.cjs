'use strict';
const crypto = require('crypto');
const SECRET_KEY = /password|passwd|secret|token|authorization|api.?key|cookie|qr|patient.?name|mobile|phone|email|messagebody|payload/i;
function redactText(value, limit = 12000) {
  return String(value ?? '').slice(0, limit)
    .replace(/((?:password|passwd|access_token|refresh_token|api[_-]?key|authorization|cookie|secret)[\"']?\s*[:=]\s*)[\"'][^\"']*[\"']/gi, '$1[REDACTED]')
    .replace(/(["'](?:patient_?name|mobile|phone|email|address)["']\s*:\s*)["'][^"']*["']/gi, '$1"[REDACTED]"')
    .replace(/(Key\s*\((?:name|patient_name|mobile|email|address)\)\s*=\s*)\([^)]*\)/gi, '$1([REDACTED])')
    .replace(/\bBearer\s+[^\s,;"']+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[TOKEN]')
    .replace(/\b(?:sb_(?:secret|publishable)_)[A-Za-z0-9_-]+/g, '[API_KEY]')
    .replace(/((?:password|passwd|access_token|refresh_token|api[_-]?key|authorization|cookie|secret)["']?\s*[:=]\s*)[^\s,;}\n]+/gi, '$1[REDACTED]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]')
    .replace(/(?:\+?91[ -]?)?[6-9](?:[ -]?\d){9}\b/g, '[PHONE]')
    .replace(/(patient(?:name)?\s*[:=]\s*)[^,;\n]+/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/[^\s?#"']+)[?#][^\s"']*/gi, '$1?[REDACTED]')
    .replace(/(\b[A-Z]:\\Users\\)[^\\\s]+/gi, '$1[USER]');
}
function sanitize(value, depth = 0, seen = new WeakSet()) {
  if (depth > 5) return '[DEPTH LIMIT]';
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value !== 'object') return redactText(value);
  if (seen.has(value)) return '[CIRCULAR]'; seen.add(value);
  if (value instanceof Error) return { name: value.name, message: redactText(value.message), stack: redactText(value.stack), code: redactText(value.code) };
  if (Array.isArray(value)) return value.slice(0, 100).map(v => sanitize(v, depth + 1, seen));
  return Object.fromEntries(Object.entries(value).slice(0, 100).map(([k,v]) => [k, SECRET_KEY.test(k) ? '[REDACTED]' : sanitize(v, depth + 1, seen)]));
}
const RULES = [
  [/SQLITE_CORRUPT|database disk image is malformed/i,'DB-001','SQLite data integrity failure','काम रोककर सुरक्षित backup लें; database की copy पर repair जाँचें। Reset या delete न करें।'],
  [/SQLITE_BUSY|database is locked/i,'DB-002','SQLite is locked','दूसरा clinic process, antivirus और disk access जाँचें; पहले pending data बचाएँ।'],
  [/SQLITE_FULL|ENOSPC|disk.*full/i,'STORAGE-001','Disk space exhausted','Drive पर जगह बनाएँ; फिर save और backup दोबारा जाँचें।'],
  [/EACCES|EPERM|permission denied/i,'STORAGE-002','Storage permission denied','Backup/database folder की Windows permissions और antivirus जाँचें।'],
  [/No handler registered/i,'IPC-001','Missing desktop handler','उसी release के main और preload files साथ install करें; channel registration जाँचें।'],
  [/render-process-gone|RENDERER CRASH/i,'UI-001','Renderer process stopped','Report का reason और memory देखें; crash वाले screen/action को दोहराएँ।'],
  [/is not defined|ReferenceError/i,'UI-002','Undefined function or variable','Stack में आए build file और action का import/definition जाँचें।'],
  [/Maximum update depth|Too many re-renders/i,'UI-003','React render loop','संबंधित effect/query dependencies और state updates जाँचें।'],
  [/PENDING_PARENT_INSERT/i,'SYNC-002','Parent record awaiting sync','Parent insert का error देखें; child queue को delete न करें।'],
  [/SMS_UNCONFIRMED|SMS.*unconfirmed|SMS delivery unconfirmed/i,'SMS-002','SMS delivery outcome unknown','Gateway में delivery जाँचें; स्वतः resend न करें।'],
  [/401|403|row.level.security|JWT.*expired|session verification/i,'CLOUD-002','Cloud authentication or access failure','Cloud connection और table permissions जाँचें; local login/data reset न करें।'],
  [/timeout|timed out|AbortError/i,'NET-002','Request timed out','Connection/service health जाँचें; संदेश भेजने का परिणाम अनिश्चित हो तो resend से पहले जाँचें।'],
];
function classify(message) { const rule = RULES.find(r => r[0].test(message)); return rule ? { code:rule[1], title:rule[2], action:rule[3] } : { code:'APP-001', title:'Unclassified application error', action:'Stack, screen और समय के साथ इस error को reproduce करके जाँचें।' }; }
function reference(value) { return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12); }
function fingerprint(e) { return reference([e.code,e.source,e.message.replace(/\b\d+\b/g,'N')].join('|')); }
function localDay(time = Date.now()) { const d=new Date(time);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function normalizeEvent(input, time = Date.now()) {
  const message=redactText(input.message || 'Unspecified error', 8000), classified=classify(String(input.source||'')+' '+message);
  const event={ appVersion:redactText(input.appVersion||'unknown',40), timestamp:new Date(time).toISOString(), level:['info','warn','error'].includes(String(input.level).toLowerCase())?String(input.level).toLowerCase():'error',
    code:/^[A-Z][A-Z0-9-]{2,40}$/.test(input.code||'')?input.code:classified.code, source:redactText(input.source||'application',100), message,
    action:sanitize(input.action), detail:sanitize(input.detail), stack:redactText(input.stack||'',12000), route:redactText(input.route||'',200), session:redactText(input.session||'',100) };
  const detail=JSON.stringify(event.detail);if(detail&&detail.length>16000)event.detail={truncated:true,preview:detail.slice(0,16000)};
  event.fingerprint=fingerprint(event); return event;
}
function describe(code,message) {
  const rule=RULES.find(r=>r[1]===code);if(rule)return {code,title:rule[2],action:rule[3]};
  const known={
    'WA-010':['WhatsApp connection failed','Connection/login failure का stage और native error देखें; QR/session बिना कारण reset न करें।'],
    'WA-011':['WhatsApp PDF job failed','Job reference, PDF/send stage और stack देखें; unconfirmed हो तो चैट जाँचकर ही resend करें।'],
    'WA-012':['WhatsApp text send failed','Job/campaign reference और native error देखें; अनिश्चित संदेश स्वतः दोबारा न भेजें।'],
    'WA-013':['WhatsApp scheduling failed','Queue/scheduler error और local record references जाँचें; pending data न हटाएँ।'],
    'MSG-010':['Background messaging worker failed','Worker का नाम, stack और storage/connector error देखें।'],
    'MSG-011':['Campaign message send failed','Channel, job/campaign reference और error देखें; gateway/chat में परिणाम जाँचें।'],
    'UI-007':['Renderer startup error','Startup stack और bundled JS/assets जाँचें; UI monitor शुरू होने से पहले error आया।'],
    'UI-004':['React screen crashed','Component stack और screen/action से render failure reproduce करें।'],
    'UI-005':['Main screen load failed','Installed assets/preload और release files जाँचें।'],
    'UI-006':['Renderer not responding','उसी screen/action पर memory, long tasks और crash logs जाँचें।'],
    'UI-011':['Screen resource failed','Image/asset path, local file और network जाँचें।'],
    'UI-020':['UI long task recorded','Recorded action के slow work और render loop को जाँचें।'],
    'NET-001':['Failed network request','HTTP status, endpoint और connection देखें; local data reset न करें।']
  };
  return known[code]?{code,title:known[code][0],action:known[code][1]}:classify(message);
}
module.exports={describe,redactText,sanitize,classify,reference,fingerprint,localDay,normalizeEvent};
