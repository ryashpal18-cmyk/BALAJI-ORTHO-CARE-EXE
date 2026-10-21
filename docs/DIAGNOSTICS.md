# PC diagnostic and support reports

Settings → About → **Clinic Diagnostics & Support Report**.

- **Quick check**: local SQLite quick check/readability, actual data and message queue counts, dispatch journal, bill math, folder access/free space, registered IPC handlers, available authenticated cloud read access, current-screen layout, and seven-day runtime error history.
- **Deep check**: SQLite integrity check, receipt ledger/reference consistency and latest full JSON backup parsing. This may take longer on a large database.
- **TXT / JSON / Copy support report**: stable error code, run ID, installed version, observation time, occurrence count, stack/build location, evidence, verification scope, and suggested next step. Twenty report pairs are retained.
- **Saved reports**: compare times, modes and counts. Historical errors are evidence that something happened; they do not prove an old bug still exists. Runtime entries include their installed version and session identifier.

## Runtime coverage

One renderer error/promise listener set, React error boundary reporting, resource load failures, fetch HTTP/network failures and optional long-task observation. Main process uncaught errors/rejections, failed screen load, renderer unresponsiveness and process crashes are logged. Repeated errors (12 within a minute per fingerprint) trigger an in-app alert without rescanning whole files. Monitoring begins when the renderer starts; it cannot recover errors from a previous release that never logged them.

Native Windows CI runs the actual React diagnostic panel and monitor in an isolated Electron renderer: synthetic runtime/rejection/resource/network errors, quick/deep run, busy state, error-code rendering, skipped filter, TXT/JSON buttons and report-save failure. It never loads the user's real clinic database or sends a message.

## Evidence levels

- `checked`: direct read/check of the specified item.
- `metadata-only`: file age/access, without restore proof.
- `code-inference`: local relationship/math check; incomplete cache or legacy records may need review.
- `recorded-runtime`: prior recorded error with first/last time and sample stack; not a claim that it remains reproducible.
- `skipped` status: no session, quick-mode omission or device-only validation. Never silently converted into a pass.

A cloud `GET ...?select=id&limit=0` checks query/endpoint access with the current verified cloud token and a bounded timeout. No login/refresh is initiated; no patient row is requested. A 200 response does **not** establish complete RLS row visibility, upload success or cloud/local equality. Missing cloud access does not stop local inspections or SMS.

## Error families

| Code | Meaning |
| --- | --- |
| UI-001–006 / UI-011 / UI-020 | Process/render/import/resource/long-task error |
| UI-010 / UI-012 | Current screen overflow / untested screens |
| DB-000–004 | SQLite inspection/integrity/readability/counts |
| SYNC-001–002 | Queued/stuck data or parent awaiting upload |
| SMS-001–003 | Local queue, uncertain dispatch, untested live delivery |
| WA-001–002 | Local WhatsApp outbox / untested live delivery |
| BILL-001–004 | Financial values, cached relationships, receipt history |
| STORAGE-001–003 | Full/unavailable drive, access and free space |
| IPC-001 | Required handler missing from actual registrations |
| CLOUD-001–003 / NET-001–002 | Config/session/query access and network outcomes |
| LOG-000–003 / LOOP-001 | Coverage, write failures, repeated bursts |
| BACKUP-001–002 | Latest backup metadata/structure and untested restore |
| DIAG-001 | Report could not complete/save |
| APP-001 | Unclassified recorded application error |

## Privacy, limits and safety

Reports contain aggregate clinical counts and opaque hashed references, never exported patient rows, message bodies, auth tokens, WhatsApp QR/session data or gateway keys. Common sensitive fields/strings are masked before new logs reach disk. Old raw logs remain untouched and may include sensitive details; review before sharing any report or raw log. Free-form error strings cannot be guaranteed to contain no personal information.

Logs rotate around 5 MB per file, retain up to 14 days, and have a periodic 100 MB retention budget (cleanup on startup/every 100 records). The reader scans at most 8 MB / 50 files over seven days, up to 2 MB per file tail; truncation or malformed entries is reported. Legacy records are approximate and excluded from time-window loop decisions. Structured and modern text duplicates are not counted twice. DB item/journal scans are bounded to 50,000 entries; totals remain complete but partial item coverage is explicit. Deep backup JSON parsing is capped at 25 MB. No backup restore is performed.

A diagnostic run does not modify clinical records, repair the DB, clear queues, send SMS/WhatsApp or invoke admin enrollment. Only separate report files are written. The obsolete destructive reset UI and reset advice were removed; the existing reset IPC remains disabled.

Untested screens, visual clipping outside the current viewport, print/PDF alignment, unexecuted business logic, power-cut durability, full backup restore, gateway SIM state, actual patient delivery and cross-PC behavior require separate device tests. To diagnose an action: note the time → reproduce on the relevant screen → run diagnostics → share the masked TXT/JSON report after review.
