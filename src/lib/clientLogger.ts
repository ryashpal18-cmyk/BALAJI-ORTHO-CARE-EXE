// Send raw structured context once. Main process applies masking before disk/console output.
let lastAction: { action:string; at:string } | undefined;
export function noteDiagnosticAction(action:string) { if (/^[a-z-]{1,50}$/.test(action)) lastAction={action,at:new Date().toISOString()}; }
type LogLevel = "INFO" | "WARN" | "ERROR";
export function diagnosticRoute(): string {
  if (typeof location === "undefined") return "unknown";
  return location.hash.split("?")[0].replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, ":id")
    .replace(/([/])[^/]*\d[^/]*/g, "$1:id").slice(0, 160);
}
export function reportRuntimeIssue(input: {level?: string; source: string; message: string; stack?: string; code?: string; detail?: unknown}) {
  try {
    const bridge = (window as any).electron;
    const result = bridge?.logRendererError?.({...input, action:lastAction, route: diagnosticRoute()});
    // A rejected IPC promise must never recursively produce another unhandled rejection.
    result?.catch?.(() => {});
  } catch { /* Logging must never break patient entry. */ }
}
export function clientLog(level: LogLevel, source: string, message: string, detail?: unknown): void {
  const error = detail instanceof Error ? detail : null;
  reportRuntimeIssue({ level:level.toLowerCase(), source, message, stack:error?.stack, detail });
}
export const cLog = {
  info:(source:string,message:string,detail?:unknown)=>clientLog("INFO",source,message,detail),
  warn:(source:string,message:string,detail?:unknown)=>clientLog("WARN",source,message,detail),
  error:(source:string,message:string,detail?:unknown)=>clientLog("ERROR",source,message,detail),
};
