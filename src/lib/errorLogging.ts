import { reportRuntimeIssue, noteDiagnosticAction } from "./clientLogger";
let initialized = false;
function endpoint(input: RequestInfo | URL): string {
  try {
    const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
    // Never record query, hostname, patient ID, object path, request/response body or headers.
    if (u.pathname.startsWith("/rest/v1/")) return "/rest/v1/" + u.pathname.split("/")[3].replace(/[^a-z_]/gi, "");
    if (u.pathname.startsWith("/auth/v1/")) return "/auth/v1/[operation]";
    if (u.pathname.startsWith("/functions/v1/")) return "/functions/v1/[operation]";
    return "[network resource]";
  } catch { return "[network resource]"; }
}
export function initErrorLogging() {
  if (initialized) return;
  initialized = true;
  window.addEventListener("click",event=>{
    const target=event.target instanceof Element?event.target.closest("button,[role=button],a"):null;
    if(target)noteDiagnosticAction(target.getAttribute("data-diagnostic-action")||"button-click");
  },true);
  window.addEventListener("error", (event: Event) => {
    if (event instanceof ErrorEvent) reportRuntimeIssue({source:"ui-runtime",message:event.message,stack:event.error?.stack});
    else reportRuntimeIssue({level:"warn",source:"ui-resource",code:"UI-011",message:"Screen resource could not load",detail:{tag:(event.target as HTMLElement)?.tagName||"unknown"}});
  }, true);
  window.addEventListener("unhandledrejection", (event) => {
    const reason=event.reason;
    reportRuntimeIssue({source:"ui-promise",message:reason?.message||String(reason),stack:reason?.stack});
  });
  if (typeof window.fetch === "function") {
    const original=window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const start=performance.now();
      try {
        const response=await original(input,init);
        if (!response.ok) reportRuntimeIssue({level:response.status>=500?"error":"warn",source:"ui-network",code:"NET-001",message:`Request returned HTTP ${response.status} — ${endpoint(input)}`,detail:{endpoint:endpoint(input),status:response.status,durationMs:Math.round(performance.now()-start)}});
        return response;
      } catch (error: any) {
        reportRuntimeIssue({level:error?.name==="AbortError"?"warn":"error",source:"ui-network",code:error?.name==="AbortError"?"NET-002":"NET-001",message:"Request did not complete",detail:{endpoint:endpoint(input),errorName:error?.name,durationMs:Math.round(performance.now()-start)}});
        throw error;
      }
    };
  }
  try {
    let lastWarning=-Infinity;
    const observer=new PerformanceObserver(list=>{
      for(const entry of list.getEntries()) if(entry.duration>=2000&&performance.now()-lastWarning>60000){lastWarning=performance.now();reportRuntimeIssue({level:"warn",source:"ui-performance",code:"UI-020",message:"UI main thread blocked for over 2 seconds",detail:{durationMs:Math.round(entry.duration)}});}
    });
    observer.observe({entryTypes:["longtask"]});
  } catch { /* Optional browser capability. */ }
  reportRuntimeIssue({level:"info",source:"ui-startup",code:"UI-START",message:"Renderer diagnostic monitoring started"});
}
