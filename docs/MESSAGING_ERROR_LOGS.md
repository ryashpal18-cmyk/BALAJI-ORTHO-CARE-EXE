# Messaging failures in the existing application logs

Caught messaging failures now go through the same `logger.cjs` used by the main process and renderer. Production wiring passes that logger from `main.js` through `pc-messaging.cjs` to the PDF/text, outreach and festival workers. The logging helper is explicitly included in the Windows app package.

Records contain software version, timestamp, source, code, stage, native exception/stack when available, attempt and delivery state. Job/campaign references are hashed. The helper never passes recipients, patient names, message bodies, QR values, media bytes or gateway configuration to the logger; the existing logger also masks secrets/phones in native errors. Repeated identical failures are limited to one per minute per reference; the next entry counts the suppressed repeats. A failed log write cannot interrupt billing, change message delivery state or trigger a resend.

Captured paths include PDF rendering, number lookup, document handoff, plain text send, client initialization/auth/disconnection, monthly/bill scheduling, campaign transport exceptions and rejected SMS results. Previously silent periodic worker `.catch` handlers now record their exception with the worker name. Expected waiting for a disconnected client is not logged on every poll.

- `WA-010`: connection/login failure
- `WA-011`: PDF queue failure
- `WA-012`: text sending failure
- `WA-013`: automatic queue/scheduler failure
- `SMS-010`: actual gateway response/network cause or local SMS journal failure
- `MSG-010`: background worker exception
- `MSG-011`: campaign transport/SMS failure

Files remain in `C:\Balaji_Health_Backup\logs`, named `app-YYYY-MM-DD.log` and `.jsonl` (plus rotated parts). Open them in Settings → Error Logs → Logs Folder Kholo. Existing rotation, retention, diagnostic report generation and logger write-health checks still apply. Nothing is uploaded or sent to support automatically. Errors whose details were already discarded by older releases cannot be reconstructed retrospectively.

Verification: `tests/messaging-log.cjs` creates actual temporary .log/.jsonl files and injects PDF, lookup, send, auth, campaign and periodic-worker failures. It checks redaction, stage/stack/version, duplicate prevention, repeat limiting, and a failing log sink. All transports and records are synthetic.
