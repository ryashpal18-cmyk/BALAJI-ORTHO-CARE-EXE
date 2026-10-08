# Core offline corrections and v2.0.41 compatibility — 2026-10-08

- Due Amount subtracts discounts. Editing/clearing payment retains original gross bill amount and discount; full payment uses the net amount.
- Due SMS actions inspect queue success and distinguish queued from gateway acceptance; queue failure cannot display sent success.
- Bill creation now commits bill, payment history, local SMS row and SMS outbox entry in one SQLite transaction. A failed SMS write rolls back the bill as well. Invalid/missing mobile allows a bill with an explicit warning that SMS was not queued. A local patient is required; no cloud lookup is awaited. Double-submit is guarded.
- SMS is independent of the bill's cloud upload, including when cloud authentication is unavailable.
- Ortho case save resolves the patient from local cache, normalizes the mobile match, and catches patient-save failures. No network lookup on this save path; duplicate clicks are guarded.

Verification: tests/core-offline.cjs exercises atomic rollback on the second queue write, reopen persistence, discounted due/full payment, failure feedback, independent SMS and local Ortho matching. Added to Windows CI. Existing offline-first, audit-26 and sms-offline tests plus TypeScript and production build pass.

The supplied v2.0.41 source stops retrying queue entries after MAX_RETRIES and includes a destructive offline-store reset. Current code retains pending work and uses retry backoff rather than permanently abandoning it. An isolated compatibility test created 13 synthetic pending patients using the supplied v2.0.41 sqlite-store.cjs, closed it and reopened the database with the current store. All 13 cached rows, payloads and retry counts survived the additive schema upgrade. This is not evidence of the state/error of the actual 13 pending records on the user's PC; the source ZIP does not contain that live database.

No live patient data or real SMS was used, and no SQL migration is needed for these changes. Existing bills are not rewritten. Remaining scoped caveat: automatic Ortho creation after a plaster bill is still a separate operation; native Windows/power-loss and the actual legacy database require real-device verification.
