# Offline integrity fixes (B01–B18, C01–C08)

These changes address the two v2.0.47 audit reports. They do not delete clinic records or execute SQL against production.

| Findings | Change |
| --- | --- |
| B01–B02 | Destructive offline reset refuses execution; removed automatic six-month X-ray deletion. |
| B03–B04 | Desktop permissions use validated local admin; failed cloud connection cannot display successful sync. |
| B05, C06 | Local dependent deletion/queue cancellation is atomic; ID remapping updates cached relationships and queued references, with aliases for stale UI IDs. |
| B06, C01–C03 | Net financial summaries, numeric zero discount, valid service rows, and nonnegative amount validation; pending null-discount inserts normalized on sync. |
| B07–B08 | Patient profile reads local data; partial server projections preserve cached fields. |
| B09 | Full stable invoice identity independent of local prefix; unique legacy medicine matches accepted, ambiguous matches refused for review. |
| B10 | Medicine replacement is one authorized SQLite transaction, including pending writes; failures roll back. Cloud writes remain retryable queued operations. |
| B11–B12 | Removed fake unsaved medicine IDs and plaintext commission password; commission requires validated administrator. |
| B13, B18 | Report uploads save bytes and a visible pending row atomically before network; fracture uploads retain a local preview; commission and plaster conversion read local tables. |
| B14–B15 | Foreground inactivity locks; offline daily/weekly full backup scheduler enabled. |
| B16–B17 | Booking reuses cached patient and saves atomically with stable request-derived IDs; desktop will only share a configured public HTTPS booking URL. |
| C04–C05, C08 | Existing-patient save failure preserves form and blocks navigation; local mobile lookup first, stale responses ignored. |
| C07 | Insert retries ignore existing IDs and read back acknowledgement, rather than overwriting newer remote edits. |

## Validation

- TypeScript and Vite production build.
- Existing auth, local session, offline login, local persistence, receipt ledger, inventory, backup, RLS and cashbook test suites.
- `node tests/audit-26.cjs`: 28 focused checks covering the findings and atomic batch authorization rollback. Some UI wiring checks are static; the remainder exercise source functions with temporary SQLite or mocked services.
- SQL regression tests run on PGlite, not the production database.
- New data-integrity regression suites also gate the Windows release workflow.

## Deployment and limits

- No new SQL migration is introduced. The four previously supplied October 5–6 SQL migrations remain prerequisites for the application's existing server operations. Their production installation was not verified in this change.
- New `commitBatch` IPC requires the updated Windows application, not only replacement renderer files.
- To share booking links from the desktop, configure `VITE_PUBLIC_BOOKING_URL` with the deployed HTTPS booking site. No public site was deployed by this change.
- Legacy ambiguous invoice associations are preserved and blocked for explicit review; the software does not guess which patient owns an ambiguous entry. Previously sent/printed invoice labels are not rewritten.
- Removing a frontend password does not remove it from older releases/history. Rotate any reused exposed password separately; this patch does not change the owner's chosen offline login password.
- Actual power loss, installed Windows hardware and live PC-to-APK synchronization still require deployment acceptance testing. No zero-bug guarantee is implied.
