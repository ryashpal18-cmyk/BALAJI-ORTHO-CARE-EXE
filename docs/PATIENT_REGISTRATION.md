# Patient registration independent of invoices

Each patient has a permanent `registration_number` such as BAOR0001. Billing IDs and invoice formatting are unchanged. Registration, patient search/profile and the A4 letterpad show the patient number; no bill is needed to print. Registration includes a Save & Prescription Print action.

## Install

1. Back up the database and the clinic PC's offline backup.
2. Run `PATIENT_REGISTRATION_SETUP.sql` in the correct Supabase project's SQL Editor as owner. It fills missing numbers in ascending created_at/id order, preserving existing numbers. For a reviewed CSV mapping, use the separately supplied private SQL file instead. Do not commit patient mappings to this public repository.
3. Install the updated EXE and allow one complete patient download. Numbers are saved to SQLite and its snapshot backups. Only the registration field is merged into pending patient edits; demographic changes remain pending.
4. Verify the first/last numbers and print on plain A4 paper at 100% before using the letterpad.

Before the first numbered cloud download, offline patient saves remain available and show a pending registration. Once initialization finishes, pending new patients and subsequent new patients receive increasing BAOR numbers in a SQLite transaction with their save and sync queue. Restart, deletion and queue-write failure do not reuse a confirmed number.

## Scope and limits

Offline sequential allocation assumes a single primary registration PC. Independently registering patients on another PC/APK while the primary is offline can collide with its unuploaded numbers. The server unique index rejects a collision and preserves the pending local patient; it never silently overwrites another patient or renumbers a printed number. Multiple independent offline registration devices need server-reserved number ranges before enabling this workflow on those devices.

SQL takes an exclusive patient-table lock during the update. Existing user UPDATE triggers are temporarily suspended and restored to their original modes in the same transaction so timestamps and audit side effects do not change historic records. Existing RLS policies are unchanged. Number assignment is SECURITY INVOKER, not SECURITY DEFINER, and its sequence is granted only to authenticated/service roles. Unauthenticated patient writes are not enabled.

Validation: TypeScript, Vite production build, `tests/letterpad-print.cjs`, `tests/patient-registration.cjs`, offline/billing regression suite. The separately generated 1,108-row CSV SQL was executed against a disposable PostgreSQL-compatible test database with synthetic patient fields; exact mappings, untouched dates, rerun behavior, next BAOR1109, immutable numbers and mismatch rollback were verified. This is not proof of installation on a live database or Windows printer alignment.
