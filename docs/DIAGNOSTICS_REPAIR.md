# EXE diagnostics repair

The supplied 2.0.89 report shows a healthy readable local SQLite database (1,114 patients / 1,269 bills), one pending audit insert blocked by a missing `append_audit_event` RPC, repeated missing-schema reads, expected attachment-cache misses reported as failures, and old third-party console events counted as clinic startup errors.

Changes:

- Preserve the audit record until the server actually acknowledges it. Missing schema errors back off for 30 minutes; the explicit Sync button retries after SQL setup without clearing the queue or resending uncertain SMS.
- Back off missing-schema table reads, keep local data intact, and fall back to scalar rows when a legacy patient relationship is unavailable. Patient joins remain local.
- Treat unsupported remote cache sources and absent cache files as cache misses; keep origin/path/MIME/checksum protections. Support the authenticated storage path alongside public/signed paths.
- Use a verified cloud session for paginated direct backups; stop if the session changes. Do not attempt anonymous private-data backups.
- Monitor clinic web contents separately from WhatsApp/external windows. Preserve older-version incidents as explicitly labelled history; do not mark them resolved. Current-version errors remain errors.
- Do not read appointment records before desktop authentication. Include the four affected tables in the read-only cloud probe.
- Split invalid bill values from overpayment/credit warnings; change no financial records.

## One-time database setup

`DIAGNOSTICS_SCHEMA_REPAIR.sql` is an additive, transactional repair for the **actual clinic project**. Back up the database, then run the complete file in that project's SQL Editor. It checks existing core tables, adds the missing guarded admin audit RPC only if absent, creates missing compatibility tables with RLS, and reloads the API schema cache. Existing patient/billing/payment rows are not updated or deleted. Existing audit RPC implementations are preserved.

After all four readiness flags return true, open EXE → Sync स्थिति → अभी sync करें. Run Diagnostics again. The authoring connection cannot access the actual clinic project, so this SQL has been tested on a separate PostgreSQL fixture, not applied to the live clinic database.

The 45 financial warnings need original bills/receipts to distinguish invalid entries from credit; no automatic amount correction is made. Failed/unconfirmed WhatsApp jobs require chat/recipient review and are never resent by diagnostics.
