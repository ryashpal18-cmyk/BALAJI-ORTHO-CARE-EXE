# Module audit fixes — 24 October 2026

- Bill editors (Billing, Dashboard and Due Amount) pass the balance seen when the form opened to the existing SQLite transaction guard. A later payment makes a stale edit fail before any receipt, audit or queue write; reopen the bill to edit it.
- Billing and PlasterSync share the SMS service classifier: cast removal does not create an Active fracture case. A real new cast/slab still does. Already migrated historical bills are not migrated again merely because their case has closed.
- Analytics reads the complete local billing/patient/physio ledger, with the existing paginated background refresh, rather than replacing it with a single limited cloud response.
- Reminders read local appointments, accept HH:MM and AM/PM times, use IST, skip cancelled/completed records, and keep a stable notification identity across local UUID synchronization. Refetches re-evaluate the approaching appointment even if its fields have not changed.
- Appointments and physiotherapy resolve patient names from the local patient cache, including local-prefixed IDs. New appointments have Scheduled status immediately.
- Patient Profile includes both report and fracture X-rays, including older case-linked images without patient_id. Opening a file resolves its local copy or renews its signed URL; embedded PDFs are downloaded rather than passed to the image viewer.
- Festival WhatsApp revalidates cancellation, pause, exclusions and audience after asynchronous number lookup, before handing a message to WhatsApp. A transport handoff that already occurred cannot be recalled.
- Switching prescription patients or branches clears diagnosis, medicines, advice, follow-up and saved status. Patient changes are blocked while saving.
- Recovery Tracker reads pending progress from the local ledger, refreshes after save/sync, and derives the next session number from stored sessions. Save/upload failures release busy controls.

Validation: TypeScript and production React build; existing offline/data regression suites; new `tests/module-regressions.cjs` in Windows CI, plus the real SQLite stale-payment test in `tests/clinic-updates.cjs`. Regression tests use synthetic records and mocked transports, never live patient messages or production data. Windows installer and native UI verification are performed by GitHub Actions. No database migration or data deletion is required.
