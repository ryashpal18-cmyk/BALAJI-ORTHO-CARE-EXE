# Final A4 letterpad and shared patient registration

Both EXE and APK provide two modes: print only the five patient values on preprinted stock, or print the supplied final letterpad plus those values on blank A4. The original user-supplied image is bundled unchanged as a JPEG data URL, so native print documents have no remote or relative image dependencies. The same document is used for preview and print; preview scaling never changes print dimensions.

The final design has all five fields in one row. A new layout settings key avoids importing positions for the old template. Per-field widths prevent name/registration overlaps; long text fits inside its own field. Printer position offsets remain available. A plain-paper calibration at actual size is still needed for each physical printer.

Android uses a local Capacitor ClinicPrint plugin installed by scripts/install-android-print.cjs after cap sync. It loads inert, bundled HTML, waits for document completion and hands an A4 portrait/no-margin job to Android PrintManager. Android's system dialog offers printing or Save as PDF. A job retains its WebView until the print adapter finishes. No printer/cloud data are sent through a remote service.

## Database setup

Back up the correct clinic database, then run PATIENT_REGISTRATION_SETUP.sql in its SQL Editor as project owner. It preserves existing valid numbers, backfills missing numbers in created_at/id order, prevents changes to assigned numbers, and adds admin-only, owner-scoped number reservations. Historic patient timestamps and other tables are unchanged. Run once for the shared EXE/APK database, not separately per device. The 1,108-row private mapping SQL remains outside the public repository.

The connected Supabase management account did not have permission for the actual configured clinic project during implementation. No live SQL was applied. The apps now diagnose a missing column, missing backfill, missing reservation function, disconnected account and unavailable patient explicitly; a blank value is no longer presented as evidence of an active sync.

## Offline numbers on multiple devices

An online verified administrator reserves 32 unique numbers per device from one server sequence. Each local save consumes a reserved number and writes patient/cache/queue/cursor atomically. EXE and APK cannot independently calculate max+1. Pools may leave gaps between numbers; numbering is unique, not gapless across devices. A failed network response retries the same reservation request ID. A failed local save rolls back consumption. Deleting a patient never returns a number to the pool.

Without an initial reservation or when a pool is exhausted offline, patient saving remains available; an unassigned number stays clearly marked until server sync supplies it. Existing patient numbers remain usable offline. Restoring a backup discards its unused pools/request identities so numbers consumed after the backup cannot be reused. Previously printed conflicting legacy numbers are surfaced for review rather than silently changed.

Cloud refreshes may import a registration number into a pending demographic edit without overwriting the edit. Insert acknowledgements preserve the authoritative number even if a later edit is queued. Billing, invoices, payments, due calculations and SMS logic are unchanged.

Validation covers TypeScript and production builds for both apps, existing desktop/mobile regression suites, real SQLite/IndexedDB allocation/rollback/restore tests, browser preview/print checks at desktop and phone sizes, and disposable PostgreSQL execution of exact mapping and reservation/RLS tests. Physical Android printing and printer alignment require device verification.
