// ─────────────────────────────────────────────────────────────────────────
// clientLogger.ts — React side logger
// Full details: file name, function name, line number, stack trace
// Log file: C:\Balaji_Health_Backup\logs\app-YYYY-MM-DD.log
// ─────────────────────────────────────────────────────────────────────────

type LogLevel = "INFO" | "WARN" | "ERROR";

function getTime(): string {
  return new Date().toLocaleString("en-IN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
}

// ── Caller ka file + function + line number nikalna ──────────────────────
function getCallerInfo(): string {
  try {
    const err = new Error();
    const lines = (err.stack || "").split("\n");

    // Stack mein pehli 3 lines skip karo (Error, getCallerInfo, clientLog)
    // 4th line se caller milega
    for (let i = 3; i < lines.length; i++) {
      const line = lines[i].trim();

      // clientLogger.ts ki apni lines skip karo
      if (line.includes("clientLogger")) continue;

      // Browser stack format: "at FunctionName (file.tsx:42:10)"
      // Ya: "at file.tsx:42:10"
      const matchFn   = line.match(/at\s+([^\s(]+)\s+\((.+):(\d+):\d+\)/);
      const matchFile = line.match(/at\s+(.+):(\d+):\d+/);

      if (matchFn) {
        const fnName   = matchFn[1];
        const filePath = matchFn[2];
        const lineNo   = matchFn[3];
        // sirf file ka naam lo — pura path nahi
        const fileName = filePath.split("/").pop() || filePath;
        return `${fileName}:${lineNo} → fn: ${fnName}`;
      } else if (matchFile) {
        const filePath = matchFile[1];
        const lineNo   = matchFile[2];
        const fileName = filePath.split("/").pop() || filePath;
        return `${fileName}:${lineNo}`;
      }
    }
    return "unknown location";
  } catch {
    return "unknown location";
  }
}

// ── Error ka full stack trace nikalna ────────────────────────────────────
function extractFullDetail(val: unknown): string {
  if (!val) return "";

  if (val instanceof Error) {
    let detail = `${val.name}: ${val.message}`;
    if (val.stack) {
      // Stack trace — har line clean karke likho
      const stackLines = val.stack
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .join("\n    ");
      detail += `\n    Stack:\n    ${stackLines}`;
    }
    // Supabase error extra fields
    const sb = val as any;
    if (sb.code)    detail += `\n    Code: ${sb.code}`;
    if (sb.details) detail += `\n    Details: ${sb.details}`;
    if (sb.hint)    detail += `\n    Hint: ${sb.hint}`;
    return detail;
  }

  if (typeof val === "string") return val;

  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

// ── Core log function ─────────────────────────────────────────────────────
export function clientLog(level: LogLevel, source: string, message: string, detail?: unknown): void {
  const time       = getTime();
  const caller     = getCallerInfo();
  const detailStr  = detail ? `\n    Detail: ${extractFullDetail(detail)}` : "";

  // ── Log line format ──
  // [25/06/2026, 14:32:11] [ERROR] [supabase] | Billing.tsx:245 → fn: handleAdd
  //   Message: Supabase insert fail
  //   Detail: PostgresError: duplicate key value...
  //     Stack: at handleAdd (Billing.tsx:245:10)...
  const logLine =
    `[${time}] [${level}] [${source}] | ${caller}\n` +
    `    Message: ${message}${detailStr}`;

  // Console mein dikhao
  if (level === "ERROR") console.error(logLine);
  else if (level === "WARN") console.warn(logLine);
  else console.info(logLine);

  // Electron ko bhejo — file mein likhega
  try {
    const el = (window as any).electron;
    if (el?.logRendererError) {
      el.logRendererError({
        level:   level.toLowerCase(), // ✅ 'info' | 'warn' | 'error' — main.js sahi level pe likhega
        source,
        message: logLine + "\n" + "─".repeat(80),
      });
    }
  } catch {
    // Electron nahi mila — browser dev mode, ignore
  }
}

// ── Shorthand helpers ─────────────────────────────────────────────────────
export const cLog = {
  info:  (source: string, msg: string, detail?: unknown) => clientLog("INFO",  source, msg, detail),
  warn:  (source: string, msg: string, detail?: unknown) => clientLog("WARN",  source, msg, detail),
  error: (source: string, msg: string, detail?: unknown) => clientLog("ERROR", source, msg, detail),
};

// ── Global unhandled errors ───────────────────────────────────────────────
if (typeof window !== "undefined") {

  // Unhandled Promise rejections — Supabase, fetch, async errors
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const msg =
      reason instanceof Error
        ? `${reason.name}: ${reason.message}`
        : String(reason);
    clientLog("ERROR", "unhandled-promise", `Unhandled Promise Rejection: ${msg}`, reason);
  });

  // JS runtime errors — syntax error, null reference, etc.
  window.addEventListener("error", (event) => {
    const detail =
      `File: ${event.filename}\n` +
      `Line: ${event.lineno}, Col: ${event.colno}\n` +
      (event.error?.stack || "");
    clientLog(
      "ERROR",
      "js-runtime",
      `Uncaught Error: ${event.message}`,
      detail
    );
  });
}
