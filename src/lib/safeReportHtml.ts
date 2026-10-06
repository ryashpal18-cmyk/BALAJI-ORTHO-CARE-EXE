import DOMPurify from "dompurify";
/** Every generated report crosses this boundary before entering an HTML sink. */
export function safeReportHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "textarea", "base", "link"],
    FORBID_ATTR: ["srcdoc", "formaction"],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}
export function writeReportDocument(win: Window, html: string) {
  win.document.open();
  win.document.write(safeReportHtml(html));
  win.document.close();
  win.document.querySelectorAll("button").forEach(button => button.addEventListener("click", () => win.print()));
  // Generated reports are inert; no inline script is needed for printing.
}
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
}
