// ─────────────────────────────────────────────────────────────────────────
// Renderer-side error logging
//
// Browser/renderer mein jo bhi uncaught error ya unhandled promise rejection
// aaye, usko Electron main process ko forward kar dete hain — wahan ek
// central log file (userData/logs/app-YYYY-MM-DD.log) mein save hoti hai.
// Isse field mein koi crash/white-screen ho to "Settings → About → Logs
// Folder" khol kar exact wajah pata chal sakti hai.
// ─────────────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    electron?: any;
  }
}

function send(source: string, message: string, stack?: string) {
  try {
    if (window.electron?.logRendererError) {
      window.electron.logRendererError({ source, message, stack });
    } else {
      // Browser preview (no Electron) — sirf console mein dikhao.
      console.error(`[${source}]`, message, stack || "");
    }
  } catch (_) {
    // Logging khud kabhi error throw na kare.
  }
}

export function initErrorLogging() {
  window.addEventListener("error", (event) => {
    send("window.onerror", event.message, event.error?.stack);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason: any = event.reason;
    send("unhandledrejection", reason?.message || String(reason), reason?.stack);
  });
}
