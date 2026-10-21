# Patient account statement (PC EXE)

Open the patient profile → **Patient Statement / पूरा हिसाब PDF**. Read the selected patient's name/number and totals. Open/Save PDF or explicitly queue it for that patient's WhatsApp number. Statements are not automatically broadcast or scheduled.

The statement reads SQLite in a single transaction and remains usable without cloud login/internet. It contains all available active bills for the selected patient (not everyone sharing the phone), per-bill gross/discount/net/paid/due, available receipts and totals. Local/pending aliases are deduplicated and parent aliases resolved. Only data available on this PC is included; it does not claim full cloud/device equality.

- Financial calculations use integer cents. Negative/non-finite values or discount above gross block output with `STATEMENT-002`.
- Overpayment is shown as separate credit; it is not silently transferred to another bill's due.
- Cancelled/void/deleted bills are listed as excluded from active totals.
- Legacy cumulative paid records have no invented receipt date. Invalid/duplicate/mismatched detailed histories are warned; bill paid totals remain authoritative. Negative ledger corrections remain visible.
- PDFs use local Electron A4 rendering with repeated table headers and page-safe rows. No statement is uploaded to Supabase Storage.
- A missing/invalid phone blocks sending but does not block local PDF generation. No active bills means the user may save an empty statement but cannot queue it.
- WhatsApp uses the existing paired PC Web connector and durable outbox. A fingerprint binds the selected patient, recipient and financial revision. Changing the bill or recipient after preview stops sending until a new preview is queued. Clock and cloud-sync status changes alone do not change financial identity.
- Repeated clicks on the same queued/sent revision do not create another send. Ambiguous handoff/timeout becomes unconfirmed, with the same review protections as invoices. WhatsApp acceptance is not proof of delivery/read.
- Admin authorization is enforced in IPC and service; arbitrary renderer HTML/file paths are never accepted.

Statement reads/PDF generation do not change patient records, bills, balances or receipts. Explicit WhatsApp queueing writes only the message job. Background profile refresh no longer unmounts an open statement dialog, and obsolete patient fetch results are discarded on navigation.

Validation: real SQLite synthetic account fixtures, invoice/outbox regression tests, and Windows Electron tests for a 70-bill multi-page PDF and actual React statement component. Real clinic data, live recipient delivery and the user's printer remain manual/device checks.
